import test from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import { disasterError, disasterProposalId, formatStroops, parseDisasterAction, requireDisasterMembership } from "../lib/disaster.ts";

const [a, b, c, outsider] = Array.from({ length: 4 }, () => Keypair.random().publicKey());
const signers = [a, b, c];

test("D3 proposal retains exact PHP-to-stroop conversion", () => {
  const action = parseDisasterAction({ kind: "Disburse", recipient: ` ${a} `, money: { amount: "6.50", currency: "tl" } });
  assert.deepEqual(action, ["Disburse", a, 10_000_000n]);
  assert.equal(formatStroops(action[2]!), "1");
  assert.equal(formatStroops("10000001"), "1.0000001");
  assert.equal(formatStroops("0"), "0");
});

test("D3 rejects malformed, negative, zero, numeric, and oversized money", () => {
  for (const amount of ["0", "-1", "NaN", "Infinity", "1e3", "1,000", "1000000001", "0.00000000001", 6.5, null]) {
    assert.throws(() => parseDisasterAction({ kind: "Disburse", recipient: a, money: { amount, currency: "tl" } }));
  }
  assert.throws(() => parseDisasterAction({ kind: "Disburse", recipient: "bad", money: { amount: "1", currency: "tl" } }));
  assert.throws(() => parseDisasterAction({ kind: "set_signers", signers }));
  assert.throws(() => parseDisasterAction(null));
  assert.deepEqual(parseDisasterAction({ kind: "Pause" }), ["Pause"]);
  assert.deepEqual(parseDisasterAction({ kind: "Unpause" }), ["Unpause"]);
});

test("D3 identifiers never pass through floating-point numbers", () => {
  assert.equal(disasterProposalId("9007199254740993"), 9007199254740993n);
  assert.equal(disasterProposalId("18446744073709551615"), 18446744073709551615n);
  assert.equal(disasterProposalId("0", true), 0n);
  for (const id of ["0", "-1", "1.5", "1e3", "18446744073709551616", 1, {}, null])
    assert.throws(() => disasterProposalId(id));
});

test("D3 privileged membership rejects demo and non-signer wallets", () => {
  for (const signer of signers) {
    assert.doesNotThrow(() => requireDisasterMembership(signer, signers, false));
    assert.throws(() => requireDisasterMembership(signer, signers, true));
  }
  assert.throws(() => requireDisasterMembership(outsider, signers, false));
  assert.throws(() => requireDisasterMembership("", signers, false));
});

test("D3 actionable contract errors and uncertain confirmations stay distinct", () => {
  assert.match(disasterError("simulation Error(Contract, #13)"), /rolling 24-hour cap/);
  assert.match(disasterError("simulation Error(Contract, #11)"), /waiting period/);
  assert.match(disasterError("timeout"), /Refresh the proposal before retrying/);
});
