import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizedUsername, usernameGateExempt, type UsernameStatus, type UsernameSaveResult } from "../lib/username-onboarding.ts";
import { usernameOnboardingCopy } from "../lib/i18n/username-onboarding.ts";
import { LOCALES, type Locale } from "../lib/i18n/config.ts";

const ownerId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const address = "GCUBT6T7SMQKJE5L2TJLUQQPSBBU5GVHALGLWWECEJUIV2YFFCSXGHY7";
const required = (id = ownerId): UsernameStatus => ({ status: "required", ownerId: id, address });
const ready = (id = ownerId): UsernameStatus => ({ status: "ready", ownerId: id, address, handle: "fixture_user" });
function deferred<T>() { let resolve!: (x: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
async function flush() { for (let n = 0; n < 20; n++) await Promise.resolve(); }
type Effect = { callback: () => void | (() => void); deps: readonly unknown[]; cleanup?: () => void };
type Node = React.ReactElement<Record<string, unknown>>;
const source = ts.transpileModule(readFileSync(new URL("../components/UsernameOnboarding.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

// Actual component handlers and effects run with isolated Auth/read/write
// boundaries. This is test-double evidence, not a new Gmail E2E registration.
function setup(locale: Locale = "en", preview = false) {
  let pathname = preview ? "/onboarding/username" : "/send";
  let query = "";
  let cursor = 0; const cells: unknown[] = []; const effects = new Map<number, Effect>(); const scheduled = new Map<number, Effect>();
  let authCallback: (event: string, session: unknown) => void = () => {};
  const reads: { owner: string; result: ReturnType<typeof deferred<UsernameStatus>> }[] = [];
  const writes: { owner: string; name: string; result: ReturnType<typeof deferred<UsernameSaveResult>> }[] = [];
  const calls = { reloads: 0, replacements: [] as string[], subscriptions: 0, unsubscriptions: 0, statusChecks: [] as string[] };
  let transactionResult: unknown = { ok: false, pending: true, hash: "a".repeat(64), error: "Still pending" };
  const hooks = {
    useState(initial: unknown) { const n = cursor++; if (!(n in cells)) cells[n] = initial; return [cells[n], (x: unknown) => { cells[n] = typeof x === "function" ? x(cells[n]) : x; }]; },
    useRef(initial: unknown) { const n = cursor++; return cells[n] ?? (cells[n] = { current: initial }); },
    useSyncExternalStore() { return true; },
    useCallback(callback: unknown, deps: readonly unknown[]) {
      const n = cursor++; const prev = cells[n] as { callback: unknown; deps: readonly unknown[] } | undefined;
      if (!prev || deps.some((x, i) => !Object.is(x, prev.deps[i]))) cells[n] = { callback, deps };
      return (cells[n] as { callback: unknown }).callback;
    },
    useEffect(callback: Effect["callback"], deps: readonly unknown[]) {
      const n = cursor++; const prev = effects.get(n);
      if (!prev || deps.length !== prev.deps.length || deps.some((x, i) => !Object.is(x, prev.deps[i]))) scheduled.set(n, { callback, deps });
    },
  };
  const component = {} as { default: () => React.ReactElement | null };
  runInNewContext(source, { exports: component, queueMicrotask, AbortSignal: { timeout: () => undefined },
    window: { location: { reload() { calls.reloads++; } } },
    async fetch(url: string, options: { cache: string; credentials: string; headers: Record<string, string> }) {
      assert.equal(url, "/api/account/username-onboarding"); assert.equal(options.cache, "no-store"); assert.equal(options.credentials, "same-origin");
      const result = deferred<UsernameStatus>(); reads.push({ owner: options.headers["X-Salapi-Owner"], result });
      return { ok: true, json: () => result.promise };
    }, require(name: string) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "next/navigation") return { usePathname: () => pathname, useSearchParams: () => new URLSearchParams(query), useRouter: () => ({ replace: (p: string) => calls.replacements.push(p) }) };
      if (name === "next/link") return { __esModule: true, default: (p: { href: string; children: React.ReactNode }) => React.createElement("a", { href: p.href }, p.children) };
      if (name === "@/app/username-onboarding-actions") return { completeUsername(owner: string, username: string) { const result = deferred<UsernameSaveResult>(); writes.push({ owner, name: username, result }); return result.promise; } };
      if (name === "@/app/actions") return { async checkSubmittedTransaction(hash: string) { calls.statusChecks.push(hash); return transactionResult; } };
      if (name === "@/lib/supabase/client") return { createSupabaseBrowser: () => ({ auth: { onAuthStateChange(cb: typeof authCallback) { calls.subscriptions++; authCallback = cb; return { data: { subscription: { unsubscribe() { calls.unsubscriptions++; } } } }; } } }) };
      if (name === "@/lib/supabase/env") return { supabaseConfigured: () => true };
      if (name === "@/lib/local-preview") return { isLocalPreview: preview };
      if (name === "@/lib/username-onboarding") return { normalizedUsername, usernameGateExempt };
      if (name === "@/lib/i18n/username-onboarding") return { usernameOnboardingCopy };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale }) };
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
      throw Error(`Unexpected dependency ${name}`);
    },
  });
  function render() { cursor = 0; const tree = component.default(); const pending = [...scheduled.entries()]; scheduled.clear();
    for (const [n, effect] of pending) { effects.get(n)?.cleanup?.(); effects.set(n, { ...effect, cleanup: effect.callback() || undefined }); } return tree;
  }
  function nodes(value: unknown): Node[] { if (Array.isArray(value)) return value.flatMap(nodes); if (!React.isValidElement<Record<string, unknown>>(value)) return []; return [value, ...nodes(value.props.children)]; }
  const html = () => renderToStaticMarkup(render());
  const node = (type: string) => { const found = nodes(render()).find(x => x.type === type); assert.ok(found); return found; };
  const input = (value: string) => (node("input").props.onChange as (e: unknown) => void)({ target: { value } });
  const submit = () => (node("form").props.onSubmit as (e: unknown) => Promise<void>)({ preventDefault() {} });
  const retry = () => { const found = nodes(render()).find(x => x.type === "button" && x.props.children === usernameOnboardingCopy(locale).retry); assert.ok(found); (found.props.onClick as () => void)(); };
  return { render, html, node, input, submit, retry, reads, writes, calls,
    auth(id: string | null, event = "INITIAL_SESSION", anonymous = false) { authCallback(event, id ? { user: { id, is_anonymous: anonymous } } : null); },
    path(next: string) { pathname = next; }, query(next: string) { query = next; }, txResult(next: unknown) { transactionResult = next; }, cleanup() { for (const effect of effects.values()) effect.cleanup?.(); },
  };
}
async function load(h: ReturnType<typeof setup>, value: UsernameStatus = required()) {
  h.render(); h.auth(ownerId); await flush(); assert.equal(h.reads.length, 1); h.reads[0].result.resolve(value); await flush(); h.render();
}

