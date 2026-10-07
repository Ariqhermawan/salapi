import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createAppNavigationTracker, safeAppFallback } from "../lib/ui/app-navigation.ts";

const ORIGIN = "https://salapi.example";
const NEXT_STATE = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: ["app", "test"] }, custom: "keep" };
class Surface extends EventTarget {
  scrollTop = 0;
  scrollHeight = 2000;
  clientHeight = 700;
  firstElementChild = {};
  positions: number[] = [];
  scrollTo({ top }: { top: number }) { this.scrollTop = Math.min(top, this.scrollHeight - this.clientHeight); this.positions.push(top); }
}
class FakeDocument extends EventTarget {
  main = new Surface();
  getElementById(id: string) { return id === "app-content" ? this.main : null; }
  scroll(top: number) {
    this.main.scrollTop = top;
    const event = new Event("scroll");
    Object.defineProperty(event, "target", { value: this.main });
    this.dispatchEvent(event);
  }
}
function fakeWindow(path = "/", options: { deniedStorage?: boolean; externalPredecessor?: boolean; storage?: Map<string, string> } = {}) {
  const target = new EventTarget();
  const document = new FakeDocument();
  const storage = options.storage ?? new Map<string, string>();
  const entries = [{ url: options.externalPredecessor ? "https://outside.example/news" : ORIGIN + path, state: null as unknown }];
  if (options.externalPredecessor) entries.push({ url: ORIGIN + path, state: NEXT_STATE });
  let index = entries.length - 1;
  const win = {
    document, crypto: { randomUUID },
    get location() { return new URL(entries[index].url); },
    sessionStorage: {
      getItem(key: string) { if (options.deniedStorage) throw Error("Storage denied"); return storage.get(key) ?? null; },
      setItem(key: string, value: string) { if (options.deniedStorage) throw Error("Storage denied"); storage.set(key, value); },
    },
    addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    history: {
      get state() { return entries[index].state; },
      get length() { return entries.length; },
      pushState(data: unknown, _unused: string, url?: string | URL | null) {
        const destination = new URL(url ?? entries[index].url, entries[index].url);
        if (destination.origin !== new URL(entries[index].url).origin) throw Error("SecurityError");
        entries.splice(index + 1); entries.push({ state: structuredClone(data), url: destination.href }); index++;
      },
      replaceState(data: unknown, _unused: string, url?: string | URL | null) {
        const destination = new URL(url ?? entries[index].url, entries[index].url);
        if (destination.origin !== new URL(entries[index].url).origin) throw Error("SecurityError");
        entries[index] = { state: structuredClone(data), url: destination.href };
      },
      go(delta: number) {
        if (index + delta < 0 || index + delta >= entries.length) return;
        index += delta;
        const event = new Event("popstate");
        Object.defineProperty(event, "state", { value: entries[index].state });
        target.dispatchEvent(event);
      },
    },
  };
  return { win: win as unknown as Window, document, storage, entries, target,
    tracker: () => createAppNavigationTracker(win as unknown as Window) };
}
function commit(context: ReturnType<typeof fakeWindow>, tracker: ReturnType<typeof createAppNavigationTracker>) {
  return tracker.commit(context.win.location.pathname, context.win.location.search.slice(1));
}
function navigate(context: ReturnType<typeof fakeWindow>, tracker: ReturnType<typeof createAppNavigationTracker>, path: string) {
  context.document.dispatchEvent(new Event("click"));
  context.win.history.pushState(NEXT_STATE, "", path);
  return commit(context, tracker);
}

test("cold/external/unknown entry cannot Back out of the app even with browser history", () => {
  for (const externalPredecessor of [true, false]) {
    const context = fakeWindow("/circles/cebu/donate", { externalPredecessor });
    const tracker = context.tracker(); const stop = tracker.start(); commit(context, tracker);
    assert.equal(tracker.canGoBack(), false);
    assert.equal(context.win.history.length, externalPredecessor ? 2 : 1);
    context.win.history.replaceState(NEXT_STATE, "", "/circles/cebu");
    assert.equal(tracker.canGoBack(), false);
    assert.equal(context.win.history.length, externalPredecessor ? 2 : 1);
    stop();
  }
});

