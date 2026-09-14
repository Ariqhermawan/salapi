// Isolated Testnet acceptance run. All keys are generated in memory and never
// printed or persisted. The resulting contract is evidence-only, NOT a live-app
// deployment: its throwaway signers are lost when this process exits.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, Address, BASE_FEE, Contract, Keypair, Networks, Operation, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";

const server = new rpc.Server("https://soroban-testnet.stellar.org");
assert.equal((await server.getNetwork()).passphrase, Networks.TESTNET);
const out = resolve(process.env.D3_EVIDENCE_DIR || "../output/d3-testnet");
mkdirSync(out, { recursive: true });
const wasmPath = resolve("../target/wasm32v1-none/release/disaster.wasm");
const wasm = readFileSync(wasmPath);
const wallets = Array.from({ length: 5 }, () => Keypair.random());
const [a, b, c, donor, payee] = wallets;
const tokenId = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const entries: Record<string, unknown>[] = [];
let contractId = "";
const stringify = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v, 2);
function save() {
  writeFileSync(resolve(out, "evidence.json"), stringify({ network: "Testnet", evidenceOnly: true,
    note: "Disposable in-memory signer keys. Not configured for salapi.app; not a custody-decentralization claim.",
    contractId, wasmSha256: createHash("sha256").update(wasm).digest("hex"),
    signers: [a, b, c].map(k => k.publicKey()), donor: donor.publicKey(), recipient: payee.publicKey(),
    generatedAt: new Date().toISOString(), entries }));
}
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const addr = (v: string) => new Address(v).toScVal();
const sym = (v: string) => nativeToScVal(v, { type: "symbol" });
const u64 = (v: bigint) => nativeToScVal(v, { type: "u64" });
const i128 = (v: bigint) => nativeToScVal(v, { type: "i128" });

for (const [i, wallet] of wallets.entries()) {
  let funded = false;
  for (let attempt = 0; attempt < 4 && !funded; attempt++) {
    const response = await fetch(`https://friendbot.stellar.org/?addr=${wallet.publicKey()}`);
    if (response.ok) funded = true;
    else { await response.text(); await delay(3000); }
  }
  assert(funded, `Could not fund disposable wallet ${i + 1}`);
  console.log(`Funded Testnet wallet ${i + 1}/5`);
}

