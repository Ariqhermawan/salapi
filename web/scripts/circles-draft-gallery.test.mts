import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { CATEGORY_LABEL, type CircleCategory } from "../lib/circles/types.ts";
import { defaultDraftGallery, draftGalleryOptions, readDraftGallery, replaceDraftPhoto } from "../lib/ui/circle-draft-gallery.ts";

const categories = Object.keys(CATEGORY_LABEL) as CircleCategory[];

test("all nine categories have six distinct local AI choices, three defaults and existing assets", () => {
  assert.equal(categories.length, 9);
  for (const category of categories) {
    const options = draftGalleryOptions(category), defaults = defaultDraftGallery(category);
    assert.equal(options.length, 6); assert.equal(new Set(options.map(photo => photo.src)).size, 6);
    assert.deepEqual(defaults, options.slice(0, 3));
    for (const photo of options) {
      assert.match(photo.src, /^\/circles\/generated\/[a-z0-9-]+\.png$/);
      assert.ok(existsSync(new URL(`../public${photo.src}`, import.meta.url)), `Missing actual gallery asset ${photo.src}`);
      assert.match(photo.alt, /AI-generated fictional scene.*Not a photo of this draft/);
      assert.match(photo.caption, /not a photo of this draft or delivery proof/);
    }
  }
});

test("selection returns a new ordered array and rejects duplicate, remote, unknown or category-mismatched sources", () => {
  const current = defaultDraftGallery("animals"), before = JSON.stringify(current), alternate = draftGalleryOptions("animals")[4];
  const next = replaceDraftPhoto("animals", current, 0, alternate.src);
  assert.ok(next); assert.equal(next[0].src, alternate.src); assert.notEqual(next, current); assert.equal(JSON.stringify(current), before);
  for (const source of [current[1].src, "https://invalid.test/photo.png", "/circles/generated/not-found.png", defaultDraftGallery("medical")[0].src]) {
    assert.equal(replaceDraftPhoto("animals", current, 0, source), null);
  }
  for (const index of [-1, 3, 0.5]) assert.equal(replaceDraftPhoto("animals", current, index, alternate.src), null);
});

test("legacy version-1 covers expand without changing the original cover or input record", () => {
  for (const category of categories) for (const cover of ["/circles/disaster.jpg", "/circles/medical.jpg", "/circles/education.jpg", "/illustrations/giving.png"]) {
    const gallery = readDraftGallery(category, cover);
    assert.ok(gallery); assert.equal(gallery.length, 3); assert.equal(gallery[0].src, cover);
    assert.equal(new Set(gallery.map(photo => photo.src)).size, 3);
    assert.match(gallery[0].caption, /Legacy example cover.*not a verified/);
    assert.deepEqual(gallery.slice(1), defaultDraftGallery(category).slice(0, 2));
    assert.deepEqual(readDraftGallery(category, cover, gallery), gallery);
  }
});

test("stored metadata is canonicalized, never trusted as actual delivery proof", () => {
  const gallery = defaultDraftGallery("community");
  const untrusted = gallery.map(photo => ({ ...photo, alt: "Verified delivery proof", caption: "Real verified campaign" }));
  const before = JSON.stringify(untrusted);
  assert.deepEqual(readDraftGallery("community", gallery[0].src, untrusted), gallery);
  assert.equal(JSON.stringify(untrusted), before);
});

test("new gallery storage rejects missing, duplicate, inconsistent cover and cross-category sources", () => {
  const gallery = defaultDraftGallery("education"), cover = gallery[0].src;
  for (const input of [null, {}, [], gallery.slice(0, 2), [...gallery, gallery[0]], [gallery[0], gallery[0], gallery[2]], [{ src: "data:image/png;base64,bad" }, ...gallery.slice(1)], [null, ...gallery.slice(1)], defaultDraftGallery("animals")]) {
    assert.equal(readDraftGallery("education", cover, input), null);
  }
  assert.equal(readDraftGallery("education", gallery[1].src, gallery), null);
  assert.equal(readDraftGallery("education", "https://invalid.test/photo.png"), null);
  assert.equal(readDraftGallery("education", undefined, gallery), null);
});

test("returned default and option arrays cannot mutate future draft choices", () => {
  const defaults = defaultDraftGallery("medical"), before = JSON.stringify(defaults);
  defaults[0].alt = "Changed local display"; defaults.splice(1, 2);
  assert.equal(JSON.stringify(defaultDraftGallery("medical")), before);
});
