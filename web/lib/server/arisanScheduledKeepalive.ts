import "server-only";
import { randomUUID } from "node:crypto";
import { Address, BASE_FEE, Contract, Keypair, Networks, rpc, scValToNative, SorobanDataBuilder, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { isLocalPreview } from "@/lib/local-preview";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseAdminConfigured } from "@/lib/supabase/env";
import { arisanGatheringContract, readArisanNotificationRoom } from "./arisanGatherings";
import { RPC_URL, sc } from "./stellar";

/** Operational rent only, never a member contribution, draw or payout. A fixed
 * total fee cap includes inclusion and resources: 5 valueless Testnet XLM. */
export const ARISAN_KEEPALIVE_MAX_FEE = "50000000";
const TIMEOUT = 4000;
type Job = { contract_id: string; room_id: number; pending_hash: string | null; pending_envelope: string | null; pending_min_time: number | null; pending_max_time: number | null };
type Outcome = "confirmed" | "failed" | "expired" | "deferred" | "pending";
export type ArisanKeepaliveResult = { ok: boolean; checked: number; confirmed: number; pending: number; failed: number; disabled?: boolean; error?: string };
async function bounded<T>(task: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([Promise.resolve(task), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("operational_timeout")), TIMEOUT); })]); }
  finally { if (timer) clearTimeout(timer); }
}
/** Recovery envelopes must retain the one scoped operation, signer, no Soroban
 * auth entries, network, bounded times and fee cap. No generic invoke is used. */
export function validArisanKeepaliveEnvelope(tx: Transaction, contractId: string, roomId: number, signer: Keypair, minTime: number, maxTime: number): boolean {
  try {
    if (tx.networkPassphrase !== Networks.TESTNET || tx.source !== signer.publicKey() || tx.operations.length !== 1 || tx.signatures.length !== 1
      || !/^[1-9][0-9]{0,9}$/.test(tx.fee) || BigInt(tx.fee) > BigInt(ARISAN_KEEPALIVE_MAX_FEE) || tx.memo.type !== "none"
      || tx.timeBounds?.minTime !== String(minTime) || tx.timeBounds.maxTime !== String(maxTime) || maxTime <= minTime || maxTime - minTime > 120
      || (tx.extraSigners?.length ?? 0) !== 0 || !signer.verify(tx.hash(), tx.signatures[0].signature())) return false;
    const op = tx.operations[0];
    if (op.type !== "invokeHostFunction" || op.source && op.source !== signer.publicKey() || (op.auth?.length ?? 0) !== 0) return false;
    const call = op.func.invokeContract();
    return Address.fromScAddress(call.contractAddress()).toString() === contractId && call.functionName().toString() === "keepalive_room"
      && call.args().length === 1 && call.args()[0].switch().name === "scvU32" && scValToNative(call.args()[0]) === roomId;
  } catch { return false; }
}

/** One durable job per cron run. A daily confirmed cadence is NOT a guarantee
 * against missed operations or Testnet resets. Archived entries need manual
 * restoration; this worker refuses restore, extra auth and above-cap fees. */
