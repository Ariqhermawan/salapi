import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as media from "../lib/campaign-media.ts";

const compiled = ts.transpileModule(readFileSync(new URL("../lib/ui/campaign-photo-preparation.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const utility = {} as typeof import("../lib/ui/campaign-photo-preparation");
runInNewContext(compiled, { exports: utility, File, Blob, Uint8Array, DataView, Set, Error, globalThis, require(dependency: string) {
  if (dependency === "../campaign-media") return media;
  throw new Error(`Unexpected dependency ${dependency}`);
} });

function png(width = 1600, height = 900, marker = 0) {
  const bytes = new Uint8Array(45), view = new DataView(bytes.buffer);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]); view.setUint32(8, 13); bytes.set(Buffer.from("IHDR"), 12);
  view.setUint32(16, width); view.setUint32(20, height); bytes[24] = 8; bytes[25] = 2; bytes[32] = marker;
  bytes.set(Buffer.from("IEND"), 37); return bytes;
}
function jpeg(width = 1600, height = 900) {
  const bytes = new Uint8Array(23), view = new DataView(bytes.buffer);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8]); view.setUint16(7, height); view.setUint16(9, width); bytes[11] = 3;
  return bytes;
}
function webp(width = 1600, height = 900, animated = false) {
  const bytes = new Uint8Array(30), view = new DataView(bytes.buffer);
  bytes.set(Buffer.from("RIFF")); view.setUint32(4, 22, true); bytes.set(Buffer.from("WEBPVP8X"), 8); view.setUint32(16, 10, true); bytes[20] = animated ? 2 : 0;
  const set24 = (offset: number, value: number) => { for (let index = 0; index < 3; index++) bytes[offset + index] = value >> (index * 8) & 255; };
  set24(24, width - 1); set24(27, height - 1); return bytes;
}
const files = (count = 3) => Array.from({ length: count }, (_, index) => new File([png(1600, 900, index)], `fixture-${index}.png`, { type: "image/png" }));
function environment({ alwaysLarge = false, outputDuplicate = false, decodedWidth = 1600, decodedHeight = 900, failDecode = false, needsResize = false } = {}) {
  const calls = { decode: 0, close: 0, encode: [] as { width: number; height: number; quality: number }[], active: 0, maxActive: 0 };
  const boundary: import("../lib/ui/campaign-photo-preparation").CampaignPhotoPreparationEnvironment = {
    async digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); },
    async decode() {
      calls.decode++; calls.active++; calls.maxActive = Math.max(calls.active, calls.maxActive);
      if (failDecode) throw new Error("fixture decoder failure");
      const identity = calls.decode;
      return { width: decodedWidth, height: decodedHeight, source: { identity } as unknown as CanvasImageSource, close() { calls.close++; calls.active--; } };
    },
    async encode(image, width, height, quality) {
      calls.encode.push({ width, height, quality });
      const bytes = new Uint8Array(alwaysLarge || (needsResize && width > 1000) || (!needsResize && quality > .7) ? media.CAMPAIGN_MEDIA_MAX_FILE_BYTES + 1 : 9000);
      bytes[0] = outputDuplicate ? 42 : (image.source as unknown as { identity: number }).identity;
      return new Blob([bytes], { type: "image/jpeg" });
    },
  };
  return { calls, boundary };
}
const code = (expected: string) => (error: unknown) => error instanceof utility.CampaignPhotoPreparationError && error.code === expected;

