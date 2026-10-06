import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { ACCOUNT_COPY, accountCopy, accountText, accountCurrencyName, accountLanguageName, type AccountCopyKey } from "../lib/i18n/revamp-account.ts";
import { xlmDepositCopy } from "../lib/i18n/xlm-deposit.ts";
import { accountPhotoCopy } from "../lib/i18n/account-photo.ts";
import { LOCALES, LOCALE_META, type Locale } from "../lib/i18n/config.ts";
import { DICTS } from "../lib/i18n/dictionaries.ts";
import { CURRENCY, localAmount, formatLocalAmount, pesoFromLocal } from "../lib/ui/currency.ts";
import { PREVIEW_WALLET } from "../lib/local-preview.ts";
import { demoAmountMinor, nextDemoPaymentStatus } from "../lib/provider-demo.ts";
import * as paymentChannels from "../lib/payment-channels.ts";
import { paymentChannelText } from "../lib/i18n/payment-channels.ts";
import { createSumsubDemoState, canPrepareSumsubDemo, canChooseSumsubDemoResult, transitionSumsubDemo, SUMSUB_CHECKLIST } from "../lib/verification/sumsub-demo.ts";
import { requireWalletState } from "../lib/wallet-state.ts";

const files = ["PaymentProviderDemo", "TopUpScreen", "WithdrawScreen", "KycTierScreen", "SettingsScreen", "LanguagePickerScreen", "CurrencyPickerScreen"] as const;
const sources = Object.fromEntries(files.map(name => [name, readFileSync(new URL(`../components/screens/${name}.tsx`, import.meta.url), "utf8")])) as Record<typeof files[number], string>;
const codes = Object.fromEntries(files.map(name => [name, ts.transpileModule(sources[name], { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText]));
const copyModule = { accountCopy, accountText, accountCurrencyName, accountLanguageName };
const allowanceModule = { exports: {} as { KYC_TIER_CEILING: Record<number, number> } };
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/circles/allowance.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: allowanceModule.exports, require: () => ({}) });
const { KYC_TIER_CEILING } = allowanceModule.exports;

function translate(locale: Locale, key: string): string {
  const result = key.split(".").reduce<unknown>((value, part) => value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined, DICTS[locale]);
  assert.equal(typeof result, "string", `Existing dictionary key must exist: ${locale}/${key}`);
  return result as string;
}

