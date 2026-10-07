import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { LOCALES, type Locale } from "../lib/i18n/config.ts";
import type { CampaignUpdateSubscriptionState, CampaignUpdateResult } from "../lib/campaign-updates.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const state = (id = owner, subscribed = false): CampaignUpdateSubscriptionState => ({ ok: true, status: "verified", ownerId: id,
  email: id === owner ? "fixture@example.invalid" : "other@example.invalid", subscribed, providerConfigured: false, canPublish: false });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
async function flush() { for (let n = 0; n < 15; n++) await Promise.resolve(); }
type Effect = { deps: readonly unknown[]; callback: () => void | (() => void); cleanup?: () => void };
type AuthListener = (event: string, session: { user: { id: string } } | null) => void;

// Execute the actual component's hooks/handlers and render its actual JSX with
// React SSR. Auth and server actions are isolated, not Gmail/browser E2E proof.
function setup({ locale = "en", configured = true }: { locale?: Locale; configured?: boolean } = {}) {
  const cells: unknown[] = [], effects = new Map<number, Effect>(), scheduled = new Map<number, Effect>();
  const reads: ReturnType<typeof deferred<CampaignUpdateSubscriptionState>>[] = [];
  const writes: { input: Record<string, unknown>; result: ReturnType<typeof deferred<CampaignUpdateResult>> }[] = [];
  let cursor = 0, listener: AuthListener = () => {};
  const calls = { unsubscribed: 0 };
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
  const compiled = ts.transpileModule(readFileSync(new URL("../components/CampaignUpdateSubscription.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const component = {} as { default(props: { campaignId: string }): React.ReactElement<{ campaignId: string }> };
  runInNewContext(compiled, { exports: component, queueMicrotask,
    window: { addEventListener() {}, removeEventListener() {} },
    require(name: string) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "next/link") return { __esModule: true, default: (props: { href: string; children: React.ReactNode }) => React.createElement("a", { href: props.href }, props.children) };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale }) };
      if (name === "@/lib/supabase/env") return { supabaseConfigured: () => configured };
      if (name === "@/lib/local-preview") return { isLocalPreview: false };
      if (name === "@/lib/supabase/client") return { createSupabaseBrowser() { return { auth: { onAuthStateChange(callback: AuthListener) {
        listener = callback; return { data: { subscription: { unsubscribe() { calls.unsubscribed++; } } } };
      } } }; } };
      if (name === "@/app/campaign-update-actions") return {
        readCampaignUpdateSubscription(id: string) { assert.equal(id, "7"); const read = deferred<CampaignUpdateSubscriptionState>(); reads.push(read); return read.promise; },
        setCampaignUpdateSubscription(input: Record<string, unknown>) { const result = deferred<CampaignUpdateResult>(); writes.push({ input, result }); return result.promise; },
      };
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => key }) };
      throw Error(`Unexpected campaign update UI dependency ${name}`);
    },
  });
  function render() {
    cursor = 0;
    const wrapper = component.default({ campaignId: "7" });
    assert.equal(wrapper.key, "7", "Each route binds a fresh private identity state");
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
  const checkbox = () => nodes(render()).find(element => element.type === "input")!;
  const button = () => nodes(render()).find(element => element.type === "button")!;
  return { calls, reads, writes, render, checkbox, button,
    html: () => renderToStaticMarkup(render()),
    auth(id: string | null) { listener(id ? "SIGNED_IN" : "SIGNED_OUT", id ? { user: { id } } : null); },
    change(checked: boolean) { const input = checkbox(); (input.props.onChange as (event: unknown) => void)({ target: { checked } }); },
    click() { (button().props.onClick as () => void)(); },
    cleanup() { for (const effect of effects.values()) effect.cleanup?.(); },
  };
}

