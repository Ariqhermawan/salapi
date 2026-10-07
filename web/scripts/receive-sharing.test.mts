import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { StrKey } from "@stellar/stellar-sdk";
import { receiveDestination, receiveShareData } from "../lib/receive.ts";
import { receiveCopy } from "../lib/i18n/receive.ts";
import { moneyCopy, moneyMessage } from "../lib/i18n/revamp-money.ts";
import { DICTS } from "../lib/i18n/dictionaries.ts";
import { LOCALES, type Locale } from "../lib/i18n/config.ts";
import type { AccountDetailsResult } from "../lib/account-details.ts";

const ownerId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const address = "GCUBT6T7SMQKJE5L2TJLUQQPSBBU5GVHALGLWWECEJUIV2YFFCSXGHY7";
const otherAddress = "GAVWJIZ45MHV2KWBHNBBB7YHU5CPTIDD3YONC4ZNP7IGE6Z3C777OV4H";
const account = (handle: string | null = "fixture_user", id = ownerId, publicKey: string | null = address): AccountDetailsResult => ({ ok: true,
  account: { ownerId: id, email: "private@example.invalid", address: publicKey, handle, receiptPhotoConsent: false, identityUnavailable: false } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let n = 0; n < 12; n++) await Promise.resolve(); }
type Effect = { deps: readonly unknown[]; callback: () => void | (() => void); cleanup?: () => void };
type AuthListener = (event: string, session: { user: { id: string } } | null) => void;
type Share = (data: ShareData) => Promise<void>;

// Execute the actual screen handlers/effects and render returned JSX through
// React. Auth, server reads and browser APIs alone are isolated fixtures.
function setup(options: { locale?: Locale; configured?: boolean; share?: Share; copy?: (value: string) => Promise<void> } = {}) {
  const locale = options.locale ?? "en";
  const cells: unknown[] = [];
  const effects = new Map<number, Effect>();
  const scheduled = new Map<number, Effect>();
  const reads: { owner: string; result: ReturnType<typeof deferred<AccountDetailsResult>> }[] = [];
  const user = deferred<{ data: { user: { id: string } | null }; error: { name: string } | null }>();
  const calls = { shares: [] as ShareData[], copies: [] as string[], auth: 0, unsubscribed: 0 };
  let listener: AuthListener = () => {};
  let cursor = 0;
  const hooks = {
    useState(initial: unknown) {
      const n = cursor++;
      if (!(n in cells)) cells[n] = typeof initial === "function" ? initial() : initial;
      return [cells[n], (value: unknown) => { cells[n] = typeof value === "function" ? value(cells[n]) : value; }];
    },
    useRef(initial: unknown) { const n = cursor++; return cells[n] ?? (cells[n] = { current: initial }); },
    useEffect(callback: Effect["callback"], deps: readonly unknown[]) {
      const n = cursor++;
      const previous = effects.get(n);
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) scheduled.set(n, { callback, deps });
    },
  };
  const translated = (key: string) => key.split(".").reduce<unknown>((current, part) => current && typeof current === "object"
    ? (current as Record<string, unknown>)[part] : undefined, DICTS[locale]) as string;
  const source = ts.transpileModule(readFileSync(new URL("../components/screens/ReceiveScreen.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const Screen = {} as { default: () => React.ReactElement };
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  runInNewContext(source, { exports: Screen, Promise, URL, DOMException, queueMicrotask,
    setTimeout(callback: () => void) { const timer = ++nextTimer; timers.set(timer, callback); return timer; },
    clearTimeout(timer: number) { timers.delete(timer); },
    navigator: {
      ...(options.share ? { async share(data: ShareData) { calls.shares.push(data); await options.share!(data); } } : {}),
      clipboard: { async writeText(value: string) { calls.copies.push(value); await options.copy?.(value); } },
    },
    require(name: string) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "next/link") return { __esModule: true, default: (props: { href: string; children: React.ReactNode }) => React.createElement("a", { href: props.href }, props.children) };
      if (name === "qrcode.react") return { QRCodeSVG: (props: { value: string }) => React.createElement("svg", { "data-qr-value": props.value }) };
      if (name === "@/app/account-details-actions") return { accountDetails(owner: string) { const result = deferred<AccountDetailsResult>(); reads.push({ owner, result }); return result.promise; } };
      if (name === "@/lib/supabase/env") return { supabaseConfigured: () => options.configured ?? true };
      if (name === "@/lib/supabase/client") return { createSupabaseBrowser() { calls.auth++; return { auth: {
        getUser: () => user.promise,
        onAuthStateChange(callback: AuthListener) { listener = callback; return { data: { subscription: { unsubscribe() { calls.unsubscribed++; } } } }; },
      } }; } };
      if (name === "@/lib/receive") return { receiveDestination, receiveShareData };
      if (name === "@/lib/i18n/receive") return { receiveCopy };
      if (name === "@/lib/i18n/revamp-money") return { moneyCopy, moneyMessage };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale, t: translated }) };
      if (name === "@/lib/ui/useGoBack") return { useGoBack: () => () => {} };
      if (name === "@/lib/local-preview") return { isLocalPreview: false };
      if (name === "@/components/ui/kit") return {
        T: {}, Ico: { back: () => null, check: () => null }, PoweredByStellar: () => null,
        AppBar: (props: { title: string }) => React.createElement("h1", {}, props.title),
        IconButton: (props: { ariaLabel: string }) => React.createElement("button", { "aria-label": props.ariaLabel }),
        Btn: (props: { children: React.ReactNode; disabled: boolean; onClick: () => void }) => React.createElement("button", { disabled: props.disabled, onClick: props.onClick }, props.children),
      };
      throw Error(`Unexpected Receive dependency ${name}`);
    },
  });
  function render() {
    cursor = 0;
    const tree = Screen.default();
    for (const [n, effect] of scheduled) { effects.get(n)?.cleanup?.(); effect.cleanup = effect.callback() ?? undefined; effects.set(n, effect); }
    scheduled.clear();
    return tree;
  }
  function nodes(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!React.isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...nodes(node.props.children as React.ReactNode)];
  }
  function shareButton() { const button = nodes(render()).find(node => node.props.onClick && node.props.kind === "primary"); assert.ok(button); return button; }
  return { render, reads, user, calls, html: () => renderToStaticMarkup(render()), shareButton,
    async share() { const button = shareButton(); assert.equal(button.props.disabled, false); await (button.props.onClick as () => Promise<void>)(); },
    auth(event: string, id: string | null) { listener(event, id ? { user: { id } } : null); },
    timers,
    cleanup() { for (const effect of effects.values()) effect.cleanup?.(); },
  };
}
async function ready(h: ReturnType<typeof setup>, value = account()) {
  h.render(); h.user.resolve({ data: { user: { id: ownerId } }, error: null }); await flush();
  assert.equal(h.reads[0].owner, ownerId); h.reads[0].result.resolve(value); await flush();
}

