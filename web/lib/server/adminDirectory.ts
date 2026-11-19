import "server-only";
import { StrKey } from "@stellar/stellar-sdk";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { CONTRACTS, HORIZON, readContract, sc } from "@/lib/server/stellar";
import { USERNAME_PATTERN } from "@/lib/username-onboarding";
import { sentTransactionCount, type AdminAccountRow, type AdminAuthUser, type Lookup } from "@/lib/admin-users";

const PER_PAGE = 1000;
// ponytail: every request lists all auth users and filters in memory. Fine for
// thousands of accounts; past MAX_PAGES move counting/search into a SQL RPC.
const MAX_PAGES = 20;
const LOOKUP_WORKERS = 6;
// Five rounds of 25 rows / 6 workers stay well inside the route's maxDuration.
const LOOKUP_TIMEOUT_MS = 5_000;
const NONE = { status: "none" } as const;
const ERROR = { status: "error" } as const;

export interface AdminDirectory { users: AdminAuthUser[]; walletCount: number | null }

/** All auth accounts (service role). Throws instead of returning a partial list. */
export async function loadAdminDirectory(): Promise<AdminDirectory> {
  const supabase = createSupabaseAdmin();
  // Keyed by ID: a signup between page reads shifts offsets and can repeat a user.
  const users = new Map<string, AdminAuthUser>();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error("Auth accounts are unavailable.");
    // Keep only the fields the panel shows or segments on, not whole metadata.
    for (const { id, email, created_at, last_sign_in_at, app_metadata, user_metadata } of data.users) users.set(id, {
      id, email, created_at, last_sign_in_at,
      app_metadata: { provider: app_metadata?.provider, synthetic: app_metadata?.synthetic },
      user_metadata: { is_load_test_user: user_metadata?.is_load_test_user },
    });
    if (data.users.length < PER_PAGE) break;
    if (page === MAX_PAGES) throw new Error("Too many accounts for the in-memory admin directory.");
  }
  const { count, error } = await supabase.from("wallets").select("user_id", { count: "exact", head: true });
  return { users: [...users.values()], walletCount: error ? null : count };
}

/** Wallet, on-chain username and sent-transaction count for one page of accounts. */
export async function loadAccountRows(users: readonly AdminAuthUser[]): Promise<AdminAccountRow[]> {
  if (!users.length) return [];
  // Public keys only: secret_cipher never leaves the database here.
  const { data, error } = await createSupabaseAdmin().from("wallets")
    .select("user_id, public_key").in("user_id", users.map(user => user.id));
  const wallets = new Map((data ?? []).map(row => [row.user_id as string, row.public_key as unknown]));
  const rows: AdminAccountRow[] = new Array(users.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(LOOKUP_WORKERS, users.length) }, async () => {
    while (next < users.length) {
      const index = next++;
      rows[index] = await accountRow(users[index], error ? undefined : wallets);
    }
  }));
  return rows;
}

async function accountRow(user: AdminAuthUser, wallets: Map<string, unknown> | undefined): Promise<AdminAccountRow> {
  if (!wallets) return { user, wallet: ERROR, username: ERROR, sentTx: ERROR };
  const address = wallets.get(user.id);
  if (address === undefined) return { user, wallet: NONE, username: NONE, sentTx: NONE };
  if (typeof address !== "string" || !StrKey.isValidEd25519PublicKey(address)) return { user, wallet: ERROR, username: ERROR, sentTx: ERROR };
  const [username, sentTx] = await Promise.all([readUsername(address), readSentTransactions(address)]);
  return { user, wallet: { status: "ok", value: address }, username, sentTx };
}

async function readUsername(address: string): Promise<Lookup<string>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const handle = await Promise.race([
      readContract(CONTRACTS.usernameRegistry, "username_of", [sc.addr(address)]),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), LOOKUP_TIMEOUT_MS); }),
    ]);
    return typeof handle === "string" && USERNAME_PATTERN.test(handle) ? { status: "ok", value: handle } : ERROR;
  } catch (error) {
    // Only the registry's NotFound proves the account has no username.
    return error instanceof Error && /Error\(Contract, #3\)/.test(error.message) ? NONE : ERROR;
  } finally { clearTimeout(timer); }
}

async function readSentTransactions(address: string): Promise<Lookup<number>> {
  try {
    const response = await fetch(new URL(`/accounts/${address}`, HORIZON), {
      method: "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS), headers: { Accept: "application/json" },
    });
    // 404: the account is not on Testnet (never funded, or wiped by a reset).
    if (response.status === 404) return NONE;
    if (!response.ok) return ERROR;
    const account = await response.json() as { id?: unknown; sequence?: unknown };
    const count = account?.id === address ? sentTransactionCount(account.sequence) : null;
    return count === null ? ERROR : { status: "ok", value: count };
  } catch { return ERROR; }
}