// Render the actual screens with real React SSR. No server action, browser,
// provider, storage, camera or auth boundary is permitted in this harness.
function render(name: typeof files[number], locale: Locale, preview = true, props: Record<string, unknown> = {}, mounted?: { hooks: typeof React; walletState: () => Promise<{ ok: false; error: string }> }): string {
  const screen = {} as { default: React.ComponentType<Record<string, unknown>> };
  const forbidden = () => { throw new Error("Unexpected external boundary"); };
  const box = (props: Record<string, unknown>) => React.createElement("div", null, props.leading as React.ReactNode, props.title as React.ReactNode, props.sub as React.ReactNode, props.children as React.ReactNode, props.trailing as React.ReactNode);
  const kit = new Proxy({ T: {}, Ico: new Proxy({}, { get: () => () => null }), Money: (props: Record<string, unknown>) => React.createElement("span", { "data-money-value": String(props.value) }) }, { get(target, key) { return Reflect.get(target, key) ?? box; } });
  runInNewContext(codes[name], {
    exports: screen, fetch: forbidden, window: { location: {}, sessionStorage: { getItem: forbidden, setItem: forbidden } },
    require(dependency: string) {
      if (dependency === "react") return mounted?.hooks ?? React;
      if (dependency === "react/jsx-runtime") return jsxRuntime;
      if (dependency === "@supabase/supabase-js") return { isAuthSessionMissingError };
      if (dependency === "next/link") return { default: box };
      if (dependency === "next/image") return { default: (props: Record<string, unknown>) => React.createElement("span", null, props.alt as string) };
      if (dependency === "next/navigation") return { useRouter: () => ({ push: forbidden }) };
      if (dependency === "@/components/I18nProvider") return { useT: () => ({ locale, currency: "en", currencyPref: "en", t: (key: string) => translate(locale, key), setLocale: forbidden, setCurrency: forbidden }) };
      if (dependency === "@/components/AccountAvatar") return { default: box };
      if (dependency === "@/components/AccountPhotoEditor") return { default: () => null };
      if (dependency === "@/components/useAccountPhoto") return { useAccountPhoto: () => ({ profile: null, status: "ready" }) };
      if (dependency === "@/lib/i18n/account-photo") return { accountPhotoCopy };
      if (dependency === "@/lib/i18n/revamp-account") return copyModule;
      if (dependency === "@/lib/i18n/xlm-deposit") return { xlmDepositCopy };
      if (dependency === "./XlmDepositPanel") return { default: () => React.createElement("span", null, xlmDepositCopy(locale).warning) };
      if (dependency === "@/lib/i18n/config") return { LOCALES, LOCALE_META };
      if (dependency === "@/lib/ui/currency") return { CURRENCY, localAmount, formatLocalAmount, pesoFromLocal };
      if (dependency === "@/lib/wallet-state") return { requireWalletState };
      if (dependency === "@/lib/ui/useGoBack") return { useGoBack: () => forbidden };
      if (dependency === "@/components/ui/kit") return kit;
      if (dependency === "@/components/ui/flags") return { Flag: () => null };
      if (dependency === "@/components/ui/SuccessMotion") return { default: box };
      if (dependency === "./PaymentProviderDemo") return { default: () => React.createElement("span", null, accountCopy(locale).providersDisconnected) };
      if (dependency === "./PaymentChannelOptions") return { default: () => React.createElement("span", null, paymentChannelText(locale, "notMoney")) };
      if (dependency === "@/lib/local-preview") return { isLocalPreview: preview, PREVIEW_WALLET };
      if (dependency === "@/lib/provider-demo") return { demoAmountMinor, nextDemoPaymentStatus };
      if (dependency === "@/lib/payment-channels") return paymentChannels;
      if (dependency === "@/lib/i18n/payment-channels") return { paymentChannelText };
      if (dependency === "@/lib/verification/sumsub-demo") return { createSumsubDemoState, canPrepareSumsubDemo, canChooseSumsubDemoResult, transitionSumsubDemo, SUMSUB_CHECKLIST };
      if (dependency === "@/lib/circles/allowance") return { KYC_TIER_CEILING };
      if (dependency === "@/components/ui/OperationalAllowanceExplainer") return { Stage2Pill: () => null, WhyExistsLink: box };
      if (dependency === "@/components/ui/OrganizerVerification") return { default: () => null };
      if (dependency === "@/lib/supabase/env") return { supabaseConfigured: () => false };
      if (dependency === "@/lib/supabase/client") return { createSupabaseBrowser: forbidden };
      if (dependency === "@/app/actions") return { walletState: mounted?.walletState ?? forbidden, myHandle: forbidden, topUpSandbox: forbidden, withdrawSandbox: forbidden, renameUsername: forbidden, registerUsername: forbidden };
      if (dependency === "@/app/account-actions") return { settingsHandle: forbidden };
      if (dependency.endsWith(".module.css")) return { default: new Proxy({}, { get: (_, key) => key }) };
      throw new Error(`Unexpected dependency: ${dependency}`);
    },
  });
  return renderToStaticMarkup(React.createElement(screen.default, props));
}

test("all account copy keys exist in all four locales with identical interpolation placeholders", () => {
  const keys = Object.keys(ACCOUNT_COPY.en) as AccountCopyKey[];
  assert.ok(keys.length > 150);
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(ACCOUNT_COPY[locale]), keys);
    for (const key of keys) {
      assert.ok(ACCOUNT_COPY[locale][key].trim(), `${locale}/${key}`);
      const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
      assert.deepEqual(placeholders(ACCOUNT_COPY[locale][key]), placeholders(ACCOUNT_COPY.en[key]), `${locale}/${key}`);
      assert.ok(!ACCOUNT_COPY[locale][key].includes("—"));
    }
  }
  assert.strictEqual(accountCopy("invalid" as Locale), ACCOUNT_COPY.en);
});

test("interpolation preserves exact numeric warnings and does not erase unknown placeholders", () => {
  for (const locale of LOCALES) {
    assert.ok(accountText(locale, "decimalError", { dp: 7 }).includes("7"));
    assert.ok(accountText(locale, "upTo", { value: 10 }).includes("10%"));
    assert.ok(accountText(locale, "previewChecks", { kind: "NGO" }).includes("NGO"));
    assert.ok(accountText(locale, "tierWarning", {}).includes("{tier}"));
  }
});

