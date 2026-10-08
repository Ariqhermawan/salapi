import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOME_COPY, homeCopy } from "../lib/i18n/revamp-home.ts";
import { LOCALES } from "../lib/i18n/config.ts";
import { parse } from "postcss";

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
test("Savings stays coming soon in Home, Vaults and the direct route without mounting money controls", () => {
  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const vaults = readFileSync(new URL("../components/screens/VaultsScreen.tsx", import.meta.url), "utf8");
  assert.match(home, /title: "Smart Savings"[^\n]*coming: true/);
  assert.match(home, /<button[^>]*disabled[^>]*data-testid="smart-savings-coming-soon"/);
  assert.doesNotMatch(vaults, /<Link href="\/savings"/);
  assert.match(vaults, /aria-disabled="true" data-testid="vault-savings-coming-soon"/);
  const route = readFileSync(new URL("../app/savings/page.tsx", import.meta.url), "utf8");
  assert.match(route, /return <SavingsComingSoonScreen \/>/);
  assert.doesNotMatch(route, /import SavingsScreen|isLocalPreview/);
  const placeholder = readFileSync(new URL("../components/screens/SavingsComingSoonScreen.tsx", import.meta.url), "utf8");
  assert.match(placeholder, /copy\("Coming soon"\)/);
  assert.doesNotMatch(placeholder, /@\/app\/actions|SavingsScreen|useEffect|smartSavings|localStorage|sessionStorage/);
});

test("compact Home keeps four equal quick actions, readable labels and scroll fallback instead of clipping the page", () => {
  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/home.module.css", import.meta.url), "utf8");
  const sheet = parse(css);
  const declarations = (selector: string, property: string) => {
    const values: string[] = [];
    sheet.walkRules(rule => {
      if (rule.selectors.includes(selector)) rule.walkDecls(property, declaration => { values.push(declaration.value); });
    });
    return values;
  };
  assert.deepEqual(declarations(".quickGrid", "grid-template-columns"), ["repeat(4, minmax(0, 1fr))"]);
  assert.ok(declarations(".tile", "min-height").every(value => Number.parseFloat(value) >= 44));
  assert.ok(declarations(".tile strong", "font-size").every(value => Number.parseFloat(value) >= 11));
  assert.match(css, /\.tile:focus-visible[^}]*outline:\s*2px/);
  assert.equal(declarations(".home", "height").length, 0);
  assert.equal(declarations(".home", "overflow").length, 0);
  assert.doesNotMatch(css, /transform:\s*scale\(\s*0\./);
  for (const target of ["/savings", "/arisan", "/send", "/transparency"]) assert.ok(home.includes(`to: "${target}"`));
  assert.match(home, /<small>\{copy\(tile\.sub\)\}<\/small>/, "Descriptions stay in accessible link names");
});
