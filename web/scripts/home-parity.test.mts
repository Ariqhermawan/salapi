import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOME_COPY, homeCopy } from "../lib/i18n/revamp-home.ts";
import { LOCALES } from "../lib/i18n/config.ts";

test("home copy covers four languages and keeps currency separate from language", () => {
  for (const phrase of Object.keys(HOME_COPY)) {
    assert.equal(homeCopy("en", phrase), phrase);
    assert.equal(homeCopy(undefined, phrase), phrase);
    for (const locale of LOCALES.filter(locale => locale !== "en")) {
      assert.ok(homeCopy(locale, phrase).trim());
      assert.notEqual(homeCopy(locale, phrase), phrase, `${locale}: ${phrase}`);
    }
  }
  assert.equal(homeCopy("id", "TESTNET BALANCE"), "SALDO TESTNET");
  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(home, /homeCopy\(locale, phrase\)/);
  assert.doesNotMatch(home, /homeCopy\(currency/);
});
test("Savings remains navigable from Home and Vaults outside preview with no coming-soon gate", () => {
  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const vaults = readFileSync(new URL("../components/screens/VaultsScreen.tsx", import.meta.url), "utf8");
  assert.match(home, /title: "Smart Savings"[^\n]*to: "\/savings"/);
  assert.doesNotMatch(home, /coming: !isLocalPreview/);
  assert.match(vaults, /<Link href="\/savings"/);
  assert.doesNotMatch(vaults, /PREVIEW \? <Link href="\/savings"/);
  assert.doesNotMatch(vaults, /Coming soon/);
});
