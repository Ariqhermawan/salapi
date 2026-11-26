import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Account, Address, Contract, Keypair, Networks, StrKey, Transaction, TransactionBuilder,
  SorobanDataBuilder, BASE_FEE, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";

const contractId = "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU";
const tokenId = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

function setup() {
  const source = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 51));
  const recipient = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 52));
  const calls = { accountReads: 0, prepares: 0, sends: 0 };
  let passphrase: Networks = Networks.TESTNET;
  class Server {
    async getNetwork() { return { passphrase }; }
    async getAccount(address: string) { calls.accountReads++; return new Account(address, "0"); }
    async prepareTransaction(transaction: unknown) { calls.prepares++; return transaction; }
    async sendTransaction() { calls.sends++; return { status: "PENDING" }; }
    async getTransaction() { return { status: "SUCCESS", returnValue: null }; }
  }
  const code = ts.transpileModule(readFileSync(new URL("../lib/server/stellar.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  type Api = {
    prepareContractCallAs(source: string, contractId: string, method: string, args: xdr.ScVal[]): Promise<{ transactionXdr: string; feeStroops: string; maxTime: string }>;
    submitPreparedContractCallAs(secret: string, transactionXdr: string, expected: { source: string; contractId: string; method: string; args: xdr.ScVal[]; feeStroops: string }): Promise<{ ok: boolean }>;
  };
  const target = { exports: {} as Api };
  const dependencies = {
    "@stellar/stellar-sdk": { rpc: { ...rpc, Server }, Keypair, Contract, TransactionBuilder, Transaction,
      Networks, StrKey, nativeToScVal, scValToNative, Address, Account, xdr, SorobanDataBuilder, BASE_FEE },
    "@/lib/arisan-funding-fees": { bufferedFundingResourceFee: () => 0n, FUNDING_FEE_LIMIT_ERROR: "fee cap", transactionFeeWithinCap: () => true, validTransactionFee: () => true },
    "@/lib/money": { pesosToStroopsExact: () => 0n },
    "@/lib/local-preview": { isLocalPreview: false },
    "@/lib/server/walletReadiness": { getTestnetNativeBalance: async () => 0n },
  } as Record<string, unknown>;
  runInNewContext(code, { module: target, exports: target.exports, Buffer, process: { env: { STELLAR_RPC_URL: "https://isolated.invalid" } },
    setTimeout: (fn: () => void) => { fn(); return 1; },
    require(name: string) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return { api: target.exports, calls, source, recipient, setPassphrase: (value: Networks) => { passphrase = value; } };
}

test("prepared contract calls are decoded, pinned to Testnet and checked against the confirmed action", async () => {
  const { api, calls, source, recipient } = setup();
  const args = [new Address(source.publicKey()).toScVal(),
    new Address(recipient.publicKey()).toScVal(), nativeToScVal(500n, { type: "i128" })];
  const prepared = await api.prepareContractCallAs(source.publicKey(), tokenId, "transfer", args);
  assert.equal(prepared.feeStroops, "100"); assert.equal(calls.accountReads, 1); assert.equal(calls.prepares, 1);
  const parsed = TransactionBuilder.fromXDR(prepared.transactionXdr, Networks.TESTNET);
  assert.equal((parsed as Transaction).source, source.publicKey());

  const confirmed = await api.submitPreparedContractCallAs(source.secret(), prepared.transactionXdr, {
    source: source.publicKey(), contractId: tokenId, method: "transfer", args, feeStroops: prepared.feeStroops,
  });
  assert.equal(confirmed.ok, true); assert.equal(calls.sends, 1);

  const altered = [...args.slice(0, 2), nativeToScVal(501n, { type: "i128" })];
  assert.equal((await api.submitPreparedContractCallAs(source.secret(), prepared.transactionXdr, {
    source: source.publicKey(), contractId: tokenId, method: "transfer", args: altered, feeStroops: prepared.feeStroops,
  })).ok, false);
  assert.equal((await api.submitPreparedContractCallAs(source.secret(), prepared.transactionXdr, {
    source: source.publicKey(), contractId: tokenId, method: "transfer", args, feeStroops: "101",
  })).ok, false);
  assert.equal(calls.sends, 1);

  // The same envelope cannot be signed if the configured RPC no longer reports Testnet.
  const mainnet = setup();
  const mainnetPrepared = await mainnet.api.prepareContractCallAs(mainnet.source.publicKey(), tokenId, "transfer", args);
  mainnet.setPassphrase(Networks.PUBLIC);
  assert.equal((await mainnet.api.submitPreparedContractCallAs(mainnet.source.secret(), mainnetPrepared.transactionXdr, {
    source: mainnet.source.publicKey(), contractId: tokenId, method: "transfer", args,
    feeStroops: mainnetPrepared.feeStroops,
  })).ok, false);
  assert.equal(mainnet.calls.sends, 0);
});
