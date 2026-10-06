import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { StrKey } from "@stellar/stellar-sdk";
import ts from "typescript";
import * as money from "../lib/money.ts";
import * as deposit from "../lib/xlm-deposit.ts";
import { type XlmDepositDetails } from "../lib/xlm-deposit.ts";
import { xlmDepositCopy } from "../lib/i18n/xlm-deposit.ts";
import { accountCopy } from "../lib/i18n/revamp-account.ts";
import { LOCALES, type Locale } from "../lib/i18n/config.ts";
import { PREVIEW_WALLET } from "../lib/local-preview.ts";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const compile = (path: string) => ts.transpileModule(source(path), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function moduleFrom<T>(code: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const exports = {};
  runInNewContext(code, { exports, ...globals, require(name: string) {
    if (!(name in dependencies)) throw Error(`Unexpected isolated deposit dependency: ${name}`);
    return dependencies[name];
  } });
  return exports as T;
}
// Only public deterministic SDK fixtures, never a real user key or provider.
const address = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 3));
const otherAddress = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 4));
const { xlmDepositDetails } = moduleFrom<{ xlmDepositDetails(value: unknown): XlmDepositDetails | null }>(compile("../lib/server/xlmDeposit.ts"), {
  "server-only": {}, "@stellar/stellar-sdk": { StrKey }, "../xlm-deposit": deposit,
});
const details = xlmDepositDetails(address)!;
const otherDetails = xlmDepositDetails(otherAddress)!;

test("actual deposit helper accepts a canonical SDK public key and returns public instructions only", () => {
  assert.equal(StrKey.isValidEd25519PublicKey(address), true);
  assert.ok(details); assert.equal(details.address, address);
  assert.deepEqual(Object.keys(details).sort(), ["address", "explorer", "network", "uri"]);
  assert.equal(details.network, "Stellar Testnet");
  assert.equal(details.explorer, `https://stellar.expert/explorer/testnet/account/${address}`);
});

test("actual SDK validation rejects checksum errors, secret seeds, other address types and malformed input", () => {
  const brokenChecksum = address.slice(0, -1) + (address.endsWith("A") ? "B" : "A");
  const secretTypeFixture = StrKey.encodeEd25519SecretSeed(Buffer.alloc(32, 9));
  for (const value of [null, undefined, 0, true, {}, [], "", "G".repeat(56), brokenChecksum,
    address.toLowerCase(), ` ${address}`, `${address} `, address.slice(1), address + "A", secretTypeFixture,
    "C" + "A".repeat(55), "M" + "A".repeat(68), `web+stellar:pay?destination=${address}`]) {
    assert.equal(xlmDepositDetails(value), null);
  }
});

test("SEP-7 QR explicitly binds Testnet and destination, without amount, memo, issuer or callback", () => {
  const uri = new URL(details.uri);
  assert.equal(uri.protocol, "web+stellar:"); assert.equal(uri.pathname, "pay");
  assert.equal(uri.searchParams.get("destination"), address);
  assert.equal(uri.searchParams.get("network_passphrase"), deposit.XLM_DEPOSIT_PASSPHRASE);
  assert.equal(deposit.XLM_DEPOSIT_PASSPHRASE, "Test SDF Network ; September 2015");
  assert.deepEqual([...uri.searchParams.keys()].sort(), ["destination", "network_passphrase"]);
});

const actionsCode = compile("../app/actions.ts");
function actionSetup(options: { preview?: boolean; value?: unknown; failure?: boolean } = {}) {
  const calls = { identity: 0, helper: 0, signer: 0, writes: 0, network: 0, storage: 0 };
  const forbidden = (key: keyof typeof calls) => () => { calls[key]++; throw Error(`Forbidden ${key} in deposit action`); };
  const denied = new Proxy({}, { get: () => forbidden("writes") });
  const api = moduleFrom<{ walletDepositAddress(): Promise<XlmDepositDetails | null> }>(actionsCode, {
    "@/lib/server/stellar": denied,
    "@/lib/server/userWallet": {
      currentWalletPublicKey: async () => { calls.identity++; if (options.failure) throw Error("Isolated auth/read failure"); return "value" in options ? options.value : address; },
      getSigner: forbidden("signer"), currentArisanPublicKey: forbidden("identity"),
    },
    "@/lib/money": money,
    "@/lib/server/xlmDeposit": { xlmDepositDetails: (value: unknown) => { calls.helper++; return xlmDepositDetails(value); } },
    "@/lib/local-preview": { isLocalPreview: options.preview ?? false, PREVIEW_WALLET },
    "@/lib/arisan-list": {}, "./disaster-actions": denied, "@/lib/supabase/env": denied,
    "@/lib/supabase/admin": denied, "@/lib/recipient-review": {}, "@/lib/server/arisanCommitment": denied,
  }, { fetch: forbidden("network"), localStorage: denied, sessionStorage: denied });
  return { api, calls };
}

