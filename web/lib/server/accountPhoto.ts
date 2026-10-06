import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { isAuthSessionMissingError, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/env";
import { isLocalPreview } from "@/lib/local-preview";
import {
  ACCOUNT_AVATAR_BUCKET, ACCOUNT_AVATAR_METADATA_KEY, ACCOUNT_AVATAR_MAX_BYTES,
  accountPhotoFileAllowed, accountPhotoSignatureAllowed, googleAccountPhoto, ownedAccountPhotoPath,
  type AccountPhoto, type AccountPhotoResult,
} from "@/lib/account-photo";

type Owner = { ok: true; supabase: SupabaseClient; user: User } | { ok: false; code: "unavailable" | "unauthenticated" | "account_changed" };

async function requestOwner(expectedOwner?: string): Promise<Owner> {
  if (isLocalPreview || !supabaseConfigured()) return { ok: false, code: "unavailable" };
  let supabase: SupabaseClient;
  try { supabase = await createSupabaseServer(); }
  catch { return { ok: false, code: "unavailable" }; }
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return { ok: false, code: data.user === null && isAuthSessionMissingError(error) ? "unauthenticated" : "unavailable" };
    if (data.user === null) return { ok: false, code: "unauthenticated" };
    const user = data.user;
    if (!user || typeof user.id !== "string" || !/^[0-9a-f-]{36}$/i.test(user.id)) return { ok: false, code: "unavailable" };
    if (expectedOwner !== undefined && expectedOwner !== user.id) return { ok: false, code: "account_changed" };
    return { ok: true, supabase, user };
  } catch (error) { return { ok: false, code: isAuthSessionMissingError(error) ? "unauthenticated" : "unavailable" }; }
}

function baseProfile(user: User): AccountPhoto {
  const googlePhotoUrl = googleAccountPhoto(user);
  return { ownerId: user.id, email: typeof user.email === "string" ? user.email.trim() : "",
    photoUrl: googlePhotoUrl, googlePhotoUrl, source: googlePhotoUrl ? "google" : "initials" };
}

async function profileFor(supabase: SupabaseClient, user: User): Promise<AccountPhoto> {
  const profile = baseProfile(user);
  const rawPath = user.user_metadata?.[ACCOUNT_AVATAR_METADATA_KEY];
  if (!rawPath) return profile;
  const path = ownedAccountPhotoPath(rawPath, user.id);
  if (!path) return { ...profile, warning: "storage_unavailable" };
  try {
    const { data, error } = await supabase.storage.from(ACCOUNT_AVATAR_BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) return { ...profile, warning: "storage_unavailable" };
    return { ...profile, photoUrl: data.signedUrl, source: "custom" };
  } catch { return { ...profile, warning: "storage_unavailable" }; }
}

export async function readAccountPhoto(): Promise<AccountPhotoResult> {
  const owner = await requestOwner();
  if (!owner.ok) return owner;
  return { ok: true, profile: await profileFor(owner.supabase, owner.user) };
}

async function removeOwnedPhoto(supabase: SupabaseClient, path: string | null) {
  if (!path) return;
  // Cleanup cannot turn a confirmed profile update into a false failure. Bucket
  // lifecycle/owner cleanup may remove an orphan if this best-effort request fails.
  try { await supabase.storage.from(ACCOUNT_AVATAR_BUCKET).remove([path]); } catch { /* See setup recipe. */ }
}

export async function uploadAccountPhoto(expectedOwner: string, formData: FormData): Promise<AccountPhotoResult> {
  if (typeof expectedOwner !== "string" || !expectedOwner) return { ok: false, code: "account_changed" };
  const owner = await requestOwner(expectedOwner);
  if (!owner.ok) return owner;
  if (!(formData instanceof FormData)) return { ok: false, code: "invalid_file" };
  const file = formData.get("photo");
  if (!(file instanceof File) || !accountPhotoFileAllowed(file)) return { ok: false, code: "invalid_file" };
  let image: Buffer;
  try {
    // Decode, constrain pixels and re-encode raster data. No SVG, animation,
    // executable payload or embedded EXIF/GPS metadata is retained.
    const input = Buffer.from(await file.arrayBuffer());
    if (!accountPhotoSignatureAllowed(input)) return { ok: false, code: "invalid_file" };
    const decoder = sharp(input, { limitInputPixels: 16_777_216, failOn: "warning", animated: false });
    const metadata = await decoder.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) !== 1)
      return { ok: false, code: "invalid_file" };
    image = await decoder.rotate().resize(512, 512, { fit: "cover", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    if (!image.length || image.length > ACCOUNT_AVATAR_MAX_BYTES) return { ok: false, code: "invalid_file" };
  } catch { return { ok: false, code: "invalid_file" }; }

  const path = `${owner.user.id}/${randomUUID()}.jpg`;
  const bucket = owner.supabase.storage.from(ACCOUNT_AVATAR_BUCKET);
  let updateStarted = false;
  try {
    const uploaded = await bucket.upload(path, image, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
    if (uploaded.error || uploaded.data?.path !== path) return { ok: false, code: "storage_unavailable" };
    // Confirm readability before changing the profile preference.
    const signed = await bucket.createSignedUrl(path, 3600);
    if (signed.error || !signed.data?.signedUrl) {
      await removeOwnedPhoto(owner.supabase, path);
      return { ok: false, code: "storage_unavailable" };
    }
    updateStarted = true;
    const saved = await owner.supabase.auth.updateUser({ data: { [ACCOUNT_AVATAR_METADATA_KEY]: path } });
    if (saved.error || saved.data.user?.id !== owner.user.id || saved.data.user.user_metadata?.[ACCOUNT_AVATAR_METADATA_KEY] !== path) {
      // An interrupted Auth response can be ambiguous after persistence. Keep
      // this private object until a verified reload confirms the preference;
      // deleting it here could break a change that did reach the Auth server.
      return { ok: false, code: "save_failed" };
    }
    await removeOwnedPhoto(owner.supabase, ownedAccountPhotoPath(owner.user.user_metadata?.[ACCOUNT_AVATAR_METADATA_KEY], owner.user.id));
    return { ok: true, profile: { ...baseProfile(saved.data.user), photoUrl: signed.data.signedUrl, source: "custom" } };
  } catch {
    if (!updateStarted) await removeOwnedPhoto(owner.supabase, path);
    return { ok: false, code: "save_failed" };
  }
}

export async function restoreGoogleAccountPhoto(expectedOwner: string): Promise<AccountPhotoResult> {
  if (typeof expectedOwner !== "string" || !expectedOwner) return { ok: false, code: "account_changed" };
  const owner = await requestOwner(expectedOwner);
  if (!owner.ok) return owner;
  if (!googleAccountPhoto(owner.user)) return { ok: false, code: "google_unavailable" };
  try {
    const saved = await owner.supabase.auth.updateUser({ data: { [ACCOUNT_AVATAR_METADATA_KEY]: null } });
    if (saved.error || saved.data.user?.id !== owner.user.id || saved.data.user.user_metadata?.[ACCOUNT_AVATAR_METADATA_KEY])
      return { ok: false, code: "save_failed" };
    await removeOwnedPhoto(owner.supabase, ownedAccountPhotoPath(owner.user.user_metadata?.[ACCOUNT_AVATAR_METADATA_KEY], owner.user.id));
    return { ok: true, profile: baseProfile(saved.data.user) };
  } catch { return { ok: false, code: "save_failed" }; }
}
