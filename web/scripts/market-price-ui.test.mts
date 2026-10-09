import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parse, type Declaration, type Rule } from "postcss";
import ts from "typescript";
import { validateMarketPrices, formatMarketValue, QUOTE_REFRESH_MS } from "../lib/market-prices.ts";
import type { MarketPriceResult } from "../lib/market-prices.ts";

type Element = { type: unknown; props: Record<string, unknown> };
const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const providerCode = compile("../components/MarketPricesProvider.tsx");
const widgetCode = compile("../components/MarketValue.tsx");
const unavailable: MarketPriceResult = { status: "unavailable", source: "CoinGecko", reason: "provider-unavailable" };
const quote = (now: number, xlm = .2): MarketPriceResult => ({ status: "fresh", source: "CoinGecko", fetchedAt: Math.floor(now / 1000), assets: { xlm: { prices: { usd: xlm, php: xlm * 56, idr: xlm * 16000, vnd: xlm * 25000 }, updatedAt: Math.floor(now / 1000) }, usdc: { prices: { usd: .9998, php: 55.9888, idr: 15996.8, vnd: 24995 }, updatedAt: Math.floor(now / 1000) } } });
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : "";
}
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...nodes(node.props.children)];
}

/** Isolated hook/effect tests. No live provider, credentials or wallet mutation. */
function mountProvider(preview = false) {
  let now = Date.now(), cursor = 0, nextTimer = 0, hidden = false;
  const slots: unknown[] = [], effects: (() => void | (() => void))[] = [], cleanups: (() => void)[] = [];
  const timeouts = new Map<number, { callback: () => void; delay: number }>();
  const intervals = new Map<number, { callback: () => void; delay: number }>();
  const listeners = new Set<() => void>();
  const requests: { url: string; options: RequestInit; resolve: (response: { ok: boolean; json: () => Promise<unknown> }) => void; reject: (reason: unknown) => void }[] = [];
  const exported = {} as { MarketPricesProvider(props: { children: unknown }): Element };
  runInNewContext(providerCode, { exports: exported, Promise, AbortController, Date: { now: () => now },
    setTimeout(callback: () => void, delay: number) { const id = ++nextTimer; timeouts.set(id, { callback, delay }); return id; }, clearTimeout(id: number) { timeouts.delete(id); },
    setInterval(callback: () => void, delay: number) { const id = ++nextTimer; intervals.set(id, { callback, delay }); return id; }, clearInterval(id: number) { intervals.delete(id); },
    document: { get hidden() { return hidden; }, addEventListener(name: string, fn: () => void) { assert.equal(name, "visibilitychange"); listeners.add(fn); }, removeEventListener(_name: string, fn: () => void) { listeners.delete(fn); } },
    fetch(url: string, options: RequestInit) { assert.equal(url, "/api/market-prices"); return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })); },
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@/lib/local-preview") return { isLocalPreview: preview };
      if (name === "@/lib/market-prices") return { validateMarketPrices, QUOTE_REFRESH_MS };
      if (name === "react") return {
        createContext: () => "Context", useContext: () => null,
        useState(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (value: unknown) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
        useRef(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
        useCallback: (value: unknown) => value, useMemo: (fn: () => unknown) => fn(),
        useEffect(fn: () => void | (() => void), deps: unknown[]) { const i = cursor++; if (!(i in slots)) { slots[i] = deps; effects.push(fn); } },
      };
      throw Error(`Unexpected dependency ${name}`);
    },
  });
  let tree: Element;
  function render() { cursor = 0; tree = exported.MarketPricesProvider({ children: "children" }); }
  function value() { return tree.props.value as { prices: MarketPriceResult; loading: boolean; refresh: () => Promise<void> }; }
  async function flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); render(); }
  render(); for (const effect of effects.splice(0)) { const clean = effect(); if (clean) cleanups.push(clean); }
  return { value, requests, timeouts, intervals, listeners, flush,
    start() { for (const [id, task] of [...timeouts]) if (task.delay === 0) { timeouts.delete(id); task.callback(); } render(); },
    tick(delay: number) { for (const timer of intervals.values()) if (timer.delay === delay) timer.callback(); render(); },
    advance(ms: number) { now += ms; }, now: () => now,
    visibility(value: boolean) { hidden = value; for (const listener of listeners) listener(); render(); },
    resolve(index: number, body: unknown) { requests[index].resolve({ ok: true, json: async () => body }); },
    reject(index: number) { requests[index].reject(Error("Fixture unavailable")); },
    unmount() { for (const cleanup of cleanups) cleanup(); },
  };
}

test("preview never fetches public prices or installs polling and visibility listeners", () => {
  const h = mountProvider(true); h.start();
  assert.equal(h.requests.length, 0); assert.equal(h.intervals.size, 0); assert.equal(h.listeners.size, 0);
  assert.equal(h.value().loading, false); assert.equal(h.value().prices.status, "unavailable");
  h.unmount();
});

test("one provider deduplicates concurrent consumer refreshes and publishes fresh prices", async () => {
  const h = mountProvider(); h.start();
  const a = h.value().refresh(), b = h.value().refresh();
  assert.equal(a, b); assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].options.credentials, "same-origin");
  h.resolve(0, quote(h.now())); await h.flush();
  assert.equal(h.value().prices.status, "fresh"); assert.equal(h.value().loading, false);
  assert.equal(h.listeners.size, 1); h.unmount(); assert.equal(h.listeners.size, 0); assert.equal(h.intervals.size, 0);
});

