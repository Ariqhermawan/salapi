import { readArisanGathering, saveArisanGathering } from "@/lib/server/arisanGatherings";
import { gatheringRequest, gatheringResponse, invalidRequest } from "./http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  if ([...query.keys()].some(key => key !== "kind" && key !== "roomId") || query.getAll("kind").length !== 1 || query.getAll("roomId").length !== 1 || !/^[1-9]\d{0,9}$/.test(query.get("roomId") ?? "")) return invalidRequest();
  return gatheringResponse(await readArisanGathering({ kind: query.get("kind"), roomId: Number(query.get("roomId")) }));
}
export async function POST(request: Request) {
  try { return gatheringResponse(await saveArisanGathering(await gatheringRequest(request))); } catch { return invalidRequest(); }
}