test("guest UI has sign-in route and no manual email or automatic write in all locales", () => {
  for (const locale of LOCALES) {
    const ui = setup({ configured: false, locale });
    const html = ui.html();
    assert.match(html, /signin\?next=%2Fcampaigns%3Fid%3D7/); assert.doesNotMatch(html, /type="email"|fixture@example|type="checkbox"/);
    assert.equal(ui.writes.length, 0); assert.equal(ui.reads.length, 0); ui.cleanup();
  }
});
test("verified email renders privately with unchecked opt-in and honest missing-provider notice", async () => {
  const ui = setup(); ui.render(); ui.auth(owner); await flush();
  ui.reads[0].resolve(state()); await flush();
  const html = ui.html();
  assert.match(html, /fixture@example.invalid/); assert.match(html, /no emails are being sent/);
  assert.doesNotMatch(html, /type="email"|value="fixture@example/);
  assert.equal(ui.checkbox().props.checked, false); assert.equal(ui.button().props.disabled, true);
  assert.equal(ui.writes.length, 0); ui.cleanup();
});
test("checkbox and explicit save bind consent to verified owner, then unsubscribe has no consent requirement", async () => {
  const ui = setup(); ui.render(); ui.auth(owner); await flush(); ui.reads[0].resolve(state()); await flush();
  ui.change(true); assert.equal(ui.button().props.disabled, false); ui.click();
  assert.deepEqual(JSON.parse(JSON.stringify(ui.writes[0].input)), { campaignId: "7", expectedOwnerId: owner, subscribed: true, notifyOk: true });
  assert.equal(ui.button().props.disabled, true);
  ui.writes[0].result.resolve({ ok: true, subscribed: true, providerConfigured: false }); await flush();
  assert.match(ui.html(), /Email preference saved/); assert.match(ui.html(), /Stop email updates/);
  assert.equal(ui.checkbox().props.disabled, true); ui.click();
  assert.equal(ui.writes[1].input.subscribed, false); assert.equal(ui.writes[1].input.notifyOk, false);
  ui.writes[1].result.resolve({ ok: true, subscribed: false, providerConfigured: false }); await flush();
  assert.match(ui.html(), /Email updates stopped/); assert.equal(ui.checkbox().props.checked, false); ui.cleanup();
});
test("account switches clear email/consent immediately and ignore stale reads", async () => {
  const ui = setup(); ui.render(); ui.auth(owner); await flush();
  ui.auth(other); await flush(); ui.reads[0].resolve(state(owner)); await flush();
  assert.doesNotMatch(ui.html(), /fixture@example|other@example/);
  ui.reads[1].resolve(state(other)); await flush();
  assert.match(ui.html(), /other@example/); assert.doesNotMatch(ui.html(), /fixture@example/);
  assert.equal(ui.checkbox().props.checked, false); ui.cleanup();
});
test("server/browser owner mismatch never renders another account email", async () => {
  const ui = setup(); ui.render(); ui.auth(owner); await flush(); ui.reads[0].resolve(state(other)); await flush();
  assert.doesNotMatch(ui.html(), /other@example|fixture@example|type="checkbox"/);
  assert.equal(ui.writes.length, 0); ui.cleanup();
});
test("sign-out during save discards stale success and clears private email", async () => {
  const ui = setup(); ui.render(); ui.auth(owner); await flush(); ui.reads[0].resolve(state()); await flush();
  ui.change(true); ui.click(); ui.auth(null);
  assert.doesNotMatch(ui.html(), /fixture@example/);
  ui.writes[0].result.resolve({ ok: true, subscribed: true, providerConfigured: false }); await flush();
  assert.doesNotMatch(ui.html(), /Email preference saved|fixture@example/); assert.match(ui.html(), /Sign in/); ui.cleanup();
});
test("failed save does not claim success and preserves explicit consent for retry", async () => {
  const ui = setup(); ui.render(); ui.auth(owner); await flush(); ui.reads[0].resolve(state()); await flush(); ui.change(true); ui.click();
  ui.writes[0].result.resolve({ ok: false, error: "Service unavailable" }); await flush();
  assert.match(ui.html(), /role="alert"/); assert.doesNotMatch(ui.html(), /Email preference saved/);
  assert.equal(ui.checkbox().props.checked, true); ui.cleanup();
});
test("unmount prevents pending reads and saves from reviving private state", async () => {
  const ui = setup(); ui.render(); ui.auth(owner); await flush(); ui.cleanup(); ui.reads[0].resolve(state()); await flush();
  assert.doesNotMatch(ui.html(), /fixture@example/); assert.equal(ui.calls.unsubscribed, 1);
});
