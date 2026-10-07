/** Manual cross-language ABI check. Requires the local Rust toolchain.
 * No database, signer decryption, RPC request or transaction submission.
 * Run from web: node --experimental-strip-types scripts/verify-arisan-funding-abi.mts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as sdk from "@stellar/stellar-sdk";
import * as domain from "../lib/arisan-funding.ts";
import * as money from "../lib/money.ts";
import { arisanRoomPage } from "../lib/arisan-list.ts";

const cargo = process.env.CARGO_BIN ?? "cargo";
const stdout = execFileSync(cargo, ["test", "--lib", "--locked", "-p", "arisan-rooms", "--no-default-features", "installment_generated_abi", "--", "--nocapture"], {
  cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8", timeout: 60000,
  stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
const hex = stdout.match(/INSTALLMENT_SPEC_HEX=([0-9a-f]+)/)?.[1];
assert.ok(hex, "The real Rust macro-generated public specification must be emitted by a passing contract test.");
const spec = new sdk.contract.Spec(Buffer.from(hex, "hex"));
const now = 1_800_000_000;
const caller = sdk.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 61)).publicKey();
const host = sdk.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 62)).publicKey();
const contractId = sdk.StrKey.encodeContract(Buffer.alloc(32, 63));
const legacy = sdk.StrKey.encodeContract(Buffer.alloc(32, 64));
const hash = "a".repeat(64);
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load<T>(code: string, dependencies: Record<string, unknown>): T {
  const sandboxModule = { exports: {} as T };
  // Execute these trusted, local compiled modules in the same JS realm as
  // js-xdr: its writer uses instanceof Array for enum vectors. Boundaries are
  // still injected; no real transport or custody function can be reached.
  const execute = new Function("module", "exports", "require", "Buffer", "process", "Date", "fetch", code);
  execute(sandboxModule, sandboxModule.exports,
    (name: string) => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
    Buffer, { env: { ARISAN_INSTALLMENTS_CONTRACT: contractId } }, class extends Date { static now() { return now * 1000; } },
    () => { throw new Error("Network use is forbidden during isolated ABI validation."); });
  return sandboxModule.exports;
}
type ScBuilders = Record<string, (value: never) => sdk.xdr.ScVal>;
const stellar = load<{ sc: ScBuilders; CONTRACTS: { tokenXlmSac: string } }>(compile("../lib/server/stellar.ts"), {
  "@stellar/stellar-sdk": sdk, "@/lib/money": money, "@/lib/local-preview": { isLocalPreview: false },
  "@/lib/server/walletReadiness": {},
});
const decodedSamples: { name: string; decoded: unknown }[] = [];
function output(name: string, native: unknown): unknown {
  const functionSpec = spec.getFunc(name);
  const resultType = functionSpec.outputs()[0];
  const valueType = resultType.switch().name === "scSpecTypeResult" ? resultType.result().okType() : resultType;
  // The production transport uses the SDK's generic decoder; make sure Rust's
  // actual field/enum encodings arrive in the exact form the action reads.
  const decoded = sdk.scValToNative(spec.nativeToScVal(native, valueType));
  decodedSamples.push({ name, decoded });
  return decoded;
}
let members = [host];
const captured: { method: string; args: sdk.xdr.ScVal[] }[] = [];
const api = load<Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>>(compile("../app/arisan-funding-actions.ts"), {
  "@stellar/stellar-sdk": sdk, "node:crypto": { randomBytes: () => Buffer.alloc(6, 2) },
  "@/lib/local-preview": { isLocalPreview: false }, "@/lib/arisan-funding": domain,
  "@/lib/arisan-list": { arisanRoomPage },
  "@/lib/server/arisanAuthorization": { authenticatedArisanWallet: async () => ({ ok: true, publicKey: caller }) },
  "@/lib/server/userWallet": { getAuthenticatedSigner: async () => ({ publicKey: caller, demo: false, secret: "ISOLATED_UNSIGNED_TEST_ONLY" }) },
  "@/lib/server/arisanCommitment": {},
  "@/lib/server/arisanFundingReceipt": {},
  "@/lib/server/stellar": { ...stellar, arisanRoomsId: () => legacy,
    txLink: (value: string) => `https://stellar.expert/explorer/testnet/tx/${value}`,
    readContract: async (_id: string, method: string, args: sdk.xdr.ScVal[]) => {
      if (method === "installment_contract_info") return output(method, { version: 1, token: stellar.CONTRACTS.tokenXlmSac,
        cadence_weekly: 60n, cadence_biweekly: 120n, cadence_monthly: 300n,
        max_postpone: 300n, first_commit_window: 300n, max_funding_window: 30n * 86400n });
      if (method === "room_by_code") return 1;
      if (method === "get_members") return members;
      if (method === "get_room") return output(method, { host, name: "ABI contract validation", code: "FAM234",
        member_target: 3, member_count: members.length, share: 10_000_000n, cadence: { tag: "Weekly" },
        first_kocok: 0n, join_deadline: BigInt(now + 86400), status: { tag: "Open" }, round: 0 });
      if (method === "funding_state") return output(method, { mode: { tag: "Installments" }, obligation: 30_000_000n,
        pooled: 0n, fully_funded_count: 0, deadline: BigInt(now + 86400) });
      if (method === "locked_of") {
        const expected = spec.funcArgsToScVals(method, { room_id: 1, member: sdk.scValToNative(args[1]) });
        assert.deepEqual(Array.from(args, value => value.toXDR("base64")), expected.map(value => value.toXDR("base64")));
        return 0n;
      }
      throw new Error(`Unexpected read ${method}`);
    },
    invokeAs: async (_secret: string, _id: string, method: string, args: sdk.xdr.ScVal[]) => {
      captured.push({ method, args }); return { ok: true, hash, value: 1 };
    },
  },
});

const review = { contractId, roomId: 1, code: "FAM234", viewer: caller, memberTarget: 3,
  shareStroops: "10000000", obligationStroops: "30000000", fundingDeadline: now + 86400, cadence: "Weekly" };
assert.equal((await api.fundingCreate({ contractId, expectedViewer: caller, name: "ABI contract validation",
  memberTarget: 3, shareXlm: "1.2345678", cadence: "Weekly", fundingDays: 7 })).ok, true);
assert.equal((await api.fundingJoin(review)).ok, true,
  JSON.stringify(decodedSamples, (_key, value) => typeof value === "bigint" ? value.toString() : value));
members = [host, caller];
assert.equal((await api.fundingDeposit({ ...review, paidBeforeStroops: "0", amountStroops: "1234567" })).ok, true);

const expected = [
  { method: "create_installment_room", native: { host: caller, code: "444444", name: "ABI contract validation",
    member_target: 3, share: 12_345_678n, cadence: { tag: "Weekly" }, funding_deadline: BigInt(now + 7 * 86400) } },
  { method: "join_room", native: { room_id: 1, code: "FAM234", member: caller } },
  { method: "deposit_room", native: { room_id: 1, member: caller, amount: 1_234_567n } },
];
for (let index = 0; index < expected.length; index++) {
  const want = expected[index], actual = captured[index];
  assert.equal(actual.method, want.method);
  const encoded = spec.funcArgsToScVals(want.method, want.native);
  assert.equal(actual.args.length, spec.getFunc(want.method).inputs().length);
  assert.deepEqual(Array.from(actual.args, value => value.toXDR("base64")), encoded.map(value => value.toXDR("base64")));
}
assert.equal(captured.length, 3);
console.log(JSON.stringify({ ok: true, evidence: "Rust macro-generated specification compared with executing production server action builders and actual Stellar SDK ScVals", checks: [
  "create_installment_room 7 encoded arguments", "join_room 3 encoded arguments", "deposit_room 3 encoded arguments",
  "get_room Rust fields/enums decoded by production SDK", "funding_state Rust fields/enums decoded by production SDK",
  "installment_contract_info Rust fields decoded by production SDK", "locked_of actual argument specification",
], networkRequests: 0, submittedTransactions: 0 }));
