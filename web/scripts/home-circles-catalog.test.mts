import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { parse, type Declaration } from "postcss";
import { LOCALES, type Locale } from "../lib/i18n/config.ts";
import { homeCopy } from "../lib/i18n/revamp-home.ts";
import * as catalogCopy from "../lib/i18n/revamp-home-catalog.ts";
import * as circlesCopy from "../lib/i18n/revamp-circles.ts";
import * as contentCopy from "../lib/i18n/circles-content.ts";
import { accountPhotoCopy } from "../lib/i18n/account-photo.ts";
import { requireWalletState } from "../lib/wallet-state.ts";
import * as homeCircles from "../lib/home-circles.ts";
import { PREVIEW_CAMPAIGNS, PREVIEW_TIME, PREVIEW_WALLET } from "../lib/local-preview.ts";
import type { Circle, CircleCategory } from "../lib/circles/types.ts";
import type { Campaign } from "../lib/campaign.ts";

type Element = { type: unknown; key?: string; props: Record<string, unknown> };
type Callback = (...args: unknown[]) => unknown;
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const compile = (path: string) => ts.transpileModule(source(path), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
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
const seed = fixture("../lib/circles/seed.ts") as { SEED_CIRCLES: Circle[]; COMPLETED_CIRCLES: Circle[] };
const code = compile("../app/page.tsx");
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
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
type HomeWallet = { pesos: number; address: string; nativeStroops: string } | { ok: false; error: string };
type PublicCampaignPage = { ok: true; now: string; campaigns: Omit<Campaign, "contribution">[]; circleLinks?: Record<string, string> } | { ok: false; error: string };
type CatalogProps = { campaigns?: Omit<Campaign, "contribution">[]; circleLinks?: Record<string, string>; loading?: boolean; error?: string; onRetry?: Callback };

// Actual Home and HomeCirclesCatalog TSX, with separate hook state for each
// component and isolated effects/DOM-shaped refs. No browser, auth, provider,
// ledger, actual navigation or network requests are available.
function mount(options: { preview?: boolean; locale?: Locale; reducedMotion?: boolean; deniedStorage?: boolean; failCampaigns?: boolean; failWallet?: boolean; liveCampaigns?: Campaign[]; circleLinks?: Record<string, string>; savedCatalogView?: unknown; navigationEntryReady?: boolean;
  walletReader?: () => Promise<HomeWallet>; handleReader?: () => Promise<string | null>; campaignReader?: (before: string) => Promise<PublicCampaignPage> } = {}) {
  const preview = options.preview ?? true;
  const locale = options.locale ?? "en";
  const liveCampaigns = options.liveCampaigns ?? Array.from({ length: 12 }, (_, index) => ({ ...PREVIEW_CAMPAIGNS[0], id: String(800 + index), title: `Isolated Testnet campaign ${index + 1}` }));
  const calls = { wallet: 0, handle: 0, campaigns: [] as string[], network: 0, writes: 0, storageReads: 0, viewStateWrites: 0 };
  const initialEntry = "isolated-home-entry:1";
  let navigationEntry = options.navigationEntryReady === false ? "" : initialEntry;
  const navigationViewsByEntry = new Map<string, Map<string, string>>([[initialEntry.split(":")[0], new Map()]]);
  const emptyViews = new Map<string, string>();
  const navigationListeners = new Set<() => void>();
  const navigationViews = () => navigationViewsByEntry.get(navigationEntry.split(":")[0]) ?? emptyViews;
  if (options.savedCatalogView !== undefined) navigationViewsByEntry.get(initialEntry.split(":")[0])!.set("home-circles", JSON.stringify(options.savedCatalogView));
  const notifyNavigation = () => { for (const listener of navigationListeners) listener(); };
  let campaignFailure = options.failCampaigns ?? false;
  const homeStates: unknown[] = [], catalogStates: unknown[] = [];
  let states = homeStates;
  let cursor = 0;
  let hydrated = false;
  let tree: Element;
  const effects: (() => void)[] = [];
  const timeouts = new Map<number, Callback>();
  const intervals = new Map<number, Callback>();
  const mediaListeners = new Set<() => void>();
  let timer = 0;
  let mediaReduced = options.reducedMotion ?? true;
  const document = { hidden: false };
  const scrolls: { left: number; behavior: string }[] = [];
  const dependenciesEqual = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const component = {} as { default(): Element };
  const catalog = {} as { default(props: CatalogProps): Element };
  const categoryPicker = {} as { default(props: Record<string, unknown>): Element };
  const trustSummary = {} as { default(props: Record<string, unknown>): Element };
  const navigationViewHook = {} as { useNavigationViewState(key: string): string };
  const jsx = (type: unknown, props: Record<string, unknown>, key?: string): Element => {
    if (type === categoryPicker.default) return { type: "CauseCategoryPicker", props: { ...props, children: categoryPicker.default(props) }, key };
    if (type === trustSummary.default) return trustSummary.default(props);
    if (type !== catalog.default) return { type, props, key };
    const parentStates = states, parentCursor = cursor;
    states = catalogStates; cursor = 0;
    try { return catalog.default(props); }
    finally { states = parentStates; cursor = parentCursor; }
  };
  const icons = new Proxy({}, { get: () => () => null });
  const context = { document, window: { matchMedia: () => ({ get matches() { return mediaReduced; } }) },
    fetch() { calls.network++; throw Error("Network forbidden in isolated Home tests"); },
    sessionStorage: { getItem() { calls.storageReads++; if (options.deniedStorage) throw Error("Denied test storage"); return null; }, setItem() { calls.writes++; throw Error("Home must not write storage"); } },
    setTimeout(callback: Callback) { const id = ++timer; timeouts.set(id, callback); return id; }, clearTimeout(id: number) { timeouts.delete(id); },
    setInterval(callback: Callback) { const id = ++timer; intervals.set(id, callback); return id; }, clearInterval(id: number) { intervals.delete(id); },
    matchMedia: () => ({ get matches() { return mediaReduced; }, addEventListener(_event: string, callback: () => void) { mediaListeners.add(callback); }, removeEventListener(_event: string, callback: () => void) { mediaListeners.delete(callback); } }),
    require(name: string) {
      if (name === "@/components/ui/ExampleOrganizerAvatar") return { default: "ExampleOrganizerAvatar" };
      if (name === "@/components/ui/OrganizerTrustSummary") return trustSummary;
      if (name === "@/components/CauseCategoryPicker") return categoryPicker;
      if (name === "@/components/ui/CauseCategoryDoodle") return { default: "CauseCategoryDoodle" };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react") return {
        useState(initial: unknown) { const index = cursor++, hookStates = states; if (!(index in hookStates)) hookStates[index] = typeof initial === "function" ? initial() : initial; return [hookStates[index], (value: unknown) => { hookStates[index] = typeof value === "function" ? value(hookStates[index]) : value; }]; },
        useRef(initial: unknown) { const index = cursor++; if (!(index in states)) states[index] = { current: initial }; return states[index]; },
        useSyncExternalStore(subscribe: (listener: () => void) => () => void, getSnapshot: () => unknown, getServerSnapshot: () => unknown) {
          const index = cursor++, hookStates = states;
          const previous = hookStates[index] as { subscribe: typeof subscribe; unsubscribe?: () => void } | undefined;
          if (hydrated && (!previous || previous.subscribe !== subscribe)) {
            const next = { subscribe, unsubscribe: undefined as (() => void) | undefined }; hookStates[index] = next;
            effects.push(() => { previous?.unsubscribe?.(); next.unsubscribe = subscribe(() => {}); });
          }
          return hydrated ? getSnapshot() : getServerSnapshot();
        },
        useCallback(callback: Callback, dependencies: readonly unknown[]) { const index = cursor++; const previous = states[index] as { callback: Callback; dependencies: readonly unknown[] } | undefined; if (!previous || !dependenciesEqual(previous.dependencies, dependencies)) states[index] = { callback, dependencies }; return (states[index] as { callback: Callback }).callback; },
        useEffect(callback: () => (() => void) | void, dependencies: readonly unknown[]) { const index = cursor++, hookStates = states; const previous = hookStates[index] as { dependencies: readonly unknown[]; cleanup?: () => void } | undefined; if (!previous || !dependenciesEqual(previous.dependencies, dependencies)) {
          const next = { dependencies, cleanup: undefined as (() => void) | void }; hookStates[index] = next;
          effects.push(() => { previous?.cleanup?.(); next.cleanup = callback(); });
        } },
        useLayoutEffect(callback: () => (() => void) | void, dependencies: readonly unknown[]) { const index = cursor++, hookStates = states; const previous = hookStates[index] as { dependencies: readonly unknown[]; cleanup?: () => void } | undefined; if (!previous || !dependenciesEqual(previous.dependencies, dependencies)) {
          const next = { dependencies, cleanup: undefined as (() => void) | void }; hookStates[index] = next;
          effects.push(() => { previous?.cleanup?.(); next.cleanup = callback(); });
        } },
      };
      if (name === "next/link") return { default: "Link" };
      if (name === "next/image") return { default: "Image" };
      if (name.startsWith("@phosphor-icons/")) return new Proxy({}, { get: (_target, key) => String(key) });
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale, currency: "tl" }) };
      if (name === "@/components/HomeCirclesCatalog") return { default: catalog.default };
      if (name === "@/components/HomeCircleFundingProgress") return { default: "HomeCircleFundingProgress", ConfirmedFundingProgress: "ConfirmedFundingProgress" };
      if (name === "@/components/AccountAvatar") return { default: "AccountAvatar" };
      if (name === "@/components/MarketValue") return { default: "MarketValue" };
      if (name === "@/components/useAccountPhoto") return { useAccountPhoto: () => ({ status: "ready", profile: null }) };
      if (name === "@/components/ui/kit") return { Ico: icons, Peso: "Peso" };
      if (name === "@/components/ui/icons") return { Ico: icons };
      if (name === "@/components/ui/brand") return { PoweredByStellarV2: "PoweredByStellarV2" };
      if (name === "@/lib/local-preview") return { isLocalPreview: preview, PREVIEW_WALLET, PREVIEW_TIME, PREVIEW_CAMPAIGNS, normalizePreviewCampaigns: (rows: Campaign[]) => rows };
      if (name === "@/lib/circles/seed") return seed;
      if (name === "@/lib/circles/types") return fixture("../lib/circles/types.ts");
      if (name === "@/components/CampaignDonationBadge") return { __esModule: true, default: () => null };
      if (name === "@/lib/ui/useOwnedAccountRead") return { useOwnedAccountRead: () => ({ status: "guest", value: null }) };
      if (name === "@/lib/campaign-support") return { validCampaignSupport: () => false };
      if (name === "@/lib/circles/organizers") return fixture("../lib/circles/organizers.ts");
      if (name === "@/lib/home-circles") return homeCircles;
      if (name === "@/lib/ui/useNavigationViewState") return navigationViewHook;
      if (name === "@/lib/ui/app-navigation" || name === "./app-navigation") return {
        getNavigationEntrySnapshot: () => navigationEntry,
        getNavigationViewStateSnapshot: (key: string) => navigationViews().get(key) ?? "",
        subscribeNavigationViewState(listener: () => void) { navigationListeners.add(listener); return () => { navigationListeners.delete(listener); }; },
        writeNavigationViewState(key: string, value: Record<string, unknown>) {
          assert.ok(navigationEntry, "Catalog interaction must wait for a valid navigation entry");
          assert.equal(key, "home-circles"); assert.deepEqual(Object.keys(value).sort(), ["category", "index"]);
          calls.viewStateWrites++; navigationViews().set(key, JSON.stringify(value)); notifyNavigation();
        },
      };
      if (name === "@/lib/i18n/revamp-home") return { homeCopy };
      if (name === "@/lib/i18n/revamp-home-catalog") return catalogCopy;
      if (name === "@/lib/i18n/revamp-circles") return circlesCopy;
      if (name === "@/lib/i18n/circles-content") return contentCopy;
      if (name === "@/lib/i18n/account-photo") return { accountPhotoCopy };
      if (name === "@/lib/format-stroops") return { formatStroops: (value: string) => `exact-source-units:${value}` };
      if (name === "@/lib/wallet-state") return { requireWalletState };
      if (name === "@/app/actions") return { async walletState() { calls.wallet++; assert.equal(preview, false); return options.walletReader ? options.walletReader() : options.failWallet ? { ok: false, error: "Your wallet balance is unavailable." } : { pesos: 123.45, address: "Readonly isolated Testnet wallet", nativeStroops: "189923077" }; }, async myHandle() { calls.handle++; assert.equal(preview, false); return options.handleReader ? options.handleReader() : "isolated"; } };
      if (name === "@/lib/ui/public-read") return { async readPublicCampaigns(before: string) { calls.campaigns.push(before); assert.equal(preview, false); if (options.campaignReader) return options.campaignReader(before); if (campaignFailure) return { ok: false, error: "Isolated readonly failure" }; const offset = before === "0" ? 0 : liveCampaigns.findIndex(campaign => campaign.id === before) + 1; const campaigns = liveCampaigns.slice(offset, offset + 10); const circleLinks = Object.fromEntries(campaigns.flatMap(campaign => options.circleLinks?.[campaign.id] ? [[campaign.id, options.circleLinks[campaign.id]]] : [])); return { ok: true, now: String(PREVIEW_TIME), campaigns, circleLinks }; } };
      if (name.endsWith(".module.css")) return { default: new Proxy({}, { get: (_target, key) => String(key) }) };
      throw Error(`Unexpected actual Home dependency: ${name}`);
    },
  };
  runInNewContext(compile("../lib/ui/useNavigationViewState.ts"), { ...context, exports: navigationViewHook });
  runInNewContext(compile("../components/CauseCategoryPicker.tsx"), { ...context, exports: categoryPicker });
  runInNewContext(compile("../components/ui/OrganizerTrustSummary.tsx"), { ...context, exports: trustSummary });
  runInNewContext(compile("../components/HomeCirclesCatalog.tsx"), { ...context, exports: catalog });
  runInNewContext(code, { ...context, exports: component });
  function render() {
    states = homeStates; cursor = 0; tree = component.default();
    for (const strip of nodes(tree).filter(node => hasClass(node, "strip"))) {
      const ref = strip.props.ref as { current: { key?: string; scrollLeft: number; children: { offsetLeft: number; offsetWidth: number }[]; scrollTo(args: { left: number; behavior: string }): void } | null };
      if (!ref.current || ref.current.key !== strip.key) ref.current = { key: strip.key, scrollLeft: 0, children: [], scrollTo(args) { this.scrollLeft = args.left; scrolls.push(args); } };
      ref.current.children = nodes(strip.props.children).filter(node => node.type === "article").map((_node, index) => ({ offsetLeft: 16 + index * 264, offsetWidth: 250 }));
    }
    return tree;
  }
  render();
  async function flush() {
    hydrated = true;
    for (let loop = 0; loop < 5; loop++) {
      for (const effect of effects.splice(0)) effect();
      for (const [id, callback] of timeouts) { timeouts.delete(id); callback(); }
      await new Promise(resolve => setImmediate(resolve)); render();
      if (!effects.length && !timeouts.size) break;
    }
    return tree!;
  }
  function select(category: string) {
    const field = nodes(tree).find(node => node.type === "fieldset" && hasClass(node, "categoryChoices")); assert.ok(field);
    assert.notEqual(field.props.disabled, true, "The category picker must hydrate before accepting a choice");
    const picker = nodes(field).find(node => node.type === "CauseCategoryPicker"); assert.ok(picker);
    (picker.props.onSelect as (category: string) => void)(category); render();
  }
  function click(ariaLabel: string) { const button = nodes(tree).find(node => node.type === "button" && node.props["aria-label"] === ariaLabel); assert.ok(button, `Missing Home control ${ariaLabel}`); assert.notEqual(button.props.disabled, true); (button.props.onClick as () => void)(); render(); }
  return { calls, render, flush, select, click, scrolls, intervals, document,
    cleanup() { for (const state of [...homeStates, ...catalogStates]) (state as { cleanup?: () => void; unsubscribe?: () => void } | undefined)?.cleanup?.(); },
    get navigationViews() { return navigationViews(); },
    changeNavigationEntry(snapshot: string, savedView?: unknown) {
      navigationEntry = snapshot;
      const id = snapshot.split(":")[0];
      if (id && !navigationViewsByEntry.has(id)) navigationViewsByEntry.set(id, new Map());
      if (savedView !== undefined) navigationViews().set("home-circles", JSON.stringify(savedView));
      assert.ok(navigationListeners.size >= 2, "Both entry and view snapshots must subscribe to navigation changes");
      notifyNavigation(); render();
    },
    remountCatalog() {
      for (const state of catalogStates) (state as { unsubscribe?: () => void } | undefined)?.unsubscribe?.();
      catalogStates.length = 0; render();
    }, set campaignFailure(value: boolean) { campaignFailure = value; }, get tree() { return tree!; }, get catalog() { return nodes(tree).find(node => node.props["data-testid"] === "home-crowdfunding")!; }, get cards() { return nodes(tree).filter(node => node.type === "article" && "data-example-cause" in node.props); }, get d4Cards() { return nodes(tree).filter(node => node.type === "article" && "data-standalone-campaign" in node.props); }, get orderedCards() { const strip = nodes(tree).find(node => hasClass(node, "strip")); return nodes(strip).filter(node => node.type === "article"); }, changeReducedMotion(value: boolean) { mediaReduced = value; for (const listener of mediaListeners) listener(); render(); } };
}