test("same-origin quote request retains Preview access cookies without sending provider credentials", async () => {
  const h = mountProvider(); h.start();
  assert.equal(h.requests.length, 1);
  const request = h.requests[0];
  assert.equal(request.url, "/api/market-prices", "Quotes are requested from the app, never from a third-party provider");
  assert.equal(request.options.credentials, "same-origin", "Protected Preview access requires its same-origin cookie");
  assert.equal(request.options.cache, "no-store");
  assert.equal(request.options.headers, undefined, "No API key, provider header or custom authentication header reaches the browser");
  assert.equal(request.options.body, undefined);
  assert.deepEqual(Object.keys(request.options).sort(), ["cache", "credentials", "signal"]);
  h.resolve(0, quote(h.now())); await h.flush(); h.unmount();
});

test("automatic 60-second refresh updates the shared price and suppresses hidden polling", async () => {
  const h = mountProvider(); h.start(); h.resolve(0, quote(h.now())); await h.flush();
  h.advance(60_000); h.tick(QUOTE_REFRESH_MS); assert.equal(h.requests.length, 2);
  h.resolve(1, quote(h.now(), .3)); await h.flush();
  const prices = h.value().prices; assert.notEqual(prices.status, "unavailable");
  if (prices.status !== "unavailable") assert.equal(prices.assets.xlm.prices.usd, .3);
  h.visibility(true); h.tick(QUOTE_REFRESH_MS); assert.equal(h.requests.length, 2);
  h.visibility(false); assert.equal(h.requests.length, 3);
  h.unmount(); assert.equal(h.requests[2].options.signal?.aborted, true);
});

test("failed revalidation marks last known price stale and expiration removes it", async () => {
  const h = mountProvider(); h.start(); h.resolve(0, quote(h.now())); await h.flush();
  h.tick(QUOTE_REFRESH_MS); h.reject(1); await h.flush(); assert.equal(h.value().prices.status, "stale");
  h.advance(301_000); h.tick(1000); assert.equal(h.value().prices.status, "unavailable");
  h.unmount();
});

test("unavailable provider never produces a fake zero and aborted unmount discards late response", async () => {
  const h = mountProvider(); h.start(); h.resolve(0, { status: "unavailable", source: "CoinGecko", reason: "not-configured" }); await h.flush();
  assert.equal(h.value().prices.status, "unavailable"); assert.equal(h.value().loading, false);
  h.tick(QUOTE_REFRESH_MS); h.unmount(); h.resolve(1, quote(h.now())); await h.flush();
  assert.equal(h.value().prices.status, "unavailable"); assert.equal(h.requests[1].options.signal?.aborted, true);
});

function widget(options: { prices?: MarketPriceResult; locale?: "en" | "tl" | "id" | "vi"; currency?: "en" | "tl" | "id" | "vi"; nativeStroops?: string; loading?: boolean; showNative?: boolean; compact?: boolean; size?: number; color?: string; dashboard?: boolean; dashboardActions?: Element; dashboardCaption?: string; balanceLoading?: boolean; dashboardBalanceError?: Element } = {}) {
  const exported = {} as { default(props: { nativeStroops?: string; compact: boolean; showNative?: boolean; size?: number; color?: string; dashboard?: boolean; dashboardActions?: Element; dashboardCaption?: string; balanceLoading?: boolean; dashboardBalanceError?: Element }): Element };
  let refreshed = 0;
  runInNewContext(widgetCode, { exports: exported, Intl, Date, BigInt,
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale: options.locale ?? "en", currency: options.currency ?? "en" }) };
      if (name === "@/components/MarketPricesProvider") return { useMarketPrices: () => ({ prices: options.prices ?? unavailable, loading: options.loading ?? false, refresh: () => { refreshed++; return Promise.resolve(); } }) };
      if (name === "@/lib/market-prices") return { formatMarketValue, validateMarketPrices };
      if (name === "./MarketValue.module.css") return { default: new Proxy({}, { get: (_target, key) => String(key) }) };
      throw Error(`Unexpected dependency ${name}`);
    },
  });
  const tree = exported.default({ nativeStroops: options.nativeStroops, compact: options.compact ?? true, showNative: options.showNative, size: options.size, color: options.color, dashboard: options.dashboard, dashboardActions: options.dashboardActions, dashboardCaption: options.dashboardCaption, balanceLoading: options.balanceLoading, dashboardBalanceError: options.dashboardBalanceError });
  return { tree, text: text(tree), refreshCount: () => refreshed };
}

test("market widget values exact native XLM with current prices and preserves USDC reference boundary", () => {
  const h = widget({ prices: quote(Date.now()), nativeStroops: "95538290085" });
  assert.equal(h.tree.props["data-market-value"], "fresh");
  assert.match(h.text, /≈ \$1,910\.77/); assert.match(h.text, /9553\.8290085 XLM/);
  assert.match(h.text, /USDC \$0\.9998/); assert.match(h.text, /not USDC/); assert.match(h.text, /no monetary value/);
  assert.match(h.text, /Data powered by/);
  const attribution = nodes(h.tree).find(node => node.type === "a")!;
  assert.equal(attribution.props.href, "https://www.coingecko.com"); assert.equal(attribution.props.rel, "noopener noreferrer"); assert.equal(attribution.props.target, "_blank");
  assert.equal(nodes(attribution).find(node => node.type === "img")?.props.alt, "CoinGecko");
  assert.equal(nodes(nodes(h.tree).find(node => node.type === "details")!).includes(attribution), false, "Attribution remains outside collapsed details");
  const button = nodes(h.tree).find(node => node.type === "button")!;
  (button.props.onClick as () => void)(); assert.equal(h.refreshCount(), 1);
});

test("market widget honors separate currency preference instead of static FX or language", () => {
  const h = widget({ prices: quote(Date.now()), nativeStroops: "100000000", locale: "id", currency: "tl" });
  assert.match(h.text, /≈ ₱112\.00/); assert.match(h.text, /Data powered by/);
});

