import { currentWalletActivity } from "@/lib/server/walletActivity";
import { isWalletActivityCursor } from "@/lib/wallet-activity";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const cursor = query.get("cursor");
  if ([...query.keys()].some(key => key !== "cursor") || query.getAll("cursor").length > 1
    || (cursor !== null && !isWalletActivityCursor(cursor)))
    return Response.json({ ok: false, code: "invalid-cursor" }, { status: 400, headers });
  try { return Response.json(await currentWalletActivity(cursor), { headers }); }
  catch { return Response.json({ ok: false, code: "unavailable" }, { status: 503, headers }); }
}
