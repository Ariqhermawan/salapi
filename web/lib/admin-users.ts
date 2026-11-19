// Pure admin-panel helpers (no I/O). The server loader and the HTML view both
// build on these, and scripts/admin-panel.test.mts covers them directly.

export type AdminSegment = "real" | "simulation" | "load_test" | "qa";
export type AdminSegmentFilter = AdminSegment | "all";

export interface AdminAuthUser {
  id: string;
  email?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

export interface AdminQuery { segment: AdminSegmentFilter; q: string; page: number }
export interface MonthlySignups { month: string; total: number; real: number }

/** "none" is a confirmed absence; "error" means the read failed and proves nothing. */
export type Lookup<T> = { status: "ok"; value: T } | { status: "none" } | { status: "error" };
export interface AdminAccountRow {
  user: AdminAuthUser;
  wallet: Lookup<string>;
  username: Lookup<string>;
  sentTx: Lookup<number>;
}

export const ADMIN_PAGE_SIZE = 25;
export const SEGMENT_FILTERS: readonly AdminSegmentFilter[] = ["all", "real", "simulation", "load_test", "qa"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const MAX_QUERY_LENGTH = 100;

/**
 * Segment an account so test traffic never reads as traction.
 * - simulation: app_metadata.synthetic, set only by the service role (the
 *   closed 50-account Testnet simulation).
 * - load_test: user_metadata.is_load_test_user. Users can edit their own
 *   user_metadata, so this can only move an account OUT of "real", never in.
 * - qa: reserved non-deliverable TLDs (.invalid, .test) can't belong to a person.
 */
export function accountSegment(user: AdminAuthUser): AdminSegment {
  if (user.app_metadata?.synthetic === true) return "simulation";
  if (user.user_metadata?.is_load_test_user === true) return "load_test";
  if (/\.(invalid|test)$/i.test(user.email ?? "")) return "qa";
  return "real";
}

/** Comma/space separated Supabase user IDs. Anything not a UUID is ignored. */
export function parseAdminIds(value: string | undefined): ReadonlySet<string> {
  return new Set((value ?? "").split(/[\s,]+/).filter(id => UUID.test(id)).map(id => id.toLowerCase()));
}

/** Calendar month in WIB (UTC+7, no DST), e.g. "2026-11". */
export function wibMonth(iso: string): string {
  return new Date(Date.parse(iso) + WIB_OFFSET_MS).toISOString().slice(0, 7);
}

/** Every month from the first signup through `now`, zero-filled, oldest first. */
export function monthlySignups(users: readonly AdminAuthUser[], now: Date): MonthlySignups[] {
  const counts = new Map<string, MonthlySignups>();
  for (const user of users) {
    if (!Number.isFinite(Date.parse(user.created_at))) continue;
    const month = wibMonth(user.created_at);
    const row = counts.get(month) ?? { month, total: 0, real: 0 };
    counts.set(month, { month, total: row.total + 1, real: row.real + (accountSegment(user) === "real" ? 1 : 0) });
  }
  if (!counts.size) return [];
  const keys = [...counts.keys()].sort();
  // A clock-skewed future signup still shows, instead of silently vanishing.
  const last = [wibMonth(now.toISOString()), keys.at(-1) ?? ""].sort().at(-1) as string;
  const months: MonthlySignups[] = [];
  let [year, month] = keys[0].split("-").map(Number);
  for (;;) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    months.push(counts.get(key) ?? { month: key, total: 0, real: 0 });
    if (key >= last || months.length >= 600) return months;
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
}

/**
 * Transactions this account has submitted (as source), read from its sequence
 * number: a Testnet account starts at creationLedger << 32 and every included
 * transaction it sources, successful or failed, adds 1. Incoming payments do
 * not count. Assumes no BumpSequence ops, which Salapi never builds.
 */
export function sentTransactionCount(sequence: unknown): number | null {
  if (typeof sequence !== "string" || !/^\d{1,20}$/.test(sequence)) return null;
  return Number(BigInt(sequence) & 0xffffffffn);
}

export function parseAdminQuery(params: URLSearchParams): AdminQuery {
  const segment = params.get("segment") ?? "all";
  const page = Number(params.get("page"));
  return {
    segment: (SEGMENT_FILTERS as readonly string[]).includes(segment) ? segment as AdminSegmentFilter : "all",
    q: (params.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

/** Newest first, filtered by segment and an email / user ID substring. */
export function filterUsers(users: readonly AdminAuthUser[], query: AdminQuery): AdminAuthUser[] {
  const needle = query.q.toLowerCase();
  return users
    .filter(user => query.segment === "all" || accountSegment(user) === query.segment)
    .filter(user => !needle || (user.email ?? "").toLowerCase().includes(needle) || user.id.toLowerCase().includes(needle))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
