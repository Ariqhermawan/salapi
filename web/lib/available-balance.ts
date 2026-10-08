import { nativeBalanceToStroops } from "./money";

export type AvailableBalance = {
  nativeStroops: string; reserveStroops: string; liabilitiesStroops: string;
  availableStroops: string; checkedAt: string;
};
const decimal = (value: unknown): bigint | null => typeof value === "string"
  && /^(?:0|[1-9]\d{0,12})(?:\.\d{1,7})?$/.test(value) ? nativeBalanceToStroops(value) : null;
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Available before fees, not a fiat estimate. Sponsorship and selling
 * liabilities affect spendability; total native balance alone is not enough. */
export function availableBalanceFromHorizon(account: unknown, ledger: unknown, address: string): AvailableBalance | null {
  if (!account || typeof account !== "object" || !ledger || typeof ledger !== "object") return null;
  const a = account as Record<string, unknown>, l = ledger as Record<string, unknown>;
  if (a.account_id !== address || !Array.isArray(a.balances) || !count(a.subentry_count)
    || !count(a.num_sponsoring) || !count(a.num_sponsored) || !count(l.base_reserve_in_stroops)
    || l.base_reserve_in_stroops <= 0) return null;
  const native = a.balances.filter(b => b?.asset_type === "native");
  if (native.length !== 1) return null;
  const balance = decimal(native[0].balance), liabilities = decimal(native[0].selling_liabilities);
  const units = 2 + a.subentry_count + a.num_sponsoring - a.num_sponsored;
  if (balance === null || liabilities === null || !count(units)) return null;
  const reserve = BigInt(units) * BigInt(l.base_reserve_in_stroops);
  const remaining = balance - reserve - liabilities;
  return { nativeStroops: balance.toString(), reserveStroops: reserve.toString(), liabilitiesStroops: liabilities.toString(),
    availableStroops: (remaining > 0n ? remaining : 0n).toString(), checkedAt: new Date().toISOString() };
}