test("history view state accepts only bounded discovery fields and ignores corrupt or financial values", () => {
  const neutral = { category: "all", index: 0, sort: "all" };
  for (const snapshot of ["", "{", "null", "[]", JSON.stringify("animals"), " ".repeat(2049)]) assert.deepEqual(homeCircles.parseCauseViewState(snapshot), neutral);
  assert.deepEqual(homeCircles.parseCauseViewState(JSON.stringify({ category: "animals", index: 1, sort: "closeToGoal", balance: 999, kyc: true })), { category: "animals", index: 1, sort: "closeToGoal" });
  assert.deepEqual(homeCircles.parseCauseViewState(JSON.stringify({ category: "__proto__", index: -1, sort: "<script>" })), neutral);
  assert.deepEqual(homeCircles.parseCauseViewState(JSON.stringify({ category: "medical", index: 1.5 })), { category: "medical", index: 0, sort: "all" });
  assert.deepEqual(homeCircles.parseCauseViewState(JSON.stringify({ category: "all", index: 1026 })), { category: "all", index: 1026, sort: "all" }, "The final index remains bounded to 27 stories plus the maximum 100 discovery pages");
  for (const index of [1027, Number.MAX_SAFE_INTEGER, -1, "29", null]) assert.deepEqual(homeCircles.parseCauseViewState(JSON.stringify({ category: "all", index })), neutral);
});

