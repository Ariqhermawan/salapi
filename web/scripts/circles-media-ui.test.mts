import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { Circle } from "../lib/circles/types.ts";
import type { CircleOrganizer } from "../lib/circles/organizers.ts";
import type { LocalSupportRecord } from "../lib/circles/local-support.ts";
import { circlePhotos, galleryIndex, circleDonorExamples } from "../lib/ui/circle-media.ts";
import * as copy from "../lib/i18n/revamp-circles.ts";
import * as contentCopy from "../lib/i18n/circles-content.ts";
import * as currency from "../lib/ui/currency.ts";
import { LOCALES, type Locale } from "../lib/i18n/config.ts";

type Element = { type: string; props: Record<string, unknown> };
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
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const fixtures = new Map<string, Record<string, unknown>>();
function fixture(path: string): Record<string, unknown> {
  if (fixtures.has(path)) return fixtures.get(path)!;
  const output: Record<string, unknown> = {}; fixtures.set(path, output);
  runInNewContext(compile(path), { exports: output, require(name: string) {
    if (name === "./organizers") return fixture("../lib/circles/organizers.ts");
    if (name === "./types") return fixture("../lib/circles/types.ts");
    throw Error(`Unexpected fixture dependency: ${name}`);
  } });
  return output;
}
const catalog = fixture("../lib/circles/seed.ts") as { getCircle(id: string): Circle };
const base = catalog.getCircle("tino-relief");
const sceneCircle: Circle = { ...base, gallery: [
  { src: base.coverImage!, alt: "Fictional recovery concept", caption: "Generated recovery concept, not documentary evidence." },
  { src: catalog.getCircle("ate-mei-dialysis").coverImage!, alt: "Different fictional concept", caption: "Related example only, not campaign proof." },
  { src: catalog.getCircle("barangay-library").coverImage!, alt: "Third fictional concept", caption: "AI-generated illustrative concept." },
] };

// Actual component handlers run with isolated hooks. Images are element data,
// not downloads, and network/storage/action boundaries are forbidden.
function mount(path: string, props: unknown, locale: Locale = "en", initiallyHydrated = true) {
  const states: unknown[] = []; let cursor = 0;
  let hydrated = initiallyHydrated;
  const calls = { network: 0, storage: 0 };
  const forbidden = (kind: keyof typeof calls) => () => { calls[kind]++; throw Error(`Forbidden ${kind} in isolated UI test`); };
  const output = {} as { default(props: unknown): Element };
  const jsx = (type: unknown, properties: Record<string, unknown>): Element => typeof type === "function" ? type(properties) : { type: String(type), props: properties };
  runInNewContext(compile(path), {
    exports: output, fetch: forbidden("network"), sessionStorage: { getItem: forbidden("storage"), setItem: forbidden("storage") },
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react") return {
        useState(initial: unknown) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], (value: unknown) => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
        useSyncExternalStore(_subscribe: unknown, clientSnapshot: () => unknown, serverSnapshot: () => unknown) { return hydrated ? clientSnapshot() : serverSnapshot(); },
      };
      if (name === "next/image") return { default: "Image" };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale, currency: "en" }) };
      if (name === "@/lib/i18n/revamp-circles") return copy;
      if (name === "@/lib/i18n/circles-content") return contentCopy;
      if (name === "@/lib/ui/circle-media") return { circlePhotos, galleryIndex, circleDonorExamples };
      if (name === "@/lib/ui/currency") return currency;
      if (name.endsWith(".module.css")) return { default: new Proxy({}, { get: (_target, key) => String(key) }) };
      throw Error(`Unexpected UI dependency: ${name}`);
    },
  });
  const render = () => { cursor = 0; return output.default(props); };
  let tree = render();
  return { get tree() { return tree; }, calls,
    refresh() { tree = render(); },
    hydrate() { hydrated = true; tree = render(); },
    click(label: string) { const node = nodes(tree).find(node => node.type === "button" && node.props["aria-label"] === label); assert.ok(node, label); (node.props.onClick as () => void)(); tree = render(); },
    key(key: string) { const node = nodes(tree).find(node => node.props.role === "region")!; let prevented = false; (node.props.onKeyDown as (event: unknown) => void)({ key, preventDefault() { prevented = true; } }); tree = render(); return prevented; },
    error(src: string) { const node = nodes(tree).find(node => node.type === "Image" && node.props.src === src)!; assert.ok(node); (node.props.onError as () => void)(); tree = render(); },
  };
}

