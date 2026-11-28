import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { WalletActivityItem } from "../wallet-activity";

const publicAddress = (value: unknown): value is string => typeof value === "string" && /^G[A-Z2-7]{55}$/.test(value);
const transactionHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);

/** Persist only a hash returned by the authenticated wallet's reviewed withdrawal submission. */
export async function recordWalletWithdrawalLabel(input: { ownerId: string; walletAddress: string; hash: string }): Promise<boolean> {
  if (typeof input.ownerId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.ownerId)
    || !publicAddress(input.walletAddress) || !transactionHash(input.hash)) return false;
  try {
    const { error } = await createSupabaseAdmin().from("wallet_activity_withdrawals").upsert({
      owner_id: input.ownerId,
      wallet_address: input.walletAddress,
      transaction_hash: input.hash.toLowerCase(),
    }, { onConflict: "owner_id,wallet_address,transaction_hash" });
    return !error;
  } catch { return false; }
}

/** Apply locally initiated withdrawal labels only to that verified owner's sent XLM payments. */
export async function attachConfirmedWalletWithdrawals(ownerId: string, walletAddress: string, items: WalletActivityItem[]): Promise<WalletActivityItem[]> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerId)
    || !publicAddress(walletAddress) || !items.length) return items;
  const eligible = items.filter(item => item.direction === "sent" && item.kind === "payment" && item.asset.code === "XLM" && transactionHash(item.hash));
  const hashes = [...new Set(eligible.map(item => item.hash.toLowerCase()))].slice(0, 30);
  if (!hashes.length) return items;
  try {
    const { data, error } = await createSupabaseAdmin().from("wallet_activity_withdrawals")
      .select("transaction_hash")
      .eq("owner_id", ownerId)
      .eq("wallet_address", walletAddress)
      .in("transaction_hash", hashes);
    if (error || !Array.isArray(data)) return items;
    const recorded = new Set(data.flatMap(row => row && typeof row === "object" && transactionHash((row as { transaction_hash?: unknown }).transaction_hash)
      ? [(row as { transaction_hash: string }).transaction_hash.toLowerCase()] : []));
    if (!recorded.size) return items;
    return items.map(item => item.direction === "sent" && item.kind === "payment" && item.asset.code === "XLM"
      && recorded.has(item.hash.toLowerCase())
      ? { ...item, context: item.context ?? { type: "wallet-withdrawal", referenceId: null, title: null } }
      : item);
  } catch { return items; }
}