test("Home restores category, selected card and horizontal position after a route remount without financial storage writes", async () => {
  const ui = mount({ savedCatalogView: { category: "animals", index: 1 } });
  assert.equal(ui.cards.length, 27, "SSR stays neutral and hydration-safe");
  await ui.flush();
  assert.equal(ui.cards.length, 3); assert.ok(text(ui.catalog).includes("02 / 03"));
  assert.equal(ui.scrolls.at(-1)?.left, 264); assert.equal(ui.scrolls.at(-1)?.behavior, "instant");
  ui.click(catalogCopy.homeCatalogCopy("en", "Next example cause"));
  assert.ok(text(ui.catalog).includes("03 / 03"));
  ui.remountCatalog(); await ui.flush();
  assert.equal(ui.cards.length, 3); assert.ok(text(ui.catalog).includes("03 / 03"));
  assert.equal(ui.scrolls.at(-1)?.left, 528);
  assert.deepEqual(JSON.parse(ui.navigationViews.get("home-circles")!), { category: "animals", index: 2 });
  assert.equal(ui.calls.network, 0); assert.equal(ui.calls.writes, 0); assert.equal(ui.calls.wallet, 0);
});

test("same-path Home entry switches restore each saved index without remounting or cancelling manual smooth scroll", async () => {
  const ui = mount({ reducedMotion: false, savedCatalogView: { category: "animals", index: 1 } });
  await ui.flush(); assert.equal(ui.scrolls.at(-1)?.left, 264);
  let before = ui.scrolls.length;
  ui.click(catalogCopy.homeCatalogCopy("en", "Next example cause")); await ui.flush();
  assert.equal(ui.scrolls.length, before + 1); assert.equal(ui.scrolls.at(-1)?.behavior, "smooth");
  assert.equal(ui.scrolls.at(-1)?.left, 528); assert.ok(text(ui.catalog).includes("03 / 03"));

  // Only the history entry changes. Home/catalog hook state and the same
  // category strip remain mounted, as for / -> /?source=other -> Back.
  ui.changeNavigationEntry("isolated-home-query-entry:2", { category: "animals", index: 0 });
  before = ui.scrolls.length; await ui.flush();
  assert.equal(ui.scrolls.length, before + 1); assert.equal(ui.scrolls.at(-1)?.left, 0);
  assert.equal(ui.scrolls.at(-1)?.behavior, "instant"); assert.ok(text(ui.catalog).includes("01 / 03"));
  before = ui.scrolls.length;
  ui.click(catalogCopy.homeCatalogCopy("en", "Next example cause")); await ui.flush();
  assert.equal(ui.scrolls.length, before + 1); assert.equal(ui.scrolls.at(-1)?.behavior, "smooth");
  assert.equal(ui.scrolls.at(-1)?.left, 264);

  ui.changeNavigationEntry("isolated-home-entry:3"); await ui.flush();
  assert.equal(ui.scrolls.at(-1)?.left, 528); assert.ok(text(ui.catalog).includes("03 / 03"));
  ui.changeNavigationEntry("isolated-home-query-entry:4"); await ui.flush();
  assert.equal(ui.scrolls.at(-1)?.left, 264); assert.ok(text(ui.catalog).includes("02 / 03"));
  assert.deepEqual(JSON.parse(ui.navigationViews.get("home-circles")!), { category: "animals", index: 1 });
  assert.equal(ui.calls.network, 0); assert.equal(ui.calls.writes, 0); assert.equal(ui.calls.wallet, 0);
  assert.deepEqual(ui.calls.campaigns, []);
});

test("Home waits for a valid navigation entry after hydration and restores the saved strip on reload", async () => {
  const ui = mount({ navigationEntryReady: false, savedCatalogView: { category: "medical", index: 2 } });
  assert.equal(ui.cards.length, 27); await ui.flush();
  assert.equal(String(ui.catalog.props["data-catalog-ready"]), "false");
  assert.equal(ui.scrolls.length, 0); assert.throws(() => ui.select("animals"), /hydrate before accepting/);
  const picker = nodes(ui.catalog).find(node => node.type === "CauseCategoryPicker")!;
  (picker.props.onSelect as (category: string) => void)("animals");
  const arrow = nodes(ui.catalog).find(node => node.type === "button" && node.props["aria-label"] === catalogCopy.homeCatalogCopy("en", "Next example cause"))!;
  (arrow.props.onClick as () => void)(); assert.equal(ui.calls.viewStateWrites, 0);
  ui.changeNavigationEntry("isolated-home-entry:1"); await ui.flush();
  assert.equal(String(ui.catalog.props["data-catalog-ready"]), "true");
  assert.equal(ui.cards.length, 3); assert.ok(text(ui.catalog).includes("03 / 03"));
  assert.equal(ui.scrolls.at(-1)?.left, 528); assert.equal(ui.scrolls.at(-1)?.behavior, "instant");
  assert.equal(ui.calls.viewStateWrites, 0, "Restoration must not overwrite the saved entry with its neutral SSR state");

  const reload = mount({ savedCatalogView: JSON.parse(ui.navigationViews.get("home-circles")!) });
  assert.equal(reload.cards.length, 27); assert.equal(String(reload.catalog.props["data-catalog-ready"]), "false");
  await reload.flush(); assert.equal(reload.cards.length, 3); assert.ok(text(reload.catalog).includes("03 / 03"));
  assert.equal(reload.scrolls.at(-1)?.left, 528); assert.equal(reload.scrolls.at(-1)?.behavior, "instant");
  for (const screen of [ui, reload]) {
    assert.equal(screen.calls.network, 0); assert.equal(screen.calls.writes, 0); assert.equal(screen.calls.wallet, 0);
    assert.deepEqual(screen.calls.campaigns, []); assert.equal(screen.calls.viewStateWrites, 0);
  }
});

test("a saved standalone selection restores after its public discovery page arrives instead of remaining on the clamped story", async () => {
  const firstPage = deferred<PublicCampaignPage>();
  const campaigns = Array.from({ length: 5 }, (_, index) => ({ ...PREVIEW_CAMPAIGNS[0], id: String(800 + index) }));
  const ui = mount({ preview: false, savedCatalogView: { category: "all", index: 29 }, campaignReader: () => firstPage.promise });
  assert.equal(ui.orderedCards.length, 27); assert.equal(ui.scrolls.length, 0);
  await ui.flush(); assert.equal(ui.orderedCards.length, 27); assert.equal(ui.calls.viewStateWrites, 0);
  firstPage.resolve({ ok: true, now: String(PREVIEW_TIME), campaigns, circleLinks: {} }); await ui.flush();
  assert.equal(ui.orderedCards.length, 32); assert.match(text(ui.catalog), /30 \/ 32/);
  assert.equal(ui.scrolls.at(-1)?.left, 29 * 264); assert.equal(ui.scrolls.at(-1)?.behavior, "instant");
  assert.deepEqual(JSON.parse(ui.navigationViews.get("home-circles")!), { category: "all", index: 29 });
  assert.equal(ui.calls.viewStateWrites, 0); assert.equal(ui.calls.network, 0); assert.equal(ui.calls.writes, 0);
});

