import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { LOCALES, type Locale } from "../lib/i18n/config.ts";
import { DICTS } from "../lib/i18n/dictionaries.ts";
import * as copy from "../lib/i18n/revamp-money.ts";
import * as money from "../lib/money.ts";
import { CURRENCY, formatLocal, formatLocalAmount, pesoFromLocal } from "../lib/ui/currency.ts";
import { authRedirectPath } from "../lib/authRedirect.ts";
import { PREVIEW_WALLET, PREVIEW_RECIPIENT } from "../lib/local-preview.ts";

type Element = { type: unknown; props: Record<string, unknown> };
type Handler = (...args: unknown[]) => unknown;
const compile = (path: string, jsx = false) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
}).outputText;
const names = ["SendScreen", "ReceiveScreen", "TxDetailScreen", "ActivityScreen", "PaluwaganScreen", "SavingsScreen", "SignInScreen"] as const;
const screens = Object.fromEntries(names.map(name => [name, compile(`../components/screens/${name}.tsx`, true)]));
const helpers = {
  history: compile("../lib/local-preview-history.ts"),
  savings: compile("../lib/savings-preview.ts"),
  paluwagan: compile("../lib/local-preview-paluwagan.ts"),
};
const nodes = (value: unknown): Element[] => {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...nodes(node.props.children), ...nodes(node.props.leading), ...nodes(node.props.trailing)];
};
const text = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : "";
};
function dictionary(locale: Locale, key: string, vars?: Record<string, string | number>) {
  const resolve = (value: unknown): string | undefined => key.split(".").reduce<unknown>((current, part) => current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined, value) as string | undefined;
  const raw = resolve(DICTS[locale]) ?? resolve(DICTS.en) ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (match, name: string) => name in vars ? String(vars[name]) : match) : raw;
}

