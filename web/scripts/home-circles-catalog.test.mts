import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { LOCALES, type Locale } from "../lib/i18n/config.ts";
import { homeCopy } from "../lib/i18n/revamp-home.ts";
import * as catalogCopy from "../lib/i18n/revamp-home-catalog.ts";
import * as circlesCopy from "../lib/i18n/revamp-circles.ts";
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

// Actual Home TSX, isolated effects and DOM-shaped carousel refs. No browser,
// auth, provider, ledger, actual navigation or network requests are available.
function mount(options: { preview?: boolean; locale?: Locale; reducedMotion?: boolean; deniedStorage?: boolean; failCampaigns?: boolean; liveCampaigns?: Campaign[] } = {}) {
  const preview = options.preview ?? true;
  const locale = options.locale ?? "en";
  const liveCampaigns = options.liveCampaigns ?? Array.from({ length: 12 }, (_, index) => ({ ...PREVIEW_CAMPAIGNS[0], id: String(800 + index), title: `Isolated Testnet campaign ${index + 1}` }));
  const calls = { wallet: 0, handle: 0, campaigns: [] as string[], network: 0, writes: 0, storageReads: 0 };
  let campaignFailure = options.failCampaigns ?? false;
  const states: unknown[] = [];
  let cursor = 0;
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
  const jsx = (type: unknown, props: Record<string, unknown>, key?: string): Element => ({ type, props, key });
  const icons = new Proxy({}, { get: () => () => null });
  runInNewContext(code, { exports: component, document,
    fetch() { calls.network++; throw Error("Network forbidden in isolated Home tests"); },
    sessionStorage: { getItem() { calls.storageReads++; if (options.deniedStorage) throw Error("Denied test storage"); return null; }, setItem() { calls.writes++; throw Error("Home must not write storage"); } },
    setTimeout(callback: Callback) { const id = ++timer; timeouts.set(id, callback); return id; }, clearTimeout(id: number) { timeouts.delete(id); },
    setInterval(callback: Callback) { const id = ++timer; intervals.set(id, callback); return id; }, clearInterval(id: number) { intervals.delete(id); },
    matchMedia: () => ({ get matches() { return mediaReduced; }, addEventListener(_event: string, callback: () => void) { mediaListeners.add(callback); }, removeEventListener(_event: string, callback: () => void) { mediaListeners.delete(callback); } }),
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react") return {
        useState(initial: unknown) { const index = cursor++; if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial; return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; },
        useRef(initial: unknown) { const index = cursor++; if (!(index in states)) states[index] = { current: initial }; return states[index]; },
        useCallback(callback: Callback, dependencies: readonly unknown[]) { const index = cursor++; const previous = states[index] as { callback: Callback; dependencies: readonly unknown[] } | undefined; if (!previous || !dependenciesEqual(previous.dependencies, dependencies)) states[index] = { callback, dependencies }; return (states[index] as { callback: Callback }).callback; },
        useEffect(callback: () => (() => void) | void, dependencies: readonly unknown[]) { const index = cursor++; const previous = states[index] as { dependencies: readonly unknown[]; cleanup?: () => void } | undefined; if (!previous || !dependenciesEqual(previous.dependencies, dependencies)) {
          const next = { dependencies, cleanup: undefined as (() => void) | void }; states[index] = next;
          effects.push(() => { previous?.cleanup?.(); next.cleanup = callback(); });
        } },
      };
      if (name === "next/link") return { default: "Link" };
      if (name === "next/image") return { default: "Image" };
      if (name.startsWith("@phosphor-icons/")) return { Heart: "Heart", Pause: "Pause", Play: "Play" };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale, currency: "tl" }) };
      if (name === "@/components/ui/kit") return { Ico: icons, Peso: "Peso" };
      if (name === "@/lib/local-preview") return { isLocalPreview: preview, PREVIEW_WALLET, PREVIEW_TIME, PREVIEW_CAMPAIGNS, normalizePreviewCampaigns: (rows: Campaign[]) => rows };
      if (name === "@/lib/circles/seed") return seed;
      if (name === "@/lib/circles/types") return circleTypes;
      if (name === "@/lib/home-circles") return homeCircles;
      if (name === "@/lib/i18n/revamp-home") return { homeCopy };
      if (name === "@/lib/i18n/revamp-home-catalog") return catalogCopy;
      if (name === "@/lib/i18n/revamp-circles") return circlesCopy;
      if (name === "@/lib/disaster") return { formatStroops: (value: string) => `exact-source-units:${value}` };
      if (name === "@/app/actions") return { async walletState() { calls.wallet++; assert.equal(preview, false); return { pesos: 123.45, address: "Readonly isolated Testnet wallet" }; }, async myHandle() { calls.handle++; assert.equal(preview, false); return "isolated"; } };
      if (name === "@/app/campaign-actions") return { async campaignState(_ids: string, before: string) { calls.campaigns.push(before); assert.equal(preview, false); if (campaignFailure) return { ok: false, error: "Isolated readonly failure" }; const offset = before === "0" ? 0 : liveCampaigns.findIndex(campaign => campaign.id === before) + 1; return { ok: true, now: String(PREVIEW_TIME), campaigns: liveCampaigns.slice(offset, offset + 10) }; } };
      if (name.endsWith(".module.css")) return { default: new Proxy({}, { get: (_target, key) => String(key) }) };
      throw Error(`Unexpected actual Home dependency: ${name}`);
    },
  });
  function render() {
    cursor = 0; tree = component.default();
    const strip = nodes(tree).find(node => hasClass(node, "strip"));
    if (strip) {
      const ref = strip.props.ref as { current: { key?: string; scrollLeft: number; children: { offsetLeft: number; offsetWidth: number }[]; scrollTo(args: { left: number; behavior: string }): void } | null };
      if (!ref.current || ref.current.key !== strip.key) ref.current = { key: strip.key, scrollLeft: 0, children: [], scrollTo(args) { this.scrollLeft = args.left; scrolls.push(args); } };
      ref.current.children = nodes(strip.props.children).filter(node => node.type === "article").map((_node, index) => ({ offsetLeft: 16 + index * 264, offsetWidth: 250 }));
    }
    return tree;
  }
  render();
  async function flush() {
    for (let loop = 0; loop < 5; loop++) {
      for (const effect of effects.splice(0)) effect();
      for (const [id, callback] of timeouts) { timeouts.delete(id); callback(); }
      await new Promise(resolve => setImmediate(resolve)); render();
      if (!effects.length && !timeouts.size) break;
    }
    return tree!;
  }
  function select(category: string) { const field = nodes(tree).find(node => node.props.id === "home-cause-category"); assert.ok(field); (field.props.onChange as (event: unknown) => void)({ target: { value: category } }); render(); }
  function click(ariaLabel: string) { const button = nodes(tree).find(node => node.type === "button" && node.props["aria-label"] === ariaLabel); assert.ok(button, `Missing Home control ${ariaLabel}`); assert.notEqual(button.props.disabled, true); (button.props.onClick as () => void)(); render(); }
  return { calls, render, flush, select, click, scrolls, intervals, document, set campaignFailure(value: boolean) { campaignFailure = value; }, get tree() { return tree!; }, get cards() { return nodes(tree).filter(node => node.type === "article"); }, changeReducedMotion(value: boolean) { mediaReduced = value; for (const listener of mediaListeners) listener(); render(); } };
}

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

