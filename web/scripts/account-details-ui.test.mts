import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { accountDetailsCopy } from "../lib/i18n/account-details.ts";
import { accountPhotoCopy } from "../lib/i18n/account-photo.ts";
import { LOCALES, type Locale } from "../lib/i18n/config.ts";
import type { AccountDetails, AccountDetailsResult, ReceiptPhotoResult } from "../lib/account-details.ts";
import type { AccountPhoto } from "../lib/account-photo.ts";

const ownerId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const publicKey = "GCUBT6T7SMQKJE5L2TJLUQQPSBBU5GVHALGLWWECEJUIV2YFFCSXGHY7";
const profile = (id = ownerId): AccountPhoto => ({ ownerId: id, email: "fixture@example.invalid", photoUrl: null, googlePhotoUrl: null, source: "google" });
const account = (id = ownerId, enabled = false): AccountDetails => ({ ownerId: id, email: `${id === ownerId ? "fixture" : "other"}@example.invalid`,
  address: publicKey, handle: "fixture_user", receiptPhotoConsent: enabled, identityUnavailable: false });
const forbidden = () => { throw Error("External boundary forbidden in isolated Account Details UI tests"); };
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let n = 0; n < 15; n++) await Promise.resolve(); }
type Effect = { deps: readonly unknown[]; callback: () => void | (() => void); cleanup?: () => void };
type PhotoState = { status: "ready" | "loading" | "error"; profile: AccountPhoto | null; pending: boolean };

