import { resolveCirclesSignupIdentity } from "@/lib/server/circlesSignup";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };

/** Display-only identity, verified from this request's cookies on every read. */
export async function GET(request: Request) {
  if (new URL(request.url).search !== "") {
    return Response.json({ status: "unavailable" }, { status: 400, headers });
  }
  try {
    const identity = await resolveCirclesSignupIdentity();
    const value = identity.status === "verified"
      ? { status: identity.status, ownerId: identity.ownerId, email: identity.email, source: identity.source }
      : { status: identity.status };
    return Response.json(value, { headers });
  }
  catch { return Response.json({ status: "unavailable" }, { status: 503, headers }); }
}