test("a saved later-page standalone selection waits for its card without hiding completed discovery pages", async () => {
  const later = deferred<PublicCampaignPage>();
  const campaigns = Array.from({ length: 12 }, (_, index) => ({ ...PREVIEW_CAMPAIGNS[0], id: String(800 + index) }));
  const ui = mount({ preview: false, savedCatalogView: { category: "all", index: 38 }, campaignReader: async before => before === "0"
    ? { ok: true, now: String(PREVIEW_TIME), campaigns: campaigns.slice(0, 10), circleLinks: {} } : later.promise });
  await ui.flush(); assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 10); assert.equal(ui.scrolls.length, 0);
  assert.ok(text(ui.catalog).includes(catalogCopy.homeCatalogCopy("en", "Checking other Testnet campaigns")));
  later.resolve({ ok: true, now: String(PREVIEW_TIME), campaigns: campaigns.slice(10), circleLinks: {} }); await ui.flush();
  assert.equal(ui.d4Cards.length, 12); assert.equal(ui.scrolls.at(-1)?.left, 38 * 264); assert.equal(ui.scrolls.at(-1)?.behavior, "instant");
  assert.match(text(ui.catalog), /39 \/ 39/); assert.equal(ui.calls.viewStateWrites, 0);
  assert.equal(text(ui.catalog).includes(catalogCopy.homeCatalogCopy("en", "Checking other Testnet campaigns")), false);
});

test("Home fixture selection keeps all 27 active examples and all nine categories without altering seeds", () => {
  const before = JSON.stringify(seed);
  assert.equal(homeCircles.homeCircleExamples([...seed.SEED_CIRCLES, ...seed.COMPLETED_CIRCLES], "all").length, 27);
  assert.equal(homeCircles.HOME_CAUSE_CATEGORIES.length, 10);
  for (const category of homeCircles.HOME_CAUSE_CATEGORIES.filter(category => category !== "all")) {
    const selected = homeCircles.homeCircleExamples(seed.SEED_CIRCLES, category);
    assert.equal(selected.length, 3); assert.ok(selected.every(circle => circle.category === category));
    assert.equal(homeCircles.isHomeCauseCategory(category), true);
  }
  assert.equal(homeCircles.isHomeCauseCategory("unknown"), false);
  assert.equal(homeCircles.isHomeCauseCategory("__proto__"), false);
  assert.equal(JSON.stringify(seed), before);
});

test("standalone selection uses only supplied immutable campaign-to-story IDs, never matching titles or completed stories", () => {
  const stories = [...seed.SEED_CIRCLES, ...seed.COMPLETED_CIRCLES];
  const campaigns = [
    { ...PREVIEW_CAMPAIGNS[0], id: "800", title: "A linked campaign whose title changed" },
    { ...PREVIEW_CAMPAIGNS[0], id: "801", title: seed.SEED_CIRCLES[0].title },
    { ...PREVIEW_CAMPAIGNS[0], id: "802", title: "An unrelated campaign" },
    { ...PREVIEW_CAMPAIGNS[0], id: "803", title: "A completed story campaign" },
    { ...PREVIEW_CAMPAIGNS[0], id: "804", title: "An unknown story mapping" },
  ];
  const links = { "800": seed.SEED_CIRCLES[0].id, "803": seed.COMPLETED_CIRCLES[0].id, "804": "not-a-listed-story" };
  const before = JSON.stringify({ stories, campaigns, links });
  assert.deepEqual(homeCircles.homeStandaloneCampaigns(stories, campaigns, links).map(campaign => campaign.id), ["801", "802", "803", "804"]);
  assert.deepEqual(homeCircles.homeStandaloneCampaigns(stories, campaigns, {}).map(campaign => campaign.id), ["800", "801", "802", "803", "804"], "An unavailable mapping cannot authorize guessed deduplication");
  assert.equal(JSON.stringify({ stories, campaigns, links }), before, "Discovery must not mutate seeds, contract rows or the mapping");
});

test("the actual catalog hides server-linked QA campaigns, preserves all stories first and retains title-only lookalikes", async () => {
  const campaigns = [
    { ...PREVIEW_CAMPAIGNS[0], id: "800", title: "QA linked to the first story" },
    { ...PREVIEW_CAMPAIGNS[0], id: "801", title: seed.SEED_CIRCLES[0].title },
    { ...PREVIEW_CAMPAIGNS[0], id: "802", title: "Standalone escrow fixture" },
    { ...PREVIEW_CAMPAIGNS[0], id: "803", title: "QA linked to another story" },
  ];
  const ui = mount({ preview: false, liveCampaigns: campaigns, circleLinks: { "800": seed.SEED_CIRCLES[0].id, "803": seed.SEED_CIRCLES[6].id } });
  await ui.flush();
  assert.equal(nodes(ui.tree).filter(node => hasClass(node, "strip")).length, 1);
  assert.deepEqual(ui.orderedCards.map(card => card.props["data-example-cause"] ?? card.props["data-standalone-campaign"]), [...seed.SEED_CIRCLES.map(circle => circle.id), "801", "802"]);
  assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 2); assert.match(text(ui.catalog), /01 \/ 29/);
  assert.ok(nodes(ui.d4Cards[0]).filter(node => node.type === "Link").every(node => node.props.href === "/campaigns?id=801"));
  assert.ok(nodes(ui.cards[0]).filter(node => node.type === "Link").every(node => node.props.href === `/circles/${seed.SEED_CIRCLES[0].id}`));
  for (const category of homeCircles.HOME_CAUSE_CATEGORIES.slice(1)) {
    ui.select(category); await ui.flush(); assert.equal(ui.cards.length, 3); assert.equal(ui.d4Cards.length, 0);
    assert.equal(ui.orderedCards.length, 3); assert.ok(ui.cards.every(card => text(card).includes(circlesCopy.circlesCategory("en", category as CircleCategory))));
  }
  ui.select("all"); await ui.flush(); assert.deepEqual(ui.d4Cards.map(card => card.props["data-standalone-campaign"]), ["801", "802"]);
  assert.deepEqual(ui.calls.campaigns, ["0"]); assert.equal(ui.calls.network, 0); assert.equal(ui.calls.writes, 0);
});

test("missing server mapping leaves similarly named campaigns visible without pretending they are linked", async () => {
  const campaign = { ...PREVIEW_CAMPAIGNS[0], id: "804", title: seed.SEED_CIRCLES[0].title };
  const ui = mount({ preview: false, campaignReader: async () => ({ ok: true, now: String(PREVIEW_TIME), campaigns: [campaign] }) });
  await ui.flush(); assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 1);
  assert.equal(ui.d4Cards[0].props["data-standalone-campaign"], "804"); assert.match(text(ui.catalog), /01 \/ 28/);
});

test("a server mapping lookup failure stays visible and retryable without hiding or fabricating the story catalog", async () => {
  const ui = mount({ preview: false, campaignReader: async () => ({ ok: false, error: "Verified QA campaign mapping is unavailable" }) });
  await ui.flush(); assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 0);
  const alert = nodes(ui.catalog).find(node => node.props.role === "alert"); assert.ok(alert);
  assert.match(text(alert), /Campaigns could not be loaded\. Please try again\./);
  assert.ok(nodes(alert).some(node => node.type === "button" && text(node) === "Try again"));
  assert.equal(nodes(ui.catalog).filter(node => node.type === "HomeCircleFundingProgress" && node.props.active).length, 1);
  assert.equal(ui.calls.network, 0); assert.equal(ui.calls.writes, 0);
});

test("Home prototype UI phrases cover all four locales and preserve interpolation", () => {
  for (const [key, row] of Object.entries(catalogCopy.HOME_CATALOG_COPY)) {
    assert.equal(catalogCopy.homeCatalogCopy("en", key as catalogCopy.HomeCatalogKey), key);
    assert.equal(catalogCopy.homeCatalogCopy(undefined, key as catalogCopy.HomeCatalogKey), key);
    for (const phrase of row) { assert.ok(phrase.trim()); assert.deepEqual(phrase.match(/\{\w+\}/g)?.sort() ?? [], key.match(/\{\w+\}/g)?.sort() ?? []); }
  }
});

