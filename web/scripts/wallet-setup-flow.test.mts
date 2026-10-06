import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { walletSetupCopy } from "../lib/i18n/wallet-setup.ts";
import { LOCALES, type Locale } from "../lib/i18n/config.ts";

// Actual callback/action/screen code, isolated at SDK, funding and router
// boundaries. No real Auth, cookie exchange, database, Friendbot or signing.
const address = "GAKZLTZFGSSM372XUKW2ZIJ5GSHVVIW5BYZIKIXRW2BW4MM6TUI5536Y";
const secret = "S-RAW-CUSTODY-SECRET-MUST-NOT-BE-SERIALIZED";
function compile(path: string) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
}
function pureModule(path: string): Record<string, (...args: never[]) => unknown> {
  const exports = {} as Record<string, (...args: never[]) => unknown>;
  runInNewContext(compile(path), { exports, URL, require(name: string) {
    if (name === "@/lib/ui/app-navigation" || name === "./ui/app-navigation") return pureModule("../lib/ui/app-navigation.ts");
    throw new Error(`Unexpected pure dependency ${name}`);
  } }); return exports;
}
const redirects = pureModule("../lib/authRedirect.ts");
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }

function callbackHarness({ preview = false, configured = true, exchangeError = false, exchangeThrows = false, serverThrows = false, setupFails = false } = {}) {
  const cookieJar = new Map<string, string>([["existing-session", "fixture-existing-session"]]);
  const calls = { exchange: [] as string[], prepare: 0, deleted: [] as string[], order: [] as string[] };
  type Redirect = { status: number; headers: Headers; cookies: { delete: (name: string) => void } };
  const exports = {} as { GET: (request: Request) => Promise<Redirect> };
  runInNewContext(compile("../app/auth/callback/route.ts"), { exports, URL, console: { error: () => {} }, require(name: string) {
    if (name === "next/server") return { NextResponse: { redirect(location: string) {
      return { status: 307, headers: new Headers({ location }), cookies: { delete(name: string) { calls.deleted.push(name); cookieJar.delete(name); } } };
    } } };
    if (name === "@/lib/local-preview") return { isLocalPreview: preview };
    if (name === "@/lib/supabase/env") return { supabaseConfigured: () => configured };
    if (name === "@/lib/authRedirect") return redirects;
    if (name === "@/lib/ui/app-navigation") return pureModule("../lib/ui/app-navigation.ts");
    if (name === "@/lib/supabase/server") return { async createSupabaseServer() {
      if (serverThrows) throw new Error("Fixture cookie/Auth creation outage");
      return { auth: { async exchangeCodeForSession(code: string) {
        calls.exchange.push(code); calls.order.push("exchange");
        if (exchangeThrows) throw new Error("Fixture Auth connection outage");
        if (exchangeError) return { error: { message: "Fixture PKCE exchange rejected" } };
        cookieJar.set("access-session", "fixture-access-session"); cookieJar.set("refresh-session", "fixture-refresh-session");
        return { error: null };
      }, signOut() { throw new Error("Wallet setup must not sign out an exchanged valid session"); } } };
    } };
    if (name === "@/lib/server/userWallet") return { async prepareAuthenticatedWallet() {
      calls.prepare++; calls.order.push("prepare");
      assert.equal(cookieJar.get("access-session"), "fixture-access-session");
      if (setupFails) throw new Error(`Fixture provisioning failure ${secret}`);
      return { publicKey: address, secret, demo: false };
    } };
    throw new Error(`Unexpected callback dependency ${name}`);
  } });
  return { calls, cookieJar, get: (path: string, cookie?: string) => exports.GET(new Request(`https://salapi.app${path}`, { headers: cookie ? { cookie } : {} })) };
}

