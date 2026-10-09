import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { parse, type AnyNode, type Declaration, type Rule } from "postcss";
import { homeCopy } from "../lib/i18n/revamp-home.ts";
import { accountPhotoCopy } from "../lib/i18n/account-photo.ts";
import { requireWalletState } from "../lib/wallet-state.ts";
import * as catalogCopy from "../lib/i18n/revamp-home-catalog.ts";
import * as circlesCopy from "../lib/i18n/revamp-circles.ts";
import * as homeCircles from "../lib/home-circles.ts";
import { LOCALES, type Locale } from "../lib/i18n/config.ts";
import { PREVIEW_CAMPAIGNS, PREVIEW_TIME, PREVIEW_WALLET } from "../lib/local-preview.ts";

type Element = { type: unknown; props: Record<string, unknown> };
type Wallet = { pesos: number; address: string; nativeStroops?: string };
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const compile = (path: string) => ts.transpileModule(source(path), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const code = compile("../app/page.tsx");
const cache = new Map<string, Record<string, unknown>>();
function fixture(path: string): Record<string, unknown> {
  if (cache.has(path)) return cache.get(path)!;
  const exports: Record<string, unknown> = {}; cache.set(path, exports);
  runInNewContext(compile(path), { exports, require(name: string) {
    if (name === "./organizers") return fixture("../lib/circles/organizers.ts");
    if (name === "./types") return fixture("../lib/circles/types.ts");
    throw Error(`Unexpected pure fixture dependency: ${name}`);
  } });
  return exports;
}
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...nodes(node.props.children), ...nodes(node.props.dashboardActions), ...nodes(node.props.dashboardBalanceError)];
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : "";
}
const hasClass = (node: Element, name: string) => String(node.props.className ?? "").split(" ").includes(name);
function directChildren(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(directChildren);
  return value && typeof value === "object" && "props" in value ? [value as Element] : [];
}

// Actual Home render with deterministic isolated hook state. Effects are not
// run: no browser, auth, provisioning, navigation, storage or provider exists.
// Other Home behavior already has effect coverage in home-circles-catalog.
function render(options: { preview?: boolean; locale?: Locale; currency?: Locale; wallet?: Wallet | null; walletError?: string } = {}) {
  const preview = options.preview ?? true, locale = options.locale ?? "en", currency = options.currency ?? "en";
  const calls = { read: 0, write: 0, storage: 0, network: 0 };
  const forbidden = (kind: keyof typeof calls) => () => { calls[kind]++; throw Error(`Forbidden ${kind} in isolated wallet action render`); };
  const exports = {} as { default(): Element };
  let cursor = 0;
  const jsx = (type: unknown, props: Record<string, unknown>): Element => ({ type, props });
  runInNewContext(code, {
    exports, fetch: forbidden("network"), XMLHttpRequest: forbidden("network"),
    localStorage: { getItem: forbidden("storage"), setItem: forbidden("storage") },
    sessionStorage: { getItem: forbidden("storage"), setItem: forbidden("storage") },
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react") return {
        useState(initial: unknown) {
          const index = cursor++;
          const value = index === 0 && "wallet" in options ? options.wallet
            : index === 5 && options.walletError ? options.walletError
            : typeof initial === "function" ? initial() : initial;
          return [value, forbidden("write")];
        },
        useRef: () => ({ current: null }), useEffect() {}, useCallback: (callback: unknown) => callback,
      };
      if (name === "next/link") return { default: "Link" };
      if (name === "next/image") return { default: "Image" };
      if (name.startsWith("@phosphor-icons/")) return { Heart: "Heart", Pause: "Pause", Play: "Play" };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale, currency }) };
      if (name === "@/components/HomeCirclesCatalog") return { default: "HomeCirclesCatalog" };
      if (name === "@/components/AccountAvatar") return { default: "AccountAvatar" };
      if (name === "@/components/MarketValue") return { default: "MarketValue" };
      if (name === "@/components/ui/brand") return { PoweredByStellarV2: "PoweredByStellarV2" };
      if (name === "@/components/useAccountPhoto") return { useAccountPhoto: () => ({ profile: null, status: "ready" }) };
      if (name === "@/lib/i18n/account-photo") return { accountPhotoCopy };
      if (name === "@/components/ui/kit") return { Ico: new Proxy({}, { get: (_target, icon) => (props: Record<string, unknown>) => jsx("svg", { ...props, "data-icon": String(icon) }) }), Peso: "Peso" };
      if (name === "@/lib/local-preview") return { isLocalPreview: preview, PREVIEW_WALLET, PREVIEW_TIME, PREVIEW_CAMPAIGNS, normalizePreviewCampaigns: forbidden("storage") };
      if (name === "@/lib/circles/seed") return fixture("../lib/circles/seed.ts");
      if (name === "@/lib/circles/types") return fixture("../lib/circles/types.ts");
      if (name === "@/lib/home-circles") return homeCircles;
      if (name === "@/lib/i18n/revamp-home") return { homeCopy };
      if (name === "@/lib/i18n/revamp-home-catalog") return catalogCopy;
      if (name === "@/lib/i18n/revamp-circles") return circlesCopy;
      if (name === "@/lib/format-stroops") return { formatStroops: forbidden("read") };
      if (name === "@/lib/wallet-state") return { requireWalletState };
      if (name === "@/app/actions") return { walletState: forbidden("read"), myHandle: forbidden("read") };
      if (name === "@/lib/ui/public-read") return { readPublicCampaigns: forbidden("read") };
      if (name.endsWith(".module.css")) return { default: new Proxy({}, { get: (_target, key) => String(key) }) };
      throw Error(`Unexpected Home render dependency: ${name}`);
    },
  });
  const tree = exports.default();
  const wallet = nodes(tree).find(node => node.type === "section" && hasClass(node, "wallet"))!; assert.ok(wallet);
  const rail = nodes(wallet).find(node => node.type === "nav" && hasClass(node, "walletActions"))!; assert.ok(rail);
  return { tree, wallet, rail, calls, links: nodes(rail).filter(node => node.type === "Link") };
}