test("actual pushes record trusted predecessors while preserving Next flags and caller state", () => {
  const context = fakeWindow("/vaults"); const tracker = context.tracker(); const stop = tracker.start();
  commit(context, tracker);
  const input = structuredClone(NEXT_STATE);
  context.win.history.pushState(input, "", "/circles/cebu");
  assert.equal(tracker.canGoBack(), true);
  assert.deepEqual(input, NEXT_STATE);
  assert.equal(context.win.history.state.__NA, true);
  assert.equal(context.win.history.state.custom, "keep");
  assert.deepEqual(context.win.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE, NEXT_STATE.__PRIVATE_NEXTJS_INTERNALS_TREE);
  assert.equal(commit(context, tracker)?.top, 0);
  assert.equal(context.win.history.length, 2);
  context.win.history.go(-1);
  assert.equal(context.win.location.pathname, "/vaults");
  assert.equal(tracker.canGoBack(), false);
  stop();
});

test("Back/forward restores each entry's scroll and harmless UI selection, new pushes start fresh", () => {
  const context = fakeWindow(); const tracker = context.tracker(); const stop = tracker.start(); commit(context, tracker);
  tracker.writeView("home-circles", { category: "animalCare", index: 2 });
  context.document.scroll(540);
  const pushed = navigate(context, tracker, "/circles/cebu");
  assert.equal(pushed?.top, 0); assert.equal(pushed?.restore, false);
  assert.equal(tracker.viewSnapshot("home-circles"), "");
  context.document.scroll(180);
  navigate(context, tracker, "/circles/cebu/organizer");
  context.win.history.go(-1);
  assert.deepEqual(commit(context, tracker)?.top, 180);
  context.win.history.go(-1);
  assert.equal(commit(context, tracker)?.top, 540);
  assert.deepEqual(JSON.parse(tracker.viewSnapshot("home-circles")), { category: "animalCare", index: 2 });
  context.win.history.go(1);
  assert.equal(commit(context, tracker)?.top, 180);
  navigate(context, tracker, "/");
  assert.equal(tracker.viewSnapshot("home-circles"), "");
  assert.equal(context.win.history.length, 3, "new push after Back drops the forward branch");
  stop();
});

test("replace keeps the previous entry, does not add a parent/detail back loop", () => {
  const context = fakeWindow(); const tracker = context.tracker(); const stop = tracker.start(); commit(context, tracker);
  navigate(context, tracker, "/arisan");
  navigate(context, tracker, "/arisan/room1");
  context.win.history.replaceState(NEXT_STATE, "", "/arisan"); commit(context, tracker);
  assert.equal(context.win.history.length, 3);
  context.win.history.go(-1);
  assert.equal(context.win.location.pathname, "/arisan");
  context.win.history.go(-1);
  assert.equal(context.win.location.pathname, "/");
  assert.equal(tracker.canGoBack(), false);
  stop();
});

test("same-route query/hash entries and POP still have unique history identities", () => {
  const context = fakeWindow("/circles"); const tracker = context.tracker(); const stop = tracker.start(); commit(context, tracker);
  context.document.scroll(300);
  navigate(context, tracker, "/circles?sort=recent");
  context.document.scroll(100);
  const before = tracker.entrySnapshot();
  context.win.history.replaceState(NEXT_STATE, "", "/circles?sort=goal#causes");
  assert.notEqual(tracker.entrySnapshot(), before);
  assert.equal(commit(context, tracker)?.top, 0);
  context.win.history.go(-1);
  assert.equal(commit(context, tracker)?.top, 300);
  navigate(context, tracker, "/circles");
  context.win.history.go(-1);
  assert.equal(commit(context, tracker)?.restore, true, "same URL POP still restores");
  stop();
});

test("repeated Next tree replaces neither erase custom navigation data nor reset scroll", () => {
  const context = fakeWindow(); const tracker = context.tracker(); const stop = tracker.start(); commit(context, tracker);
  navigate(context, tracker, "/circles"); tracker.writeView("circles-discovery", { category: "medical", sort: "recent" });
  context.document.scroll(220);
  const before = tracker.entrySnapshot();
  context.win.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: "updated" } }, "", "/circles");
  assert.equal(tracker.entrySnapshot(), before);
  assert.equal(commit(context, tracker), null);
  assert.equal(tracker.canGoBack(), true);
  assert.equal(tracker.viewSnapshot("circles-discovery"), '{"category":"medical","sort":"recent"}');
  stop();
});