for (const next of ["/send", "/campaigns?create=1"]) {
  test(`successful OAuth exchange prepares personal wallet before redirecting to${next}`, async () => {
    const h = callbackHarness(); const response = await h.get(`/auth/callback?code=fixture-code&next=${encodeURIComponent(next)}`);
    assert.equal(response.headers.get("location"), `https://salapi.app${next}`); assert.equal(h.calls.exchange[0], "fixture-code"); assert.equal(h.calls.prepare, 1);
    assert.deepEqual(h.calls.order, ["exchange", "prepare"]); assert.equal(h.cookieJar.get("access-session"), "fixture-access-session"); assert.equal(h.cookieJar.get("refresh-session"), "fixture-refresh-session");
    assert.deepEqual(h.calls.deleted, ["salapi_auth_next"]); assert.ok(!JSON.stringify(response).includes(secret));
  });
  test(`setup failure retains exchanged session and original destination${next}`, async () => {
    const h = callbackHarness({ setupFails: true }); const response = await h.get(`/auth/callback?code=fixture-code&next=${encodeURIComponent(next)}`);
    assert.equal(response.headers.get("location"), `https://salapi.app/wallet/setup?next=${encodeURIComponent(next)}`);
    assert.equal(h.cookieJar.get("access-session"), "fixture-access-session"); assert.equal(h.cookieJar.get("refresh-session"), "fixture-refresh-session");
    assert.deepEqual(h.calls.deleted, ["salapi_auth_next"]); assert.ok(!response.headers.get("location")!.includes(secret));
  });
}
test("Auth exchange error goes to sign-in with original destination, never calls provisioning", async () => {
  const h = callbackHarness({ exchangeError: true }); const response = await h.get("/auth/callback?code=rejected&next=%2Fcampaigns%3Fcreate%3D1");
  assert.equal(response.headers.get("location"), "https://salapi.app/signin?error=oauth&next=%2Fcampaigns%3Fcreate%3D1"); assert.equal(h.calls.prepare, 0); assert.equal(h.cookieJar.has("access-session"), false);
});
for (const failure of [{ exchangeThrows: true }, { serverThrows: true }]) test(`thrown Auth failure is retryable without losing next${JSON.stringify(failure)}`, async () => {
  const h = callbackHarness(failure); const response = await h.get("/auth/callback?code=fixture&next=%2Fsend");
  assert.equal(response.headers.get("location"), "https://salapi.app/signin?error=oauth&next=%2Fsend"); assert.equal(h.calls.prepare, 0);
});
test("stored OAuth destination wins over callback query, and malformed cookie falls back safely", async () => {
  const h = callbackHarness({ setupFails: true }); const response = await h.get("/auth/callback?code=fixture&next=%2Fsend", "salapi_auth_next=%2Fcampaigns%3Fcreate%3D1");
  assert.equal(response.headers.get("location"), "https://salapi.app/wallet/setup?next=%2Fcampaigns%3Fcreate%3D1");
  const fallback = callbackHarness(); assert.equal((await fallback.get("/auth/callback?next=%2Fsend", "salapi_auth_next=%broken")).headers.get("location"), "https://salapi.app/send");
});
for (const [title, options, path] of [
  ["ordinary GET without OAuth code", {}, "/auth/callback?next=%2Fsend"],
  ["local preview OAuth callback", { preview: true }, "/auth/callback?code=fixture&next=%2Fsend"],
  ["unconfigured Auth callback", { configured: false }, "/auth/callback?code=fixture&next=%2Fsend"],
] as const) test(`${title} never exchanges sessions, provisions wallets or funds accounts`, async () => {
  const h = callbackHarness(options); assert.equal((await h.get(path)).headers.get("location"), "https://salapi.app/send"); assert.equal(h.calls.exchange.length, 0); assert.equal(h.calls.prepare, 0);
});
for (const next of ["https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/%5Cevil.invalid", "/%2F%2Fevil.invalid", "/%252F%252Fevil.invalid", "/%0Aevil", "/auth/callback?code=private", "/tx/private", "/bad%ZZ"]) {
  test(`OAuth callback rejects unsafe/private destination${JSON.stringify(next)}`, async () => {
    const h = callbackHarness(); const response = await h.get(`/auth/callback?next=${encodeURIComponent(next)}`); assert.equal(response.headers.get("location"), "https://salapi.app/");
  });
}

function actionHarness({ preview = false, fails = false } = {}) {
  const calls = { prepare: 0 }; const exports = {} as { initializeWallet: () => Promise<{ ok: boolean; address?: string }> };
  runInNewContext(compile("../app/wallet-setup-actions.ts"), { exports, require(name: string) {
    if (name === "@/lib/local-preview") return { isLocalPreview: preview };
    if (name === "@/lib/server/userWallet") return { async prepareAuthenticatedWallet() { calls.prepare++; if (fails) throw new Error(`Fixture verified-auth/setup failure ${secret}`); return { publicKey: address, secret, demo: false }; } };
    throw new Error(`Unexpected setup action dependency ${name}`);
  } }); return { calls, invoke: exports.initializeWallet };
}
test("setup action returns only confirmed public address, no key or signer fields", async () => {
  const h = actionHarness(), result = await h.invoke(); assert.equal(result.ok, true); assert.equal(result.address, address); assert.deepEqual(Object.keys(result).sort(), ["address", "ok"]);
  assert.ok(!JSON.stringify(result).includes(secret)); assert.equal(h.calls.prepare, 1);
});
test("setup/auth provider failure returns neutral false without serializing provider messages", async () => {
  const h = actionHarness({ fails: true }), result = await h.invoke(); assert.equal(result.ok, false); assert.equal(result.address, undefined); assert.deepEqual(Object.keys(result), ["ok"]); assert.ok(!JSON.stringify(result).includes(secret));
});
test("local preview setup action fails closed before authenticated helper/network/key access", async () => {
  const h = actionHarness({ preview: true }); assert.equal((await h.invoke()).ok, false); assert.equal(h.calls.prepare, 0);
});

