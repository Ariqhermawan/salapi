import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { parse, type AnyNode, type Declaration, type Rule } from "postcss";
import * as copy from "../lib/i18n/revamp-circles.ts";
import * as discoveryCopy from "../lib/i18n/revamp-campaign-discovery.ts";
import { DICTS } from "../lib/i18n/dictionaries.ts";
import { LOCALES, type Locale } from "../lib/i18n/config.ts";
import type { Circle, CircleCategory } from "../lib/circles/types.ts";

type Category = CircleCategory | "all";
type Element = { type: unknown; props: Record<string, unknown>; key?: string };
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const compile = (path: string) => ts.transpileModule(source(path), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const jsx = (type: unknown, props: Record<string, unknown>, key?: string): Element => typeof type === "function" ? type(props) : { type, props, key };
const jsxRuntime = { jsx, jsxs: jsx, Fragment: "Fragment" };
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element; return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : "";
}
const styleModule = { default: new Proxy({}, { get: (_target, key) => String(key) }) };
const effects = { network: 0, storage: 0, action: 0 };
function forbidden(kind: keyof typeof effects) { return () => { effects[kind]++; throw Error(`Forbidden ${kind} in category-only test`); }; }
function moduleFrom<T>(code: string, dependencies: Record<string, unknown>): T {
  const exports = {};
  runInNewContext(code, {
    exports, fetch: forbidden("network"), XMLHttpRequest: forbidden("network"),
    localStorage: { getItem: forbidden("storage"), setItem: forbidden("storage") },
    sessionStorage: { getItem: forbidden("storage"), setItem: forbidden("storage") },
    require(name: string) {
      if (!(name in dependencies)) throw Error(`Unexpected category module dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports as T;
}
const fixtures = new Map<string, Record<string, unknown>>();
function fixture(path: string): Record<string, unknown> {
  if (fixtures.has(path)) return fixtures.get(path)!;
  const exports: Record<string, unknown> = {};
  fixtures.set(path, exports);
  runInNewContext(compile(path), { exports, require(name: string) {
    if (name === "./types") return fixture("../lib/circles/types.ts");
    if (name === "./organizers") return fixture("../lib/circles/organizers.ts");
    throw Error(`Unexpected fixture dependency: ${name}`);
  } });
  return exports;
}
const { SEED_CIRCLES } = fixture("../lib/circles/seed.ts") as { SEED_CIRCLES: Circle[] };
const circleTypes = fixture("../lib/circles/types.ts") as { CATEGORY_LABEL: Record<CircleCategory, string>; progressPct(circle: Circle): number };
const doodle = moduleFrom<{ default(props: { category: Category }): Element }>(compile("../components/ui/CauseCategoryDoodle.tsx"), { "react/jsx-runtime": jsxRuntime });
const picker = moduleFrom<{ default(props: { circles: readonly Circle[]; selected: Category; locale: Locale; onSelect(category: Category): void }): Element; CAUSE_CATEGORIES: readonly Category[] }>(compile("../components/CauseCategoryPicker.tsx"), {
  "react/jsx-runtime": jsxRuntime, "@/lib/i18n/revamp-circles": copy,
  "@/components/ui/CauseCategoryDoodle": doodle, "./CauseCategoryPicker.module.css": styleModule,
});
const categories = Array.from(picker.CAUSE_CATEGORIES);
const label = (locale: Locale, category: Category) => category === "all" ? copy.circlesCopy(locale)("All examples") : copy.circlesCategory(locale, category);
function tiles(tree: Element) { return nodes(tree).filter(node => node.type === "button" && "data-category" in node.props); }
function tile(tree: Element, category: Category) {
  const node = tiles(tree).find(node => node.props["data-category"] === category); assert.ok(node, `Missing ${category} category`); return node;
}
function select(node: Element) { assert.equal(typeof node.props.onClick, "function"); (node.props.onClick as () => void)(); }
function countText(node: Element) { return text(nodes(node).find(child => child.type === "span" && child.props.className === "count")); }
function geometry(svg: Element) {
  return JSON.stringify(nodes(svg).filter(node => ["path", "circle", "ellipse", "rect", "line", "polyline", "polygon"].includes(String(node.type))).map(node => ({ type: node.type, props: node.props })));
}

test("picker exports all plus the nine canonical categories exactly once in the retained order", () => {
  assert.deepEqual(categories, ["all", "animals", "care", "volunteer", "disaster", "medical", "education", "community", "family", "creator"]);
  assert.equal(new Set(categories).size, 10);
  assert.deepEqual(categories.filter(category => category !== "all").sort(), Object.keys(circleTypes.CATEGORY_LABEL).sort());
});

test("all ten real SVG scenes are distinct, deterministic, decorative and have no external image or ID dependency", () => {
  const signatures: string[] = [];
  for (const category of categories) {
    const svg = doodle.default({ category }); assert.equal(svg.type, "svg");
    assert.equal(svg.props["data-cause-doodle"], category);
    assert.equal(String(svg.props["aria-hidden"]), "true"); assert.equal(String(svg.props.focusable), "false");
    assert.equal(svg.props.viewBox, "0 0 120 100");
    assert.equal(geometry(svg), geometry(doodle.default({ category }))); signatures.push(geometry(svg));
    assert.ok(nodes(svg).length > 3);
    for (const node of nodes(svg)) {
      assert.equal(node.props.id, undefined); assert.equal(node.props.href, undefined); assert.equal(node.props.xlinkHref, undefined);
      assert.equal(node.props.role, undefined); assert.equal(node.props.onClick, undefined);
      assert.equal(["image", "foreignObject", "animate", "title"].includes(String(node.type)), false);
    }
  }
  assert.equal(new Set(signatures).size, 10, "Distinct category markers alone cannot substitute for distinct scene geometry");
  assert.deepEqual(effects, { network: 0, storage: 0, action: 0 });
});

test("real picker retains native keyboard buttons, localized accessible names and one pressed category in four locales", () => {
  const before = JSON.stringify(SEED_CIRCLES);
  for (const locale of LOCALES) for (const selected of categories) {
    const tree = picker.default({ circles: SEED_CIRCLES, selected, locale, onSelect: forbidden("action") });
    assert.equal(tree.props.role, "group"); assert.equal(tree.props["aria-label"], copy.circlesCopy(locale)("Example cause categories"));
    assert.equal(tiles(tree).length, 10); assert.equal(tiles(tree).filter(node => node.props["aria-pressed"] === true).length, 1);
    for (const category of categories) {
      const node = tile(tree, category);
      assert.equal(node.props.type, "button"); assert.equal(node.props["aria-label"], label(locale, category));
      assert.equal(node.props["aria-pressed"], selected === category);
      assert.equal(node.props.role, undefined); assert.equal(node.props.tabIndex, undefined); assert.equal(node.props.disabled, undefined);
      assert.equal(node.props.onKeyDown, undefined, "Native Enter/Space behavior must not be intercepted");
      assert.ok(text(node).includes(label(locale, category)));
      const scene = nodes(node).find(child => child.props["data-cause-doodle"] === category)!; assert.ok(scene);
      const parent = nodes(node).find(child => child.type === "span" && child.props.className === "art")!; assert.ok(parent);
      assert.equal(String(parent.props["aria-hidden"]), "true");
      assert.equal(nodes(node).some(child => child.props.className === "selectedMark"), selected === category);
    }
  }
  assert.equal(JSON.stringify(SEED_CIRCLES), before); assert.deepEqual(effects, { network: 0, storage: 0, action: 0 });
});

test("real picker counts actual causes, not donors, money or selected result length, and handles zero/singular counts", () => {
  const changedMetrics = SEED_CIRCLES.map(circle => ({ ...circle, donorCount: 999999, pesoRaised: 0, pesoTarget: 0 }));
  for (const locale of LOCALES) {
    const c = copy.circlesCopy(locale);
    for (const selected of categories) {
      const tree = picker.default({ circles: changedMetrics, selected, locale, onSelect: forbidden("action") });
      assert.equal(countText(tile(tree, "all")), c("{count} examples", { count: 27 }));
      for (const category of categories.filter(category => category !== "all")) assert.equal(countText(tile(tree, category)), c("{count} examples", { count: 3 }));
    }
    for (const circles of [[], [SEED_CIRCLES[0]], SEED_CIRCLES.slice(0, 2)]) {
      const tree = picker.default({ circles, selected: "all", locale, onSelect: forbidden("action") });
      for (const category of categories) {
        const expected = category === "all" ? circles.length : circles.filter(circle => circle.category === category).length;
        assert.equal(countText(tile(tree, category)), c(expected === 1 ? "{count} example" : "{count} examples", { count: expected }));
      }
    }
  }
  assert.deepEqual(effects, { network: 0, storage: 0, action: 0 });
});

test("native picker callbacks select the exact canonical category once and change no input data", () => {
  const before = JSON.stringify(SEED_CIRCLES), selected: Category[] = [];
  const tree = picker.default({ circles: SEED_CIRCLES, selected: "all", locale: "en", onSelect: category => selected.push(category) });
  for (const category of categories) select(tile(tree, category));
  assert.deepEqual(selected, categories); assert.equal(JSON.stringify(SEED_CIRCLES), before);
  assert.deepEqual(effects, { network: 0, storage: 0, action: 0 });
});

const discoverCode = compile("../components/screens/CirclesDiscoverScreen.tsx");
function discovery(locale: Locale, preview: boolean, campaignEntry: boolean) {
  const values: unknown[] = []; let cursor = 0;
  const screenModule = moduleFrom<{ default(props: { campaignEntry: boolean }): Element }>(discoverCode, {
    "react/jsx-runtime": jsxRuntime,
    "react": { useState(initial: unknown) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (next: unknown) => { values[index] = typeof next === "function" ? next(values[index]) : next; }]; } },
    "next/link": { default: "Link" }, "next/image": { default: "Image" },
    "@/components/I18nProvider": { useT: () => ({ locale, t(key: string) { let value: unknown = DICTS[locale]; for (const part of key.split(".")) value = (value as Record<string, unknown>)[part]; assert.equal(typeof value, "string"); return value; } }) },
    "@/components/ui/kit": { Ico: new Proxy({}, { get: () => () => null }), T: {}, PoweredByStellar: "PoweredByStellar" },
    "@/components/ui/OrganizerVerification": { default: "OrganizerVerification" },
    "@/components/CauseCategoryPicker": picker,
    "@/lib/circles/seed": { SEED_CIRCLES }, "@/lib/circles/types": circleTypes,
    "@/lib/circles/organizers": fixture("../lib/circles/organizers.ts"),
    "@/lib/i18n/revamp-circles": copy, "@/lib/i18n/revamp-campaign-discovery": discoveryCopy,
    "@/lib/local-preview": { isLocalPreview: preview }, "./CirclesDiscoverRevamp.module.css": styleModule,
  });
  function render() { cursor = 0; return screenModule.default({ campaignEntry }); }
  let tree = render();
  return { get tree() { return tree; }, category(category: Category) { select(tile(tree, category)); tree = render(); }, sort(sort: string) {
    const selectNode = nodes(tree).find(node => node.type === "select" && node.props.id === "circles-sort")!; assert.ok(selectNode);
    (selectNode.props.onChange as (event: unknown) => void)({ target: { value: sort } }); tree = render();
  } };
}
function articleTitles(tree: Element) { return nodes(tree).filter(node => node.type === "article").map(node => text(nodes(node).find(child => child.type === "h2"))); }

test("integrated Discover preserves all category/sort combinations, full counts and four-locale filter state in both entries/modes", () => {
  const before = JSON.stringify(SEED_CIRCLES);
  for (const locale of LOCALES) for (const preview of [false, true]) for (const campaignEntry of [false, true]) {
    const screen = discovery(locale, preview, campaignEntry), c = copy.circlesCopy(locale);
    for (const category of categories) for (const sort of ["all", "trending", "closeToGoal", "justLaunched"]) {
      screen.category(category); screen.sort(sort);
      const expected = SEED_CIRCLES.filter(circle => category === "all" || circle.category === category);
      if (sort === "trending") expected.sort((a, b) => b.donorCount - a.donorCount);
      else if (sort === "closeToGoal") expected.sort((a, b) => circleTypes.progressPct(b) - circleTypes.progressPct(a));
      else if (sort === "justLaunched") expected.sort((a, b) => b.daysRemaining - a.daysRemaining);
      assert.deepEqual(articleTitles(screen.tree), Array.from(expected, circle => circle.title));
      assert.equal(tile(screen.tree, category).props["aria-pressed"], true);
      assert.equal(tiles(screen.tree).filter(node => node.props["aria-pressed"] === true).length, 1);
      assert.equal(countText(tile(screen.tree, "all")), c("{count} examples", { count: 27 }));
      const resultCount = nodes(screen.tree).find(node => node.props.role === "status");
      assert.equal(text(resultCount), c("{count} examples", { count: expected.length }));
      assert.equal(nodes(screen.tree).find(node => node.props.id === "circles-sort")?.props.value, sort);
    }
  }
  assert.equal(JSON.stringify(SEED_CIRCLES), before); assert.deepEqual(effects, { network: 0, storage: 0, action: 0 });
});

test("integrated picker preserves canonical Circles/profile paths, separate D4 bridge and preview-supported visibility", () => {
  for (const preview of [false, true]) for (const campaignEntry of [false, true]) {
    const screen = discovery("en", preview, campaignEntry);
    for (const category of categories) {
      screen.category(category); const all = nodes(screen.tree);
      assert.ok(all.some(node => node.type === "Link" && node.props.href === (campaignEntry ? "/" : "/vaults")));
      assert.equal(all.some(node => node.type === "Link" && node.props.href === "/campaigns?mode=testnet"), !campaignEntry);
      assert.equal(all.some(node => node.type === "Link" && node.props.href === "/circles/supported"), preview);
      assert.ok(all.some(node => node.type === "Link" && node.props.href === "/circles/create"));
      assert.equal(all.some(node => String(node.props.href ?? "").startsWith("/campaigns?id=")), false);
      for (const circle of SEED_CIRCLES.filter(value => category === "all" || value.category === category)) {
        assert.ok(all.some(node => node.props.href === `/circles/${circle.id}`));
        assert.ok(all.some(node => node.props.href === `/circles/${circle.id}/organizer`));
      }
    }
  }
  assert.deepEqual(effects, { network: 0, storage: 0, action: 0 });
});

const css = parse(source("../components/CauseCategoryPicker.module.css"));
function rules(selector: string) { const found: Rule[] = []; css.walkRules(rule => { if (rule.selectors.includes(selector)) found.push(rule); }); return found; }
function declaration(rule: Rule, property: string) { return rule.nodes.filter((node): node is Declaration => node.type === "decl" && node.prop === property).at(-1)?.value; }
function reducedMotion(rule: Rule) {
  let parent: AnyNode | undefined = rule.parent;
  while (parent) { if (parent.type === "atrule" && parent.name === "media" && /prefers-reduced-motion\s*:\s*reduce/.test(parent.params)) return true; parent = parent.parent; }
  return false;
}

test("picker CSS retains bounded grid, 44px native touch targets, visible labels, keyboard focus and reduced motion", () => {
  assert.ok(rules(".picker").some(rule => declaration(rule, "grid-template-columns")?.replace(/\s/g, "") === "repeat(3,minmax(0,1fr))"));
  css.walkRules(rule => {
    if (rule.selectors.some(selector => selector === ".tile" || selector === ".tile[data-category=all]")) {
      const height = declaration(rule, "min-height"); if (height) assert.ok(Number.parseFloat(height) >= 44, rule.selector);
      assert.notEqual(declaration(rule, "pointer-events"), "none");
    }
    if (rule.selectors.some(selector => selector === ".label" || selector.endsWith(" .label") || selector === ".count" || selector.endsWith(" .count"))) {
      assert.notEqual(declaration(rule, "display"), "none"); assert.notEqual(declaration(rule, "visibility"), "hidden"); assert.notEqual(declaration(rule, "opacity"), "0");
    }
  });
  assert.ok(rules(".art").some(rule => declaration(rule, "pointer-events") === "none"));
  assert.ok(rules(".tile:focus-visible").some(rule => Number.parseFloat(declaration(rule, "outline") ?? "0") > 0));
  for (const selector of [".tile", ".art"]) assert.ok(rules(selector).some(rule => reducedMotion(rule) && declaration(rule, "transition") === "none"));
  assert.ok(rules(".tile:hover .art").some(rule => reducedMotion(rule) && declaration(rule, "transform") === "none"));
});

function luminance(hex: string) {
  const value = hex.slice(1), full = value.length === 3 ? value.split("").map(character => character + character).join("") : value;
  assert.match(full, /^[\da-f]{6}$/i);
  const rgb = [0, 2, 4].map(index => Number.parseInt(full.slice(index, index + 2), 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
test("small selected category count text meets normal-text 4.5-to-1 color contrast", () => {
  const background = rules(".tile[aria-pressed=true]").map(rule => declaration(rule, "background")).find(Boolean)!;
  const foreground = rules(".tile[aria-pressed=true] .count").map(rule => declaration(rule, "color")).find(Boolean)!;
  assert.ok(background); assert.ok(foreground);
  const values = [luminance(background), luminance(foreground)].sort((a, b) => a - b);
  const ratio = (values[1] + .05) / (values[0] + .05);
  assert.ok(ratio >= 4.5, `Selected count contrast ${ratio.toFixed(3)}:1 is below 4.5:1`);
});
