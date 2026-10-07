import { readAccountPhoto } from "@/lib/server/accountPhoto";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };

/** Owner verified with getUser on every request. Uploads remain Server Actions. */
export async function GET(request: Request) {
  if (new URL(request.url).search !== "") {
    return Response.json({ ok: false, code: "unavailable" }, { status: 400, headers });
  }
  try { return Response.json(await readAccountPhoto(), { headers }); }
  catch { return Response.json({ ok: false, code: "unavailable" }, { status: 503, headers }); }
}
