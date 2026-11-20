// Pure admin-panel helpers (no I/O). The server loader and the HTML view both
// build on these, and scripts/admin-panel.test.mts covers them directly.

export type AdminSegment = "real" | "team" | "simulation" | "load_test" | "qa";
export type AdminSegmentFilter = AdminSegment | "all";
/** Directory order: newest signup, most recent sign-in, or most sent transactions (snapshot). */
export type AdminSort = "daftar" | "masuk" | "tx";

export interface AdminAuthUser {
  id: string;
  email?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  /** Set by the server from SALAPI_ADMIN_USER_IDS + SALAPI_TEAM_USER_IDS, never by users. */
  team?: boolean;
}

/** month is a WIB calendar month ("2026-11") or "" for every month. */
export interface AdminQuery { segment: AdminSegmentFilter; q: string; page: number; month: string; sort: AdminSort }
export interface MonthlySignups { month: string; total: number; real: number }
export interface DailySignups { day: string; total: number; real: number }

/** "none" is a confirmed absence; "error" means the read failed and proves nothing. */
export type Lookup<T> = { status: "ok"; value: T } | { status: "none" } | { status: "error" };
/** One account in a daily snapshot: null = confirmed none (reads that failed are never stored). */
export interface AccountSnapshot { wallet: string | null; username: string | null; txSent: number }
export interface SnapshotState {
  day: string;
  capturedAt: string;
  latest: ReadonlyMap<string, AccountSnapshot>;
  /** The newest snapshot at least 7 days older than `day`, once history reaches that far. */
  weekAgoDay: string | null;
  weekAgo: ReadonlyMap<string, AccountSnapshot> | null;
}
export interface ActivationFunnel {
  registered: number;
  /** Accounts with a row in the latest snapshot (newer signups wait for the next run). */
  covered: number;
  username: number;
  transacted: number;
  regular: number;
  signedIn7: number;
  signedIn30: number;
  /** Accounts that sent a transaction (beyond their username) since weekAgoDay, or null without history. */
  transacting7: number | null;
}

export interface AdminAccountRow {
  user: AdminAuthUser;
  wallet: Lookup<string>;
  username: Lookup<string>;
  sentTx: Lookup<number>;
}

export const ADMIN_PAGE_SIZE = 25;
export const SEGMENT_FILTERS: readonly AdminSegmentFilter[] = ["real", "all", "team", "simulation", "load_test", "qa"];
export const SEGMENT_LABEL: Record<AdminSegmentFilter, string> = { all: "Semua", real: "Asli", team: "Tim", simulation: "Simulasi", load_test: "Load test", qa: "QA" };
export const SORTS: readonly AdminSort[] = ["daftar", "masuk", "tx"];

export function providerLabel(user: AdminAuthUser): string {
  const provider = user.app_metadata?.provider;
  return provider === "google" ? "Google" : provider === "email" ? "Email" : "Lainnya";
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_QUERY_LENGTH = 100;
/** The directory opens on real users; test traffic is one click away. */
export const DEFAULT_SEGMENT: AdminSegmentFilter = "real";

/**
 * Segment an account so test traffic and our own accounts never read as traction.
 * - simulation: app_metadata.synthetic, set only by the service role (the
 *   closed 50-account Testnet simulation).
 * - load_test: user_metadata.is_load_test_user. Users can edit their own
 *   user_metadata, so this can only move an account OUT of "real", never in.
 * - qa: reserved non-deliverable TLDs (.invalid, .test) can't belong to a person.
 * - team: admins and listed team accounts (server-side env, see markTeam).
 */
export function accountSegment(user: AdminAuthUser): AdminSegment {
  if (user.app_metadata?.synthetic === true) return "simulation";
  if (user.user_metadata?.is_load_test_user === true) return "load_test";
  if (/\.(invalid|test)$/i.test(user.email ?? "")) return "qa";
  if (user.team === true) return "team";
  return "real";
}

/** Comma/space separated Supabase user IDs. Anything not a UUID is ignored. */
export function parseAdminIds(value: string | undefined): ReadonlySet<string> {
  return new Set((value ?? "").split(/[\s,]+/).filter(id => UUID.test(id)).map(id => id.toLowerCase()));
}

/** Flags team accounts (case-insensitive IDs); everyone else is left untouched. */
export function markTeam(users: readonly AdminAuthUser[], teamIds: ReadonlySet<string>): AdminAuthUser[] {
  return users.map(user => teamIds.has(user.id.toLowerCase()) ? { ...user, team: true } : user);
}

/** Calendar month in WIB (UTC+7, no DST), e.g. "2026-11". */
export function wibMonth(iso: string): string {
  return new Date(Date.parse(iso) + WIB_OFFSET_MS).toISOString().slice(0, 7);
}

/** Calendar day in WIB, e.g. "2026-11-20". */
export function wibDay(iso: string): string {
  return new Date(Date.parse(iso) + WIB_OFFSET_MS).toISOString().slice(0, 10);
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

/** The last `days` WIB calendar days ending today, zero-filled, oldest first. */
export function dailySignups(users: readonly AdminAuthUser[], now: Date, days = 30): DailySignups[] {
  const today = Date.parse(`${wibDay(now.toISOString())}T00:00:00Z`);
  const rows = new Map<string, DailySignups>();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today - i * DAY_MS).toISOString().slice(0, 10);
    rows.set(day, { day, total: 0, real: 0 });
  }
  for (const user of users) {
    if (!Number.isFinite(Date.parse(user.created_at))) continue;
    const row = rows.get(wibDay(user.created_at));
    if (row) rows.set(row.day, { ...row, total: row.total + 1, real: row.real + (accountSegment(user) === "real" ? 1 : 0) });
  }
  return [...rows.values()];
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
  const segment = params.get("segment") ?? DEFAULT_SEGMENT;
  const page = Number(params.get("page"));
  const month = params.get("month") ?? "";
  const sort = params.get("sort") ?? "daftar";
  return {
    segment: (SEGMENT_FILTERS as readonly string[]).includes(segment) ? segment as AdminSegmentFilter : DEFAULT_SEGMENT,
    q: (params.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    month: /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month) ? month : "",
    sort: (SORTS as readonly string[]).includes(sort) ? sort as AdminSort : "daftar",
  };
}

