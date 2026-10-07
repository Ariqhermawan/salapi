import { campaignAmount } from "../campaign-money.ts";
import type { CircleTestnetCampaignResult } from "./testnet";

export type CircleDonationInput = { circleId: string; expectedOwnerId: string; termsKey: string; amount: string };
export type CircleDonationResult = { ok: true; hash: string; link: string; campaignId: string; ownerId: string }
  | { ok: false; error: string; pending?: true; hash?: string; link?: string };

// A review binds the exact immutable QA mapping, not merely a title or route.
export function circleDonationTerms(result: CircleTestnetCampaignResult): string | null {
  if (!result.ok) return null;
  const m = result.mapping;
  return JSON.stringify(["testnet", result.contractId, result.circleId, m.campaignId,
    m.creatorWallet, m.beneficiaryWallet, m.approverWallets, m.creatorCutBps, m.fundingDeadline, m.reviewDeadline]);
}
export function circleDonationAmount(value: unknown): bigint | null {
  try { return campaignAmount({ currency: "XLM", amount: value }); } catch { return null; }
}
export function parseCircleDonation(input: unknown): CircleDonationInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const v = input as Record<string, unknown>;
  if (Object.keys(v).some(key => !["circleId", "expectedOwnerId", "termsKey", "amount"].includes(key)) ||
    typeof v.circleId !== "string" || !/^[a-z0-9-]{1,80}$/.test(v.circleId) ||
    typeof v.expectedOwnerId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.expectedOwnerId) ||
    typeof v.termsKey !== "string" || v.termsKey.length > 1500 || typeof v.amount !== "string" || !circleDonationAmount(v.amount)) return null;
  return { circleId: v.circleId, expectedOwnerId: v.expectedOwnerId, termsKey: v.termsKey, amount: v.amount };
}
