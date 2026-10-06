import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the real server-module exports with imports isolated. Any attempted
// access to SDK/network/keys fails the test instead of reaching external state.
function loadServerModule(file: string) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandboxModule = { exports: {} as Record<string, (...args: unknown[]) => Promise<unknown>> };
  const guarded = new Proxy({}, { get: () => { throw new Error("External dependency must not run during local preview"); } });
  runInNewContext(code, { exports: sandboxModule.exports, module: sandboxModule, process: { env: {} }, Buffer, console,
    require: (path: string) => path === "@/lib/local-preview" ? { isLocalPreview: true }
      : path === "@stellar/stellar-sdk" ? { rpc: guarded, Keypair: guarded, StrKey: guarded }
      : path === "@/lib/money" ? { nativeBalanceToStroops: guarded, pesosToStroopsExact: guarded }
      : {},
  });
  return sandboxModule.exports;
}
test("all Stellar submission paths fail closed in local preview", async () => {
  const server = loadServerModule("../lib/server/stellar.ts");
  for (const [method, args] of [["invoke", ["contract", "transfer"]], ["invokeAs", ["not-a-secret", "contract", "transfer"]], ["invokeSponsored", ["not-a-secret", "contract", "transfer"]]] as const) {
    const result = await server[method](...args) as { ok: boolean; error: string };
    assert.equal(result.ok, false);
    assert.match(result.error, /Local preview cannot submit/);
  }
});
test("local preview cannot resolve or provision a signer", async () => {
  const wallets = loadServerModule("../lib/server/userWallet.ts");
  await assert.rejects(wallets.getSigner(), /Local preview cannot submit transactions or provision wallets/);
  await assert.rejects(wallets.getAuthenticatedSigner(), /Local preview cannot use signer controls/);
});