async function transaction(label: string, who: Keypair, op: xdr.Operation, rejectedCode?: number) {
  const source = await server.getAccount(who.publicKey());
  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(op).setTimeout(180).build();
  const simulation = await server.simulateTransaction(tx);
  if (rejectedCode !== undefined) {
    assert(rpc.Api.isSimulationError(simulation), `${label}: expected rejection`);
    assert.match(simulation.error, new RegExp(`Error\\(Contract, #${rejectedCode}\\)`));
    entries.push({ label, kind: "simulation-rejection", expectedContractError: rejectedCode, error: simulation.error,
      ledger: simulation.latestLedger, unsignedEnvelopeXdr: tx.toXDR() }); save();
    console.log(`PASS ${label} (simulation rejected #${rejectedCode}; not submitted)`);
    return null;
  }
  if (rpc.Api.isSimulationError(simulation)) throw new Error(`${label}: ${simulation.error}`);
  const prepared = rpc.assembleTransaction(tx, simulation).build();
  prepared.sign(who);
  const sent = await server.sendTransaction(prepared);
  assert.notEqual(sent.status, "ERROR", `${label}: send failed`);
  let result = await server.getTransaction(sent.hash);
  for (let attempt = 0; attempt < 50 && result.status === "NOT_FOUND"; attempt++) {
    await delay(1500); result = await server.getTransaction(sent.hash);
  }
  assert.equal(result.status, "SUCCESS", `${label}: ${result.status}`);
  if (result.status !== "SUCCESS") throw new Error("Transaction did not succeed");
  entries.push({ label, kind: "transaction", hash: sent.hash, ledger: result.ledger,
    envelopeXdr: prepared.toXDR(), resultXdr: result.resultXdr.toXDR("base64"),
    resultMetaXdr: result.resultMetaXdr.toXDR("base64"), signer: who.publicKey() }); save();
  console.log(`PASS ${label}: ${sent.hash}`);
  return result.returnValue ? scValToNative(result.returnValue) : null;
}
async function read(method: string, args: xdr.ScVal[] = [], id = contractId): Promise<unknown> {
  const tx = new TransactionBuilder(new Account(a.publicKey(), "0"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(id).call(method, ...args)).setTimeout(60).build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return sim.result ? scValToNative(sim.result.retval) : null;
}
async function invoke(label: string, who: Keypair, method: string, args: xdr.ScVal[], error?: number) {
  return transaction(label, who, new Contract(contractId).call(method, ...args), error);
}
async function propose(label: string, action: xdr.ScVal[]) {
  return BigInt(await invoke(label, a, "propose", [addr(a.publicKey()), xdr.ScVal.scvVec(action)]) as bigint);
}
async function approve(label: string, who: Keypair, id: bigint) { await invoke(label, who, "approve", [addr(who.publicKey()), u64(id)]); }
async function execute(label: string, id: bigint, error?: number) { await invoke(label, c, "execute", [addr(c.publicKey()), u64(id)], error); }

const hash = await transaction("upload_wasm", a, Operation.uploadContractWasm({ wasm }));
const args = [xdr.ScVal.scvVec([a, b, c].map(k => addr(k.publicKey()))), addr(tokenId),
  nativeToScVal(2000, { type: "u32" }), nativeToScVal(20, { type: "u32" })];
contractId = String(await transaction("deploy_with_atomic_constructor", a, Operation.createCustomContract({
  address: Address.fromString(a.publicKey()), wasmHash: hash as Buffer, salt: randomBytes(32), constructorArgs: args,
})));
save(); copyFileSync(wasmPath, resolve(out, "disaster.wasm"));
console.log(`D3_EVIDENCE_CONTRACT=${contractId}`);
assert.equal(await read("version"), 3);
const cfg = await read("config") as { signers: string[]; cap_bps: number; timelock_ledgers: number };
assert.deepEqual(cfg.signers, [a, b, c].map(k => k.publicKey()));
assert.equal(cfg.cap_bps, 2000); assert.equal(cfg.timelock_ledgers, 20);
assert.equal(await read("total"), 0n);
await invoke("contribute_100_xlm_while_paused", donor, "contribute", [addr(donor.publicKey()), i128(1_000_000_000n)]);
const u = await propose("propose_unpause", [sym("Unpause")]);
await approve("unpause_approval_a", a, u);
await execute("unpause_below_threshold_rejected", u, 10);
await invoke("non_signer_approval_rejected", donor, "approve", [addr(donor.publicKey()), u64(u)], 4);
await approve("unpause_approval_b", b, u);
await execute("unpause_success", u);
const first = await propose("propose_payout_10_xlm", [sym("Disburse"), addr(payee.publicKey()), i128(100_000_000n)]);
await approve("payout_approval_a", a, first);
await invoke("duplicate_approval_rejected", a, "approve", [addr(a.publicKey()), u64(first)], 8);
await execute("payout_below_threshold_rejected", first, 10);
await approve("payout_approval_b", b, first);
await execute("pre_timelock_rejected", first, 11);
const second = await propose("propose_over_cap_10_xlm", [sym("Disburse"), addr(payee.publicKey()), i128(100_000_000n)]);
await approve("second_approval_a", a, second); await approve("second_approval_b", b, second);
const third = await propose("propose_exact_allowance_8_xlm", [sym("Disburse"), addr(payee.publicKey()), i128(80_000_000n)]);
await approve("third_approval_b", b, third); await approve("third_approval_c", c, third);
const pause = await propose("propose_pause", [sym("Pause")]);
await approve("pause_approval_a", a, pause); await execute("pause_below_threshold_rejected", pause, 10);
await approve("pause_approval_b", b, pause); await execute("pause_success", pause);
const ready = (await read("proposal", [u64(third)]) as { ready_ledger: number }).ready_ledger;
while ((await server.getLatestLedger()).sequence < ready) { console.log(`Waiting for timelock ledger ${ready}`); await delay(6000); }
await execute("paused_payout_rejected", first, 12);
const unpause = await propose("propose_resume", [sym("Unpause")]);
await approve("resume_approval_a", a, unpause); await approve("resume_approval_c", c, unpause); await execute("resume_success", unpause);
const recipientBefore = await read("balance", [addr(payee.publicKey())], tokenId) as bigint;
await execute("payout_10_xlm_success", first);
assert.equal(await read("total"), 900_000_000n);
await execute("rolling_cap_rejected", second, 13);
await execute("exact_cap_payout_8_xlm_success", third);
await execute("double_execution_rejected", first, 9);
assert.equal(await read("total"), 820_000_000n);
assert.equal(await read("balance", [addr(payee.publicKey())], tokenId), recipientBefore + 180_000_000n);
entries.push({ label: "final_state", kind: "read", config: await read("config"), status: await read("status"),
  proposals: await read("proposals", [u64(0n), nativeToScVal(20, { type: "u32" })]) });
save(); console.log(`D3 TESTNET PASS. Public evidence: ${out}/evidence.json`);