for (const preview of [true, false]) for (const locale of LOCALES) test(`${locale}: ${preview ? "preview" : "live"} Home retains all 27 covers and identifies example ratings without inventing verification`, async () => {
  const ui = mount({ locale, preview }); await ui.flush();
  assert.equal(ui.cards.length, 27);
  const c = circlesCopy.circlesCopy(locale);
  assert.ok(ui.catalog);
  assert.ok(text(ui.catalog).includes(catalogCopy.homeCatalogCopy(locale, preview ? "Fictional causes · no payment." : "Fictional causes · Testnet XLM only.")));
  for (const [index, card] of ui.cards.entries()) {
    const circle = seed.SEED_CIRCLES[index];
    const image = nodes(card).find(node => node.type === "Image")!;
    assert.equal(card.props["data-example-cause"], circle.id);
    assert.equal(image.props.src, circle.coverImage);
    assert.ok(existsSync(new URL(`../public${circle.coverImage}`, import.meta.url)));
    assert.equal(image.props.alt, contentCopy.circleDisplayContent(circle, locale).imageAlt ?? c("AI-generated fictional campaign illustration"));
    assert.equal(image.props.loading, index === 0 ? "eager" : "lazy");
    assert.ok(nodes(card).some(node => node.props.href === `/circles/${circle.id}`));
    assert.ok(nodes(card).filter(node => node.props.href).every(node => node.props.href === `/circles/${circle.id}`), "All card targets must open the same campaign, not an organizer or another donation flow");
    assert.ok(nodes(card).some(node => node.props.href === `/circles/${circle.id}` && text(node).trim() === c("View campaign")));
    const cardLinks = nodes(card).filter(node => node.type === "Link");
    assert.equal(cardLinks.filter(node => node.props.prefetch === true).length, index === 0 ? 1 : 0, "Only the active card CTA may prefetch its route");
    assert.ok(cardLinks.filter(node => text(node).trim() !== c("View campaign")).every(node => node.props.prefetch === false));
    assert.ok(text(card).includes(contentCopy.circleDisplayContent(circle, locale).title)); assert.ok(text(card).includes(circle.organizer));
    assert.ok(text(card).includes(c("Example cause")));
    const trust = nodes(card).find(node => node.props["data-testid"] === "organizer-trust-summary"); assert.ok(trust);
    assert.equal(trust.props["data-rating-source"], "example"); assert.equal(trust.props["data-kyc-status"], "unverified");
    assert.ok(text(trust).includes(catalogCopy.homeCatalogCopy(locale, "Example rating")));
    const funding = nodes(card).find(node => node.type === "HomeCircleFundingProgress"); assert.ok(funding);
    assert.equal(funding.props.circle, circle);
    assert.equal(funding.props.active, index === 0, "Only the selected card may read Testnet funding");
    assert.doesNotMatch(text(card), /\bXLM\b|\bPHP\b|₱|exact-source-units|already KYC|Verified/);
    assert.equal(nodes(card).some(node => String(node.props.href ?? "").startsWith("/campaigns?id=")), false);
  }
  assert.ok(nodes(ui.tree).some(node => node.props.href === "/campaigns?mode=testnet"));
  assert.ok(nodes(ui.tree).some(node => node.props.href === "/circles/create"));
  assert.ok(nodes(ui.catalog).some(node => node.props.href === "/campaigns?mode=examples" && node.props["aria-label"] === catalogCopy.homeCatalogCopy(locale, "Browse all example causes")));
  const options = nodes(ui.catalog).filter(node => node.type === "button" && "data-category" in node.props); assert.equal(options.length, 10);
  assert.equal(options[0].props["aria-label"], c("All examples"));
  for (const option of options.slice(1)) assert.equal(option.props["aria-label"], circlesCopy.circlesCategory(locale, option.props["data-category"] as CircleCategory));
  assert.equal(nodes(ui.catalog).find(node => node.props.id === "home-cause-category")?.props["aria-disabled"], false);
  const start = nodes(ui.catalog).find(node => hasClass(node, "startCampaign")); assert.ok(start);
  assert.equal(start.props.href, preview ? "/circles/create" : "/campaigns?create=1");
  assert.ok(text(start).includes(catalogCopy.homeCatalogCopy(locale, "Start a campaign")));
  assert.equal(ui.calls.wallet, preview ? 0 : 1); assert.equal(ui.calls.handle, preview ? 0 : 1);
  assert.deepEqual(ui.calls.campaigns, preview ? [] : ["0", "809"]);
  assert.equal(ui.calls.network, 0); assert.equal(ui.calls.writes, 0);
});

test("catalog funding reads are enabled for only the hydrated selected card, including restored and filtered views", async () => {
  const ui = mount({ preview: false, savedCatalogView: { category: "animals", index: 2 } });
  const readers = () => nodes(ui.catalog).filter(node => node.type === "HomeCircleFundingProgress");
  assert.equal(readers().filter(node => node.props.active).length, 0, "SSR cannot fan out public funding reads");
  await ui.flush();
  assert.equal(readers().length, 3);
  assert.equal(readers().filter(node => node.props.active).length, 1);
  assert.equal(readers()[2].props.active, true);
  ui.click(catalogCopy.homeCatalogCopy("en", "Next example cause")); await ui.flush();
  assert.equal(readers()[0].props.active, true);
  assert.equal(readers().filter(node => node.props.active).length, 1);
  ui.select("all"); await ui.flush();
  assert.equal(readers().length, 27);
  assert.equal(readers().filter(node => node.props.active).length, 1, "All 27 cards still request only the selected public total");
  assert.equal(readers()[0].props.active, true);
});

test("catalog prefetch warms one hydrated selected route, never all 27 cards", async () => {
  const ui = mount({ preview: false, savedCatalogView: { category: "animals", index: 2 } });
  const prefetchLinks = () => nodes(ui.catalog).filter(node => node.type === "Link" && node.props.prefetch === true);
  assert.equal(prefetchLinks().length, 0, "SSR must not start speculative route requests");
  await ui.flush();
  assert.equal(prefetchLinks().length, 1);
  assert.equal(prefetchLinks()[0].props.href, nodes(ui.cards[2]).find(node => node.type === "Link")?.props.href);
  ui.click(catalogCopy.homeCatalogCopy("en", "Next example cause")); await ui.flush();
  assert.equal(prefetchLinks().length, 1);
  assert.equal(prefetchLinks()[0].props.href, nodes(ui.cards[0]).find(node => node.type === "Link")?.props.href);
  ui.select("all"); await ui.flush();
  assert.equal(ui.cards.length, 27);
  assert.equal(prefetchLinks().length, 1);
  assert.equal(prefetchLinks()[0].props.href, "/circles/tino-relief");
  ui.select("medical"); await ui.flush();
  assert.equal(prefetchLinks().length, 1);
  assert.equal(ui.calls.network, 0); assert.equal(ui.calls.writes, 0);
});

test("actual category changes reset the manual catalog and expose three causes in every sector without financial reads", async () => {
  const ui = mount({ reducedMotion: false }); await ui.flush();
  ui.click(catalogCopy.homeCatalogCopy("en", "Next example cause")); assert.equal(ui.scrolls.at(-1)?.left, 264);
  for (const category of homeCircles.HOME_CAUSE_CATEGORIES.slice(1)) {
    ui.select(category); await ui.flush(); assert.equal(ui.cards.length, 3); assert.equal(ui.intervals.size, 0);
    assert.ok(text(ui.tree).includes("01 / 03"));
    assert.ok(ui.cards.every(card => text(card).includes(circlesCopy.circlesCategory("en", category as CircleCategory))));
    ui.click(catalogCopy.homeCatalogCopy("en", "Next example cause")); assert.equal(ui.scrolls.at(-1)?.left, 264);
    ui.click(catalogCopy.homeCatalogCopy("en", "Previous example cause")); assert.equal(ui.scrolls.at(-1)?.left, 0);
  }
  ui.select("all"); await ui.flush(); assert.equal(ui.cards.length, 27); assert.ok(text(ui.tree).includes("01 / 27"));
  ui.select("not-a-category"); await ui.flush(); assert.equal(ui.cards.length, 27);
  assert.equal(ui.calls.wallet, 0); assert.equal(ui.calls.handle, 0); assert.deepEqual(ui.calls.campaigns, []);
});