// A small hooks adapter executes the real screen's handlers/effects. The real
// photo editor and React SSR render its returned JSX. Auth/action boundaries
// alone are fixtures; these checks are not browser or Supabase E2E evidence.
function setup({ locale = "en", initialPhoto = { status: "ready", profile: profile(), pending: false } }:
  { locale?: Locale; initialPhoto?: PhotoState } = {}) {
  let photo = initialPhoto;
  const cells: unknown[] = []; const effects = new Map<number, Effect>(); const scheduled = new Map<number, Effect>();
  const reads: { owner: string; result: ReturnType<typeof deferred<AccountDetailsResult>> }[] = [];
  const writes: { owner: string; enabled: boolean; result: ReturnType<typeof deferred<ReceiptPhotoResult>> }[] = [];
  const calls = { reloads: 0, backs: 0 }; let cursor = 0;
  const hooks = {
    useState(initial: unknown) {
      const n = cursor++; if (!(n in cells)) cells[n] = typeof initial === "function" ? initial() : initial;
      return [cells[n], (value: unknown) => { cells[n] = typeof value === "function" ? value(cells[n]) : value; }];
    },
    useRef(initial: unknown) { const n = cursor++; return cells[n] ?? (cells[n] = { current: initial }); },
    useCallback(callback: unknown, deps: readonly unknown[]) {
      const n = cursor++; const previous = cells[n] as { callback: unknown; deps: readonly unknown[] } | undefined;
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) cells[n] = { callback, deps };
      return (cells[n] as { callback: unknown }).callback;
    },
    useEffect(callback: Effect["callback"], deps: readonly unknown[]) {
      const n = cursor++; const previous = effects.get(n);
      if (!previous || deps.length !== previous.deps.length || deps.some((value, i) => !Object.is(value, previous.deps[i])))
        scheduled.set(n, { callback, deps });
    },
    useTransition() {
      const n = cursor++; const cell = (cells[n] ??= { pending: 0 }) as { pending: number };
      return [cell.pending > 0, (callback: () => unknown) => {
        cell.pending++;
        try {
          const result = callback();
          if (result && typeof (result as Promise<unknown>).then === "function")
            void (result as Promise<unknown>).finally(() => { cell.pending--; });
          else cell.pending--;
        } catch (error) { cell.pending--; throw error; }
      }];
    },
  };
  const Editor = {} as { default: React.ComponentType<Record<string, unknown>> };
  runInNewContext(compile("../components/AccountPhotoEditor.tsx"), { exports: Editor, require(name: string) {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "@/components/I18nProvider") return { useT: () => ({ locale }) };
    if (name === "@/lib/i18n/account-photo") return { accountPhotoCopy };
    if (name === "./AccountAvatar") return { __esModule: true, default: () => React.createElement("span", { "data-account-avatar": true }) };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    throw Error(`Unexpected editor dependency ${name}`);
  } });
  const Screen = {} as { default: () => React.ReactElement };
  runInNewContext(compile("../components/screens/AccountDetailsScreen.tsx"), { exports: Screen, require(name: string) {
    if (name === "react") return hooks;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "next/link") return { __esModule: true, default: (props: { href: string; children: React.ReactNode }) => React.createElement("a", { href: props.href }, props.children) };
    if (name === "@/app/account-details-actions") return {
      accountDetails(owner: string) { const result = deferred<AccountDetailsResult>(); reads.push({ owner, result }); return result.promise; },
      setReceiptPhotoConsent(owner: string, enabled: boolean) { const result = deferred<ReceiptPhotoResult>(); writes.push({ owner, enabled, result }); return result.promise; },
    };
    if (name === "@/lib/i18n/account-details") return { accountDetailsCopy };
    if (name === "@/components/I18nProvider") return { useT: () => ({ locale }) };
    if (name === "@/components/useAccountPhoto") return { useAccountPhoto: () => ({ ...photo, code: null, message: null,
      reload() { calls.reloads++; }, upload: forbidden, restore: forbidden }) };
    if (name === "@/components/AccountPhotoEditor") return { __esModule: true, default: Editor.default };
    if (name === "@/lib/ui/useGoBack") return { useGoBack(fallback: string) { assert.equal(fallback, "/settings"); return () => { calls.backs++; }; } };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    throw Error(`Unexpected Account Details dependency ${name}`);
  } });
  function render(runEffects = true) {
    cursor = 0; const tree = Screen.default();
    if (runEffects) {
      const waiting = [...scheduled.entries()]; scheduled.clear();
      for (const [n, effect] of waiting) { effects.get(n)?.cleanup?.(); effects.set(n, { ...effect, cleanup: effect.callback() || undefined }); }
    }
    return tree;
  }
  function nodes(node: unknown): React.ReactElement<Record<string, unknown>>[] {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!React.isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...nodes(node.props.children)];
  }
  const html = () => renderToStaticMarkup(render());
  const checkbox = () => {
    const result = nodes(render()).find(node => node.type === "input" && node.props.type === "checkbox");
    assert.ok(result, "Actual native privacy checkbox must exist"); return result;
  };
  const clickRetry = () => {
    const result = nodes(render()).find(node => node.type === "button" && node.props.children === accountDetailsCopy(locale).retry);
    assert.ok(result, "Actual retry control must exist"); (result.props.onClick as () => void)();
  };
  return { render, html, nodes, checkbox, clickRetry, reads, writes, calls,
    setPhoto(next: typeof photo) { photo = next; }, cleanup() { for (const effect of effects.values()) effect.cleanup?.(); },
  };
}
async function ready(h: ReturnType<typeof setup>, value = account()) {
  h.render(); assert.equal(h.reads.length, 1); h.reads[0].result.resolve({ ok: true, account: value }); await flush(); h.render();
}
const change = (input: React.ReactElement<Record<string, unknown>>, enabled: boolean) =>
  (input.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: enabled } });

test("loading and confirmed guest stay neutral without reading or exposing any account", () => {
  for (const status of ["loading", "ready"] as const) {
    const h = setup({ initialPhoto: { status, profile: null, pending: false } }); const html = h.html();
    assert.equal(h.reads.length, 0); assert.doesNotMatch(html, /type="checkbox"|fixture@example|type="file"/);
    if (status === "loading") assert.ok(html.includes(accountDetailsCopy("en").loading));
    else assert.match(html, /href="\/signin"/);
  }
});

test("photo failure offers real retry without inventing an owner or exposing account details", () => {
  const h = setup({ initialPhoto: { status: "error", profile: null, pending: false } });
  assert.match(h.html(), /role="alert"/); h.clickRetry(); assert.equal(h.calls.reloads, 1); assert.equal(h.reads.length, 0);
});