test("real exported walletDepositAddress returns null in preview before identity resolution or helper invocation", async () => {
  const { api, calls } = actionSetup({ preview: true, failure: true });
  assert.equal(await api.walletDepositAddress(), null);
  assert.deepEqual(calls, { identity: 0, helper: 0, signer: 0, writes: 0, network: 0, storage: 0 });
});

test("real exported deposit action resolves one readonly identity, validates it and never provisions or funds", async () => {
  for (const value of [address, otherAddress, null, "invalid", PREVIEW_WALLET.address + " "]) {
    const { api, calls } = actionSetup({ value });
    assert.equal((await api.walletDepositAddress())?.address ?? null, xlmDepositDetails(value)?.address ?? null);
    assert.deepEqual(calls, { identity: 1, helper: 1, signer: 0, writes: 0, network: 0, storage: 0 });
  }
});

test("identity/auth read failure propagates without shared-wallet, provisioning or deposit fallback", async () => {
  const { api, calls } = actionSetup({ failure: true });
  await assert.rejects(api.walletDepositAddress(), /Isolated auth\/read failure/);
  assert.deepEqual(calls, { identity: 1, helper: 0, signer: 0, writes: 0, network: 0, storage: 0 });
});

type Element = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element; return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : "";
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
const panelCode = compile("../components/screens/XlmDepositPanel.tsx");
const topUpCode = compile("../components/screens/TopUpScreen.tsx");

