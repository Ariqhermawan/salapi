import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { validateMarketPrices } from "../lib/market-prices.ts";
import { exampleGoalUsd, fundingUsdProgress } from "../lib/home-circle-funding.ts";
import { progressPct, type Circle } from "../lib/circles/types.ts";
import { homeCatalogCopy } from "../lib/i18n/revamp-home-catalog.ts";
import type { MarketPriceResult } from "../lib/market-prices.ts";
import type { CircleTestnetCampaignResult, CircleTestnetCode } from "../lib/circles/testnet.ts";
import type { Locale } from "../lib/i18n/config.ts";

// Isolated render fixtures. No network, auth, wallet or ledger is accessed.
const circle = { id: "tino-relief", pesoRaised: 7400, pesoTarget: 10000, status: "funding" } as Circle;
const now = Date.now();
const quote = (xlm = .25, age = 0): MarketPriceResult => ({
  status: "fresh", source: "CoinGecko", fetchedAt: Math.floor(now / 1000),
  assets: { xlm: { prices: { usd: xlm, php: xlm * 58, idr: xlm * 16000, vnd: xlm * 25000 }, updatedAt: Math.floor((now - age) / 1000) },
    usdc: { prices: { usd: .5, php: 29, idr: 8000, vnd: 12500 }, updatedAt: Math.floor((now - age) / 1000) } },
});
const unavailable: MarketPriceResult = { status: "unavailable", source: "CoinGecko", reason: "provider-unavailable" };
const ready = (total = "1000000000", circleId = circle.id): CircleTestnetCampaignResult => ({
  ok: true, available: true, network: "testnet", contractId: "isolated-contract", circleId,
  qaLabel: "QA Testnet · fictional cause", status: "ready", donationOpen: true, now: "100",
  donorSummary: { ok: true, campaignId: "6", count: 2, basis: "accounts", coverage: "complete", confirmedTotalStroops: total },
  mapping: { campaignId: "6", creatorWallet: "isolated-creator", beneficiaryWallet: "isolated-recipient", approverWallets: [], creatorCutBps: 0, fundingDeadline: "200", reviewDeadline: "300" },
  campaign: { id: "6", title: `QA Circles: ${circleId}`, state: "Funding", total, escrow: total, proofHash: null, proofUrl: "", approvals: [],
    config: { creator: "isolated-creator", beneficiary: "isolated-recipient", token: "isolated-token", creator_cut_bps: 0, approvers: [], funding_deadline: "200", review_deadline: "300" } },
});
const failure = (code: CircleTestnetCode): CircleTestnetCampaignResult => ({
  ok: false, available: false, network: "testnet", contractId: null, circleId: circle.id,
  qaLabel: "QA Testnet · fictional cause", code, donationOpen: false, mapping: null, campaign: null, now: null,
});
const compiled = ts.transpileModule(readFileSync(new URL("../components/HomeCircleFundingProgress.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
function fixture(options: { preview?: boolean; locale?: Locale; result?: CircleTestnetCampaignResult | null; loading?: boolean; prices?: MarketPriceResult } = {}) {
  const locale = options.locale ?? "en";
  const calls = { readers: [] as [string, boolean][], prices: 0 };
  const exports = {} as { default: React.ComponentType<{ circle: Circle; active: boolean }> };
  runInNewContext(compiled, { exports, BigInt, Date, require(name: string) {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "@phosphor-icons/react/dist/csr/Users") return { Users: () => React.createElement("svg", { "aria-hidden": true }) };
    if (name === "@/components/I18nProvider") return { useT: () => ({ locale }) };
    if (name === "@/components/MarketPricesProvider") return { useMarketPrices: () => { calls.prices++; return { prices: options.prices ?? quote() }; } };
    if (name === "@/lib/ui/useCircleTestnet") return { useCircleTestnet(slug: string, enabled: boolean) {
      calls.readers.push([slug, enabled]); return { result: options.result ?? null, loading: options.loading ?? options.result == null };
    } };
    if (name === "@/lib/market-prices") return { validateMarketPrices };
    if (name === "@/lib/home-circle-funding") return { exampleGoalUsd, fundingUsdProgress };
    if (name === "@/lib/circles/types") return { progressPct };
    if (name === "@/lib/i18n/revamp-home-catalog") return { homeCatalogCopy };
    if (name === "@/lib/local-preview") return { isLocalPreview: options.preview ?? false };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => key }) };
    throw Error(`Unexpected dependency, network forbidden: ${name}`);
  } });
  return { calls, render: (active = true, selected = circle) => renderToStaticMarkup(React.createElement(exports.default, { circle: selected, active })) };
}

test("all 27 catalog cards mount exactly one public reader, while preview and completed examples mount none", () => {
  const h = fixture({ result: ready() });
  for (let i = 0; i < 27; i++) h.render(i === 4, { ...circle, id: i === 4 ? circle.id : `isolated-card-${i}` });
  assert.deepEqual(h.calls.readers, [[circle.id, true]]);
  assert.equal(h.calls.prices, 1);
  for (const options of [{ preview: true }, {}]) {
    const example = fixture(options);
    const html = example.render(true, options.preview ? circle : { ...circle, status: "completed" });
    assert.match(html, /data-funding-kind="example"/); assert.match(html, /74%/);
    assert.deepEqual(example.calls.readers, []); assert.equal(example.calls.prices, 0);
  }
});

