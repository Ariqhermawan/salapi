import { readWorkspaceMedia } from "@/lib/server/circleWorkspaceMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params, media = await readWorkspaceMedia(id);
    return new Response(media.bytes as BodyInit, { headers: { "Content-Type": media.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch { return Response.json({ ok: false, error: "Foto tidak tersedia atau akses tidak diizinkan." }, { status: 404, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }
}
