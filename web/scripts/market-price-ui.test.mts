import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
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

function widget(options: { prices?: MarketPriceResult; locale?: "en" | "tl" | "id" | "vi"; currency?: "en" | "tl" | "id" | "vi"; nativeStroops?: string; loading?: boolean; showNative?: boolean; compact?: boolean; size?: number; color?: string; dashboard?: boolean } = {}) {
  const exported = {} as { default(props: { nativeStroops?: string; compact: boolean; showNative?: boolean; size?: number; color?: string; dashboard?: boolean }): Element };
  let refreshed = 0;
  runInNewContext(widgetCode, { exports: exported, Intl, Date, BigInt,
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale: options.locale ?? "en", currency: options.currency ?? "en" }) };
      if (name === "@/components/MarketPricesProvider") return { useMarketPrices: () => ({ prices: options.prices ?? unavailable, loading: options.loading ?? false, refresh: () => { refreshed++; return Promise.resolve(); } }) };
      if (name === "@/lib/market-prices") return { formatMarketValue };
      if (name === "./MarketValue.module.css") return { default: new Proxy({}, { get: (_target, key) => String(key) }) };
      throw Error(`Unexpected dependency ${name}`);
    },
  });
  const tree = exported.default({ nativeStroops: options.nativeStroops, compact: options.compact ?? true, showNative: options.showNative, size: options.size, color: options.color, dashboard: options.dashboard });
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
    const link = nodes(attribution).find(node => node.type === "a")!;
    assert.equal(link.props.href, "https://www.coingecko.com");
    const logo = nodes(link).find(node => node.type === "img")!;
    assert.equal(logo.props.src, color === "currentColor" ? "/brands/coingecko-white.svg" : "/brands/coingecko.svg");
    assert.equal(logo.props.height, 16); assert.equal(logo.props.alt, "CoinGecko");
    assert.equal(nodes(nodes(h.tree).find(node => node.type === "details")).includes(attribution), false);
  }
});

test("Home dashboard uses one metadata row without hiding stale status, exact XLM or attribution", () => {
  for (const locale of ["en", "tl", "id", "vi"] as const) for (const status of ["fresh", "stale", "unavailable"] as const) {
    const prices: MarketPriceResult = status === "unavailable" ? unavailable : { ...quote(Date.now()), status } as MarketPriceResult;
    const h = widget({ prices, locale, nativeStroops: "81864865461", dashboard: true });
    assert.equal(h.tree.props["data-market-layout"], "dashboard");
    const native = nodes(h.tree).find(node => node.props["data-native-balance"] !== undefined)!;
    assert.equal(text(native), "8186.4865461 XLM");
    assert.equal(native.props.className, "native");
    const details = nodes(h.tree).find(node => node.type === "details")!;
    assert.equal(details.props.className, "details");
    const summary = nodes(details).find(node => node.type === "summary")!;
    assert.doesNotMatch(text(summary), /\d{2}:\d{2}/, "Timestamp lives inside price details, not another persistent row");
    assert.equal(summary.props["aria-label"], nodes(widget({ locale }).tree).find(node => node.type === "summary")!.props["aria-label"]);
    if (status === "stale") assert.equal(text(summary), text(nodes(widget({ prices, locale }).tree).find(node => node.type === "summary")!).split(" · ")[0]);
    if (status !== "unavailable") assert.ok(nodes(details).some(node => node.type === "time"));
    const attribution = nodes(h.tree).find(node => node.props["data-price-attribution"] === "coingecko")!;
    assert.equal(text(attribution), "Powered by");
    assert.equal(nodes(details).includes(attribution), false);
    assert.equal(nodes(attribution).find(node => node.type === "a")!.props.href, "https://www.coingecko.com");
    const refresh = nodes(details).find(node => node.type === "button")!;
    (refresh.props.onClick as () => void)(); assert.equal(h.refreshCount(), 1);
  }
});
