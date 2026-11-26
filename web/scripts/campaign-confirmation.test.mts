import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Address, Keypair, nativeToScVal, rpc, scValToNative, StrKey, xdr } from "@stellar/stellar-sdk";
import { campaignError, campaignId, campaignStruct, proofHash, publicProofUrl } from "../lib/campaign.ts";
import { campaignSplit } from "../lib/campaign-money.ts";
import { formatStroops } from "../lib/format-stroops.ts";

const sender = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 41)).publicKey();
const beneficiary = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 42)).publicKey();
const approvers = [43, 44, 45].map(seed => Keypair.fromRawEd25519Seed(Buffer.alloc(32, seed)).publicKey());
const contractId = "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU";
const tokenId = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const intentId = "11111111-1111-4111-8111-111111111111";
const hash = "a".repeat(64);
type ActionResult = { ok: boolean; [key: string]: unknown };

function setup(options: { signer?: string; result?: { ok: boolean; pending?: boolean; hash?: string; error?: string } } = {}) {
  const calls = { reads: [] as string[], signers: 0, prepared: 0, submissions: 0,
    preparedMethod: "", preparedArgs: [] as xdr.ScVal[], submittedMethod: "", submittedArgs: [] as xdr.ScVal[],
    submittedXdr: "", consumedAction: "" };
  let state: [string] = ["Funding"];
  const campaignRaw = {
    id: 1n, title: "Emergency clinic", state,
    config: { creator: sender, beneficiary, token: tokenId, creator_cut_bps: 500,
      funding_deadline: 2000n, review_deadline: 3000n, approvers },
    total: 0n, escrow: 0n, approvals: [], proof_hash: null, proof_url: "",
  };
  let savedIntent: Record<string, unknown> | null = null;
  const sc = {
    addr: (value: string) => new Address(value).toScVal(),
    i128: (value: bigint) => nativeToScVal(value, { type: "i128" }),
    u32: (value: number) => nativeToScVal(value, { type: "u32" }),
    u64: (value: bigint | number) => nativeToScVal(BigInt(value), { type: "u64" }),
    str: (value: string) => nativeToScVal(value, { type: "string" }),
    bytes: (value: Uint8Array) => xdr.ScVal.scvBytes(Buffer.from(value)),
  };
  const code = ts.transpileModule(readFileSync(new URL("../app/campaign-actions.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const target = { exports: {} as Record<string, (...args: unknown[]) => Promise<ActionResult>> };
  const dependencies: Record<string, unknown> = {
    "@stellar/stellar-sdk": { rpc, scValToNative, StrKey },
    "@/lib/server/stellar": {
      CONTRACTS: { tokenXlmSac: tokenId, donationCampaign: contractId }, RPC_URL: "https://isolated.invalid",
      donationCampaignId: () => contractId, sc, txLink: (value: string) => `https://stellar.expert/explorer/testnet/tx/${value}`,
      readContract: async (_id: string, method: string) => {
        calls.reads.push(method);
        if (method === "version") return 4;
        if (method === "token") return tokenId;
        if (method === "clock") return 1000n;
        if (method === "campaign") return campaignRaw;
        throw new Error(`Unexpected contract read ${method}`);
      },
      prepareContractCallAs: async (_source: string, _id: string, method: string, args: xdr.ScVal[]) => {
        calls.prepared++; calls.preparedMethod = method; calls.preparedArgs = args;
        return { transactionXdr: "saved-campaign-xdr", feeStroops: "100", maxTime: "9999999999" };
      },
      submitPreparedContractCallAs: async (_secret: string, transactionXdr: string, expected: { method: string; args: xdr.ScVal[] }) => {
        calls.submissions++; calls.submittedXdr = transactionXdr; calls.submittedMethod = expected.method; calls.submittedArgs = expected.args;
        return options.result ?? { ok: false as const, pending: true as const, hash, error: "Unknown outcome" };
      },
    },
    "@/lib/server/userWallet": {
      currentWalletPublicKey: async () => sender,
      getAuthenticatedSigner: async (expectedOwnerId?: string) => {
        if (expectedOwnerId !== undefined && expectedOwnerId !== "00000000-0000-4000-8000-000000000001") throw new Error("Wrong confirmation owner");
        calls.signers++; return { publicKey: options.signer ?? sender, secret: "isolated-secret", demo: false };
      },
    },
    "@/lib/campaign-money": { campaignSplit },
    "@/lib/campaign": { campaignId, campaignError, campaignStruct, proofHash, publicProofUrl },
    "@/lib/local-preview": { isLocalPreview: false },
    "@/lib/server/circlesTestnet": { readCircleDiscoveryMappings: async () => [], circleDiscoveryLinks: () => ({}) },
    "@/lib/server/confirmationIntent": {
      getConfirmationWallet: async () => ({ ownerId: "00000000-0000-4000-8000-000000000001", address: sender }),
      createConfirmationIntent: async (input: Record<string, unknown>) => {
        savedIntent = { ...input, id: intentId, ownerId: "00000000-0000-4000-8000-000000000001", walletAddress: sender, expiresAt: "2099-01-01T00:00:00.000Z" };
        return savedIntent;
      },
      consumeConfirmationIntent: async (value: string, action: string) => {
        calls.consumedAction = action;
        if (value !== intentId || !savedIntent || savedIntent.action !== action) throw new Error("Confirmation expired or action changed");
        return savedIntent;
      },
      cancelConfirmationIntent: async () => true,
    },
    "@/lib/format-stroops": { formatStroops },
  };
  runInNewContext(code, { module: target, exports: target.exports, Buffer, TextEncoder, URL, Date,
    require(name: string) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return { api: target.exports, calls, changeState(value: string) { state = [value]; campaignRaw.state = state; } };
}

test("campaign donation review prepares the exact XDR and confirmation revalidates before submitting", async () => {
  const { api, calls } = setup();
  const prepared = await api.prepareCampaignConfirmation({ kind: "donate", campaignId: "1", amountStroops: "12500000" });
  assert.equal(prepared.ok, true); assert.equal(prepared.action, "campaign_donate");
  assert.match(String(prepared.summary), /Emergency clinic/); assert.equal(prepared.feeStroops, "100");
  assert.equal(calls.prepared, 1); assert.equal(calls.signers, 0); assert.equal(calls.submissions, 0);
  assert.equal(calls.preparedMethod, "donate");

  const result = await api.campaignDonate(intentId);
  assert.equal(result.ok, false); assert.equal(result.pending, true); assert.equal(result.hash, hash);
  assert.equal(calls.consumedAction, "campaign_donate"); assert.equal(calls.signers, 1);
  assert.equal(calls.submittedXdr, "saved-campaign-xdr"); assert.equal(calls.submittedMethod, "donate");
  assert.deepEqual(calls.submittedArgs.map(arg => arg.toXDR("base64")), calls.preparedArgs.map(arg => arg.toXDR("base64")));
});

test("campaign confirmation rejects a state change, wrong action and changed signing wallet", async () => {
  const changed = setup();
  const prepared = await changed.api.prepareCampaignConfirmation({ kind: "donate", campaignId: "1", amountStroops: "12500000" });
  assert.equal(prepared.ok, true);
  changed.changeState("PendingProof");
  assert.equal((await changed.api.campaignDonate(intentId)).ok, false);
  assert.equal(changed.calls.signers, 1); assert.equal(changed.calls.submissions, 0);

  const wrongAction = setup();
  const second = await wrongAction.api.prepareCampaignConfirmation({ kind: "donate", campaignId: "1", amountStroops: "12500000" });
  assert.equal(second.ok, true);
  assert.equal((await wrongAction.api.campaignRelease(intentId)).ok, false);
  assert.equal(wrongAction.calls.signers, 0); assert.equal(wrongAction.calls.submissions, 0);

  const wrongWallet = setup({ signer: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 46)).publicKey() });
  const third = await wrongWallet.api.prepareCampaignConfirmation({ kind: "donate", campaignId: "1", amountStroops: "12500000" });
  assert.equal(third.ok, true);
  assert.equal((await wrongWallet.api.campaignDonate(intentId)).ok, false);
  assert.equal(wrongWallet.calls.submissions, 0);
});