// Actual JSX and effect callbacks with deterministic isolated React hooks.
// Network, storage, provisioning, navigation and funding are forbidden.
function componentSetup(options: { preview?: boolean; locale?: Locale; screen?: boolean; read?: () => Promise<XlmDepositDetails | null>; clipboard?: (value: string) => Promise<void> } = {}) {
  const preview = options.preview ?? false, locale = options.locale ?? "en";
  const calls = { read: 0, walletRead: 0, clipboard: [] as string[], network: 0, storage: 0, writes: 0, navigation: 0, stateWrites: 0 };
  const forbidden = (key: "network" | "storage" | "writes" | "navigation") => () => { calls[key]++; throw Error(`Forbidden ${key} in deposit render`); };
  const values: unknown[] = [], effects = new Map<number, { deps: unknown[]; cleanup?: () => void }>();
  let cursor = 0, pendingEffects: { index: number; effect: () => (() => void) | void; deps: unknown[] }[] = [];
  const jsx = (type: unknown, props: Record<string, unknown>): Element => ({ type, props });
  const react = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
      return [values[index], (value: unknown) => { calls.stateWrites++; values[index] = typeof value === "function" ? value(values[index]) : value; }];
    },
    useRef(initial: unknown) { const index = cursor++; if (!(index in values)) values[index] = { current: initial }; return values[index]; },
    useTransition() { cursor++; return [false, forbidden("writes")]; },
    useEffect(effect: () => (() => void) | void, deps: unknown[] = []) {
      const index = cursor++, previous = effects.get(index);
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i])) || deps.length !== previous.deps.length) pendingEffects.push({ index, effect, deps });
    },
  };
  const icon = new Proxy({}, { get: (_target, name) => (props: Record<string, unknown>) => jsx("svg", { ...props, "data-icon": String(name) }) });
  const storage = { getItem: forbidden("storage"), setItem: forbidden("storage"), removeItem: forbidden("storage") };
  const api = moduleFrom<{ default(): Element }>(options.screen ? topUpCode : panelCode, {
    "react": react, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "next/link": { default: "Link" }, "qrcode.react": { QRCodeSVG: "QRCodeSVG" },
    "next/navigation": { useRouter: () => ({ push: forbidden("navigation") }) },
    "@/lib/ui/useGoBack": { useGoBack: () => forbidden("navigation") },
    "@/components/I18nProvider": { useT: () => ({ locale, currency: locale, t: (key: string) => key }) },
    "@/components/ui/kit": { Ico: icon, T: {}, ...Object.fromEntries(["AppBar", "IconButton", "Card", "Btn", "Chip", "Money", "PoweredByStellar"].map(name => [name, name])) },
    "@/components/ui/SuccessMotion": { default: "SuccessMotion" },
    "@/lib/i18n/revamp-account": { accountCopy }, "@/lib/i18n/xlm-deposit": { xlmDepositCopy },
    "@/lib/local-preview": { isLocalPreview: preview, PREVIEW_WALLET }, "@/lib/xlm-deposit": deposit,
    "./XlmDepositPanel.module.css": { default: new Proxy({}, { get: (_target, name) => String(name) }) },
    "./XlmDepositPanel": { default: "XlmDepositPanel" }, "./PaymentProviderDemo": { default: "PaymentProviderDemo" },
    "@/app/actions": {
      walletDepositAddress: () => { calls.read++; return options.read ? options.read() : Promise.resolve(details); },
      walletState: async () => { calls.walletRead++; return { address, pesos: 0 }; }, topUpSandbox: forbidden("writes"),
    },
  }, {
    fetch: forbidden("network"), XMLHttpRequest: forbidden("network"), localStorage: storage, sessionStorage: storage,
    navigator: { clipboard: { writeText: (value: string) => { calls.clipboard.push(value); return options.clipboard ? options.clipboard(value) : Promise.resolve(); } } },
  });
  function render() { cursor = 0; pendingEffects = []; const tree = api.default(); return tree; }
  function flushEffects() {
    for (const item of pendingEffects) { effects.get(item.index)?.cleanup?.(); const cleanup = item.effect(); effects.set(item.index, { deps: [...item.deps], cleanup: cleanup || undefined }); }
    pendingEffects = [];
  }
  function unmount() { for (const effect of effects.values()) effect.cleanup?.(); effects.clear(); }
  function update() { const tree = render(); flushEffects(); return tree; }
  return { calls, render, flushEffects, update, unmount };
}
function button(tree: Element, label: string) {
  const found = nodes(tree).find(node => node.type === "button" && text(node) === label); assert.ok(found, `Missing button: ${label}`); return found;
}
function click(node: Element): unknown { assert.equal(node.props.disabled, undefined); assert.equal(typeof node.props.onClick, "function"); return (node.props.onClick as () => unknown)(); }
function noMutations(calls: ReturnType<typeof componentSetup>["calls"]) {
  assert.equal(calls.network, 0); assert.equal(calls.storage, 0); assert.equal(calls.writes, 0); assert.equal(calls.navigation, 0);
}

test("actual preview panel in all four locales has an inert example address, disabled copy and no QR", () => {
  for (const locale of LOCALES) {
    const ui = componentSetup({ preview: true, locale }), tree = ui.update(), c = xlmDepositCopy(locale);
    assert.ok(text(tree).includes(c.previewTitle)); assert.ok(text(tree).includes(c.previewBody));
    assert.ok(text(tree).includes(c.warning)); assert.ok(text(tree).includes(PREVIEW_WALLET.address));
    assert.equal(button(tree, c.copy).props.disabled, true); assert.equal(button(tree, c.copy).props.onClick, undefined);
    assert.equal(nodes(tree).some(node => node.type === "QRCodeSVG" || node.type === "a" || node.type === "Link"), false);
    assert.equal(ui.calls.read, 0); assert.deepEqual(ui.calls.clipboard, []); noMutations(ui.calls);
  }
});

test("actual ready panel binds server address, Testnet QR, memo truth and history in all four locales", async () => {
  for (const locale of LOCALES) {
    const read = deferred<XlmDepositDetails | null>(), ui = componentSetup({ locale, read: () => read.promise }), c = xlmDepositCopy(locale);
    const loading = ui.update(); assert.ok(text(loading).includes(c.loading));
    assert.equal(nodes(loading).some(node => node.type === "code" || node.type === "QRCodeSVG"), false);
    read.resolve(details); await settle(); const tree = ui.update();
    const qr = nodes(tree).find(node => node.type === "QRCodeSVG")!; assert.ok(qr);
    assert.equal(qr.props.value, details.uri); assert.equal(qr.props.title, c.scan);
    assert.equal(nodes(tree).find(node => node.type === "code")?.props.children, address);
    assert.ok(text(tree).includes(c.warning)); assert.ok(text(tree).includes(c.memoValue)); assert.ok(text(tree).includes(c.inactive));
    const explorer = nodes(tree).find(node => node.type === "a")!;
    assert.equal(explorer.props.href, details.explorer); assert.equal(explorer.props.rel, "noopener noreferrer");
    assert.equal(nodes(tree).find(node => node.type === "Link")?.props.href, "/activity");
    assert.equal(ui.calls.read, 1); assert.equal(ui.calls.walletRead, 0); assert.deepEqual(ui.calls.clipboard, []); noMutations(ui.calls);
  }
});

