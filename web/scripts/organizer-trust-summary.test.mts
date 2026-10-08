import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { homeCatalogCopy } from "../lib/i18n/revamp-home-catalog.ts";

const require = createRequire(import.meta.url);
function render(props: Record<string, unknown> = {}, locale = "en") {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL("../components/ui/OrganizerTrustSummary.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { exports, require(name: string) {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "@/components/I18nProvider") return { useT: () => ({ locale }) };
    if (name === "@/lib/i18n/revamp-home-catalog") return { homeCatalogCopy };
    if (name.endsWith(".module.css")) return { default: new Proxy({}, { get: (_, name) => String(name) }) };
    if (name === "@phosphor-icons/react/dist/csr/Star") return { Star: (props: Record<string, unknown>) => createElement("svg", { ...props, "data-icon": "Star" }) };
    throw new Error(`Unexpected organizer trust dependency: ${name}`);
  } });
  return renderToStaticMarkup(createElement(exports.default as (props: Record<string, unknown>) => ReturnType<typeof createElement>, props));
}

test("fixture stars disclose the example rating and synthetic review count", () => {
  const html = render({ exampleOrganizer: { rating: 4.7, reviewCount: 3 } });
  assert.match(html, /4\.7/);
  assert.match(html, /\/5/);
  assert.match(html, /Example rating/);
  assert.match(html, /3 example reviews/);
  assert.match(html, /weight="fill"/);
  assert.match(html, /data-rating-source="example"/);
  assert.match(html, /KYC not verified/);
});

test("missing and invalid reviews do not manufacture a positive star score", () => {
  for (const exampleOrganizer of [undefined, { rating: 0, reviewCount: 0 }, { rating: 4.8, reviewCount: 0 },
    { rating: NaN, reviewCount: 3 }, { rating: Infinity, reviewCount: 3 }, { rating: 6, reviewCount: 3 },
    { rating: 4.7, reviewCount: -3 }, { rating: 4.7, reviewCount: 1.5 }]) {
    const html = render({ exampleOrganizer });
    assert.match(html, /No reviews yet/);
    assert.match(html, /data-rating-source="none"/);
    assert.match(html, /weight="regular"/);
    assert.doesNotMatch(html, /\/5|Example rating|example reviews/);
  }
});

test("email, demo approvals, tiers and self-claimed KYC never grant a verification badge", () => {
  const html = render({ exampleOrganizer: { rating: 5, reviewCount: 3, kind: "ngo", kycVerified: true },
    verified: true, kycStatus: "approved", allowance: { tier: 2 }, email_confirmed_at: "2026-10-09T00:00:00Z",
    user_metadata: { kyc_verified: true }, demo: { phase: "approved" } });
  assert.match(html, /data-kyc-status="unverified"/);
  assert.match(html, /KYC not verified/);
  assert.doesNotMatch(html, /ShieldCheck|KYC checked|KYC verified|NGO verified|data-kyc-status="verified"/);
});

test("trust disclosures remain explicit in all supported languages", () => {
  for (const [locale, expectedExample, expectedEmpty, expectedKyc] of [
    ["en", "Example rating", "No reviews yet", "KYC not verified"],
    ["id", "Rating contoh", "Belum ada ulasan", "KYC belum terverifikasi"],
    ["tl", "Halimbawang rating", "Wala pang review", "Hindi pa beripikado ang KYC"],
    ["vi", "Đánh giá mẫu", "Chưa có nhận xét", "KYC chưa được xác minh"],
  ]) {
    assert.ok(render({ exampleOrganizer: { rating: 4.7, reviewCount: 3 } }, locale).includes(expectedExample));
    assert.ok(render({}, locale).includes(expectedEmpty));
    assert.ok(render({}, locale).includes(expectedKyc));
  }
});
