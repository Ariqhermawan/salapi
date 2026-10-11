import { timingSafeEqual } from "node:crypto";
import { discoverArisanScheduledRooms, dispatchArisanReminders } from "@/lib/server/arisanGatherings";
import { dispatchArisanScheduledKeepalive } from "@/lib/server/arisanScheduledKeepalive";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32) return Response.json({ ok: false, error: "Reminder scheduler is not configured." }, { status: 503, headers });
  const actual = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  if (new URL(request.url).search || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ ok: false, error: "Unauthorized." }, { status: 401, headers });
  const [result, keepalive, discovery] = await Promise.all([dispatchArisanReminders(), dispatchArisanScheduledKeepalive(), discoverArisanScheduledRooms()]);
  return Response.json({ ...result, keepalive, discovery }, { status: result.ok && result.failed === 0 && keepalive.ok && keepalive.failed === 0 && discovery.ok && discovery.failed === 0 ? 200 : 503, headers });
}
