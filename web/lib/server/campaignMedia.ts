import "server-only";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { StrKey } from "@stellar/stellar-sdk";
import { createClient, isAuthSessionMissingError, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE, supabaseConfigured, supabaseAdminConfigured } from "@/lib/supabase/env";
import { isLocalPreview } from "@/lib/local-preview";
import { CONTRACTS, readContract, donationCampaignId, sc } from "@/lib/server/stellar";
import {
  CAMPAIGN_MEDIA_BUCKET, CAMPAIGN_MEDIA_MIN_PHOTOS, CAMPAIGN_MEDIA_MAX_PHOTOS, CAMPAIGN_MEDIA_MAX_FILE_BYTES,
  CAMPAIGN_MEDIA_MAX_TOTAL_BYTES, CAMPAIGN_MEDIA_MAX_DIMENSION, canonicalCampaignMediaId, campaignMediaFileAllowed,
  campaignMediaSignatureAllowed, scopedCampaignMediaPhotos, publicCampaignMediaPhoto,
  type CampaignMediaCode, type CampaignMediaEnvelope, type CampaignMediaResult, type StoredCampaignMediaPhoto,
} from "@/lib/campaign-media";

const TABLE = "campaign_media";
const COLUMNS = "network,contract_id,campaign_id,creator_wallet,photos,public_acknowledged,updated_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type MediaContext = { admin: SupabaseClient; origin: string; base: CampaignMediaEnvelope };
type Owner = { ownerId: string | null; wallet: string | null; code: "unauthenticated" | "unavailable" | "no_wallet" | null };
type Row = { network: unknown; contract_id: unknown; campaign_id: unknown; creator_wallet: unknown; photos: unknown; public_acknowledged: unknown; updated_at: unknown };

function failure(base: CampaignMediaEnvelope, code: CampaignMediaCode): CampaignMediaResult {
  return { ...base, ok: false, available: false, code };
}

function baseFor(input: unknown): CampaignMediaEnvelope {
  return { network: "testnet", contractId: donationCampaignId(), campaignId: canonicalCampaignMediaId(input) ?? "", creatorWallet: null,
    photos: [], updatedAt: null, ownerId: null, canManage: false, permissionCode: null };
}

function context(base: CampaignMediaEnvelope): MediaContext | null {
  if (!supabaseAdminConfigured()) return null;
  try {
    const url = new URL(SUPABASE_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    const origin = url.origin;
    const boundedFetch: typeof fetch = (input, init) => {
      const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (target.origin !== origin || target.username || target.password) return Promise.reject(new Error("Unexpected media origin"));
      const timeout = AbortSignal.timeout(8_000);
      const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      return fetch(input, { ...init, signal, redirect: "error", cache: "no-store" });
    };
    return { base, origin, admin: createClient(origin, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: boundedFetch },
    }) };
  } catch { return null; }
}

function missingSetup(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; statusCode?: unknown; error?: unknown; message?: unknown };
  return ["42P01", "PGRST205", "NoSuchBucket"].includes(String(value.code)) || String(value.statusCode) === "404" ||
    value.error === "Bucket not found" || value.message === "Bucket not found";
}

async function ownerFor(admin: SupabaseClient): Promise<Owner> {
  if (!supabaseConfigured()) return { ownerId: null, wallet: null, code: "unavailable" };
  let request: SupabaseClient;
  try { request = await createSupabaseServer(); }
  catch { return { ownerId: null, wallet: null, code: "unavailable" }; }
  let ownerId: string | null = null;
  try {
    const { data, error } = await request.auth.getUser();
    if (error) return { ownerId: null, wallet: null, code: data.user === null && isAuthSessionMissingError(error) ? "unauthenticated" : "unavailable" };
    if (data.user === null) return { ownerId: null, wallet: null, code: "unauthenticated" };
    if (!data.user || typeof data.user.id !== "string" || !UUID.test(data.user.id)) return { ownerId: null, wallet: null, code: "unavailable" };
    ownerId = data.user.id;
    const saved = await admin.from("wallets").select("public_key").eq("user_id", ownerId).maybeSingle();
    if (saved.error) return { ownerId, wallet: null, code: "unavailable" };
    if (saved.data === null) return { ownerId, wallet: null, code: "no_wallet" };
    if (!saved.data || typeof saved.data.public_key !== "string" || !StrKey.isValidEd25519PublicKey(saved.data.public_key)) return { ownerId, wallet: null, code: "unavailable" };
    return { ownerId, wallet: saved.data.public_key, code: null };
  } catch (error) { return { ownerId, wallet: null, code: ownerId === null && isAuthSessionMissingError(error) ? "unauthenticated" : "unavailable" }; }
}

async function deadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Media identity read timed out")), 8_000); })]); }
  finally { if (timer) clearTimeout(timer); }
}

