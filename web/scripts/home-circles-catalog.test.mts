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
const circleTypes = fixture("../lib/circles/types.ts") as { progressPct(circle: Circle): number };
const code = compile("../app/page.tsx");
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
const hasClass = (node: Element, name: string) => String(node.props.className ?? "").split(" ").includes(name);

// Actual Home and HomeCirclesCatalog TSX, with separate hook state for each
// component and isolated effects/DOM-shaped refs. No browser, auth, provider,
// ledger, actual navigation or network requests are available.
function mount(options: { preview?: boolean; locale?: Locale; reducedMotion?: boolean; deniedStorage?: boolean; failCampaigns?: boolean; failWallet?: boolean; liveCampaigns?: Campaign[]; savedCatalogView?: unknown; navigationEntryReady?: boolean } = {}) {
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
  const catalog = {} as { default(): Element };
  const navigationViewHook = {} as { useNavigationViewState(key: string): string };
  const jsx = (type: unknown, props: Record<string, unknown>, key?: string): Element => {
    if (type !== catalog.default) return { type, props, key };
    const parentStates = states, parentCursor = cursor;
    states = catalogStates; cursor = 0;
    try { return catalog.default(); }
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
      if (name === "@/components/AccountAvatar") return { default: "AccountAvatar" };
      if (name === "@/components/useAccountPhoto") return { useAccountPhoto: () => ({ status: "ready", profile: null }) };
      if (name === "@/components/ui/kit") return { Ico: icons, Peso: "Peso" };
      if (name === "@/components/ui/icons") return { Ico: icons };
      if (name === "@/lib/local-preview") return { isLocalPreview: preview, PREVIEW_WALLET, PREVIEW_TIME, PREVIEW_CAMPAIGNS, normalizePreviewCampaigns: (rows: Campaign[]) => rows };
      if (name === "@/lib/circles/seed") return seed;
      if (name === "@/lib/circles/types") return circleTypes;
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
      if (name === "@/lib/i18n/account-photo") return { accountPhotoCopy };
      if (name === "@/lib/disaster") return { formatStroops: (value: string) => `exact-source-units:${value}` };
      if (name === "@/lib/wallet-state") return { requireWalletState };
      if (name === "@/app/actions") return { async walletState() { calls.wallet++; assert.equal(preview, false); return options.failWallet ? { ok: false, error: "Your wallet balance is unavailable." } : { pesos: 123.45, address: "Readonly isolated Testnet wallet" }; }, async myHandle() { calls.handle++; assert.equal(preview, false); return "isolated"; } };
      if (name === "@/app/campaign-actions") return { async campaignState(_ids: string, before: string) { calls.campaigns.push(before); assert.equal(preview, false); if (campaignFailure) return { ok: false, error: "Isolated readonly failure" }; const offset = before === "0" ? 0 : liveCampaigns.findIndex(campaign => campaign.id === before) + 1; return { ok: true, now: String(PREVIEW_TIME), campaigns: liveCampaigns.slice(offset, offset + 10) }; } };
      if (name.endsWith(".module.css")) return { default: new Proxy({}, { get: (_target, key) => String(key) }) };
      throw Error(`Unexpected actual Home dependency: ${name}`);
    },
  };
  runInNewContext(compile("../lib/ui/useNavigationViewState.ts"), { ...context, exports: navigationViewHook });
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
  function select(category: string) { const field = nodes(tree).find(node => node.props.id === "home-cause-category"); assert.ok(field); assert.notEqual(field.props.disabled, true, "The native category control must hydrate before accepting a choice"); (field.props.onChange as (event: unknown) => void)({ target: { value: category } }); render(); }
  function click(ariaLabel: string) { const button = nodes(tree).find(node => node.type === "button" && node.props["aria-label"] === ariaLabel); assert.ok(button, `Missing Home control ${ariaLabel}`); assert.notEqual(button.props.disabled, true); (button.props.onClick as () => void)(); render(); }
  return { calls, render, flush, select, click, scrolls, intervals, document, get navigationViews() { return navigationViews(); },
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
    }, set campaignFailure(value: boolean) { campaignFailure = value; }, get tree() { return tree!; }, get catalog() { return nodes(tree).find(node => node.props["data-testid"] === "home-circles-catalog")!; }, get cards() { return nodes(tree).filter(node => node.type === "article" && "data-example-cause" in node.props); }, get d4Cards() { const strip = nodes(tree).find(node => node.props["aria-label"] === homeCopy(locale, "Campaign carousel")); return nodes(strip).filter(node => node.type === "article"); }, changeReducedMotion(value: boolean) { mediaReduced = value; for (const listener of mediaListeners) listener(); render(); } };
}