test("a reload restores registered current entry, predecessor, UI state and scroll without URL secrets", () => {
  const context = fakeWindow(); let tracker = context.tracker(); let stop = tracker.start(); commit(context, tracker);
  navigate(context, tracker, "/circles?code=AUTH_SECRET&amount=123456&recipient=PRIVATE_WALLET");
  tracker.writeView("circles-discovery", { category: "education", sort: "recent" }); context.document.scroll(260);
  context.win.dispatchEvent(new Event("pagehide")); stop();
  const stored = [...context.storage.values()].join("");
  for (const secret of ["AUTH_SECRET", "123456", "PRIVATE_WALLET", "?code="]) assert.equal(stored.includes(secret), false);
  tracker = context.tracker(); stop = tracker.start();
  assert.equal(tracker.canGoBack(), true);
  assert.equal(commit(context, tracker)?.top, 260);
  assert.equal(tracker.viewSnapshot("circles-discovery"), '{"category":"education","sort":"recent"}');
  stop();
});

test("storage denial retains safe in-memory behavior and StrictMode restart", () => {
  const context = fakeWindow("/vaults", { deniedStorage: true }); const tracker = context.tracker();
  let stop = tracker.start(); commit(context, tracker); navigate(context, tracker, "/circles");
  tracker.writeView("circles-discovery", { category: "medical", sort: "recent" }); stop(); stop();
  stop = tracker.start(); assert.equal(tracker.canGoBack(), true);
  assert.equal(tracker.viewSnapshot("circles-discovery"), '{"category":"medical","sort":"recent"}');
  navigate(context, tracker, "/circles/cebu"); context.win.history.go(-1);
  assert.equal(context.win.location.pathname, "/circles"); stop();
});

test("StrictMode/multiple owners clean up only their own wrapper and listeners", () => {
  const context = fakeWindow(); const tracker = context.tracker(); const original = context.win.history.pushState;
  const stop1 = tracker.start(), installed = context.win.history.pushState; const stop2 = tracker.start();
  stop1(); assert.equal(context.win.history.pushState, installed);
  stop2(); assert.equal(context.win.history.pushState, original);
  const stop3 = tracker.start();
  const captured = context.win.history.pushState;
  const later = (data: unknown, unused: string, url?: string | URL | null) => captured.call(context.win.history, data, unused, url);
  context.win.history.pushState = later;
  stop3(); assert.equal(context.win.history.pushState, later);
  const stop4 = tracker.start(); commit(context, tracker); navigate(context, tracker, "/send");
  assert.equal(context.win.history.length, 2, "wrapper chain does not recurse/double push");
  assert.equal(tracker.canGoBack(), true); stop4();
});

test("unknown/tampered metadata cannot create a trusted predecessor", () => {
  const context = fakeWindow(); const nativePush = context.win.history.pushState; const tracker = context.tracker(); const stop = tracker.start(); commit(context, tracker);
  navigate(context, tracker, "/vaults");
  const nativeReplace = context.entries[1];
  nativeReplace.state = { ...NEXT_STATE, __salapiNavigation: { version: 1, session: "tampered-session-000000", entry: "tampered-entry-000000" } };
  assert.equal(tracker.canGoBack(), false);
  nativePush.call(context.win.history, NEXT_STATE, "", "/circles");
  context.win.history.go(-1);
  assert.equal(tracker.canGoBack(), false);
  assert.equal(commit(context, tracker)?.top, 0, "unknown POP starts a safe fresh entry");
  stop();
});

test("bounded registry evicts old predecessors conservatively and rejects malformed persisted data", () => {
  const context = fakeWindow(); const tracker = context.tracker(); const stop = tracker.start(); commit(context, tracker);
  for (let i = 0; i < 80; i++) navigate(context, tracker, `/circles/example${i}`);
  const raw = [...context.storage.values()][0];
  assert.equal(JSON.parse(raw).entries.length, 60);
  for (let i = 0; i < 59; i++) context.win.history.go(-1);
  assert.equal(tracker.canGoBack(), false, "pruned predecessor is not assumed safe"); stop();
  const data = JSON.parse(raw); data.entries[0].scroll = -100;
  context.storage.set("salapi-navigation-v1", JSON.stringify(data));
  const second = context.tracker(); const stopSecond = second.start(); assert.equal(second.canGoBack(), false); stopSecond();
});