test("USD primary uses XLM/USD directly, never the USDC price, and contributors stay beside XLM", () => {
  const h = fixture({ result: ready() }); const html = h.render();
  assert.match(html, /data-funding-kind="testnet"/); assert.match(html, /100 XLM/);
  assert.match(html, /≈ \$25\.00 <small>USD/); assert.match(html, /Example goal: \$172\.41 USD/); assert.match(html, /14\.5%/);
  assert.match(html, /2 contributors/); assert.match(html, /Based on confirmed donor records/);
  assert.doesNotMatch(html, /USDC/);
  assert.doesNotMatch(html, /74%|Example progress/);
  const moved = fixture({ result: ready(), prices: quote(.5) }).render();
  assert.match(moved, /≈ \$50\.00 <small>USD/); assert.match(moved, /29%/);
});

test("unavailable prices preserve exact totals and fixed QA goal without fake percentage", () => {
  const html = fixture({ result: ready("95538290085"), prices: unavailable }).render();
  assert.match(html, /9553\.8290085 XLM/); assert.match(html, /USD estimate unavailable/);
  assert.match(html, /Example goal: \$172\.41 USD/); assert.doesNotMatch(html, /<progress|74%|0%/);
});

test("expired CoinGecko quote removes the market estimate and percentage while preserving native contributions", () => {
  const html = fixture({ result: ready("123456789"), prices: quote(.25, 301000) }).render();
  assert.match(html, /data-market-status="unavailable"/);
  assert.match(html, /12\.3456789 XLM/); assert.match(html, /Example goal: \$172\.41 USD/);
  assert.match(html, /USD estimate unavailable/);
  assert.doesNotMatch(html, /≈|<progress|[0-9]+%|74%|0 XLM/);
});

test("loading, wrong campaign and unavailable linkage never display old or fixture funding", () => {
  for (const options of [{ result: ready(), loading: true }, { result: ready("1000000000", "other-campaign"), loading: false },
    { result: failure("unavailable") }, { result: failure("not_configured") }, { result: failure("invalid_circle") }]) {
    const html = fixture(options).render();
    assert.match(html, /role="status"/); assert.doesNotMatch(html, /100 XLM|74%|0 XLM|data-funding-kind="example"|<progress/);
  }
  const inactive = fixture({ result: ready() }); const html = inactive.render(false);
  assert.match(html, /View campaign for funding/); assert.doesNotMatch(html, /100 XLM|74%/);
  assert.deepEqual(inactive.calls.readers, []);
  const unmapped = fixture({ result: failure("unmapped") }).render();
  assert.match(unmapped, /data-funding-kind="example"/); assert.match(unmapped, /Example progress/); assert.match(unmapped, /74%/);
});

test("zero, overfunding and stale estimates are truthfully distinguished", () => {
  const zero = fixture({ result: ready("0") }).render(); assert.match(zero, /0 XLM/); assert.match(zero, /\$0\.00 <small>USD/); assert.match(zero, /0%/);
  const over = fixture({ result: ready("20000000000") }).render(); assert.match(over, /290%/); assert.match(over, /<progress value="100"/);
  const stale = fixture({ result: ready(), prices: quote(.25, 121000) }).render();
  assert.match(stale, /data-market-status="stale"/); assert.match(stale, /Last known price/);
});

test("four locales retain exact XLM and localized QA goal/market estimates", () => {
  for (const locale of ["en", "id", "tl", "vi"] as const) {
    const html = fixture({ locale, result: ready("123456789") }).render();
    assert.match(html, /12\.3456789 XLM/); assert.match(html, /USD/);
    assert.match(html, new RegExp({ en: "Example goal", id: "Target contoh", tl: "Halimbawang goal", vi: "Mục tiêu minh họa" }[locale]));
    assert.doesNotMatch(html, /74%|Example progress/);
  }
});

test("missing or incomplete contributor metadata never turns into a fictional exact count or zero", () => {
  for (const donorSummary of [undefined, { ok: false, campaignId: "6", code: "unavailable" } as const,
    { ok: true, campaignId: "6", count: 0, basis: "accounts", coverage: "recorded", confirmedTotalStroops: "1000000000" } as const,
    { ok: true, campaignId: "6", count: 12, basis: "accounts", coverage: "complete", confirmedTotalStroops: "other-total" } as const]) {
    const result = ready(); assert.ok(result.ok);
    const html = fixture({ result: { ...result, donorSummary } }).render();
    assert.match(html, /Contributors unavailable/); assert.match(html, /100 XLM/); assert.match(html, /\$25\.00/);
    assert.doesNotMatch(html, /0 contributors|12 contributors/);
  }
  const result = ready(); assert.ok(result.ok);
  const html = fixture({ result: { ...result, donorSummary: { ok: true, campaignId: "6", count: 2, basis: "wallets", coverage: "recorded", confirmedTotalStroops: result.campaign.total } } }).render();
  assert.match(html, /2\+/); assert.match(html, /contributor wallets/); assert.match(html, /minimum recorded count/);
});

test("USD calculations preserve canonical confirmed amounts and reject expired quotes or invalid goals", () => {
  assert.deepEqual(fundingUsdProgress("1000000000", quote(), 50, now), { usd: 25, percentage: 50 });
  assert.deepEqual(fundingUsdProgress("1000000000", quote(), null, now), { usd: 25, percentage: null });
  assert.deepEqual(fundingUsdProgress("0", quote(), 50, now), { usd: 0, percentage: 0 });
  assert.equal(fundingUsdProgress("1000000000", quote(.25, 301000), 50, now), null);
  assert.equal(fundingUsdProgress("1000000000", unavailable, 50, now), null);
  for (const total of ["-1", "01", "1.0", "170141183460469231731687303715884105728"]) assert.equal(fundingUsdProgress(total, quote(), 50, now), null);
  assert.equal(exampleGoalUsd(0), null); assert.equal(exampleGoalUsd(Number.NaN), null);
  assert.equal(exampleGoalUsd(580), 10);
});
