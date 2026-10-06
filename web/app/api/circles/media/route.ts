import { headers } from "next/headers";
import { uploadWorkspaceMedia } from "@/lib/server/circleWorkspaceMedia";
import { workspaceSafeError, workspaceContext } from "@/lib/server/circleWorkspace";
import { WORKSPACE_MEDIA_LIMIT } from "@/lib/circles/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const h = await headers(), origin = h.get("origin"), host = h.get("host");
    if (!origin || !host || new URL(origin).host !== host) throw new Error("Permintaan upload harus berasal dari aplikasi ini.");
    await workspaceContext(true);
    const maximum = WORKSPACE_MEDIA_LIMIT + 32_768;
    const length = h.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) throw new Error("Ukuran upload tidak valid atau lebih dari 4 MiB.");
    if (!request.body || !h.get("content-type")?.startsWith("multipart/form-data;")) throw new Error("Gunakan formulir upload foto.");
    // Bound actual streamed bytes; Content-Length can lie or be absent on chunked requests.
    const reader = request.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > maximum) { await reader.cancel(); throw new Error("Ukuran upload lebih dari 4 MiB."); } chunks.push(chunk.value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const bounded = new Request(request.url, { method: "POST", headers: request.headers, body: bytes });
    const data = await bounded.formData(), file = data.get("file");
    if (!(file instanceof File) || data.get("publicMediaConsent") !== "true") throw new Error("Pilih foto dan setujui penggunaannya untuk campaign publik.");
    const media = await uploadWorkspaceMedia(file);
    return Response.json({ ok: true, media }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return Response.json({ ok: false, error: workspaceSafeError(error) }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
}
