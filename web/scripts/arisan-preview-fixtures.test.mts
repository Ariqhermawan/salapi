import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ARISAN_PREVIEW_FIXTURES, arisanPreviewStartEligible } from "../lib/arisan-preview-fixtures.ts";

test("Local Preview has isolated fixtures for all active Arisan room modes", () => {
  const modes = ARISAN_PREVIEW_FIXTURES.filter(fixture => fixture.section === "mode");
  assert.deepEqual(modes.map(fixture => fixture.mode), ["upfront", "installments", "scheduled"]);
  assert.equal(modes[0].joinContributionXlm, modes[0].obligationXlm);
  assert.equal(modes[1].joinContributionXlm, "0.0000000");
  assert.equal(modes[2].joinContributionXlm, "0.0000000");
  assert.equal("schedule" in modes[2] && modes[2].schedule.intervalDays, 14);
});

test("join-review fixtures cover each mode without accepting or saving membership", () => {
  const reviews = ARISAN_PREVIEW_FIXTURES.filter(fixture => fixture.section === "join-review");
  assert.deepEqual(reviews.map(fixture => fixture.mode), ["upfront", "installments", "scheduled"]);
  for (const review of reviews) {
    assert.match(review.inviteCode ?? "", /^[A-HJ-NP-Z2-9]{6}$/);
    assert.ok(review.obligationXlm);
  }
  assert.equal(reviews.find(fixture => fixture.mode === "upfront")?.joinContributionXlm, "5.0000000");
  assert.equal(reviews.find(fixture => fixture.mode === "installments")?.joinContributionXlm, "0.0000000");
  assert.equal(reviews.find(fixture => fixture.mode === "scheduled")?.joinContributionXlm, "0.0000000");
});

test("start-gate fixtures show roster, funding, and ready states without submitting Start", () => {
  const gates = ARISAN_PREVIEW_FIXTURES.filter(fixture => fixture.section === "start-gate");
  assert.equal(gates.length, 3);
  assert.equal(arisanPreviewStartEligible(gates[0]), false);
  assert.equal(gates[0].memberCount, gates[0].fullyFundedCount);
  assert.equal(gates[0].memberCount, gates[0].memberTarget - 1);
  assert.equal(arisanPreviewStartEligible(gates[1]), false);
  assert.equal(gates[1].memberCount, gates[1].memberTarget);
  assert.equal(gates[1].fullyFundedCount, gates[1].memberTarget - 1);
  assert.equal(arisanPreviewStartEligible(gates[2]), true);
  assert.equal(gates[2].memberCount, gates[2].fullyFundedCount);
});

test("fixture route is Local Preview-only and the screen has no write or network boundary", () => {
  const route = readFileSync(new URL("../app/arisan/preview/page.tsx", import.meta.url), "utf8");
  const screen = readFileSync(new URL("../components/screens/ArisanPreviewFixturesScreen.tsx", import.meta.url), "utf8");
  assert.match(route, /if \(!isLocalPreview\) redirect\("\/arisan"\)/);
  assert.doesNotMatch(screen, /@\/app\/actions|sessionStorage|localStorage|fetch\s*\(|onClick|<button/);
  assert.match(screen, /read-only|READ ONLY|HANYA BACA/i);
  assert.match(screen, /Start is never submitted|Start tidak pernah dikirim|Hindi kailanman isinusumite ang Start|Không gửi Start/);
});
