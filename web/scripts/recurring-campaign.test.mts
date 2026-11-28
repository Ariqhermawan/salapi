import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Address, Keypair, nativeToScVal, StrKey, xdr } from "@stellar/stellar-sdk";
import { campaignStruct } from "../lib/campaign.ts";
import { creatorCutBps } from "../lib/campaign-money.ts";
import { parseRecurringCampaign, parseRecurringCreateInput, parseXlmStroops, recurringCampaignId,
  recurringConfigArgs, recurringProofFileHash, recurringStageArgs, recurringStageRefundable } from "../lib/recurring-campaign.ts";
import { formatStroops } from "../lib/format-stroops.ts";

const contractId = "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU";
const tokenId = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const wallet = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 70));
const beneficiary = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 71));
const reviewers = [72, 73, 74].map(value => Keypair.fromRawEd25519Seed(Buffer.alloc(32, value)));

function rawCampaign(state: string[] = ["Funding"]) {
  return {
    id: 1n, title: "Relief by stages", state,
    config: { creator: wallet.publicKey(), beneficiary: beneficiary.publicKey(), token: tokenId,
      creator_cut_bps: 500, funding_deadline: 2000n, review_deadline: 5000n,
      approvers: reviewers.map(item => item.publicKey()) },
    total: 0n, escrow: 0n, current_stage: 0, proof_hash: null, proof_url: "", approvals: [],
    stages: [{ amount: 10_000_000n, due_date: 2000n, funded: 0n, released: false },
      { amount: 20_000_000n, due_date: 3000n, funded: 0n, released: false }],
  };
}

test("recurring inputs enforce XLM precision, ordered stages, and only unspent stage refunds", () => {
  assert.equal(parseXlmStroops("1.2345678"), 12_345_678n);
  assert.throws(() => parseXlmStroops("1.00000001"));
  assert.throws(() => parseXlmStroops("0"));
  assert.equal(recurringCampaignId("r9"), 9n);
  assert.throws(() => recurringCampaignId("r0"));
  const parsed = parseRecurringCreateInput({ title: " Relief ", beneficiary: beneficiary.publicKey(), creatorCut: "5",
    fundingDeadline: "2000", reviewDeadline: "5000", approvers: reviewers.map(item => item.publicKey()),
    stages: [{ amountStroops: "10000000", dueDate: "2000" }, { amountStroops: "20000000", dueDate: "3000" }] }, 1000n);
  assert.equal(parsed.title, "Relief");
  assert.equal(parsed.cutBps, creatorCutBps("5"));
  assert.deepEqual(parsed.stages.map(stage => stage.amount), [10_000_000n, 20_000_000n]);
  assert.throws(() => parseRecurringCreateInput({ title: "Bad", beneficiary: beneficiary.publicKey(), creatorCut: "0",
    fundingDeadline: "2000", reviewDeadline: "5000", approvers: reviewers.map(item => item.publicKey()),
    stages: [{ amountStroops: "10000000", dueDate: "3000" }, { amountStroops: "20000000", dueDate: "2500" }] }, 1000n));
  assert.equal(recurringStageRefundable({ amount: "600", stages: ["100", "200", "300"], refunded: false }, 1), 500n);
  assert.equal(recurringStageRefundable({ amount: "600", stages: ["100", "200", "300"], refunded: false }, 3), 0n);
});

