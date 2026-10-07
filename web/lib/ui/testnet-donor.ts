import type { Campaign } from "@/lib/campaign";

// Call only with campaignState's contract-read contribution for its resolved
// viewer. A pending transaction, subscription or illustrative total is not input.
export function campaignDonorBadge(campaign: Pick<Campaign, "contribution">, viewer: string | null, localPreview: boolean): "example" | "testnet" | null {
  if (!viewer || typeof campaign.contribution.amount !== "string" || !/^\d+$/.test(campaign.contribution.amount) || BigInt(campaign.contribution.amount) <= 0n || campaign.contribution.refunded) return null;
  return localPreview ? "example" : "testnet";
}
