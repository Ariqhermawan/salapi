import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { loadAccountRows, loadAdminDirectory } from "@/lib/server/adminDirectory";
import { wibDay, type AccountSnapshot, type SnapshotState } from "@/lib/admin-users";

const TABLE = "admin_account_snapshots";
const DAY_MS = 86_400_000;
const PAGE = 1000; // PostgREST's default row cap per request
const WEEK_DAYS = 7;

export interface SnapshotRun { ok: true; day: string; written: number; skipped: number; recent?: true }
/** A second run within this window does nothing (bounds Horizon/RPC load if the trigger is abused). */
const COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Today's (WIB) username + sent-tx snapshot for every account. An account with
 * any failed read is skipped rather than recorded as "none" or 0.
 * ponytail: all on-chain reads in one invocation (6 at a time) fit the cron's
 * maxDuration up to roughly 600 accounts; past that, spread users across runs.
 */
export async function writeAccountSnapshot(now = new Date()): Promise<SnapshotRun> {
  const day = wibDay(now.toISOString());
  const last = await createSupabaseAdmin().from(TABLE).select("captured_at").order("captured_at", { ascending: false }).limit(1).maybeSingle();
  if (last.error) throw new Error("Snapshot read failed.");
  if (last.data && now.getTime() - Date.parse(String(last.data.captured_at)) < COOLDOWN_MS) return { ok: true, day, written: 0, skipped: 0, recent: true };
  const { users } = await loadAdminDirectory();
  const rows = await loadAccountRows(users);
  const records = rows
    .filter(row => row.wallet.status !== "error" && row.username.status !== "error" && row.sentTx.status !== "error")
    .map(row => ({
      day,
      user_id: row.user.id,
      wallet: row.wallet.status === "ok" ? row.wallet.value : null,
      username: row.username.status === "ok" ? row.username.value : null,
      tx_sent: row.sentTx.status === "ok" ? row.sentTx.value : 0,
      captured_at: now.toISOString(),
    }));
  const db = createSupabaseAdmin();
  for (let i = 0; i < records.length; i += PAGE) {
    const { error } = await db.from(TABLE).upsert(records.slice(i, i + PAGE), { onConflict: "day,user_id" });
    if (error) throw new Error("Snapshot write failed.");
  }
  return { ok: true, day, written: records.length, skipped: rows.length - records.length };
}

/** Latest snapshot plus the newest one at least a week older, or null before the first run. */
export async function readSnapshotState(): Promise<SnapshotState | null> {
  const db = createSupabaseAdmin();
  const latest = await db.from(TABLE).select("day, captured_at").order("captured_at", { ascending: false }).limit(1).maybeSingle();
  if (latest.error) throw new Error("Snapshot read failed.");
  if (!latest.data) return null;
  const day = String(latest.data.day);
  const cutoff = new Date(Date.parse(`${day}T00:00:00Z`) - WEEK_DAYS * DAY_MS).toISOString().slice(0, 10);
  const prior = await db.from(TABLE).select("day").lte("day", cutoff).order("day", { ascending: false }).limit(1).maybeSingle();
  if (prior.error) throw new Error("Snapshot read failed.");
  const weekAgoDay = prior.data ? String(prior.data.day) : null;
  const [current, weekAgo] = await Promise.all([readDay(day), weekAgoDay ? readDay(weekAgoDay) : Promise.resolve(null)]);
  return { day, capturedAt: String(latest.data.captured_at), latest: current, weekAgoDay, weekAgo };
}

async function readDay(day: string): Promise<ReadonlyMap<string, AccountSnapshot>> {
  const db = createSupabaseAdmin();
  const rows = new Map<string, AccountSnapshot>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(TABLE).select("user_id, wallet, username, tx_sent").eq("day", day)
      .order("user_id").range(from, from + PAGE - 1);
    if (error) throw new Error("Snapshot read failed.");
    for (const row of data ?? []) rows.set(String(row.user_id), {
      wallet: typeof row.wallet === "string" ? row.wallet : null,
      username: typeof row.username === "string" ? row.username : null,
      txSent: Number(row.tx_sent) || 0,
    });
    if ((data ?? []).length < PAGE) return rows;
  }
}