test("history view state accepts only bounded discovery fields and ignores corrupt or financial values", () => {
  const neutral = { category: "all", index: 0, sort: "all" };
  for (const snapshot of ["", "{", "null", "[]", JSON.stringify("animals"), " ".repeat(2049)]) assert.deepEqual(homeCircles.parseCauseViewState(snapshot), neutral);
  assert.deepEqual(homeCircles.parseCauseViewState(JSON.stringify({ category: "animals", index: 1, sort: "closeToGoal", balance: 999, kyc: true })), { category: "animals", index: 1, sort: "closeToGoal" });
  assert.deepEqual(homeCircles.parseCauseViewState(JSON.stringify({ category: "__proto__", index: -1, sort: "<script>" })), neutral);
  assert.deepEqual(homeCircles.parseCauseViewState(JSON.stringify({ category: "medical", index: 1.5 })), { category: "medical", index: 0, sort: "all" });
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
  const select = nodes(ui.catalog).find(node => node.props.id === "home-cause-category")!;
  (select.props.onChange as (event: unknown) => void)({ target: { value: "animals" } });
  const arrow = nodes(ui.catalog).find(node => node.type === "button")!;
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

test("Home prototype UI phrases cover all four locales and preserve interpolation", () => {
  for (const [key, row] of Object.entries(catalogCopy.HOME_CATALOG_COPY)) {
    assert.equal(catalogCopy.homeCatalogCopy("en", key as catalogCopy.HomeCatalogKey), key);
    assert.equal(catalogCopy.homeCatalogCopy(undefined, key as catalogCopy.HomeCatalogKey), key);
    for (const phrase of row) { assert.ok(phrase.trim()); assert.deepEqual(phrase.match(/\{\w+\}/g)?.sort() ?? [], key.match(/\{\w+\}/g)?.sort() ?? []); }
  }
});

for (const preview of [true, false]) for (const locale of LOCALES) test(`${locale}: ${preview ? "preview" : "live"} Home renders all 27 example covers, organizers and synthetic ratings`, async () => {
  const ui = mount({ locale, preview }); await ui.flush();
  assert.equal(ui.cards.length, 27);
  const c = circlesCopy.circlesCopy(locale);
  assert.ok(ui.catalog);
  assert.ok(text(ui.catalog).includes(catalogCopy.homeCatalogCopy(locale, "Fictional causes · AI photos · example ratings · no payment.")));
  const organizers = fixture("../lib/circles/organizers.ts") as { getOrganizerForCircle(circle: Circle): { rating: number; reviewCount: number } };
  for (const [index, card] of ui.cards.entries()) {
    const circle = seed.SEED_CIRCLES[index];
    const organizer = organizers.getOrganizerForCircle(circle);
    const image = nodes(card).find(node => node.type === "Image")!;
    assert.equal(card.props["data-example-cause"], circle.id);
    assert.equal(image.props.src, circle.coverImage);
    assert.ok(existsSync(new URL(`../public${circle.coverImage}`, import.meta.url)));
    assert.equal(image.props.alt, circle.imageAlt ?? c("AI-generated fictional campaign illustration"));
    assert.equal(image.props.loading, index === 0 ? "eager" : "lazy");
    assert.ok(nodes(card).some(node => node.props.href === `/circles/${circle.id}`));
    assert.ok(nodes(card).some(node => node.props.href === `/circles/${circle.id}/organizer` && node.props["aria-label"] === c("View example organizer profile: {name}", { name: circle.organizer })));
    assert.ok(nodes(card).some(node => node.props.href === `/circles/${circle.id}/donate` && text(node).trim() === c("Preview a pledge")));
    assert.ok(nodes(card).filter(node => node.type === "Link").every(node => node.props.prefetch === false));
    assert.ok(text(card).includes(circle.title)); assert.ok(text(card).includes(circle.organizer));
    assert.ok(text(card).includes(c("Example cause")));
    assert.ok(text(card).includes(catalogCopy.homeCatalogCopy(locale, "Example rating")));
    assert.ok(nodes(card).some(node => node.type === "span" && text(node) === catalogCopy.homeCatalogCopy(locale, "Example rating")), "The visible rating label must remain independently identifiable");
    assert.ok(text(card).includes(organizer.rating.toFixed(1)));
    assert.ok(text(card).includes(catalogCopy.homeCatalogCopy(locale, "{count} example reviews", { count: organizer.reviewCount })));
    assert.ok(nodes(card).some(node => node.props["aria-label"] === catalogCopy.homeCatalogCopy(locale, "{percent}% example progress. No donations collected.", { percent: circleTypes.progressPct(circle) })));
    assert.doesNotMatch(text(card), /\bXLM\b|\bPHP\b|₱|exact-source-units|already KYC|Verified/);
    assert.equal(nodes(card).some(node => String(node.props.href ?? "").startsWith("/campaigns?id=")), false);
  }
  assert.ok(nodes(ui.tree).some(node => node.props.href === "/campaigns?mode=testnet"));
  assert.ok(nodes(ui.tree).some(node => node.props.href === "/circles/create"));
  assert.ok(nodes(ui.catalog).some(node => node.props.href === "/campaigns?mode=examples" && node.props["aria-label"] === catalogCopy.homeCatalogCopy(locale, "Browse all example causes")));
  const options = nodes(ui.catalog).filter(node => node.type === "option"); assert.equal(options.length, 10);
  for (const option of options.slice(1)) assert.equal(text(option), circlesCopy.circlesCategory(locale, option.props.value as CircleCategory));
  assert.equal(ui.calls.wallet, preview ? 0 : 1); assert.equal(ui.calls.handle, preview ? 0 : 1);
  assert.deepEqual(ui.calls.campaigns, preview ? [] : ["0", "809"]);
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

test("server-rendered native catalog controls wait for hydration, then accept category and carousel events", async () => {
  for (const preview of [true, false]) {
    const ui = mount({ preview });
    assert.equal(ui.cards.length, 27, "SSR must still expose the complete read-only example catalog");
    assert.equal(String(ui.catalog.props["data-catalog-ready"]), "false");
    const controls = nodes(ui.catalog).filter(node => node.type === "select" || node.type === "button");
    assert.equal(controls.length, 3); assert.ok(controls.every(control => control.props.disabled === true));
    assert.throws(() => ui.select("animals"), /hydrate before accepting/);
    assert.equal(ui.calls.wallet, 0); assert.deepEqual(ui.calls.campaigns, []); assert.equal(ui.calls.writes, 0);
    await ui.flush();
    assert.equal(String(ui.catalog.props["data-catalog-ready"]), "true");
    assert.ok(nodes(ui.catalog).filter(node => node.type === "select" || node.type === "button").every(control => control.props.disabled !== true));
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
  const ui = mount({ deniedStorage: true }); await ui.flush(); assert.equal(ui.cards.length, 27); assert.equal(ui.calls.storageReads, 1); assert.equal(ui.calls.wallet, 0); assert.deepEqual(ui.calls.campaigns, []); assert.equal(ui.calls.writes, 0);
});

test("flag0 Home retains paginated D4 reads, contract IDs/exact source totals and original creation/navigation", async () => {
  const ui = mount({ preview: false }); await ui.flush();
  assert.equal(ui.calls.wallet, 1); assert.equal(ui.calls.handle, 1); assert.deepEqual(ui.calls.campaigns, ["0", "809"]); assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 12);
  for (const [index, card] of ui.d4Cards.entries()) {
    assert.ok(text(card).includes(`Isolated Testnet campaign ${index + 1}`));
    assert.ok(text(card).includes(`exact-source-units:${PREVIEW_CAMPAIGNS[0].total} XLM`));
    assert.ok(nodes(card).some(node => node.props.href === `/campaigns?id=${800 + index}`));
    assert.equal(nodes(card).filter(node => String(node.props.href ?? "").startsWith("/circles/")).length, 0);
    assert.equal(nodes(card).some(node => String(node.props.src ?? "").startsWith("/circles/generated/")), false);
  }
  assert.ok(nodes(ui.catalog).some(node => node.props.id === "home-cause-category"));
  assert.ok(nodes(ui.tree).some(node => node.props.href === "/campaigns?create=1"));
  assert.ok(text(ui.tree).includes(catalogCopy.homeCatalogCopy("en", "Separate on-chain escrow and proof-review flow. Not the fictional examples above.")));
  ui.select("animals"); await ui.flush(); assert.equal(ui.cards.length, 3); assert.equal(ui.d4Cards.length, 12);
  assert.deepEqual(ui.calls.campaigns, ["0", "809"], "Selecting examples never reloads or substitutes D4 contract data");
  assert.equal(ui.calls.storageReads, 0); assert.equal(ui.calls.network, 0); assert.equal(ui.calls.writes, 0);
});

test("flag0 D4 campaign failure remains honest and retryable while the independent example catalog stays available", async () => {
  const ui = mount({ preview: false, failCampaigns: true }); await ui.flush(); assert.equal(ui.d4Cards.length, 0); assert.equal(ui.cards.length, 27);
  assert.ok(text(ui.tree).includes(homeCopy("en", "Campaigns could not be loaded. Please try again.")));
  const retry = nodes(ui.tree).find(node => node.type === "button" && text(node) === "Try again")!;
  ui.campaignFailure = false; (retry.props.onClick as () => void)(); await ui.flush(); assert.equal(ui.d4Cards.length, 12); assert.equal(ui.cards.length, 27);
  assert.equal(ui.calls.network, 0); assert.equal(ui.calls.writes, 0);
});

test("structured wallet failure enters Home retry UI while both independent campaign catalogs remain available", async () => {
  const options = { preview: false, failWallet: true };
  const ui = mount(options); await ui.flush();
  const wallet = nodes(ui.tree).find(node => node.type === "section" && hasClass(node, "wallet"))!;
  assert.equal(nodes(wallet).some(node => node.type === "Peso" || hasClass(node, "sl-skel")), false);
  assert.ok(text(wallet).includes("Your wallet balance is unavailable."));
  assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 12);
  const retry = nodes(wallet).find(node => node.type === "button" && hasClass(node, "walletRetry"))!;
  options.failWallet = false; (retry.props.onClick as () => void)(); await ui.flush();
  assert.equal(nodes(ui.tree).find(node => node.type === "Peso")?.props.value, 123.45);
  assert.equal(ui.calls.wallet, 2); assert.equal(ui.calls.network, 0); assert.equal(ui.calls.writes, 0);
});

test("examples render before wallet/D4 readers settle and remain present when the real D4 collection is empty", async () => {
  const ui = mount({ preview: false, liveCampaigns: [] });
  assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 0);
  assert.equal(ui.calls.wallet, 0); assert.deepEqual(ui.calls.campaigns, []);
  await ui.flush();
  assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 0);
  assert.ok(text(ui.tree).includes(homeCopy("en", "No campaigns yet. Start one and invite your community.")));
  assert.ok(nodes(ui.tree).some(node => node.props.href === "/campaigns?create=1"));
});

test("closed D4 campaigns remain honest read-only cards, never fictional pledge links", async () => {
  const campaign = { ...PREVIEW_CAMPAIGNS[0], id: "904", title: "Actual closed escrow fixture", state: "Closed" as Campaign["state"] };
  const ui = mount({ preview: false, liveCampaigns: [campaign] }); await ui.flush();
  assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 1);
  const link = nodes(ui.d4Cards[0]).find(node => node.type === "Link")!;
  assert.equal(link.props.href, "/campaigns?id=904"); assert.equal(text(link), homeCopy("en", "View campaign"));
  assert.ok(text(ui.d4Cards[0]).includes("CAMPAIGN #904 · Closed"));
});