test("gallery helper never counts duplicate images or invents a missing legacy photo", () => {
  assert.equal(circlePhotos({ ...sceneCircle, gallery: [...sceneCircle.gallery!, sceneCircle.gallery![0]] }).length, 3);
  assert.equal(circlePhotos({ ...base, gallery: undefined }).length, 1);
  assert.equal(circlePhotos({ ...base, gallery: [], coverImage: undefined }).length, 0);
  assert.equal(galleryIndex(0, 3, "ArrowLeft"), 2); assert.equal(galleryIndex(2, 3, "ArrowRight"), 0);
  assert.equal(galleryIndex(1, 3, "Home"), 0); assert.equal(galleryIndex(0, 3, "End"), 2);
  assert.equal(galleryIndex(1, 3, "Enter"), 1); assert.equal(galleryIndex(0, 0, "ArrowLeft"), 0);
});

test("real gallery handlers cycle arrows, choose thumbnails and expose keyboard/selected state", () => {
  const view = mount("../components/CircleGallery.tsx", { circle: sceneCircle });
  assert.match(text(view.tree), /Photo 1 of 3/);
  assert.equal(nodes(view.tree).find(node => node.type === "Image" && node.props.fill)?.props.alt, sceneCircle.gallery![0].alt);
  view.click("Next photo"); assert.match(text(view.tree), /Photo 2 of 3/);
  view.click("Previous photo"); assert.match(text(view.tree), /Photo 1 of 3/);
  view.click("Show photo 3 of 3"); assert.match(text(view.tree), /Photo 3 of 3/);
  assert.equal(nodes(view.tree).find(node => node.props["aria-pressed"] === true)?.props["aria-label"], "Show photo 3 of 3");
  assert.equal(view.key("Home"), true); assert.match(text(view.tree), /Photo 1 of 3/);
  assert.equal(view.key("ArrowLeft"), true); assert.match(text(view.tree), /Photo 3 of 3/);
  assert.equal(view.key("ArrowRight"), true); assert.match(text(view.tree), /Photo 1 of 3/);
  assert.equal(view.key("End"), true); assert.match(text(view.tree), /Photo 3 of 3/);
  assert.equal(view.key("Enter"), false);
  assert.ok(nodes(view.tree).some(node => node.type === "figcaption" && node.props["aria-live"] === "polite"));
  assert.deepEqual(view.calls, { network: 0, storage: 0 });
});

test("SSR gallery controls cannot lose an early press and the first permitted click works after hydration", () => {
  const view = mount("../components/CircleGallery.tsx", { circle: sceneCircle }, "en", false);
  assert.equal(view.tree.props["aria-busy"], true);
  assert.equal(view.tree.props.tabIndex, undefined);
  assert.equal(nodes(view.tree).filter(node => node.type === "button").length, 5);
  assert.ok(nodes(view.tree).filter(node => node.type === "button").every(node => node.props.disabled === true));
  view.click("Next photo");
  view.click("Show photo 3 of 3");
  assert.equal(view.key("ArrowRight"), false);
  assert.match(text(view.tree), /Photo 1 of 3/);
  view.hydrate();
  assert.equal(view.tree.props["aria-busy"], false);
  assert.equal(view.tree.props.tabIndex, 0);
  assert.ok(nodes(view.tree).filter(node => node.type === "button").every(node => node.props.disabled === false));
  view.click("Next photo");
  assert.match(text(view.tree), /Photo 2 of 3/);
  assert.equal(nodes(view.tree).find(node => node.props["aria-pressed"] === true)?.props["aria-label"], "Show photo 2 of 3");
  assert.deepEqual(view.calls, { network: 0, storage: 0 });
});

test("failed gallery images use an honest unavailable state, not another photo pretending to be the same scene", () => {
  const view = mount("../components/CircleGallery.tsx", { circle: sceneCircle });
  view.error(sceneCircle.gallery![0].src);
  assert.match(text(view.tree), /Photo unavailable/);
  assert.equal(nodes(view.tree).filter(node => node.type === "Image" && node.props.src === sceneCircle.gallery![0].src).length, 0);
  view.click("Next photo"); assert.doesNotMatch(text(view.tree), /Photo unavailable/);
  const missing = mount("../components/CircleGallery.tsx", { circle: { ...base, gallery: undefined, coverImage: undefined } });
  assert.match(text(missing.tree), /Photo unavailable/);
  assert.equal(nodes(missing.tree).filter(node => node.type === "button").length, 0);
});

