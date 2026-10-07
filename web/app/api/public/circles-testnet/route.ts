import { readCircleTestnetCampaign } from "@/lib/server/circlesTestnet";
import { canonicalCircleTestnetSlug } from "@/lib/circles/testnet";

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
  try { return Response.json(await readCircleTestnetCampaign(circleId), { headers }); }
  catch { return Response.json({ ok: false, code: "unavailable" }, { status: 503, headers }); }
}
