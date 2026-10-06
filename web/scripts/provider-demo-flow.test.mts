import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { demoAmountMinor, nextDemoPaymentStatus, type DemoPaymentEvent, type DemoPaymentStatus } from "../lib/provider-demo.ts";
import { CURRENCY, formatLocalAmount, localAmount, pesoFromLocal } from "../lib/ui/currency.ts";
import { PREVIEW_WALLET } from "../lib/local-preview.ts";
import type { Locale } from "../lib/i18n/config.ts";
import { accountCopy, accountText } from "../lib/i18n/revamp-account.ts";
import { xlmDepositCopy } from "../lib/i18n/xlm-deposit.ts";

type Element = { type: string; props: Record<string, unknown> };
type Component = { default(props: Record<string, unknown>): Element | null };
const files = ["PaymentProviderDemo", "TopUpScreen", "WithdrawScreen"] as const;
const codes = Object.fromEntries(files.map(name => [name, ts.transpileModule(readFileSync(new URL(`../components/screens/${name}.tsx`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText]));

function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  if (value && typeof value === "object" && "props" in value) return text((value as Element).props.children);
  return "";
}

// Actual screen handlers run with isolated hooks. All action, storage and
// network boundaries fail closed; no browser or provider is contacted.
function setup(options: { payout?: boolean; currency?: Locale; locale?: Locale; preview?: boolean; screen?: typeof files[number] } = {}) {
  let currency = options.currency ?? "tl";
  const preview = options.preview ?? true;
  const state: unknown[] = [];
  let cursor = 0;
  const transitions: Promise<unknown>[] = [];
  const calls = { action: 0, network: 0, storage: 0, navigation: 0 };
  function forbidden(kind: keyof typeof calls) { return () => { calls[kind]++; throw new Error(`Unexpected ${kind} boundary`); }; }
  const storage = { getItem: forbidden("storage"), setItem: forbidden("storage"), removeItem: forbidden("storage"), clear: forbidden("storage") };
  const jsx = (type: unknown, props: Record<string, unknown>): Element => typeof type === "function" ? type(props) : { type: String(type), props };
  const component = {} as Component;
  const wallet = Object.freeze({ ...PREVIEW_WALLET });
  const icons = new Proxy({}, { get: () => () => null });
  runInNewContext(codes[options.screen ?? "PaymentProviderDemo"], {
    exports: component, fetch: forbidden("network"), XMLHttpRequest: forbidden("network"), WebSocket: forbidden("network"),
    sessionStorage: storage, localStorage: storage, window: { fetch: forbidden("network"), sessionStorage: storage, localStorage: storage }, navigator: { sendBeacon: forbidden("network") },
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react") return {
        useState(initial: unknown) { const index = cursor++; if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial; return [state[index], (value: unknown) => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
        useRef(initial: unknown) { const index = cursor++; if (!(index in state)) state[index] = { current: initial }; return state[index]; },
        useEffect(effect: () => void) { effect(); },
        useTransition: () => [false, (callback: () => Promise<unknown>) => transitions.push(callback())],
      };
      if (name === "next/link") return { default: "Link" };
      if (name === "next/navigation") return { useRouter: () => ({ push: forbidden("navigation"), back: forbidden("navigation") }) };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale: options.locale ?? "en", currency, t: (key: string) => key }) };
      if (name === "@/lib/i18n/revamp-account") return { accountCopy, accountText };
      if (name === "@/lib/i18n/xlm-deposit") return { xlmDepositCopy };
      if (name === "./XlmDepositPanel") return { default: "DepositPanel" };
      if (name === "@/components/ui/kit") return { T: {}, Ico: icons, AppBar: "AppBar", IconButton: "IconButton", Card: "Card", Row: "Row", Btn: "Btn", Chip: "Chip", Money: "Money", PoweredByStellar: "PoweredByStellar" };
      if (name === "@/components/ui/SuccessMotion") return { default: (props: Record<string, unknown>) => jsx("SuccessMotion", { ...props, children: [props.title, props.children] }) };
      if (name === "./PaymentProviderDemo") return { default: "ProviderDemo" };
      if (name === "@/lib/ui/useGoBack") return { useGoBack: () => forbidden("navigation") };
      if (name === "@/lib/local-preview") return { isLocalPreview: preview, PREVIEW_WALLET: wallet };
      if (name === "@/lib/ui/currency") return { CURRENCY, formatLocalAmount, localAmount, pesoFromLocal };
      if (name === "@/lib/provider-demo") return { demoAmountMinor, nextDemoPaymentStatus };
      if (name === "@/app/actions") return { walletState: forbidden("action"), topUpSandbox: forbidden("action"), withdrawSandbox: forbidden("action") };
      if (name.endsWith(".module.css")) return { default: {} };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const render = () => { cursor = 0; return component.default({ payout: options.payout ?? false }); };
  let tree = render();
  const settle = async () => { while (transitions.length) await Promise.all(transitions.splice(0)); tree = render(); };
  const find = (predicate: (node: Element) => boolean) => { const node = nodes(tree).find(predicate); assert.ok(node, "Missing expected component control"); return node; };
  const button = (label: string) => find(node => ["button", "Btn"].includes(node.type) && text(node) === label);
  return {
    calls, wallet, get tree() { return tree; }, find, button,
    amount(value: string) { const node = find(node => node.type === "input" && node.props.id === "provider-demo-amount"); (node.props.onChange as (event: unknown) => void)({ target: { value } }); tree = render(); },
    currency(value: Locale) { currency = value; tree = render(); },
    async click(label: string) { (button(label).props.onClick as () => void)(); await settle(); },
    changeProvider(provider: string) { const node = find(node => node.type === "input" && node.props.name === "provider" && node.props.value === provider); (node.props.onChange as () => void)(); tree = render(); },
    async faucet() { const node = find(node => node.type === "ProviderDemo"); (node.props.onFaucet as () => void)(); await settle(); },
  };
}

function noWrites(ui: ReturnType<typeof setup>) { assert.deepEqual(ui.calls, { action: 0, network: 0, storage: 0, navigation: 0 }); assert.deepEqual(ui.wallet, PREVIEW_WALLET); }
const currencyValues: Record<Locale, string> = { en: "0.50", tl: "5.01", id: "25000", vi: "50000" };

test("helper validates exact positive minor units without silent rounding", () => {
  assert.equal(demoAmountMinor("0.50", 2), 50n);
  assert.equal(demoAmountMinor("0005.01", 2), 501n);
  assert.equal(demoAmountMinor("25000", 0), 25000n);
  for (const [raw, dp] of [["1.234", 2], ["2.1", 0], ["0", 2], ["0.00", 2], ["-5", 2], ["5e2", 2], ["Infinity", 2], ["NaN", 2], [" 5", 2], ["5.", 2], ["5,00", 2], ["1000000000000001", 0], ["5", 1]] as const) assert.equal(demoAmountMinor(raw, dp), null, `${raw}/${dp}`);
});

test("status machine requires entry-review-confirm before simulated settlement", () => {
  assert.equal(nextDemoPaymentStatus("entry", "succeeded", true, false), "entry");
  assert.equal(nextDemoPaymentStatus("entry", "confirm", true, false), "entry");
  assert.equal(nextDemoPaymentStatus("review", "succeeded", true, false), "review");
  assert.equal(nextDemoPaymentStatus("entry", "review", true, false), "review");
  assert.equal(nextDemoPaymentStatus("review", "confirm", true, false), "pending");
  assert.equal(nextDemoPaymentStatus("pending", "succeeded", true, false), "succeeded");
  assert.equal(nextDemoPaymentStatus("succeeded", "failed", true, false), "succeeded");
  assert.equal(nextDemoPaymentStatus("succeeded", "reversed", true, false), "succeeded");
  assert.equal(nextDemoPaymentStatus("succeeded", "reversed", true, true), "reversed");
  assert.equal(nextDemoPaymentStatus("pending", "expired", true, true), "pending");
  assert.equal(nextDemoPaymentStatus("pending", "reset", true, false), "entry");
});

test("every status event is denied outside local preview", () => {
  for (const status of ["entry", "review", "pending", "succeeded", "failed", "expired", "reversed"] as DemoPaymentStatus[]) for (const event of ["review", "edit", "confirm", "succeeded", "failed", "expired", "reversed", "reset"] as DemoPaymentEvent[]) assert.equal(nextDemoPaymentStatus(status, event, false, true), status);
  assert.equal(setup({ preview: false }).tree, null);
});

for (const currency of Object.keys(currencyValues) as Locale[]) {
  test(`${currency}: actual entry handlers reject invalid precision and malformed amounts`, async () => {
    const ui = setup({ currency });
    for (const raw of ["", "-5", "0", "5e2", " 5", CURRENCY[currency].dp === 0 ? "1.5" : "1.234"]) {
      ui.amount(raw);
      assert.equal(ui.button("Review top-up demo").props.disabled, true);
      await ui.click("Review top-up demo");
      assert.ok(nodes(ui.tree).some(node => node.props.id === "provider-demo-amount"));
      if (raw) assert.ok(nodes(ui.tree).some(node => node.props.role === "alert"));
    }
    noWrites(ui);
  });
  test(`${currency}: payout Max rounds down and preserves unchanged illustrative balance`, async () => {
    const ui = setup({ currency, payout: true });
    await ui.click("Max");
    const raw = String(ui.find(node => node.props.id === "provider-demo-amount").props.value);
    const minor = demoAmountMinor(raw, CURRENCY[currency].dp);
    assert.ok(minor !== null);
    assert.ok(minor <= BigInt(Math.floor(localAmount(PREVIEW_WALLET.pesos, currency) * 10 ** CURRENCY[currency].dp)));
    await ui.click("Review payout demo");
    assert.match(text(ui.tree), /Wallet balance changeNone/);
    await ui.click("Confirm local payout demo");
    await ui.click("Show success demo");
    assert.match(text(ui.tree), /wallet balance is unchanged/);
    await ui.click("Explore a reversed payout example");
    assert.match(text(ui.tree), /Reversed · example outcome/);
    noWrites(ui);
  });
}

test("top-up Mayar selection and all simulated outcomes perform no provider or ledger write", async () => {
  for (const outcome of ["success", "failure", "expired"]) {
    const ui = setup({ currency: "en" });
    ui.amount("10.25");
    ui.changeProvider("mayar");
    await ui.click("Review top-up demo");
    assert.match(text(ui.tree), /ProviderMayar.id/);
    await ui.click("Confirm local top-up demo");
    await ui.click(`Show ${outcome} demo`);
    assert.match(text(ui.tree), /No (money moved|real transaction exists)/);
    await ui.click("Try another demo");
    assert.ok(nodes(ui.tree).some(node => node.props.id === "provider-demo-amount"));
    noWrites(ui);
  }
});

test("payout Mayar remains unavailable even if its disabled selection handler is invoked", async () => {
  const ui = setup({ payout: true });
  assert.equal(ui.find(node => node.type === "input" && node.props.value === "mayar").props.disabled, true);
  ui.amount("100");
  ui.changeProvider("mayar");
  await ui.click("Review payout demo");
  assert.doesNotMatch(text(ui.tree), /ProviderMayar.id/);
  noWrites(ui);
});

test("payout entry rejects over-balance amounts in every display currency", async () => {
  for (const currency of Object.keys(currencyValues) as Locale[]) {
    const ui = setup({ currency, payout: true });
    ui.amount(String(Math.ceil(localAmount(PREVIEW_WALLET.pesos, currency)) + 1000));
    assert.equal(ui.button("Review payout demo").props.disabled, true);
    await ui.click("Review payout demo");
    assert.ok(nodes(ui.tree).some(node => node.props.id === "provider-demo-amount"));
    assert.match(text(ui.tree), /exceeds the illustrative Testnet balance/);
    noWrites(ui);
  }
});

test("payout failure leaves no settlement, and pending reset performs no cancellation request", async () => {
  const failed = setup({ payout: true });
  failed.amount("100");
  await failed.click("Review payout demo");
  await failed.click("Confirm local payout demo");
  await failed.click("Show failure demo");
  assert.match(text(failed.tree), /Failed · example outcome/);
  assert.match(text(failed.tree), /No real transaction exists. No balance changed/);
  noWrites(failed);
  const reset = setup({ payout: true });
  reset.amount("100");
  await reset.click("Review payout demo");
  await reset.click("Confirm local payout demo");
  await reset.click("Try another demo");
  assert.ok(nodes(reset.tree).some(node => node.props.id === "provider-demo-amount"));
  noWrites(reset);
});

test("review amount revalidates when display currency becomes nonrepresentable", async () => {
  const ui = setup({ currency: "tl" });
  ui.amount("1.50");
  await ui.click("Review top-up demo");
  ui.currency("id");
  await ui.click("Confirm local top-up demo");
  assert.ok(nodes(ui.tree).some(node => ["button", "Btn"].includes(node.type) && text(node) === "Confirm local top-up demo"));
  assert.ok(!nodes(ui.tree).some(node => ["button", "Btn"].includes(node.type) && text(node) === "Show success demo"));
  noWrites(ui);
});

test("TopUp local provider branch and separate faucet rehearsal never call server actions", async () => {
  const ui = setup({ screen: "TopUpScreen" });
  assert.ok(nodes(ui.tree).some(node => node.type === "ProviderDemo"));
  await ui.faucet();
  await ui.click("Try local funding demo");
  assert.match(text(ui.tree), /No network request was made/);
  const money = nodes(ui.tree).find(node => node.type === "Money");
  assert.equal(money?.props.value, PREVIEW_WALLET.pesos);
  noWrites(ui);
});

test("Withdraw local integration selects the provider demo without loading or mutating wallet", () => {
  const ui = setup({ screen: "WithdrawScreen" });
  assert.equal(ui.find(node => node.type === "ProviderDemo").props.payout, true);
  noWrites(ui);
});

test("provider UI cannot collect actual payment or identity credentials", () => {
  const source = readFileSync(new URL("../components/screens/PaymentProviderDemo.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|getUserMedia)\b|@\/app\/actions|type=["'](?:file|email|password)["']/);
  for (const payout of [true, false]) {
    const ui = setup({ payout });
    assert.match(text(ui.tree), /Providers not connected/);
    assert.match(text(ui.tree), /No real payment or identity verification/);
    noWrites(ui);
  }
});

for (const locale of ["en", "tl", "id", "vi"] as const) {
  test(`${locale}: real provider UI preserves localized no-money warnings through review, confirmation and reversal`, async () => {
    const c = accountCopy(locale);
    const ui = setup({ locale, currency: "en", payout: true });
    assert.ok(text(ui.tree).includes(c.providersDisconnected));
    assert.ok(text(ui.tree).includes(c.mayarUnavailable));
    assert.equal(ui.find(node => node.type === "input" && node.props.value === "mayar").props.disabled, true);
    await ui.click(c.max);
    await ui.click(c.reviewPayout);
    assert.ok(text(ui.tree).includes(c.noProviderRequest));
    assert.ok(text(ui.tree).includes(c.balanceChange + c.none));
    await ui.click(c.confirmPayout);
    assert.ok(text(ui.tree).includes(c.outcomeIntro));
    await ui.click(c.showSuccess);
    assert.ok(text(ui.tree).includes(c.noMoneyMoved));
    await ui.click(c.exploreReversed);
    assert.ok(text(ui.tree).includes(c.reversed + " · " + c.exampleOutcome));
    assert.ok(text(ui.tree).includes(c.noTransaction));
    noWrites(ui);
  });
}
