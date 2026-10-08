import { readCampaignSupport, readCircleCampaignSupport } from "@/lib/server/campaignSupport";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  if ([...query.keys()].some(key => key !== "ids" && key !== "circles")
    || query.getAll("ids").length + query.getAll("circles").length !== 1)
    return Response.json({ ok: false, code: "invalid_input" }, { status: 400, headers });
  try {
    const result = query.has("circles") ? await readCircleCampaignSupport(query.get("circles")) : await readCampaignSupport(query.get("ids"));
    return Response.json(result, { status: !result.ok && result.code === "invalid_input" ? 400 : 200, headers });
  } catch { return Response.json({ ok: false, code: "unavailable" }, { status: 503, headers }); }
}
