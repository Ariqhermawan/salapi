import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { circleDonationAmount, circleDonationTerms, parseCircleDonation } from "../lib/circles/donation.ts";
import type { CircleTestnetCampaignResult } from "../lib/circles/testnet.ts";

const ownerId = "11111111-1111-4111-8111-111111111111";
const hash = "a".repeat(64);
const ready = { ok: true, available: true, donationOpen: true, status: "ready", network: "testnet", circleId: "tino-relief", contractId: "configured-d4", qaLabel: "QA Testnet · fictional cause",
  mapping: { campaignId: "8", creatorWallet: "creator", beneficiaryWallet: "beneficiary", approverWallets: ["a", "b", "c"], creatorCutBps: 0, fundingDeadline: "2000", reviewDeadline: "3000" },
  campaign: {}, now: "1000" } as CircleTestnetCampaignResult;
const input = () => ({ circleId: "tino-relief", expectedOwnerId: ownerId, termsKey: circleDonationTerms(ready)!, amount: "1.0000001" });

test("native donation units are exact and reject dollar objects/zero/overprecision", () => {
  assert.equal(circleDonationAmount("1.0000001"), 10000001n);
  for (const value of ["0", "-1", "1.00000001", "1e2", "$1", { currency: "USD", amount: "1" }]) assert.equal(circleDonationAmount(value), null);
  assert.ok(parseCircleDonation(input()));
  assert.equal(parseCircleDonation({ ...input(), expectedOwnerId: "guest" }), null);
  assert.equal(parseCircleDonation({ ...input(), beneficiary: "forged" }), null);
});
test("review key binds contract, campaign, recipients, reviewers, cut and deadlines, not totals", () => {
  const key = circleDonationTerms(ready)!;
  for (const field of ["campaignId", "creatorWallet", "beneficiaryWallet", "approverWallets", "creatorCutBps", "fundingDeadline", "reviewDeadline"]) {
    const changed = structuredClone(ready);
    if (changed.ok) (changed.mapping as unknown as Record<string, unknown>)[field] = `changed-${field}`;
    assert.notEqual(circleDonationTerms(changed), key);
  }
  assert.notEqual(circleDonationTerms({ ...ready, contractId: "other" }), key);
  assert.notEqual(circleDonationTerms({ ...ready, circleId: "other" }), key);
});