test("guest and anonymous visitors do not claim usernames or trigger owner reads", async () => {
  const h = setup(); h.render(); h.auth(null); await flush(); assert.equal(h.html(), ""); h.auth(ownerId, "SIGNED_IN", true); await flush();
  assert.equal(h.html(), ""); assert.equal(h.reads.length, 0); assert.equal(h.writes.length, 0);
});
test("existing username removes the gate without an extra redirect or write", async () => {
  const h = setup(); await load(h, ready()); assert.equal(h.html(), ""); assert.equal(h.writes.length, 0); assert.equal(h.calls.reloads, 0);
});
for (const locale of LOCALES) test(`${locale}: required popup renders a labelled native dialog with no skip or dismiss control`, async () => {
  const h = setup(locale); await load(h); const html = h.html(); assert.ok(html.includes(usernameOnboardingCopy(locale).title));
  assert.match(html, /<dialog/); assert.match(html, /aria-labelledby="username-title"/); assert.match(html, /minLength="3"/); assert.match(html, /maxLength="32"/);
  assert.doesNotMatch(html, /Skip|Maybe later|Dismiss|aria-label="Close"/);
  assert.equal(h.node("button").props.disabled, true); let prevented = false;
  (h.node("dialog").props.onCancel as (e: unknown) => void)({ preventDefault() { prevented = true; } }); assert.equal(prevented, true);
});
test("claim normalizes input, locks duplicate submission and reloads only after verified success", async () => {
  const h = setup(); await load(h); h.input("@Fixture_User"); const first = h.submit(); const second = h.submit();
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].owner, ownerId); assert.equal(h.writes[0].name, "fixture_user"); assert.equal(h.calls.reloads, 0);
  assert.equal(h.node("input").props.disabled, true); h.writes[0].result.resolve({ ok: true, ownerId, handle: "fixture_user" }); await first; await second;
  assert.equal(h.calls.reloads, 1);
});
test("invalid username never invokes registration", async () => {
  const h = setup(); await load(h); h.input("bad name"); await h.submit(); assert.equal(h.writes.length, 0); assert.match(h.html(), /role="alert"/);
});
for (const code of ["taken", "failed", "invalid"] as const) test(`a ${code} response stays in the popup with retryable input`, async () => {
  const h = setup(); await load(h); h.input("fixture_user"); const promise = h.submit(); h.writes[0].result.resolve({ ok: false, code }); await promise;
  assert.ok(h.html().includes(usernameOnboardingCopy("en")[code])); assert.equal(h.calls.reloads, 0); assert.equal(h.node("input").props.disabled, false);
});
test("pending outcome blocks another claim and checks the existing hash read-only", async () => {
  const h = setup(); await load(h); h.input("fixture_user"); const promise = h.submit(); h.writes[0].result.resolve({ ok: false, code: "pending", hash: "a".repeat(64) }); await promise;
  assert.doesNotMatch(h.html(), /<form/); assert.ok(h.html().includes(usernameOnboardingCopy("en").pending));
  h.retry(); await flush(); assert.deepEqual(h.calls.statusChecks, ["a".repeat(64)]); assert.equal(h.writes.length, 1);
  h.reads[1].result.resolve(ready()); await flush(); assert.equal(h.calls.reloads, 1);
});
test("transport rejection never reports success or enables a blind resubmit", async () => {
  const h = setup(); await load(h); h.input("fixture_user"); const promise = h.submit(); h.writes[0].result.reject(Error("Transport interrupted")); await promise;
  assert.doesNotMatch(h.html(), /<form/); assert.ok(h.html().includes(usernameOnboardingCopy("en").pending)); assert.equal(h.calls.reloads, 0);
});
test("a confirmed failed transaction allows a fresh claim only after a fresh owner read", async () => {
  const h = setup(); await load(h); h.input("fixture_user"); const promise = h.submit(); h.writes[0].result.resolve({ ok: false, code: "pending", hash: "a".repeat(64) }); await promise;
  h.txResult({ ok: false, error: "Confirmed failure" }); h.retry(); await flush(); h.reads[1].result.resolve(required()); await flush();
  assert.match(h.html(), /<form/); assert.equal(h.writes.length, 1);
});
test("account switch immediately clears the old input and discards a delayed old save", async () => {
  const h = setup(); await load(h); h.input("old_name"); const promise = h.submit();
  h.auth(otherId, "SIGNED_IN"); await flush(); assert.doesNotMatch(h.html(), /old_name/);
  h.reads[1].result.resolve(required(otherId)); await flush(); h.writes[0].result.resolve({ ok: true, ownerId, handle: "old_name" }); await promise;
  assert.equal(h.calls.reloads, 0); assert.match(h.html(), /<dialog/);
});
test("late owner read cannot release the new owner's popup", async () => {
  const h = setup(); h.render(); h.auth(ownerId); await flush(); h.auth(otherId, "SIGNED_IN"); await flush();
  h.reads[1].result.resolve(required(otherId)); await flush(); h.reads[0].result.resolve(ready()); await flush(); assert.match(h.html(), /<form/);
});
test("an unexpected response owner fails closed", async () => {
  const h = setup(); await load(h, ready(otherId)); assert.ok(h.html().includes(usernameOnboardingCopy("en").unavailable)); assert.doesNotMatch(h.html(), /<form/);
});
test("token refresh and route changes do not refetch registry on every click", async () => {
  const h = setup(); await load(h, ready()); h.auth(ownerId, "TOKEN_REFRESHED"); h.path("/circles/tino-relief"); h.render(); await flush();
  assert.equal(h.reads.length, 1); assert.equal(h.calls.subscriptions, 1); h.cleanup(); assert.equal(h.calls.unsubscriptions, 1);
});
test("legal, sign-in and wallet recovery are reachable without dismissing the requirement", async () => {
  const h = setup(); await load(h); h.path("/privacy"); assert.equal(h.html(), ""); h.path("/send"); assert.match(h.html(), /<dialog/);
  h.path("/signin"); assert.equal(h.html(), ""); h.path("/wallet/setup"); assert.equal(h.html(), "");
});
test("missing wallet offers setup, not registry mutation or an invented identity", async () => {
  const h = setup(); await load(h, { status: "wallet_missing", ownerId }); assert.match(h.html(), /\/wallet\/setup\?next=/); assert.doesNotMatch(h.html(), /<form/); assert.equal(h.writes.length, 0);
});

test("wallet and sign-in recovery preserve the original deep-link query", async () => {
  const h = setup(); h.path("/send"); h.query("to=fixture_user&amount=5");
  await load(h, { status: "wallet_missing", ownerId });
  const html = h.html(); assert.match(html, /next=%2Fsend%3Fto%3Dfixture_user%26amount%3D5/);
  assert.ok(html.includes("/wallet/setup?next=")); assert.ok(html.includes("/signin?next="));
});
test("local demonstration cannot hit Auth or registry mutations", async () => {
  const h = setup("en", true); h.render(); h.input("local_name"); await h.submit(); assert.deepEqual(h.calls.replacements, ["/"]);
  assert.equal(h.calls.subscriptions, 0); assert.equal(h.reads.length, 0); assert.equal(h.writes.length, 0);
});
