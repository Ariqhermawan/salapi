import test from "node:test";
import assert from "node:assert/strict";
import { recipientReviewError } from "../lib/recipient-review.ts";
test("Send rejects a recipient that changed since review", () => {
  assert.match(recipientReviewError("walletB", "walletA")!, /different wallet/);
  assert.equal(recipientReviewError("walletA", "walletA"), null);
  assert.equal(recipientReviewError("walletA"), null);
  assert.ok(recipientReviewError("walletA", ""));
});
