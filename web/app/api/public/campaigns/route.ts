import { publicCampaignState } from "@/app/campaign-actions";
import { readCircleDiscoveryMappings, circleDiscoveryLinks } from "@/lib/server/circlesTestnet";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

/** Public discovery only. Never exposes viewer contributions or provisions wallets. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const before = query.get("before") ?? "0";
  if ([...query.keys()].some(key => key !== "before") || query.getAll("before").length > 1
    || !/^(0|[1-9]\d{0,19})$/.test(before) || BigInt(before) > 18_446_744_073_709_551_615n) {
    return Response.json({ ok: false, error: "Invalid campaign cursor" }, { status: 400, headers });
  }
  try {
    const [state, mappings] = await Promise.all([publicCampaignState(before), readCircleDiscoveryMappings()]);
    return Response.json(state.ok ? { ...state, circleLinks: circleDiscoveryLinks(state.campaigns, mappings) } : state, { headers });
  }
  catch { return Response.json({ ok: false, error: "Campaigns unavailable" }, { status: 503, headers }); }
}
