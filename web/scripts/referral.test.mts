import assert from "node:assert/strict";
import test from "node:test";
import { referralCode, referralCodeFromNext, referralSignupEligible } from "../lib/referral.ts";

test("printed codes and exact referral links resolve to the same code", () => {
  assert.equal(referralCode("  a1b2 C3D4 "), "A1B2C3D4");
  assert.equal(referralCodeFromNext("/r/a1b2c3d4"), "A1B2C3D4");

  for (const path of ["/r/A1B2C3D", "/r/A1B2C3D4/extra", "/r/A1B2C3D4?other=1", "//r/A1B2C3D4", "/%72/A1B2C3D4"]) {
    assert.equal(referralCodeFromNext(path), null, path);
  }
  assert.equal(referralCode("oops1234"), null);
});

test("only a recent account with a sign-in near account creation can be attributed", () => {
  const now = Date.parse("2026-11-26T14:00:00Z");
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  assert.equal(referralSignupEligible(at(2), at(1), now), true);
  assert.equal(referralSignupEligible(at(5), at(3), now), true);
  assert.equal(referralSignupEligible(at(6), at(5), now), false);
  assert.equal(referralSignupEligible(at(4), at(1), now), false);
  assert.equal(referralSignupEligible(at(2), at(3), now), false);
  assert.equal(referralSignupEligible(at(2), at(-1), now), false);
  assert.equal(referralSignupEligible(at(2), undefined, now), false);
});
