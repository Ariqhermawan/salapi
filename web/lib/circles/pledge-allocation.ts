import { CURRENCY } from "../ui/currency.ts";
import type { Locale } from "../i18n/config.ts";

export type PreviewPledgeAllocation = {
  total: number;
  beneficiary: number;
  organizer: number;
  beneficiaryPct: number;
  organizerPct: number;
  totalMinor: bigint;
  beneficiaryMinor: bigint;
  organizerMinor: bigint;
};

// Circles has no deployed payment or allocation contract. This is a display-
// currency illustration only, never a payload for a transaction. Read the
// configured whole-percent proposal without changing it or adding platform fees.
export function previewPledgeAllocation(
  displayValue: string,
  currency: Locale,
  proposedAllowancePct: number,
): PreviewPledgeAllocation | null {
  const meta = CURRENCY[currency];
  const value = displayValue.trim();
  if (
    !meta ||
    value.length > 40 ||
    !/^\d+(\.\d+)?$/.test(value) ||
    !Number.isInteger(proposedAllowancePct) ||
    proposedAllowancePct < 0 ||
    proposedAllowancePct > 10
  ) {
    return null;
  }

  const [whole, fraction = ""] = value.split(".");
  // Reject non-representable input. Never silently round the typed total to a
  // different pledge amount, especially for zero-decimal IDR and VND displays.
  if (fraction.length > meta.dp) return null;
  const scale = 10n ** BigInt(meta.dp);
  const totalMinor =
    BigInt(whole) * scale + BigInt(fraction.padEnd(meta.dp, "0") || "0");
  if (totalMinor <= 0n || totalMinor > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }

  // Half-up rounding of the organizer share in this currency's minor units.
  // Assign the exact remainder to the beneficiary so the two visible rows
  // conserve the typed total, including fractional-cent boundaries.
  const organizerMinor =
    (totalMinor * BigInt(proposedAllowancePct) + 50n) / 100n;
  const beneficiaryMinor = totalMinor - organizerMinor;
  const divisor = Number(scale);
  return {
    total: Number(totalMinor) / divisor,
    beneficiary: Number(beneficiaryMinor) / divisor,
    organizer: Number(organizerMinor) / divisor,
    beneficiaryPct: 100 - proposedAllowancePct,
    organizerPct: proposedAllowancePct,
    totalMinor,
    beneficiaryMinor,
    organizerMinor,
  };
}
