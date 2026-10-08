import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { circleDisplayContent, circleDisplayTitle } from "../lib/i18n/circles-content.ts";
import { LOCALES, type Locale } from "../lib/i18n/config.ts";
import type { Circle } from "../lib/circles/types.ts";

// Load the actual pure fixture catalog without resolving Next's aliases or
// starting its server. Unexpected fixture dependencies fail the test.
const modules = new Map<string, Record<string, unknown>>();
function fixture(path: string): Record<string, unknown> {
  const cached = modules.get(path);
  if (cached) return cached;
  const exports: Record<string, unknown> = {};
  modules.set(path, exports);
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { exports, require(name: string) {
    if (name === "./organizers") return fixture("../lib/circles/organizers.ts");
    throw Error(`Unexpected catalog dependency: ${name}`);
  } });
  return exports;
}
const catalog = fixture("../lib/circles/seed.ts") as { SEED_CIRCLES: Circle[]; COMPLETED_CIRCLES: Circle[] };
const circles = [...catalog.SEED_CIRCLES, ...catalog.COMPLETED_CIRCLES];
const localized = ["tl", "id", "vi"] as const;
const expectedDisclosure: Record<Locale, RegExp> = {
  en: /fictional|synthetic|not verified|not.*verified|no.*verified/i,
  tl: /kathang-isip|sintetiko|hindi na-verify|walang.*na-verify/i,
  id: /fiktif|sintetis|bukan.*terverifikasi|tidak ada.*diverifikasi/i,
  vi: /hư cấu|mô phỏng|không phải.*xác minh|chưa xác minh/i,
};
const storyBoundaries: Record<Locale, readonly RegExp[]> = {
  en: [/synthetic examples/, /not records of actual donations, verified identity or delivered aid/, /no payment or allocation contract/, /no platform fee/],
  tl: [/sintetikong halimbawa/, /Hindi ito mga tala ng aktuwal na donasyon, na-verify na pagkakakilanlan o naihatid na tulong/, /Walang kontrata sa pagbabayad o alokasyon/, /wala itong itinatakdang bayad sa platform/],
  id: [/contoh sintetis/, /bukan catatan donasi aktual, identitas terverifikasi, atau bantuan yang telah disalurkan/, /tidak memiliki kontrak pembayaran atau alokasi/, /tidak menetapkan biaya platform/],
  vi: [/ví dụ mô phỏng/, /không phải hồ sơ quyên góp thực tế, danh tính đã xác minh hay viện trợ đã bàn giao/, /không có hợp đồng thanh toán hoặc phân bổ/, /không xác lập phí nền tảng/],
};
function fields(circle: Circle) {
  return { title: circle.title, summary: circle.summary, story: circle.story, updates: circle.updates, gallery: circle.gallery, imageAlt: circle.imageAlt };
}
function englishTitle(circle: Circle) {
  return circle.id === "arisan-banjir-jakarta" ? "North Jakarta floods - a community kitchen for 200 families" : circle.title;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

test("all 27 active and 27 completed catalog causes have authored content in every supported locale", () => {
  assert.equal(catalog.SEED_CIRCLES.length, 27);
  assert.equal(catalog.COMPLETED_CIRCLES.length, 27);
  assert.equal(new Set(circles.map(circle => circle.id)).size, 54);
  for (const circle of circles) for (const locale of LOCALES) {
    const display = circleDisplayContent(circle, locale);
    assert.equal(display.title, circleDisplayTitle(circle.id, locale), `${circle.id}/${locale}: trusted title`);
    for (const text of [display.title, display.summary, display.story, display.imageAlt]) {
      assert.ok(text, `${circle.id}/${locale}: missing text`);
      assert.ok(text.trim(), `${circle.id}/${locale}: blank text`);
      assert.doesNotMatch(text, /undefined|\{\w+\}/, `${circle.id}/${locale}: unresolved template`);
    }
    assert.equal(display.story.split("\n\n").length, 3);
    for (const boundary of storyBoundaries[locale]) assert.match(display.story, boundary, `${circle.id}/${locale}: missing truth boundary`);
    for (const text of [display.summary!, display.story, display.imageAlt!]) assert.match(text, expectedDisclosure[locale]);
    assert.equal(display.updates?.length, circle.updates?.length);
    assert.equal(display.gallery?.length, circle.gallery?.length);
    if (locale !== "en") {
      assert.notEqual(display.story, circle.story, `${circle.id}/${locale}: missing story translation`);
      assert.notEqual(display.summary, circle.summary);
      assert.notEqual(display.imageAlt, circle.imageAlt);
      if (!(circle.id === "arisan-banjir-jakarta" && locale === "id")) assert.notEqual(display.title, circle.title);
      assert.doesNotMatch(display.story, /This fictional Circles cause|synthetic examples|actual donations|platform fee/);
    }
  }
});

test("English preserves authored source content and has one explicit Jakarta display-title translation", () => {
  for (const circle of circles) {
    const display = circleDisplayContent(circle, "en");
    assert.deepEqual(display, { ...fields(circle), title: englishTitle(circle) });
    assert.equal(display.updates, circle.updates);
    assert.equal(display.gallery, circle.gallery);
  }
  const jakarta = circles.find(circle => circle.id === "arisan-banjir-jakarta")!;
  assert.equal(jakarta.title, "Banjir Jakarta Utara - dapur umum untuk 200 keluarga");
  assert.equal(circleDisplayContent(jakarta, "id").title, jakarta.title);
});

test("all authored updates and gallery scenes follow the selected locale without altering their records", () => {
  for (const circle of circles) for (const locale of localized) {
    const display = circleDisplayContent(circle, locale);
    for (const [index, update] of display.updates!.entries()) {
      const source = circle.updates![index];
      assert.notEqual(update.title, source.title, `${circle.id}/${locale}/${update.kind}: title`);
      assert.notEqual(update.body, source.body);
      assert.notEqual(update.proofLabel, source.proofLabel);
      assert.match(update.body, expectedDisclosure[locale]);
      assert.match(update.proofLabel!, expectedDisclosure[locale]);
      assert.deepEqual({ ...update, title: source.title, body: source.body, proofLabel: source.proofLabel }, { ...source });
    }
    for (const [index, photo] of display.gallery!.entries()) {
      const source = circle.gallery![index];
      assert.notEqual(photo.alt, source.alt, `${circle.id}/${locale}/${index}: photo alt`);
      assert.notEqual(photo.caption, source.caption);
      assert.match(photo.alt, expectedDisclosure[locale]);
      assert.match(photo.caption, /AI/);
      assert.deepEqual({ ...photo, alt: source.alt, caption: source.caption }, { ...source });
    }
  }
});

test("unknown IDs, altered titles or stories and ephemeral user causes always retain their exact authored content", () => {
  const source = circles[0];
  const variants = [
    { ...source, id: "user-created-cause" },
    { ...source, id: "__proto__" },
    { ...source, id: "constructor" },
    { ...source, title: source.title + " edited by organizer" },
    { ...source, story: source.story + "\n\nOrganizer addition." },
    { ...source, ephemeral: true },
  ];
  for (const circle of variants) for (const locale of LOCALES) {
    assert.deepEqual(circleDisplayContent(circle, locale), fields(circle));
    assert.equal(circleDisplayContent(circle, locale).updates, circle.updates);
    assert.equal(circleDisplayContent(circle, locale).gallery, circle.gallery);
  }
  for (const id of ["", "__proto__", "constructor", "user-created-cause"]) {
    for (const locale of LOCALES) assert.equal(circleDisplayTitle(id, locale), undefined);
  }
  const jakarta = circles.find(circle => circle.id === "arisan-banjir-jakarta")!;
  for (const circle of [{ ...jakarta, title: "My Jakarta cause" }, { ...jakarta, story: "My organizer story." }, { ...jakarta, ephemeral: true }]) {
    assert.deepEqual(circleDisplayContent(circle, "en"), fields(circle), "English Jakarta override must obey the same content guards");
  }
});

test("edited optional text, user updates and user gallery entries are preserved inside a known catalog cause", () => {
  const source = circles[0];
  const editedUpdate = { ...source.updates![0], title: "Organizer's own update" };
  const editedPhoto = { ...source.gallery![0], caption: "Organizer's own photo caption" };
  const extraUpdate = { ...source.updates![1], id: "new-organizer-update", body: "Unreviewed organizer text." };
  const extraPhoto = { src: "/uploads/user-photo.png", alt: "My photo", caption: "My own caption" };
  const circle: Circle = {
    ...source, summary: "Organizer's own summary", imageAlt: "Organizer's own image description",
    updates: [editedUpdate, source.updates![1], source.updates![2], extraUpdate],
    gallery: [editedPhoto, source.gallery![1], source.gallery![2], extraPhoto],
  };
  for (const locale of localized) {
    const display = circleDisplayContent(circle, locale);
    assert.equal(display.summary, circle.summary);
    assert.equal(display.imageAlt, circle.imageAlt);
    assert.equal(display.updates![0], editedUpdate);
    assert.equal(display.updates![3], extraUpdate);
    assert.equal(display.gallery![0], editedPhoto);
    assert.equal(display.gallery![3], extraPhoto);
    assert.notEqual(display.updates![1].body, circle.updates![1].body);
    assert.notEqual(display.gallery![1].alt, circle.gallery![1].alt);
  }
});

test("frozen catalog data, money, dates, identities, allocations and donor comments are never mutated", () => {
  for (const original of circles) {
    const circle = deepFreeze(structuredClone(original));
    const before = JSON.stringify(circle);
    for (const locale of LOCALES) {
      const display = circleDisplayContent(circle, locale);
      const merged = { ...circle, ...display };
      assert.equal(JSON.stringify(circle), before);
      for (const key of Object.keys(circle) as (keyof Circle)[]) {
        if (!(key in display)) assert.equal(merged[key], circle[key], `${circle.id}/${locale}/${key}`);
      }
      assert.equal(merged.donorExamples, circle.donorExamples);
      assert.equal(merged.recentDonations, circle.recentDonations);
      assert.equal(merged.allowance, circle.allowance);
      assert.equal(merged.organizer, circle.organizer);
      assert.equal(merged.id, circle.id);
    }
  }
});

test("content localization initializes without runtime imports, backend access or translation-service dependencies", () => {
  const code = ts.transpileModule(readFileSync(new URL("../lib/i18n/circles-content.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(code, { exports, require(name: string) { throw Error(`Unexpected content runtime dependency: ${name}`); } });
  assert.equal(typeof exports.circleDisplayContent, "function");
  assert.equal(typeof exports.circleDisplayTitle, "function");
});
