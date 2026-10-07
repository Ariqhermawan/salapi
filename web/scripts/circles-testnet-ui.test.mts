import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { CircleTestnetCampaignResult, CircleTestnetCode } from "../lib/circles/testnet.ts";
import type { Locale } from "../lib/i18n/config.ts";
import { circleTestnetDonateCopy, type CircleTestnetDonateMessage } from "../lib/i18n/circle-testnet-donate.ts";
import { estimateUsdc, marketGoalProgress, validateMarketPrices, type MarketPriceResult } from "../lib/market-prices.ts";

const unavailablePrices: MarketPriceResult = { status: "unavailable", source: "CoinGecko", reason: "provider-unavailable" };
function prices(xlmUsd = .25, status: "fresh" | "stale" = "fresh", age = 0): MarketPriceResult {
  const timestamp = Math.floor((Date.now() - age) / 1000);
  return { status, source: "CoinGecko", fetchedAt: timestamp, assets: {
    xlm: { prices: { usd: xlmUsd, php: 14, idr: 4000, vnd: 6250 }, updatedAt: timestamp },
    usdc: { prices: { usd: .5, php: 28, idr: 8000, vnd: 12500 }, updatedAt: timestamp },
  } };
}

const wallet = "GDWYDMY2WDL4MCKMYQ6CWZJP526K6YHLRK3EG6IF2IJTX3EHZU3RRB72";
const reviewers = [wallet, "GCBKRBBNTQ2YA7U7SOC2NTZCCACFIIQCLKKO2FJYL5WJP5QVYH6UNDHL", "GCUBT6T7SMQKJE5L2TJLUQQPSBBU5GVHALGLWWECEJUIV2YFFCSXGHY7"];
const contract = "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU";
const ready = (circleId = "tino-relief"): CircleTestnetCampaignResult => ({
  ok: true, available: true, circleId, network: "testnet", contractId: contract, qaLabel: "QA Testnet · fictional cause",
  status: "ready", donationOpen: true, now: "1791340200",
  mapping: { campaignId: "9", creatorWallet: wallet, beneficiaryWallet: wallet, approverWallets: reviewers,
    creatorCutBps: 0, fundingDeadline: "1791340800", reviewDeadline: "1791341400" },
  campaign: { id: "9", title: `QA Circles: ${circleId}`, state: "Funding", total: "123456789", escrow: "23456789",
    config: { creator: wallet, beneficiary: wallet, approvers: reviewers,
      token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC", creator_cut_bps: 0,
      funding_deadline: "1791340800", review_deadline: "1791341400" },
    proofHash: null, proofUrl: "", approvals: [] },
});
const failure = (code: CircleTestnetCode = "unmapped", circleId = "tino-relief"): CircleTestnetCampaignResult => ({
  ok: false, available: false, circleId, network: "testnet", contractId: contract, qaLabel: "QA Testnet · fictional cause",
  code, donationOpen: false, campaign: null, mapping: null, now: null,
});
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const summaryCode = compile("../components/CircleTestnetSummary.tsx");
function summary(locale: Locale = "en", ownResult: CircleTestnetCampaignResult | null = null, marketPrices: MarketPriceResult = unavailablePrices) {
  const calls = { hooks: [] as [string, boolean][], refresh: 0 };
  const exports = {} as { default: React.ComponentType<{ circleId: string; result?: CircleTestnetCampaignResult | null; loading?: boolean; onRefresh?: () => void; hideDonate?: boolean; hideDetailsLink?: boolean; compact?: boolean; goalUsdc?: number }> };
  runInNewContext(summaryCode, { exports, require(name: string) {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "@/components/I18nProvider") return { useT: () => ({ locale }) };
    if (name === "@/components/MarketPricesProvider") return { useMarketPrices: () => ({ prices: marketPrices }) };
    if (name === "@/lib/market-prices") return { estimateUsdc, marketGoalProgress, validateMarketPrices };
    if (name === "@/lib/ui/useCircleTestnet") return { useCircleTestnet(slug: string, enabled: boolean) {
      calls.hooks.push([slug, enabled]); return { result: ownResult, loading: ownResult === null, refresh: async () => { calls.refresh++; return ownResult; } };
    } };
    if (name === "next/link") return { __esModule: true, default: (props: { href: string; className?: string; children: React.ReactNode }) => React.createElement("a", props, props.children) };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    throw new Error(`Unexpected summary dependency, network/custody forbidden: ${name}`);
  } });
  return { component: exports.default, calls };
}

