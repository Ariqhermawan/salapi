import { readTransferRecipientIdentity } from "@/lib/server/transferRecipientIdentity";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  if (query.getAll("username").length !== 1 || query.getAll("address").length !== 1
    || [...query.keys()].some(key => key !== "username" && key !== "address"))
    return Response.json({ ok: false, code: "unavailable" }, { status: 400, headers });
  return Response.json(await readTransferRecipientIdentity(query.get("username")!, query.get("address")!), { headers });
}
