/** Off-chain, organizer-published photos. Never a contract proof or verification. */
export const CAMPAIGN_MEDIA_BUCKET = "campaign-media";
export const CAMPAIGN_MEDIA_MIN_PHOTOS = 3;
export const CAMPAIGN_MEDIA_MAX_PHOTOS = 6;
export const CAMPAIGN_MEDIA_MAX_FILE_BYTES = 150 * 1024;
export const CAMPAIGN_MEDIA_MAX_TOTAL_BYTES = 900 * 1024;
export const CAMPAIGN_MEDIA_MAX_DIMENSION = 1280;

export type CampaignMediaPhoto = { src: string; width: number; height: number };
export type CampaignMediaCode = "invalid_campaign" | "local_preview" | "not_configured" | "unavailable" |
  "unauthenticated" | "account_changed" | "no_wallet" | "not_creator" | "invalid_photos" | "ack_required" | "save_failed";
export type CampaignMediaEnvelope = {
  network: "testnet"; contractId: string | null; campaignId: string; creatorWallet: string | null;
  photos: CampaignMediaPhoto[]; updatedAt: string | null; ownerId: string | null; canManage: boolean;
  permissionCode: "unauthenticated" | "unavailable" | "no_wallet" | "not_creator" | null;
};
export type CampaignMediaResult = CampaignMediaEnvelope & (
  { ok: true; available: true } | { ok: false; available: false; code: CampaignMediaCode }
);
export type StoredCampaignMediaPhoto = { path: string; sha256: string; width: number; height: number };

export function canonicalCampaignMediaId(input: unknown): string | null {
  if (typeof input !== "string" || !/^[1-9]\d{0,19}$/.test(input)) return null;
  return BigInt(input) <= (1n << 64n) - 1n ? input : null;
}

export function campaignMediaFileAllowed(file: { size: number; type: string; name: string }): boolean {
  return Number.isSafeInteger(file.size) && file.size > 0 && file.size <= CAMPAIGN_MEDIA_MAX_FILE_BYTES &&
    ["image/jpeg", "image/png", "image/webp"].includes(file.type) &&
    new TextEncoder().encode(file.name).length <= 120 && !/[\u0000-\u001f\u007f]/.test(file.name);
}

export function campaignMediaSignatureAllowed(bytes: Uint8Array): boolean {
  return (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) ||
    (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP");
}

export function scopedCampaignMediaPhotos(value: unknown, contractId: string, campaignId: string): StoredCampaignMediaPhoto[] | null {
  if (!Array.isArray(value) || value.length < CAMPAIGN_MEDIA_MIN_PHOTOS || value.length > CAMPAIGN_MEDIA_MAX_PHOTOS) return null;
  const prefix = `testnet/${contractId}/${campaignId}/`;
  const result: StoredCampaignMediaPhoto[] = [];
  for (let index = 0; index < value.length; index++) {
    const photo = value[index];
    if (!photo || typeof photo !== "object" || typeof photo.path !== "string" || !photo.path.startsWith(prefix) ||
      typeof photo.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(photo.sha256) ||
      !Number.isInteger(photo.width) || !Number.isInteger(photo.height) || photo.width < 1 || photo.height < 1 ||
      photo.width > CAMPAIGN_MEDIA_MAX_DIMENSION || photo.height > CAMPAIGN_MEDIA_MAX_DIMENSION) return null;
    const suffix = photo.path.slice(prefix.length);
    if (!new RegExp(`^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/${index}-${photo.sha256}\\.jpg$`).test(suffix)) return null;
    result.push({ path: photo.path, sha256: photo.sha256, width: photo.width, height: photo.height });
  }
  if (new Set(result.map(photo => photo.path)).size !== result.length || new Set(result.map(photo => photo.sha256)).size !== result.length) return null;
  return result;
}

export function publicCampaignMediaPhoto(origin: string, photo: StoredCampaignMediaPhoto): CampaignMediaPhoto {
  return { src: `${origin}/storage/v1/object/public/${CAMPAIGN_MEDIA_BUCKET}/${photo.path}`, width: photo.width, height: photo.height };
}
