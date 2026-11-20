// Daily admin snapshot (see lib/server/adminSnapshot.ts), triggered by
// .github/workflows/admin-snapshot.yml with the same CRON_SECRET bearer as
// the arisan reminder cron.
import { timingSafeEqual } from "node:crypto";
import { writeAccountSnapshot } from "@/lib/server/adminSnapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32) return Response.json({ ok: false, error: "Snapshot scheduler is not configured." }, { status: 503, headers });
  const actual = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  if (new URL(request.url).search || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401, headers });
  try {
    return Response.json(await writeAccountSnapshot(), { headers });
  } catch (error) {
    console.error("[admin-snapshot] failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ ok: false, error: "Snapshot failed." }, { status: 503, headers });
  }
}
