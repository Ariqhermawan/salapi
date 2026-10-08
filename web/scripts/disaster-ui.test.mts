import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const screen = readFileSync(new URL("../components/screens/TransparencyScreen.tsx", import.meta.url), "utf8");
const controls = readFileSync(new URL("../components/DisasterControls.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../components/screens/VaultsRevamp.module.css", import.meta.url), "utf8");

test("D3 every contribution phase uses the single-navigation-reserve layout", () => {
  assert.equal((screen.match(/styles\.disasterScreen/g) ?? []).length, 4);
  assert.match(css, /\.disasterScreen\s*\{\s*padding: 16px 20px;/);
});

test("D3 explains the shared fund with a small safe illustration and live contract rules", () => {
  assert.match(screen, /<h1>Disaster Vault<\/h1>/);
  assert.match(screen, /Shared pool, not your personal balance/);
  assert.match(screen, /disaster-safe\.webp/);
  assert.ok(statSync(new URL("../public/illustrations/disaster-safe.webp", import.meta.url)).size < 40_000);
  assert.match(controls, /<ol className=\{styles\.vaultSteps\}>/);
  assert.match(controls, /pool\.config\.timelock_ledgers/);
  assert.equal((controls.match(/pool\.config\.cap_bps \/ 100/g) ?? []).length, 2);
  assert.match(controls, /Two of the three different signer wallets/);
  assert.match(controls, /Two approvals can pause or resume payouts/);
  assert.match(controls, /Approving a request\s+does not reserve it/);
  assert.match(controls, /do not mean independent key custody/);
});
