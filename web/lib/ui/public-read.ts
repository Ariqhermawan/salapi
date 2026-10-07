import type { CircleTestnetCampaignResult } from "@/lib/circles/testnet";
import type { CampaignDonorFeedResult } from "@/lib/campaign-donor";
import type { Campaign } from "@/lib/campaign";

export type PublicCampaignState = { ok: true; contractId: string; now: string; campaigns: Omit<Campaign, "contribution">[]; circleLinks?: Record<string, string> }
  | { ok: false; error: string };

/** Display-only GETs can run beside private reads without the Server Action queue.
 * No cache, signer, contract selector, third-party origin or mutation fallback. */
async function read<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: "GET", credentials: "same-origin", cache: "no-store",
    redirect: "error", signal: AbortSignal.timeout(20_000), headers: { "Accept": "application/json" } });
  if (!response.ok) throw new Error("Public data unavailable");
  return response.json() as Promise<T>;
}

export function readPublicCampaigns(before = "0") {
  return read<PublicCampaignState>(`/api/public/campaigns?before=${encodeURIComponent(before)}`);
}
export function readPublicCircleTestnet(circleId: string) {
  return read<CircleTestnetCampaignResult>(`/api/public/circles-testnet?circleId=${encodeURIComponent(circleId)}`);
}
export function readPublicCampaignDonors(campaignId: string, before = "") {
  return read<CampaignDonorFeedResult>(`/api/public/campaign-donors?campaignId=${encodeURIComponent(campaignId)}${before ? `&before=${encodeURIComponent(before)}` : ""}`);
}