for (const locale of ["en", "id", "tl", "vi"] as const) test(`${locale}: summary separates actual native XLM and fictional goals with exact target links`, () => {
  const h = summary(locale);
  const html = renderToStaticMarkup(React.createElement(h.component, { circleId: "tino-relief", result: ready() }));
  assert.match(html, /data-testid="circle-testnet-summary"/);
  assert.match(html, new RegExp(locale === "id" || locale === "vi" ? "12,3456789 XLM" : "12.3456789 XLM"));
  assert.match(html, new RegExp(locale === "id" || locale === "vi" ? "2,3456789 XLM" : "2.3456789 XLM"));
  assert.match(html, /href="\/circles\/tino-relief\/donate"/);
  assert.match(html, /href="\/campaigns\?id=9"/); assert.match(html, /0 \/ 3/); assert.match(html, /UTC/);
  assert.ok(html.includes(wallet)); for (const reviewer of reviewers) assert.ok(html.includes(reviewer));
  assert.deepEqual(h.calls.hooks, [["tino-relief", false]], "Supplied result must not trigger another fetch");
  assert.doesNotMatch(html, /≈|pesoRaised|salapi user|email|1000|184500/i);
});

for (const locale of ["en", "id", "tl", "vi"] as const) test(`${locale}: current USDC estimates use actual totals and a fixed QA goal`, () => {
  const h = summary(locale, null, prices());
  const html = renderToStaticMarkup(React.createElement(h.component, { circleId: "tino-relief", result: ready(), goalUsdc: 10 }));
  const comma = locale === "id" || locale === "vi";
  assert.ok(html.includes(comma ? "≈ 6,17 USDC" : "≈ 6.17 USDC"));
  assert.ok(html.includes(comma ? "≈ 1,17 USDC" : "≈ 1.17 USDC"));
  assert.ok(html.includes(comma ? "61,73%" : "61.73%"));
  assert.match(html, /role="progressbar"/); assert.match(html, /CoinGecko/);
  assert.match(html, /10[.,]00 USDC/);
  assert.doesNotMatch(html, /74%|184500|pesoRaised/);
});

test("price movement changes estimated progress, while the displayed XLM and QA goal stay fixed", () => {
  const h = summary("en", null, prices(.5));
  const html = renderToStaticMarkup(React.createElement(h.component, { circleId: "tino-relief", result: ready(), goalUsdc: 10 }));
  assert.match(html, /12\.3456789 XLM/); assert.match(html, /10\.00 USDC/); assert.match(html, /123\.46%/);
  assert.match(html, /aria-valuenow="100"/); assert.match(html, /width:100%/);
});

test("stale estimates are labelled and expired prices never render estimates or fake progress", () => {
  const stale = summary("en", null, prices(.25, "stale", 180_000));
  const staleHtml = renderToStaticMarkup(React.createElement(stale.component, { circleId: "tino-relief", result: ready(), goalUsdc: 10 }));
  assert.match(staleHtml, /Last known price/); assert.match(staleHtml, /≈ 6\.17 USDC/);
  const expired = summary("en", null, prices(.25, "fresh", 301_000));
  const expiredHtml = renderToStaticMarkup(React.createElement(expired.component, { circleId: "tino-relief", result: ready(), goalUsdc: 10 }));
  assert.match(expiredHtml, /12\.3456789 XLM/); assert.match(expiredHtml, /10\.00 USDC/);
  assert.match(expiredHtml, /USDC estimate unavailable/); assert.doesNotMatch(expiredHtml, /≈|role="progressbar"|61\.73%/);
});

test("unverified campaign data and invalid goals cannot create market progress", () => {
  const h = summary("en", null, prices());
  for (const goalUsdc of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const html = renderToStaticMarkup(React.createElement(h.component, { circleId: "tino-relief", result: ready(), goalUsdc }));
    assert.doesNotMatch(html, /role="progressbar"|QA goal|Infinity|NaN/);
  }
  const html = renderToStaticMarkup(React.createElement(h.component, { circleId: "tino-relief", result: failure(), goalUsdc: 10 }));
  assert.doesNotMatch(html, /USDC|≈|role="progressbar"/);
});

test("unavailable/setup/unmapped/local states expose no wallet, total or active donation CTA", () => {
  for (const code of ["invalid_circle", "not_configured", "unmapped", "unavailable", "local_preview"] as const) {
    const h = summary(); const html = renderToStaticMarkup(React.createElement(h.component, { circleId: "tino-relief", result: failure(code) }));
    assert.match(html, /role="status"/); assert.doesNotMatch(html, /12\.3456789|href="\/campaigns|href="\/circles\/tino-relief\/donate/);
    assert.ok(!html.includes(wallet)); assert.ok(!html.includes(contract));
  }
});

