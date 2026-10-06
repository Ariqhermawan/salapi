import type { User } from "@supabase/supabase-js";

export const ACCOUNT_AVATAR_BUCKET = "account-avatars";
export const ACCOUNT_AVATAR_METADATA_KEY = "salapi_avatar_path";
// Stay below Next's default 1 MB Server Action request limit, including multipart overhead.
export const ACCOUNT_AVATAR_MAX_BYTES = 512 * 1024;
export const ACCOUNT_AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AccountPhotoCode = "unavailable" | "unauthenticated" | "account_changed" | "invalid_file" | "storage_unavailable" | "save_failed" | "google_unavailable";
export type AccountPhoto = {
  ownerId: string;
  email: string;
  photoUrl: string | null;
  googlePhotoUrl: string | null;
  source: "custom" | "google" | "initials";
  warning?: AccountPhotoCode;
};
export type AccountPhotoResult = { ok: true; profile: AccountPhoto } | { ok: false; code: AccountPhotoCode };

/** Display data only. Never use provider metadata as an authorization claim. */
export function googleAccountPhoto(user: Pick<User, "identities">): string | null {
  const google = user.identities?.find(identity => identity.provider === "google");
  for (const value of [google?.identity_data?.avatar_url, google?.identity_data?.picture]) {
    if (typeof value !== "string" || value.length > 2048) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && !url.username && !url.password && !url.port
        && (url.hostname === "googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com"))) return url.href;
    } catch { /* Invalid provider photo becomes the initials fallback. */ }
  }
  return null;
}

/** Auth metadata is editable. Validate the path against the verified request owner. */
export function ownedAccountPhotoPath(value: unknown, ownerId: string): string | null {
  if (typeof value !== "string" || !UUID.test(ownerId)) return null;
  const prefix = `${ownerId}/`;
  const filename = value.slice(prefix.length);
  return value.startsWith(prefix) && filename.endsWith(".jpg") && UUID.test(filename.slice(0, -4)) ? value : null;
}

export function accountPhotoFileAllowed(file: Pick<File, "size" | "type">): boolean {
  return file.size > 0 && file.size <= ACCOUNT_AVATAR_MAX_BYTES
    && ACCOUNT_AVATAR_MIME_TYPES.includes(file.type as typeof ACCOUNT_AVATAR_MIME_TYPES[number]);
}

export function accountPhotoSignatureAllowed(bytes: Uint8Array): boolean {
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  return bytes.length >= 8 && png.every((value, index) => bytes[index] === value)
    || bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    || bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70
      && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80;
}