for (const locale of LOCALES) test(`${locale}: actual Home preview renders all fixture covers/details/organizers with localized truth labels and no wallet actions`, async () => {
  const ui = mount({ locale }); await ui.flush();
  assert.equal(ui.cards.length, 27);
  const c = circlesCopy.circlesCopy(locale);
  assert.ok(text(ui.tree).includes(catalogCopy.homeCatalogCopy(locale, "Fictional causes · AI illustrations · no payment.")));
  for (const [index, card] of ui.cards.entries()) {
    const circle = seed.SEED_CIRCLES[index];
    const image = nodes(card).find(node => node.type === "Image")!;
    assert.equal(image.props.src, circle.coverImage);
    assert.ok(existsSync(new URL(`../public${circle.coverImage}`, import.meta.url)));
    assert.equal(image.props.alt, c("AI-generated fictional campaign illustration"));
    assert.ok(nodes(card).some(node => node.props.href === `/circles/${circle.id}`));
    assert.ok(nodes(card).some(node => node.props.href === `/circles/${circle.id}/organizer` && node.props["aria-label"] === c("View example organizer profile: {name}", { name: circle.organizer })));
    assert.ok(nodes(card).some(node => node.props.href === `/circles/${circle.id}/donate` && text(node).trim() === catalogCopy.homeCatalogCopy(locale, "Donate · local demo")));
    assert.ok(text(card).includes(circle.title)); assert.ok(text(card).includes(circle.organizer));
    assert.ok(text(card).includes(c("Example cause")));
    assert.ok(nodes(card).some(node => node.props["aria-label"] === catalogCopy.homeCatalogCopy(locale, "{percent}% example progress. No donations collected.", { percent: circleTypes.progressPct(circle) })));
    assert.doesNotMatch(text(card), /XLM|PHP|₱|exact-source-units/);
  }
  assert.ok(nodes(ui.tree).some(node => node.props.href === "/campaigns?mode=testnet"));
  assert.ok(nodes(ui.tree).some(node => node.props.href === "/circles/create"));
  assert.ok(nodes(ui.tree).some(node => node.props.href === "/campaigns" && node.props["aria-label"] === catalogCopy.homeCatalogCopy(locale, "Browse all example causes")));
  const options = nodes(ui.tree).filter(node => node.type === "option"); assert.equal(options.length, 10);
  for (const option of options.slice(1)) assert.equal(text(option), circlesCopy.circlesCategory(locale, option.props.value as CircleCategory));
  assert.equal(ui.calls.wallet, 0); assert.equal(ui.calls.handle, 0); assert.deepEqual(ui.calls.campaigns, []); assert.equal(ui.calls.network, 0); assert.equal(ui.calls.writes, 0);
});

