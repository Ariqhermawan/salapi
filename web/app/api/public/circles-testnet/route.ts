import { readCircleTestnetCampaign } from "@/lib/server/circlesTestnet";
import { canonicalCircleTestnetSlug } from "@/lib/circles/testnet";
import { readCampaignDonorSummary } from "@/lib/server/campaignDonors";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const circleId = query.get("circleId");
  if ([...query.keys()].some(key => key !== "circleId") || query.getAll("circleId").length !== 1
    || !canonicalCircleTestnetSlug(circleId)) {
    return Response.json({ ok: false, code: "invalid_circle" }, { status: 400, headers });
  }
  // The existing server reader verifies the fixed contract, token and mapping.
  // This fresh display read is not payment authorization or cached private state.
  try {
    const result = await readCircleTestnetCampaign(circleId);
    if (!result.ok) return Response.json(result, { headers });
    const donorSummary = await readCampaignDonorSummary(result.campaign.id, result.campaign.total)
      .catch(() => ({ ok: false as const, campaignId: result.campaign.id, code: "unavailable" as const }));
    return Response.json({ ...result, donorSummary }, { headers });
  }
  catch { return Response.json({ ok: false, code: "unavailable" }, { status: 503, headers }); }
}