test("server-rendered category picker and carousel controls wait for hydration, then accept events", async () => {
  for (const preview of [true, false]) {
    const ui = mount({ preview });
    assert.equal(ui.cards.length, 27, "SSR must still expose the complete read-only example catalog");
    assert.equal(String(ui.catalog.props["data-catalog-ready"]), "false");
    const controls = nodes(ui.catalog).filter(node => node.type === "button" && !node.props["data-category"]);
    assert.equal(controls.length, 2); assert.ok(controls.every(control => control.props.disabled === true));
    assert.equal(nodes(ui.catalog).find(node => node.type === "fieldset")?.props.disabled, true);
    assert.equal(nodes(ui.catalog).find(node => node.props.id === "home-cause-category")?.props["aria-disabled"], true);
    assert.throws(() => ui.select("animals"), /hydrate before accepting/);
    assert.equal(ui.calls.wallet, 0); assert.deepEqual(ui.calls.campaigns, []); assert.equal(ui.calls.writes, 0);
    await ui.flush();
    assert.equal(String(ui.catalog.props["data-catalog-ready"]), "true");
    assert.ok(nodes(ui.catalog).filter(node => node.type === "button").every(control => control.props.disabled !== true));
    assert.equal(nodes(ui.catalog).find(node => node.type === "fieldset")?.props.disabled, false);
    ui.select("animals"); await ui.flush(); assert.equal(ui.cards.length, 3);
    ui.click(catalogCopy.homeCatalogCopy("en", "Next example cause")); assert.ok(text(ui.catalog).includes("02 / 03"));
    assert.equal(ui.calls.wallet, preview ? 0 : 1); assert.equal(ui.calls.writes, 0);
  }
});

test("example catalog is manual-only, wraps correctly and respects reduced-motion changes", async () => {
  const reduced = mount({ reducedMotion: true }); await reduced.flush(); assert.equal(reduced.intervals.size, 0);
  reduced.click(catalogCopy.homeCatalogCopy("en", "Previous example cause")); assert.equal(reduced.scrolls.at(-1)?.left, 26 * 264); assert.equal(reduced.scrolls.at(-1)?.behavior, "instant");
  const ui = mount({ reducedMotion: false }); await ui.flush(); assert.equal(ui.intervals.size, 0);
  ui.click(catalogCopy.homeCatalogCopy("en", "Next example cause")); await ui.flush(); assert.equal(ui.scrolls.at(-1)?.behavior, "smooth"); assert.ok(text(ui.tree).includes("02 / 27"));
  ui.changeReducedMotion(true); await ui.flush(); ui.click(catalogCopy.homeCatalogCopy("en", "Next example cause")); assert.equal(ui.scrolls.at(-1)?.behavior, "instant");
  assert.equal(nodes(ui.catalog).some(node => node.props["aria-label"] === homeCopy("en", "Pause campaign carousel")), false);
});

test("unavailable preview storage does not substitute D4 data or trigger real readers", async () => {
  const ui = mount({ deniedStorage: true }); await ui.flush(); assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 0); assert.equal(ui.calls.storageReads, 0); assert.equal(ui.calls.wallet, 0); assert.deepEqual(ui.calls.campaigns, []); assert.equal(ui.calls.writes, 0);
});

test("flag0 Home appends paginated standalone D4 after stories in one catalog with exact contract IDs and source totals", async () => {
  const ui = mount({ preview: false }); await ui.flush();
  assert.equal(ui.calls.wallet, 1); assert.equal(ui.calls.handle, 1); assert.deepEqual(ui.calls.campaigns, ["0", "809"]); assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 12);
  assert.equal(nodes(ui.tree).filter(node => hasClass(node, "strip")).length, 1);
  assert.deepEqual(ui.orderedCards.slice(0, 27).map(card => card.props["data-example-cause"]), Array.from(seed.SEED_CIRCLES, circle => circle.id));
  assert.deepEqual(ui.orderedCards.slice(27).map(card => card.props["data-standalone-campaign"]), Array.from({ length: 12 }, (_, index) => String(800 + index)));
  assert.match(text(ui.catalog), /01 \/ 39/);
  for (const [index, card] of ui.d4Cards.entries()) {
    assert.ok(text(card).includes(`Isolated Testnet campaign ${index + 1}`));
    const funding = nodes(card).find(node => node.type === "ConfirmedFundingProgress"); assert.ok(funding);
    assert.equal(funding.props.totalStroops, PREVIEW_CAMPAIGNS[0].total);
    assert.equal(funding.props.goalUsd, undefined); assert.equal(funding.props.donorSummary, undefined, "Unmapped cards must not borrow a fictional goal or contributor count");
    assert.ok(nodes(card).some(node => node.props.href === `/campaigns?id=${800 + index}`));
    assert.equal(nodes(card).filter(node => String(node.props.href ?? "").startsWith("/circles/")).length, 0);
    assert.equal(nodes(card).some(node => String(node.props.src ?? "").startsWith("/circles/generated/")), false);
  }
  assert.ok(nodes(ui.catalog).some(node => node.props.id === "home-cause-category"));
  assert.ok(nodes(ui.tree).some(node => node.props.href === "/campaigns?create=1"));
  assert.ok(text(ui.tree).includes(homeCopy("en", "test XLM · no real money")));
  ui.select("animals"); await ui.flush(); assert.equal(ui.cards.length, 3); assert.equal(ui.d4Cards.length, 0); assert.equal(ui.orderedCards.length, 3);
  ui.select("all"); await ui.flush(); assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 12);
  assert.deepEqual(ui.calls.campaigns, ["0", "809"], "Selecting examples never reloads or substitutes D4 contract data");
  assert.equal(ui.calls.storageReads, 0); assert.equal(ui.calls.network, 0); assert.equal(ui.calls.writes, 0);
});

test("flag0 D4 discovery failure remains visible and retryable within the same available story catalog", async () => {
  const ui = mount({ preview: false, failCampaigns: true }); await ui.flush(); assert.equal(ui.d4Cards.length, 0); assert.equal(ui.cards.length, 27);
  assert.ok(text(ui.tree).includes(homeCopy("en", "Campaigns could not be loaded. Please try again.")));
  const retry = nodes(ui.tree).find(node => node.type === "button" && text(node) === "Try again")!;
  ui.campaignFailure = false; (retry.props.onClick as () => void)(); await ui.flush(); assert.equal(ui.d4Cards.length, 12); assert.equal(ui.cards.length, 27);
  assert.equal(ui.calls.network, 0); assert.equal(ui.calls.writes, 0);
});

test("background discovery status and retry remain after the primary footer in every locale", async () => {
  for (const locale of LOCALES) {
    const pending = deferred<PublicCampaignPage>();
    const loading = mount({ preview: false, locale, campaignReader: () => pending.promise });
    const failed = mount({ preview: false, locale, failCampaigns: true });
    for (const screen of [loading, failed]) {
      await screen.flush();
      const elements = nodes(screen.catalog);
      const footer = elements.findIndex(node => hasClass(node, "footer"));
      const status = elements.findIndex(node => hasClass(node, "discoveryStatus"));
      assert.ok(footer >= 0 && status > footer, "A slow or failed background lookup must not add a loading or 44px retry row before the main carousel controls");
      assert.ok(elements.slice(footer, status).some(node => node.props.href === "/circles/create"));
      assert.equal(elements.slice(footer, status).filter(node => node.type === "button").length, 2);
      assert.equal(screen.cards.length, 27); assert.equal(screen.calls.network, 0); assert.equal(screen.calls.writes, 0);
      screen.cleanup();
    }
    assert.equal(nodes(failed.catalog).find(node => hasClass(node, "discoveryStatus"))?.props.role, "alert");
    assert.ok(nodes(failed.catalog).some(node => node.type === "button" && text(node) === homeCopy(locale, "Try again")));
  }
});

test("public D4 first page is visible while later pages are still pending and all records remain after completion", async () => {
  const later = deferred<PublicCampaignPage>();
  const campaigns = Array.from({ length: 12 }, (_, index) => ({ ...PREVIEW_CAMPAIGNS[0], id: String(800 + index), title: `Public funding ${index + 1}` }));
  const ui = mount({ preview: false, campaignReader: async before => before === "0"
    ? { ok: true, now: String(PREVIEW_TIME), campaigns: campaigns.slice(0, 10) } : later.promise });
  await ui.flush();
  assert.deepEqual(ui.calls.campaigns, ["0", "809"]);
  assert.equal(ui.d4Cards.length, 10, "Do not hide the completed page behind later ledger reads");
  assert.ok(text(ui.d4Cards[0]).includes("Public funding 1"));
  assert.equal(nodes(ui.tree).some(node => hasClass(node, "skeletonCards")), false);
  later.resolve({ ok: true, now: String(PREVIEW_TIME), campaigns: campaigns.slice(10) });
  await ui.flush(); assert.equal(ui.d4Cards.length, 12);
});

