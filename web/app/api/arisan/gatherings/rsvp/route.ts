import { rsvpArisanGathering } from "@/lib/server/arisanGatherings";
import { gatheringRequest, gatheringResponse, invalidRequest } from "../http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return gatheringResponse(await rsvpArisanGathering(await gatheringRequest(request))); } catch { return invalidRequest(); }
}