test("username builds a valid Send URL; public address is QR/copy text and never a share URL", () => {
  assert.equal(StrKey.isValidEd25519PublicKey(address), true);
  const handle = receiveDestination(address, "fixture_user", "https://salapi.app");
  assert.deepEqual(handle, { kind: "username", value: "https://salapi.app/send?to=fixture_user", display: "@fixture_user" });
  assert.deepEqual(receiveShareData(handle!, "Testnet XLM"), { title: "Salapi", text: "Testnet XLM", url: handle!.value });
  const raw = receiveDestination(address, null, "https://salapi.app");
  assert.deepEqual(raw, { kind: "address", value: address, display: address });
  assert.deepEqual(receiveShareData(raw!, "Testnet XLM"), { title: "Salapi", text: `Testnet XLM\n${address}` });
  assert.equal("url" in receiveShareData(raw!, "Testnet XLM"), false);
  assert.equal(receiveDestination(null, "fixture_user", "https://salapi.app"), null);
  for (const invalid of ["", "not-an-address", "S" + "A".repeat(55)]) assert.equal(receiveDestination(invalid, "fixture_user", "https://salapi.app"), null);
  assert.equal(receiveDestination(address, "bad?handle", "https://salapi.app")?.kind, "address");
  assert.equal(receiveDestination(address, "fixture_user", "javascript:alert(1)"), null);
});

for (const locale of LOCALES) {
  test(`${locale}: actual username share uses Testnet copy and URL without private account details`, async () => {
    const h = setup({ locale, share: async () => {} }); await ready(h); const html = h.html();
    assert.match(html, /data-qr-value="https:\/\/salapi\.app\/send\?to=fixture_user"/);
    assert.doesNotMatch(html, /private@example|peso/i); await h.share();
    assert.deepEqual(h.calls.shares, [{ title: "Salapi", text: receiveCopy(locale).usernameCaption, url: "https://salapi.app/send?to=fixture_user" }]);
    assert.deepEqual(h.calls.copies, []); h.cleanup();
  });
  test(`${locale}: no-handle share uses the complete public address as text and exposes manual-copy guidance`, async () => {
    const h = setup({ locale, share: async () => {} }); await ready(h, account(null)); const html = h.html();
    assert.ok(html.includes(address)); assert.ok(html.includes(receiveCopy(locale).addressHint));
    assert.ok(html.includes(receiveCopy(locale).addressScan)); assert.match(html, new RegExp(`data-qr-value="${address}"`));
    assert.doesNotMatch(html, /send\?to=|salapi\.app\/[A-Z2-7]{56}/); await h.share();
    assert.deepEqual(h.calls.shares, [{ title: "Salapi", text: `${receiveCopy(locale).addressCaption}\n${address}` }]);
    assert.equal("url" in h.calls.shares[0], false); h.cleanup();
  });
}