test("non-dashboard market widgets retain every currency preference independently of app language", () => {
  const nativeStroops = "54502084464", prices = quote(Date.now());
  for (const locale of ["en", "tl", "id", "vi"] as const) for (const currency of ["en", "tl", "id", "vi"] as const) {
    const h = widget({ prices, nativeStroops, locale, currency });
    const estimate = nodes(h.tree).find(node => node.props["data-market-estimate"] !== undefined)!;
    assert.equal(text(estimate), `≈ ${formatMarketValue(nativeStroops, prices, currency)}`);
    assert.doesNotMatch(text(estimate), /USD · |Live estimate/, "Home's USD live label cannot leak into transfer or receipt widgets");
    assert.equal(h.tree.props["data-market-layout"], undefined);
    assert.equal(text(nodes(h.tree).find(node => node.props["data-native-balance"] === nativeStroops)), "5450.2084464 XLM");
  }
});

test("no quote, stale quote, zero balance and absent balance remain distinct", () => {
  const missing = widget({ nativeStroops: "100000000" }); assert.match(missing.text, /Market price unavailable/); assert.doesNotMatch(missing.text, /≈ \$0/);
  assert.equal(text(nodes(missing.tree).find(node => node.type === "summary")!), "CoinGecko prices", "Unavailable data must not claim an update without a timestamp");
  const loading = widget({ nativeStroops: "100000000", loading: true }); assert.match(loading.text, /Loading market price/);
  const noBalance = widget({ prices: quote(Date.now()) }); assert.match(noBalance.text, /Exact XLM balance unavailable/);
  const zero = widget({ prices: quote(Date.now()), nativeStroops: "0" }); assert.match(zero.text, /≈ \$0\.00/);
  const stalePrices = quote(Date.now()); stalePrices.status = "stale";
  const stale = widget({ prices: stalePrices, nativeStroops: "100000000" }); assert.match(stale.text, /Last known price/);
});

test("all supported languages explain automatic cadence and Testnet-only valuation", () => {
  for (const locale of ["en", "tl", "id", "vi"] as const) {
    const h = widget({ prices: quote(Date.now()), nativeStroops: "10000000", locale });
    assert.match(h.text, /60/); assert.match(h.text, /USDC/); assert.match(h.text, /Testnet/);
  }
});

test("Home can show exact XLM outside collapsed price details even while prices are unavailable", () => {
  for (const locale of ["en", "tl", "id", "vi"] as const) for (const loading of [false, true]) {
    const h = widget({ nativeStroops: "95538290085", showNative: true, locale, loading });
    const balance = nodes(h.tree).find(node => node.props["data-native-balance"] === "95538290085");
    assert.ok(balance);
    assert.equal(text(balance), "9553.8290085 XLM", "All seven fractional digits remain exact without floating-point rounding");
    const details = nodes(h.tree).find(node => node.type === "details")!;
    assert.equal(nodes(details).includes(balance), false);
    assert.equal(text(details).includes("9553.8290085"), false, "Expanded details do not duplicate the visible balance");
    assert.equal(nodes(h.tree).filter(node => text(node) === "9553.8290085 XLM").length, 1);
    assert.equal(h.tree.props["data-market-value"], "unavailable");
    assert.doesNotMatch(h.text, /≈ \$0/);
  }
});

test("visible native amount distinguishes real zero from absent or invalid wallet data", () => {
  const zero = widget({ nativeStroops: "0", showNative: true });
  assert.equal(text(nodes(zero.tree).find(node => node.props["data-native-balance"] === "0")), "0 XLM");
  for (const nativeStroops of [undefined, "", "-1", "1.5", "9223372036854775808"]) {
    const h = widget({ nativeStroops, prices: quote(Date.now()), showNative: true });
    assert.equal(nodes(h.tree).some(node => node.props["data-native-balance"] !== undefined), false);
    assert.match(h.text, /Exact XLM balance unavailable/);
    assert.doesNotMatch(h.text, /0 XLM/);
  }
});

test("fiat estimate precedes smaller exact XLM in compact and full widgets by default", () => {
  for (const compact of [true, false]) {
    const h = widget({ prices: quote(Date.now()), nativeStroops: "95538290085", compact });
    const elements = nodes(h.tree);
    const estimate = elements.find(node => node.props["data-market-estimate"] !== undefined)!;
    const native = elements.find(node => node.props["data-native-balance"] === "95538290085")!;
    assert.ok(elements.indexOf(estimate) < elements.indexOf(native));
    assert.match(text(estimate), /^≈ \$/);
    assert.equal(text(native), "9553.8290085 XLM");
    assert.ok((estimate.props.style as { fontSize: number }).fontSize > (native.props.style as { fontSize: number }).fontSize);
    assert.equal((native.props.style as { fontWeight: number }).fontWeight, 500);
  }
  const hidden = widget({ prices: quote(Date.now()), nativeStroops: "95538290085", showNative: false });
  assert.equal(nodes(hidden.tree).some(node => node.props["data-native-balance"] !== undefined), false);
  assert.match(text(nodes(hidden.tree).find(node => node.type === "details")), /9553\.8290085 Native Testnet XLM/);
});