test("null and failed wallet reads never reveal the example address or a QR and offer readonly recovery", async () => {
  for (const locale of LOCALES) for (const failure of [false, true]) {
    const ui = componentSetup({ locale, read: () => failure ? Promise.reject(Error("Isolated read failure")) : Promise.resolve(null) }), c = xlmDepositCopy(locale);
    ui.update(); await settle(); const tree = ui.update();
    assert.ok(text(tree).includes(failure ? c.loadError : c.unavailableBody));
    assert.equal(nodes(tree).some(node => node.type === "QRCodeSVG" || node.type === "code" || node.type === "a"), false);
    assert.equal(text(tree).includes(PREVIEW_WALLET.address), false);
    assert.equal(nodes(tree).find(node => node.type === "Link")?.props.href, "/signin?next=%2Ftopup");
    assert.ok(button(tree, c.retry)); if (failure) assert.ok(nodes(tree).some(node => node.props.role === "alert"));
    assert.deepEqual(ui.calls.clipboard, []); noMutations(ui.calls);
  }
});

test("copy success appears only after awaited clipboard success and clipboard rejection reports an alert", async () => {
  for (const locale of LOCALES) {
    const clipboard = deferred<void>(), ui = componentSetup({ locale, clipboard: () => clipboard.promise }), c = xlmDepositCopy(locale);
    ui.update(); await settle(); const work = click(button(ui.update(), c.copy));
    assert.ok(button(ui.update(), c.copy)); assert.equal(text(ui.update()).includes(c.copied), false);
    assert.deepEqual(ui.calls.clipboard, [address]); clipboard.resolve(); await work;
    assert.ok(button(ui.update(), c.copied)); assert.ok(nodes(ui.update()).some(node => node.props.role === "status" && text(node) === c.copied)); noMutations(ui.calls);
    const failed = componentSetup({ locale, clipboard: async () => { throw Error("Clipboard denied"); } });
    failed.update(); await settle(); await click(button(failed.update(), c.copy)); const tree = failed.update();
    assert.ok(button(tree, c.copy)); assert.ok(nodes(tree).some(node => node.props.role === "alert" && text(node) === c.copyError));
    assert.equal(text(tree).includes(c.copied), false); noMutations(failed.calls);
  }
});

test("refresh clears prior QR, address and copy feedback before reading a new readonly target", async () => {
  const next = deferred<XlmDepositDetails | null>(); let reads = 0;
  const ui = componentSetup({ read: () => ++reads === 1 ? Promise.resolve(details) : next.promise }), c = xlmDepositCopy("en");
  ui.update(); await settle(); await click(button(ui.update(), c.copy)); assert.ok(button(ui.update(), c.copied));
  click(button(ui.update(), c.retry)); const loading = ui.update();
  assert.equal(nodes(loading).some(node => node.type === "QRCodeSVG" || node.type === "code"), false);
  assert.equal(text(loading).includes(c.copied), false); assert.ok(text(loading).includes(c.loading));
  next.resolve(otherDetails); await settle(); const tree = ui.update();
  assert.equal(nodes(tree).find(node => node.type === "code")?.props.children, otherAddress);
  assert.equal(nodes(tree).find(node => node.type === "QRCodeSVG")?.props.value, otherDetails.uri);
  assert.ok(button(tree, c.copy)); assert.equal(ui.calls.read, 2); noMutations(ui.calls);
});

test("cancelled address effects ignore late resolution and rejection after unmount", async () => {
  for (const failure of [false, true]) {
    const read = deferred<XlmDepositDetails | null>(), ui = componentSetup({ read: () => read.promise });
    ui.update(); ui.unmount(); const before = ui.calls.stateWrites;
    if (failure) read.reject(Error("Late read failure")); else read.resolve(details);
    await settle(); assert.equal(ui.calls.stateWrites, before); noMutations(ui.calls);
  }
});

