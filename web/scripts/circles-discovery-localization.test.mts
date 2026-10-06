import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as copy from "../lib/i18n/revamp-circles.ts";
import * as discoveryCopy from "../lib/i18n/revamp-campaign-discovery.ts";
import * as homeCircles from "../lib/home-circles.ts";
import * as currency from "../lib/ui/currency.ts";
import { DICTS } from "../lib/i18n/dictionaries.ts";
import { isLocale, LOCALES, type Locale } from "../lib/i18n/config.ts";
import { previewPledgeAllocation } from "../lib/circles/pledge-allocation.ts";
import type { Circle, CircleCategory } from "../lib/circles/types.ts";

type Element = { type: string; key?: string; props: Record<string, unknown> };
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
function source(path: string) { return readFileSync(new URL(path, import.meta.url), "utf8"); }
function transpile(path: string) {
  return ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
const modules = new Map<string, Record<string, unknown>>();
function fixture(path: string): Record<string, unknown> {
  if (modules.has(path)) return modules.get(path)!;
  const exports: Record<string, unknown> = {};
  modules.set(path, exports);
  runInNewContext(transpile(path), { exports, require(name: string) {
    if (name === "./types") return fixture("../lib/circles/types.ts");
    if (name === "./organizers") return fixture("../lib/circles/organizers.ts");
    if (name === "@/lib/ui/currency") return currency;
    throw Error(`Unexpected pure fixture dependency: ${name}`);
  } });
  return exports;
}
const seed = fixture("../lib/circles/seed.ts") as { SEED_CIRCLES: Circle[]; getCircle(id: string): Circle };
const types = fixture("../lib/circles/types.ts") as { CATEGORY_LABEL: Record<CircleCategory, string>; progressPct(circle: Circle): number };
const profiles = fixture("../lib/circles/organizers.ts");
const allowance = fixture("../lib/circles/allowance.ts");
function categoryPicker(jsx: (type: unknown, props: Record<string, unknown>, key?: string) => Element) {
  const load = (path: string): Record<string, unknown> => {
    const exports: Record<string, unknown> = {};
    runInNewContext(transpile(path), { exports, require(module: string) {
      if (module === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (module === "@/lib/i18n/revamp-circles") return copy;
      if (module === "@/components/ui/CauseCategoryDoodle") return load("../components/ui/CauseCategoryDoodle.tsx");
      if (module.endsWith(".module.css")) return { default: {} };
      throw Error(`Unexpected category component dependency: ${module}`);
    } });
    return exports;
  };
  return load("../components/CauseCategoryPicker.tsx");
}
const screenNames = ["CirclesDiscoverScreen", "CircleDetailScreen", "CirclesDonateScreen", "CircleManageScreen", "CirclesCreateScreen"] as const;
type ScreenName = typeof screenNames[number];
const scripts = new Map(screenNames.map(name => [name, transpile(`../components/screens/${name}.tsx`)]));

// This harness executes actual TSX handlers with deterministic isolated hooks.
// No browser, provider, database, credential, navigation or live action exists.
function setup(name: ScreenName, locale: Locale = "en", preview = true) {
  const states: unknown[] = [];
  let cursor = 0;
  const pending: Promise<unknown>[] = [];
  const memory = new Map<string, string>();
  const navigationViews = new Map<string, string>();
  const calls = { storage: 0, network: 0, action: 0 };
  const forbidden = (kind: "network" | "action") => () => { calls[kind]++; throw Error(`Forbidden ${kind} in isolated locale test`); };
  const exports = {} as { default(props: unknown): Element; selectCircleExamples(circles: readonly Circle[], category: CircleCategory | "all", sort: string): Circle[] };
  const jsx = (type: unknown, props: Record<string, unknown>, key?: string): Element => typeof type === "function" ? type(props) : { type: String(type), props, key };
  const icons = new Proxy({}, { get: () => () => null });
  runInNewContext(scripts.get(name)!, {
    exports, fetch: forbidden("network"),
    localStorage: { getItem: (key: string) => memory.get(key) ?? null, setItem(key: string, value: string) { calls.storage++; memory.set(key, value); }, removeItem(key: string) { calls.storage++; memory.delete(key); } },
    window: { requestAnimationFrame(action: () => void) { action(); } },
    document: { getElementById: () => ({ scrollIntoView() {}, focus() {} }) },
    require(module: string) {
      if (module === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (module === "react") return {
        useState(initial: unknown) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], (value: unknown) => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
        useRef(initial: unknown) { const i = cursor++; if (!(i in states)) states[i] = { current: initial }; return states[i]; },
        useEffect() {},
        useTransition: () => [false, (action: () => Promise<unknown>) => pending.push(action())],
      };
      if (module === "next/link") return { default: "Link" };
      if (module === "next/image") return { default: "Image" };
      if (module === "next/navigation") return { useRouter: () => ({ push: forbidden("network") }) };
      if (module === "@/components/I18nProvider") return { useT: () => ({ locale, currency: "en", t(key: string) {
        let value: unknown = DICTS[locale];
        for (const part of key.split(".")) value = (value as Record<string, unknown>)[part];
        assert.equal(typeof value, "string", `Missing original dictionary key ${locale}:${key}`);
        return value;
      } }) };
      if (module === "@/lib/i18n/revamp-circles") return copy;
      if (module === "@/lib/i18n/revamp-campaign-discovery") return discoveryCopy;
      if (module === "@/lib/home-circles") return homeCircles;
      if (module === "@/lib/ui/useNavigationViewState") return { useNavigationViewState: (key: string) => navigationViews.get(key) ?? "" };
      if (module === "@/lib/ui/app-navigation") return { writeNavigationViewState(key: string, value: Record<string, unknown>) {
        assert.equal(key, "circles-discovery");
        assert.deepEqual(Object.keys(value).sort(), ["category", "sort"]);
        navigationViews.set(key, JSON.stringify(value));
      } };
      if (module === "@/lib/i18n/config") return { isLocale };
      if (module === "@/lib/ui/currency") return currency;
      if (module === "@/lib/circles/seed") return seed;
      if (module === "@/lib/circles/types") return types;
      if (module === "@/lib/circles/organizers") return profiles;
      if (module === "@/lib/circles/allowance") return allowance;
      if (module === "@/lib/circles/pledge-allocation") return { previewPledgeAllocation };
      if (module === "@/lib/circles/local-support") return { readLocalSupports: () => [], markCircleUpdatesSeen: forbidden("action"), recordLocalSupport: forbidden("action"), unreadSupportUpdates: () => 0 };
      if (module === "@/lib/local-preview") return { isLocalPreview: preview };
      if (module === "@/lib/ui/useGoBack") return { useGoBack: () => forbidden("network") };
      if (module === "@/components/ui/kit") return { Ico: icons, T: {}, Btn: "Btn", PoweredByStellar: "PoweredByStellar", Progress: "Progress" };
      if (module === "@/components/ui/OrganizerVerification") return { default: "OrganizerVerification" };
      if (module === "@/components/ui/SuccessMotion") return { default: "SuccessMotion" };
      if (module === "@/components/CauseCategoryPicker") return categoryPicker(jsx);
      if (module === "@/app/actions") return { joinCirclesWaitlist: forbidden("action") };
      if (module.endsWith(".module.css")) return { default: {} };
      throw Error(`Unexpected actual screen dependency: ${module}`);
    },
  });
  const render = () => { cursor = 0; return exports.default({ circle: seed.getCircle("tino-relief") }); };
  let tree = render();
  function input(id: string, value: string) {
    const node = nodes(tree).find(node => node.props.id === id); assert.ok(node, `Missing input ${id}`);
    (node.props.onChange as (event: unknown) => void)({ target: { value } }); tree = render();
  }
  function click(label: string) {
    const node = nodes(tree).find(node => ["button", "Btn"].includes(node.type) && (node.props["aria-label"] === label || text(node).trim() === label)); assert.ok(node, `Missing button ${label}`);
    (node.props.onClick as () => void)(); tree = render();
  }
  function check(label: string) {
    const field = nodes(tree).find(node => node.type === "label" && text(node).includes(label)); assert.ok(field, `Missing consent ${label}`);
    const checkbox = nodes(field).find(node => node.type === "input" && node.props.type === "checkbox")!;
    assert.equal(checkbox.props.checked, false, "Consent must start false");
    (checkbox.props.onChange as (event: unknown) => void)({ target: { checked: true } }); tree = render();
  }
  async function submit() {
    const form = nodes(tree).find(node => node.type === "form"); assert.ok(form);
    (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} });
    while (pending.length) await Promise.all(pending.splice(0)); tree = render();
  }
  return { exports, calls, input, click, check, submit, refresh() { tree = render(); }, get tree() { return tree; } };
}

