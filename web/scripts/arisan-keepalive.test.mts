import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import * as sdk from "@stellar/stellar-sdk";
const now = Date.parse("2026-10-11T12:00:00.000Z"), seconds = now / 1000;
const contract = sdk.StrKey.encodeContract(Buffer.alloc(32, 3)), signer = sdk.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 5));
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
function envelope(change: { contract?: string; roomId?: number; method?: string; fee?: string; extraOp?: boolean } = {}) {
  let builder = new sdk.TransactionBuilder(new sdk.Account(signer.publicKey(), "0"), { fee: change.fee ?? "100", networkPassphrase: sdk.Networks.TESTNET })
    .addOperation(new sdk.Contract(change.contract ?? contract).call(change.method ?? "keepalive_room", sdk.nativeToScVal(change.roomId ?? 9, { type: "u32" }))).setTimebounds(seconds - 5, seconds + 60);
  if (change.extraOp) builder = builder.addOperation(sdk.Operation.manageData({ name: "not-allowed", value: "bad" }));
  const tx = builder.build(); tx.sign(signer); return tx;
}
type Options = { preview?: boolean; configured?: boolean; secret?: boolean; contract?: boolean; publicMismatch?: boolean; job?: Record<string, unknown> | null;
  roomStatus?: string; auth?: boolean; restore?: boolean; resourceFee?: string; storeFails?: boolean; sendLoses?: boolean; status?: "SUCCESS" | "FAILED" | "NOT_FOUND"; oldest?: number; latest?: number };
function harness(options: Options = {}) {
  const calls = { rpcs: [] as { name: string; args: Record<string, unknown> }[], sends: [] as sdk.Transaction[], accounts: [] as string[], simulated: [] as sdk.Transaction[], reads: 0 };
  const job: Record<string, unknown> = options.job ?? { contract_id: contract, room_id: 9, pending_hash: null, pending_envelope: null, pending_min_time: null, pending_max_time: null };
  const db = { async rpc(name: string, args: Record<string, unknown>) {
    calls.rpcs.push({ name, args });
    if (name === "arisan_scheduled_keepalive_claim") return { data: options.job === null ? null : job, error: null };
    if (name === "arisan_scheduled_keepalive_prepare" && options.storeFails) return { data: null, error: { code: "503" } };
    return { data: true, error: null };
  } };
  class Server {
    constructor(_url: string, cfg: { timeout: number }) { assert.equal(cfg.timeout, 4000); }
    async getAccount(publicKey: string) { calls.accounts.push(publicKey); return new sdk.Account(publicKey, "0"); }
    async simulateTransaction(tx: sdk.Transaction) {
      calls.simulated.push(tx); assert.equal(tx.signatures.length, 0);
      const data = new sdk.SorobanDataBuilder().setResourceFee(options.resourceFee ?? "1000");
      return { _parsed: true, id: "test", latestLedger: 100, events: [], minResourceFee: options.resourceFee ?? "1000", transactionData: data,
        result: { auth: options.auth ? [sdk.xdr.SorobanAuthorizationEntry] : [], retval: sdk.xdr.ScVal.scvVoid() }, ...(options.restore ? { restorePreamble: { minResourceFee: "10", transactionData: data } } : {}) };
    }
    async sendTransaction(tx: sdk.Transaction) { calls.sends.push(tx); if (options.sendLoses) throw Error("lost response"); return { status: "PENDING" }; }
    async getTransaction() { return { status: options.status ?? "SUCCESS", latestLedgerCloseTime: options.latest ?? seconds, oldestLedgerCloseTime: options.oldest ?? seconds - 1000 }; }
  }
  const exports = {} as typeof import("../lib/server/arisanScheduledKeepalive.ts");
  class ClockDate extends Date { static now() { return now; } }
  runInNewContext(compile("../lib/server/arisanScheduledKeepalive.ts"), { exports, Buffer, Date: ClockDate, setTimeout, clearTimeout,
    process: { env: { ...(options.secret === false ? {} : { SALAPI_DEMO_SECRET: signer.secret() }), SALAPI_DEMO_PUBLIC: options.publicMismatch ? sdk.Keypair.random().publicKey() : signer.publicKey() } },
    require(name: string) {
      if (name === "server-only") return {};
      if (name === "node:crypto") return crypto;
      if (name === "@stellar/stellar-sdk") return { ...sdk, rpc: { ...sdk.rpc, Server } };
      if (name === "@/lib/local-preview") return { isLocalPreview: options.preview ?? false };
      if (name === "@/lib/supabase/admin") return { createSupabaseAdmin: () => db };
      if (name === "@/lib/supabase/env") return { supabaseAdminConfigured: () => options.configured ?? true };
      if (name === "./arisanGatherings") return { arisanGatheringContract: () => options.contract === false ? null : contract,
        async readArisanNotificationRoom(scope: { kind: string; roomId: number }) { calls.reads++; assert.deepEqual(JSON.parse(JSON.stringify(scope)), { kind: "scheduled", roomId: 9 }); return { contractId: contract, status: options.roomStatus ?? "Active" }; } };
      if (name === "./stellar") return { RPC_URL: "https://soroban-testnet.stellar.org", sc: { u32: (value: number) => sdk.nativeToScVal(value, { type: "u32" }) } };
      throw Error(`Unexpected keepalive dependency ${name}`);
    },
  });
  return { ...exports, calls };
}
const pendingJob = (tx = envelope(), min = seconds - 5, max = seconds + 60) => ({ contract_id: contract, room_id: 9, pending_hash: tx.hash().toString("hex"), pending_envelope: tx.toXDR(), pending_min_time: min, pending_max_time: max });

