import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { LOCALES, type Locale } from "../lib/i18n/config.ts";
import * as helpers from "../lib/campaign-updates.ts";

const owner = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const update = { id: requestId, campaignId: "7", title: "QA testing update", body: "QA content, not verified delivery.",
  publishedAt: "2026-10-07T00:00:00Z", label: "QA Testnet organizer update", verifiedProof: false };
function data({ id = owner, creator = true, provider = false, entries = [] as Record<string, unknown>[] } = {}) {
  return { subscription: { ok: true, status: "verified", ownerId: id, email: "private@example.invalid", subscribed: false, providerConfigured: provider, canPublish: creator },
    updates: { ok: true, updates: entries } };
}
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}
async function flush() { for (let n = 0; n < 15; n++) await Promise.resolve(); }
type Effect = { deps: readonly unknown[]; callback: () => void | (() => void); cleanup?: () => void };
type AuthListener = (event: string, session: { user: { id: string } } | null) => void;

// Actual component handlers + React SSR, with auth/actions/storage isolated.
// These checks do not assert real Gmail login, provider delivery or DB execution.
function setup({ locale = "en", configured = true, storage = new Map<string, string>(), storageThrows = false }:
  { locale?: Locale; configured?: boolean; storage?: Map<string, string>; storageThrows?: boolean } = {}) {
  const cells: unknown[] = [], effects = new Map<number, Effect>(), scheduled = new Map<number, Effect>();
  const reads: ReturnType<typeof deferred>[] = [];
  const publishes: { input: Record<string, unknown>; result: ReturnType<typeof deferred> }[] = [];
  const dispatches: { input: Record<string, unknown>; result: ReturnType<typeof deferred> }[] = [];
  let cursor = 0, listener: AuthListener = () => {};
  const calls = { unsubscribed: 0, uuid: 0 };
  const hooks = {
    useState(initial: unknown) {
      const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial;
      return [cells[index], (next: unknown) => { cells[index] = typeof next === "function" ? next(cells[index]) : next; }];
    },
    useRef(initial: unknown) { const index = cursor++; return cells[index] ?? (cells[index] = { current: initial }); },
    useEffect(callback: Effect["callback"], deps: readonly unknown[]) {
      const index = cursor++, old = effects.get(index);
      if (!old || deps.length !== old.deps.length || deps.some((value, n) => !Object.is(value, old.deps[n]))) scheduled.set(index, { callback, deps });
    },
    useTransition() {
      const index = cursor++, cell = (cells[index] ??= { pending: 0 }) as { pending: number };
      return [cell.pending > 0, (callback: () => Promise<unknown>) => { cell.pending++; void callback().finally(() => { cell.pending--; }); }];
    },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("../components/CampaignOrganizerUpdates.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const component = {} as { default(props: { campaignId: string }): React.ReactElement<{ campaignId: string }> };
  runInNewContext(compiled, { exports: component, queueMicrotask, Date,
    crypto: { randomUUID() { calls.uuid++; return requestId; } },
    sessionStorage: {
      getItem(key: string) { if (storageThrows) throw Error("Storage disabled"); return storage.get(key) ?? null; },
      setItem(key: string, value: string) { if (storageThrows) throw Error("Storage disabled"); storage.set(key, value); },
      removeItem(key: string) { if (storageThrows) throw Error("Storage disabled"); storage.delete(key); },
    },
    require(name: string) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale }) };
      if (name === "@/lib/campaign-updates") return helpers;
      if (name === "@/lib/supabase/env") return { supabaseConfigured: () => configured };
      if (name === "@/lib/local-preview") return { isLocalPreview: false };
      if (name === "@/lib/supabase/client") return { createSupabaseBrowser() { return { auth: { onAuthStateChange(callback: AuthListener) {
        listener = callback; return { data: { subscription: { unsubscribe() { calls.unsubscribed++; } } } };
      } } }; } };
      if (name === "@/app/campaign-update-actions") return {
        readCampaignOrganizerUpdates(id: string) { assert.equal(id, "7"); const read = deferred(); reads.push(read); return read.promise; },
        publishCampaignUpdate(input: Record<string, unknown>) { const result = deferred(); publishes.push({ input, result }); return result.promise; },
        dispatchCampaignUpdateEmails(input: Record<string, unknown>) { const result = deferred(); dispatches.push({ input, result }); return result.promise; },
      };
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => key }) };
      throw Error(`Unexpected organizer UI dependency ${name}`);
    },
  });
  function render() {
    cursor = 0;
    const wrapper = component.default({ campaignId: "7" }); assert.equal(wrapper.key, "7");
    const tree = (wrapper.type as (props: { campaignId: string }) => React.ReactElement)(wrapper.props);
    const waiting = [...scheduled.entries()]; scheduled.clear();
    for (const [index, effect] of waiting) { effects.get(index)?.cleanup?.(); effects.set(index, { ...effect, cleanup: effect.callback() || undefined }); }
    return tree;
  }
  function nodes(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!React.isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...nodes(node.props.children as React.ReactNode)];
  }
  const find = (type: string, predicate: (props: Record<string, unknown>) => boolean = () => true) => nodes(render()).find(element => element.type === type && predicate(element.props))!;
  const button = (className: string) => find("button", props => props.className === className);
  return { calls, reads, publishes, dispatches, storage, render, find, button,
    html: () => renderToStaticMarkup(render()),
    auth(id: string | null) { listener(id ? "SIGNED_IN" : "SIGNED_OUT", id ? { user: { id } } : null); },
    fill() {
      (find("input", props => props.maxLength === 120).props.onChange as (event: unknown) => void)({ target: { value: update.title } });
      (find("textarea").props.onChange as (event: unknown) => void)({ target: { value: update.body } });
      (find("input", props => props.type === "checkbox").props.onChange as (event: unknown) => void)({ target: { checked: true } });
    },
    click(className: string) { (button(className).props.onClick as () => void)(); },
    cleanup() { for (const effect of effects.values()) effect.cleanup?.(); },
  };
}