test("recurring proof hashing is local, exact SHA-256, and bounded to 10 MB", async () => {
  assert.equal(await recurringProofFileHash(new Blob(["hello"])), "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  await assert.rejects(recurringProofFileHash(new Blob([])), /Proof file is empty/);
  await assert.rejects(recurringProofFileHash({ size: 10 * 1024 * 1024 + 1, arrayBuffer: async () => new ArrayBuffer(0) } as Blob), /exceeds 10 MB/);
});

test("recurring ledger projection rejects inconsistent stage and approval data", () => {
  const parsed = parseRecurringCampaign(rawCampaign());
  assert.equal(parsed.id, "1");
  assert.equal(parsed.stages.length, 2);
  assert.equal(parsed.contribution, null);
  const badStage = rawCampaign();
  badStage.stages[0].funded = 1n;
  assert.throws(() => parseRecurringCampaign(badStage));
  const badReview = { ...rawCampaign(), approvals: [wallet.publicKey()] };
  assert.throws(() => parseRecurringCampaign(badReview));
  const released = rawCampaign(["Released"]);
  assert.throws(() => parseRecurringCampaign(released));
});

function actionHarness() {
  let campaign = rawCampaign();
  let contribution: { amount: bigint; stages: bigint[]; refunded: boolean } = { amount: 0n, stages: [0n, 0n], refunded: false };
  let clock = 1000n;
  let savedIntent: Record<string, unknown> | null = null;
  const calls: { prepared: { contractId: string; method: string; args: xdr.ScVal[] }[]; submitted: { contractId: string; method: string; args: xdr.ScVal[] }[] } = { prepared: [], submitted: [] };
  const intentId = "00000000-0000-4000-8000-000000000001";
  const dependencies: Record<string, unknown> = {
    "@stellar/stellar-sdk": { StrKey },
    "@/lib/server/stellar": {
      CONTRACTS: { tokenXlmSac: tokenId },
      readContract: async (_id: string, method: string) => method === "version" ? 5 : method === "token" ? tokenId
        : method === "clock" ? clock : method === "campaign" ? campaign : method === "contribution"
          ? contribution : method === "campaigns" ? [] : null,
      sc: { addr: (value: string) => new Address(value).toScVal(), i128: (value: bigint) => nativeToScVal(value, { type: "i128" }),
        u32: (value: number) => nativeToScVal(value, { type: "u32" }), u64: (value: bigint) => nativeToScVal(value, { type: "u64" }),
        str: (value: string) => nativeToScVal(value, { type: "string" }), bytes: (value: Uint8Array) => xdr.ScVal.scvBytes(Buffer.from(value)) },
      txLink: (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`,
      prepareContractCallAs: async (_source: string, id: string, method: string, args: xdr.ScVal[]) => {
        calls.prepared.push({ contractId: id, method, args }); return { transactionXdr: "prepared-xdr", feeStroops: "100" };
      },
      submitPreparedContractCallAs: async (_secret: string, _envelope: string, expected: { contractId: string; method: string; args: xdr.ScVal[] }) => {
        calls.submitted.push(expected); return { ok: true, hash: "a".repeat(64), value: "1" };
      },
    },
    "@/lib/server/userWallet": { currentWalletPublicKey: async () => wallet.publicKey(),
      getAuthenticatedSigner: async () => ({ demo: false, publicKey: wallet.publicKey(), secret: wallet.secret() }) },
    "@/lib/campaign-money": { campaignSplit: (amount: bigint, bps: bigint) => {
      const creator = amount / 10_000n * bps + amount % 10_000n * bps / 10_000n;
      return { creator, beneficiary: amount - creator };
    } },
    "@/lib/format-stroops": { formatStroops },
    "@/lib/local-preview": { isLocalPreview: false },
    "@/lib/campaign": { campaignError: (error: unknown) => error instanceof Error ? error.message : String(error), campaignStruct },
    "@/lib/recurring-campaign": { parseRecurringCampaign, parseRecurringCreateInput, parseRecurringContribution: (value: unknown) => value,
      recurringCampaignId, recurringCampaignNumericId: (input: string) => BigInt(input), recurringConfigArgs,
      recurringStageArgs, recurringStageRefundable: (value: { stages: string[] }, stage: number) => value.stages.slice(stage).reduce((total, item) => total + BigInt(item), 0n),
      proofHash: (value: string) => value.toLowerCase(), publicProofUrl: (value: string) => new URL(value).href },
    "@/lib/server/confirmationIntent": {
      getConfirmationWallet: async () => ({ ownerId: "00000000-0000-4000-8000-000000000002", address: wallet.publicKey() }),
      createConfirmationIntent: async (input: Record<string, unknown>) => {
        savedIntent = { ...input, id: intentId, ownerId: "00000000-0000-4000-8000-000000000002", walletAddress: wallet.publicKey(), expiresAt: "2099-01-01T00:00:00.000Z" };
        return savedIntent;
      },
      consumeConfirmationIntent: async (_id: string, action: string) => {
        if (!savedIntent || savedIntent.action !== action) throw new Error("Confirmation expired or changed");
        return savedIntent;
      },
      cancelConfirmationIntent: async () => true,
    },
  };
  const source = readFileSync(new URL("../app/recurring-campaign-actions.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const target = { exports: {} as Record<string, (...args: unknown[]) => Promise<unknown>> };
  runInNewContext(code, { module: target, exports: target.exports, Buffer, TextEncoder, URL, Date,
    process: { env: { RECURRING_CAMPAIGN_CONTRACT: contractId } },
    require(name: string) { if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`); return dependencies[name]; },
  });
  return { api: target.exports, calls, setCampaign(value: ReturnType<typeof rawCampaign>) { campaign = value; },
    setContribution(value: typeof contribution) { contribution = value; },
    reorderIntentSnapshot() {
      if (!savedIntent) throw new Error("No saved intent");
      const payload = savedIntent.payload as Record<string, unknown>;
      const snapshot = payload.snapshot as { stages: Record<string, unknown>[] };
      snapshot.stages = snapshot.stages.map(stage => ({ released: stage.released, due_date: stage.due_date,
        funded: stage.funded, amount: stage.amount }));
      if (payload.contribution && typeof payload.contribution === "object") {
        const saved = payload.contribution as Record<string, unknown>;
        payload.contribution = { refunded: saved.refunded, stages: saved.stages, amount: saved.amount };
      }
    },
    setClock(value: bigint) { clock = value; }, getIntent: () => savedIntent, intentId };
}

