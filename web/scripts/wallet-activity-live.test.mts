import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { isWalletActivityCursor } from "../lib/wallet-activity.ts";
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const address = "GDWYDMY2WDL4MCKMYQ6CWZJP526K6YHLRK3EG6IF2IJTX3EHZU3RRB72";
function watcher(noStream = false) {
  const exports = {} as { watchWalletActivity(address: string, read: () => Promise<void>): () => void };
  const doc = { visibilityState: "visible", addEventListener: add, removeEventListener: remove };
  const nav = { onLine: true };
  const listeners = new Map<string, Set<() => void>>();
  const timers = new Map<number, { callback(): void; ms: number; interval: boolean }>();
  const streams: Stream[] = []; let id = 0, reads = 0, activeReads = 0, maxActive = 0, finish: (() => void) | null = null;
  function add(event: string, fn: () => void) { const set = listeners.get(event) ?? new Set(); set.add(fn); listeners.set(event, set); }
  function remove(event: string, fn: () => void) { listeners.get(event)?.delete(fn); }
  class Stream { onmessage: (() => void) | null = null; onopen: (() => void) | null = null; closed = false; url: string;
    constructor(url: string) { this.url = url; streams.push(this); } close() { this.closed = true; } }
  runInNewContext(compile("../lib/ui/watchWalletActivity.ts"), { exports, document: doc, navigator: nav, Promise,
    window: { addEventListener: add, removeEventListener: remove }, EventSource: noStream ? undefined : Stream,
    setTimeout(callback: () => void, ms: number) { timers.set(++id, { callback, ms, interval: false }); return id; },
    setInterval(callback: () => void, ms: number) { timers.set(++id, { callback, ms, interval: true }); return id; },
    clearTimeout(key: number) { timers.delete(key); }, clearInterval(key: number) { timers.delete(key); },
  });
  async function flush(ms = 200) {
    for (const [key, timer] of [...timers]) if (timer.ms === ms) { if (!timer.interval) timers.delete(key); timer.callback(); }
    for (let i = 0; i < 8; i++) await Promise.resolve();
  }
  const stop = exports.watchWalletActivity(address, () => { reads++; activeReads++; maxActive = Math.max(maxActive, activeReads);
    return new Promise<void>(resolve => { finish = () => { activeReads--; resolve(); }; }); });
  return { doc, nav, streams, timers, listeners, flush, stop, get reads() { return reads; }, get maxActive() { return maxActive; },
    emit(event: string) { for (const fn of listeners.get(event) ?? []) fn(); },
    async finish() { finish?.(); for (let i = 0; i < 8; i++) await Promise.resolve(); },
  };
}
test("ledger events coalesce, use one fixed public stream, and queue one read behind an active refresh", async () => {
  const h = watcher(); assert.equal(h.streams.length, 1);
  assert.equal(h.streams[0].url, `https://horizon-testnet.stellar.org/accounts/${address}/payments?cursor=now&order=asc&include_failed=false`);
  h.streams[0].onopen?.(); h.streams[0].onmessage?.(); await h.flush(); assert.equal(h.reads, 1);
  h.streams[0].onmessage?.(); h.streams[0].onmessage?.(); await h.flush(); assert.equal(h.reads, 1);
  await h.finish(); await h.flush(); assert.equal(h.reads, 2); assert.equal(h.maxActive, 1); h.stop();
});
test("fallback checks every fifteen seconds even without EventSource support", async () => {
  const h = watcher(true); await h.flush(); await h.finish(); assert.equal(h.streams.length, 0);
  await h.flush(15_000); await h.flush(); assert.equal(h.reads, 2); h.stop(); assert.equal(h.timers.size, 0);
});
test("hidden/offline pages stop network work, foreground and reconnect immediately resynchronize", async () => {
  const h = watcher(); await h.flush(); await h.finish();
  h.doc.visibilityState = "hidden"; h.emit("visibilitychange"); assert.equal(h.streams[0].closed, true); assert.equal(h.timers.size, 0);
  h.emit("focus"); await h.flush(15_000); assert.equal(h.reads, 1);
  h.doc.visibilityState = "visible"; h.emit("visibilitychange"); await h.flush(); assert.equal(h.reads, 2); await h.finish();
  h.nav.onLine = false; h.emit("offline"); assert.equal(h.streams[1].closed, true); assert.equal(h.timers.size, 0);
  h.nav.onLine = true; h.emit("online"); await h.flush(); assert.equal(h.reads, 3); h.stop();
});
test("disposal removes every listener and late completion/event cannot restart old-owner work", async () => {
  const h = watcher(); await h.flush(); h.streams[0].onmessage?.(); h.stop(); await h.finish(); await h.flush();
  assert.equal(h.reads, 1); assert.equal(h.timers.size, 0); assert.equal([...h.listeners.values()].reduce((n, set) => n + set.size, 0), 0);
  h.streams[0].onmessage?.(); h.emit("focus"); await h.flush(); assert.equal(h.reads, 1);
});
test("private history GET omits wallet hints, cookies stay same-origin and reads are cancellable/no-store", async () => {
  const exports = {} as { readWalletActivity(cursor: string | null, signal: AbortSignal): Promise<unknown> };
  const requests: { url: string; options: RequestInit }[] = [];
  runInNewContext(compile("../lib/ui/wallet-activity-read.ts"), { exports, encodeURIComponent,
    fetch: async (url: string, options: RequestInit) => { requests.push({ url, options }); return { ok: true, json: async () => ({ ok: true, ownerId: "verified-owner", items: [] }) }; },
  });
  const controller = new AbortController(); await exports.readWalletActivity(null, controller.signal); await exports.readWalletActivity("123", controller.signal);
  assert.deepEqual(requests.map(r => r.url), ["/api/account/activity", "/api/account/activity?cursor=123"]);
  for (const { options } of requests) { assert.equal(options.cache, "no-store"); assert.equal(options.credentials, "same-origin"); assert.equal(options.redirect, "error"); assert.equal(options.signal, controller.signal); assert.equal(options.method, undefined); }
});
test("history API accepts only one bounded cursor and delegates ownership to verified server auth", async () => {
  const exports = {} as { dynamic: string; GET(request: Request): Promise<Response> };
  const calls: unknown[] = [];
  runInNewContext(compile("../app/api/account/activity/route.ts"), { exports, URL, Response,
    require(name: string) { if (name === "@/lib/wallet-activity") return { isWalletActivityCursor };
      if (name === "@/lib/server/walletActivity") return { currentWalletActivity: async (cursor: unknown) => { calls.push(cursor); return { ok: true, ownerId: "verified-owner", items: [] }; } };
      throw Error("Unexpected dependency"); },
  });
  assert.equal(exports.dynamic, "force-dynamic");
  for (const suffix of ["?wallet=other", "?ownerId=other", "?cursor=1&cursor=2", "?cursor=now", "?cursor=", "?cursor=18446744073709551616"]) {
    const r = await exports.GET(new Request(`https://salapi.app/api/account/activity${suffix}`)); assert.equal(r.status, 400); assert.equal(calls.length, 0);
  }
  for (const suffix of ["", "?cursor=123"]) {
    const r = await exports.GET(new Request(`https://salapi.app/api/account/activity${suffix}`)); assert.equal(r.status, 200);
    assert.equal(r.headers.get("Cache-Control"), "private, no-store"); assert.equal(r.headers.get("Vary"), "Cookie");
  }
  assert.deepEqual(calls, [null, "123"]);
});