export async function dispatchArisanScheduledKeepalive(): Promise<ArisanKeepaliveResult> {
  const base = { checked: 0, confirmed: 0, pending: 0, failed: 0 };
  const contractId = arisanGatheringContract("scheduled");
  if (isLocalPreview || !contractId) return { ok: true, ...base, disabled: true };
  if (!supabaseAdminConfigured() || !process.env.SALAPI_DEMO_SECRET) return { ok: false, ...base, failed: 1, error: "Operational keepalive is not configured." };
  let db: ReturnType<typeof createSupabaseAdmin> | undefined, job: Job | undefined, signer: Keypair | undefined;
  const token = randomUUID(); let pendingHash: string | null = null;
  const finish = async (outcome: Outcome, error: string | null = null) => {
    if (!db || !job || !signer) throw Error("lease_unavailable");
    const result = await bounded(db.rpc("arisan_scheduled_keepalive_finish", { p_contract: contractId, p_room: job.room_id, p_signer: signer.publicKey(), p_token: token, p_hash: pendingHash, p_outcome: outcome, p_error: error }));
    if (result.error || result.data !== true) throw Error("lease_finish_unconfirmed");
  };
  try {
    signer = Keypair.fromSecret(process.env.SALAPI_DEMO_SECRET);
    const configuredPublic = process.env.SALAPI_DEMO_PUBLIC?.trim();
    if (configuredPublic && configuredPublic !== signer.publicKey()) throw Error("operational_signer_mismatch");
    db = createSupabaseAdmin();
    const claimed = await bounded(db.rpc("arisan_scheduled_keepalive_claim", { p_contract: contractId, p_signer: signer.publicKey(), p_token: token }));
    if (claimed.error) throw Error("lease_unavailable");
    if (!claimed.data) return { ok: true, ...base };
    if (claimed.data.contract_id !== contractId || !Number.isSafeInteger(Number(claimed.data.room_id)) || Number(claimed.data.room_id) < 1 || Number(claimed.data.room_id) > 0xffff_ffff) throw Error("invalid_operational_job");
    job = { ...claimed.data, room_id: Number(claimed.data.room_id) } as Job;
    pendingHash = job.pending_hash;
    const server = new rpc.Server(RPC_URL, { timeout: TIMEOUT });
    let prepared: Transaction;
    if (pendingHash) {
      if (!job.pending_envelope || !Number.isSafeInteger(job.pending_min_time) || !Number.isSafeInteger(job.pending_max_time)) throw Error("invalid_recovery_envelope");
      const parsed = TransactionBuilder.fromXDR(job.pending_envelope, Networks.TESTNET);
      if (!(parsed instanceof Transaction) || parsed.hash().toString("hex") !== pendingHash
        || !validArisanKeepaliveEnvelope(parsed, contractId, job.room_id, signer, job.pending_min_time!, job.pending_max_time!)) throw Error("invalid_recovery_envelope");
      prepared = parsed;
      const status = await bounded(server.getTransaction(pendingHash));
      if (status.status === "SUCCESS" || status.status === "FAILED") {
        await finish(status.status === "SUCCESS" ? "confirmed" : "failed", status.status === "FAILED" ? "onchain_failed" : null);
        return { ok: status.status === "SUCCESS", ...base, checked: 1, confirmed: status.status === "SUCCESS" ? 1 : 0, failed: status.status === "FAILED" ? 1 : 0 };
      }
      if (status.status !== "NOT_FOUND") throw Error("unknown_transaction_status");
      // Ledger time, not the browser/server clock, proves the entire validity
      // window passed. If RPC retention already lost that window, keep pending.
      if (status.latestLedgerCloseTime > job.pending_max_time! + 30 && status.oldestLedgerCloseTime <= job.pending_min_time!) {
        await finish("expired", "expired_without_acceptance");
        return { ok: false, ...base, checked: 1, failed: 1, error: "Keepalive expired without recorded acceptance; retry is deferred." };
      }
      if (Date.now() / 1000 > job.pending_max_time!) {
        await finish("pending", "acceptance_unknown");
        return { ok: false, ...base, checked: 1, pending: 1, failed: 1,
          error: "An expired rent-maintenance submission has unknown acceptance. Manual operational review is required. Its saved envelope is retained; no replacement was submitted." };
      }
      // Only this exact already persisted envelope may be retransmitted.
    } else {
      const room = await readArisanNotificationRoom({ kind: "scheduled", roomId: job.room_id });
      if (room.contractId !== contractId || !["Open", "Active"].includes(room.status)) {
        await finish("deferred", "room_inactive"); return { ok: true, ...base, checked: 1 };
      }
      const seconds = Math.floor(Date.now() / 1000), source = await bounded(server.getAccount(signer.publicKey()));
      const built = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addOperation(new Contract(contractId).call("keepalive_room", sc.u32(job.room_id))).setTimebounds(seconds - 5, seconds + 60).build();
      const simulation = await bounded(server.simulateTransaction(built));
      if (!rpc.Api.isSimulationSuccess(simulation) || rpc.Api.isSimulationRestore(simulation) || !simulation.result || simulation.result.auth.length !== 0) throw Error("keepalive_restore_or_auth_required");
      prepared = rpc.assembleTransaction(built, simulation).build();
      const data = prepared.toEnvelope().v1().tx().ext().sorobanData(), fee = BigInt(data.resourceFee().toString());
      const buffered = fee + (fee + 9n) / 10n;
      if (buffered + BigInt(BASE_FEE) > BigInt(ARISAN_KEEPALIVE_MAX_FEE)) throw Error("keepalive_fee_cap");
      prepared = TransactionBuilder.cloneFrom(prepared, { fee: BASE_FEE, sorobanData: new SorobanDataBuilder(data).setResourceFee(buffered.toString()).build(), networkPassphrase: Networks.TESTNET }).build();
      if (BigInt(prepared.fee) > BigInt(ARISAN_KEEPALIVE_MAX_FEE)) throw Error("keepalive_fee_cap");
      prepared.sign(signer);
      if (!validArisanKeepaliveEnvelope(prepared, contractId, job.room_id, signer, seconds - 5, seconds + 60)) throw Error("invalid_operational_envelope");
      pendingHash = prepared.hash().toString("hex");
      const stored = await bounded(db.rpc("arisan_scheduled_keepalive_prepare", { p_contract: contractId, p_room: job.room_id, p_signer: signer.publicKey(), p_token: token,
        p_hash: pendingHash, p_envelope: prepared.toXDR(), p_min_time: seconds - 5, p_max_time: seconds + 60 }));
      if (stored.error || stored.data !== true) throw Error("envelope_store_unconfirmed");
    }
    // A thrown/lost send response never clears the durable pending identity.
    await bounded(server.sendTransaction(prepared));
    const result = await bounded(server.getTransaction(pendingHash!));
    if (result.status === "SUCCESS" || result.status === "FAILED") {
      await finish(result.status === "SUCCESS" ? "confirmed" : "failed", result.status === "FAILED" ? "onchain_failed" : null);
      return { ok: result.status === "SUCCESS", ...base, checked: 1, confirmed: result.status === "SUCCESS" ? 1 : 0, failed: result.status === "FAILED" ? 1 : 0 };
    }
    await finish("pending", "acceptance_unknown"); return { ok: true, ...base, checked: 1, pending: 1 };
  } catch {
    // Do not expose envelopes, credentials, provider errors or their contents.
    if (job && signer && db) await finish(pendingHash ? "pending" : "deferred", pendingHash ? "acceptance_unknown" : "operational_attempt_failed").catch(() => {});
    return { ok: false, ...base, checked: job ? 1 : 0, failed: 1, pending: pendingHash ? 1 : 0, error: "Scheduled rent maintenance needs operational review. No member payment or payout was authorized." };
  }
}