test("linked official CoinGecko logo and required short attribution remain visible in all locales", () => {
  for (const locale of ["en", "tl", "id", "vi"] as const) for (const color of ["currentColor", "#fff", "rgba(255, 255, 255, .8)"]) {
    const h = widget({ prices: quote(Date.now()), nativeStroops: "10000000", locale, color });
    const attribution = nodes(h.tree).find(node => node.props["data-price-attribution"] === "coingecko")!;
    assert.match(text(attribution), /Data powered by/);
    assert.doesNotMatch(text(attribution), /USD price data/, "Home's new provider caption does not alter generic widgets");
    assert.equal(attribution.props["aria-label"], undefined);
    assert.equal(nodes(attribution).some(node => node.props.className === "feedLabel" || node.props.className === "providerRow"), false, "Generic widgets retain their original single-row attribution structure");
    const link = nodes(attribution).find(node => node.type === "a")!;
    assert.equal(link.props.href, "https://www.coingecko.com");
    assert.equal(text(link), "", "Generic attribution keeps only the official logo inside its link");
    assert.equal(nodes(attribution).filter(node => node.type === "a").length, 1);
    const logo = nodes(link).find(node => node.type === "img")!;
    assert.equal(logo.props.src, color === "currentColor" ? "/brands/coingecko-white.svg" : "/brands/coingecko.svg");
    assert.equal(logo.props.height, 16); assert.equal(logo.props.alt, "CoinGecko");
    assert.equal(nodes(nodes(h.tree).find(node => node.type === "details")).includes(attribution), false);
  }
});

test("Home dashboard keeps price details, stale status, exact XLM and visible attribution", () => {
  const css = parse(readFileSync(new URL("../components/MarketValue.module.css", import.meta.url), "utf8"));
  let feedLabelOnItsOwnLine = false;
  let providerRowCentered = false;
  let attributionStacked = false;
  let compactTouchLink = false;
  css.walkRules(rule => {
    if (rule.selectors.includes(".feedLabel")) rule.walkDecls("display", declaration => { if (declaration.value === "block") feedLabelOnItsOwnLine = true; });
    const declaration = (property: string) => rule.nodes.find((node): node is Declaration => node.type === "decl" && node.prop === property)?.value;
    if (rule.selectors.includes(".providerRow") && declaration("display") === "flex" && declaration("align-items") === "center") providerRowCentered = true;
    if (rule.selectors.includes(".attribution") && declaration("flex-direction") === "column" && declaration("align-items") === "flex-start" && declaration("gap") === "0") attributionStacked = true;
    if (rule.selectors.includes(".attribution a") && /^(?:inline-)?flex$/.test(declaration("display") ?? "") && declaration("flex-direction") === "column" && declaration("align-items") === "flex-start" && declaration("justify-content") === "center" && declaration("gap") === "2px" && Number.parseFloat(declaration("min-height") ?? "0") >= 44) compactTouchLink = true;
  });
  assert.equal(feedLabelOnItsOwnLine, true, "USD price data is placed above Powered by instead of one crowded caption");
  assert.equal(providerRowCentered, true, "Powered by and the official logo share a vertically aligned provider row");
  assert.equal(attributionStacked, true, "The data caption sits above the provider row, not beside a vertically centered logo");
  assert.equal(compactTouchLink, true, "Both tightly spaced attribution rows share one centered 44px touch target instead of expanding the Powered by row alone");
  for (const locale of ["en", "tl", "id", "vi"] as const) for (const status of ["fresh", "stale", "unavailable", "expired"] as const) {
    const prices: MarketPriceResult = status === "unavailable" ? unavailable : status === "expired" ? quote(Date.now() - 301_000) : { ...quote(Date.now()), status } as MarketPriceResult;
    const h = widget({ prices, locale, nativeStroops: "81864865461", dashboard: true });
    assert.equal(h.tree.props["data-market-layout"], "dashboard");
    const native = nodes(h.tree).find(node => node.props["data-native-balance"] !== undefined)!;
    assert.equal(text(native), "8186.4865461 XLM");
    const details = nodes(h.tree).find(node => node.type === "details")!;
    assert.equal(details.props.className, "details");
    const summary = nodes(details).find(node => node.type === "summary")!;
    assert.doesNotMatch(text(summary), /\d{2}:\d{2}/, "Timestamp lives inside price details, not another persistent row");
    assert.equal(summary.props["aria-label"], nodes(widget({ locale }).tree).find(node => node.type === "summary")!.props["aria-label"]);
    assert.equal(nodes(details).some(node => node.type === "time"), status === "fresh" || status === "stale");
    const attribution = nodes(h.tree).find(node => node.props["data-price-attribution"] === "coingecko")!;
    assert.match(text(attribution), /USD price data/);
    assert.match(text(attribution), /Powered by/);
    assert.doesNotMatch(text(attribution), /live/i, "Attribution describes the provider, not a freshness promise when prices are stale or missing");
    assert.equal(attribution.props["aria-label"], "USD price data powered by CoinGecko", "The official wordmark has an explicit accessible USD provider attribution");
    const feedLabel = nodes(attribution).find(node => node.props.className === "feedLabel")!;
    assert.ok(feedLabel);
    assert.equal(text(feedLabel), "USD price data");
    const providerRow = nodes(attribution).find(node => node.props.className === "providerRow")!;
    assert.ok(providerRow);
    assert.equal(text(providerRow), "Powered by");
    assert.equal(nodes(providerRow).includes(feedLabel), false, "USD price data stays outside the Powered by/logo row");
    assert.ok(nodes(attribution).indexOf(feedLabel) < nodes(attribution).indexOf(providerRow));
    const providerLink = nodes(attribution).find(node => node.type === "a")!;
    assert.equal(nodes(attribution).filter(node => node.type === "a").length, 1, "The two attribution rows share one provider link");
    assert.equal(nodes(providerLink).includes(feedLabel), true, "USD price data is inside the full attribution touch target");
    assert.equal(nodes(providerLink).includes(providerRow), true, "Powered by and the official wordmark are inside the same touch target");
    assert.equal(nodes(providerRow).some(node => node.type === "a"), false, "No nested link adds a 44px minimum height to only the Powered by row");
    const linkContent = providerLink.props.children as Element | unknown[];
    const linkChildren = Array.isArray(linkContent) ? linkContent : linkContent.type === "Fragment" ? linkContent.props.children as unknown[] : [linkContent];
    assert.ok(linkChildren.includes(feedLabel) && linkChildren.includes(providerRow), "The two rows are direct siblings inside the link");
    assert.ok(linkChildren.indexOf(feedLabel) < linkChildren.indexOf(providerRow), "USD price data remains the upper row");
    assert.equal(providerLink.props.target, "_blank");
    assert.equal(providerLink.props.rel, "noopener noreferrer");
    assert.equal(nodes(providerRow).find(node => node.type === "img")?.props.alt, "CoinGecko");
    assert.equal(nodes(details).includes(attribution), false);
    assert.equal(nodes(attribution).find(node => node.type === "a")!.props.href, "https://www.coingecko.com");
    assert.equal(nodes(attribution).find(node => node.type === "img")?.props.alt, "CoinGecko");
    const refresh = nodes(details).find(node => node.type === "button")!;
    (refresh.props.onClick as () => void)(); assert.equal(h.refreshCount(), 1);
  }
});

