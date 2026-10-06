import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import sharp from "sharp";
import { WORKSPACE_MEDIA_LIMIT, workspaceId, type WorkspaceMedia } from "@/lib/circles/workspace";
import { workspaceContext, requireWorkspaceActor, WORKSPACE_BUCKET, workspaceMediaUrl } from "./circleWorkspace";
import { boundedWorkspacePath, circleWorkspaceDirectory, localMediaVisible, mutateLocalWorkspace, readLocalWorkspace } from "./circleWorkspaceLocal";

export function imageSignature(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return "image/webp";
  return null;
}
export async function normalizeWorkspaceImage(file: File): Promise<{ bytes: Buffer; mime: string; name: string }> {
  if (file.size < 12 || file.size > WORKSPACE_MEDIA_LIMIT || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Foto harus PNG, JPEG, atau WebP dengan ukuran maksimal 4 MiB.");
  const original = Buffer.from(await file.arrayBuffer());
  if (imageSignature(original) !== file.type) throw new Error("Isi file tidak sesuai format foto.");
  try {
    const decoder = sharp(original, { limitInputPixels: 24_000_000, animated: false, failOn: "warning" });
    const metadata = await decoder.metadata();
    if (!metadata.width || !metadata.height || metadata.width < 16 || metadata.height < 16 || metadata.pages && metadata.pages > 1 || metadata.width * metadata.height > 24_000_000) throw new Error("Invalid dimensions.");
    // Re-encoding strips EXIF/GPS and embedded non-image payloads. Stored hash describes this safe photo.
    const bytes = await decoder.rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    if (bytes.length > WORKSPACE_MEDIA_LIMIT) throw new Error("Image too large.");
    const basename = file.name.replace(/[\x00-\x1f\x7f/\\<>:"|?*]/g, "").replace(/\.[^.]*$/, "").slice(0, 80) || "photo";
    return { bytes, mime: "image/webp", name: `${basename}.webp` };
  } catch { throw new Error("Foto tidak dapat dibaca. Gunakan gambar valid, bukan animasi, minimal 16 px dan maksimal 24 megapiksel."); }
}
export async function uploadWorkspaceMedia(file: File): Promise<WorkspaceMedia> {
  const context = await workspaceContext(true), actor = requireWorkspaceActor(context);
  const normalized = await normalizeWorkspaceImage(file);
  const id = randomUUID(), objectPath = `${actor.id}/${id}.webp`;
  const media: WorkspaceMedia = { id, ownerId: actor.id, name: normalized.name, mime: normalized.mime, size: normalized.bytes.length, sha256: createHash("sha256").update(normalized.bytes).digest("hex"), url: workspaceMediaUrl(id) };
  if (context.mode === "local") {
    const base = circleWorkspaceDirectory();
    await mkdir(boundedWorkspacePath(base, actor.id), { recursive: true });
    const target = boundedWorkspacePath(base, objectPath);
    await writeFile(target, normalized.bytes, { flag: "wx", mode: 0o600 });
    try { await mutateLocalWorkspace(store => { if (store.media.filter(m => m.ownerId === actor.id).length >= 200) throw new Error("Batas 200 foto per akun lokal tercapai."); store.media.push({ ...media, objectPath }); }); }
    catch (error) { await unlink(target); throw error; }
  } else {
    const uploaded = await context.db.storage.from(WORKSPACE_BUCKET).upload(objectPath, normalized.bytes, { contentType: media.mime, upsert: false });
    if (uploaded.error) throw new Error(uploaded.error.message);
    const row = await context.db.from("circle_workspace_media").insert({ id, owner_id: actor.id, object_path: objectPath, name: media.name, mime: media.mime, size: media.size, sha256: media.sha256 });
    if (row.error) { await context.db.storage.from(WORKSPACE_BUCKET).remove([objectPath]); throw new Error(row.error.message); }
  }
  return media;
}
export async function readWorkspaceMedia(idInput: unknown): Promise<{ bytes: Uint8Array; mime: string }> {
  const id = workspaceId(idInput), context = await workspaceContext();
  if (context.mode === "local") {
    const store = await readLocalWorkspace(), media = store.media.find(m => m.id === id);
    if (!media || !localMediaVisible(store, media, context.actor)) throw new Error("Foto tidak tersedia.");
    return { bytes: await readFile(boundedWorkspacePath(circleWorkspaceDirectory(), media.objectPath)), mime: media.mime };
  }
  const result = await context.db.from("circle_workspace_media").select("object_path,mime").eq("id", id).single();
  if (result.error || !result.data) throw new Error("Foto tidak tersedia.");
  // Short-lived authenticated signed URL is kept on the server; browser receives same-origin bytes only.
  const signed = await context.db.storage.from(WORKSPACE_BUCKET).createSignedUrl(result.data.object_path, 30);
  if (signed.error) throw new Error("Foto tidak tersedia.");
  const response = await fetch(signed.data.signedUrl, { cache: "no-store", redirect: "error" });
  if (!response.ok) throw new Error("Foto tidak tersedia.");
  return { bytes: new Uint8Array(await response.arrayBuffer()), mime: result.data.mime };
}