test("anonymous examples remove supplied identity/avatar before rendering while preserving nominal/date/comment", () => {
  const circle: Circle = { ...base, donorExamples: [
    { id: "anonymous-fixture", anonymous: true, displayName: "Private mock name", avatarSrc: "/never-request-this.png", amountPesos: 500, createdAt: "2026-09-30T08:00:00Z", comment: "A fictional encouragement." },
    { id: "named-fixture", anonymous: false, displayName: "Maya (example)", amountPesos: 1000, createdAt: "2026-09-29T08:00:00Z", comment: "Keep going." },
  ] };
  const projected = circleDonorExamples(circle);
  assert.equal(Object.hasOwn(projected[0], "displayName"), false); assert.equal(Object.hasOwn(projected[0], "avatarSrc"), false);
  const view = mount("../components/CircleDonorExamples.tsx", { circle });
  assert.match(text(view.tree), /Anonymous \(example\)/); assert.match(text(view.tree), /Maya \(example\)/);
  assert.match(text(view.tree), /2 sample entries/); assert.match(text(view.tree), /A fictional encouragement/);
  assert.doesNotMatch(text(view.tree), /Private mock name|312/);
  assert.equal(nodes(view.tree).some(node => node.type === "Image" && node.props.src === "/never-request-this.png"), false);
  assert.equal(nodes(view.tree).find(node => node.type === "time")?.props.dateTime, "2026-09-30T08:00:00Z");
  assert.deepEqual(view.calls, { network: 0, storage: 0 });
});

test("legacy recentDonations work and an explicitly empty donorExamples list stays honest", () => {
  const legacy = { ...base, donorExamples: undefined, recentDonations: [{ id: "legacy", donorLabel: "Anonymous", pesoAmount: 250, whenLabel: "Example: yesterday", note: "Stay strong." }] };
  const legacyView = mount("../components/CircleDonorExamples.tsx", { circle: legacy });
  assert.match(text(legacyView.tree), /Anonymous \(example\)|Example: yesterday|Stay strong/);
  const empty = mount("../components/CircleDonorExamples.tsx", { circle: { ...legacy, donorExamples: [] } });
  assert.match(text(empty.tree), /No example donor entries/); assert.match(text(empty.tree), /0 sample entries/);
});

test("browser-only confirmations render separately, keep their original currency and never change seed examples", () => {
  const before = JSON.stringify(base);
  const support = { id: "local-circle-fixture", circleId: base.id, anonymous: true, comment: "My isolated local message.", currency: "id", displayValue: "50000", confirmedAt: "2026-10-06T08:00:00.000Z" } as LocalSupportRecord;
  const view = mount("../components/CircleDonorExamples.tsx", { circle: base, supports: [support] });
  assert.match(text(view.tree), /Anonymous \(local demo\)/); assert.match(text(view.tree), /My isolated local message/);
  assert.match(text(view.tree), /IDR/); assert.match(text(view.tree), /do not change example progress/);
  assert.equal(JSON.stringify(base), before); assert.deepEqual(view.calls, { network: 0, storage: 0 });
});

test("organizer avatar displays a portrait or NGO logo and preserves a fallback on failed source", () => {
  const organizer = { name: "Example NGO", kind: "ngo", initials: "EN", avatarSrc: "/circles/organizers/example.svg", avatarAlt: "Fictional NGO logo" } as CircleOrganizer;
  const view = mount("../components/ui/ExampleOrganizerAvatar.tsx", { organizer, size: 64, decorative: false });
  const image = nodes(view.tree).find(node => node.type === "Image")!;
  assert.equal(image.props.alt, "Fictional NGO logo"); assert.equal(image.props.width, 64);
  assert.ok(String(view.tree.props.className).includes("logo"));
  view.error(organizer.avatarSrc!); assert.equal(nodes(view.tree).filter(node => node.type === "Image").length, 0); assert.equal(text(view.tree), "EN");
  const person = mount("../components/ui/ExampleOrganizerAvatar.tsx", { organizer: { ...organizer, kind: "individual" }, size: 34 });
  assert.equal(person.tree.props["aria-hidden"], true); assert.equal(nodes(person.tree).find(node => node.type === "Image")?.props.alt, "");
  assert.ok(String(person.tree.props.className).includes("person"));
});

test("gallery and donor state labels are localized in all four supported languages", () => {
  for (const locale of LOCALES) {
    const c = copy.circlesCopy(locale);
    const gallery = mount("../components/CircleGallery.tsx", { circle: sceneCircle }, locale);
    assert.equal(gallery.tree.props["aria-label"], c("Fictional campaign photo gallery"));
    gallery.click(c("Next photo")); assert.ok(text(gallery.tree).includes(c("Photo {index} of {count}", { index: 2, count: 3 })));
    const feed = mount("../components/CircleDonorExamples.tsx", { circle: { ...base, donorExamples: [] } }, locale);
    assert.ok(text(feed.tree).includes(c("Example donor activity")));
    assert.ok(text(feed.tree).includes(c("No example donor entries are available.")));
  }
});
