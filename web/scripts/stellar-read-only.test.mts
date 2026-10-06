import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as stellar from "@stellar/stellar-sdk";
import * as money from "../lib/money.ts";

const code = ts.transpileModule(readFileSync(new URL("../lib/server/stellar.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const contract = "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU";
const source = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
type Api = { readContract(id: string, method: string, args?: stellar.xdr.ScVal[]): Promise<unknown>; demoPublic(): string; invoke(id: string, method: string): Promise<{ ok: boolean; error?: string }> };
function harness(options: { env?: Record<string, string>; error?: string; missingReturn?: boolean; preview?: boolean } = {}) {
  const calls = { keyLoads: 0, simulations: [] as stellar.Transaction[], accountReads: 0, submissions: 0 };
  class Server {
    async simulateTransaction(tx: stellar.Transaction) {
      calls.simulations.push(tx);
      return options.error ? { error: options.error } : { result: options.missingReturn ? undefined : { retval: stellar.nativeToScVal(4, { type: "u32" }) } };
    }
    async getAccount() { calls.accountReads++; throw new Error("No account provisioning or account reads are authorized"); }
    async sendTransaction() { calls.submissions++; throw new Error("No submissions are authorized"); }
  }
  const sandboxModule = { exports: {} as Api };
  const dependencies: Record<string, unknown> = {
    "@stellar/stellar-sdk": { ...stellar, rpc: { ...stellar.rpc, Server }, Keypair: { fromSecret: () => { calls.keyLoads++; throw new Error("No signing keys are authorized"); } } },
    "@/lib/money": money,
    "@/lib/local-preview": { isLocalPreview: options.preview ?? false },
  };
  runInNewContext(code, { module: sandboxModule, exports: sandboxModule.exports, Buffer, process: { env: options.env ?? {} },
    fetch: () => { throw new Error("No external request is authorized in this isolated test"); },
    require: (name: string) => { if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`); return dependencies[name]; },
  });
  return { api: sandboxModule.exports, calls };
}

test("public contract reads work without demo secrets and never read accounts, sign, fund, or submit", async () => {
  const { api, calls } = harness();
  assert.equal(await api.readContract(contract, "version"), 4);
  assert.equal(calls.simulations.length, 1);
  const tx = calls.simulations[0];
  assert.equal(tx.source, source); assert.equal(tx.signatures.length, 0);
  assert.equal(tx.operations.length, 1); assert.equal(tx.operations[0].type, "invokeHostFunction");
  assert.equal(calls.keyLoads, 0); assert.equal(calls.accountReads, 0); assert.equal(calls.submissions, 0);
});
test("configured demo identity does not become the readonly simulation source", async () => {
  const publicKey = stellar.StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));
  const { api, calls } = harness({ env: { SALAPI_DEMO_PUBLIC: publicKey, SALAPI_DEMO_SECRET: "never-read-this" } });
  assert.equal(api.demoPublic(), publicKey);
  await api.readContract(contract, "clock");
  assert.equal(calls.simulations[0].source, source); assert.equal(calls.keyLoads, 0);
});
test("readonly RPC failures propagate and empty results preserve null", async () => {
  const failed = harness({ error: "Contract does not exist" });
  await assert.rejects(failed.api.readContract(contract, "version"), /Contract does not exist/);
  assert.equal(failed.calls.submissions, 0);
  assert.equal(await harness({ missingReturn: true }).api.readContract(contract, "version"), null);
});
test("unsigned public read support cannot bypass signing configuration or local-preview mutation guards", async () => {
  const nonlocal = harness();
  assert.throws(() => nonlocal.api.demoPublic(), /SALAPI_DEMO_SECRET missing/);
  const denied = await nonlocal.api.invoke(contract, "version");
  assert.equal(denied.ok, false); assert.match(denied.error ?? "", /SALAPI_DEMO_SECRET missing/);
  assert.equal(nonlocal.calls.simulations.length, 0); assert.equal(nonlocal.calls.submissions, 0);
  const preview = harness({ preview: true });
  assert.equal((await preview.api.invoke(contract, "version")).ok, false);
  assert.equal(preview.calls.keyLoads, 0); assert.equal(preview.calls.submissions, 0);
});
