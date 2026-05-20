// Salapi Circles - Operational Allowance (Build-Award STAGE 2 preview).
// Mirrors SOW v2 Spotlight Section 8 "Honest creator economy". This is NOT a
// day-30 feature, NOT on-chain today. No contract deployed, no on-chain
// receipt. The types here only drive the preview UI so a reviewer can see
// the mechanism (split breakdown, escrow, proof of delivery, dispute window)
// end to end. Day-30 Disaster Vault is 0 percent organizer cut and uses a
// whitelisted NGO shortlist (SOW Section 6).

export type KycTier = 0 | 1 | 2;

export const KYC_TIER_CEILING: Record<KycTier, number> = {
  0: 0, // no KYC, no allowance permitted
  1: 5, // basic ID
  2: 10, // enhanced KYC + 3 prior closes with verified delivery
};

export const KYC_TIER_LABEL: Record<KycTier, string> = {
  0: "Tier 0",
  1: "Tier 1",
  2: "Tier 2",
};

export const KYC_TIER_NAME: Record<KycTier, string> = {
  0: "No KYC",
  1: "Basic ID",
  2: "Enhanced KYC + 3 closes",
};

export type AllowanceConfig = {
  // Percentage of each donation routed to the organizer's operational
  // allowance (capped at the tier ceiling). 0 = no allowance, the day-30
  // Disaster Vault default.
  percentage: number;
  // Organizer's KYC tier at the moment the circle was created. Encoded into
  // the smart contract at circle creation and immutable once the first
  // donation lands (Build-Award stage 2 contract behavior).
  tier: KycTier;
  // Display name of the organizer (for the donor-facing breakdown line).
  organizerName: string;
  // Whether the contract requires proof of beneficiary receipt before the
  // accrued allowance can be released. Always true when percentage > 0.
  proofRequired: boolean;
  // Whether allowance currently sits in escrow waiting for proof. Mocked for
  // the preview; in production the contract is the source of truth.
  escrowed: boolean;
  // Mocked accrued amount in PHP app-units (only meaningful when
  // percentage > 0). Drives the manage-circle dashboard preview.
  pesoAccrued?: number;
};

// Clamp the percentage to the organizer's tier ceiling. Used by the create
// flow slider and any defensive UI rendering.
export function clampToTier(percentage: number, tier: KycTier): number {
  const ceiling = KYC_TIER_CEILING[tier];
  return Math.max(0, Math.min(ceiling, Math.round(percentage)));
}

// Split a donation amount into beneficiary / allowance components, in the
// same app-currency unit (PHP). Display layer renders both via formatParts.
export function splitDonation(
  pesoAmount: number,
  allowancePct: number
): { beneficiary: number; allowance: number } {
  if (!(pesoAmount > 0)) return { beneficiary: 0, allowance: 0 };
  const pct = Math.max(0, Math.min(10, allowancePct));
  const allowance = Math.round((pesoAmount * pct) / 100);
  const beneficiary = pesoAmount - allowance;
  return { beneficiary, allowance };
}

// Reputation score model for the preview manage screen. Pure presentation;
// the on-chain reputation in stage 2 will be derived from closed circles
// with verified delivery (no dispute resolved against the organizer).
export type ReputationSummary = {
  score: number; // 0 to 100
  closedCircles: number;
  verifiedDeliveries: number;
  openDisputes: number;
  tier2Eligible: boolean; // closedCircles >= 3 AND open disputes 0
};

export function mockReputation(c: { tier: KycTier; closes: number }): ReputationSummary {
  return {
    score: c.tier === 2 ? 92 : c.tier === 1 ? 74 : 0,
    closedCircles: c.closes,
    verifiedDeliveries: c.closes,
    openDisputes: 0,
    tier2Eligible: c.closes >= 3,
  };
}

// Mock organizer-allowance status for the /circles/[id]/manage preview. The
// values are illustrative; nothing is read from a contract.
export type AllowanceStatus = {
  pesoAccrued: number;
  pesoReleasable: number; // released once proof of delivery uploaded
  proofUploaded: boolean;
  disputeWindowEndsAt: string | null; // ISO; null when no window
};
