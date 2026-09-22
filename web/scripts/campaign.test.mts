import test from "node:test";
import assert from "node:assert/strict";
import { Keypair, nativeToScVal, scValToNative, Address } from "@stellar/stellar-sdk";
import { campaignAmount, campaignSplit, creatorCutBps } from "../lib/campaign-money.ts";
import { campaignId, campaignStruct, parseCampaignConfig, proofHash, publicProofUrl } from "../lib/campaign.ts";

test("D4 exact XLM/PHP boundary rejects rounding and malformed values", () => {
  assert.equal(campaignAmount({ amount: "6.50", currency: "tl" }), 10_000_000n);
  assert.equal(campaignAmount({ amount: "100.0000001", currency: "XLM" }), 1_000_000_001n);
  for (const amount of [0, "0", "-1", "1e3", "1.00000001", "NaN", "Infinity", "", "1,000"])
    assert.throws(() => campaignAmount({ amount, currency: "XLM" }));
  assert.throws(() => campaignAmount({ amount: "1", currency: "invalid" }));
  assert.throws(() => campaignAmount({ amount: "170141183460469231731687303715884.105728", currency: "XLM" }));
});
test("D4 exact creator share and split conserve every stroop", () => {
  assert.equal(creatorCutBps("0.01"), 1n); assert.equal(creatorCutBps("10.00"), 1000n);
  for (const value of ["10.01", "-1", "1.001", "1e0", 5]) assert.throws(() => creatorCutBps(value));
  for (const total of [0n, 1n, 10001n, 1_000_000_001n, (1n << 127n) - 1n]) {
    for (const bps of [0n, 1n, 500n, 1000n]) {
      const split = campaignSplit(total, bps);
      assert.equal(split.creator + split.beneficiary, total); assert.equal(split.creator, total * bps / 10000n);
    }
  }
});
test("D4 configuration and proof validation fail closed", () => {
  const approvers = Array.from({ length: 3 }, () => Keypair.random().publicKey());
  const input = { title: "Test", beneficiary: approvers[0], creatorCut: "5", fundingDeadline: "1100", reviewDeadline: "1200", approvers };
  assert.equal(parseCampaignConfig(input, 1000n).cutBps, 500n);
  for (const override of [{ approvers: approvers.slice(0, 2) }, { approvers: [approvers[0], approvers[0], approvers[1]] },
    { fundingDeadline: "1000" }, { reviewDeadline: "1100" }, { beneficiary: "bad" }, { title: "" }, { title: "🪙".repeat(31) }])
    assert.throws(() => parseCampaignConfig({ ...input, ...override }, 1000n));
  assert.equal(campaignId("9007199254740993"), 9007199254740993n);
  for (const v of ["0", "-1", "1.1", "18446744073709551616", 1]) assert.throws(() => campaignId(v));
  for (const v of ["0".repeat(64), "x".repeat(64), "a".repeat(63)]) assert.throws(() => proofHash(v));
  for (const v of ["javascript:alert(1)", "http://example.com", "https://user:password@example.com", "bad"]) assert.throws(() => publicProofUrl(v));
  assert.equal(proofHash("A".repeat(64)), "a".repeat(64));
});
test("D4 SDK map encoding retains typed addresses and integer amounts", () => {
  const account = Keypair.random().publicKey();
  const map = campaignStruct({ creator: new Address(account).toScVal(), amount: nativeToScVal(10000001n, { type: "i128" }) });
  for (const entry of map.map()!) assert.equal(entry.key().switch().name, "scvSymbol");
  assert.deepEqual(scValToNative(map), { amount: 10000001n, creator: account });
});