test("all category and original sort combinations render membership and baseline comparators without seed mutation", () => {
  const original = JSON.stringify(seed.SEED_CIRCLES);
  const screen = setup("CirclesDiscoverScreen");
  const categories = ["all", ...Object.keys(types.CATEGORY_LABEL)] as (CircleCategory | "all")[];
  for (const category of categories) {
    screen.click(category === "all" ? "All examples" : copy.circlesCategory("en", category));
    for (const sort of ["all", "trending", "closeToGoal", "justLaunched"]) {
      screen.input("circles-sort", sort);
      const expected = seed.SEED_CIRCLES.filter(circle => category === "all" || circle.category === category);
      if (sort === "trending") expected.sort((a, b) => b.donorCount - a.donorCount);
      if (sort === "closeToGoal") expected.sort((a, b) => types.progressPct(b) - types.progressPct(a));
      if (sort === "justLaunched") expected.sort((a, b) => b.daysRemaining - a.daysRemaining);
      const actual = nodes(screen.tree).filter(node => node.type === "article").map(article => text(nodes(article).find(node => node.type === "h2")));
      assert.deepEqual(actual, Array.from(expected, circle => circle.title), `${category}:${sort}`);
      assert.equal(JSON.stringify(seed.SEED_CIRCLES), original);
      assert.equal(nodes(screen.tree).find(node => node.props.id === "circles-sort")?.props.value, sort);
    }
  }
  assert.deepEqual(screen.calls, { storage: 0, network: 0, action: 0 });
});