test("expired and terminal campaigns retain verified history, but never offer donation", () => {
  const h = summary(); const original = ready(); assert.ok(original.ok);
  for (const status of ["expired", "closed"] as const) {
    const html = renderToStaticMarkup(React.createElement(h.component, { circleId: "tino-relief", result: { ...original, status, donationOpen: false } }));
    assert.match(html, /12\.3456789 XLM/); assert.match(html, /href="\/campaigns\?id=9"/);
    assert.doesNotMatch(html, /href="\/circles\/tino-relief\/donate"/);
  }
});

test("loading and a previous route result never flash a mismatched recipient or amount", () => {
  const h = summary();
  for (const props of [{ circleId: "tino-relief", result: ready(), loading: true }, { circleId: "cats-recovery", result: ready() }]) {
    const html = renderToStaticMarkup(React.createElement(h.component, props));
    assert.doesNotMatch(html, /12\.3456789|href="\/campaigns|href="\/circles\/tino-relief\/donate/); assert.ok(!html.includes(wallet));
  }
});

test("proof hash and approvals are presented as references, never verified-delivery certification", () => {
  const h = summary(); const value = ready(); assert.ok(value.ok);
  const html = renderToStaticMarkup(React.createElement(h.component, { circleId: "tino-relief", result: {
    ...value, status: "closed", donationOpen: false, campaign: { ...value.campaign,
      state: "PendingProof", proofHash: "ab".repeat(32), proofUrl: "https://example.com/proof", approvals: reviewers.slice(0, 2) },
  } }));
  assert.ok(html.includes("ab".repeat(32))); assert.match(html, /2 \/ 3/);
  assert.match(html, /not independent verification of delivery/); assert.doesNotMatch(html, /Verified NGO|delivery confirmed/);
});

test("summary without supplied data enables its one public mapping hook", () => {
  const h = summary("en", failure());
  renderToStaticMarkup(React.createElement(h.component, { circleId: "tino-relief" }));
  assert.deepEqual(h.calls.hooks, [["tino-relief", true]]);
});

test("native donation screen can hide redundant donate CTA while retaining exact on-chain details link", () => {
  const h = summary();
  const html = renderToStaticMarkup(React.createElement(h.component, { circleId: "tino-relief", result: ready(), hideDonate: true }));
  assert.doesNotMatch(html, /href="\/circles\/tino-relief\/donate"/); assert.match(html, /href="\/campaigns\?id=9"/);
});

test("compact campaign summary keeps exact totals but removes cross-flow links and collapses technical proof", () => {
  const h = summary();
  const html = renderToStaticMarkup(React.createElement(h.component, { circleId: "tino-relief", result: ready(), hideDonate: true, hideDetailsLink: true, compact: true }));
  assert.match(html, /12.3456789 XLM/);
  assert.doesNotMatch(html, /href=|<details[^>]*open/);
  assert.ok(html.indexOf("On-chain proof reference") > html.indexOf("<details"));
  assert.ok(html.indexOf("On-chain proof reference") < html.indexOf("</details>"));
});

