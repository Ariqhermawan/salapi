import test from "node:test";
import assert from "node:assert/strict";
import { recipientReviewError, recipientUsername, RECIPIENT_USERNAME_PATTERN, recipientLookupFailure } from "../lib/recipient-review.ts";
test("Send rejects a recipient that changed since review", () => {
  assert.match(recipientReviewError("walletB", "walletA")!, /different wallet/);
  assert.equal(recipientReviewError("walletA", "walletA"), null);
  assert.equal(recipientReviewError("walletA"), null);
  assert.ok(recipientReviewError("walletA", ""));
});
test("recipient normalization never repairs a potentially misdirected username", () => {
  assert.equal(recipientUsername(" @IMAM "), "imam");
  for (const value of ["i-mam", "i.mam", "i mam", "@@imam", "ímam", "im", "a".repeat(33)]) {
    assert.equal(RECIPIENT_USERNAME_PATTERN.test(recipientUsername(value)), false, value);
    assert.notEqual(recipientUsername(value), "imam");
  }
});
test("only the registry's exact NotFound is labeled unregistered, never an RPC or another contract error", () => {
  assert.equal(recipientLookupFailure(new Error("HostError: Error(Contract, #3)")), "not_found");
  for (const error of [new Error("Error(Contract, #1)"), new Error("Error(Contract, #30)"), new Error("Timeout"), {}, "Error(Contract, #3)", null])
    assert.equal(recipientLookupFailure(error), "unavailable");
});