test("actual Home wallet rail retains exactly two native navigation links in both modes and four languages", () => {
  for (const preview of [true, false]) for (const locale of LOCALES) {
    const ui = render({ preview, locale });
    assert.equal(ui.rail.props["aria-label"], homeCopy(locale, "Wallet actions"));
    assert.deepEqual(ui.links.map(node => node.props.href), ["/topup", "/withdraw"]);
    for (const [index, label] of ["Top up", "Withdraw"].entries()) {
      const link = ui.links[index], expected = homeCopy(locale, label);
      assert.ok(hasClass(link, "walletAction"));
      assert.equal(link.props["aria-label"], expected);
      assert.equal(text(link), expected);
      assert.equal(link.props.onClick, undefined);
      assert.equal(link.props.role, undefined, "Navigation must keep native link semantics");
      assert.equal(link.props.tabIndex, undefined, "Both links stay in native keyboard order");
      assert.equal(link.props["aria-disabled"], undefined);
      assert.ok(nodes(link).some(node => node.type === "span" && hasClass(node, "walletActionLabel") && text(node) === expected));
      const icon = nodes(link).find(node => node.type === "span" && hasClass(node, "walletActionIcon"))!; assert.ok(icon);
      assert.equal(String(icon.props["aria-hidden"]), "true");
      assert.equal(nodes(icon).find(node => node.type === "svg")?.props["data-icon"], index === 0 ? "arrowDown" : "arrowUp");
    }
    assert.equal(nodes(ui.rail).some(node => node.type === "form" || node.type === "button"), false);
    assert.deepEqual(ui.calls, { read: 0, write: 0, storage: 0, network: 0 });
  }
});

test("Home delegates balance, native action links and truthful caption to one dashboard layout", () => {
  for (const preview of [true, false]) for (const locale of LOCALES) {
    const ui = render({ preview, locale });
    const walletChildren = directChildren(ui.wallet.props.children);
    const content = walletChildren.find(node => hasClass(node, "walletContent"));
    assert.ok(content);
    const markets = nodes(content).filter(node => node.type === "MarketValue");
    assert.equal(markets.length, 1, "Balance must not be duplicated in two responsive layouts");
    const market = markets[0]!;
    assert.equal(market.props.dashboard, true);
    assert.equal(market.props.dashboardActions, ui.rail, "The complete navigation rail enters the dashboard action slot");
    assert.ok(String(market.props.dashboardCaption).includes(homeCopy(locale, "Testnet · no real money")));
    assert.equal(walletChildren.some(node => hasClass(node, "walletCaption")), false, "Testnet footer must not be repeated as a separate card row");
    assert.equal(nodes(content).filter(node => node === ui.rail).length, 1);
    assert.deepEqual(ui.calls, { read: 0, write: 0, storage: 0, network: 0 });
  }
});