// Executes real component functions and local helpers, not browser/SDK APIs.
function mount(name: typeof names[number], locale: Locale, options: { preview?: boolean; next?: string; hash?: string; denied?: boolean } = {}) {
  const preview = options.preview ?? true;
  const memory = new Map<string, string>();
  const storage = { getItem(key: string) { if (options.denied) throw Error("Isolated denied storage"); return memory.get(key) ?? null; }, setItem(key: string, value: string) { if (options.denied) throw Error("Isolated denied storage"); memory.set(key, value); }, removeItem(key: string) { memory.delete(key); } };
  const calls = { auth: 0, serverWrites: 0, lookups: 0, navigations: [] as string[], clipboard: [] as string[], cookies: 0 };
  const localPreview = { isLocalPreview: preview, PREVIEW_WALLET, PREVIEW_RECIPIENT };
  let id = 0;
  const base = { window: { location: { origin: "http://localhost:3000", assign: (value: string) => calls.navigations.push(value) }, sessionStorage: storage }, sessionStorage: storage,
    crypto: { randomUUID: () => `00000000-0000-0000-0000-${String(++id).padStart(12, "0")}` },
    fetch() { throw Error("Network forbidden in localization tests"); } };
  const local: Record<string, Record<string, unknown>> = {};
  for (const [key, source] of Object.entries(helpers)) {
    const exported = {} as Record<string, unknown>;
    runInNewContext(source, { ...base, exports: exported, require(dependency: string) {
      if (dependency === "./local-preview") return localPreview;
      if (dependency === "./money") return money;
      throw Error(`Unstubbed local helper dependency: ${dependency}`);
    } });
    local[key] = exported;
  }
  const slots: unknown[] = [];
  let cursor = 0;
  let effectsRan = false;
  const effects: Handler[] = [];
  const timers: Handler[] = [];
  const transitions: Promise<unknown>[] = [];
  const jsx = (type: unknown, props: Record<string, unknown>) => typeof type === "function" ? type(props) : ({ type, props });
  const icons = new Proxy({}, { get: () => () => null });
  const kit = new Proxy({ T: {}, Ico: icons }, { get(target, key: string) { return key in target ? target[key as keyof typeof target] : key; } });
  const document = { get cookie() { return ""; }, set cookie(_value: string) { calls.cookies++; }, getElementById: () => ({ focus() {} }) };
  const component = {} as { default(props?: object): Element };
  runInNewContext(screens[name], { ...base, exports: component, console, Promise, Intl, document,
    navigator: { clipboard: { async writeText(value: string) { calls.clipboard.push(value); } } },
    setTimeout(fn: Handler) { timers.push(fn); return timers.length; }, clearTimeout() {},
    require(dependency: string) {
      if (dependency === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (dependency === "react") return {
        useState(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], (value: unknown) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
        useRef(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
        useEffect(fn: Handler) { if (!effectsRan) effects.push(fn); },
        useCallback(fn: Handler) { return fn; },
        useTransition: () => [false, (fn: Handler) => transitions.push(Promise.resolve(fn()))],
      };
      if (dependency === "@/components/I18nProvider") return { useT: () => ({ locale, currency: "tl", t: (key: string, vars?: Record<string, string | number>) => dictionary(locale, key, vars) }) };
      if (dependency === "@/lib/i18n/revamp-money") return copy;
      if (dependency === "next/navigation") return { useRouter: () => ({ push: (value: string) => calls.navigations.push(value) }), useSearchParams: () => ({ get: (key: string) => key === "next" ? options.next ?? "/vaults" : null }) };
      if (dependency === "next/image" || dependency === "next/link") return { default: dependency };
      if (dependency === "qrcode.react") return { QRCodeSVG: "QRCodeSVG" };
      if (dependency === "@/components/ui/kit") return kit;
      if (dependency === "@/components/ui/brand") return { SalapiMark: "SalapiMark" };
      if (dependency === "@/components/ui/mascot") return { SalapiMascot: "SalapiMascot" };
      if (dependency === "@/components/ui/SuccessMotion" || dependency === "@/components/ui/SubmissionStatusPanel") return { default: dependency };
      if (dependency === "@/lib/ui/useGoBack") return { useGoBack: () => () => calls.navigations.push("back") };
      if (dependency === "@/lib/ui/useUnresolvedSubmission") return { useUnresolvedSubmission: () => ({ locked: false, state: { kind: "clear" }, run() { throw Error("Real submission forbidden"); } }) };
      if (dependency === "@/lib/ui/currency") return { CURRENCY, formatLocal, formatLocalAmount, pesoFromLocal };
      if (dependency === "@/lib/money") return money;
      if (dependency === "@/lib/local-preview") return localPreview;
      if (dependency === "@/lib/local-preview-history") return local.history;
      if (dependency === "@/lib/savings-preview") return local.savings;
      if (dependency === "@/lib/local-preview-paluwagan") return local.paluwagan;
      if (dependency === "@/lib/savings") return { loadGoals() { throw Error("Legacy goal store forbidden"); } };
      if (dependency === "@/lib/authRedirect") return { authRedirectPath };
      if (dependency === "@/lib/supabase/env") return { supabaseConfigured: () => true };
      if (dependency === "@/lib/supabase/client") return { createSupabaseBrowser() { calls.auth++; throw Error("Auth forbidden in localization tests"); } };
      if (dependency === "@/app/actions") return { async lookupRecipient(username: string) { calls.lookups++; return { ok: true, username, address: PREVIEW_RECIPIENT }; }, myHandle() { throw Error("Unexpected wallet read"); }, walletState() { throw Error("Unexpected wallet read"); }, registerUsername() { calls.serverWrites++; throw Error("Write forbidden"); }, sendByUsername() { calls.serverWrites++; throw Error("Write forbidden"); } };
      if (dependency.endsWith(".module.css")) return { default: {} };
      throw Error(`Unstubbed screen dependency: ${dependency}`);
    },
  });
  let tree: Element;
  function render() { cursor = 0; tree = component.default({ initialTo: "receiver", hash: options.hash ?? "a".repeat(64) }); return tree; }
  render();
  for (const effect of effects.splice(0)) effect();
  effectsRan = true;
  async function flush() { while (timers.length) timers.shift()!(); while (transitions.length) await Promise.all(transitions.splice(0)); await Promise.resolve(); await new Promise(resolve => setImmediate(resolve)); return render(); }
  function find(label: string) { const node = nodes(tree).find(item => text(item.props.children).trim() === label || item.props.title === label); assert.ok(node, `Missing ${name} ${locale} label: ${label}`); return node; }
  function click(label: string) { const node = nodes(tree).find(item => typeof item.props.onClick === "function" && (text(item.props.children).trim() === label || item.props.title === label)); assert.ok(node, `Missing actionable ${name} ${locale} label: ${label}`); assert.notEqual(node.props.disabled, true, `Unexpected disabled ${label}`); (node.props.onClick as Handler)(); return render(); }
  function change(label: string, value: string) { const node = nodes(tree).find(item => item.props["aria-label"] === label || item.props.id === label); assert.ok(node, `Missing field ${label}`); (node.props.onChange as Handler)({ target: { value } }); return render(); }
  return { calls, memory, local, flush, render, find, click, change, get tree() { return tree!; } };
}

test("all phrase keys preserve English and have complete locale/placeholder translations", () => {
  for (const [key, row] of Object.entries(copy.REVAMP_MONEY_COPY)) {
    assert.equal(copy.moneyText("en", key as copy.RevampMoneyKey), key);
    assert.equal(copy.moneyText(undefined, key as copy.RevampMoneyKey), key);
    for (const translated of row) { assert.ok(translated.trim()); assert.deepEqual(translated.match(/\{\w+\}/g)?.sort() ?? [], key.match(/\{\w+\}/g)?.sort() ?? []); }
  }
  assert.equal(copy.moneyMessage("id", "custom RPC error hash=abc"), "custom RPC error hash=abc");
});

test("owned Send accessibility and example username labels cannot regress to fixed English", () => {
  const source = readFileSync(new URL("../components/screens/SendScreen.tsx", import.meta.url), "utf8");
  for (const phrase of ["Back", "Receive", "Transfer receipt details", "Unresolved Testnet submission", "Transfer review details", "Transfer details", "Quick amounts"]) {
    assert.ok(source.includes(`={m("${phrase}")}`));
    assert.equal(source.includes(`ariaLabel="${phrase}"`) || source.includes(`aria-label="${phrase}"`), false);
  }
  for (const phrase of ["e.g. jamamam", "your_username"]) assert.ok(source.includes(`placeholder={m("${phrase}")}`));
});

for (const locale of LOCALES) {
  const m = copy.moneyCopy(locale);
  test(`${locale}: Send review/confirmation localizes independently of PHP display and never transfers`, async () => {
    const ui = mount("SendScreen", locale); await ui.flush(); ui.find(m("Send by name."));
    for (const label of [m("Back"), m("Receive")]) assert.ok(nodes(ui.tree).some(item => item.props.ariaLabel === label));
    for (const label of [m("Transfer details"), m("Quick amounts")]) assert.ok(nodes(ui.tree).some(item => item.props["aria-label"] === label));
    assert.ok(nodes(ui.tree).some(item => item.props.id === "send-recipient" && item.props.placeholder === m("e.g. jamamam")));
    ui.change("send-amount", "100.25"); ui.click(m("Review transfer")); await ui.flush();
    ui.find(m("Confirm local demo")); assert.ok(text(ui.tree).includes("₱100.25"));
    ui.click(m("Confirm local demo")); await ui.flush(); ui.find(m("Local transfer demo complete"));
    assert.equal(ui.calls.serverWrites, 0); assert.equal(ui.calls.auth, 0);
    const records = (ui.local.history.listPreviewTransfers as () => { amountStroops: string }[])();
    assert.equal(records.length, 1); assert.equal(records[0].amountStroops, money.moneyInputToStroops({ amount: "100.25", currency: "tl" })!.toString());
  });
  test(`${locale}: Receive localizes its truth labels while keeping the localhost QR destination`, async () => {
    const ui = mount("ReceiveScreen", locale); await ui.flush(); ui.find(m("Testnet only · no real money"));
    const qr = nodes(ui.tree).find(item => item.type === "QRCodeSVG"); assert.equal(qr?.props.value, `http://localhost:3000/send?to=${PREVIEW_WALLET.handle}`);
    ui.click(dictionary(locale, "receive.share")); await ui.flush(); assert.deepEqual(ui.calls.clipboard, [qr!.props.value]); assert.equal(ui.calls.auth, 0);
  });
  test(`${locale}: transaction detail localizes invalid-hash errors without producing an explorer link`, async () => {
    const ui = mount("TxDetailScreen", locale, { hash: "invalid" }); await ui.flush(); ui.find(m("This is not a valid Stellar transaction hash."));
    assert.equal(nodes(ui.tree).filter(item => String(item.props.href ?? "").includes("/tx/")).length, 0);
  });
  test(`${locale}: Activity tabs, empty help and public archive remain localized and separated`, async () => {
    const ui = mount("ActivityScreen", locale); await ui.flush(); ui.find(m("Activity")); ui.find(m("No recorded transfers yet."));
    ui.click(m("Public proof")); await ui.flush(); ui.find(m("Project receipts, not your transactions.")); ui.find(m("Technical details · all 6 receipts"));
    assert.equal(nodes(ui.tree).filter(item => String(item.props.href ?? "").includes("/tx/")).length, 10);
    assert.equal(ui.calls.serverWrites, 0);
  });
  test(`${locale}: Paluwagan review/confirm labels retain exact browser-only contributions`, async () => {
    const ui = mount("PaluwaganScreen", locale); await ui.flush(); ui.find(m("Local example"));
    ui.click(m("Review friends' example shares")); await ui.flush(); ui.find(m("Review example contribution")); assert.equal(ui.memory.size, 0);
    ui.click(m("Confirm local simulation")); await ui.flush(); ui.find(m("Example contributions saved for this browser session.")); assert.equal(ui.memory.size, 1);
    assert.equal(ui.calls.serverWrites, 0); assert.equal(ui.calls.auth, 0);
  });
  test(`${locale}: Savings goal review/success/storage errors remain localized with exact target`, async () => {
    const ui = mount("SavingsScreen", locale); await ui.flush(); ui.find(m("Give your goal a name."));
    ui.change(m("Local goal name"), "Locale specimen"); ui.change(m("Local goal target"), "100.25"); ui.click(m("Review local goal")); await ui.flush(); ui.find(m("Check your goal.")); assert.equal(ui.memory.size, 0);
    ui.click(m("Confirm local savings demo")); await ui.flush(); ui.find(m("Local savings demo saved"));
    const result = (ui.local.savings.readSavingsPreview as () => { ok: boolean; value: { goals: { target: string }[] } })(); assert.equal(result.value.goals[0].target, money.moneyInputToStroops({ amount: "100.25", currency: "tl" })!.toString());
    assert.equal(ui.calls.serverWrites, 0); assert.equal(ui.calls.auth, 0);
    const denied = mount("SavingsScreen", locale, { denied: true }); await denied.flush(); denied.find(m("Browser session savings could not be read. Existing data was not reset or overwritten."));
  });
  test(`${locale}: sign-in has an honest localized preview entry and no preview auth calls`, async () => {
    const ui = mount("SignInScreen", locale, { next: "/send?to=receiver" }); await ui.flush(); ui.find(m("Enter local preview"));
    ui.click(m("Enter local preview")); await ui.flush(); assert.deepEqual(ui.calls.navigations, ["/send?to=receiver"]); assert.equal(ui.calls.auth, 0); assert.equal(ui.calls.cookies, 0);
  });
  test(`${locale}: configured flag-0 guest entry preserves safe next without OAuth or session changes`, async () => {
    const ui = mount("SignInScreen", locale, { preview: false, next: "/campaigns?create=1" }); await ui.flush(); ui.find(m("Explore as guest"));
    ui.click(m("Explore as guest")); await ui.flush(); assert.deepEqual(ui.calls.navigations, ["/campaigns?create=1"]); assert.equal(ui.calls.auth, 0); assert.equal(ui.calls.cookies, 0);
  });
}

test("guest entry rejects external next targets and does not enable phone authentication", async () => {
  const ui = mount("SignInScreen", "id", { preview: false, next: "//evil.example" }); await ui.flush(); ui.click(copy.moneyText("id", "Explore as guest")); await ui.flush();
  assert.deepEqual(ui.calls.navigations, ["/"]); assert.equal(ui.calls.auth, 0); assert.equal(ui.calls.cookies, 0);
  assert.equal(ui.find(copy.moneyText("id", "Phone sign-in · coming soon")).props.disabled, true);
});
