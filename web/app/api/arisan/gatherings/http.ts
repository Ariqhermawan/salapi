import type { ArisanGatheringFailure } from "@/lib/arisan-gatherings";
export const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
export function gatheringResponse(result: { ok: true } | ArisanGatheringFailure) {
  const status = result.ok ? 200 : result.code === "invalid" ? 400 : result.code === "unauthorized" ? 401 : result.code === "forbidden" ? 403 : result.code === "conflict" ? 409 : 503;
  return Response.json(result, { status, headers: privateHeaders });
}
/** Cookie-authenticated mutations require an exact same-origin browser request.
 * Stream cap prevents unbounded JSON parsing before owner authentication. */
export async function gatheringRequest(request: Request): Promise<unknown> {
  if (request.headers.get("origin") !== new URL(request.url).origin || new URL(request.url).search || request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw Error("Invalid request");
  const reader = request.body?.getReader(); if (!reader) throw Error("Missing JSON body");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 8192) throw Error("JSON too large"); chunks.push(value); }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const buffer = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
}
export const invalidRequest = () => gatheringResponse({ ok: false, code: "invalid", error: "Invalid room coordination request." });