for (const locale of LOCALES) {
  test(`${locale}: actual screen renders owner identity, one photo editor and native false-default checkbox`, async () => {
    const h = setup({ locale }); h.render(); assert.equal(h.reads[0].owner, ownerId);
    assert.doesNotMatch(h.html(), /type="checkbox"/); h.reads[0].result.resolve({ ok: true, account: account() }); await flush();
    const html = h.html(); assert.ok(html.includes(accountDetailsCopy(locale).title)); assert.ok(html.includes(accountDetailsCopy(locale).shareHint));
    assert.equal(h.checkbox().props.checked, false); assert.equal(h.checkbox().props.disabled, false);
    assert.equal((html.match(/type="file"/g) ?? []).length, 1); assert.match(html, /fixture@example\.invalid/);
    assert.match(html, /@fixture_user/); assert.match(html, /rel="noopener noreferrer"/); assert.match(html, /href="\/settings"/);
    assert.match(html, /href="\/you\/kyc-tier"/); assert.doesNotMatch(html, /localStorage|sessionStorage/);
  });
}

test("partial wallet identity keeps consent available and never fabricates a wallet link", async () => {
  const h = setup(); await ready(h, { ...account(), address: null, handle: null, identityUnavailable: true });
  const html = h.html(); assert.ok(html.includes(accountDetailsCopy("en").identityUnavailable));
  assert.equal(h.checkbox().props.checked, false); assert.doesNotMatch(html, /href="https:\/\/stellar\.expert/);
});

test("toggle signs only the reviewed owner, blocks duplicate writes and waits for persistence confirmation", async () => {
  const h = setup(); await ready(h); const input = h.checkbox(); change(input, true); change(input, true);
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].owner, ownerId); assert.equal(h.writes[0].enabled, true);
  assert.equal(h.checkbox().props.checked, false); assert.equal(h.checkbox().props.disabled, true);
  assert.ok(!h.html().includes(accountDetailsCopy("en").saved));
  assert.match(h.html(), /type="file"[^>]*disabled=""/);
  h.writes[0].result.resolve({ ok: true, ownerId, enabled: true }); await flush();
  assert.equal(h.checkbox().props.checked, true); assert.equal(h.checkbox().props.disabled, false); assert.ok(h.html().includes(accountDetailsCopy("en").saved));
  change(h.checkbox(), false); h.writes[1].result.resolve({ ok: true, ownerId, enabled: false }); await flush(); assert.equal(h.checkbox().props.checked, false);
});

for (const result of [{ ok: false, code: "save_failed" }, { ok: true, ownerId: otherId, enabled: true }, { ok: true, ownerId, enabled: false }] as ReceiptPhotoResult[]) {
  test(`unconfirmed consent response retains the previous preference and reports failure: ${JSON.stringify(result)}`, async () => {
    const h = setup(); await ready(h); change(h.checkbox(), true); h.writes[0].result.resolve(result); await flush();
    assert.equal(h.checkbox().props.checked, false); const html = h.html(); assert.ok(html.includes(accountDetailsCopy("en").saveError));
    assert.ok(!html.includes(accountDetailsCopy("en").saved)); assert.match(html, /role="alert"/);
    h.clickRetry(); assert.equal(h.reads.length, 2); assert.doesNotMatch(h.html(), /type="checkbox"/);
    h.reads[1].result.resolve({ ok: true, account: account(ownerId, true) }); await flush(); assert.equal(h.checkbox().props.checked, true);
  });
}

test("transport rejection never announces a successful preference save", async () => {
  const h = setup(); await ready(h); change(h.checkbox(), true); h.writes[0].result.reject(Error("Network fixture failed")); await flush();
  assert.equal(h.checkbox().props.checked, false); assert.ok(h.html().includes(accountDetailsCopy("en").saveError));
});

test("an account-photo mutation disables consent and suppresses stale checkbox handlers", async () => {
  const h = setup(); await ready(h); h.setPhoto({ status: "ready", profile: profile(), pending: true });
  const input = h.checkbox(); assert.equal(input.props.disabled, true); change(input, true); assert.equal(h.writes.length, 0);
});

