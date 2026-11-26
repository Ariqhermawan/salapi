import type { Campaign } from "./campaign.ts";

export type CampaignDiscoveryView = "examples" | "testnet";
export type D4CampaignLayout = "grid" | "list";

export function d4CampaignStatus(campaign: Omit<Campaign, "contribution">, now: bigint): string {
  const active = campaign.state === "Funding" || campaign.state === "PendingProof" || campaign.state === "Refundable";
  const quorum = campaign.approvals.length >= 2;
  if (active && now >= BigInt(campaign.config.review_deadline) && !quorum)
    return campaign.total === "0" ? "Ready to close" : "Refund available";
  if (campaign.state === "Funding" && now >= BigInt(campaign.config.funding_deadline)) return "Awaiting proof";
  if (campaign.state === "PendingProof" && quorum) return "Proof approved";
  if (campaign.state === "PendingProof") return "In review";
  if (campaign.state === "Closed") return "Ended";
  return campaign.state;
}

export function filterD4Campaigns(
  campaigns: Campaign[], filter: string, query: string, viewer: string | null, now: bigint,
): Campaign[] {
  const words = query.trim().toLocaleLowerCase();
  return campaigns.filter(campaign => {
    const matchesFilter = filter === "All"
      || filter === "My campaigns" && campaign.config.creator === viewer
      || d4CampaignStatus(campaign, now) === filter;
    const searchable = `${campaign.title} ${campaign.id} ${campaign.state} ${d4CampaignStatus(campaign, now)} ${campaign.config.creator} ${campaign.config.beneficiary}`.toLocaleLowerCase();
    const matchesQuery = !words || searchable.includes(words);
    return matchesFilter && matchesQuery;
  });
}

// Keep direct D4 IDs and creation links authoritative. The larger Circles
// catalog is a separate prototype, never a set of deployed escrow contracts.
export function campaignDiscoveryView(
  params: { id?: string; create?: string; mode?: string }, localPreview: boolean,
): CampaignDiscoveryView {
  if (params.id || params.create === "1" || params.mode === "testnet") return "testnet";
  if (params.mode === "examples" || localPreview) return "examples";
  return "testnet";
}