test("selected Home dashboard makes USD the primary amount with exact XLM and localized price status below", () => {
  const nativeStroops = "54502084464";
  const liveLabels = { en: "Live estimate", tl: "Live na tantiya", id: "Estimasi live", vi: "Ước tính trực tiếp" };
  for (const locale of ["en", "tl", "id", "vi"] as const) for (const currency of ["en", "tl", "id", "vi"] as const) {
    const prices = quote(Date.now());
    const h = widget({ prices, locale, currency, nativeStroops, dashboard: true });
    const elements = nodes(h.tree);
    const native = elements.find(node => node.props["data-native-balance"] === nativeStroops)!;
    const estimate = elements.find(node => node.props["data-market-estimate"] !== undefined)!;
    const priceStatus = elements.find(node => node.props["data-price-status"] !== undefined)!;
    assert.ok(native && estimate && priceStatus);
    assert.equal(text(native), "5450.2084464 XLM", "Changing currency never changes the exact seven-decimal token balance");
    assert.ok(elements.indexOf(estimate) < elements.indexOf(native), "The selected USD balance comes before the exact secondary XLM quantity");
    assert.equal(text(estimate), `≈ ${formatMarketValue(nativeStroops, prices, "en")} USD`, "The primary dollar amount ends with an explicit USD denomination");
    assert.equal(text(priceStatus), liveLabels[locale], "The separate price explanation follows app language");
    assert.ok(elements.indexOf(estimate) < elements.indexOf(priceStatus));
    assert.equal(nodes(estimate).includes(priceStatus), false, "Price status does not stack extra words into the large USD figure");
    const secondary = elements.find(node => node.props.className === "secondary")!;
    assert.ok(secondary);
    assert.equal(nodes(secondary).includes(native), true);
    assert.equal(nodes(secondary).includes(priceStatus), true);
    assert.equal(nodes(secondary).includes(estimate), false);
    assert.doesNotMatch(text(estimate), /₱|Rp |₫/, "Only the Home estimate is locked to USD");
    assert.equal(h.tree.props["data-market-value"], "fresh");
    const details = elements.find(node => node.type === "details")!;
    assert.equal(nodes(details).includes(native), false);
    assert.equal(nodes(details).includes(estimate), false);
    assert.equal(nodes(details).includes(priceStatus), false);
  }
});