test("a previous refresh response cannot overwrite the latest address request", async () => {
  const previous = deferred<XlmDepositDetails | null>(), latest = deferred<XlmDepositDetails | null>(); let reads = 0;
  const ui = componentSetup({ read: () => ++reads === 1 ? Promise.resolve(details) : reads === 2 ? previous.promise : latest.promise }), c = xlmDepositCopy("en");
  ui.update(); await settle(); const refresh = button(ui.update(), c.retry);
  click(refresh); ui.update(); click(refresh); ui.update();
  latest.resolve(otherDetails); await settle(); previous.resolve(details); await settle();
  assert.equal(nodes(ui.update()).find(node => node.type === "code")?.props.children, otherAddress);
  assert.equal(ui.calls.read, 3); noMutations(ui.calls);
});

test("late copy completion for a replaced address never marks the new address copied", async () => {
  const clipboard = deferred<void>(); let reads = 0;
  const ui = componentSetup({ clipboard: () => clipboard.promise, read: async () => ++reads === 1 ? details : otherDetails }), c = xlmDepositCopy("en");
  ui.update(); await settle(); const work = click(button(ui.update(), c.copy));
  click(button(ui.update(), c.retry)); ui.update(); await settle(); clipboard.resolve(); await work;
  const tree = ui.update(); assert.equal(nodes(tree).find(node => node.type === "code")?.props.children, otherAddress);
  assert.ok(button(tree, c.copy)); assert.equal(text(tree).includes(c.copied), false); noMutations(ui.calls);
});

test("actual non-preview TopUp defaults to deposit and never calls walletState, a signer or funding on entry", () => {
  for (const locale of LOCALES) {
    const ui = componentSetup({ screen: true, locale }), tree = ui.update(), c = xlmDepositCopy(locale);
    assert.ok(nodes(tree).some(node => node.type === "XlmDepositPanel"));
    assert.equal(nodes(tree).some(node => node.type === "PaymentProviderDemo"), false);
    assert.equal(button(tree, c.deposit).props["aria-pressed"], true);
    assert.equal(button(tree, c.faucet).props["aria-pressed"], false);
    assert.equal(ui.calls.walletRead, 0); assert.equal(ui.calls.read, 0); noMutations(ui.calls);
  }
});

test("actual preview TopUp preserves provider/faucet navigation and deposit mode without any financial calls", () => {
  for (const locale of LOCALES) {
    const ui = componentSetup({ screen: true, preview: true, locale }), provider = ui.update(), c = xlmDepositCopy(locale);
    assert.equal(provider.type, "PaymentProviderDemo");
    const navigation = provider.props.topupNavigation as Element;
    assert.equal(navigation.props["aria-label"], c.methods);
    assert.equal(button(navigation, c.provider).props["aria-pressed"], true);
    click(button(navigation, c.deposit)); const panel = ui.update();
    assert.ok(nodes(panel).some(node => node.type === "XlmDepositPanel"));
    assert.equal(button(panel, c.deposit).props["aria-pressed"], true);
    click(button(panel, c.provider)); assert.equal(ui.update().type, "PaymentProviderDemo");
    (ui.update().props.onFaucet as () => void)(); const faucet = ui.update();
    assert.equal(nodes(faucet).some(node => node.type === "XlmDepositPanel" || node.type === "PaymentProviderDemo"), false);
    assert.equal(button(faucet, c.faucet).props["aria-pressed"], true);
    assert.equal(ui.calls.walletRead, 0); assert.equal(ui.calls.read, 0); noMutations(ui.calls);
  }
});

test("non-preview faucet balance reads require an explicit method choice and are cancelled when leaving it", async () => {
  const ui = componentSetup({ screen: true }), c = xlmDepositCopy("en");
  const entry = ui.update(); assert.equal(ui.calls.walletRead, 0);
  click(button(entry, c.faucet)); const faucet = ui.update(); assert.equal(ui.calls.walletRead, 1);
  click(button(faucet, c.deposit)); const depositTree = ui.update(), before = ui.calls.stateWrites;
  await settle(); assert.equal(ui.calls.stateWrites, before);
  assert.ok(nodes(depositTree).some(node => node.type === "XlmDepositPanel")); noMutations(ui.calls);
});