test("action labels follow language independently of currency and retain exact balance props and Testnet truth framing", () => {
  for (const preview of [true, false]) for (const locale of LOCALES) for (const currency of LOCALES) {
    const balance = { pesos: 9876543.21, address: "Readonly isolated wallet", nativeStroops: "123456789000" }, ui = render({ preview, locale, currency, wallet: balance });
    assert.equal(text(ui.links[0]), homeCopy(locale, "Top up")); assert.equal(text(ui.links[1]), homeCopy(locale, "Withdraw"));
    const market = nodes(ui.wallet).find(node => node.type === "MarketValue")!;
    assert.equal(market.props.nativeStroops, balance.nativeStroops, "Canonical native stroops take precedence over any presentation fixture");
    assert.equal(market.props.showNative, true, "Home exposes the native quantity without opening market details");
    assert.equal(market.props.dashboard, true, "Minimal metadata is scoped to Home, not transaction/review screens");
    assert.equal(nodes(ui.wallet).some(node => node.type === "Peso"), false, "No Home mode may present the static peso demo as a current wallet market estimate");
    assert.ok(text(ui.wallet).includes(homeCopy(locale, "TESTNET BALANCE")));
    assert.ok(String(market.props.dashboardCaption).includes(homeCopy(locale, "Testnet · no real money")));
    assert.deepEqual(ui.calls, { read: 0, write: 0, storage: 0, network: 0 });
  }
});

test("explicit local Home preview uses an exact native-token fixture, not a static peso value", () => {
  const ui = render({ preview: true });
  const market = nodes(ui.wallet).find(node => node.type === "MarketValue")!;
  assert.equal(market.props.nativeStroops, "78406200000");
  assert.equal(nodes(ui.wallet).some(node => node.type === "Peso"), false);
  assert.equal(nodes(ui.wallet).find(node => hasClass(node, "amount"))?.props["data-preview-balance"], true);
  assert.deepEqual(ui.calls, { read: 0, write: 0, storage: 0, network: 0 });
});

test("unknown and failed wallets keep navigation while a confirmed native zero remains distinct", () => {
  for (const preview of [true, false]) {
    const unknown = render({ preview, wallet: null });
    assert.equal(nodes(unknown.wallet).some(node => node.type === "Peso"), false);
    const pendingMarket = nodes(unknown.wallet).find(node => node.type === "MarketValue")!;
    assert.equal(pendingMarket.props.nativeStroops, undefined);
    assert.equal(pendingMarket.props.balanceLoading, true);
    assert.deepEqual(unknown.links.map(node => node.props.href), ["/topup", "/withdraw"]);
    const failed = render({ preview, wallet: null, walletError: "Your wallet balance is unavailable." });
    const failedMarket = nodes(failed.wallet).find(node => node.type === "MarketValue")!;
    assert.ok(text(failedMarket.props.dashboardBalanceError).includes("Your wallet balance is unavailable."));
    assert.equal(nodes(failed.wallet).some(node => node.type === "Peso"), false);
    assert.equal(failedMarket.props.nativeStroops, undefined);
    assert.equal(failedMarket.props.balanceLoading, false);
    assert.equal(nodes(failed.wallet).some(node => hasClass(node, "sl-skel")), false, "Failure replaces pending geometry instead of stacking another row");
    const stale = render({ preview, wallet: { pesos: 123, address: "Readonly old-balance fixture" }, walletError: "Your wallet balance is unavailable." });
    assert.equal(nodes(stale.wallet).some(node => node.type === "Peso"), false, "A failed refresh must not keep displaying the old balance");
    const staleMarket = nodes(stale.wallet).find(node => node.type === "MarketValue")!;
    assert.equal(staleMarket.props.nativeStroops, undefined);
    assert.ok(text(staleMarket.props.dashboardBalanceError).includes("Your wallet balance is unavailable."));
    for (const ui of [unknown, failed, stale]) assert.deepEqual(ui.calls, { read: 0, write: 0, storage: 0, network: 0 });
  }
  const zero = render({ preview: false, wallet: { pesos: 0, address: "Readonly zero-balance fixture", nativeStroops: "0" } });
  const zeroMarket = nodes(zero.wallet).find(node => node.type === "MarketValue")!;
  assert.equal(zeroMarket.props.nativeStroops, "0");
  assert.equal(zeroMarket.props.balanceLoading, false);
  assert.ok(!zeroMarket.props.dashboardBalanceError);
  assert.deepEqual(zero.calls, { read: 0, write: 0, storage: 0, network: 0 });
});

