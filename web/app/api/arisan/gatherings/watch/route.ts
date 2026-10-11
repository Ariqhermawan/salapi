import { watchArisanGathering } from "@/lib/server/arisanGatherings";
import { gatheringRequest, gatheringResponse, invalidRequest } from "../http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return gatheringResponse(await watchArisanGathering(await gatheringRequest(request))); }
  catch { return invalidRequest(); }
}
