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
  const screen = readFileSync(new URL("../components/screens/PrototypeHomeScreen.tsx", import.meta.url), "utf8");
  assert.match(home, /PrototypeHomeScreen/);
  assert.match(screen, /homeCopy\(locale, phrase\)/);
  assert.doesNotMatch(screen, /homeCopy\(currency/);
});
test("Smart Savings uses the Testnet contract for signed-in wallets and keeps preview funds local", () => {
  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const vaults = readFileSync(new URL("../components/screens/VaultsScreen.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(home, /href="\/savings"/);
  const homeScreen = readFileSync(new URL("../components/screens/PrototypeHomeScreen.tsx", import.meta.url), "utf8");
  assert.match(homeScreen, /data-testid=\{liveData \? "social-feed-coming-soon" : undefined\}[^>]*disabled=\{Boolean\(liveData\)\}/);
  assert.match(vaults, /<Link href="\/savings"/);
  assert.doesNotMatch(vaults, /aria-disabled="true" data-testid="vault-savings-coming-soon"/);
  const route = readFileSync(new URL("../app/savings/page.tsx", import.meta.url), "utf8");
  assert.match(route, /import SavingsScreen/);
  assert.match(route, /return <SavingsScreen \/>/);
  const savingsScreen = readFileSync(new URL("../components/screens/SavingsScreen.tsx", import.meta.url), "utf8");
  assert.match(savingsScreen, /return isLocalPreview \? <PreviewSavingsScreen \/> : <LiveSavingsScreen \/>/);
  assert.match(savingsScreen, /Experimental Testnet savings/);
  const actions = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
  assert.match(actions, /authenticatedSavingsSigner/);
});

test("Home actions and cause tiles retain the prototype's mobile layout", () => {
  const home = readFileSync(new URL("../components/screens/PrototypeHomeScreen.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/screens/PrototypeHomeScreen.module.css", import.meta.url), "utf8");
  const vaultRoute = readFileSync(new URL("../app/vault/page.tsx", import.meta.url), "utf8");
  const vaultScreen = readFileSync(new URL("../components/screens/TransparencyScreen.tsx", import.meta.url), "utf8");
  const sheet = parse(css);
  const declarations = (selector: string, property: string) => {
    const values: string[] = [];
    sheet.walkRules(rule => {
      if (rule.selectors.includes(selector)) rule.walkDecls(property, declaration => { values.push(declaration.value); });
    });
    return values;
  };
  assert.deepEqual(declarations(".actions", "display"), ["grid"]);
  assert.deepEqual(declarations(".actions", "grid-template-columns"), ["repeat(4,minmax(0,1fr))"]);
  assert.deepEqual(declarations(".tiles", "grid-template-columns"), ["repeat(3,minmax(0,1fr))"]);
  assert.ok(declarations(".action", "min-height").every(value => Number.parseFloat(value) >= 44));
  assert.ok(declarations(".tile", "min-height").some(value => Number.parseFloat(value) >= 44));
  assert.doesNotMatch(css, /transform:\s*scale\(\s*0\./);
  assert.ok(home.includes('href="/vaults"'));
  assert.ok(home.includes('href="/vault?tab=activity"'));
  assert.match(vaultRoute, /return <TransparencyScreen \/>/);
  assert.match(vaultScreen, /searchParams\.get\("tab"\) === "activity"/);
  assert.match(vaultScreen, /aria-selected=\{activityView === \(tab === "activity"\)\}/);
  assert.match(vaultScreen, /if \(tab === "activity"\) params\.set\("tab", "activity"\)/);
  assert.match(home, /<strong>\{copy\("Social feed"\)\}<\/strong>/);
});
