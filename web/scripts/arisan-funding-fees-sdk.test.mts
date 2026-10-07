import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as SDK from "@stellar/stellar-sdk";
import * as policy from "../lib/arisan-funding-fees.ts";

// Execute the production invokeAs with actual SDK builders/XDR. RPC and signer
// acquisition are isolated. This file never reads a live key or contacts a chain.
const syntheticSigner = SDK.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 93));
const otherSigner = SDK.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 94)).publicKey();
const publicKey = syntheticSigner.publicKey();
const contract = SDK.StrKey.encodeContract(Buffer.alloc(32, 95));
const token = SDK.StrKey.encodeContract(Buffer.alloc(32, 96));
const args = [SDK.nativeToScVal(2, { type: "u32" }), new SDK.Address(publicKey).toScVal(), SDK.nativeToScVal(7_500_000n, { type: "i128" })];
const compiled = ts.transpileModule(readFileSync(new URL("../lib/server/stellar.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
type Result = { ok: boolean; error?: string; hash?: string; value?: unknown };
type Options = { maxFeeStroops: string; bufferRefundableResourceFee?: boolean };
type Api = { invokeAs(secret: string, contract: string, method: string, args: SDK.xdr.ScVal[], options?: Options): Promise<Result> };

function body(transaction: SDK.Transaction) { return transaction.toEnvelope().v1().tx(); }

function invocation(id: string, method: string, values: SDK.xdr.ScVal[], children: SDK.xdr.SorobanAuthorizedInvocation[] = []) {
  return new SDK.xdr.SorobanAuthorizedInvocation({
    function: SDK.xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new SDK.xdr.InvokeContractArgs({
      contractAddress: new SDK.Address(id).toScAddress(), functionName: method, args: values,
    })),
    subInvocations: children,
  });
}
const authorization = new SDK.xdr.SorobanAuthorizationEntry({
  credentials: SDK.xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
  rootInvocation: invocation(contract, "deposit_room", args, [invocation(token, "transfer", [
    new SDK.Address(publicKey).toScVal(), new SDK.Address(contract).toScVal(), args[2],
  ])]),
});
function footprintKey(id: string) {
  return SDK.xdr.LedgerKey.contractData(new SDK.xdr.LedgerKeyContractData({
    contract: new SDK.Address(id).toScAddress(), key: SDK.xdr.ScVal.scvLedgerKeyContractInstance(),
    durability: SDK.xdr.ContractDataDurability.persistent(),
  }));
}
function preparedTransaction(resourceFee: string, extended = false) {
  const data = new SDK.SorobanDataBuilder().setFootprint([footprintKey(token)], [footprintKey(contract)])
    .setResources(10_000, 240, 1_000).setResourceFee(resourceFee).build();
  const operation = new SDK.Contract(contract).call("deposit_room", ...args);
  operation.body().invokeHostFunctionOp().auth([authorization]);
  const builder = new SDK.TransactionBuilder(new SDK.Account(publicKey, "10"), {
    fee: SDK.BASE_FEE, networkPassphrase: SDK.Networks.TESTNET, sorobanData: data,
  }).addOperation(operation).addMemo(SDK.Memo.text("isolated SDK QA")).setTimebounds(1_800_000_000, 1_800_000_060);
  if (extended) builder.setLedgerbounds(5_000_000, 5_000_010).setMinAccountSequence("8")
    .setMinAccountSequenceAge(2).setMinAccountSequenceLedgerGap(1).setExtraSigners([otherSigner]);
  return builder.build();
}

function setup(prepared: SDK.Transaction, options: { preview?: boolean; encodingFails?: boolean } = {}) {
  const calls = { servers: 0, keys: 0, accounts: 0, prepares: 0, signs: 0, sends: 0, statuses: 0, encodedBeforeSign: 0 };
  const sent: SDK.Transaction[] = [];
  const signer = {
    publicKey: () => publicKey,
    signDecorated(bytes: Buffer) { calls.signs++; return syntheticSigner.signDecorated(bytes); },
  };
  // Instrument only the final unsigned-envelope validation. Other SDK methods
  // and builder clones are the installed implementation, not test imitations.
  class ObservedBuilder extends SDK.TransactionBuilder {
    static cloneFrom(transaction: SDK.Transaction, cloneOptions?: Parameters<typeof SDK.TransactionBuilder.cloneFrom>[1]) {
      const builder = SDK.TransactionBuilder.cloneFrom(transaction, cloneOptions);
      const originalBuild = builder.build.bind(builder);
      builder.build = () => {
        const output = originalBuild();
        const originalToXDR = output.toXDR.bind(output);
        output.toXDR = () => {
          if (output.signatures.length === 0) calls.encodedBeforeSign++;
          if (options.encodingFails) throw new Error("Isolated unsigned XDR encoding failure");
          return originalToXDR();
        };
        return output;
      };
      return builder;
    }
  }
  class Server {
    constructor() { calls.servers++; }
    async getAccount(address: string) { calls.accounts++; assert.equal(address, publicKey); return new SDK.Account(publicKey, "10"); }
    async prepareTransaction(transaction: SDK.Transaction) {
      calls.prepares++; assert.equal(transaction.source, publicKey); assert.equal(transaction.sequence, "11");
      assert.equal(transaction.networkPassphrase, SDK.Networks.TESTNET);
      assert.equal(transaction.signatures.length, 0);
      const operation = body(transaction).operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract();
      assert.equal(operation.functionName().toString(), "deposit_room");
      assert.deepEqual(operation.args().map(value => value.toXDR("base64")), args.map(value => value.toXDR("base64")));
      return prepared;
    }
    async sendTransaction(transaction: SDK.Transaction) {
      calls.sends++; sent.push(transaction);
      assert.equal(calls.signs, 1, "only the synthetic local signer signs before the mocked send");
      assert.equal(transaction.signatures.length, 1);
      return { status: "PENDING" };
    }
    async getTransaction() { calls.statuses++; return { status: "SUCCESS", returnValue: SDK.nativeToScVal(2, { type: "u32" }) }; }
  }
  const dependencies: Record<string, unknown> = {
    "@stellar/stellar-sdk": { ...SDK, TransactionBuilder: ObservedBuilder, rpc: { ...SDK.rpc, Server }, Keypair: {
      fromSecret(secret: string) { calls.keys++; assert.equal(secret, "SYNTHETIC_TEST_SIGNER_ONLY"); return signer; },
    } },
    "@/lib/arisan-funding-fees": policy,
    "@/lib/money": { pesosToStroopsExact() { throw Error("Unexpected money conversion"); } },
    "@/lib/local-preview": { isLocalPreview: options.preview ?? false },
    "@/lib/server/walletReadiness": { getTestnetNativeBalance() { throw Error("Unexpected wallet/network read"); } },
  };
  const sandboxModule = { exports: {} as Api };
  runInNewContext(compiled, { module: sandboxModule, exports: sandboxModule.exports, Buffer, console, Error,
    process: { env: {} },
    setTimeout() { throw Error("Unexpected poll or wait in offline SDK tests"); },
    fetch() { throw Error("No network is authorized in offline SDK tests"); },
    require(name: string) { assert.ok(name in dependencies, `Unstubbed dependency: ${name}`); return dependencies[name]; },
  });
  return { calls, sent, invoke: (feeOptions?: Options) => sandboxModule.exports.invokeAs("SYNTHETIC_TEST_SIGNER_ONLY", contract, "deposit_room", args, feeOptions) };
}

function assertNothingSignedOrSent(harness: ReturnType<typeof setup>, result: Result) {
  assert.equal(result.ok, false);
  assert.equal(result.hash, undefined);
  assert.equal(harness.calls.signs, 0);
  assert.equal(harness.calls.sends, 0);
  assert.equal(harness.calls.statuses, 0);
}

test("production invokeAs uses real SDK clone and counts inclusion plus buffered resources exactly once", async () => {
  for (const extended of [false, true]) {
    for (const resourceFee of ["0", "30000", "10000001", "20000000", "44138940", "45454454"]) {
      const original = preparedTransaction(resourceFee, extended);
      const envelope = original.toXDR();
      const originalBody = body(original);
      const data = originalBody.ext().sorobanData();
      const harness = setup(original);
      const result = await harness.invoke(policy.FUNDING_INVOKE_OPTIONS);
      assert.equal(result.ok, true, `${resourceFee}, extended=${extended}: ${result.error}`);
      assert.equal(result.value, 2);
      assert.match(result.hash!, /^[0-9a-f]{64}$/);
      assert.equal(harness.calls.signs, 1); assert.equal(harness.calls.sends, 1); assert.equal(harness.calls.statuses, 1);
      assert.equal(harness.calls.encodedBeforeSign, 1, "the final unsigned XDR must be validated before signing");
      const final = harness.sent[0];
      const finalBody = body(final);
      const buffered = policy.bufferedFundingResourceFee(resourceFee)!;
      assert.equal(final.fee, (BigInt(SDK.BASE_FEE) + BigInt(buffered)).toString());
      assert.equal(finalBody.ext().sorobanData().resourceFee().toString(), buffered);
      assert.ok(BigInt(final.fee) <= 50_000_000n);
      assert.equal(final.source, original.source); assert.equal(final.sequence, original.sequence);
      assert.equal(final.networkPassphrase, original.networkPassphrase);
      assert.equal(finalBody.sourceAccount().toXDR("base64"), originalBody.sourceAccount().toXDR("base64"));
      assert.equal(finalBody.cond().toXDR("base64"), originalBody.cond().toXDR("base64"));
      assert.equal(finalBody.memo().toXDR("base64"), originalBody.memo().toXDR("base64"));
      assert.deepEqual(finalBody.operations().map(operation => operation.toXDR("base64")), originalBody.operations().map(operation => operation.toXDR("base64")));
      const nestedAuth = finalBody.operations()[0].body().invokeHostFunctionOp().auth();
      assert.equal(nestedAuth.length, 1); assert.equal(nestedAuth[0].rootInvocation().subInvocations().length, 1);
      assert.equal(nestedAuth[0].toXDR("base64"), authorization.toXDR("base64"));
      assert.equal(finalBody.ext().sorobanData().resources().toXDR("base64"), data.resources().toXDR("base64"));
      assert.equal(finalBody.ext().sorobanData().ext().toXDR("base64"), data.ext().toXDR("base64"));
      assert.equal(original.toXDR(), envelope, "buffering must not mutate the simulated envelope, resources or original signatures");
      assert.equal(original.signatures.length, 0);
    }
  }
});

test("the 5 XLM total cap includes classic inclusion fee and rejects even one stroop above it before signing", async () => {
  for (const resourceFee of ["45454455", "49000000", "50000000", "6105129207"]) {
    const harness = setup(preparedTransaction(resourceFee));
    const result = await harness.invoke(policy.FUNDING_INVOKE_OPTIONS);
    assertNothingSignedOrSent(harness, result);
    assert.equal(result.error, policy.FUNDING_FEE_LIMIT_ERROR);
  }
  const exact = setup(preparedTransaction("45454454"));
  assert.equal((await exact.invoke(policy.FUNDING_INVOKE_OPTIONS)).ok, true);
  assert.equal(exact.sent[0].fee, "50000000");
});

test("invalid server options are rejected before loading a signer, constructing RPC, or preparing", async () => {
  for (const value of [undefined, null, 5, 5n, "", "0", "01", "-1", "50000000.0", "4294967296"]) {
    const harness = setup(preparedTransaction("30000"));
    const result = await harness.invoke({ maxFeeStroops: value as string, bufferRefundableResourceFee: true });
    assertNothingSignedOrSent(harness, result);
    assert.match(result.error!, /Invalid server transaction fee policy/);
    assert.equal(harness.calls.servers, 0); assert.equal(harness.calls.keys, 0); assert.equal(harness.calls.accounts, 0); assert.equal(harness.calls.prepares, 0);
  }
  const invalidBoolean = setup(preparedTransaction("30000"));
  const result = await invalidBoolean.invoke({ maxFeeStroops: "50000000", bufferRefundableResourceFee: "true" as unknown as boolean });
  assertNothingSignedOrSent(invalidBoolean, result);
  assert.equal(invalidBoolean.calls.keys, 0); assert.equal(invalidBoolean.calls.prepares, 0);
});

test("malformed, negative, zero and overflow prepared fees never reach unsigned encoding or signing", async () => {
  for (const fee of [undefined, null, 100, 100n, "0", "-1", "01", "NaN", "Infinity", "50000000.1", "4294967296", "6105129307"]) {
    const prepared = preparedTransaction("30000");
    Object.defineProperty(prepared, "fee", { value: fee });
    const harness = setup(prepared);
    const result = await harness.invoke(policy.FUNDING_INVOKE_OPTIONS);
    assertNothingSignedOrSent(harness, result);
    assert.equal(result.error, policy.FUNDING_FEE_LIMIT_ERROR);
    assert.equal(harness.calls.encodedBeforeSign, 0);
  }
});

test("negative resource fees and unsigned serialization failures fail closed before signing", async () => {
  const negative = setup(preparedTransaction("-1"));
  const result = await negative.invoke(policy.FUNDING_INVOKE_OPTIONS);
  assertNothingSignedOrSent(negative, result);
  assert.equal(result.error, policy.FUNDING_FEE_LIMIT_ERROR);
  const encodingFailure = setup(preparedTransaction("30000"), { encodingFails: true });
  const encodingResult = await encodingFailure.invoke(policy.FUNDING_INVOKE_OPTIONS);
  assertNothingSignedOrSent(encodingFailure, encodingResult);
  assert.match(encodingResult.error!, /Isolated unsigned XDR encoding failure/);
  assert.equal(encodingFailure.calls.encodedBeforeSign, 1);
});

test("legacy no-options invokeAs preserves its prepared transaction and does not apply an installment buffer", async () => {
  for (const options of [undefined, { maxFeeStroops: "50000000", bufferRefundableResourceFee: false }, { maxFeeStroops: "50000000" }]) {
    const prepared = preparedTransaction("30000", true);
    const originalBody = body(prepared).toXDR("base64");
    const harness = setup(prepared);
    assert.equal((await harness.invoke(options)).ok, true);
    assert.equal(harness.sent[0], prepared, "unbuffered invocations should not be cloned or replaced");
    assert.equal(body(harness.sent[0]).toXDR("base64"), originalBody);
    assert.equal(harness.sent[0].fee, "30100");
    assert.equal(body(harness.sent[0]).ext().sorobanData().resourceFee().toString(), "30000");
    assert.equal(harness.calls.signs, 1); assert.equal(harness.calls.sends, 1);
  }
});

test("local preview blocks the real invokeAs before RPC, signer, fee preparation or mocked submission", async () => {
  const harness = setup(preparedTransaction("30000"), { preview: true });
  const result = await harness.invoke(policy.FUNDING_INVOKE_OPTIONS);
  assertNothingSignedOrSent(harness, result);
  assert.match(result.error!, /Local preview cannot submit/);
  assert.equal(harness.calls.servers, 0); assert.equal(harness.calls.keys, 0); assert.equal(harness.calls.prepares, 0);
});
