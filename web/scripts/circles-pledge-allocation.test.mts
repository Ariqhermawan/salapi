import test from "node:test";
import assert from "node:assert/strict";
import { previewPledgeAllocation } from "../lib/circles/pledge-allocation.ts";

test("a zero-allowance cause allocates the whole pledge to the beneficiary", () => {
  const allocation = previewPledgeAllocation("100", "tl", 0)!;
  assert.equal(allocation.total, 100);
  assert.equal(allocation.beneficiary, 100);
  assert.equal(allocation.organizer, 0);
  assert.equal(allocation.beneficiaryPct, 100);
  assert.equal(allocation.organizerPct, 0);
});

test("the entered local pledge, not a fixed sample or whole-peso conversion, drives the split", () => {
  const allocation = previewPledgeAllocation("10.01", "en", 5)!;
  assert.equal(allocation.total, 10.01);
  assert.equal(allocation.beneficiary, 9.51);
  assert.equal(allocation.organizer, 0.5);
  assert.equal(allocation.beneficiaryMinor + allocation.organizerMinor, allocation.totalMinor);
});

test("whole-unit currencies conserve their exact entered amount", () => {
  for (const currency of ["id", "vi"] as const) {
    const allocation = previewPledgeAllocation("100000", currency, 8)!;
    assert.equal(allocation.beneficiary, 92000);
    assert.equal(allocation.organizer, 8000);
    assert.equal(allocation.beneficiaryPct + allocation.organizerPct, 100);
  }
});

test("half-up rounding conserves small pledges and fractional-cent boundaries", () => {
  const halfCent = previewPledgeAllocation("0.50", "en", 5)!;
  assert.equal(halfCent.organizer, 0.03);
  assert.equal(halfCent.beneficiary, 0.47);
  const tiny = previewPledgeAllocation("0.01", "tl", 8)!;
  assert.equal(tiny.organizer, 0);
  assert.equal(tiny.beneficiary, 0.01);
  for (const amount of ["0.01", "0.50", "10.01", "999.99", "000050.00"]) {
    for (const pct of [0, 5, 7, 8, 10]) {
      const allocation = previewPledgeAllocation(amount, "en", pct)!;
      assert.equal(allocation.beneficiaryMinor + allocation.organizerMinor, allocation.totalMinor);
    }
  }
});

test("nonrepresentable decimals are rejected instead of changing the typed total", () => {
  assert.equal(previewPledgeAllocation("1.005", "en", 5), null);
  assert.equal(previewPledgeAllocation("1.001", "tl", 5), null);
  assert.equal(previewPledgeAllocation("50000.5", "id", 5), null);
  assert.equal(previewPledgeAllocation("50000.1", "vi", 5), null);
});

test("invalid amounts and invalid proposals cannot produce an allocation", () => {
  for (const value of ["", " ", "0", "0.00", "-10", "1e3", "1.2.3", "Infinity", "10abc", "9007199254740992"]) {
    assert.equal(previewPledgeAllocation(value, "en", 5), null);
  }
  for (const pct of [-1, 11, 5.5, NaN, Infinity]) {
    assert.equal(previewPledgeAllocation("10", "en", pct), null);
  }
});

test("configured rates remain proposed and no additional fee is introduced", () => {
  const allocation = previewPledgeAllocation("50000", "id", 7)!;
  assert.equal(allocation.organizerPct, 7);
  assert.equal(allocation.beneficiaryPct, 93);
  assert.equal(allocation.organizer, 3500);
  assert.equal(allocation.beneficiary, 46500);
  assert.equal(allocation.beneficiaryMinor + allocation.organizerMinor, allocation.totalMinor);
});
