import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { HORIZON } from "@/lib/server/stellar";
import { loadAccountRows } from "@/lib/server/adminDirectory";
import { readWalletActivityPage } from "@/lib/server/walletActivity";
import { USDC_TESTNET_ISSUER } from "@/lib/wallet-activity";
import type { AdminAuthUser, Lookup } from "@/lib/admin-users";
import type { AdminUserDetail, AdminDonations } from "@/lib/admin-detail-view";

const NONE = { status: "none" } as const;
const RECENT_ACTIVITY = 15;
const RECENT_DONATIONS = 10;
// ponytail: donation totals read up to this many rows per account; page if anyone gets close.
const MAX_DONATION_ROWS = 1000;
const HISTORY_DAYS = 30;

async function settle<T>(work: () => Promise<T>): Promise<Lookup<T>> {
  try { return { status: "ok", value: await work() }; }
  catch { return { status: "error" }; }
}

/** Everything the detail page shows for one account; each part fails on its own. */
export async function loadAdminUserDetail(user: AdminAuthUser): Promise<AdminUserDetail> {
  const [row] = await loadAccountRows([user]);
  // A validated G-address (or nothing): safe to place in the PostgREST filters below.
  const address = row.wallet.status === "ok" ? row.wallet.value : null;
  const db = createSupabaseAdmin();
  const [balances, activity, donations, campaigns, arisanRooms, history] = await Promise.all([
    address ? settle(() => readBalances(address)) : Promise.resolve(NONE),
    address ? settle(async () => {
      const page = await readWalletActivityPage(address);
      if (!page.ok) throw new Error(page.error);
      return page.items.slice(0, RECENT_ACTIVITY);
    }) : Promise.resolve(NONE),
    settle(async (): Promise<AdminDonations> => {
      const { data, error } = await db.from("campaign_donors")
        .select("campaign_id, amount_stroops, created_at, anonymous, transaction_hash")
        .or(address ? `owner_id.eq.${user.id},donor_wallet.eq.${address}` : `owner_id.eq.${user.id}`)
        .order("created_at", { ascending: false }).limit(MAX_DONATION_ROWS);
      if (error) throw new Error("Donations unavailable.");
      const rows = data ?? [];
      return {
        count: rows.length,
        totalStroops: rows.reduce((sum, item) => sum + (/^\d+$/.test(String(item.amount_stroops)) ? BigInt(String(item.amount_stroops)) : 0n), 0n).toString(),
        recent: rows.slice(0, RECENT_DONATIONS).map(item => ({
          campaignId: String(item.campaign_id), amountStroops: String(item.amount_stroops), createdAt: String(item.created_at),
          anonymous: item.anonymous === true, hash: String(item.transaction_hash),
        })),
      };
    }),
    address ? settle(async () => {
      const { data, error } = await db.from("circles_testnet_campaigns").select("campaign_id, campaign_title, created_at, archived_at")
        .eq("creator_wallet", address).order("created_at", { ascending: false });
      if (error) throw new Error("Campaigns unavailable.");
      return (data ?? []).map(item => ({ campaignId: String(item.campaign_id), title: String(item.campaign_title), createdAt: String(item.created_at), archived: item.archived_at !== null }));
    }) : Promise.resolve(NONE),
    address ? settle(async () => {
      const { data, error } = await db.from("arisan_member_notifications").select("room_name, room_kind, room_id")
        .eq("wallet", address).order("created_at", { ascending: false }).limit(200);
      if (error) throw new Error("Arisan rooms unavailable.");
      const rooms = new Map<string, string>();
      for (const item of data ?? []) rooms.set(`${item.room_kind}:${item.room_id}`, String(item.room_name));
      return [...rooms.values()];
    }) : Promise.resolve(NONE),
    settle(async () => {
      const { data, error } = await db.from("admin_account_snapshots").select("day, tx_sent")
        .eq("user_id", user.id).order("day", { ascending: false }).limit(HISTORY_DAYS);
      if (error) throw new Error("Snapshot history unavailable.");
      return (data ?? []).map(item => ({ day: String(item.day), txSent: Number(item.tx_sent) || 0 })).reverse();
    }),
  ]);
  return { row, balances, activity, donations, campaigns, arisanRooms, history };
}

/** XLM and Testnet USDC balances from Horizon; an account Testnet doesn't know has none. */
async function readBalances(address: string): Promise<{ asset: "XLM" | "USDC"; amount: string }[]> {
  const response = await fetch(new URL(`/accounts/${address}`, HORIZON), {
    method: "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000), headers: { Accept: "application/json" },
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error("Horizon unavailable.");
  const account = await response.json() as { id?: unknown; balances?: { asset_type?: unknown; asset_code?: unknown; asset_issuer?: unknown; balance?: unknown }[] };
  if (account.id !== address || !Array.isArray(account.balances)) throw new Error("Unexpected Horizon account.");
  return account.balances.flatMap((balance): { asset: "XLM" | "USDC"; amount: string }[] => {
    if (typeof balance.balance !== "string" || !/^\d+(\.\d{1,7})?$/.test(balance.balance)) return [];
    if (balance.asset_type === "native") return [{ asset: "XLM" as const, amount: balance.balance }];
    if (balance.asset_code === "USDC" && balance.asset_issuer === USDC_TESTNET_ISSUER) return [{ asset: "USDC" as const, amount: balance.balance }];
    return [];
  });
}