function screenHarness({ locale = "en" as Locale, preview = false, nextPath = "/send" } = {}) {
  const states: unknown[] = [], refs: { current: unknown }[] = [];
  let stateCursor = 0, refCursor = 0;
  const calls = { initializations: [] as ReturnType<typeof deferred<{ ok: boolean; address?: string }>>[], replaces: [] as string[] };
  const exports = {} as { default: (props: { nextPath: string }) => React.ReactElement };
  runInNewContext(compile("../components/screens/WalletSetupScreen.tsx"), { exports,
    require(name: string) {
      if (name === "react") return { ...React, useState(initial: unknown) { const index = stateCursor++; if (index >= states.length) states[index] = initial; return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; }, useRef(initial: unknown) { const index = refCursor++; return refs[index] ?? (refs[index] = { current: initial }); } };
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "next/link") return { __esModule: true, default: (props: { href: string; children: React.ReactNode }) => React.createElement("a", { href: props.href }, props.children) };
      if (name === "next/navigation") return { useRouter: () => ({ replace: (destination: string) => calls.replaces.push(destination) }) };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale }) };
      if (name === "@/lib/i18n/wallet-setup") return { walletSetupCopy };
      if (name === "@/lib/local-preview") return { isLocalPreview: preview };
      if (name === "@/lib/authRedirect") return redirects;
      if (name === "@/lib/ui/app-navigation") return pureModule("../lib/ui/app-navigation.ts");
      if (name === "@/app/wallet-setup-actions") return { initializeWallet() { const response = deferred<{ ok: boolean; address?: string }>(); calls.initializations.push(response); return response.promise; } };
      if (name === "@/components/ui/TransferMotion") return { __esModule: true, default: (props: { title: string; description: string }) => React.createElement("section", { role: "status" }, props.title, props.description) };
      if (name === "@/components/ui/SuccessMotion") return { __esModule: true, default: (props: { title: string; children: React.ReactNode }) => React.createElement("section", { role: "status" }, props.title, props.children) };
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
      throw new Error(`Unexpected setup screen dependency ${name}`);
    },
  });
  const render = () => { stateCursor = refCursor = 0; return exports.default({ nextPath }); };
  return { calls, render, copy: (key: Parameters<typeof walletSetupCopy>[1]) => walletSetupCopy(locale, key) };
}
function nodes(tree: unknown): React.ReactElement<Record<string, unknown>>[] {
  if (!React.isValidElement<Record<string, unknown>>(tree)) return Array.isArray(tree) ? tree.flatMap(nodes) : [];
  return [tree, ...nodes(tree.props.children)];
}
function button(h: ReturnType<typeof screenHarness>, key: "retry" | "continue") { return nodes(h.render()).find(node => node.type === "button" && node.props.children === h.copy(key))!; }

