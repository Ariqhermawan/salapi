// D4 value boundary. Decimal inputs remain strings; all arithmetic is BigInt.
import { moneyInputToStroops, nativeBalanceToStroops } from "./money.ts";

export function campaignAmount(input: unknown): bigint {
  if (!input || typeof input !== "object") throw new Error("Enter a valid donation amount");
  const v = input as { amount?: unknown; currency?: unknown };
  const amount = v.currency === "XLM"
    ? (typeof v.amount === "string" && v.amount.length <= 48 && /^\d+(?:\.\d{1,7})?$/.test(v.amount.trim())
      ? nativeBalanceToStroops(v.amount.trim()) : null)
    : moneyInputToStroops(input);
  if (amount == null || amount <= 0n || amount > (1n << 127n) - 1n)
    throw new Error("Enter a positive amount (XLM supports up to 7 decimal places)");
  return amount;
}

export function creatorCutBps(input: unknown): bigint {
  if (typeof input !== "string" || !/^\d{1,2}(?:\.\d{1,2})?$/.test(input.trim()))
    throw new Error("Creator share must be 0–10%, with at most 2 decimal places");
  const [whole, fraction = ""] = input.trim().split(".");
  const bps = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (bps > 1000n) throw new Error("Creator share cannot exceed 10%");
  return bps;
}

export function campaignSplit(total: bigint, bps: bigint) {
  if (total < 0n || bps < 0n || bps > 1000n) throw new Error("Invalid campaign split");
  const creator = total * bps / 10_000n;
  return { creator, beneficiary: total - creator };
}
