import type { AccountPhotoCode, AccountPhotoResult } from "@/lib/account-photo";

const PHOTO_CODES = new Set<AccountPhotoCode>(["unavailable", "unauthenticated", "account_changed", "invalid_file", "storage_unavailable", "save_failed", "google_unavailable"]);
const OWNER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nullableString = (value: unknown): value is string | null => value === null || typeof value === "string";

/** A private display read, independent of the client Server Action queue. */
export async function readAccountPhotoClient(): Promise<AccountPhotoResult> {
  const response = await fetch("/api/account/photo", {
    method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Account photo is unavailable.");
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Account photo is unavailable.");
  const value = result as { ok?: unknown; code?: unknown; profile?: unknown };
  if (value.ok === false && typeof value.code === "string" && PHOTO_CODES.has(value.code as AccountPhotoCode))
    return { ok: false, code: value.code as AccountPhotoCode };
  if (value.ok !== true || !value.profile || typeof value.profile !== "object" || Array.isArray(value.profile))
    throw new Error("Account photo is unavailable.");
  const profile = value.profile as Record<string, unknown>;
  if (typeof profile.ownerId !== "string" || !OWNER_ID.test(profile.ownerId) || typeof profile.email !== "string"
    || !nullableString(profile.photoUrl) || !nullableString(profile.googlePhotoUrl)
    || typeof profile.source !== "string" || !["custom", "google", "initials"].includes(profile.source)
    || (profile.warning !== undefined && (typeof profile.warning !== "string" || !PHOTO_CODES.has(profile.warning as AccountPhotoCode))))
    throw new Error("Account photo is unavailable.");
  return { ok: true, profile: {
    ownerId: profile.ownerId, email: profile.email, photoUrl: profile.photoUrl, googlePhotoUrl: profile.googlePhotoUrl,
    source: profile.source as "custom" | "google" | "initials",
    ...(profile.warning !== undefined ? { warning: profile.warning as AccountPhotoCode } : {}),
  } };
}