test("recurring create confirmation binds staged terms to the exact prepared call", async () => {
  const { api, calls, intentId, getIntent } = actionHarness();
  const input = { title: "Relief by stages", beneficiary: beneficiary.publicKey(), creatorCut: "5",
    fundingDeadline: "2000", reviewDeadline: "5000", approvers: reviewers.map(item => item.publicKey()),
    stages: [{ amountStroops: "10000000", dueDate: "2000" }, { amountStroops: "20000000", dueDate: "3000" }] };
  const prepared = await api.prepareRecurringCampaignConfirmation({ kind: "create", input }) as Record<string, unknown>;
  assert.equal(prepared.ok, true);
  assert.equal(prepared.action, "recurring_campaign_create");
  assert.equal(calls.prepared[0].method, "create");
  assert.equal(calls.submitted.length, 0);
  assert.equal((getIntent()?.payload as Record<string, unknown>).title, input.title);
  const result = await api.recurringCampaignCreate(intentId) as Record<string, unknown>;
  assert.equal(result.ok, true);
  assert.equal(calls.submitted[0].method, "create");
  assert.deepEqual(calls.submitted[0].args.map(value => value.toXDR("base64")), calls.prepared[0].args.map(value => value.toXDR("base64")));
});

test("recurring detail state keeps the public r-prefixed campaign ID", async () => {
  const { api } = actionHarness();
  const result = await api.recurringCampaignState("r1", "0") as Record<string, unknown>;
  assert.equal(result.ok, true);
  assert.equal((result.campaigns as { id: string }[])[0].id, "1");
});

test("recurring donation is not submitted after the campaign changes or its funding deadline passes", async () => {
  const changed = actionHarness();
  const prepared = await changed.api.prepareRecurringCampaignConfirmation({ kind: "donate", campaignId: "r1", amountStroops: "1000000" }) as Record<string, unknown>;
  assert.equal(prepared.ok, true);
  changed.setCampaign(rawCampaign(["Scheduled"]));
  assert.equal((await changed.api.recurringCampaignDonate(changed.intentId) as Record<string, unknown>).ok, false);
  assert.equal(changed.calls.submitted.length, 0);

  const expired = actionHarness();
  const second = await expired.api.prepareRecurringCampaignConfirmation({ kind: "donate", campaignId: "r1", amountStroops: "1000000" }) as Record<string, unknown>;
  assert.equal(second.ok, true);
  expired.setClock(2000n);
  assert.equal((await expired.api.recurringCampaignDonate(expired.intentId) as Record<string, unknown>).ok, false);
  assert.equal(expired.calls.submitted.length, 0);
});