test("verified mappings are accumulated across public pages without reintroducing already represented campaigns", async () => {
  const later = deferred<PublicCampaignPage>();
  const campaigns = Array.from({ length: 12 }, (_, index) => ({ ...PREVIEW_CAMPAIGNS[0], id: String(800 + index) }));
  const ui = mount({ preview: false, campaignReader: async before => before === "0"
    ? { ok: true, now: String(PREVIEW_TIME), campaigns: campaigns.slice(0, 10), circleLinks: { "800": seed.SEED_CIRCLES[0].id } } : later.promise });
  await ui.flush();
  assert.deepEqual(ui.d4Cards.map(card => card.props["data-standalone-campaign"]), campaigns.slice(1, 10).map(campaign => campaign.id));
  later.resolve({ ok: true, now: String(PREVIEW_TIME), campaigns: campaigns.slice(10), circleLinks: { "810": seed.SEED_CIRCLES[1].id } });
  await ui.flush();
  assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 10);
  assert.deepEqual(ui.orderedCards.slice(27).map(card => card.props["data-standalone-campaign"]), campaigns.filter(campaign => campaign.id !== "800" && campaign.id !== "810").map(campaign => campaign.id));
  assert.match(text(ui.catalog), /01 \/ 37/); assert.deepEqual(ui.calls.campaigns, ["0", "809"]);
});

test("failed later discovery page preserves verified first-page cards and offers an honest retry", async () => {
  const later = deferred<PublicCampaignPage>();
  const campaigns = Array.from({ length: 10 }, (_, index) => ({ ...PREVIEW_CAMPAIGNS[0], id: String(800 + index) }));
  const ui = mount({ preview: false, campaignReader: async before => before === "0"
    ? { ok: true, now: String(PREVIEW_TIME), campaigns } : later.promise });
  await ui.flush(); assert.equal(ui.d4Cards.length, 10);
  later.resolve({ ok: false, error: "Isolated later-page failure" });
  await ui.flush(); assert.equal(ui.d4Cards.length, 10);
  assert.ok(text(ui.tree).includes("Campaigns could not be loaded. Please try again."));
  assert.ok(nodes(ui.tree).some(node => node.type === "button" && text(node) === "Try again"));
});

test("unmount invalidates pending public discovery instead of appending a stale route page", async () => {
  const later = deferred<PublicCampaignPage>();
  const ui = mount({ preview: false, campaignReader: async () => later.promise });
  await ui.flush(); assert.equal(ui.d4Cards.length, 0); ui.cleanup();
  later.resolve({ ok: true, now: String(PREVIEW_TIME), campaigns: [PREVIEW_CAMPAIGNS[0]] });
  await ui.flush(); assert.equal(ui.d4Cards.length, 0);
});

test("structured wallet failure enters Home retry UI while the independent unified campaign catalog remains available", async () => {
  const options = { preview: false, failWallet: true };
  const ui = mount(options); await ui.flush();
  const wallet = nodes(ui.tree).find(node => node.type === "section" && hasClass(node, "wallet"))!;
  assert.equal(nodes(wallet).some(node => node.type === "Peso" || hasClass(node, "sl-skel")), false);
  const market = nodes(wallet).find(node => node.type === "MarketValue")!;
  assert.equal(market.props.nativeStroops, undefined, "Failed refresh does not keep an old balance visible");
  assert.equal(market.props.balanceLoading, false);
  assert.ok(text(market.props.dashboardBalanceError).includes("Your wallet balance is unavailable."));
  assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 12);
  const retry = nodes(wallet).find(node => node.type === "button" && hasClass(node, "walletRetry"))!;
  options.failWallet = false; (retry.props.onClick as () => void)(); await ui.flush();
  assert.equal(nodes(ui.tree).find(node => node.type === "MarketValue")?.props.nativeStroops, "189923077");
  assert.equal(ui.calls.wallet, 2); assert.equal(ui.calls.network, 0); assert.equal(ui.calls.writes, 0);
});

test("Home renders the exact balance while its independent username lookup is still pending", async () => {
  const handle = deferred<string | null>();
  const ui = mount({ preview: false, handleReader: () => handle.promise }); await ui.flush();
  assert.equal(nodes(ui.tree).find(node => node.type === "MarketValue")?.props.nativeStroops, "189923077");
  assert.doesNotMatch(text(ui.tree), /Your wallet balance is unavailable\./);
  handle.resolve("later_handle"); await ui.flush();
  assert.match(text(ui.tree), /@later_handle/);
  assert.equal(ui.calls.wallet, 1); assert.equal(ui.calls.handle, 1);
  assert.equal(ui.calls.network, 0); assert.equal(ui.calls.writes, 0);
});

test("an unavailable username never hides a successfully read Home balance or invents a handle", async () => {
  const ui = mount({ preview: false, handleReader: async () => { throw Error("Isolated username read outage"); } }); await ui.flush();
  assert.equal(nodes(ui.tree).find(node => node.type === "MarketValue")?.props.nativeStroops, "189923077");
  assert.doesNotMatch(text(ui.tree), /Your wallet balance is unavailable\.|@isolated/);
  assert.match(text(ui.tree), /Welcome to Salapi/);
});

test("Home ignores pending wallet and handle results after its mount is disposed", async () => {
  const balance = deferred<HomeWallet>(), handle = deferred<string | null>();
  const ui = mount({ preview: false, walletReader: () => balance.promise, handleReader: () => handle.promise }); await ui.flush();
  ui.cleanup();
  balance.resolve({ pesos: 99, address: "Disposed wallet", nativeStroops: "999999999" }); handle.resolve("disposed_owner"); await ui.flush();
  const market = nodes(ui.tree).find(node => node.type === "MarketValue")!;
  assert.equal(market.props.nativeStroops, undefined, "Disposed response cannot populate the persistent balance layout");
  assert.equal(market.props.balanceLoading, true);
  assert.doesNotMatch(text(ui.tree), /@disposed_owner|Your wallet balance is unavailable\./);
});

test("a superseded Home retry cannot replace a newer wallet balance or username", async () => {
  const balances = [deferred<HomeWallet>(), deferred<HomeWallet>()], handles = [deferred<string | null>(), deferred<string | null>()];
  let walletReads = 0, handleReads = 0;
  const ui = mount({ preview: false,
    walletReader: () => ++walletReads === 1 ? Promise.resolve({ ok: false, error: "Your wallet balance is unavailable." }) : balances[walletReads - 2].promise,
    handleReader: () => ++handleReads === 1 ? Promise.resolve(null) : handles[handleReads - 2].promise });
  await ui.flush();
  const retry = nodes(ui.tree).find(node => node.type === "button" && hasClass(node, "walletRetry"))!.props.onClick as () => void;
  retry(); retry(); await ui.flush();
  balances[1].resolve({ pesos: 20, address: "Newest wallet", nativeStroops: "200000000" }); handles[1].resolve("newest_owner"); await ui.flush();
  balances[0].resolve({ pesos: 10, address: "Superseded wallet", nativeStroops: "100000000" }); handles[0].resolve("superseded_owner"); await ui.flush();
  assert.equal(nodes(ui.tree).find(node => node.type === "MarketValue")?.props.nativeStroops, "200000000");
  assert.match(text(ui.tree), /@newest_owner/); assert.doesNotMatch(text(ui.tree), /@superseded_owner/);
});

test("examples render before wallet/D4 readers settle and remain present when the real D4 collection is empty", async () => {
  const ui = mount({ preview: false, liveCampaigns: [] });
  assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 0);
  assert.equal(ui.calls.wallet, 0); assert.deepEqual(ui.calls.campaigns, []);
  await ui.flush();
  assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 0);
  assert.doesNotMatch(text(ui.tree), /No campaigns yet\. Start one and invite your community\./, "The available story catalog must not look empty");
  assert.equal(ui.orderedCards.length, 27); assert.match(text(ui.catalog), /01 \/ 27/);
  assert.ok(nodes(ui.tree).some(node => node.props.href === "/campaigns?create=1"));
});

