import type { CircleCategory } from "./types";

/** User-authored records are deliberately separate from the invented Circles catalogue. */
export type WorkspaceActor = { id: string; name: string; kind: "person" | "ngo"; verification: "unverified" };
export type WorkspaceMedia = { id: string; ownerId: string; name: string; mime: string; size: number; sha256: string; url: string };
export type WorkspaceCampaign = {
  id: string; organizerId: string; organizerName: string; organizerKind: "person" | "ngo";
  title: string; story: string; location: string; category: CircleCategory; goalPHP: number; allowancePct: number;
  coverMediaId: string; createdAt: string; status: "published" | "completed"; contractCampaignId?: string; contractCreatorWallet?: string; contractAddress?: string;
};
export type WorkspaceUpdate = { id: string; campaignId: string; title: string; body: string; kind: "progress" | "spend" | "delivery"; mediaIds: string[]; createdAt: string };
export type WorkspaceReview = { id: string; campaignId: string; organizerId: string; donorId: string; donorName: string; stars: number; comment: string; createdAt: string };
export type WorkspaceSupport = { campaignId: string; userId: string; amount: string; simulated: boolean };
export type WorkspaceSnapshot = {
  mode: "local" | "testnet"; actor: WorkspaceActor | null; profiles: WorkspaceActor[]; campaigns: WorkspaceCampaign[]; localRole?: "organizer" | "donor" | "visitor";
  updates: WorkspaceUpdate[]; reviews: WorkspaceReview[]; supports: WorkspaceSupport[]; following: string[]; media: WorkspaceMedia[]; unavailable?: string;
};
export type WorkspaceResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
export type PublishWorkspaceInput = { title: string; story: string; location: string; category: CircleCategory; goalPHP: number; allowancePct: number; coverMediaId: string; publicMediaConsent: true; requestId?: string };
export type WorkspaceUpdateInput = { campaignId: string; title: string; body: string; kind: "progress" | "spend" | "delivery"; mediaIds: string[]; publicMediaConsent: true; requestId?: string };
export type WorkspaceReviewInput = { campaignId: string; stars: number; comment: string };
export const WORKSPACE_MEDIA_LIMIT = 4 * 1024 * 1024;
export const WORKSPACE_CATEGORIES: readonly CircleCategory[] = ["disaster", "medical", "education", "community", "family", "creator", "animals", "care", "volunteer"];
export const WORKSPACE_LOCAL_ACTORS: Record<"organizer" | "donor", WorkspaceActor> = {
  organizer: { id: "11111111-1111-4111-8111-111111111111", name: "Organizer lokal", kind: "person", verification: "unverified" },
  donor: { id: "22222222-2222-4222-8222-222222222222", name: "Donatur lokal", kind: "person", verification: "unverified" },
};
export function workspaceId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) throw new Error("ID tidak valid.");
  return value.toLowerCase();
}
function text(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error(`${label} harus ${min}-${max} karakter.`);
  return value.trim();
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Data tidak valid.");
  return value as Record<string, unknown>;
}
export function parseWorkspacePublish(input: unknown): PublishWorkspaceInput {
  const v = record(input);
  if (!WORKSPACE_CATEGORIES.includes(v.category as CircleCategory)) throw new Error("Pilih kategori yang tersedia.");
  if (typeof v.goalPHP !== "number" || !Number.isFinite(v.goalPHP) || v.goalPHP < 1 || v.goalPHP > 100_000_000 || Math.abs(Math.round(v.goalPHP * 100) - v.goalPHP * 100) > 0.000001) throw new Error("Target harus 1-100.000.000 PHP, maksimal dua desimal.");
  if (typeof v.allowancePct !== "number" || !Number.isInteger(v.allowancePct) || v.allowancePct < 0 || v.allowancePct > 10) throw new Error("Imbalan organizer harus 0-10 persen.");
  if (v.publicMediaConsent !== true) throw new Error("Persetujuan publikasi foto wajib diisi. Jangan unggah identitas atau informasi pribadi penerima.");
  const title = text(v.title, "Judul", 5, 100);
  if (new TextEncoder().encode(title).byteLength > 120) throw new Error("Judul maksimal 120 byte UTF-8 agar dapat dihubungkan ke D4.");
  return { title, story: text(v.story, "Cerita", 40, 8000), location: text(v.location, "Lokasi", 2, 100), category: v.category as CircleCategory, goalPHP: Math.round(v.goalPHP * 100) / 100, allowancePct: v.allowancePct, coverMediaId: workspaceId(v.coverMediaId), publicMediaConsent: true, ...(v.requestId ? { requestId: workspaceId(v.requestId) } : {}) };
}
export function parseWorkspaceUpdate(input: unknown): WorkspaceUpdateInput {
  const v = record(input);
  if (!["progress", "spend", "delivery"].includes(String(v.kind))) throw new Error("Jenis update tidak valid.");
  if (!Array.isArray(v.mediaIds) || v.mediaIds.length > 4) throw new Error("Maksimal empat foto per update.");
  const mediaIds = v.mediaIds.map(workspaceId);
  if (new Set(mediaIds).size !== mediaIds.length) throw new Error("Foto tidak boleh duplikat.");
  if (v.kind === "delivery" && mediaIds.length === 0) throw new Error("Bukti penyaluran memerlukan minimal satu foto.");
  if (v.publicMediaConsent !== true) throw new Error("Persetujuan publikasi update wajib diisi.");
  return { campaignId: workspaceId(v.campaignId), title: text(v.title, "Judul update", 3, 100), body: text(v.body, "Isi update", 10, 4000), kind: v.kind as WorkspaceUpdate["kind"], mediaIds, publicMediaConsent: true, ...(v.requestId ? { requestId: workspaceId(v.requestId) } : {}) };
}
export function parseWorkspaceReview(input: unknown): WorkspaceReviewInput {
  const v = record(input);
  if (typeof v.stars !== "number" || !Number.isInteger(v.stars) || v.stars < 1 || v.stars > 5) throw new Error("Pilih 1-5 bintang.");
  return { campaignId: workspaceId(v.campaignId), stars: v.stars, comment: text(v.comment, "Review", 10, 1000) };
}
/** Positive decimal XLM, never currency conversion or a payment receipt. */
export function parseWorkspaceSupport(value: unknown): string {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,6})(?:\.\d{1,7})?$/.test(value)) throw new Error("Masukkan jumlah XLM positif, maksimal tujuh desimal.");
  const amount = BigInt(value.split(".")[0]) * 10_000_000n + BigInt((value.split(".")[1] ?? "").padEnd(7, "0"));
  if (amount <= 0n || amount > 10_000_000_000_000n) throw new Error("Jumlah simulasi harus lebih dari nol dan maksimal 1.000.000 XLM.");
  return value;
}
export function workspaceReviewEligibility(actor: WorkspaceActor | null, campaign: WorkspaceCampaign, support: WorkspaceSupport | undefined, existing: WorkspaceReview[]): string | null {
  if (!actor) return "Masuk sebagai donatur untuk memberi review.";
  if (campaign.organizerId === actor.id) return "Organizer tidak dapat mereview campaign sendiri.";
  if (campaign.status !== "completed") return "Review tersedia setelah penyaluran selesai.";
  if (!support || support.userId !== actor.id || support.campaignId !== campaign.id || !/^(?:0|[1-9]\d{0,30})(?:\.\d{1,7})?$/.test(support.amount) || !/[1-9]/.test(support.amount)) return "Hanya donatur dengan kontribusi terkonfirmasi yang dapat memberi review.";
  if (existing.some(r => r.campaignId === campaign.id && r.donorId === actor.id)) return "Anda sudah memberi review untuk campaign ini.";
  return null;
}
export function workspaceXlmFromStroops(raw: string): string {
  if (!/^\d{1,40}$/.test(raw)) throw new Error("Jumlah kontribusi kontrak tidak valid.");
  const stroops = BigInt(raw), whole = stroops / 10_000_000n;
  const fraction = (stroops % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}
export function isWorkspaceLocalHost(host: string | null, forwarded: string | null, origin: string | null, deployment: boolean, preview: boolean): boolean {
  if (!preview || deployment || !host || forwarded && forwarded !== host || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host)) return false;
  if (origin) { try { if (new URL(origin).host !== host) return false; } catch { return false; } }
  return true;
}
