import { readUsernameStatus } from "@/lib/server/usernameOnboarding";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, X-Salapi-Owner" };

export async function GET(request: Request) {
  if (new URL(request.url).search) return Response.json({ status: "unavailable" }, { status: 400, headers });
  return Response.json(await readUsernameStatus(request.headers.get("X-Salapi-Owner")), { headers });
}
