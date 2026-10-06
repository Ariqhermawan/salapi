import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PAYMENT_CHANNELS, paymentChannel, paymentChannels, paymentChannelSupported, type PaymentChannelId } from "../lib/payment-channels.ts";
import { paymentChannelText, type PaymentChannelCopyKey } from "../lib/i18n/payment-channels.ts";
import type { Locale } from "../lib/i18n/config.ts";

type Element = { type: string; props: Record<string, unknown> };
const source = readFileSync(new URL("../components/screens/PaymentChannelOptions.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : "";
}
function render({ preview = false, locale = "en", payout = false, provider = "xendit", callback = false }: { preview?: boolean; locale?: Locale; payout?: boolean; provider?: string; callback?: boolean } = {}) {
  const changes: PaymentChannelId[] = [];
  let forbiddenCalls = 0;
  const forbidden = () => { forbiddenCalls++; throw new Error("Unexpected external payment boundary"); };
  const exports = {} as { default(props: Record<string, unknown>): Element };
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type: String(type), props });
  runInNewContext(code, { exports, fetch: forbidden, XMLHttpRequest: forbidden, WebSocket: forbidden, sessionStorage: { setItem: forbidden }, localStorage: { setItem: forbidden }, require(dependency: string) {
    if (dependency === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (dependency === "@/components/I18nProvider") return { useT: () => ({ locale }) };
    if (dependency === "@/lib/local-preview") return { isLocalPreview: preview };
    if (dependency === "@/lib/payment-channels") return { paymentChannels, paymentChannelSupported };
    if (dependency === "@/lib/i18n/payment-channels") return { paymentChannelText };
    if (dependency.endsWith(".module.css")) return { default: {} };
    throw Error(`Unexpected dependency ${dependency}`);
  } });
  const tree = exports.default({ payout, provider, value: "gcash", onChange: callback ? (id: PaymentChannelId) => changes.push(id) : undefined });
  const buttons = nodes(tree).filter(node => node.type === "button");
  return { tree, buttons, changes, get forbiddenCalls() { return forbiddenCalls; } };
}

test("method native currencies do not depend on language or display currency", () => {
  assert.equal(paymentChannel("gcash")?.nativeCurrency, "tl");
  assert.equal(paymentChannel("gcash")?.code, "PHP");
  for (const id of ["qris", "bank-wallet"]) {
    assert.equal(paymentChannel(id)?.nativeCurrency, "id");
    assert.equal(paymentChannel(id)?.code, "IDR");
  }
  assert.deepEqual(paymentChannels(false).map(channel => channel.id), ["gcash", "qris"]);
  assert.deepEqual(paymentChannels(true).map(channel => channel.id), ["gcash", "qris", "bank-wallet"]);
});

test("complete provider/method matrix denies unsupported or unknown combinations", () => {
  const expected = new Set(["gcash:xendit:false", "gcash:xendit:true", "qris:xendit:false", "qris:mayar:false", "bank-wallet:xendit:true"]);
  for (const channel of [...PAYMENT_CHANNELS.map(item => item.id), "unknown", "", "__proto__"]) {
    for (const provider of ["xendit", "mayar", "unknown", "", "__proto__"]) {
      for (const payout of [false, true]) assert.equal(paymentChannelSupported(channel, provider, payout), expected.has(`${channel}:${provider}:${payout}`), `${channel}/${provider}/${payout}`);
    }
  }
});

for (const preview of [false, true]) {
  for (const payout of [false, true]) {
    test(`preview=${preview}, payout=${payout}: readonly catalog cannot select a payment method`, () => {
      const ui = render({ preview, payout });
      assert.equal(ui.buttons.length, payout ? 3 : 2);
      for (const button of ui.buttons) {
        assert.equal(button.props.disabled, true);
        assert.equal(button.props["aria-pressed"], undefined);
        (button.props.onClick as () => void)();
      }
      assert.deepEqual(ui.changes, []);
      assert.equal(ui.forbiddenCalls, 0);
      assert.ok(text(ui.tree).includes(paymentChannelText("en", "readonly")));
      assert.ok(text(ui.tree).includes(paymentChannelText("en", "notMoney")));
    });
  }
}

test("flag0 fails closed even when callback and selected value are supplied", () => {
  const ui = render({ preview: false, payout: true, callback: true });
  for (const button of ui.buttons) {
    assert.equal(button.props.disabled, true);
    assert.equal(button.props["aria-pressed"], undefined);
    (button.props.onClick as () => void)();
  }
  assert.deepEqual(ui.changes, []);
  assert.equal(ui.forbiddenCalls, 0);
});

test("interactive local catalog also guards forcibly invoked disabled methods", () => {
  const qrisMayar = render({ preview: true, provider: "mayar", callback: true });
  const gcash = qrisMayar.buttons.find(button => button.props["data-payment-channel"] === "gcash")!;
  const qris = qrisMayar.buttons.find(button => button.props["data-payment-channel"] === "qris")!;
  assert.equal(gcash.props.disabled, true);
  (gcash.props.onClick as () => void)();
  assert.deepEqual(qrisMayar.changes, []);
  assert.equal(qris.props.disabled, false);
  (qris.props.onClick as () => void)();
  assert.deepEqual(qrisMayar.changes, ["qris"]);
  const payout = render({ preview: true, payout: true, callback: true });
  const payoutQris = payout.buttons.find(button => button.props["data-payment-channel"] === "qris")!;
  assert.equal(payoutQris.props.disabled, true);
  (payoutQris.props.onClick as () => void)();
  assert.deepEqual(payout.changes, []);
  assert.equal(qrisMayar.forbiddenCalls + payout.forbiddenCalls, 0);
});

const copyKeys: PaymentChannelCopyKey[] = ["methods", "payoutMethods", "bankWallet", "local", "readonly", "qrisPayout", "unsupported", "mayarPayout", "native", "cleared", "nativeAmount", "exampleGcash", "notMoney"];
for (const locale of ["en", "tl", "id", "vi"] as const) {
  test(`${locale}: actual readonly catalog includes localized disconnected and scoped QRIS notices`, () => {
    const ui = render({ locale, payout: true });
    for (const key of ["payoutMethods", "readonly", "qrisPayout", "notMoney"] as const) assert.ok(text(ui.tree).includes(paymentChannelText(locale, key)), key);
    assert.match(text(ui.tree), /GCash.*PHP.*QRIS.*IDR/s);
    assert.match(paymentChannelText(locale, "qrisPayout"), /QRIS TUNTAS/);
    assert.match(paymentChannelText(locale, "mayarPayout"), /Mayar.*Salapi/s);
    for (const key of copyKeys) {
      const value = paymentChannelText(locale, key, { code: "PHP", display: "USD" });
      assert.ok(value.trim().length > 4, key);
      assert.doesNotMatch(value, /\{\w+\}/, key);
      if (locale !== "en" && key !== "bankWallet") assert.notEqual(value, paymentChannelText("en", key, { code: "PHP", display: "USD" }), key);
    }
  });
}

test("catalog cannot call provider, wallet, storage or identity collection boundaries", () => {
  assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|getUserMedia)\b|@\/app\/actions|type=["'](?:file|email|password)["']/);
  const css = readFileSync(new URL("../components/screens/PaymentChannelOptions.module.css", import.meta.url), "utf8");
  assert.match(css, /min-height:\s*62px/);
});