test("Home dashboard slots keep Testnet framing beside exact XLM in every wallet state, outside the provider footer", () => {
  const actions = jsx("nav", { "aria-label": "Wallet actions", children: [
    jsx("a", { href: "/topup", children: "Top up" }),
    jsx("a", { href: "/withdraw", children: "Withdraw" }),
  ] });
  const cases: { label: string; options: Parameters<typeof widget>[0]; hasNative: boolean }[] = [
    { label: "fresh", options: { prices: quote(Date.now()), nativeStroops: "54502084464" }, hasNative: true },
    { label: "stale", options: { prices: { ...quote(Date.now()), status: "stale" } as MarketPriceResult, nativeStroops: "54502084464" }, hasNative: true },
    { label: "unavailable", options: { prices: unavailable, nativeStroops: "54502084464" }, hasNative: true },
    { label: "expired", options: { prices: quote(Date.now() - 301_000), nativeStroops: "54502084464" }, hasNative: true },
    { label: "quote loading", options: { prices: unavailable, loading: true, nativeStroops: "54502084464" }, hasNative: true },
    { label: "wallet loading", options: { prices: quote(Date.now()), balanceLoading: true, nativeStroops: "54502084464" }, hasNative: false },
    { label: "wallet error", options: { prices: quote(Date.now()), nativeStroops: "54502084464", dashboardBalanceError: jsx("button", { type: "button", children: "Retry balance" }) }, hasNative: false },
    { label: "missing wallet", options: { prices: quote(Date.now()) }, hasNative: false },
    { label: "invalid balance", options: { prices: quote(Date.now()), nativeStroops: "-1" }, hasNative: false },
  ];
  for (const { label, options, hasNative } of cases) {
    const h = widget({ ...options, dashboard: true, dashboardActions: actions, dashboardCaption: "Testnet · No real money" });
    const elements = nodes(h.tree);
    assert.equal(elements.filter(node => node === actions).length, 1, "Controls mount once, without duplicating navigation");
    assert.deepEqual(nodes(actions).filter(node => node.type === "a").map(node => node.props.href), ["/topup", "/withdraw"]);
    const contexts = elements.filter(node => node.props["data-wallet-context"] !== undefined);
    const warnings = elements.filter(node => node.props["data-wallet-testnet"] !== undefined);
    assert.equal(contexts.length, 1, `${label}: wallet context mounts once`);
    assert.equal(warnings.length, 1, `${label}: essential Testnet framing mounts once`);
    const context = contexts[0], warning = warnings[0];
    assert.equal(text(warning), "Testnet · No real money");
    assert.equal(nodes(context).includes(warning), true, `${label}: Testnet framing belongs to the token context`);
    const secondary = elements.find(node => node.props.className === "secondary")!;
    assert.equal(nodes(secondary).includes(context), true);
    const native = elements.find(node => node.props["data-native-balance"] !== undefined);
    assert.equal(Boolean(native), hasNative, `${label}: loading or failed wallets must not display an old or fabricated XLM balance`);
    if (native) {
      assert.equal(text(native), "5450.2084464 XLM", "The exact native amount does not absorb the Testnet caption");
      const children = context.props.children as unknown[];
      assert.ok(children.includes(native) && children.includes(warning), "Exact XLM and warning are direct siblings");
      assert.ok(children.indexOf(native) < children.indexOf(warning), "The warning follows XLM in the same token context");
    }
    const priceStatus = elements.find(node => node.props["data-price-status"] !== undefined);
    if (priceStatus) {
      assert.equal(nodes(secondary).includes(priceStatus), true);
      assert.equal(nodes(context).includes(priceStatus), false, "Quote freshness stays separate from the token denomination and Testnet warning");
    }
    if (!hasNative) assert.equal(priceStatus, undefined, `${label}: no live status is shown without a wallet balance`);
    const details = elements.find(node => node.type === "details")!;
    assert.equal(nodes(details).includes(actions), false);
    assert.equal(text(details).includes("Testnet · No real money"), false, "Essential Testnet framing stays outside collapsed details");
    const attributions = elements.filter(node => node.props["data-price-attribution"] === "coingecko");
    assert.equal(attributions.length, 1);
    assert.equal(nodes(attributions[0]).includes(warning), false, "The provider footer contains only price-data attribution, not token framing");
    assert.equal(text(attributions[0]).includes("Testnet"), false);
    assert.equal(elements.some(node => node.type === "p" && node.props.className === "caption"), false, "The old separate footer warning is removed");
    assert.equal(elements.some(node => node.props.className === "detailSpace"), false, "No invisible footer spacer keeps an extra row alive");
  }
  const defaultCaptions = { en: "Testnet tokens have no monetary value.", tl: "Walang halagang pera ang mga Testnet token.", id: "Token Testnet tidak memiliki nilai uang nyata.", vi: "Token Testnet không có giá trị tiền thật." };
  for (const locale of ["en", "tl", "id", "vi"] as const) {
    const pending = widget({ locale, dashboard: true, balanceLoading: true });
    assert.equal(text(nodes(pending.tree).find(node => node.props["data-wallet-testnet"] !== undefined)), defaultCaptions[locale], "The default localized warning remains visible while the wallet loads");
  }
  const regular = widget({ prices: quote(Date.now()), nativeStroops: "54502084464", dashboardActions: actions, dashboardCaption: "Dashboard-only caption" });
  assert.equal(nodes(regular.tree).includes(actions), false, "Home layout slots must not leak into transaction widgets");
  assert.equal(regular.text.includes("Dashboard-only caption"), false);
  assert.equal(nodes(regular.tree).some(node => node.props["data-wallet-context"] !== undefined || node.props["data-wallet-testnet"] !== undefined), false, "Non-dashboard token rendering remains unchanged");
});

test("Home native balance remains exact during unavailable or loading quotes, but never invents a missing wallet zero", () => {
  for (const loading of [true, false]) {
    const h = widget({ nativeStroops: "54502084464", dashboard: true, loading });
    assert.equal(text(nodes(h.tree).find(node => node.props["data-native-balance"] === "54502084464")), "5450.2084464 XLM");
    assert.match(h.text, loading ? /Loading market price/ : /Market price unavailable/);
    assert.doesNotMatch(h.text, /≈ \$0/);
  }
  const zero = widget({ nativeStroops: "0", prices: quote(Date.now()), dashboard: true });
  assert.equal(text(nodes(zero.tree).find(node => node.props["data-native-balance"] === "0")), "0 XLM");
  assert.match(zero.text, /≈ \$0\.00/);
  const expiredPrices = quote(Date.now() - 301_000);
  const expired = widget({ prices: expiredPrices, nativeStroops: "54502084464", dashboard: true });
  assert.equal(expired.tree.props["data-market-value"], "unavailable");
  assert.equal(text(nodes(expired.tree).find(node => node.props["data-native-balance"] === "54502084464")), "5450.2084464 XLM");
  assert.match(text(nodes(expired.tree).find(node => node.props["data-market-estimate"] !== undefined)), /Market price unavailable/);
  assert.doesNotMatch(text(nodes(expired.tree).find(node => node.props["data-market-estimate"] !== undefined)), /≈ \$/);
  for (const nativeStroops of [undefined, "", "-1", "1.5", "01", "9223372036854775808"]) {
    const h = widget({ nativeStroops, prices: quote(Date.now()), dashboard: true });
    assert.equal(nodes(h.tree).some(node => node.props["data-native-balance"] !== undefined), false);
    assert.match(h.text, /Exact XLM balance unavailable/);
    assert.doesNotMatch(h.text, /(?:≈ \$0|0 XLM)/);
  }
  const pending = widget({ dashboard: true, balanceLoading: true, prices: quote(Date.now()) });
  assert.equal(nodes(pending.tree).some(node => node.props["data-native-balance"] !== undefined), false);
  assert.doesNotMatch(pending.text, /(?:≈ \$0|0 XLM|Exact XLM balance unavailable)/, "Pending balance must not be mistaken for a failed or empty wallet");
});