test("actual category changes reset the carousel, pause auto-play and expose three causes in every sector", async () => {
  const ui = mount({ reducedMotion: false }); await ui.flush();
  ui.click(homeCopy("en", "Next campaign")); assert.equal(ui.scrolls.at(-1)?.left, 264);
  for (const category of homeCircles.HOME_CAUSE_CATEGORIES.slice(1)) {
    ui.select(category); await ui.flush(); assert.equal(ui.cards.length, 3); assert.equal(ui.intervals.size, 0);
    assert.ok(text(ui.tree).includes("01 / 03"));
    assert.ok(ui.cards.every(card => text(card).includes(circlesCopy.circlesCategory("en", category as CircleCategory))));
    ui.click(homeCopy("en", "Next campaign")); assert.equal(ui.scrolls.at(-1)?.left, 264);
    ui.click(homeCopy("en", "Previous campaign")); assert.equal(ui.scrolls.at(-1)?.left, 0);
  }
  ui.select("all"); await ui.flush(); assert.equal(ui.cards.length, 27); assert.ok(text(ui.tree).includes("01 / 27"));
  ui.select("not-a-category"); await ui.flush(); assert.equal(ui.cards.length, 27);
});

test("actual carousel preserves reduced-motion, explicit pause/play, wraparound, hidden-page and interaction guards", async () => {
  const reduced = mount({ reducedMotion: true }); await reduced.flush(); assert.equal(reduced.intervals.size, 0);
  assert.equal(nodes(reduced.tree).find(node => node.props["aria-label"] === homeCopy("en", "Pause campaign carousel"))?.props.disabled, true);
  reduced.click(homeCopy("en", "Previous campaign")); assert.equal(reduced.scrolls.at(-1)?.left, 26 * 264); assert.equal(reduced.scrolls.at(-1)?.behavior, "instant");
  const ui = mount({ reducedMotion: false }); await ui.flush(); assert.equal(ui.intervals.size, 1);
  for (const interval of [...ui.intervals.values()]) interval(); await ui.flush(); assert.equal(ui.scrolls.at(-1)?.behavior, "smooth"); assert.ok(text(ui.tree).includes("02 / 27"));
  const count = ui.scrolls.length; ui.document.hidden = true; for (const interval of [...ui.intervals.values()]) interval(); await ui.flush(); assert.equal(ui.scrolls.length, count);
  ui.document.hidden = false; ui.click(homeCopy("en", "Pause campaign carousel")); await ui.flush(); assert.equal(ui.intervals.size, 0);
  ui.click(homeCopy("en", "Play campaign carousel")); await ui.flush(); assert.equal(ui.intervals.size, 1);
  const strip = nodes(ui.tree).find(node => hasClass(node, "strip"))!; (strip.props.onPointerDown as () => void)(); await ui.flush(); assert.equal(ui.intervals.size, 0);
  ui.click(homeCopy("en", "Play campaign carousel")); await ui.flush(); ui.changeReducedMotion(true); await ui.flush(); assert.equal(ui.intervals.size, 0);
});