const compile = ts.transpileModule(readFileSync(new URL("../app/circle-donation-actions.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
type Options = { preview?: boolean; identity?: unknown; identityAfter?: unknown; mapping?: CircleTestnetCampaignResult; wallet?: string | null; walletError?: boolean; signer?: { publicKey: string; secret: string; demo: boolean }; signerError?: boolean; outcome?: unknown; throws?: boolean };
function setup(options: Options = {}) {
  const calls = { identity: 0, mapping: 0, wallet: 0, signer: 0, invokes: [] as unknown[][] };
  const exports = {} as { donateCircleTestnet(value: unknown): Promise<{ ok: boolean; pending?: boolean; hash?: string; ownerId?: string; error?: string }> };
  const db = { select() { return db; }, eq(_column: string, value: string) { assert.equal(value, ownerId); return db; }, async maybeSingle() { calls.wallet++; return { error: options.walletError ? {} : null, data: options.wallet === null ? null : { public_key: options.wallet ?? "saved-wallet" } }; } };
  runInNewContext(compile, { exports, require(name: string) {
    if (name === "@/lib/local-preview") return { isLocalPreview: options.preview ?? false };
    if (name === "@/lib/circles/donation") return { circleDonationAmount, circleDonationTerms, parseCircleDonation };
    if (name === "@/lib/campaign") return { campaignError: () => "Definitive Testnet failure" };
    if (name === "@/lib/server/circlesSignup") return { resolveCirclesSignupIdentity: async () => {
      calls.identity++; return calls.identity > 1 && options.identityAfter ? options.identityAfter : options.identity ?? { status: "verified", ownerId };
    } };
    if (name === "@/lib/server/circlesTestnet") return { readCircleTestnetCampaign: async (slug: string) => { calls.mapping++; assert.equal(slug, "tino-relief"); return options.mapping ?? ready; } };
    if (name === "@/lib/supabase/admin") return { createSupabaseAdmin: () => ({ from(table: string) { assert.equal(table, "wallets"); return db; } }) };
    if (name === "@/lib/server/userWallet") return { getAuthenticatedSigner: async () => { calls.signer++; if (options.signerError) throw Error("Auth failed"); return options.signer ?? { publicKey: "saved-wallet", secret: "isolated-not-a-secret", demo: false }; } };
    if (name === "@/lib/server/stellar") return { sc: { u64: (v: unknown) => v, addr: (v: unknown) => v, i128: (v: unknown) => v }, txLink: (h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`,
      invokeAs: async (...args: unknown[]) => { calls.invokes.push(args); if (options.throws) throw Error("Lost result"); return options.outcome ?? { ok: true, hash }; } };
    throw Error(`Unexpected dependency ${name}`);
  } });
  return { calls, run: exports.donateCircleTestnet };
}

for (const status of ["guest", "unavailable", "unverified"]) test(`${status} is rejected before wallet or submission`, async () => {
  const s = setup({ identity: { status } }); assert.equal((await s.run(input())).ok, false);
  assert.equal(s.calls.mapping, 0); assert.equal(s.calls.signer, 0); assert.equal(s.calls.invokes.length, 0);
});
test("local preview and malformed input do not read auth or chain", async () => {
  const s = setup({ preview: true }); assert.equal((await s.run(input())).ok, false); assert.equal(s.calls.identity, 0);
  const invalid = setup(); assert.equal((await invalid.run({ ...input(), amount: "$50" })).ok, false); assert.equal(invalid.calls.identity, 0);
});
test("changed account at first check is rejected", async () => {
  const s = setup({ identity: { status: "verified", ownerId: "other" } }); assert.equal((await s.run(input())).ok, false); assert.equal(s.calls.invokes.length, 0);
});
test("closed, missing and drifted mappings cannot sign", async () => {
  for (const mapping of [{ ...ready, donationOpen: false }, { ...ready, contractId: "wrong" }, { ...ready, ok: false }] as CircleTestnetCampaignResult[]) {
    const s = setup({ mapping }); assert.equal((await s.run(input())).ok, false); assert.equal(s.calls.signer, 0); assert.equal(s.calls.invokes.length, 0);
  }
});
test("wallet absence/error, demo signer, signer failure and wallet mismatch fail closed", async () => {
  for (const options of [{ wallet: null }, { walletError: true }, { signerError: true }, { signer: { publicKey: "saved-wallet", secret: "test", demo: true } }, { signer: { publicKey: "other-wallet", secret: "test", demo: false } }]) {
    const s = setup(options); assert.equal((await s.run(input())).ok, false); assert.equal(s.calls.invokes.length, 0);
  }
});
test("account change immediately before invocation cannot send", async () => {
  const s = setup({ identityAfter: { status: "verified", ownerId: "different" } }); assert.equal((await s.run(input())).ok, false); assert.equal(s.calls.invokes.length, 0);
});
test("exact donation invokes once with saved wallet and reviewed native stroops", async () => {
  const s = setup(); const r = await s.run(input()); assert.equal(r.ok, true); assert.equal(r.ownerId, ownerId);
  assert.deepEqual(structuredClone(s.calls.invokes), [["isolated-not-a-secret", "configured-d4", "donate", [8n, "saved-wallet", 10000001n]]]);
});
test("pending and unexpectedly lost invocation result stay unresolved, never resubmit", async () => {
  const s = setup({ outcome: { ok: false, pending: true, hash, error: "Unknown" } }); const r = await s.run(input());
  assert.equal(r.ok, false); assert.equal(r.pending, true); assert.equal(r.hash, hash); assert.equal(s.calls.invokes.length, 1);
  const lost = setup({ throws: true }); const result = await lost.run(input()); assert.equal(result.pending, true); assert.equal(result.ok, false); assert.equal(lost.calls.invokes.length, 1);
});