test("visiting/setup rendering never calls initialization until explicit retry", () => {
  const h = screenHarness(); const html = renderToStaticMarkup(h.render()); assert.ok(html.includes(h.copy("title"))); assert.ok(html.includes(h.copy("unavailable"))); assert.equal(h.calls.initializations.length, 0); assert.equal(h.calls.replaces.length, 0);
});
test("actual wallet setup page awaits URL parameters only, no auth/provision/funding dependency on GET", async () => {
  const exports = {} as { default: (props: { searchParams: Promise<{ next?: string | string[] }> }) => Promise<React.ReactElement<{ nextPath: string }>>; metadata: { title: string } };
  runInNewContext(compile("../app/wallet/setup/page.tsx"), { exports, require(name: string) {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "@/components/screens/WalletSetupScreen") return { __esModule: true, default: "WalletSetupScreen" };
    throw new Error(`Unexpected GET setup dependency ${name}; wallet preparation belongs to explicit retry only`);
  } });
  assert.equal(exports.metadata.title, "Wallet setup · Salapi");
  for (const [value, expected] of [["/send", "/send"], ["/campaigns?create=1", "/campaigns?create=1"], [undefined, "/"], [["/send", "/campaigns"], "/"]] as const) {
    const page = await exports.default({ searchParams: Promise.resolve({ next: Array.isArray(value) ? [...value] : value as string | undefined }) });
    assert.equal(page.props.nextPath, expected);
  }
});
test("rapid retry clicks start one preparation, disable controls and never claim ready while pending", async () => {
  const h = screenHarness(); const click = button(h, "retry").props.onClick as () => Promise<void>; const first = click(), second = click();
  assert.equal(h.calls.initializations.length, 1); assert.equal(button(h, "retry").props.disabled, true);
  const html = renderToStaticMarkup(h.render()); assert.ok(html.includes(h.copy("waiting"))); assert.ok(html.includes(h.copy("checking"))); assert.ok(!html.includes(h.copy("ready"))); assert.equal(button(h, "continue"), undefined);
  h.calls.initializations[0].resolve({ ok: false }); await Promise.all([first, second]); assert.equal(button(h, "retry").props.disabled, false); assert.equal(h.calls.replaces.length, 0);
  assert.match(renderToStaticMarkup(h.render()), /role="alert"/);
});
for (const failsWithThrow of [false, true]) test(`failed retry does not claim wallet ready, then successful retry enables continuation${failsWithThrow ? " after throw" : ""}`, async () => {
  const h = screenHarness({ nextPath: "/campaigns?create=1" }); const first = (button(h, "retry").props.onClick as () => Promise<void>)();
  if (failsWithThrow) h.calls.initializations[0].reject(new Error(`Fixture outage ${secret}`)); else h.calls.initializations[0].resolve({ ok: false }); await first;
  const failed = renderToStaticMarkup(h.render()); assert.ok(failed.includes(h.copy("unavailable"))); assert.ok(!failed.includes(h.copy("ready"))); assert.ok(!failed.includes(secret)); assert.equal(button(h, "continue"), undefined);
  const second = (button(h, "retry").props.onClick as () => Promise<void>)(); h.calls.initializations[1].resolve({ ok: true, address }); await second;
  const html = renderToStaticMarkup(h.render()); assert.ok(html.includes(h.copy("ready"))); assert.ok(html.includes(address)); assert.equal(button(h, "retry"), undefined);
  (button(h, "continue").props.onClick as () => void)(); assert.deepEqual(h.calls.replaces, ["/campaigns?create=1"]);
});
for (const next of ["/send", "/campaigns?create=1", "/circles/tino-relief?tab=updates#latest"]) test(`sign-in and confirmed Continue preserve original destination${next}`, async () => {
  const h = screenHarness({ nextPath: next }); const link = nodes(h.render()).find(node => typeof node.props.href === "string")!; assert.equal(link.props.href, `/signin?next=${encodeURIComponent(next)}`);
  const save = (button(h, "retry").props.onClick as () => Promise<void>)(); h.calls.initializations[0].resolve({ ok: true, address }); await save;
  (button(h, "continue").props.onClick as () => void)(); assert.deepEqual(h.calls.replaces, [next]);
});
for (const next of ["https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/%5Cevil.invalid", "/%2F%2Fevil.invalid", "/%252F%252Fevil.invalid", "/wallet/setup", "/wallet/setup?next=/send", "/wallet/setup#again", "/wallet/setup/", "/x/../wallet/setup?next=/send", "/%77allet/setup"]) test(`setup rejects unsafe or self-target${JSON.stringify(next)}`, async () => {
  const h = screenHarness({ nextPath: next }); const link = nodes(h.render()).find(node => typeof node.props.href === "string")!; assert.equal(link.props.href, "/signin?next=%2F");
  const save = (button(h, "retry").props.onClick as () => Promise<void>)(); h.calls.initializations[0].resolve({ ok: true, address }); await save;
  (button(h, "continue").props.onClick as () => void)(); assert.deepEqual(h.calls.replaces, ["/"]);
});
test("preview UI disables retry and callback guard never invokes initialization", async () => {
  const h = screenHarness({ preview: true }); assert.equal(button(h, "retry").props.disabled, true); await (button(h, "retry").props.onClick as () => Promise<void>)();
  assert.equal(h.calls.initializations.length, 0); assert.ok(renderToStaticMarkup(h.render()).includes(h.copy("preview")));
});
for (const locale of LOCALES) test(`${locale}: initial, waiting, failed and ready copy stay localized`, async () => {
  const h = screenHarness({ locale }); assert.ok(renderToStaticMarkup(h.render()).includes(h.copy("title")));
  const save = (button(h, "retry").props.onClick as () => Promise<void>)(); assert.ok(renderToStaticMarkup(h.render()).includes(h.copy("waiting")));
  h.calls.initializations[0].resolve({ ok: false }); await save; assert.ok(renderToStaticMarkup(h.render()).includes(h.copy("unavailable")));
  const retry = (button(h, "retry").props.onClick as () => Promise<void>)(); h.calls.initializations[1].resolve({ ok: true, address }); await retry;
  assert.ok(renderToStaticMarkup(h.render()).includes(h.copy("ready"))); assert.ok(renderToStaticMarkup(h.render()).includes(h.copy("testnet")));
});