test("Home stale fiat reference is labelled before expanding details, with the native amount unchanged", () => {
  const labels = { en: "Last known price", tl: "Huling kilalang presyo", id: "Harga terakhir diketahui", vi: "Giá gần nhất" };
  for (const locale of ["en", "tl", "id", "vi"] as const) {
    const stalePrices: MarketPriceResult = { ...quote(Date.now()), status: "stale" } as MarketPriceResult;
    const h = widget({ prices: stalePrices, nativeStroops: "54502084464", locale, dashboard: true });
    const estimate = nodes(h.tree).find(node => node.props["data-market-estimate"] !== undefined)!;
    const priceStatus = nodes(h.tree).find(node => node.props["data-price-status"] !== undefined)!;
    assert.equal(text(priceStatus), labels[locale], "Staleness must be visible beneath the amount without opening price details");
    assert.match(text(estimate), /^≈ \$[\d,.]+ USD$/);
    assert.doesNotMatch(text(estimate), /Live estimate/);
    assert.equal(text(nodes(h.tree).find(node => node.props["data-native-balance"] !== undefined)), "5450.2084464 XLM");
    assert.equal(h.tree.props["data-market-value"], "stale");
  }
});

test("dashboard rechecks the quote timestamp before displaying USD live, stale or unavailable status", () => {
  const nativeStroops = "54502084464";
  const unavailableLabels = { en: "Market price unavailable", tl: "Hindi available ang presyo", id: "Harga pasar tidak tersedia", vi: "Không có giá thị trường" };
  for (const locale of ["en", "tl", "id", "vi"] as const) {
    const fresh = widget({ prices: quote(Date.now()), nativeStroops, locale, currency: "id", dashboard: true });
    const freshLabel = text(nodes(fresh.tree).find(node => node.props["data-price-status"] !== undefined));
    assert.ok(freshLabel);
    assert.match(text(nodes(fresh.tree).find(node => node.props["data-market-estimate"] !== undefined)), /^≈ \$[\d,.]+ USD$/);
    const stale = widget({ prices: quote(Date.now() - 121_000), nativeStroops, locale, currency: "vi", dashboard: true });
    const staleEstimate = text(nodes(stale.tree).find(node => node.props["data-market-estimate"] !== undefined));
    assert.equal(stale.tree.props["data-market-value"], "stale", "A cached provider status of fresh cannot override age above120s");
    const staleLabel = text(nodes(stale.tree).find(node => node.props["data-price-status"] !== undefined));
    assert.ok(staleLabel);
    assert.notEqual(staleLabel, freshLabel, "Live is revoked when the timestamp becomes stale");
    assert.match(staleEstimate, /^≈ \$[\d,.]+ USD$/);
    const expired = widget({ prices: quote(Date.now() - 301_000), nativeStroops, locale, currency: "tl", dashboard: true });
    const expiredEstimate = text(nodes(expired.tree).find(node => node.props["data-market-estimate"] !== undefined));
    assert.equal(expired.tree.props["data-market-value"], "unavailable");
    assert.equal(expiredEstimate, `USD · ${unavailableLabels[locale]}`);
    assert.equal(nodes(expired.tree).some(node => node.props["data-price-status"] !== undefined), false);
    assert.doesNotMatch(expiredEstimate, /≈|\$/);
    assert.equal(nodes(expired.tree).some(node => node.type === "time"), false, "Expired quotes do not retain a misleading update timestamp");
    for (const h of [fresh, stale, expired]) assert.equal(text(nodes(h.tree).find(node => node.props["data-native-balance"] === nativeStroops)), "5450.2084464 XLM");
  }
});

test("USD live estimate never appears for unavailable, malformed or future quotes", () => {
  const invalidPrice = quote(Date.now());
  if (invalidPrice.status !== "unavailable") invalidPrice.assets.xlm.prices.usd = Number.NaN;
  for (const prices of [unavailable, invalidPrice, quote(Date.now() + 61_000), { status: "unavailable", source: "CoinGecko", reason: "preview" } as MarketPriceResult]) {
    const h = widget({ prices, nativeStroops: "54502084464", dashboard: true });
    const estimate = text(nodes(h.tree).find(node => node.props["data-market-estimate"] !== undefined));
    assert.equal(estimate, "USD · Market price unavailable");
    assert.equal(h.tree.props["data-market-value"], "unavailable");
    assert.equal(nodes(h.tree).some(node => node.props["data-price-status"] !== undefined), false);
    assert.doesNotMatch(estimate, /Live|≈|\$/);
    assert.equal(text(nodes(h.tree).find(node => node.props["data-native-balance"] !== undefined)), "5450.2084464 XLM");
    assert.equal(nodes(h.tree).some(node => node.type === "time"), false);
    const attribution = nodes(h.tree).find(node => node.props["data-price-attribution"] === "coingecko")!;
    assert.match(text(attribution), /USD price data/);
    assert.match(text(attribution), /Powered by/);
    assert.doesNotMatch(text(attribution), /live/i);
    assert.equal(attribution.props["aria-label"], "USD price data powered by CoinGecko");
    assert.equal(nodes(attribution).find(node => node.type === "a")?.props.href, "https://www.coingecko.com");
    assert.equal(nodes(attribution).find(node => node.type === "img")?.props.alt, "CoinGecko");
  }
});

test("fresh price data alone cannot claim a USD live wallet value while wallet quantity is missing, loading or failed", () => {
  const failure = jsx("button", { type: "button", children: "Retry wallet balance" });
  for (const options of [
    {}, { nativeStroops: "-1" }, { nativeStroops: "1.5" },
    { balanceLoading: true }, { dashboardBalanceError: failure },
  ]) {
    const h = widget({ prices: quote(Date.now()), dashboard: true, ...options });
    const estimate = text(nodes(h.tree).find(node => node.props["data-market-estimate"] !== undefined));
    assert.doesNotMatch(estimate, /Live|≈|\$|USD/, "Wallet unknown states use a primary placeholder, not a fabricated currency amount");
    assert.equal(nodes(h.tree).some(node => node.props["data-price-status"] !== undefined), false);
    assert.equal(nodes(h.tree).some(node => node.props["data-native-balance"] !== undefined), false);
  }
  const zero = widget({ prices: quote(Date.now()), nativeStroops: "0", dashboard: true });
  assert.equal(text(nodes(zero.tree).find(node => node.props["data-market-estimate"] !== undefined)), "≈ $0.00 USD", "A verified zero balance is still a known quantity, unlike missing wallet data");
  assert.equal(text(nodes(zero.tree).find(node => node.props["data-price-status"] !== undefined)), "Live estimate");
});