test("Home catalog responsive styles retain compact controls and persistent truth framing", () => {
  const css = source("../components/HomeCirclesCatalog.module.css");
  const sheet = parse(css);
  for (const [selector, property] of [[".tools select", "min-height"], [".organizer", "min-height"], [".body h2 a", "min-height"], [".pledge", "min-height"], [".controls button", "height"]]) {
    const values: string[] = [];
    sheet.walkRules(rule => { if (rule.selectors.includes(selector)) for (const node of rule.nodes) if (node.type === "decl" && (node as Declaration).prop === property) values.push((node as Declaration).value); });
    assert.ok(values.some(value => Number.parseFloat(value) >= 44), `${selector} must retain a 44px touch target`);
  }
  assert.match(css, /:focus-visible[^}]*outline:\s*2px/);
  assert.doesNotMatch(css, /\.notice\s*\{[^}]*display:\s*none/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("Home always renders the example component before the separately gated D4 section", () => {
  const home = source("../app/page.tsx"), catalog = source("../components/HomeCirclesCatalog.tsx");
  assert.match(home, /<HomeCirclesCatalog\s*\/>\s*\{!isLocalPreview\s*&&\s*<section/);
  assert.doesNotMatch(catalog, /campaignState|walletState|myHandle|sessionStorage|localStorage|fetch\s*\(/);
  assert.doesNotMatch(catalog, /setInterval\s*\(/);
});

test("real D4 carousel keeps its pause, hidden-page and interaction safeguards independently of manual examples", async () => {
  const ui = mount({ preview: false, reducedMotion: false }); await ui.flush(); assert.equal(ui.intervals.size, 1);
  for (const interval of [...ui.intervals.values()]) interval(); await ui.flush(); assert.ok(text(ui.tree).includes("02 / 12"));
  const count = ui.scrolls.length; ui.document.hidden = true; for (const interval of [...ui.intervals.values()]) interval(); await ui.flush(); assert.equal(ui.scrolls.length, count);
  ui.document.hidden = false; ui.click(homeCopy("en", "Pause campaign carousel")); await ui.flush(); assert.equal(ui.intervals.size, 0);
  ui.click(homeCopy("en", "Play campaign carousel")); await ui.flush(); assert.equal(ui.intervals.size, 1);
  const strip = nodes(ui.tree).find(node => node.props["aria-label"] === homeCopy("en", "Campaign carousel"))!; (strip.props.onPointerDown as () => void)(); await ui.flush(); assert.equal(ui.intervals.size, 0);
  ui.click(homeCopy("en", "Play campaign carousel")); await ui.flush(); ui.changeReducedMotion(true); await ui.flush(); assert.equal(ui.intervals.size, 0);
  assert.equal(ui.cards.length, 27); assert.equal(ui.d4Cards.length, 12);
});