test("only allowlisted harmless UI fields can be persisted or observed", async () => {
  const context = fakeWindow(); const tracker = context.tracker(); const stop = tracker.start(); commit(context, tracker);
  let changes = 0; const unsubscribe = tracker.subscribe(() => changes++);
  tracker.writeView("home-circles", { category: "animalCare", index: 1 });
  const snapshot = tracker.viewSnapshot("home-circles"); assert.equal(changes, 0, "listeners are deferred beyond the current commit");
  await Promise.resolve(); assert.equal(changes, 1);
  for (const forbidden of [{ amount: 500 }, { balance: 900 }, { email: "private" }, { category: "medical", kyc: true }, { index: -1 }, { index: NaN }, { index: 1.2 }, { category: "x".repeat(600) }]) tracker.writeView("home-circles", forbidden);
  tracker.writeView("financial-form", { amount: 500 }); tracker.writeView("circles-discovery", { index: 2 });
  await Promise.resolve();
  assert.equal(tracker.viewSnapshot("home-circles"), snapshot); assert.equal(changes, 1);
  tracker.writeView("home-circles", { category: "animalCare", index: 1 }); await Promise.resolve(); assert.equal(changes, 1, "stable serialized snapshots");
  unsubscribe(); tracker.writeView("home-circles", { category: "education", index: 0 }); await Promise.resolve(); assert.equal(changes, 1);
  stop();
});

test("Next insertion-effect history replacement never synchronously invokes an updating subscriber", async () => {
  const context = fakeWindow("/arisan/join"); const tracker = context.tracker(); const stop = tracker.start(); commit(context, tracker);
  await Promise.resolve();
  let inInsertionEffect = false;
  let notifications = 0;
  const unsubscribe = tracker.subscribe(() => {
    assert.equal(inInsertionEffect, false, "React updates must not be scheduled from Next's insertion effect");
    notifications++;
  });
  const before = tracker.entrySnapshot();
  inInsertionEffect = true;
  context.win.history.replaceState(NEXT_STATE, "", "/arisan/1");
  assert.notEqual(tracker.entrySnapshot(), before, "history snapshot updates immediately");
  assert.equal(commit(context, tracker)?.top, 0, "scroll plan is available without waiting for subscribers");
  assert.equal(tracker.canGoBack(), false, "cold invite replacement must not invent a predecessor");
  assert.equal(notifications, 0);
  inInsertionEffect = false;
  await Promise.resolve();
  assert.equal(notifications, 1);
  unsubscribe(); stop();
});

test("a turn's start, history and view writes coalesce into one notification of the latest synchronous state", async () => {
  const context = fakeWindow("/"); const tracker = context.tracker();
  const observed: { entry: string; view: string }[] = [];
  const unsubscribe = tracker.subscribe(() => observed.push({ entry: tracker.entrySnapshot(), view: tracker.viewSnapshot("circles-discovery") }));
  const stop = tracker.start(); commit(context, tracker);
  navigate(context, tracker, "/circles");
  context.win.history.replaceState(NEXT_STATE, "", "/circles?sort=recent");
  tracker.writeView("circles-discovery", { category: "medical", sort: "recent" });
  tracker.writeView("circles-discovery", { category: "education", sort: "goal" });
  const latest = { entry: tracker.entrySnapshot(), view: '{"category":"education","sort":"goal"}' };
  assert.equal(tracker.viewSnapshot("circles-discovery"), latest.view); assert.equal(tracker.canGoBack(), true);
  assert.deepEqual(observed, []);
  await Promise.resolve(); assert.deepEqual(observed, [latest]);
  context.win.history.replaceState(NEXT_STATE, "", "/circles?sort=recent");
  tracker.writeView("circles-discovery", { category: "education", sort: "goal" });
  await Promise.resolve(); assert.deepEqual(observed, [latest], "same URL/tree and stable views do not republish");
  unsubscribe(); stop();
});