test("secondary Home XLM preserves one stroop and the largest wallet i64 without floating-point rounding", () => {
  for (const [nativeStroops, expected] of [
    ["1", "0.0000001 XLM"],
    ["10000000", "1 XLM"],
    ["123456789000", "12345.6789 XLM"],
    ["9223372036854775807", "922337203685.4775807 XLM"],
  ] as const) {
    const h = widget({ nativeStroops, prices: quote(Date.now()), dashboard: true });
    const native = nodes(h.tree).find(node => node.props["data-native-balance"] === nativeStroops)!;
    assert.ok(native);
    assert.equal(text(native), expected);
    assert.equal(native.props["aria-label"], `${expected.slice(0, -4)} Native Testnet XLM`);
  }
});

test("Home wallet failure replaces numeric balance without duplicating the error or hiding retry controls", () => {
  const failure = jsx("div", { role: "alert", children: ["Your wallet balance is unavailable.", jsx("button", { type: "button", children: "Retry" })] });
  const h = widget({ dashboard: true, dashboardBalanceError: failure, prices: quote(Date.now()) });
  assert.equal(nodes(h.tree).filter(node => node === failure).length, 1);
  assert.equal(nodes(h.tree).some(node => node.props["data-native-balance"] !== undefined), false);
  assert.doesNotMatch(h.text, /(?:≈ \$0|0 XLM|Exact XLM balance unavailable)/, "Wallet failure gets one actionable explanation, not a second conflicting fallback");
  const details = nodes(h.tree).find(node => node.type === "details")!;
  assert.equal(nodes(details).includes(failure), false);
  assert.equal(nodes(failure).find(node => node.type === "button")?.props.type, "button");
});

test("compact dashboard keeps USD beside touch-sized actions and exact XLM below with readable labels", () => {
  const css = parse(readFileSync(new URL("../components/MarketValue.module.css", import.meta.url), "utf8"));
  const rules = (selector: string) => {
    const result: Rule[] = []; css.walkRules(rule => { if (rule.selectors.includes(selector)) result.push(rule); }); return result;
  };
  const declaration = (rule: Rule, property: string) => rule.nodes.find((node): node is Declaration => node.type === "decl" && node.prop === property)?.value;
  const native = rules(".native").find(rule => declaration(rule, "font-size"))!;
  const estimate = rules(".estimate").find(rule => declaration(rule, "font-size"))!;
  const lowerBound = (value: string | undefined) => Number(value?.match(/\d+(?:\.\d+)?/)?.[0]);
  assert.ok(lowerBound(declaration(estimate, "font-size")) > lowerBound(declaration(native, "font-size")));
  assert.equal(declaration(estimate, "grid-row"), "1");
  assert.ok(rules(".secondary").some(rule => declaration(rule, "grid-row") === "2" && declaration(rule, "flex-wrap") === "wrap"), "Exact XLM and live/stale status sit in the secondary row below the main USD amount");
  assert.ok(rules(".secondary").some(rule => declaration(rule, "grid-column") === "1 / -1"), "Narrow cards allow the complete secondary row to use their width");
  const tokenContext = rules(".tokenContext")[0];
  assert.equal(declaration(tokenContext, "display"), "flex");
  assert.equal(declaration(tokenContext, "flex-wrap"), "wrap", "The Testnet warning can wrap beside a long exact XLM balance");
  assert.equal(declaration(tokenContext, "align-items"), "baseline");
  const caption = rules(".caption")[0];
  assert.ok(lowerBound(declaration(caption, "font-size")) >= 12, "The Testnet warning remains readable in the compact wallet");
  assert.equal(declaration(caption, "grid-row"), undefined, "Token framing is no longer positioned in its own footer row");
  assert.equal(rules(".detailSpace").length, 0, "The obsolete extra-row spacer has no remaining CSS");
  for (const selector of [".attribution", ".details"]) {
    assert.ok(rules(selector).some(rule => declaration(rule, "grid-row") === "3"), `${selector} shares the provider footer directly below the secondary balance context`);
  }
  assert.ok(rules(".native").some(rule => declaration(rule, "overflow-wrap") === "anywhere"), "Long exact XLM stays readable through wrapping, never rounding");
  assert.ok(rules(".actions").some(rule => declaration(rule, "grid-column") === "2" && declaration(rule, "grid-row") === "1"), "Ordinary wallet widths put both actions beside the primary USD estimate");
  assert.ok(rules(".actions").some(rule => declaration(rule, "grid-column") === "1 / -1" && declaration(rule, "grid-row") === "3"), "Very narrow or enlarged-text layouts can use a full action row without clipping");
  for (const selector of [".native", ".native span", ".quoteStatus", ".caption", ".attribution", ".details"]) {
    assert.ok(rules(selector).every(rule => !declaration(rule, "font-size") || lowerBound(declaration(rule, "font-size")) >= 12), `${selector} keeps ordinary wallet labels at least 12px`);
  }
  for (const selector of [".details summary", ".attribution a", ".refresh"]) {
    assert.ok(rules(selector).some(rule => lowerBound(declaration(rule, "min-height")) >= 44), `${selector} retains a touch-sized hit area`);
  }
});