test("owner switch hides previous identity immediately and drops the delayed previous-account read", async () => {
  const h = setup(); h.render(); h.setPhoto({ status: "ready", profile: profile(otherId), pending: false });
  const beforeEffect = renderToStaticMarkup(h.render(false)); assert.doesNotMatch(beforeEffect, /fixture@example|type="checkbox"/);
  h.render(); assert.equal(h.reads[1].owner, otherId);
  h.reads[1].result.resolve({ ok: true, account: account(otherId) }); await flush();
  h.reads[0].result.resolve({ ok: true, account: account() }); await flush();
  assert.match(h.html(), /other@example\.invalid/); assert.doesNotMatch(h.html(), /fixture@example\.invalid/);
});

test("late save from an old owner cannot enable the new account's preference or show saved feedback", async () => {
  const h = setup(); await ready(h); change(h.checkbox(), true);
  h.setPhoto({ status: "ready", profile: profile(otherId), pending: false }); h.render();
  h.reads[1].result.resolve({ ok: true, account: account(otherId) }); await flush();
  h.writes[0].result.resolve({ ok: true, ownerId, enabled: true }); await flush();
  assert.equal(h.checkbox().props.checked, false); assert.match(h.html(), /other@example\.invalid/);
  assert.ok(!h.html().includes(accountDetailsCopy("en").saved));
});

test("signout hides the account immediately and ignores late consent confirmation", async () => {
  const h = setup(); await ready(h); change(h.checkbox(), true);
  h.setPhoto({ status: "ready", profile: null, pending: false }); h.render();
  h.writes[0].result.resolve({ ok: true, ownerId, enabled: true }); await flush();
  assert.doesNotMatch(h.html(), /fixture@example|type="checkbox"/); assert.match(h.html(), /href="\/signin"/);
});

test("mismatched read owner or rejected read shows an honest error and retry", async () => {
  for (const mismatch of [true, false]) {
    const h = setup(); h.render();
    if (mismatch) h.reads[0].result.resolve({ ok: true, account: account(otherId) });
    else h.reads[0].result.reject(Error("Network fixture failed"));
    await flush(); assert.match(h.html(), /role="alert"/); assert.doesNotMatch(h.html(), /other@example|type="checkbox"/);
    h.clickRetry(); assert.equal(h.reads.length, 2); assert.equal(h.reads[1].owner, ownerId);
    h.reads[1].result.resolve({ ok: true, account: account() }); await flush(); assert.equal(h.checkbox().props.checked, false);
  }
});

test("unmount invalidates delayed reads and saves instead of announcing stale success", async () => {
  const h = setup(); await ready(h); change(h.checkbox(), true); h.cleanup();
  h.writes[0].result.resolve({ ok: true, ownerId, enabled: true }); await flush();
  assert.equal(h.checkbox().props.checked, false); assert.ok(!h.html().includes(accountDetailsCopy("en").saved));
  const unread = setup(); unread.render(); unread.cleanup(); unread.reads[0].result.resolve({ ok: true, account: account() }); await flush();
  assert.doesNotMatch(unread.html(), /type="checkbox"/);
});

test("the actual route exports Account Details, while Settings contains no redundant photo editor", () => {
  const exports = {} as { default: () => React.ReactElement; metadata: { title: string } };
  const marker = () => React.createElement("div", null, "Actual Account Details route fixture");
  runInNewContext(compile("../app/settings/account/page.tsx"), { exports, require(name: string) {
    if (name === "react/jsx-runtime") return jsxRuntime;
    assert.equal(name, "@/components/screens/AccountDetailsScreen"); return { __esModule: true, default: marker };
  } });
  assert.equal(exports.default().type, marker); assert.match(exports.metadata.title, /Account details/);
  assert.doesNotMatch(readFileSync(new URL("../components/screens/SettingsScreen.tsx", import.meta.url), "utf8"), /<AccountPhotoEditor\b|import AccountPhotoEditor/);
});