test("Back claims and POP reset remain synchronous while subscriber delivery is pending", async () => {
  const context = fakeWindow("/"); const tracker = context.tracker(); const stop = tracker.start(); commit(context, tracker);
  let notifications = 0; const unsubscribe = tracker.subscribe(() => notifications++);
  navigate(context, tracker, "/arisan"); navigate(context, tracker, "/arisan/join");
  assert.equal(tracker.claimBack(), "back"); assert.equal(tracker.claimBack(), "pending");
  context.win.history.go(-1); assert.equal(tracker.claimBack(), "back", "confirmed POP immediately releases the prior claim");
  assert.equal(tracker.claimBack(), "pending");
  context.win.history.go(-1); assert.equal(tracker.claimBack(), "fallback", "root boundary remains protected before the microtask");
  assert.equal(notifications, 0);
  await Promise.resolve(); assert.equal(notifications, 1);
  unsubscribe(); stop();
});

test("unsubscribe before delivery or during an earlier subscriber callback suppresses the removed listener", async () => {
  const context = fakeWindow("/"); const tracker = context.tracker(); const stop = tracker.start(); commit(context, tracker); await Promise.resolve();
  let removedCalls = 0; let liveCalls = 0;
  const removed = tracker.subscribe(() => removedCalls++);
  tracker.writeView("home-circles", { category: "medical", index: 1 }); removed();
  await Promise.resolve(); assert.equal(removedCalls, 0);
  let unsubscribeSecond = () => {};
  const first = tracker.subscribe(() => { liveCalls++; unsubscribeSecond(); });
  unsubscribeSecond = tracker.subscribe(() => removedCalls++);
  tracker.writeView("home-circles", { category: "education", index: 2 });
  await Promise.resolve(); assert.equal(liveCalls, 1); assert.equal(removedCalls, 0);
  first(); stop();
});

test("final cleanup cancels queued notifications and StrictMode restart publishes only the new generation", async () => {
  const context = fakeWindow("/"); const tracker = context.tracker(); let notifications = 0;
  const unsubscribe = tracker.subscribe(() => notifications++);
  const stop = tracker.start(); navigate(context, tracker, "/circles"); stop();
  await Promise.resolve(); assert.equal(notifications, 0, "detached owners cannot deliver an already queued update");
  const stopRestart = tracker.start();
  tracker.writeView("circles-discovery", { category: "medical", sort: "recent" });
  await Promise.resolve(); assert.equal(notifications, 1, "restart's writes share one live delivery");
  const stopSecondOwner = tracker.start(); navigate(context, tracker, "/vaults"); stopRestart();
  await Promise.resolve(); assert.equal(notifications, 2, "one remaining owner keeps its queued delivery");
  navigate(context, tracker, "/settings"); stopSecondOwner();
  await Promise.resolve(); assert.equal(notifications, 2, "last owner cleanup cancels its pending delivery");
  unsubscribe();
});

test("fallback URL normalization rejects external/open-redirect/scheme/control paths", () => {
  for (const value of ["https://evil.example", "//evil.example", "javascript:alert(1)", "/\\evil.example", "/%5Cevil.example", "/%2F%2Fevil.example", "/%252F%252Fevil.example", "/x\nfoo", "/%0Aevil", "/auth/callback?code=token", "/tx/private", "/bad%ZZ", "/%2e%2e//evil.example"]) assert.equal(safeAppFallback(value), "/", value);
  assert.equal(safeAppFallback("/vaults"), "/vaults");
  assert.equal(safeAppFallback("/circles/cebu?tab=story#proof"), "/circles/cebu?tab=story#proof");
});