async function creatorFor(base: CampaignMediaEnvelope): Promise<string> {
  if (!base.contractId || !StrKey.isValidContract(base.contractId)) throw new Error("Invalid configured deployment");
  const [version, token] = await deadline(Promise.all([readContract(base.contractId, "version"), readContract(base.contractId, "token")]));
  if (version !== 4 || token !== CONTRACTS.tokenXlmSac) throw new Error("Deployment is not D4 Testnet XLM");
  const value = await deadline(readContract(base.contractId, "campaign", [sc.u64(BigInt(base.campaignId))])) as { id?: unknown; config?: { creator?: unknown; token?: unknown } };
  if (!value || String(value.id) !== base.campaignId || value.config?.token !== CONTRACTS.tokenXlmSac ||
    typeof value.config.creator !== "string" || !StrKey.isValidEd25519PublicKey(value.config.creator)) throw new Error("Campaign identity unavailable");
  return value.config.creator;
}

async function bucketReady(admin: SupabaseClient): Promise<"ready" | "not_configured" | "unavailable"> {
  try {
    const { data, error } = await admin.storage.getBucket(CAMPAIGN_MEDIA_BUCKET);
    if (error) return missingSetup(error) ? "not_configured" : "unavailable";
    return data?.id === CAMPAIGN_MEDIA_BUCKET && data.public === true && data.file_size_limit === CAMPAIGN_MEDIA_MAX_FILE_BYTES &&
      data.allowed_mime_types?.length === 1 && data.allowed_mime_types[0] === "image/jpeg" ? "ready" : "not_configured";
  } catch { return "unavailable"; }
}

async function storedRow(ctx: MediaContext) {
  return ctx.admin.from(TABLE).select(COLUMNS).eq("network", "testnet").eq("contract_id", ctx.base.contractId!)
    .eq("campaign_id", ctx.base.campaignId).maybeSingle();
}

function validatedRow(row: Row, base: CampaignMediaEnvelope): { photos: StoredCampaignMediaPhoto[]; updatedAt: string } | null {
  if (row.network !== "testnet" || row.contract_id !== base.contractId || row.campaign_id !== base.campaignId ||
    row.creator_wallet !== base.creatorWallet || row.public_acknowledged !== true || typeof row.updated_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(row.updated_at) || !Number.isFinite(Date.parse(row.updated_at))) return null;
  const photos = scopedCampaignMediaPhotos(row.photos, base.contractId!, base.campaignId);
  return photos ? { photos, updatedAt: row.updated_at } : null;
}

/** Public photos remain readable when optional viewer authentication fails. */
export async function readCampaignMedia(input: unknown): Promise<CampaignMediaResult> {
  const base = baseFor(input);
  if (!base.campaignId) return failure(base, "invalid_campaign");
  if (isLocalPreview) return failure(base, "local_preview");
  if (!base.contractId) return failure(base, "not_configured");
  const ctx = context(base);
  if (!ctx) return failure(base, "not_configured");
  try {
    const row = await storedRow(ctx);
    if (row.error) return failure(base, missingSetup(row.error) ? "not_configured" : "unavailable");
    const ready = await bucketReady(ctx.admin);
    if (ready !== "ready") return failure(base, ready);
    const [creator, owner] = await Promise.all([creatorFor(base), ownerFor(ctx.admin)]);
    base.creatorWallet = creator;
    base.ownerId = owner.ownerId;
    base.canManage = !!owner.wallet && owner.wallet === creator;
    base.permissionCode = owner.code ?? (base.canManage ? null : "not_creator");
    if (row.data !== null) {
      const valid = validatedRow(row.data as Row, base);
      if (!valid) return failure(base, "unavailable");
      base.photos = valid.photos.map(photo => publicCampaignMediaPhoto(ctx.origin, photo));
      base.updatedAt = valid.updatedAt;
    }
    return { ...base, ok: true, available: true };
  } catch { return failure(base, "unavailable"); }
}

async function normalizedPhotos(form: FormData): Promise<{ bytes: Buffer; sha256: string; width: number; height: number }[] | null> {
  const files = form.getAll("photos");
  if (files.length < CAMPAIGN_MEDIA_MIN_PHOTOS || files.length > CAMPAIGN_MEDIA_MAX_PHOTOS ||
    !files.every(file => file instanceof File && campaignMediaFileAllowed(file))) return null;
  const images = files as File[];
  if (images.reduce((total, file) => total + file.size, 0) > CAMPAIGN_MEDIA_MAX_TOTAL_BYTES) return null;
  const result: { bytes: Buffer; sha256: string; width: number; height: number }[] = [];
  try {
    // Sequential decoding bounds memory. Raster decode/re-encode drops EXIF/GPS,
    // animation, appended payloads, filenames and all caller-selected paths.
    for (const file of images) {
      const input = Buffer.from(await file.arrayBuffer());
      if (!campaignMediaSignatureAllowed(input)) return null;
      const decoder = sharp(input, { limitInputPixels: 16_777_216, failOn: "warning", animated: false });
      const metadata = await decoder.metadata();
      if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) !== 1) return null;
      const output = await decoder.rotate().resize(CAMPAIGN_MEDIA_MAX_DIMENSION, CAMPAIGN_MEDIA_MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true });
      if (!output.data.length || output.data.length > CAMPAIGN_MEDIA_MAX_FILE_BYTES) return null;
      result.push({ bytes: output.data, sha256: createHash("sha256").update(output.data).digest("hex"), width: output.info.width, height: output.info.height });
    }
    return new Set(result.map(photo => photo.sha256)).size === result.length ? result : null;
  } catch { return null; }
}

