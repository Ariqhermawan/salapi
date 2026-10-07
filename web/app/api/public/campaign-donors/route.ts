import { readCampaignDonors } from "@/lib/server/campaignDonors";
import { canonicalDonorCampaignId, campaignDonorCursor } from "@/lib/campaign-donor";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const campaignId = query.get("campaignId");
  const before = query.get("before") ?? "";
  if ([...query.keys()].some(key => !["campaignId", "before"].includes(key))
    || query.getAll("campaignId").length !== 1 || query.getAll("before").length > 1
    || !canonicalDonorCampaignId(campaignId) || before !== "" && !campaignDonorCursor(before)) {
    return Response.json({ ok: false, code: "invalid_input" }, { status: 400, headers });
  }
  // Reuse the consent-filtered public projection, never the raw donor/auth rows.
  try { return Response.json(await readCampaignDonors(campaignId, before), { headers }); }
  catch { return Response.json({ ok: false, code: "unavailable" }, { status: 503, headers }); }
}