for (const locale of LOCALES) {
  const c = accountCopy(locale);
  test(`${locale}: actual account and preference screens localize warnings and option descriptions`, () => {
    const settings = render("SettingsScreen", locale);
    for (const key of ["previewAccount", "localReminders", "biometricUnavailable", "pinUnavailable", "visibilityPlanned", "testnetTerms"] as const) assert.ok(settings.includes(c[key]), key);
    assert.ok(settings.includes(accountCurrencyName(locale, "en")));
    const languages = render("LanguagePickerScreen", locale);
    for (const language of LOCALES) assert.ok(languages.includes(accountLanguageName(locale, language)));
    const currencies = render("CurrencyPickerScreen", locale);
    assert.ok(currencies.includes(c.currencyWarning));
    for (const currency of LOCALES) assert.ok(currencies.includes(accountCurrencyName(locale, currency)));
    if (locale !== "en") assert.ok(!currencies.includes(accountCopy("en").currencyWarning));
  });
  test(`${locale}: actual provider UI retains not-connected, Mayar restriction and no-money meaning`, () => {
    const topup = render("PaymentProviderDemo", locale);
    assert.ok(topup.includes(c.providersDisconnected));
    assert.ok(topup.includes(c.exploreCheckout));
    assert.ok(topup.includes(c.localOnly));
    const payout = render("PaymentProviderDemo", locale, true, { payout: true });
    for (const key of ["notCash", "rehearsePayout", "noAccountDetails"] as const) assert.ok(payout.includes(c[key]), key);
    assert.ok(payout.includes(paymentChannelText(locale, "mayarPayout")));
    const mayarInput = payout.match(/<input\b[^>]*\bvalue="mayar"[^>]*>/)?.[0];
    assert.ok(mayarInput);
    assert.match(mayarInput, /\bdisabled=""/);
    assert.match(payout, /name="provider"/);
    assert.doesNotMatch(payout, /type="(?:file|email|password)"/);
  });
  test(`${locale}: real non-preview faucet and withdrawal surfaces retain Testnet/sandbox warnings`, () => {
    const topup = render("TopUpScreen", locale, false);
    assert.ok(topup.includes(xlmDepositCopy(locale).deposit));
    assert.ok(topup.includes(xlmDepositCopy(locale).warning));
    const withdraw = render("WithdrawScreen", locale, false);
    for (const key of ["noCashOut", "withdrawalIntro", "withdrawalsPlanned", "reviewSandbox"] as const) assert.ok(withdraw.includes(c[key]), key);
  });
  test(`${locale}: mounted withdrawal reports a returned wallet failure without a zero balance or perpetual loading`, async () => {
    const slots: unknown[] = [], effects: (() => void)[] = [];
    let cursor = 0, mountedOnce = false, reads = 0;
    const forbidden = () => { throw Error("Wallet localization failure fixture forbids writes"); };
    const hooks = { ...React,
      useState(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], (value: unknown) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
      useRef(initial: unknown) { const index = cursor++; return slots[index] ?? (slots[index] = { current: initial }); },
      useEffect(callback: () => void) { if (!mountedOnce) effects.push(callback); },
      useTransition: () => [false, forbidden],
    } as unknown as typeof React;
    const runtime = { hooks, walletState: async () => { reads++; return { ok: false as const, error: "Isolated unavailable wallet" }; } };
    const draw = () => { cursor = 0; return render("WithdrawScreen", locale, false, {}, runtime); };
    assert.ok(draw().includes(c.loading)); mountedOnce = true;
    for (const effect of effects) effect(); await new Promise(resolve => setImmediate(resolve));
    const html = draw(); assert.ok(html.includes(c.balanceLoad)); assert.match(html, /role="alert"/);
    assert.equal(html.includes(c.loading), false); assert.doesNotMatch(html, /data-money-value=/);
    assert.ok(html.includes(c.withdrawalsPlanned)); assert.match(html, /disabled=""/); assert.equal(reads, 1);
  });
  test(`${locale}: actual KYC surface localizes checklist and preserves no-verification/proposed-tier warnings`, () => {
    const kyc = render("KycTierScreen", locale);
    for (const key of ["notConnected", "sumsubWarning", "identityDocumentBody", "selfieBody", "sumsubNoUpload", "webhookWarning", "memoryOnly", "noIdentityFooter"] as const) assert.ok(kyc.includes(c[key]), key);
    const guarded = render("KycTierScreen", locale, false);
    assert.ok(guarded.includes(c.simulationGuard));
    assert.match(guarded, /disabled=""/);
  });
}

test("owned rendered screens contain no untranslated user-facing JSX prose", () => {
  const allowed = /^(?:Testnet|Salapi · Testnet|Salapi 1\.0 · testnet ·|·|@|↗)$/;
  for (const name of files) {
    const ast = ts.createSourceFile(`${name}.tsx`, sources[name], ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node: ts.Node) {
      if (ts.isJsxText(node)) {
        const prose = node.text.trim();
        if (prose) assert.ok(allowed.test(prose), `${name} untranslated JSX: ${prose}`);
      }
      if (ts.isJsxAttribute(node) && ["aria-label", "ariaLabel", "alt", "title"].includes(node.name.getText(ast)) && node.initializer && ts.isStringLiteral(node.initializer)) assert.fail(`${name} untranslated attribute: ${node.getText(ast)}`);
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
});