test("pending Home balance uses the dashboard loading slot rather than a currency-sized outer row", () => {
  for (const currency of LOCALES) {
    const ui = render({ preview: false, wallet: null, currency });
    const market = nodes(ui.wallet).find(node => node.type === "MarketValue")!;
    assert.ok(market);
    assert.equal(market.props.balanceLoading, true);
    assert.equal(market.props.nativeStroops, undefined);
    assert.equal(market.props.dashboardActions, ui.rail);
    assert.equal(nodes(ui.wallet).some(node => hasClass(node, "sl-skel")), false, "MarketValue owns consistent native-amount loading geometry");
    assert.equal(nodes(ui.wallet).some(node => node.type === "Peso"), false, "Pending state must not fabricate a balance");
    assert.deepEqual(ui.calls, { read: 0, write: 0, storage: 0, network: 0 });
  }
});

const css = parse(source("../app/home.module.css"));
function rules(selector: string) {
  const found: Rule[] = []; css.walkRules(rule => { if (rule.selectors.includes(selector)) found.push(rule); }); return found;
}
function declaration(rule: Rule, property: string) { return rule.nodes.filter((node): node is Declaration => node.type === "decl" && node.prop === property).at(-1)?.value; }
function insideReducedMotion(rule: Rule) {
  let parent: AnyNode | undefined = rule.parent;
  while (parent) { if (parent.type === "atrule" && parent.name === "media" && /prefers-reduced-motion\s*:\s*reduce/.test(parent.params)) return true; parent = parent.parent; }
  return false;
}

test("compact wallet CSS retains equal labelled actions with readable labels and minimum touch height", () => {
  const rail = rules(".walletActions").find(rule => declaration(rule, "display") === "grid")!; assert.ok(rail);
  assert.equal(declaration(rail, "grid-template-columns")?.replace(/\s/g, ""), "repeat(2,minmax(0,1fr))");
  assert.ok(declaration(rail, "border-radius"));
  const action = rules(".wallet .walletAction").find(rule => declaration(rule, "min-height"))!; assert.ok(action);
  assert.ok(Number.parseFloat(declaration(action, "min-height")!) >= 44);
  assert.ok(Number.parseFloat(declaration(action, "border-radius")!) > 0);
  assert.equal(declaration(action, "flex-direction"), "column", "A small icon above each label leaves readable action labels beside the USD amount");
  assert.ok(rules(".wallet .walletAction + .walletAction::before").some(rule => declaration(rule, "content") === "none"), "The two actions remain distinct buttons without a shared divider");
  assert.ok(rules(".wallet .walletActionLabel").every(rule => Number.parseFloat(declaration(rule, "font-size") ?? "12") >= 12), "Compact action labels must remain at least 12px");
});

test("wallet CSS never hides labels or disables links at narrow breakpoints", () => {
  css.walkRules(rule => {
    const appliesToLabels = rule.selectors.some(selector => selector.includes(".walletActionLabel") || /\.walletActions\s+a\s+span/.test(selector));
    if (appliesToLabels) {
      assert.notEqual(declaration(rule, "display"), "none", rule.selector);
      assert.notEqual(declaration(rule, "visibility"), "hidden", rule.selector);
      assert.notEqual(declaration(rule, "opacity"), "0", rule.selector);
    }
    if (rule.selectors.some(selector => selector === ".walletAction" || selector === ".walletActions a")) {
      assert.notEqual(declaration(rule, "pointer-events"), "none", rule.selector);
      const height = declaration(rule, "min-height"); if (height) assert.ok(Number.parseFloat(height) >= 44, rule.selector);
    }
  });
  assert.ok(rules(".walletActionLabel").length);
});

test("wallet CSS retains explicit keyboard focus and disables action transitions with reduced motion", () => {
  assert.ok(rules(".walletAction:focus-visible").some(rule => {
    const outline = declaration(rule, "outline"); return outline && outline !== "none" && Number.parseFloat(outline) > 0;
  }));
  assert.ok(rules(".walletAction").some(rule => insideReducedMotion(rule) && declaration(rule, "transition") === "none"));
});
