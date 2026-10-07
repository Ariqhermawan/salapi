import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as sdk from "@stellar/stellar-sdk";
import * as domain from "../lib/arisan-funding.ts";
import * as feePolicy from "../lib/arisan-funding-fees.ts";
import { arisanRoomPage } from "../lib/arisan-list.ts";

const pair = sdk.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 71));
const otherPair = sdk.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 72));
const wallet = pair.publicKey(), other = otherPair.publicKey();
const contractId = sdk.StrKey.encodeContract(Buffer.alloc(32, 73));
const legacy = sdk.StrKey.encodeContract(Buffer.alloc(32, 74));
const nativeSac = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const now = 1_800_000_000;
type FixtureOptions = { method?: string; contract?: string; creator?: string; source?: string; network?: string;
  code?: string; name?: string; memberTarget?: number; share?: bigint; cadence?: string; deadline?: bigint;
  args?: sdk.xdr.ScVal[]; operationSource?: string; extraOperation?: boolean; feeBump?: boolean;
  status?: "SUCCESS" | "NOT_FOUND" | "FAILED"; wrongResult?: boolean; ledger?: number; wrongReceiptHash?: boolean };
function fixture(options: FixtureOptions = {}) {
  const target = options.contract ?? contractId;
  const args = options.args ?? [new sdk.Address(options.creator ?? wallet).toScVal(),
    sdk.nativeToScVal(options.code ?? "FAM234", { type: "symbol" }), sdk.nativeToScVal(options.name ?? "Recovery room", { type: "string" }),
    sdk.nativeToScVal(options.memberTarget ?? 3, { type: "u32" }), sdk.nativeToScVal(options.share ?? 10_000_000n, { type: "i128" }),
    sdk.xdr.ScVal.scvVec([sdk.nativeToScVal(options.cadence ?? "Weekly", { type: "symbol" })]),
    sdk.nativeToScVal(options.deadline ?? BigInt(now + 86400), { type: "u64" })];
  let operation = new sdk.Contract(target).call(options.method ?? "create_installment_room", ...args);
  if (options.operationSource) operation = sdk.Operation.invokeHostFunction({
    func: operation.body().invokeHostFunctionOp().hostFunction(), source: options.operationSource });
  const builder = new sdk.TransactionBuilder(new sdk.Account(options.source ?? wallet, "1"), {
    fee: "100", networkPassphrase: options.network ?? sdk.Networks.TESTNET }).addOperation(operation);
  if (options.extraOperation) builder.addOperation(new sdk.Contract(target).call("room_count"));
  const tx = builder.setTimeout(30).build(); tx.sign(pair);
  const outer = options.feeBump ? sdk.TransactionBuilder.buildFeeBumpTransaction(otherPair, "200", tx, sdk.Networks.TESTNET) : tx;
  if (options.feeBump) outer.sign(otherPair);
  const operationResult = sdk.xdr.OperationResult.opInner(sdk.xdr.OperationResultTr.invokeHostFunction(
    sdk.xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(Buffer.alloc(32))));
  const success = sdk.xdr.TransactionResultResult.txSuccess([operationResult]);
  const result = options.wrongResult ? sdk.xdr.TransactionResultResult.txFailed([])
    : options.feeBump ? sdk.xdr.TransactionResultResult.txFeeBumpInnerSuccess(new sdk.xdr.InnerTransactionResultPair({
      transactionHash: tx.hash(), result: new sdk.xdr.InnerTransactionResult({ feeCharged: sdk.xdr.Int64.fromString("100"),
        result: sdk.xdr.InnerTransactionResultResult.txSuccess([operationResult]), ext: new sdk.xdr.InnerTransactionResultExt(0) }),
    })) : success;
  const hash = outer.hash().toString("hex");
  const response = { status: options.status ?? "SUCCESS", txHash: options.wrongReceiptHash ? "b".repeat(64) : hash,
    ledger: options.ledger ?? 99, latestLedger: 100, latestLedgerCloseTime: now, oldestLedger: 1, oldestLedgerCloseTime: now - 100,
    createdAt: now, applicationOrder: 1, feeBump: options.feeBump ?? false,
    envelopeXdr: outer.toEnvelope(), resultXdr: new sdk.xdr.TransactionResult({ feeCharged: sdk.xdr.Int64.fromString("100"),
      result, ext: new sdk.xdr.TransactionResultExt(0) }),
  } as unknown as sdk.rpc.Api.GetTransactionResponse;
  return { hash, response, args };
}
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const receiptCode = compile("../lib/server/arisanFundingReceipt.ts");
const actionsCode = compile("../app/arisan-funding-actions.ts");
function load<T>(code: string, dependencies: Record<string, unknown>, env: Record<string, string> = {}): T {
  const sandboxModule = { exports: {} as T };
  runInNewContext(code, { module: sandboxModule, exports: sandboxModule.exports, Buffer,
    process: { env }, Date: class extends Date { static now() { return now * 1000; } },
    require(name: string) { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
    fetch() { throw new Error("Real transport is forbidden in isolated recovery tests."); } });
  return sandboxModule.exports;
}
type Options = { receipt?: ReturnType<typeof fixture>; authenticated?: boolean; owner?: string; authSequence?: string[];
  rpcThrows?: boolean; nullReceipt?: boolean; preview?: boolean; configured?: string; token?: string;
  core?: Record<string, unknown>; roomReadThrows?: boolean; funding?: Record<string, unknown>; resolvedId?: unknown };
function setup(options: Options = {}) {
  const receipt = options.receipt ?? fixture();
  const calls = { auth: 0, rpc: 0, signers: 0, submits: 0, reads: [] as string[] };
  const decoder = load<{ readArisanFundingReceipt(hash: string): Promise<sdk.rpc.Api.GetTransactionResponse | null>;
    verifyArisanFundingCreateReceipt(response: sdk.rpc.Api.GetTransactionResponse | null, hash: string, contract: string, owner: string): unknown }>(receiptCode, {
    "server-only": {}, "@/lib/arisan-funding": domain, "@/lib/server/stellar": { RPC_URL: "https://testnet.invalid" },
    "@stellar/stellar-sdk": { ...sdk, rpc: { ...sdk.rpc, Server: class {
      constructor(url: string, config: unknown) { assert.equal(url, "https://testnet.invalid"); assert.ok(config); }
      async getTransaction(hash: string) { calls.rpc++; assert.equal(hash, receipt.hash);
        if (options.rpcThrows) throw new Error("PRIVATE_PROVIDER_ERROR"); return options.nullReceipt ? null : receipt.response; }
    } } },
  });
  const api = load<{ fundingRecoverCreate(hash: string): Promise<Record<string, unknown>> }>(actionsCode, {
    "@stellar/stellar-sdk": sdk, "node:crypto": {}, "@/lib/arisan-funding": domain,
    "@/lib/arisan-funding-fees": feePolicy,
    "@/lib/arisan-list": { arisanRoomPage }, "@/lib/local-preview": { isLocalPreview: options.preview ?? false },
    "@/lib/server/arisanCommitment": {}, "@/lib/server/arisanFundingReceipt": decoder,
    "@/lib/server/arisanAuthorization": { authenticatedArisanWallet: async () => {
      const index = calls.auth++;
      return options.authenticated === false ? { ok: false, error: "Sign in with your saved wallet." }
        : { ok: true, publicKey: options.authSequence?.[Math.min(index, options.authSequence.length - 1)] ?? options.owner ?? wallet };
    } },
    "@/lib/server/userWallet": { getAuthenticatedSigner: async () => { calls.signers++; throw new Error("Custody access forbidden."); } },
    "@/lib/server/stellar": { arisanRoomsId: () => legacy, CONTRACTS: { tokenXlmSac: nativeSac },
      txLink: (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`,
      sc: Object.fromEntries(["u32", "sym", "addr"].map(name => [name, (value: unknown) => value])),
      readContract: async (id: string, method: string) => {
        assert.equal(id, contractId); calls.reads.push(method);
        if (method === "installment_contract_info") return { version: 1, token: options.token ?? nativeSac,
          cadence_weekly: 60, cadence_biweekly: 120, cadence_monthly: 300, first_commit_window: 300,
          max_postpone: 300, max_funding_window: 30 * 86400 };
        if (options.roomReadThrows) throw new Error("PRIVATE_PROVIDER_ERROR");
        if (method === "room_by_code") return options.resolvedId ?? 1;
        if (method === "get_room") return { host: wallet, name: "Recovery room", code: "FAM234", member_target: 3, member_count: 1,
          share: 10_000_000n, cadence: ["Weekly"], first_kocok: 0, join_deadline: now + 86400, status: ["Open"], round: 0, ...options.core };
        if (method === "get_members") return [wallet];
        if (method === "locked_of") return 0n;
        if (method === "funding_state") return { mode: ["Installments"], obligation: 30_000_000n, pooled: 0n,
          fully_funded_count: 0, deadline: now + 86400, ...options.funding };
        throw new Error(`Unexpected read ${method}`);
      },
      invokeAs: async () => { calls.submits++; throw new Error("Transaction submission forbidden."); },
    },
  }, { ARISAN_INSTALLMENTS_CONTRACT: options.configured ?? contractId });
  return { api, decoder, calls, receipt };
}

test("recover verified create from its original signed SDK envelope, never a signer or submission", async () => {
  const { api, calls, receipt } = setup();
  const result = await api.fundingRecoverCreate(receipt.hash);
  assert.equal(result.ok, true); assert.equal(result.id, 1); assert.equal(result.code, "FAM234");
  assert.equal(result.hash, receipt.hash); assert.equal(result.link, `https://stellar.expert/explorer/testnet/tx/${receipt.hash}`);
  assert.equal(calls.rpc, 1); assert.equal(calls.signers, 0); assert.equal(calls.submits, 0); assert.equal(calls.auth, 2);
});
test("receipt decoder validates an actual fee-bump inner transaction without assuming its sponsor is the host", async () => {
  const { api, calls, receipt } = setup({ receipt: fixture({ feeBump: true }) });
  assert.equal((await api.fundingRecoverCreate(receipt.hash)).ok, true);
  assert.equal(calls.signers, 0); assert.equal(calls.submits, 0);
});
test("recovery rejects guest, invalidhash, absent candidate, legacy target or preview before any RPC or custody", async () => {
  for (const options of [{ authenticated: false }, { configured: "" }, { configured: legacy }, { preview: true }]) {
    const { api, calls, receipt } = setup(options); assert.equal((await api.fundingRecoverCreate(receipt.hash)).ok, false);
    assert.equal(calls.rpc, 0); assert.equal(calls.signers, 0); assert.equal(calls.submits, 0);
  }
  const invalid = setup(); assert.equal((await invalid.api.fundingRecoverCreate("invalid")).ok, false);
  assert.equal(invalid.calls.auth, 0); assert.equal(invalid.calls.rpc, 0);
});
test("recovery rejects wrong contract, entrypoint, creator, source, network, operation source and multi-operation envelopes", async () => {
  for (const options of [{ contract: legacy }, { method: "create_room" }, { creator: other }, { source: other },
    { network: sdk.Networks.PUBLIC }, { operationSource: other }, { extraOperation: true }, { wrongReceiptHash: true },
    { wrongResult: true }, { ledger: 0 }]) {
    const { api, calls, receipt } = setup({ receipt: fixture(options) });
    const result = await api.fundingRecoverCreate(receipt.hash);
    assert.equal(result.ok, false); assert.equal(result.pending, true); assert.equal(result.hash, receipt.hash);
    assert.equal(calls.signers, 0); assert.equal(calls.submits, 0); assert.equal(calls.reads.includes("room_by_code"), false);
  }
});
test("recovery decodes exact 7 argument types and rejects malformed installment terms", async () => {
  const originalArgs = fixture().args;
  const changedArgs = [originalArgs.slice(0, 6), [...originalArgs, sdk.xdr.ScVal.scvVoid()],
    originalArgs.map((arg, index) => index === 3 ? sdk.nativeToScVal(3n, { type: "u64" }) : arg),
    originalArgs.map((arg, index) => index === 5 ? sdk.xdr.ScVal.scvVec([sdk.nativeToScVal("Weekly", { type: "symbol" }), sdk.nativeToScVal("Monthly", { type: "symbol" })]) : arg)];
  for (const options of [{ memberTarget: 2 }, { share: 0n }, { share: -1n }, { share: 10_000_000_000_000_001n },
    { cadence: "Unrecognized" }, { code: "bad" }, { name: "" }, { deadline: BigInt(Number.MAX_SAFE_INTEGER) + 1n },
    ...changedArgs.map(args => ({ args }))]) {
    const { api, calls, receipt } = setup({ receipt: fixture(options) });
    const result = await api.fundingRecoverCreate(receipt.hash);
    assert.equal(result.ok, false); assert.equal(result.pending, true); assert.equal(calls.signers, 0); assert.equal(calls.submits, 0);
  }
});
test("pending, failed, absent receipt and RPC failure retain original recovery hash without resubmission", async () => {
  for (const options of [{ receipt: fixture({ status: "NOT_FOUND" }) }, { receipt: fixture({ status: "FAILED" }) },
    { nullReceipt: true }, { rpcThrows: true }]) {
    const { api, calls, receipt } = setup(options);
    const result = await api.fundingRecoverCreate(receipt.hash);
    assert.equal(result.ok, false); assert.equal(result.pending, true); assert.equal(result.hash, receipt.hash);
    assert.equal(JSON.stringify(result).includes("PRIVATE_PROVIDER_ERROR"), false);
    assert.equal(calls.signers, 0); assert.equal(calls.submits, 0);
  }
});
test("recovery verifies current code mapping and every immutable room term, not only RPC SUCCESS", async () => {
  for (const options of [{ roomReadThrows: true }, { resolvedId: 0 }, { core: { host: other } }, { core: { name: "Changed room" } },
    { core: { code: "FAM235" } }, { core: { member_target: 4 }, funding: { obligation: 40_000_000n } },
    { core: { share: 20_000_000n }, funding: { obligation: 60_000_000n } }, { core: { cadence: ["Monthly"] } },
    { core: { join_deadline: now + 1 }, funding: { deadline: now + 1 } }, { funding: { mode: ["LegacyFull"] } }]) {
    const { api, calls, receipt } = setup(options);
    const result = await api.fundingRecoverCreate(receipt.hash);
    assert.equal(result.ok, false); assert.equal(result.pending, true); assert.equal(result.hash, receipt.hash);
    assert.equal(calls.signers, 0); assert.equal(calls.submits, 0);
  }
});
test("recovery rejects owner changes during readonly verification and native asset capability mismatch", async () => {
  for (const options of [{ owner: other }, { authSequence: [wallet, other] }, { token: "USDC" }]) {
    const { api, calls, receipt } = setup(options);
    const result = await api.fundingRecoverCreate(receipt.hash);
    assert.equal(result.ok, false); assert.equal(result.pending, true); assert.equal(calls.signers, 0); assert.equal(calls.submits, 0);
  }
});