test("rent maintenance is disabled in preview/unconfigured deployment and never borrows a member wallet", async () => {
  for (const options of [{ preview: true }, { contract: false }, { configured: false }, { secret: false }, { publicMismatch: true }]) {
    const h = harness(options); const result = await h.dispatchArisanScheduledKeepalive();
    assert.equal(result.disabled === true || result.ok === false, true); assert.equal(h.calls.sends.length, 0); assert.equal(h.calls.accounts.length, 0);
  }
});
test("only claimed active scheduled room gets one exact permissionless operation, persisted before send", async () => {
  const h = harness(); const result = await h.dispatchArisanScheduledKeepalive(); assert.equal(result.confirmed, 1);
  assert.deepEqual(h.calls.accounts, [signer.publicKey()]); assert.equal(h.calls.sends.length, 1);
  const stored = h.calls.rpcs.find(c => c.name.endsWith("_prepare"))!;
  assert.equal(stored.args.p_hash, h.calls.sends[0].hash().toString("hex")); assert.equal(stored.args.p_envelope, h.calls.sends[0].toXDR());
  assert.equal(stored.args.p_contract, contract); assert.equal(stored.args.p_room, 9);
  assert.equal(h.validArisanKeepaliveEnvelope(h.calls.sends[0], contract, 9, signer, seconds - 5, seconds + 60), true);
  assert.ok(BigInt(h.calls.sends[0].fee) <= BigInt(h.ARISAN_KEEPALIVE_MAX_FEE));
  const done = h.calls.rpcs.at(-1)!; assert.equal(done.args.p_outcome, "confirmed");
  assert.equal(JSON.stringify(result).includes("envelope"), false); assert.equal(JSON.stringify(result).includes(signer.secret()), false);
});
test("no job or finished room cannot submit a maintenance transaction", async () => {
  for (const options of [{ job: null }, { roomStatus: "Done" }, { roomStatus: "Dissolved" }]) {
    const h = harness(options); assert.equal((await h.dispatchArisanScheduledKeepalive()).ok, true); assert.equal(h.calls.sends.length, 0); assert.equal(h.calls.accounts.length, 0);
  }
});
test("restore, auth requests and cap-exceeding simulated resource fees fail before signing/persistence/send", async () => {
  for (const options of [{ restore: true }, { auth: true }, { resourceFee: "50000000" }]) {
    const h = harness(options); const result = await h.dispatchArisanScheduledKeepalive(); assert.equal(result.ok, false);
    assert.equal(h.calls.sends.length, 0); assert.equal(h.calls.rpcs.some(c => c.name.endsWith("_prepare")), false);
    assert.equal(h.calls.rpcs.at(-1)?.args.p_outcome, "deferred");
  }
});
test("unconfirmed envelope persistence and lost submission response never create a new identity retry", async () => {
  for (const options of [{ storeFails: true }, { sendLoses: true }]) {
    const h = harness(options); const result = await h.dispatchArisanScheduledKeepalive(); assert.equal(result.ok, false); assert.equal(result.pending, 1);
    assert.equal(h.calls.rpcs.at(-1)?.args.p_outcome, "pending"); assert.equal(h.calls.sends.length, options.storeFails ? 0 : 1);
  }
});
test("persisted pending SUCCESS reconciles without source account read, prepare, signing or resubmit", async () => {
  const h = harness({ job: pendingJob() }); const result = await h.dispatchArisanScheduledKeepalive(); assert.equal(result.confirmed, 1);
  assert.equal(h.calls.reads, 0); assert.equal(h.calls.accounts.length, 0); assert.equal(h.calls.sends.length, 0); assert.equal(h.calls.rpcs.some(c => c.name.endsWith("_prepare")), false);
});
test("still-valid pending NOT_FOUND may retransmit only the exact saved envelope", async () => {
  const job = pendingJob(), h = harness({ job, status: "NOT_FOUND" }); const result = await h.dispatchArisanScheduledKeepalive(); assert.equal(result.pending, 1);
  assert.equal(h.calls.sends.length, 1); assert.equal(h.calls.sends[0].toXDR(), job.pending_envelope); assert.equal(h.calls.accounts.length, 0);
});
test("ledger time proves expiry only when RPC retention still covers the original bounded window", async () => {
  const tx = new sdk.TransactionBuilder(new sdk.Account(signer.publicKey(), "0"), { fee: "100", networkPassphrase: sdk.Networks.TESTNET })
    .addOperation(new sdk.Contract(contract).call("keepalive_room", sdk.nativeToScVal(9, { type: "u32" }))).setTimebounds(seconds - 70, seconds - 5).build(); tx.sign(signer);
  const job = pendingJob(tx, seconds - 70, seconds - 5);
  const expired = harness({ job, status: "NOT_FOUND", latest: seconds + 40 }); assert.equal((await expired.dispatchArisanScheduledKeepalive()).failed, 1); assert.equal(expired.calls.rpcs.at(-1)?.args.p_outcome, "expired");
  const lostHistory = harness({ job, status: "NOT_FOUND", latest: seconds + 40, oldest: seconds - 1 });
  const unknown = await lostHistory.dispatchArisanScheduledKeepalive();
  assert.equal(unknown.ok, false); assert.equal(unknown.failed, 1); assert.equal(unknown.pending, 1); assert.equal(unknown.confirmed, 0);
  assert.match(unknown.error ?? "", /Manual operational review/);
  assert.equal(lostHistory.calls.rpcs.at(-1)?.args.p_outcome, "pending"); assert.equal(lostHistory.calls.rpcs.at(-1)?.args.p_hash, job.pending_hash);
  assert.equal(lostHistory.calls.accounts.length, 0); assert.equal(lostHistory.calls.simulated.length, 0); assert.equal(lostHistory.calls.rpcs.some(c => c.name.endsWith("_prepare")), false);
  assert.equal(expired.calls.sends.length + lostHistory.calls.sends.length, 0);
});
test("recovery rejects altered method, contract, room, extra operations, excessive fees and mismatched hash", async () => {
  for (const tx of [envelope({ method: "finalize_round" }), envelope({ contract: sdk.StrKey.encodeContract(Buffer.alloc(32, 4)) }), envelope({ roomId: 10 }), envelope({ extraOp: true }), envelope({ fee: "50000001" })]) {
    const h = harness({ job: pendingJob(tx) }); assert.equal((await h.dispatchArisanScheduledKeepalive()).ok, false); assert.equal(h.calls.sends.length, 0); assert.equal(h.calls.rpcs.at(-1)?.args.p_outcome, "pending");
  }
  const h = harness({ job: { ...pendingJob(), pending_hash: "a".repeat(64) } }); assert.equal((await h.dispatchArisanScheduledKeepalive()).ok, false); assert.equal(h.calls.sends.length, 0);
});
test("heartbeat SQL is service-only with signer lease and immutable pending envelope", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261011115432_arisan_scheduled_keepalive.sql", import.meta.url), "utf8");
  assert.match(sql, /room_kind='scheduled'/); assert.match(sql, /interval '7 days'/); assert.match(sql, /for update skip locked/);
  assert.match(sql, /pending_hash is null/); assert.match(sql, /p_outcome='deferred' and j.pending_hash is not null/);
  assert.match(sql, /from public,anon,authenticated/); assert.match(sql, /to service_role/); assert.doesNotMatch(sql, /security definer|create policy|grant .* to authenticated/i);
  for (const table of ["arisan_scheduled_keepalive", "arisan_operational_signer_leases"]) assert.ok(sql.includes(`alter table public.${table} enable row level security`));
});
test("final cadence migration uses daily confirmation and server total fee cap is fixed at5Testnet XLM", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261011122750_arisan_scheduled_daily_keepalive.sql", import.meta.url), "utf8");
  assert.match(sql, /last_confirmed_at<=now\(\)-interval '1 day'/); assert.doesNotMatch(sql, /interval '7 days'/);
  assert.match(sql, /from public,anon,authenticated/); assert.equal(harness().ARISAN_KEEPALIVE_MAX_FEE, "50000000");
});