test("public feed is readable without auth; guest never gets creator controls or private email", async () => {
  for (const locale of LOCALES) {
    const ui = setup({ locale, configured: false }); ui.render(); await flush();
    ui.reads[0].resolve({ subscription: { ok: false, status: "guest", error: "Sign in" }, updates: { ok: true, updates: [update] } }); await flush();
    const html = ui.html(); assert.match(html, /QA testing update/); assert.doesNotMatch(html, /textarea|type="checkbox"|private@example/);
    assert.equal(ui.publishes.length, 0); assert.equal(ui.dispatches.length, 0); ui.cleanup();
  }
});
test("only server-authorized and session-correlated creator can edit", async () => {
  for (const result of [data({ creator: false }), data({ id: other })]) {
    const ui = setup(); ui.render(); ui.auth(owner); await flush(); ui.reads[0].resolve(result); await flush();
    assert.doesNotMatch(ui.html(), /textarea|type="checkbox"|private@example/); assert.equal(ui.publishes.length, 0); ui.cleanup();
  }
});
test("creator requires text + acknowledgement and explicit publish, never auto-dispatches", async () => {
  const ui = setup(); ui.render(); ui.auth(owner); await flush(); ui.reads[0].resolve(data()); await flush();
  assert.equal(ui.button("primary").props.disabled, true); assert.equal(ui.publishes.length, 0);
  ui.fill(); assert.equal(ui.button("primary").props.disabled, false); ui.click("primary");
  const input = ui.publishes[0].input;
  assert.equal(input.expectedOwnerId, owner); assert.equal(input.idempotencyKey, requestId); assert.equal(input.publicAcknowledged, true);
  assert.equal(input.title, update.title); assert.equal(input.body, update.body); assert.equal(ui.dispatches.length, 0);
  assert.equal(ui.storage.size, 1); assert.doesNotMatch([...ui.storage.values()].join(""), /private@example|secret|token/);
  ui.publishes[0].result.resolve({ ok: true, updateId: requestId, published: true, providerConfigured: false, emailStatus: "queued" }); await flush();
  ui.reads[1].resolve(data({ entries: [update] })); await flush();
  assert.match(ui.html(), /Public update confirmed/); assert.match(ui.html(), /Email delivery is not configured/);
  assert.equal(ui.storage.size, 0); assert.equal(ui.dispatches.length, 0); ui.cleanup();
});
test("uncertain publication locks immutable draft, retries same ID/body, and never says confirmed", async () => {
  const ui = setup(); ui.render(); ui.auth(owner); await flush(); ui.reads[0].resolve(data()); await flush(); ui.fill(); ui.click("primary");
  ui.publishes[0].result.resolve({ ok: false, error: "DB response unknown" }); await flush();
  assert.match(ui.html(), /Publication is not confirmed/); assert.equal(ui.find("textarea").props.disabled, true);
  ui.click("primary"); assert.deepEqual(ui.publishes[0].input, ui.publishes[1].input); assert.equal(ui.calls.uuid, 1);
  ui.publishes[1].result.resolve({ ok: false, error: "Still unknown" }); await flush(); ui.cleanup();
});
test("uncertain publication survives reload with exact owner-scoped nonce and payload", async () => {
  const first = setup(); first.render(); first.auth(owner); await flush(); first.reads[0].resolve(data()); await flush(); first.fill(); first.click("primary");
  first.publishes[0].result.resolve({ ok: false, error: "Unknown" }); await flush(); first.cleanup();
  const reloaded = setup({ storage: first.storage }); reloaded.render(); reloaded.auth(owner); await flush(); reloaded.reads[0].resolve(data()); await flush();
  assert.match(reloaded.html(), /Publication is not confirmed/); assert.equal(reloaded.find("textarea").props.value, update.body);
  reloaded.click("primary"); assert.deepEqual(JSON.parse(JSON.stringify(reloaded.publishes[0].input)), JSON.parse(JSON.stringify(first.publishes[0].input)));
  assert.equal(reloaded.calls.uuid, 0); reloaded.publishes[0].result.resolve({ ok: false, error: "Unknown" }); await flush(); reloaded.cleanup();
});
test("public feed reconciles saved uncertain ID without sending or publishing again", async () => {
  const storage = new Map([[`salapi.qa-campaign-update.v1/7/${owner}`, JSON.stringify({ version: 1, campaignId: "7", ownerId: owner,
    id: requestId, title: update.title, body: update.body, publicAcknowledged: true })]]);
  const ui = setup({ storage }); ui.render(); ui.auth(owner); await flush(); ui.reads[0].resolve(data({ entries: [update] })); await flush();
  assert.match(ui.html(), /Public update confirmed/); assert.equal(ui.storage.size, 0); assert.equal(ui.publishes.length, 0); assert.equal(ui.dispatches.length, 0); ui.cleanup();
});
test("disabled storage fails closed before mutation instead of losing retry identity", async () => {
  const ui = setup({ storageThrows: true }); ui.render(); ui.auth(owner); await flush(); ui.reads[0].resolve(data()); await flush(); ui.fill(); ui.click("primary");
  assert.equal(ui.publishes.length, 0); assert.match(ui.html(), /Publication is not confirmed/); ui.cleanup();
});
test("explicit dispatch is separate and provider acceptance is not claimed inbox delivery", async () => {
  const ui = setup(); ui.render(); ui.auth(owner); await flush(); ui.reads[0].resolve(data({ entries: [update], provider: true })); await flush();
  assert.equal(ui.dispatches.length, 0); ui.click("secondary");
  assert.deepEqual(JSON.parse(JSON.stringify(ui.dispatches[0].input)), { campaignId: "7", updateId: requestId, expectedOwnerId: owner });
  ui.dispatches[0].result.resolve({ ok: true, accepted: 1, unknown: 0, rejected: 0, cancelled: 0, remaining: 0, needsReview: 0, deliveryVerified: false }); await flush();
  assert.match(ui.html(), /Provider accepted: 1/); assert.match(ui.html(), /Inbox delivery has not been verified/); assert.equal(ui.publishes.length, 0); ui.cleanup();
});
test("provider absent disables dispatch and account switch discards stale mutation results", async () => {
  const ui = setup(); ui.render(); ui.auth(owner); await flush(); ui.reads[0].resolve(data({ entries: [update] })); await flush();
  assert.equal(ui.button("secondary").props.disabled, true); ui.click("secondary"); assert.equal(ui.dispatches.length, 0);
  ui.fill(); ui.click("primary"); ui.auth(other); await flush();
  ui.publishes[0].result.resolve({ ok: true, updateId: requestId, published: true }); await flush();
  ui.reads[1].resolve(data({ id: other, creator: false })); await flush();
  assert.doesNotMatch(ui.html(), /Public update confirmed|textarea|private@example/); assert.equal(ui.storage.size, 1, "Old owner can safely reconcile its own retained nonce later"); ui.cleanup();
});
test("late read from previous owner does not revive creator controls", async () => {
  const ui = setup(); ui.render(); ui.auth(owner); await flush(); ui.auth(other); await flush();
  ui.reads[0].resolve(data()); await flush(); assert.doesNotMatch(ui.html(), /textarea|private@example/);
  ui.reads[1].resolve(data({ id: other, creator: false })); await flush(); assert.doesNotMatch(ui.html(), /textarea|private@example/); ui.cleanup();
});