test("useGoBack calls true Back only for trusted history; direct fallback uses replace, never push", () => {
  const source = readFileSync(new URL("../lib/ui/useGoBack.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, unknown> = {}; let trusted = false;
  const calls: string[] = [];
  runInNewContext(code, { exports, require(name: string) {
    if (name === "next/navigation") return { useRouter: () => ({ back: () => calls.push("back"), replace: (path: string) => calls.push(`replace:${path}`), push: () => { throw Error("Fallback must not push"); } }) };
    if (name === "./app-navigation") return { claimAppBack: () => trusted ? "back" : "fallback", safeAppFallback };
    throw Error(`Unexpected import ${name}`);
  } });
  const goBack = (exports.useGoBack as (path?: string) => () => void)("/vaults"); goBack(); trusted = true; goBack();
  assert.deepEqual(calls, ["replace:/vaults", "back"]);
  trusted = false; (exports.useGoBack as (path: string) => () => void)("//evil.example")(); assert.equal(calls.at(-1), "replace:/");
});

test("async rapid header Back claims only one traversal and stops at the in-app boundary", () => {
  const context = fakeWindow("/", { externalPredecessor: true }); const tracker = context.tracker(); const stop = tracker.start(); commit(context, tracker);
  navigate(context, tracker, "/circles");
  const code = ts.transpileModule(readFileSync(new URL("../lib/ui/useGoBack.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, unknown> = {};
  const traversals: (() => void)[] = [];
  const replacements: string[] = [];
  runInNewContext(code, { exports, require(name: string) {
    if (name === "./app-navigation") return { claimAppBack: tracker.claimBack, safeAppFallback };
    if (name === "next/navigation") return { useRouter: () => ({ back() { traversals.push(() => context.win.history.go(-1)); }, replace(path: string) { replacements.push(path); context.win.history.replaceState(NEXT_STATE, "", path); } }) };
    throw Error(`Unexpected Back dependency ${name}`);
  } });
  const click = (exports.useGoBack as (path: string) => () => void)("/");
  click(); click();
  assert.equal(traversals.length, 1, "second click before async popstate is ignored");
  assert.deepEqual(replacements, [], "pending is not a fallback replacement");
  traversals.shift()!(); commit(context, tracker);
  assert.equal(context.win.location.pathname, "/");
  click();
  assert.equal(traversals.length, 0, "root has no trusted predecessor, cannot leave app");
  assert.deepEqual(replacements, ["/"]);
  assert.equal(context.win.location.origin, ORIGIN);
  navigate(context, tracker, "/vaults"); click(); assert.equal(traversals.length, 1, "new transition clears the earlier claim");
  stop();
});

test("Back claim resets on successful push/replace/pop and final tracker cleanup", () => {
  const context = fakeWindow(); const tracker = context.tracker(); let stop = tracker.start(); commit(context, tracker);
  navigate(context, tracker, "/circles"); assert.equal(tracker.claimBack(), "back"); assert.equal(tracker.claimBack(), "pending");
  context.win.history.replaceState({ ...NEXT_STATE, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: "rerender" } }, "", "/circles");
  assert.equal(tracker.claimBack(), "pending", "same-URL Next tree replace must not unlock async Back");
  context.win.history.replaceState(NEXT_STATE, "", "/vaults"); commit(context, tracker); assert.equal(tracker.claimBack(), "back");
  navigate(context, tracker, "/settings"); assert.equal(tracker.claimBack(), "back");
  context.win.history.go(-1); commit(context, tracker); assert.equal(tracker.claimBack(), "back");
  stop(); stop = tracker.start(); assert.equal(tracker.claimBack(), "back"); stop();
});

test("Next-style wrapper installed before or after tracker preserves router internals", () => {
  for (const nextFirst of [true, false]) {
    const context = fakeWindow();
    const patchNext = () => {
      const original = context.win.history.pushState;
      context.win.history.pushState = function(data, unused, url) {
        if (data?.__NA || data?._N) return original.call(this, data, unused, url);
        return original.call(this, { ...data, __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: NEXT_STATE.__PRIVATE_NEXTJS_INTERNALS_TREE }, unused, url);
      };
    };
    if (nextFirst) patchNext();
    const tracker = context.tracker(); const stop = tracker.start(); commit(context, tracker);
    if (!nextFirst) patchNext();
    context.win.history.pushState(null, "", "/circles");
    assert.equal(tracker.canGoBack(), true); assert.equal(context.win.history.state.__NA, true);
    assert.deepEqual(context.win.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE, NEXT_STATE.__PRIVATE_NEXTJS_INTERNALS_TREE);
    context.win.history.go(-1); assert.equal(tracker.canGoBack(), false); stop();
  }
});

test("persisted registry is sanitized, unexpected account fields never get re-persisted", () => {
  const context = fakeWindow(); const tracker = context.tracker(); const stop = tracker.start(); commit(context, tracker); stop();
  const value = JSON.parse(context.storage.get("salapi-navigation-v1")!);
  value.account = "ACCOUNT_SECRET"; value.entries[0].wallet = "WALLET_SECRET";
  context.storage.set("salapi-navigation-v1", JSON.stringify(value));
  const second = context.tracker(); const stopSecond = second.start();
  assert.equal(context.storage.get("salapi-navigation-v1")?.includes("SECRET"), false); stopSecond();
});

function scrollComponent() {
  const context = fakeWindow();
  const tracker = context.tracker();
  const frames = new Map<number, () => void>(), timers = new Map<number, () => void>();
  let sequence = 0, cursor = 0;
  type Effect = { dependencies: readonly unknown[]; callback: () => (() => void) | void; cleanup?: () => void };
  const hooks: unknown[] = [], scheduled: Effect[] = [];
  const observers: { active: boolean; callback: () => void }[] = [];
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL("../components/AppScrollReset.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  Object.assign(context.win, { setTimeout: (callback: () => void) => { const id = ++sequence; timers.set(id, callback); return id; } });
  runInNewContext(code, { exports, document: context.document, window: context.win,
    requestAnimationFrame: (callback: () => void) => { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id: number) => frames.delete(id), clearTimeout: (id: number) => timers.delete(id),
    ResizeObserver: class {
      observation: { active: boolean; callback: () => void };
      constructor(callback: () => void) { this.observation = { active: false, callback }; observers.push(this.observation); }
      observe() { this.observation.active = true; }
      disconnect() { this.observation.active = false; }
    },
    require(name: string) {
      if (name === "next/navigation") return { usePathname: () => context.win.location.pathname, useSearchParams: () => new URLSearchParams(context.win.location.search) };
      if (name === "@/lib/ui/app-navigation") return {
        commitAppNavigation: tracker.commit, getNavigationEntrySnapshot: tracker.entrySnapshot,
        installAppNavigation: tracker.start, subscribeNavigationViewState: tracker.subscribe,
      };
      if (name === "react") return {
        useSyncExternalStore(_subscribe: unknown, snapshot: () => string) { cursor++; return snapshot(); },
        useRef(initial: unknown) { const key = cursor++; return hooks[key] ??= { current: initial }; },
        useEffect(callback: () => (() => void) | void, dependencies: readonly unknown[]) {
          const key = cursor++, previous = hooks[key] as Effect | undefined;
          if (previous && dependencies.length === previous.dependencies.length && dependencies.every((item, index) => Object.is(item, previous.dependencies[index]))) return;
          previous?.cleanup?.(); const effect = { callback, dependencies }; hooks[key] = effect; scheduled.push(effect);
        },
      };
      throw Error(`Unexpected scroll-reset dependency ${name}`);
    },
  });
  return { ...context, tracker, frames, timers, observers,
    render() { cursor = 0; (exports.default as () => void)(); for (const effect of scheduled.splice(0)) effect.cleanup = effect.callback() ?? undefined; },
    unmount() { for (const hook of hooks) (hook as Effect | undefined)?.cleanup?.(); },
    grow(height: number) { context.document.main.scrollHeight = height; for (const observer of observers) if (observer.active) observer.callback(); },
  };
}

test("actual AppScrollReset tops new routes but restores POP scroll once content is tall enough", () => {
  const component = scrollComponent(); component.render(); component.render();
  component.document.scroll(820);
  component.win.history.pushState(NEXT_STATE, "", "/circles"); component.render();
  assert.equal(component.document.main.positions.at(-1), 0);
  component.win.history.go(-1); component.document.main.scrollHeight = 800; component.render();
  assert.equal(component.document.main.positions.at(-1), 820);
  assert.equal(component.document.main.scrollTop, 100, "loading content temporarily clamps height");
  assert.equal(component.observers.some((observer) => observer.active), true);
  component.grow(2000);
  assert.equal(component.document.main.scrollTop, 820);
  assert.equal(component.frames.size, 0, "successful restoration cancels the queued RAF");
  assert.equal(component.timers.size, 0);
  component.unmount();
});

test("actual AppScrollReset stops waiting restoration on wheel/touch/key/pointer input or unmount", () => {
  for (const input of ["wheel", "touchstart", "pointerdown", "keydown", "unmount"]) {
    const component = scrollComponent(); component.render(); component.render(); component.document.scroll(850);
    component.win.history.pushState(NEXT_STATE, "", "/circles"); component.render();
    component.win.history.go(-1); component.document.main.scrollHeight = 800; component.render();
    if (input === "unmount") component.unmount(); else component.document.main.dispatchEvent(new Event(input));
    const calls = component.document.main.positions.length;
    component.grow(2000);
    assert.equal(component.document.main.positions.length, calls, input);
    assert.equal(component.frames.size, 0); assert.equal(component.timers.size, 0);
    component.unmount();
  }
});
