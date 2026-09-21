// D4 retained-key Testnet deployment + acceptance evidence, never Mainnet.
// Uses existing owner-only D3 CLI identities; no wallet rows or keys are replaced.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Account, Address, BASE_FEE, Contract, Keypair, Networks, Operation, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";

const server = new rpc.Server("https://soroban-testnet.stellar.org");
assert.equal((await server.getNetwork()).passphrase, Networks.TESTNET);
const configDir = process.env.D4_STELLAR_CONFIG_DIR || resolve(homedir(), ".config/salapi-d3-testnet");
const wallets = [1, 2, 3].map(i => Keypair.fromSecret(execFileSync("stellar", ["keys", "secret", `salapi-d3-signer-${i}`, "--config-dir", configDir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()));
const [a, b, c] = wallets;
const tokenId = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const out = resolve(process.env.D4_EVIDENCE_DIR || "../output/d4-testnet");
mkdirSync(out, { recursive: true });
const wasm = readFileSync(resolve("../target/wasm32v1-none/release/donation_campaign.wasm"));
const entries: Record<string, unknown>[] = [];
let contractId = process.env.D4_CONTRACT_ID || "";
const stringify = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x, 2);
function save() { writeFileSync(resolve(out, "evidence.json"), stringify({ network: "Testnet", contractId,
  generatedAt: new Date().toISOString(), wasmSha256: createHash("sha256").update(wasm).digest("hex"),
  method: "SDK on-chain acceptance; not browser E2E", custody: "Existing managed Testnet identities on one operator computer; not independent operators",
  wallets: wallets.map(k => k.publicKey()), entries })); }
const addr = (s: string) => new Address(s).toScVal();
const u64 = (n: bigint) => nativeToScVal(n, { type: "u64" });
const i128 = (n: bigint) => nativeToScVal(n, { type: "i128" });
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
async function transaction(label: string, who: Keypair, operation: xdr.Operation, expectedError?: number) {
  const tx = new TransactionBuilder(await server.getAccount(who.publicKey()), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(operation).setTimeout(180).build();
  const simulation = await server.simulateTransaction(tx);
  if (expectedError !== undefined) {
    assert(rpc.Api.isSimulationError(simulation), `${label}: rejection expected`);
    assert.match(simulation.error, new RegExp(`Error\\(Contract, #${expectedError}\\)`));
    entries.push({ label, kind: "simulation-rejection", expectedError, error: simulation.error, ledger: simulation.latestLedger, unsignedEnvelopeXdr: tx.toXDR() }); save();
    console.log(`PASS ${label} (simulation rejected; not submitted)`); return null;
  }
  if (rpc.Api.isSimulationError(simulation)) throw new Error(`${label}: ${simulation.error}`);
  const prepared = rpc.assembleTransaction(tx, simulation).build(); prepared.sign(who);
  const sent = await server.sendTransaction(prepared);
  assert.notEqual(sent.status, "ERROR", `${label}: send failed`);
  let result = await server.getTransaction(sent.hash);
  for (let n = 0; n < 80 && result.status === "NOT_FOUND"; n++) { await delay(1500); result = await server.getTransaction(sent.hash); }
  assert.equal(result.status, "SUCCESS", `${label}: ${result.status}`);
  if (result.status !== "SUCCESS") throw new Error("Transaction failed");
  const raw = await fetch("https://soroban-testnet.stellar.org", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: { hash: sent.hash } }) }).then(r => r.json());
  entries.push({ label, kind: "transaction", hash: sent.hash, ledger: result.ledger, signer: who.publicKey(),
    envelopeXdr: prepared.toXDR(), resultXdr: result.resultXdr.toXDR("base64"), resultMetaXdr: result.resultMetaXdr.toXDR("base64"), rawRpc: raw }); save();
  console.log(`PASS ${label}: ${sent.hash}`);
  return { value: result.returnValue ? scValToNative(result.returnValue) : null, fee: BigInt(result.resultXdr.feeCharged().toString()) };
}
async function read(method: string, args: xdr.ScVal[] = [], id = contractId): Promise<unknown> {
  const tx = new TransactionBuilder(new Account(a.publicKey(), "0"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(id).call(method, ...args)).setTimeout(30).build();
  const result = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(result)) throw new Error(result.error);
  return result.result ? scValToNative(result.result.retval) : null;
}
const call = (label: string, who: Keypair, method: string, args: xdr.ScVal[], error?: number) => transaction(label, who, new Contract(contractId).call(method, ...args), error);
const balance = (who: Keypair) => read("balance", [addr(who.publicKey())], tokenId) as Promise<bigint>;
for (const who of wallets) await server.getAccount(who.publicKey());
if (!contractId) {
  const upload = await transaction("upload_wasm", c, Operation.uploadContractWasm({ wasm }));
  const deploy = await transaction("deploy_campaign_contract", c, Operation.createCustomContract({ address: new Address(c.publicKey()),
    wasmHash: upload!.value as Buffer, salt: randomBytes(32), constructorArgs: [addr(tokenId)] }));
  contractId = String(deploy!.value); save();
}
console.log(`D4_CONTRACT_ID=${contractId}`);
assert.equal(await read("version"), 4); assert.equal(await read("token"), tokenId);
const now = await read("clock") as bigint;
const funding = now + 140n, review = now + 260n;
const config = (overrides: Record<string, xdr.ScVal | xdr.ScVal[]> = {}) => nativeToScVal({ creator: addr(a.publicKey()), beneficiary: addr(b.publicKey()),
  token: addr(tokenId), creator_cut_bps: nativeToScVal(500, { type: "u32" }), funding_deadline: u64(funding), review_deadline: u64(review),
  approvers: wallets.map(w => addr(w.publicKey())), ...overrides });