test("closed D4 campaigns remain honest read-only cards, never fictional pledge links", async () => {
  const campaign = { ...PREVIEW_CAMPAIGNS[0], id: "904", title: "Actual closed escrow fixture", state: "Closed" as Campaign["state"] };
  const ui = mount({ preview: false, liveCampaigns: [campaign] }); await ui.flush();
  assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 1);
  const link = nodes(ui.d4Cards[0]).find(node => node.type === "Link" && hasClass(node, "pledge"))!;
  assert.equal(link.props.href, "/campaigns?id=904"); assert.equal(text(link), homeCopy("en", "View campaign"));
  assert.ok(text(ui.d4Cards[0]).includes("#904 · Closed"));
  assert.ok(nodes(ui.d4Cards[0]).filter(node => node.type === "Link").every(node => node.props.href === "/campaigns?id=904" && node.props.prefetch === false));
});

test("Home catalog responsive styles retain compact controls and persistent truth framing", () => {
  const css = source("../components/HomeCirclesCatalog.module.css");
  const sheet = parse(css);
  for (const [selector, property] of [[".categoryPicker summary", "min-height"], [".startCampaign", "min-height"], [".body h2 a", "min-height"], [".pledge", "min-height"], [".controls button", "height"]]) {
    const values: string[] = [];
    sheet.walkRules(rule => { if (rule.selectors.includes(selector)) for (const node of rule.nodes) if (node.type === "decl" && (node as Declaration).prop === property) values.push((node as Declaration).value); });
    assert.ok(values.some(value => Number.parseFloat(value) >= 44), `${selector} must retain a 44px touch target`);
  }
  assert.match(css, /:focus-visible[^}]*outline:\s*2px/);
  assert.doesNotMatch(css, /\.notice\s*\{[^}]*display:\s*none/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("secondary campaign destinations remain in a closed native disclosure in all four locales", async () => {
  for (const locale of LOCALES) {
    const ui = mount({ preview: false, locale }); await ui.flush();
    const disclosure = nodes(ui.catalog).find(node => node.type === "details" && hasClass(node, "campaignTools"))!;
    assert.ok(disclosure);
    assert.equal(disclosure.props.open, undefined, "The default dashboard must not reserve three secondary navigation rows");
    const summary = nodes(disclosure).find(node => node.type === "summary")!;
    assert.equal(text(summary), catalogCopy.homeCatalogCopy(locale, "Campaign tools"));
    assert.deepEqual(nodes(disclosure).filter(node => node.type === "Link").map(node => node.props.href), ["/circles/create", "/campaigns?mode=testnet", "/campaigns?create=1"]);
    ui.cleanup();
  }
  const css = source("../components/HomeCirclesCatalog.module.css");
  assert.match(css, /\.campaignTools summary\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /summary\):focus-visible[^}]*outline:\s*2px/);
  assert.match(source("../components/screens/CirclesOrganizerScreen.tsx"), /Example rating/);
});

test("short Home windows reclaim decorative space without shrinking or hiding interactive controls", () => {
  const sheet = parse(source("../components/HomeCirclesCatalog.module.css"));
  const compact = sheet.nodes.find(node => node.type === "atrule" && node.name === "media" && node.params === "(max-height: 900px)");
  assert.ok(compact && compact.type === "atrule");
  const touched: string[] = [];
  compact.walkRules(rule => {
    touched.push(...rule.selectors);
    for (const node of rule.nodes) if (node.type === "decl") {
      assert.ok(["margin-top", "padding-bottom", "margin-bottom", "height", "padding-top", "gap"].includes(node.prop));
      assert.ok(Number.parseFloat(node.value) >= 0);
      assert.notEqual(node.prop, "font-size");
    }
  });
  assert.ok(touched.includes(".photo"));
  assert.equal(touched.some(selector => /pledge|button|summary|organizer|explore/.test(selector)), false);
});

test("editorial campaign card centers the title while keeping metadata away from image truth labels", () => {
  const sheet = parse(source("../components/HomeCirclesCatalog.module.css"));
  const base: Record<string, Record<string, string>> = {};
  const compact: Record<string, Record<string, string>> = {};
  sheet.walkRules(rule => {
    const atRule = rule.parent?.type === "atrule" ? rule.parent : null;
    const target = atRule?.params === "(max-height: 900px)" ? compact : atRule === null ? base : null;
    if (!target) return;
    for (const selector of rule.selectors.filter(selector => [".photo", ".category", ".example", ".ai", ".body h2", ".body h2 a", ".card"].includes(selector))) {
      target[selector] ??= {};
      for (const node of rule.nodes) if (node.type === "decl") target[selector][node.prop] = node.value;
    }
  });
  assert.equal(base[".category"]["font-size"], "10px");
  for (const selector of [".example", ".ai"]) assert.equal(base[selector]["font-size"], "9px");
  for (const selector of [".category", ".example", ".ai"]) assert.equal(compact[selector]?.["font-size"], undefined, "Compact spacing must not shrink the readable badge font");
  assert.ok(Number.parseFloat(compact[".photo"].height) >= 100, "Short screens must retain an editorial cover rather than a tiny thumbnail");
  assert.equal(base[".body h2"]["text-align"], "center");
  assert.equal(base[".body h2 a"]["justify-content"], "center");
  assert.equal(base[".card"].background, "#0b1f36");
  assert.doesNotMatch(source("../components/HomeCirclesCatalog.module.css"), /line-clamp/, "Campaign titles must not be cut off in the narrow editorial panel");
  const split = sheet.nodes.find(node => node.type === "atrule" && node.name === "container" && node.params === "(min-width: 430px)");
  assert.ok(split && split.type === "atrule", "The photo/content split must work within the app's 500px frame");
  const ui = mount();
  for (const card of ui.cards) {
    const photo = nodes(card).find(node => hasClass(node, "photo")); assert.ok(photo);
    assert.equal(nodes(photo).some(node => hasClass(node, "category") || hasClass(node, "donationMark")), false);
    assert.ok(nodes(photo).some(node => hasClass(node, "example")));
    assert.ok(nodes(photo).some(node => hasClass(node, "ai")));
  }
});

test("Home wires discovery into one manual catalog and renders the shared Stellar footer", () => {
  const home = source("../app/page.tsx"), catalog = source("../components/HomeCirclesCatalog.tsx");
  assert.equal((home.match(/<HomeCirclesCatalog\b/g) ?? []).length, 1);
  assert.match(home, /<HomeCirclesCatalog\s+campaigns=\{campaigns\}\s+circleLinks=\{circleLinks\}\s+loading=\{loading\}\s+error=\{error\}\s+onRetry=\{loadCampaigns\}\s*\/>/);
  assert.match(home, /import\s*\{\s*PoweredByStellarV2\s*\}\s*from\s*["']@\/components\/ui\/brand["']/);
  assert.match(home, /<footer\b[^>]*><PoweredByStellarV2\s*\/>/);
  assert.doesNotMatch(home, /s\.(?:fundraise|strip)|Pause|Play|setInterval\s*\(/);
  assert.doesNotMatch(catalog, /campaignState|walletState|myHandle|sessionStorage|localStorage|fetch\s*\(/);
  assert.doesNotMatch(catalog, /setInterval\s*\(/);
});

test("the unified carousel remains manual, wraps all stories and standalone campaigns and respects reduced motion", async () => {
  const ui = mount({ preview: false, reducedMotion: false }); await ui.flush(); assert.equal(ui.intervals.size, 0);
  assert.equal(ui.orderedCards.length, 39);
  ui.click(catalogCopy.homeCatalogCopy("en", "Previous example cause")); await ui.flush();
  assert.equal(ui.scrolls.at(-1)?.left, 38 * 264); assert.equal(ui.scrolls.at(-1)?.behavior, "smooth"); assert.match(text(ui.catalog), /39 \/ 39/);
  assert.equal(nodes(ui.catalog).filter(node => node.type === "HomeCircleFundingProgress" && node.props.active).length, 0, "Selecting a standalone campaign must not fan out story funding reads");
  const count = ui.scrolls.length; ui.document.hidden = true; await ui.flush(); assert.equal(ui.scrolls.length, count); assert.equal(ui.intervals.size, 0);
  assert.equal(nodes(ui.catalog).some(node => /(?:Pause|Play) campaign carousel/.test(String(node.props["aria-label"] ?? ""))), false);
  ui.document.hidden = false; ui.changeReducedMotion(true); await ui.flush();
  ui.click(catalogCopy.homeCatalogCopy("en", "Next example cause")); await ui.flush();
  assert.equal(ui.scrolls.at(-1)?.left, 0); assert.equal(ui.scrolls.at(-1)?.behavior, "instant"); assert.match(text(ui.catalog), /01 \/ 39/);
  assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 12); assert.equal(ui.intervals.size, 0);
  assert.equal(ui.calls.network, 0); assert.equal(ui.calls.writes, 0);
});
