import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { AuthSessionMissingError, isAuthSessionMissingError } from "@supabase/supabase-js";
import { accountCopy, accountCurrencyName } from "../lib/i18n/revamp-account.ts";
import { LOCALES, LOCALE_META, type Locale } from "../lib/i18n/config.ts";
import { DICTS } from "../lib/i18n/dictionaries.ts";
import { CURRENCY } from "../lib/ui/currency.ts";
import { PREVIEW_WALLET } from "../lib/local-preview.ts";

const source = readFileSync(new URL("../components/screens/SettingsScreen.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const ast = ts.createSourceFile("SettingsScreen.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const screenFunction = ast.statements.find((node): node is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(node) && node.name?.text === "SettingsScreen");
assert.ok(screenFunction?.body, "Tests must exercise the actual SettingsScreen function");
const stateNames = screenFunction.body.statements.flatMap((statement) => {
  if (!ts.isVariableStatement(statement)) return [];
  return statement.declarationList.declarations.flatMap((declaration) => {
    if (!ts.isArrayBindingPattern(declaration.name) || !declaration.initializer || !ts.isCallExpression(declaration.initializer)
      || declaration.initializer.expression.getText(ast) !== "useState") return [];
    const first = declaration.name.elements[0];
    return first && ts.isBindingElement(first) ? [first.name.getText(ast)] : [];
  });
});

type HandleResult = { ok: true; handle: string | null } | { ok: false };
type AuthResult = { data: { user: { email?: string | null } | null }; error?: unknown };
type Effect = () => void | (() => void);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function translate(locale: Locale, key: string): string {
  const value = key.split(".").reduce<unknown>((current, part) =>
    current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined, DICTS[locale]);
  assert.equal(typeof value, "string", `Dictionary key must exist: ${locale}/${key}`);
  return value as string;
}

const forbidden = () => { throw new Error("Unexpected external or mutation boundary"); };

function loadScreen({
  locale = "en", preview = false, configured = true, clientThrows = false, hooks = React,
  settingsHandle = forbidden, walletState = forbidden, getUser = forbidden,
}: {
  locale?: Locale;
  preview?: boolean;
  configured?: boolean;
  clientThrows?: boolean;
  hooks?: typeof React;
  settingsHandle?: () => Promise<HandleResult>;
  walletState?: () => Promise<{ address: string }>;
  getUser?: () => Promise<AuthResult>;
} = {}) {
  const screen = {} as { default: React.ComponentType };
  const box = (props: Record<string, unknown>) => React.createElement("div", null,
    props.children as React.ReactNode);
  const kit = new Proxy({
    T: {}, Ico: new Proxy({}, { get: () => () => null }),
    Avatar: (props: { name: string }) => React.createElement("span", { "data-avatar-name": props.name }),
  }, { get(target, key) { return Reflect.get(target, key) ?? box; } });
  runInNewContext(compiled, {
    exports: screen, fetch: forbidden, window: { location: {} },
    localStorage: { getItem: (key: string) => { assert.equal(key, "salapi_notif"); return null; }, setItem: forbidden },
    require(dependency: string) {
      if (dependency === "react") return hooks;
      if (dependency === "react/jsx-runtime") return jsxRuntime;
      if (dependency === "@supabase/supabase-js") return { isAuthSessionMissingError };
      if (dependency === "next/image") return { default: (props: { alt: string }) => React.createElement("span", null, props.alt) };
      if (dependency === "next/navigation") return { useRouter: () => ({ push: forbidden }) };
      if (dependency === "@/components/I18nProvider") return { useT: () => ({ locale, currency: "en", currencyPref: "en", t: (key: string) => translate(locale, key) }) };
      if (dependency === "@/lib/i18n/revamp-account") return { accountCopy, accountCurrencyName };
      if (dependency === "@/lib/i18n/config") return { LOCALE_META };
      if (dependency === "@/lib/ui/currency") return { CURRENCY };
      if (dependency === "@/lib/local-preview") return { isLocalPreview: preview, PREVIEW_WALLET };
      if (dependency === "@/components/ui/kit") return kit;
      if (dependency === "@/lib/supabase/env") return { supabaseConfigured: () => configured };
      if (dependency === "@/lib/supabase/client") return { createSupabaseBrowser: () => {
        if (clientThrows) throw new AuthSessionMissingError();
        return { auth: { getUser, signOut: forbidden } };
      } };
      if (dependency === "@/app/actions") return { walletState, renameUsername: forbidden, registerUsername: forbidden };
      if (dependency === "@/app/account-actions") return { settingsHandle };
      if (dependency.endsWith(".module.css")) return { default: new Proxy({}, { get: (_, key) => key }) };
      throw new Error(`Unexpected dependency: ${dependency}`);
    },
  });
  return screen.default;
}

// Initial render uses real React hooks and SSR. Transition tests additionally
// control root hook state cells and invoke the exact effect callback captured
// from the actual screen, then SSR its actual JSX. These are unit fixtures,
// not proof of real Supabase authentication or browser/Android E2E behavior.
function harness({ locale = "en", preview = false, configured = true, clientThrows = false }:
  { locale?: Locale; preview?: boolean; configured?: boolean; clientThrows?: boolean } = {}) {
  const identity = deferred<HandleResult>();
  const wallet = deferred<{ address: string }>();
  const auth = deferred<AuthResult>();
  const state: unknown[] = [];
  const refs: { current: unknown }[] = [];
  const changes: string[] = [];
  const calls = { handle: 0, wallet: 0, auth: 0 };
  let root = false;
  let stateCursor = 0;
  let refCursor = 0;
  let capturedEffect: Effect | undefined;
  const hooks = {
    ...React,
    useState(initial: unknown) {
      // The isolated adapter controls root hooks; child SSR uses real hooks.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      if (!root) return React.useState(initial);
      const index = stateCursor++;
      if (index >= state.length) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (next: unknown) => {
        state[index] = typeof next === "function" ? next(state[index]) : next;
        changes.push(stateNames[index]);
      }];
    },
    useRef(initial: unknown) {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      if (!root) return React.useRef(initial);
      const index = refCursor++;
      return refs[index] ?? (refs[index] = { current: initial });
    },
    useEffect(callback: Effect, dependencies?: React.DependencyList) {
      // eslint-disable-next-line react-hooks/rules-of-hooks, react-hooks/exhaustive-deps
      if (!root) return React.useEffect(callback, dependencies);
      capturedEffect = callback;
    },
  } as typeof React;
  const Screen = loadScreen({
    locale, preview, configured, clientThrows, hooks,
    settingsHandle: () => { calls.handle++; return identity.promise; },
    walletState: () => { calls.wallet++; return wallet.promise; },
    getUser: () => { calls.auth++; return auth.promise; },
  });
  function UnitRoot() {
    root = true;
    stateCursor = refCursor = 0;
    try { return (Screen as () => React.ReactNode)(); }
    finally { root = false; }
  }
  const render = () => renderToStaticMarkup(React.createElement(UnitRoot));
  const mount = () => { if (!capturedEffect) render(); return capturedEffect!(); };
  const snapshot = () => Object.fromEntries(stateNames.map((name, index) => [name, state[index]]));
  const beginSignOut = () => { refs[0].current = true; };
  return { identity, wallet, auth, render, mount, snapshot, calls, changes, beginSignOut };
}

async function flush() { for (let step = 0; step < 6; step++) await Promise.resolve(); }

function profileButton(html: string, status: "loading" | "ready" | "error") {
  const button = html.match(new RegExp(`<button\\b[^>]*data-profile-state="${status}"[^>]*>`))?.[0];
  assert.ok(button, `Actual profile must render ${status} state`);
  assert.match(button, new RegExp(`aria-busy="${status === "loading"}"`));
  if (status === "ready") assert.doesNotMatch(button, /\bdisabled=""/);
  else assert.match(button, /\bdisabled=""/);
  return button;
}

function assertNoDefaultIdentity(html: string, locale: Locale = "en") {
  assert.ok(!html.includes(translate(locale, "settings.salapiUser")), "Unresolved identity must not render Salapi user");
  assert.ok(!html.includes(`>${translate(locale, "settings.claim")}<`), "Unresolved identity must not offer Claim");
  assert.doesNotMatch(html, /data-avatar-name=/, "Unresolved identity must use neutral avatar placeholder");
}

for (const locale of LOCALES) {
  test(`${locale}: real React initial SSR is neutral and has no false username Claim`, () => {
    const Screen = loadScreen({ locale });
    const html = renderToStaticMarkup(React.createElement(Screen));
    profileButton(html, "loading");
    assertNoDefaultIdentity(html, locale);
    assert.ok(html.includes(accountCopy(locale).profileLoading));
    assert.ok(html.includes("profileAvatarPlaceholder"));
    assert.ok(html.includes("profileNamePlaceholder"));
  });
}

test("pending identity remains neutral after auth and wallet settle first", async () => {
  const h = harness();
  h.render();
  h.mount();
  assert.deepEqual(h.calls, { handle: 1, wallet: 1, auth: 1 });
  h.auth.resolve({ data: { user: { email: "fixture@example.invalid" } } });
  h.wallet.resolve({ address: PREVIEW_WALLET.address });
  await flush();
  const html = h.render();
  profileButton(html, "loading");
  assertNoDefaultIdentity(html);
  assert.ok(html.includes("fixture@example.invalid"));
  assert.equal(h.snapshot().nameStatus, "loading");
  assert.equal(h.snapshot().authChecked, true);
});

test("verified handle replaces the placeholder without ever offering Claim", async () => {
  const h = harness();
  h.render();
  h.mount();
  h.identity.resolve({ ok: true, handle: "ariqhermawan" });
  await flush();
  const html = h.render();
  profileButton(html, "ready");
  assert.ok(html.includes("@ariqhermawan"));
  assert.match(html, /data-avatar-name="ariqhermawan"/);
  assert.ok(html.includes(`>${translate("en", "settings.change")}<`));
  assert.ok(!html.includes(`>${translate("en", "settings.claim")}<`));
  assert.deepEqual(h.snapshot().name, "ariqhermawan");
});

test("a confirmed no-handle result waits for auth before showing identity or Claim", async () => {
  const h = harness();
  const pending = h.render();
  assertNoDefaultIdentity(pending);
  h.mount();
  h.identity.resolve({ ok: true, handle: null });
  await flush();
  profileButton(h.render(), "loading");
  assertNoDefaultIdentity(h.render());
  h.auth.resolve({ data: { user: null } });
  await flush();
  const html = h.render();
  profileButton(html, "ready");
  assert.ok(html.includes(translate("en", "settings.salapiUser")));
  assert.ok(html.includes(`>${translate("en", "settings.claim")}<`));
  assert.match(html, /data-avatar-name="Salapi"/);
});

for (const locale of LOCALES) {
  test(`${locale}: a signed-in account without a handle displays its verified email and email avatar`, async () => {
    const h = harness({ locale });
    h.render();
    h.mount();
    h.identity.resolve({ ok: true, handle: null });
    h.auth.resolve({ data: { user: { email: "fixture@example.invalid" } }, error: null });
    await flush();
    const html = h.render();
    profileButton(html, "ready");
    assert.match(html, /class="profileName">fixture@example\.invalid<\/span>/);
    assert.match(html, /data-avatar-name="fixture@example\.invalid"/);
    assert.ok(!html.includes(translate(locale, "settings.salapiUser")));
    assert.ok(html.includes(`>${translate(locale, "settings.claim")}<`));
    assert.ok(!html.includes(`>${translate(locale, "signin.signIn")}<`));
  });
}

test("a verified handle takes precedence over a verified email", async () => {
  const h = harness();
  h.render();
  h.mount();
  h.identity.resolve({ ok: true, handle: "ariqhermawan" });
  h.auth.resolve({ data: { user: { email: "fixture@example.invalid" } }, error: null });
  await flush();
  const html = h.render();
  profileButton(html, "ready");
  assert.match(html, /class="profileName">@ariqhermawan<\/span>/);
  assert.match(html, /data-avatar-name="ariqhermawan"/);
  assert.ok(html.includes("fixture@example.invalid"), "The accounts row still shows the verified email");
});

test("email arriving first remains neutral until the handle lookup completes", async () => {
  const h = harness();
  h.render();
  h.mount();
  h.auth.resolve({ data: { user: { email: "fixture@example.invalid" } } });
  await flush();
  profileButton(h.render(), "loading");
  assertNoDefaultIdentity(h.render());
  h.identity.resolve({ ok: true, handle: null });
  await flush();
  profileButton(h.render(), "ready");
  assert.match(h.render(), /class="profileName">fixture@example\.invalid<\/span>/);
});

test("a long verified email is rendered completely and profile CSS permits wrapping", async () => {
  const h = harness();
  const email = `${"long.account.".repeat(5)}fixture@${"long-domain.".repeat(4)}example.invalid`;
  h.render();
  h.mount();
  h.identity.resolve({ ok: true, handle: null });
  h.auth.resolve({ data: { user: { email: ` ${email} ` } } });
  await flush();
  const html = h.render();
  profileButton(html, "ready");
  assert.ok(html.includes(`class="profileName">${email}</span>`));
  assert.ok(html.includes(`data-avatar-name="${email}"`));
  const css = readFileSync(new URL("../components/screens/SettingsRevamp.module.css", import.meta.url), "utf8");
  assert.match(css, /\.profileCopy\s*\{[^}]*min-width:\s*0\s*;/);
  assert.match(css, /\.profileName\s*\{[^}]*overflow-wrap:\s*anywhere\s*;/);
});

for (const failMode of ["error result", "rejected request"] as const) {
  test(`${failMode}: failed auth without a handle stays unavailable, not generic or guest`, async () => {
    const h = harness();
    h.render();
    h.mount();
    h.identity.resolve({ ok: true, handle: null });
    if (failMode === "error result") h.auth.resolve({ data: { user: { email: "untrusted@example.invalid" } }, error: { status: 503 } });
    else h.auth.reject(new Error("Isolated Auth network failure"));
    await flush();
    const html = h.render();
    profileButton(html, "error");
    assertNoDefaultIdentity(html);
    assert.ok(!html.includes("untrusted@example.invalid"));
    assert.ok(!html.includes(`>${translate("en", "signin.signIn")}<`));
    assert.equal(h.snapshot().authFailed, true);
  });
}

for (const email of [undefined, null, "", " "]) {
  test(`a signed-in user with ${JSON.stringify(email)} email stays neutral rather than claiming a generic identity`, async () => {
    const h = harness();
    h.render();
    h.mount();
    h.identity.resolve({ ok: true, handle: null });
    h.auth.resolve({ data: { user: { email } }, error: null });
    await flush();
    profileButton(h.render(), "error");
    assertNoDefaultIdentity(h.render());
  });
}

test("a malformed Auth user result does not become a confirmed guest", async () => {
  const h = harness();
  h.render();
  h.mount();
  h.identity.resolve({ ok: true, handle: null });
  h.auth.resolve({ data: { user: undefined } } as unknown as AuthResult);
  await flush();
  profileButton(h.render(), "error");
  assertNoDefaultIdentity(h.render());
  assert.equal(h.snapshot().authFailed, true);
});

for (const missingMode of ["error result", "rejected request"] as const) {
  test(`${missingMode}: an explicit missing session is a confirmed guest`, async () => {
    const h = harness();
    h.render();
    h.mount();
    h.identity.resolve({ ok: true, handle: null });
    if (missingMode === "error result") h.auth.resolve({ data: { user: null }, error: new AuthSessionMissingError() });
    else h.auth.reject(new AuthSessionMissingError());
    await flush();
    profileButton(h.render(), "ready");
    assert.ok(h.render().includes(translate("en", "settings.salapiUser")));
    assert.ok(h.render().includes(`>${translate("en", "signin.signIn")}<`));
    assert.equal(h.snapshot().authFailed, false);
  });
}

test("client setup failure is unavailable even if the thrown class resembles a missing session", async () => {
  const h = harness({ clientThrows: true });
  h.render();
  h.mount();
  h.identity.resolve({ ok: true, handle: null });
  await flush();
  profileButton(h.render(), "error");
  assertNoDefaultIdentity(h.render());
  assert.equal(h.snapshot().authFailed, true);
});

for (const locale of LOCALES) {
  test(`${locale}: structured identity failure is unavailable, not a missing username`, async () => {
    const h = harness({ locale });
    h.render();
    h.mount();
    h.identity.resolve({ ok: false });
    await flush();
    const html = h.render();
    profileButton(html, "error");
    assertNoDefaultIdentity(html, locale);
    assert.ok(html.includes(accountCopy(locale).profileUnavailable));
    assert.ok(html.includes(accountCopy(locale).usernameLoad));
    assert.match(html, /role="alert"/);
    assert.equal(h.snapshot().nameStatus, "error");
  });
}

test("rejected identity lookup leaves an explicit error and no Claim action", async () => {
  const h = harness();
  h.render();
  h.mount();
  h.identity.reject(new Error("Isolated action transport failure"));
  await flush();
  const html = h.render();
  profileButton(html, "error");
  assertNoDefaultIdentity(html);
  assert.equal(h.snapshot().loadError, "usernameLoad");
});

test("wallet failure does not overwrite a verified username or restore generic profile", async () => {
  const h = harness();
  h.render();
  h.mount();
  h.identity.resolve({ ok: true, handle: "ariqhermawan" });
  h.wallet.reject(new Error("Isolated wallet failure"));
  await flush();
  const html = h.render();
  profileButton(html, "ready");
  assert.ok(html.includes("@ariqhermawan"));
  assert.ok(!html.includes(translate("en", "settings.salapiUser")));
  assert.equal(h.snapshot().loadError, "settingsWalletLoad");
});

test("auth rejection cannot settle or overwrite independently verified identity", async () => {
  const h = harness();
  h.render();
  h.mount();
  h.auth.reject(new Error("Isolated browser auth lookup failure"));
  await flush();
  const pending = h.render();
  profileButton(pending, "loading");
  assertNoDefaultIdentity(pending);
  h.identity.resolve({ ok: true, handle: "ariqhermawan" });
  await flush();
  profileButton(h.render(), "ready");
  assert.equal(h.snapshot().name, "ariqhermawan");
});

test("unmount prevents all stale fulfilled callbacks from changing component state", async () => {
  const h = harness();
  h.render();
  const cleanup = h.mount();
  assert.equal(typeof cleanup, "function");
  cleanup!();
  const before = h.snapshot();
  h.identity.resolve({ ok: true, handle: "old_identity" });
  h.wallet.resolve({ address: "old_wallet" });
  h.auth.resolve({ data: { user: { email: "old@example.invalid" } } });
  await flush();
  assert.deepEqual(h.snapshot(), before);
  assert.deepEqual(h.changes, []);
});

test("sign-out in flight suppresses late account, handle and wallet results before document unload", async () => {
  const h = harness();
  h.render();
  h.mount();
  await flush();
  h.changes.length = 0;
  h.beginSignOut();
  const before = h.snapshot();
  h.identity.resolve({ ok: true, handle: "stale_identity" });
  h.wallet.resolve({ address: "stale_wallet" });
  h.auth.resolve({ data: { user: { email: "stale@example.invalid" } } });
  await flush();
  assert.deepEqual(h.snapshot(), before);
  assert.deepEqual(h.changes, []);
});

test("sign-out in flight suppresses late account failures", async () => {
  const h = harness();
  h.render();
  h.mount();
  await flush();
  h.changes.length = 0;
  h.beginSignOut();
  const before = h.snapshot();
  h.identity.reject(new Error("Old identity rejection"));
  h.wallet.reject(new Error("Old wallet rejection"));
  h.auth.reject(new Error("Old auth rejection"));
  await flush();
  assert.deepEqual(h.snapshot(), before);
  assert.deepEqual(h.changes, []);
});

test("unmount prevents stale failed callbacks from exposing errors on another section", async () => {
  const h = harness();
  h.render();
  const cleanup = h.mount();
  cleanup!();
  const before = h.snapshot();
  h.identity.reject(new Error("Old identity rejection"));
  h.wallet.reject(new Error("Old wallet rejection"));
  h.auth.reject(new Error("Old auth rejection"));
  await flush();
  assert.deepEqual(h.snapshot(), before);
  assert.deepEqual(h.changes, []);
});

test("effect cleanup followed by a fresh mount still permits the active result", async () => {
  const h = harness();
  h.render();
  const oldCleanup = h.mount();
  oldCleanup!();
  h.mount();
  h.identity.resolve({ ok: true, handle: "active_identity" });
  await flush();
  assert.equal(h.snapshot().name, "active_identity");
  assert.equal(h.changes.filter(name => name === "name").length, 1);
  profileButton(h.render(), "ready");
});

test("preview identity is immediately ready and invokes no real handle, wallet or auth lookup", async () => {
  const Screen = loadScreen({ preview: true });
  const initial = renderToStaticMarkup(React.createElement(Screen));
  profileButton(initial, "ready");
  assert.ok(initial.includes(`@${PREVIEW_WALLET.handle}`));
  const h = harness({ preview: true });
  h.render();
  h.mount();
  await flush();
  assert.deepEqual(h.calls, { handle: 0, wallet: 0, auth: 0 });
  assert.equal(h.snapshot().nameStatus, "ready");
  assert.equal(h.snapshot().name, PREVIEW_WALLET.handle);
});