const title = (s: string) => nativeToScVal(s, { type: "string" });
await call("duplicate_approvers_rejected", a, "create", [config({ approvers: [addr(a.publicKey()), addr(a.publicKey()), addr(c.publicKey())] }), title("Rejected")], 2);
const release = BigInt((await call("create_release_campaign", a, "create", [config(), title("D4 release acceptance")]))!.value as bigint);
const refund = BigInt((await call("create_refund_campaign", a, "create", [config(), title("D4 refund acceptance")]))!.value as bigint);
const proofBytes = readFileSync(resolve("public/evidence/d4-demo-proof.txt"));
const hash = createHash("sha256").update(proofBytes).digest();
const proof = nativeToScVal({ hash: xdr.ScVal.scvBytes(hash), url: title("https://salapi.app/evidence/d4-demo-proof.txt") });
await call("donate_release_100_0000001_xlm", c, "donate", [u64(release), addr(c.publicKey()), i128(1_000_000_001n)]);
await call("donate_refund_a_30_xlm", a, "donate", [u64(refund), addr(a.publicKey()), i128(300_000_000n)]);
await call("donate_refund_b_20_xlm", b, "donate", [u64(refund), addr(b.publicKey()), i128(200_000_000n)]);
await call("early_proof_rejected", a, "submit_proof", [u64(release), proof], 8);
await call("early_refund_rejected", a, "refund", [u64(refund), addr(a.publicKey())], 8);
while (await read("clock") as bigint < funding) { console.log("Waiting for funding deadline"); await delay(10000); }
await call("late_donation_rejected", c, "donate", [u64(release), addr(c.publicKey()), i128(1n)], 6);
await call("submit_release_proof", a, "submit_proof", [u64(release), proof]);
await call("repeated_proof_rejected", a, "submit_proof", [u64(release), proof], 10);
await call("approve_release_a", a, "approve", [u64(release), addr(a.publicKey()), xdr.ScVal.scvBytes(hash)]);
await call("duplicate_approval_rejected", a, "approve", [u64(release), addr(a.publicKey()), xdr.ScVal.scvBytes(hash)], 13);
await call("below_quorum_release_rejected", c, "release", [u64(release)], 14);
await call("wrong_hash_rejected", b, "approve", [u64(release), addr(b.publicKey()), xdr.ScVal.scvBytes(Buffer.alloc(32, 9))], 11);
await call("approve_release_b", b, "approve", [u64(release), addr(b.publicKey()), xdr.ScVal.scvBytes(hash)]);
const beforeCreator = await balance(a), beforeBeneficiary = await balance(b);
await call("release_exact_split", c, "release", [u64(release)]);
assert.equal(await balance(a) - beforeCreator, 50_000_000n);
assert.equal(await balance(b) - beforeBeneficiary, 950_000_001n);
await call("double_release_rejected", c, "release", [u64(release)], 7);
while (await read("clock") as bigint < review) { console.log("Waiting for review deadline"); await delay(10000); }
await call("refund_after_release_rejected", c, "refund", [u64(release), addr(c.publicKey())], 7);
const beforeA = await balance(a);
const refundedA = await call("refund_a_full_30_xlm", a, "refund", [u64(refund), addr(a.publicKey())]);
assert.equal(await balance(a) - beforeA + refundedA!.fee, 300_000_000n);
await call("double_refund_rejected", a, "refund", [u64(refund), addr(a.publicKey())], 16);
const beforeB = await balance(b);
const refundedB = await call("refund_b_full_20_xlm", b, "refund", [u64(refund), addr(b.publicKey())]);
assert.equal(await balance(b) - beforeB + refundedB!.fee, 200_000_000n);
await call("release_after_refund_rejected", c, "release", [u64(refund)], 7);
const finalRelease = await read("campaign", [u64(release)]) as { escrow: bigint; state: string[] };
const finalRefund = await read("campaign", [u64(refund)]) as { escrow: bigint; state: string[] };
assert.equal(finalRelease.escrow, 0n); assert.deepEqual(finalRelease.state, ["Released"]);
assert.equal(finalRefund.escrow, 0n); assert.deepEqual(finalRefund.state, ["Closed"]);
entries.push({ label: "final_state", kind: "read", releaseId: release, refundId: refund, finalRelease, finalRefund,
  creatorPayout: "50000000", beneficiaryPayout: "950000001", refunds: ["300000000", "200000000"], zeroCampaignEscrow: true }); save();
console.log("D4 TESTNET ACCEPTANCE PASSED");