/** Users in a WIB signup month ("" keeps everyone). */
export function inMonth(users: readonly AdminAuthUser[], month: string): AdminAuthUser[] {
  return month ? users.filter(user => Number.isFinite(Date.parse(user.created_at)) && wibMonth(user.created_at) === month) : [...users];
}

const time = (iso: string | null | undefined): number => {
  const value = Date.parse(iso ?? "");
  return Number.isFinite(value) ? value : -Infinity;
};

/**
 * Filtered by signup month, segment and an email / user ID substring, in the
 * requested order. "tx" sorts by the snapshot's sent count (no snapshot row = last).
 */
export function filterUsers(users: readonly AdminAuthUser[], query: AdminQuery, txById?: ReadonlyMap<string, number>): AdminAuthUser[] {
  const needle = query.q.toLowerCase();
  const key = (user: AdminAuthUser) => query.sort === "tx" ? txById?.get(user.id) ?? -Infinity
    : time(query.sort === "masuk" ? user.last_sign_in_at : user.created_at);
  return inMonth(users, query.month)
    .filter(user => query.segment === "all" || accountSegment(user) === query.segment)
    .filter(user => !needle || (user.email ?? "").toLowerCase().includes(needle) || user.id.toLowerCase().includes(needle))
    // Never signed in (or no date) goes last; ties fall back to newest signup.
    .sort((a, b) => (key(b) - key(a)) || (time(b.created_at) - time(a.created_at)) || 0);
}

/**
 * Transactions beyond the username claim: registering a username is itself one
 * sent transaction. An approximation (a failed attempt also counts), stated as such in the panel.
 */
export function activity(snapshot: AccountSnapshot): number {
  return Math.max(0, snapshot.txSent - (snapshot.username ? 1 : 0));
}

const signedInWithin = (user: AdminAuthUser, now: Date, days: number) => {
  const at = Date.parse(user.last_sign_in_at ?? "");
  return Number.isFinite(at) && now.getTime() - at <= days * DAY_MS;
};

/** Activation of the given (real) accounts: on-chain steps from the snapshot, sign-ins live from Auth. */
export function activationFunnel(users: readonly AdminAuthUser[], snapshot: SnapshotState | null, now: Date): ActivationFunnel {
  const rows = snapshot ? users.map(user => snapshot.latest.get(user.id)).filter((row): row is AccountSnapshot => !!row) : [];
  let transacting7: number | null = null;
  if (snapshot?.weekAgo) {
    const before = snapshot.weekAgo;
    transacting7 = users.filter(user => {
      const current = snapshot.latest.get(user.id);
      if (!current) return false;
      const earlier = before.get(user.id);
      return activity(current) > (earlier ? activity(earlier) : 0);
    }).length;
  }
  return {
    registered: users.length,
    covered: rows.length,
    username: rows.filter(row => row.username).length,
    transacted: rows.filter(row => activity(row) >= 1).length,
    regular: rows.filter(row => activity(row) >= 3).length,
    signedIn7: users.filter(user => signedInWithin(user, now, 7)).length,
    signedIn30: users.filter(user => signedInWithin(user, now, 30)).length,
    transacting7,
  };
}