test("sorting ties preserve seed order and a filtered result never aliases the source array", () => {
  const screen = setup("CirclesDiscoverScreen");
  const circles = seed.SEED_CIRCLES.slice(0, 3).map(circle => ({ ...circle, donorCount: 5, daysRemaining: 10, pesoRaised: 50, pesoTarget: 100 }));
  for (const sort of ["all", "trending", "closeToGoal", "justLaunched"]) {
    const result = screen.exports.selectCircleExamples(circles, "all", sort);
    assert.notEqual(result, circles); assert.deepEqual(Array.from(result, circle => circle.id), Array.from(circles, circle => circle.id));
  }
});

test("feature copy has three complete locale translations and identical interpolation tokens for every English key", () => {
  assert.ok(Object.keys(copy.CIRCLES_COPY).length > 250);
  for (const [key, translations] of Object.entries(copy.CIRCLES_COPY)) {
    assert.equal(translations.length, 3);
    const tokens = [...key.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    for (const translation of translations) {
      assert.ok(translation.trim().length > 0, key);
      assert.deepEqual([...translation.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort(), tokens, key);
    }
    assert.equal(copy.circlesCopy("en")(key as copy.CirclesCopyKey), key);
  }
});

test("the five owned screens contain no untranslated literal JSX UI text", () => {
  for (const name of screenNames) {
    const sf = ts.createSourceFile(name, source(`../components/screens/${name}.tsx`), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const untranslated: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isJsxText(node) && /[A-Za-z]/.test(node.text)) untranslated.push(node.text.trim());
      ts.forEachChild(node, visit);
    }
    visit(sf); assert.deepEqual(untranslated, [], name);
  }
});

test("four locales render translated catalog, detail, donor, manager and creator core controls in both flag modes", () => {
  for (const locale of LOCALES) for (const preview of [true, false]) {
    const c = copy.circlesCopy(locale);
    const discovery = setup("CirclesDiscoverScreen", locale, preview);
    assert.ok(text(discovery.tree).includes(c("A cause can bring us closer.")));
    assert.ok(text(discovery.tree).includes(c("Sort causes")));
    assert.equal(nodes(discovery.tree).filter(node => node.type === "option").length, 4);
    assert.equal(nodes(discovery.tree).filter(node => node.type === "button" && typeof node.props["data-category"] === "string").length, 10);
    assert.ok(nodes(discovery.tree).some(node => node.type === "button" && node.props.type === "button" && text(node).trim() === c("Back")));
    const detail = setup("CircleDetailScreen", locale, preview);
    const tabs = nodes(detail.tree).filter(node => node.props.role === "tab");
    assert.deepEqual(tabs.map(text), [c("Story"), c("Updates") + "3", c("Public proof")]);
    assert.ok(text(detail.tree).includes(c("Preview a pledge")));
    assert.ok(text(detail.tree).includes(seed.getCircle("tino-relief").story.split("\n\n")[0]), "Authored fictional fixture text is retained");
    const donate = setup("CirclesDonateScreen", locale, preview);
    assert.ok(text(donate.tree).includes(c("Where your pledge would go")));
    assert.ok(text(donate.tree).includes(c(preview ? "Review local donation" : "Continue to optional signup")));
    const manager = setup("CircleManageScreen", locale, preview);
    manager.click(c("Explore proof upload"));
    assert.ok(text(manager.tree).includes(c("Proof upload is a prototype placeholder. No file was uploaded and no approval was recorded.")));
    const creator = setup("CirclesCreateScreen", locale, preview);
    creator.click(c("Continue"));
    assert.ok(text(creator.tree).includes(c("Give the cause a title with at least 6 characters.")));
    for (const screen of [discovery, detail, donate, manager, creator]) assert.deepEqual(screen.calls, { storage: 0, network: 0, action: 0 });
  }
});

test("translated detail tabs retain keyboard navigation and accessible selected panel", () => {
  for (const locale of LOCALES) {
    const screen = setup("CircleDetailScreen", locale);
    const first = nodes(screen.tree).find(node => node.props.id === "circle-tab-story")!;
    let prevented = false;
    (first.props.onKeyDown as (event: unknown) => void)({ key: "ArrowRight", preventDefault() { prevented = true; } });
    screen.refresh();
    assert.equal(prevented, true);
    const selected = nodes(screen.tree).find(node => node.props.id === "circle-tab-updates")!;
    assert.equal(selected.props["aria-selected"], true); assert.equal(selected.props.tabIndex, 0);
    assert.ok(nodes(screen.tree).some(node => node.props.id === "circle-panel-updates" && node.props.role === "tabpanel"));
  }
});

test("four-locale donor review and optional signup retain exact amounts, validation and local no-write behavior", async () => {
  for (const locale of LOCALES) {
    const c = copy.circlesCopy(locale), screen = setup("CirclesDonateScreen", locale);
    screen.input("circle-preview-amount", "10.123");
    assert.ok(text(screen.tree).includes(c("{code} supports {dp} decimal places. Enter an amount without extra decimals; this preview does not round your input.", { code: "USD", dp: 2 })));
    screen.input("circle-preview-amount", "10.00"); screen.click(c("Review local donation"));
    assert.ok(text(screen.tree).includes(c("Check your cause and amount.")));
    assert.ok(text(screen.tree).includes(currency.formatLocalAmount(10, "en"))); screen.click(c("Change amount"));
    screen.click(c("Optional launch signup")); screen.input("circle-launch-email", "qa@example.invalid"); await screen.submit();
    assert.ok(text(screen.tree).includes(c("Example signup complete. Nothing was sent.")));
    assert.deepEqual(screen.calls, { storage: 0, network: 0, action: 0 });
  }
});

test("four-locale creator wizard prepares the complete draft with explicit save and separate local signup", async () => {
  for (const locale of LOCALES) {
    const c = copy.circlesCopy(locale), screen = setup("CirclesCreateScreen", locale);
    screen.input("circle-draft-title", "A fictional library");
    screen.input("circle-draft-story", "A fictional community library with books and shelves for an isolated test.");
    screen.click(c("Continue")); assert.ok(text(screen.tree).includes(c("Give the idea a goal.")));
    screen.input("circle-draft-goal", "10.00"); screen.click(c("Continue"));
    assert.ok(text(screen.tree).includes(c("Make the concept yours."))); screen.click(c("Continue"));
    assert.ok(text(screen.tree).includes(c("Review your browser draft")));
    screen.check(c("Save this concept on this device only. It is not a live campaign and will replace the last Circles browser draft."));
    screen.click(c("Save complete browser draft"));
    assert.ok(text(screen.tree).includes(c("Complete draft saved in this browser.")));
    assert.equal(screen.calls.storage, 1); assert.equal(screen.calls.action, 0);
    screen.input("circle-organizer-launch-email", "qa@example.invalid");
    screen.check(c("Try the signup example locally. Do not send or save my email.")); await screen.submit();
    assert.ok(text(screen.tree).includes(c("Local organizer signup example complete. No email was submitted or saved.")));
    assert.equal(screen.calls.action, 0); assert.equal(screen.calls.network, 0); assert.equal(screen.calls.storage, 1);
  }
});
