export type CampaignDiscoveryView = "examples" | "testnet";

// Keep direct D4 IDs and creation links authoritative. The larger Circles
// catalog is a separate prototype, never a set of deployed escrow contracts.
export function campaignDiscoveryView(
  params: { id?: string; create?: string; mode?: string }, localPreview: boolean,
): CampaignDiscoveryView {
  if (params.id || params.create === "1" || params.mode === "testnet") return "testnet";
  if (params.mode === "examples" || localPreview) return "examples";
  return "testnet";
}