test("recurring confirmation survives JSONB object key reordering and still binds current state", async () => {
  const donation = actionHarness();
  const prepared = await donation.api.prepareRecurringCampaignConfirmation({ kind: "donate", campaignId: "r1", amountStroops: "1000000" }) as Record<string, unknown>;
  assert.equal(prepared.ok, true);
  donation.reorderIntentSnapshot();
  assert.equal((await donation.api.recurringCampaignDonate(donation.intentId) as Record<string, unknown>).ok, true);
  assert.equal(donation.calls.submitted[0].method, "donate");

  const refund = actionHarness();
  const refundable = rawCampaign(["Refundable"]);
  refundable.current_stage = 1;
  refundable.total = 15_000_000n;
  refundable.escrow = 5_000_000n;
  refundable.stages[0].funded = 10_000_000n;
  refundable.stages[0].released = true;
  refundable.stages[1].funded = 5_000_000n;
  refund.setCampaign(refundable);
  refund.setClock(6000n);
  refund.setContribution({ amount: 5_000_000n, stages: [0n, 5_000_000n], refunded: false });
  const preparedRefund = await refund.api.prepareRecurringCampaignConfirmation({ kind: "refund", campaignId: "r1" }) as Record<string, unknown>;
  assert.equal(preparedRefund.ok, true);
  refund.reorderIntentSnapshot();
  assert.equal((await refund.api.recurringCampaignRefund(refund.intentId) as Record<string, unknown>).ok, true);
  assert.equal(refund.calls.submitted[0].method, "refund");
});

test("recurring routes and confirmation persistence cover all seven actions", () => {
  const createPage = readFileSync(new URL("../app/create/page.tsx", import.meta.url), "utf8");
  const campaignsPage = readFileSync(new URL("../app/campaigns/page.tsx", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20261128120000_recurring_campaign_intents.sql", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../app/recurring-campaign-actions.ts", import.meta.url), "utf8");
  assert.match(createPage, /kind === "recurring"/);
  assert.match(campaignsPage, /campaignId\.startsWith\("r"\)/);
  for (const action of ["create", "donate", "submit_proof", "approve", "release", "refund", "close_empty"]) {
    assert.match(actions, new RegExp(`recurring_campaign_${action}`));
    assert.match(migration, new RegExp(`'recurring_campaign_${action}'`));
  }
});

test("D5 rules and public Testnet contract are discoverable from the app", () => {
  const screen = readFileSync(new URL("../components/screens/RecurringCampaignScreen.tsx", import.meta.url), "utf8");
  const transparency = readFileSync(new URL("../components/screens/TransparencyScreen.tsx", import.meta.url), "utf8");
  const docs = readFileSync(new URL("../app/docs/page.tsx", import.meta.url), "utf8");
  const contract = "CDI6V4XTDDDAVW5GLJE6JOZ4AZO3TWCUJ54ZWYOTQFUNX4HXIJVPKK24";
  assert.match(screen, /Verify D5 contract/);
  assert.match(screen, /file was not uploaded/);
  assert.match(screen, /type="file" accept="image\/\*,.pdf"/);
  assert.match(screen, /contract\/\$\{view\.contractId\}/);
  assert.ok(transparency.includes(contract));
  assert.match(transparency, /Recurring campaign rules, D5/);
  assert.match(transparency, /two approvals from its three configured reviewer wallets/);
  assert.match(transparency, /This local preview does not query or update D5/);
  assert.match(docs, /recurringCampaignId/);
  assert.match(docs, /Contributions fill scheduled payout stages in order/);
  assert.match(docs, /mode=recurring/);
});
