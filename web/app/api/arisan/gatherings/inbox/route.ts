import { markArisanGatheringNotificationsRead, readArisanGatheringInbox } from "@/lib/server/arisanGatherings";
import { gatheringRequest, gatheringResponse, invalidRequest } from "../http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (new URL(request.url).search) return invalidRequest();
  return gatheringResponse(await readArisanGatheringInbox());
}
export async function POST(request: Request) {
  try { return gatheringResponse(await markArisanGatheringNotificationsRead(await gatheringRequest(request))); } catch { return invalidRequest(); }
}