async function cleanup(admin: SupabaseClient, paths: string[]) {
  if (!paths.length) return;
  try { await admin.storage.from(CAMPAIGN_MEDIA_BUCKET).remove(paths); } catch { /* Reviewed lifecycle cleanup may remove public orphan uploads. */ }
}

/** No signer, Friendbot, custody secret or financial write is used here. */
export async function publishCampaignMedia(input: unknown, expectedOwnerId: unknown, form: unknown): Promise<CampaignMediaResult> {
  const base = baseFor(input);
  if (!base.campaignId) return failure(base, "invalid_campaign");
  if (isLocalPreview) return failure(base, "local_preview");
  if (!base.contractId) return failure(base, "not_configured");
  const ctx = context(base);
  if (!ctx) return failure(base, "not_configured");
  const owner = await ownerFor(ctx.admin);
  base.ownerId = owner.ownerId;
  if (owner.code) return failure(base, owner.code);
  if (typeof expectedOwnerId !== "string" || expectedOwnerId !== owner.ownerId) return failure(base, "account_changed");
  if (!(form instanceof FormData)) return failure(base, "invalid_photos");
  if (form.getAll("publicAcknowledged").length !== 1 || form.get("publicAcknowledged") !== "true") return failure(base, "ack_required");
  if ([...form.keys()].some(key => key !== "photos" && key !== "publicAcknowledged")) return failure(base, "invalid_photos");
  try {
    base.creatorWallet = await creatorFor(base);
    if (owner.wallet !== base.creatorWallet) return failure(base, "not_creator");
    base.canManage = true;
    const ready = await bucketReady(ctx.admin);
    if (ready !== "ready") return failure(base, ready);
    const old = await storedRow(ctx);
    if (old.error) return failure(base, missingSetup(old.error) ? "not_configured" : "unavailable");
    const prior = old.data === null ? null : validatedRow(old.data as Row, base);
    if (old.data !== null && !prior) return failure(base, "unavailable");
    const normalized = await normalizedPhotos(form);
    if (!normalized) return failure(base, "invalid_photos");
    const batch = randomUUID();
    const stored = normalized.map((photo, index) => ({ path: `testnet/${base.contractId}/${base.campaignId}/${batch}/${index}-${photo.sha256}.jpg`,
      sha256: photo.sha256, width: photo.width, height: photo.height }));
    const attempted: string[] = [];
    let publishStarted = false;
    try {
      const bucket = ctx.admin.storage.from(CAMPAIGN_MEDIA_BUCKET);
      for (let index = 0; index < stored.length; index++) {
        attempted.push(stored[index].path);
        const uploaded = await bucket.upload(stored[index].path, normalized[index].bytes, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
        if (uploaded.error || uploaded.data?.path !== stored[index].path) throw new Error("Media upload unavailable");
      }
      publishStarted = true;
      const saved = await ctx.admin.from(TABLE).upsert({ network: "testnet", contract_id: base.contractId, campaign_id: base.campaignId,
        creator_wallet: base.creatorWallet, published_by: owner.ownerId, photos: stored, public_acknowledged: true, updated_at: new Date().toISOString() },
      { onConflict: "network,contract_id,campaign_id" }).select(COLUMNS).single();
      const confirmed = saved.data && !saved.error ? validatedRow(saved.data as Row, base) : null;
      if (!confirmed || JSON.stringify(confirmed.photos) !== JSON.stringify(stored)) return failure(base, "save_failed");
      base.photos = confirmed.photos.map(photo => publicCampaignMediaPhoto(ctx.origin, photo));
      base.updatedAt = confirmed.updatedAt;
      // Old paths were strictly scoped and never overlap this immutable batch.
      // Concurrent writes cannot delete another batch's newly published objects.
      await cleanup(ctx.admin, prior?.photos.map(photo => photo.path) ?? []);
      return { ...base, ok: true, available: true };
    } catch {
      // A response can fail after metadata persisted. Never delete the new batch
      // after publishing began; a fresh read/lifecycle review resolves ambiguity.
      if (!publishStarted) await cleanup(ctx.admin, attempted);
      return failure(base, "save_failed");
    }
  } catch { return failure(base, "unavailable"); }
}
