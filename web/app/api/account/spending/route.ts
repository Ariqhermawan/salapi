import { readAccountSpending } from "@/lib/server/accountSpending";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request) {
  if (new URL(request.url).search) return Response.json({ ok: false, code: "invalid_input" }, { status: 400, headers });
  try { return Response.json(await readAccountSpending(), { headers }); }
  catch { return Response.json({ ok: false, code: "unavailable" }, { status: 503, headers }); }
}