test("every actual donation UI copy call has complete four-locale translation, no bilingual inline fallback", () => {
  const source = readFileSync(new URL("../components/CircleTestnetDonate.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("donate.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const messages = new Set<string>();
  function scan(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "text") {
      assert.equal(node.arguments.length, 1); assert.ok(ts.isStringLiteral(node.arguments[0])); messages.add(node.arguments[0].text);
    }
    ts.forEachChild(node, scan);
  }
  scan(tree); assert.ok(messages.size >= 35);
  for (const locale of ["en", "id", "tl", "vi"] as const) for (const message of messages) {
    const translated = circleTestnetDonateCopy(locale)(message as CircleTestnetDonateMessage);
    assert.equal(typeof translated, "string"); assert.ok(translated.length > 0, `${locale}: ${message}`);
    if (locale === "en") assert.equal(translated, message);
  }
  assert.equal(circleTestnetDonateCopy("id")("Anonymous"), "Anonim");
  assert.equal(circleTestnetDonateCopy("vi")("Anonymous"), "Ẩn danh");
  assert.equal(circleTestnetDonateCopy("tl")("Back"), "Bumalik");
});

type Effect = { callback: () => void | (() => void); deps: readonly unknown[]; cleanup?: () => void };
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let index = 0; index < 12; index++) await Promise.resolve(); }
function hookHarness() {
  const cells: unknown[] = [];
  const effects = new Map<number, Effect>(), pending = new Map<number, Effect>();
  const reads: { slug: string; result: ReturnType<typeof deferred<CircleTestnetCampaignResult>> }[] = [];
  let cursor = 0;
  const exports = {} as { useCircleTestnet(slug: string, enabled?: boolean): { result: CircleTestnetCampaignResult | null; loading: boolean; refresh(): Promise<CircleTestnetCampaignResult | null> } };
  runInNewContext(compile("../lib/ui/useCircleTestnet.ts"), { exports, queueMicrotask, require(name: string) {
    if (name === "@/lib/ui/public-read") return { readPublicCircleTestnet(slug: string) {
      const result = deferred<CircleTestnetCampaignResult>(); reads.push({ slug, result }); return result.promise;
    } };
    if (name === "react") return {
      useState(initial: unknown) { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial;
        return [cells[index], (value: unknown) => { cells[index] = typeof value === "function" ? value(cells[index]) : value; }]; },
      useRef(initial: unknown) { const index = cursor++; return cells[index] ?? (cells[index] = { current: initial }); },
      useCallback(callback: unknown, deps: readonly unknown[]) { const index = cursor++; const old = cells[index] as { callback: unknown; deps: readonly unknown[] } | undefined;
        if (!old || deps.some((value, n) => !Object.is(value, old.deps[n]))) cells[index] = { callback, deps };
        return (cells[index] as { callback: unknown }).callback; },
      useEffect(callback: Effect["callback"], deps: readonly unknown[]) { const index = cursor++; const old = effects.get(index);
        if (!old || deps.some((value, n) => !Object.is(value, old.deps[n]))) pending.set(index, { callback, deps }); },
    };
    throw new Error(`Unexpected hook dependency: ${name}`);
  } });
  function render(slug = "tino-relief", enabled = true) {
    cursor = 0; const value = exports.useCircleTestnet(slug, enabled);
    for (const [index, effect] of pending) { effects.get(index)?.cleanup?.(); effects.set(index, { ...effect, cleanup: effect.callback() || undefined }); }
    pending.clear(); return value;
  }
  return { render, reads, cleanup() { for (const effect of effects.values()) effect.cleanup?.(); effects.clear(); } };
}

test("real public mapping hook reads once on mount and no network when disabled", async () => {
  const disabled = hookHarness(); assert.equal(disabled.render("tino-relief", false).loading, false); await flush(); assert.equal(disabled.reads.length, 0);
  const h = hookHarness(); assert.equal(h.render().loading, true); await flush(); assert.equal(h.reads.length, 1);
  h.reads[0].result.resolve(ready()); await flush(); const result = h.render();
  assert.equal(result.result?.ok, true); assert.equal(result.loading, false); assert.equal(h.reads.length, 1);
});

test("late previous-route response never overwrites the next cause", async () => {
  const h = hookHarness(); h.render(); await flush(); h.render("cats-recovery"); await flush();
  h.reads[1].result.resolve(ready("cats-recovery")); await flush(); h.reads[0].result.resolve(ready()); await flush();
  const current = h.render("cats-recovery"); assert.equal(current.result?.circleId, "cats-recovery"); assert.equal(current.loading, false);
});

test("newest refresh wins and mismatched slug response fails closed", async () => {
  const h = hookHarness(); h.render(); await flush(); const next = h.render().refresh();
  h.reads[1].result.resolve(failure()); await next; h.reads[0].result.resolve(ready()); await flush();
  assert.equal(h.render().result?.ok, false);
  const reload = h.render().refresh(); h.reads[2].result.resolve(ready("cats-recovery")); await reload;
  const result = h.render().result; assert.equal(result?.circleId, "tino-relief"); assert.equal(result?.ok, false);
});

test("unmount/StrictMode remount rejects previous effect response and action error clears loading", async () => {
  const h = hookHarness(); h.render(); await flush(); h.cleanup(); h.render(); await flush();
  assert.equal(h.reads.length, 2); h.reads[0].result.resolve(ready()); await flush(); assert.equal(h.render().result, null);
  h.reads[1].result.reject(new Error("Unavailable")); await flush(); const value = h.render();
  assert.equal(value.loading, false); assert.equal(value.result?.ok, false);
});

test("styles wrap full addresses, maintain touch target and responsive two-column metrics", () => {
  const css = readFileSync(new URL("../components/CircleTestnetSummary.module.css", import.meta.url), "utf8");
  assert.match(css, /overflow-wrap: anywhere/); assert.match(css, /min-height: 44px/);
  assert.match(css, /repeat\(2, minmax\(0, 1fr\)\)/); assert.match(css, /max-width: 370px/);
});