for (const [mime, source] of [["image/png", png()], ["image/jpeg", jpeg()], ["image/webp", webp()]] as const) {
  test(`${mime}: actual header parser reads bounded image dimensions`, () => {
    const result = utility.campaignPhotoDimensions(source, mime); assert.equal(result.width, 1600); assert.equal(result.height, 900);
  });
}
test("header parser rejects animated WebP and APNG, malformed/mismatched signatures and zero dimensions", () => {
  assert.throws(() => utility.campaignPhotoDimensions(webp(100, 100, true), "image/webp"), code("invalid_image"));
  const animated = new Uint8Array(65); animated.set(png()); const view = new DataView(animated.buffer); view.setUint32(33, 8); animated.set(Buffer.from("acTL"), 37);
  assert.throws(() => utility.campaignPhotoDimensions(animated, "image/png"), code("invalid_image"));
  assert.throws(() => utility.campaignPhotoDimensions(jpeg(), "image/png"), code("invalid_image"));
  assert.throws(() => utility.campaignPhotoDimensions(png(0, 1), "image/png"), code("invalid_image"));
  const malformed = png(); new DataView(malformed.buffer).setUint32(8, 0xffffffff);
  assert.throws(() => utility.campaignPhotoDimensions(malformed, "image/png"), code("invalid_image"));
});
test("pixel-bomb headers are rejected before browser image decode", async () => {
  const h = environment(); const source = files(); source[0] = new File([png(10_000, 10_000)], "bomb.png", { type: "image/png" });
  await assert.rejects(utility.prepareCampaignPhotos(source, h.boundary), code("too_large")); assert.equal(h.calls.decode, 0);
});
for (const count of [0, 1, 2, 7]) test(`gallery requires3..6 files, rejects${count} without decoding`, async () => {
  const h = environment(); await assert.rejects(utility.prepareCampaignPhotos(files(count), h.boundary), code("invalid_count")); assert.equal(h.calls.decode, 0);
});
test("SVG and oversized source files are rejected before reading/decode", async () => {
  const h = environment(), svg = files(); svg[0] = new File(["<svg/>"], "fixture.svg", { type: "image/svg+xml" });
  await assert.rejects(utility.prepareCampaignPhotos(svg, h.boundary), code("invalid_type"));
  const large = files(); large[0] = new File([new Uint8Array(utility.CAMPAIGN_PHOTO_MAX_INPUT_BYTES + 1)], "large.png", { type: "image/png" });
  await assert.rejects(utility.prepareCampaignPhotos(large, h.boundary), code("too_large")); assert.equal(h.calls.decode, 0);
});
test("actual algorithm sequentially resizes and JPEG-reencodes6photos below default1MB multipart limit", async () => {
  const h = environment(); const result = await utility.prepareCampaignPhotos(files(6), h.boundary);
  assert.equal(result.length, 6); assert.equal(h.calls.decode, 6); assert.equal(h.calls.close, 6); assert.equal(h.calls.maxActive, 1);
  assert.ok(result.every((file, index) => file.type === "image/jpeg" && file.name === `campaign-photo-${index + 1}.jpg` && file.size <= media.CAMPAIGN_MEDIA_MAX_FILE_BYTES));
  assert.ok(h.calls.encode.every(call => call.width <= 1280 && call.height <= 1280));
  assert.equal(h.calls.encode[0].width, 1280); assert.equal(h.calls.encode[0].height, 720);
  assert.equal(h.calls.encode[0].quality, .84); assert.equal(h.calls.encode[1].quality, .7);
  const data = new FormData(); for (const file of result) data.append("photos", file); data.set("publicAcknowledged", "true");
  const request = new Request("https://fixture.invalid/upload", { method: "POST", body: data });
  assert.ok((await request.arrayBuffer()).byteLength < 1024 * 1024);
});
test("high entropy photos trigger smaller dimensions rather than oversize uploads", async () => {
  const h = environment({ needsResize: true }); const result = await utility.prepareCampaignPhotos(files(), h.boundary);
  assert.equal(result.length, 3); assert.ok(h.calls.encode.some(call => call.width === 960)); assert.equal(h.calls.close, 3);
});
test("identical bytes with different filenames cannot create multiple galleryphotos", async () => {
  const h = environment(), source = files(); source[1] = new File([await source[0].arrayBuffer()], "renamed.png", { type: "image/png" });
  await assert.rejects(utility.prepareCampaignPhotos(source, h.boundary), code("duplicate_photos")); assert.equal(h.calls.decode, 1); assert.equal(h.calls.close, 1);
});
test("different encoded inputs that reencode to same photo are rejected too", async () => {
  const h = environment({ outputDuplicate: true }); await assert.rejects(utility.prepareCampaignPhotos(files(), h.boundary), code("duplicate_photos")); assert.equal(h.calls.decode, 2); assert.equal(h.calls.close, 2);
});
test("decoder dimension mismatch/oversize is checked again and bitmap always closed", async () => {
  const h = environment({ decodedWidth: 12000, decodedHeight: 12000 }); await assert.rejects(utility.prepareCampaignPhotos(files(), h.boundary), code("too_large")); assert.equal(h.calls.close, 1); assert.equal(h.calls.encode.length, 0);
});
test("compression/decode errors fail honestly without leaking decoded image resources", async () => {
  const large = environment({ alwaysLarge: true }); await assert.rejects(utility.prepareCampaignPhotos(files(), large.boundary), code("preparation_failed")); assert.equal(large.calls.close, 1); assert.equal(large.calls.encode.length, 20);
  const failure = environment({ failDecode: true }); await assert.rejects(utility.prepareCampaignPhotos(files(), failure.boundary), code("invalid_image")); assert.equal(failure.calls.encode.length, 0);
});