test("clipboard fallback copies the exact username URL or full public address", async () => {
  for (const handle of ["fixture_user", null]) {
    const h = setup(); await ready(h, account(handle)); await h.share();
    assert.deepEqual(h.calls.copies, [handle ? "https://salapi.app/send?to=fixture_user" : address]);
    assert.ok(h.html().includes("Copied")); h.cleanup();
  }
});
test("unsupported share falls back to clipboard; cancellation does not copy", async () => {
  const failed = setup({ share: async () => { throw new DOMException("Unsupported", "NotSupportedError"); } });
  await ready(failed, account(null)); await failed.share(); assert.deepEqual(failed.calls.copies, [address]); failed.cleanup();
  const cancelled = setup({ share: async () => { throw new DOMException("Cancelled", "AbortError"); } });
  await ready(cancelled); await cancelled.share(); assert.deepEqual(cancelled.calls.copies, []); assert.equal(cancelled.timers.size, 0); cancelled.cleanup();
});
test("clipboard failure renders an honest localized alert without claiming success", async () => {
  const h = setup({ locale: "id", copy: async () => { throw Error("Denied"); } }); await ready(h, account(null)); await h.share();
  assert.ok(h.html().includes(receiveCopy("id").shareUnavailable)); assert.match(h.html(), /role="alert"/); assert.equal(h.timers.size, 0); h.cleanup();
});
test("guests and unconfigured sessions have no wallet read, QR or enabled share and preserve sign-in return path", async () => {
  for (const configured of [true, false]) {
    const h = setup({ configured }); h.render(); h.user.resolve({ data: { user: null }, error: null }); await flush();
    const html = h.html(); assert.ok(html.includes(receiveCopy("en").guest)); assert.match(html, /href="\/signin\?next=%2Freceive"/);
    assert.doesNotMatch(html, /data-qr-value|fixture_user|private@example/); assert.equal(h.shareButton().props.disabled, true); assert.equal(h.reads.length, 0); h.cleanup();
  }
});
test("unavailable auth and wallet reads never invent a guest or a public receive destination", async () => {
  const auth = setup(); auth.render(); auth.user.resolve({ data: { user: null }, error: { name: "NetworkError" } }); await flush();
  assert.match(auth.html(), /role="alert"/); assert.ok(!auth.html().includes(receiveCopy("en").guest)); assert.equal(auth.reads.length, 0); auth.cleanup();
  for (const result of [{ ok: false, code: "unavailable" }, account("fixture_user", otherId), account(null, ownerId, "bad-address")] as AccountDetailsResult[]) {
    const h = setup(); await ready(h, result); assert.match(h.html(), /role="alert"/); assert.doesNotMatch(h.html(), /data-qr-value|fixture_user/); assert.equal(h.shareButton().props.disabled, true); h.cleanup();
  }
});
test("a verified owner without a saved wallet sees preparation guidance and no fabricated destination", async () => {
  const h = setup(); await ready(h, account(null, ownerId, null)); assert.ok(h.html().includes(receiveCopy("en").noWallet));
  assert.doesNotMatch(h.html(), /data-qr-value/); assert.equal(h.shareButton().props.disabled, true); h.cleanup();
});
test("sign-out and account switch immediately erase the old destination and ignore old reads", async () => {
  const h = setup(); h.render(); h.user.resolve({ data: { user: { id: ownerId } }, error: null }); await flush();
  h.auth("SIGNED_IN", otherId); assert.doesNotMatch(h.html(), /data-qr-value|fixture_user/); await flush();
  assert.equal(h.reads[1].owner, otherId); h.reads[0].result.resolve(account()); await flush(); assert.doesNotMatch(h.html(), /fixture_user/);
  h.reads[1].result.resolve(account("second_user", otherId, otherAddress)); await flush(); assert.match(h.html(), /second_user/);
  h.auth("SIGNED_OUT", null); assert.doesNotMatch(h.html(), /data-qr-value|second_user/); assert.equal(h.shareButton().props.disabled, true); h.cleanup();
});
test("late initial auth and unmounted reads do not restore a previous wallet", async () => {
  const h = setup(); h.render(); h.auth("SIGNED_OUT", null); h.user.resolve({ data: { user: { id: ownerId } }, error: null }); await flush();
  assert.equal(h.reads.length, 0); assert.ok(h.html().includes(receiveCopy("en").guest)); h.cleanup();
  const pending = setup(); pending.render(); pending.user.resolve({ data: { user: { id: ownerId } }, error: null }); await flush(); pending.cleanup();
  pending.reads[0].result.resolve(account()); await flush(); assert.doesNotMatch(pending.html(), /data-qr-value|fixture_user/); assert.equal(pending.calls.unsubscribed, 1);
});
test("an account switch during sharing prevents stale clipboard fallback and copied state", async () => {
  const shared = deferred<void>(); const h = setup({ share: () => shared.promise }); await ready(h);
  const attempt = h.share(); h.auth("SIGNED_OUT", null); shared.reject(new DOMException("Unsupported", "NotSupportedError")); await attempt;
  assert.deepEqual(h.calls.copies, []); assert.equal(h.timers.size, 0); assert.doesNotMatch(h.html(), /Copied|fixture_user/); h.cleanup();
  const copied = deferred<void>(); const h2 = setup({ copy: () => copied.promise }); await ready(h2); const copyAttempt = h2.share();
  h2.auth("SIGNED_OUT", null); copied.resolve(); await copyAttempt; assert.doesNotMatch(h2.html(), /Copied|fixture_user/); assert.equal(h2.timers.size, 0); h2.cleanup();
});
