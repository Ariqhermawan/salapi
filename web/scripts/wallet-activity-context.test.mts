import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as sdk from "@stellar/stellar-sdk";
import { activityContextHref, normalizeWalletActivity, type WalletActivityItem, type WalletActivityContext } from "../lib/wallet-activity.ts";

const wallet = sdk.StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7));
const other = sdk.StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 8));
const contract = (n: number) => sdk.StrKey.encodeContract(Buffer.alloc(32, n));
const configured = { campaign: contract(9), arisan: contract(10), disaster: contract(11), paluwagan: contract(12), savings: contract(13) };
const seed = [{ id: "ate-mei-dialysis", title: "Ate Mei needs dialysis - 12 sessions to stabilize" }];
const mapping = { circleId: seed[0].id, campaignId: "7", campaignTitle: `QA Circles: ${seed[0].id}`, creatorWallet: wallet, beneficiaryWallet: other,
  approverWallets: [20, 21, 22].map(n => sdk.StrKey.encodeEd25519PublicKey(Buffer.alloc(32, n))), creatorCutBps: 500, fundingDeadline: "1800000000", reviewDeadline: "1800000100" };
const validators = {} as { validatedCircleTestnetCampaign(raw: unknown, mappingArg: typeof mapping, token: string): unknown };
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/circles/testnet.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports: validators, Uint8Array, URL, TextEncoder, require: (name: string) => name === "@stellar/stellar-sdk" ? sdk : { SEED_CIRCLES: seed } });
const compiled = ts.transpileModule(readFileSync(new URL("../lib/server/walletActivityContext.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness(options: { fail?: boolean; wrongId?: boolean; gate?: Promise<void>; linked?: boolean; wrongConfig?: boolean } = {}) {
  const calls: { method: string; id: unknown }[] = [];
  let active = 0, maxActive = 0;
  class ReadOnlyRpc {
    constructor(url: string, config: { timeout: number }) { assert.equal(url, "https://soroban-testnet.stellar.org"); assert.ok(config.timeout > 0 && config.timeout <= 2000); }
    async simulateTransaction(tx: sdk.Transaction) {
      assert.equal(tx.signatures.length, 0);
      const op = tx.operations[0] as sdk.Operation.InvokeHostFunction;
      const call = op.func.invokeContract(), method = call.functionName().toString(), id = sdk.scValToNative(call.args()[0]);
      calls.push({ method, id }); active++; maxActive = Math.max(maxActive, active);
      if (options.gate) await options.gate;
      else await Promise.resolve(); active--;
      if (options.fail) throw Error("Title unavailable");
      const value = method === "campaign" ? { id: options.wrongId ? 99n : id, title: options.linked ? mapping.campaignTitle : "Dialysis - 12 sessions",
        config: { creator: options.wrongConfig ? other : wallet, beneficiary: other, token: contract(14), creator_cut_bps: 500, funding_deadline: 1800000000n, review_deadline: 1800000100n, approvers: mapping.approverWallets },
        state: ["Funding"], total: 100000000n, escrow: 100000000n, approvals: [], proof_hash: null, proof_url: "" } : { host: wallet, name: "ARIQ IMAM NONI" };
      return { result: { retval: sdk.nativeToScVal(value, { type: { config: [null, { creator_cut_bps: [null, "u32"] }] } }) } };
    }
  }
  const exports = {} as {
    activityContextFromRecord(item: WalletActivityItem, record: unknown, viewer: string, deployments?: typeof configured): WalletActivityContext | undefined;
    attachActivityContexts(items: WalletActivityItem[], records: unknown[], viewer: string): WalletActivityItem[];
    readActivityContextTitles(items: WalletActivityItem[], viewer: string): Promise<WalletActivityItem[]>;
  };
  runInNewContext(compiled, { exports, Buffer, setTimeout, clearTimeout, require(name: string) {
    if (name === "server-only") return {};
    if (name === "./circlesTestnet") return { readCircleDiscoveryMappings: async () => options.linked ? [mapping] : [] };
    if (name === "../circles/testnet") return validators;
    if (name === "../circles/seed") return { SEED_CIRCLES: seed };
    if (name === "@stellar/stellar-sdk") return { ...sdk, rpc: { Server: ReadOnlyRpc, Api: { isSimulationSuccess: (r: { result?: unknown }) => !!r.result } } };
    if (name === "./stellar") return { CONTRACTS: { tokenXlmSac: contract(14) }, RPC_URL: "https://soroban-testnet.stellar.org", donationCampaignId: () => configured.campaign, arisanRoomsId: () => configured.arisan,
      disasterId: () => configured.disaster, paluwaganId: () => configured.paluwagan, smartSavingsId: () => configured.savings };
    throw Error(`Unexpected context dependency: ${name}`);
  } });
  return { ...exports, calls, get maxActive() { return maxActive; } };
}
const sc = (value: unknown, type: string) => sdk.nativeToScVal(value, { type });
const addr = (value = wallet) => new sdk.Address(value).toScVal();
function receipt(target: string, method: string, args: sdk.xdr.ScVal[], direction: "sent" | "received" = "sent", source = wallet) {
  const tx = new sdk.TransactionBuilder(new sdk.Account(source, "1"), { networkPassphrase: sdk.Networks.TESTNET, fee: sdk.BASE_FEE })
    .addOperation(new sdk.Contract(target).call(method, ...args)).setTimeout(30).build();
  const hash = tx.hash().toString("hex");
  const record = { id: "100", paging_token: "100", transaction_hash: hash, transaction_successful: true, source_account: source,
    type: "invoke_host_function", created_at: "2026-10-08T05:35:12Z",
    transaction: { hash, successful: true, envelope_xdr: tx.toXDR() },
    asset_balance_changes: [{ asset_type: "native", type: "transfer", from: direction === "sent" ? wallet : target, to: direction === "sent" ? target : wallet, amount: "10.0000000" }] };
  return { record, item: normalizeWalletActivity([record], wallet)[0] };
}

test("successful D4 donation identifies its exact campaign without changing actual XLM", () => {
  const { record, item } = receipt(configured.campaign, "donate", [sc(7n, "u64"), addr(), sc(100000000n, "i128")]);
  const h = harness(), result = h.attachActivityContexts([item], [record], wallet)[0];
  assert.equal(result.context?.type, "campaign-donation"); assert.equal(result.context?.referenceId, "7");
  assert.equal(result.amountStroops, item.amountStroops); assert.equal(result.hash, item.hash);
  assert.equal(activityContextHref(result.context), "/campaigns?id=7"); assert.deepEqual(h.calls, []);
});

test("arisan winnings are actual received funds from finalize_draw, including another caller", () => {
  const { record, item } = receipt(configured.arisan, "finalize_draw", [sc(9, "u32"), addr(other)], "received", other);
  const context = harness().activityContextFromRecord(item, record, wallet);
  assert.equal(context?.type, "arisan-win"); assert.equal(context?.referenceId, "9"); assert.equal(activityContextHref(context), "/arisan/9");
});

test("refunds never appear as arisan winnings or campaign donations", () => {
  for (const method of ["leave_room", "cancel_room", "emergency_dissolve"]) {
    const { record, item } = receipt(configured.arisan, method, [sc(9, "u32"), addr()], "received");
    assert.equal(harness().activityContextFromRecord(item, record, wallet)?.type, "arisan-refund");
  }
  const { record, item } = receipt(configured.campaign, "refund", [sc(7n, "u64"), addr()], "received");
  assert.equal(harness().activityContextFromRecord(item, record, wallet)?.type, "campaign-refund");
});

test("Disaster Vault contribution is native XLM with a separate pool purpose", () => {
  const { record, item } = receipt(configured.disaster, "contribute", [addr(), sc(100000000n, "i128")]);
  const context = harness().activityContextFromRecord(item, record, wallet);
  assert.equal(context?.type, "disaster-contribution"); assert.equal(activityContextHref(context), "/transparency");
});

test("unknown contracts, calls, wrong asset, amount, source, participant, failed receipt and hash mismatch never invent a purpose", () => {
  const h = harness(), { record, item } = receipt(configured.campaign, "donate", [sc(7n, "u64"), addr(), sc(100000000n, "i128")]);
  for (const broken of [{ ...record, transaction_successful: false }, { ...record, source_account: other }, { ...record, transaction_hash: "b".repeat(64) },
    { ...record, transaction: { ...record.transaction, successful: false } }, { ...record, transaction: { ...record.transaction, envelope_xdr: "bad" } }]) assert.equal(h.activityContextFromRecord(item, broken, wallet), undefined);
  assert.equal(h.activityContextFromRecord({ ...item, amountStroops: "1" }, record, wallet), undefined);
  assert.equal(h.activityContextFromRecord({ ...item, direction: "received" }, record, wallet), undefined);
  assert.equal(h.activityContextFromRecord(item, record, other), undefined);
  assert.equal(h.activityContextFromRecord(item, record, wallet, { ...configured, campaign: contract(19) }), undefined);
  const unknown = receipt(configured.arisan, "withdraw", [sc(9, "u32"), addr()], "received");
  assert.equal(h.activityContextFromRecord(unknown.item, unknown.record, wallet), undefined);
  const wrong = receipt(configured.campaign, "donate", [sc(7n, "u64"), addr(other), sc(100000000n, "i128")]);
  assert.equal(h.activityContextFromRecord(wrong.item, wrong.record, wallet), undefined);
});

test("optional title reads are parallel, unique, unsigned and bind campaign IDs; missing titles preserve movements", async () => {
  const h = harness();
  const items = [7, 8, 9].map(n => { const fixture = receipt(configured.campaign, "donate", [sc(BigInt(n), "u64"), addr(), sc(100000000n, "i128")]); return h.attachActivityContexts([fixture.item], [fixture.record], wallet)[0]; });
  const room = receipt(configured.arisan, "finalize_draw", [sc(9, "u32"), addr()], "received");
  const all = [...items, items[0], h.attachActivityContexts([room.item], [room.record], wallet)[0]];
  const enriched = await h.readActivityContextTitles(all, wallet);
  assert.equal(h.calls.length, 4); assert.equal(h.maxActive, 4);
  assert.equal(enriched[0].context?.title, "Dialysis - 12 sessions"); assert.equal(enriched.at(-1)?.context?.title, "ARIQ IMAM NONI");
  for (const fail of [{ fail: true }, { wrongId: true }]) {
    const missing = await harness(fail).readActivityContextTitles([items[0]], wallet);
    assert.equal(missing[0].amountStroops, items[0].amountStroops); assert.equal(missing[0].context?.referenceId, "7"); assert.equal(missing[0].context?.title, null);
  }
});

test("internal purpose links cannot inject URLs or query parameters", () => {
  for (const id of ["https://evil.test", "7&redirect=evil", "0", "01", "1/../../settings"]) assert.equal(activityContextHref({ type: "campaign-donation", referenceId: id, contractId: configured.campaign, title: null }), "/campaigns");
});

test("friendly fictional cause title and story link require the full reviewed mapping, not title inference", async () => {
  for (const wrongConfig of [false, true]) {
    const h = harness({ linked: true, wrongConfig });
    const { item, record } = receipt(configured.campaign, "donate", [sc(7n, "u64"), addr(), sc(100000000n, "i128")]);
    const result = (await h.readActivityContextTitles(h.attachActivityContexts([item], [record], wallet), wallet))[0];
    if (wrongConfig) {
      assert.equal(result.context?.circleId, undefined); assert.equal(result.context?.title, mapping.campaignTitle);
      assert.equal(activityContextHref(result.context), "/campaigns?id=7");
    } else {
      assert.equal(result.context?.title, `QA · ${seed[0].title}`); assert.equal(activityContextHref(result.context), "/circles/ate-mei-dialysis");
    }
  }
});