test("unavailable preview storage does not substitute D4 data or trigger real readers", async () => {
  const ui = mount({ deniedStorage: true }); await ui.flush(); assert.equal(ui.cards.length, 27); assert.equal(ui.calls.storageReads, 1); assert.equal(ui.calls.wallet, 0); assert.deepEqual(ui.calls.campaigns, []); assert.equal(ui.calls.writes, 0);
});

test("flag0 Home retains paginated D4 reads, contract IDs/exact source totals and original creation/navigation", async () => {
  const ui = mount({ preview: false }); await ui.flush();
  assert.equal(ui.calls.wallet, 1); assert.equal(ui.calls.handle, 1); assert.deepEqual(ui.calls.campaigns, ["0", "809"]); assert.equal(ui.cards.length, 12);
  for (const [index, card] of ui.cards.entries()) {
    assert.ok(text(card).includes(`Isolated Testnet campaign ${index + 1}`));
    assert.ok(text(card).includes(`exact-source-units:${PREVIEW_CAMPAIGNS[0].total} XLM`));
    assert.ok(nodes(card).some(node => node.props.href === `/campaigns?id=${800 + index}`));
    assert.equal(nodes(card).filter(node => String(node.props.href ?? "").startsWith("/circles/")).length, 0);
    assert.equal(nodes(card).some(node => String(node.props.src ?? "").startsWith("/circles/generated/")), false);
  }
  assert.equal(nodes(ui.tree).some(node => node.props.id === "home-cause-category"), false);
  assert.ok(nodes(ui.tree).some(node => node.props.href === "/campaigns?create=1"));
  assert.ok(nodes(ui.tree).some(node => node.props.href === "/circles"));
  assert.equal(ui.calls.storageReads, 0); assert.equal(ui.calls.network, 0); assert.equal(ui.calls.writes, 0);
});

test("flag0 campaign failure stays honest and retryable without falling back to fictional Circles", async () => {
  const ui = mount({ preview: false, failCampaigns: true }); await ui.flush(); assert.equal(ui.cards.length, 0);
  assert.ok(text(ui.tree).includes(homeCopy("en", "Campaigns could not be loaded. Please try again.")));
  const retry = nodes(ui.tree).find(node => node.type === "button" && text(node) === "Try again")!;
  ui.campaignFailure = false; (retry.props.onClick as () => void)(); await ui.flush(); assert.equal(ui.cards.length, 12);
  assert.equal(ui.calls.network, 0); assert.equal(ui.calls.writes, 0);
});

test("Home catalog responsive styles retain compact controls and persistent truth framing", () => {
  const css = source("../app/home.module.css");
  assert.match(css, /\.catalogTools select[^}]*min-height:\s*44px/);
  assert.match(css, /\.catalogOrganizer[^}]*min-height:\s*44px/);
  assert.match(css, /\.catalogTitle[^}]*min-height:\s*44px/);
  assert.match(css, /\.catalogTools select:focus-visible/);
  assert.doesNotMatch(css, /\.catalogNotice\s*\{[^}]*display:\s*none/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
