import "server-only";
import { isAuthSessionMissingError, type SupabaseClient, type User } from "@supabase/supabase-js";
import { StrKey } from "@stellar/stellar-sdk";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseConfigured, supabaseAdminConfigured } from "@/lib/supabase/env";
import { isLocalPreview } from "@/lib/local-preview";
import { CONTRACTS, readContract, sc } from "@/lib/server/stellar";
import { RECEIPT_PHOTO_CONSENT, TRANSFER_PREVIEW_PHOTO_CONSENT, type AccountDetailsResult, type ReceiptPhotoResult } from "@/lib/account-details";

type Owner = { ok: true; user: User; supabase: SupabaseClient } | { ok: false; code: "unavailable" | "unauthenticated" | "account_changed" | "invalid_input" };
async function requestOwner(expectedOwner: unknown): Promise<Owner> {
  if (typeof expectedOwner !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expectedOwner))
    return { ok: false, code: "invalid_input" };
  if (isLocalPreview || !supabaseConfigured()) return { ok: false, code: "unavailable" };
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.getUser();
    if (error) return { ok: false, code: data.user === null && isAuthSessionMissingError(error) ? "unauthenticated" : "unavailable" };
    if (data.user === null) return { ok: false, code: "unauthenticated" };
    if (!data.user || typeof data.user.id !== "string") return { ok: false, code: "unavailable" };
    if (data.user.id !== expectedOwner) return { ok: false, code: "account_changed" };
    return { ok: true, supabase, user: data.user };
  } catch (error) {
    return { ok: false, code: isAuthSessionMissingError(error) ? "unauthenticated" : "unavailable" };
  }
}

/** Reads only the authenticated owner's saved public wallet. Never provisions or signs. */
export async function readAccountDetails(expectedOwner: unknown): Promise<AccountDetailsResult> {
  const owner = await requestOwner(expectedOwner);
  if (!owner.ok) return owner;
  const account = {
    ownerId: owner.user.id, email: typeof owner.user.email === "string" ? owner.user.email.trim() : "",
    address: null as string | null, handle: null as string | null,
    receiptPhotoConsent: owner.user.user_metadata?.[RECEIPT_PHOTO_CONSENT] === true,
    transferPreviewPhotoConsent: owner.user.user_metadata?.[TRANSFER_PREVIEW_PHOTO_CONSENT] === true,
    identityUnavailable: false,
  };
  if (!supabaseAdminConfigured()) return { ok: true, account: { ...account, identityUnavailable: true } };
  try {
    const { data, error } = await createSupabaseAdmin().from("wallets").select("public_key").eq("user_id", owner.user.id).maybeSingle();
    if (error) throw new Error("Wallet identity unavailable");
    if (data === null) return { ok: true, account };
    if (typeof data?.public_key !== "string" || !StrKey.isValidEd25519PublicKey(data.public_key)) throw new Error("Invalid wallet identity");
    account.address = data.public_key;
    try {
      const handle = await readContract(CONTRACTS.usernameRegistry, "username_of", [sc.addr(data.public_key)]);
      if (typeof handle === "string" && /^[a-z0-9_]{3,32}$/.test(handle)) account.handle = handle;
      else account.identityUnavailable = true;
    } catch (error) {
      if (!(error instanceof Error && /Error\(Contract, #3\)/.test(error.message))) account.identityUnavailable = true;
    }
    return { ok: true, account };
  } catch { return { ok: true, account: { ...account, identityUnavailable: true } }; }
}

export async function saveReceiptPhotoConsent(expectedOwner: unknown, enabled: unknown): Promise<ReceiptPhotoResult> {
  return savePhotoConsent(expectedOwner, enabled, RECEIPT_PHOTO_CONSENT);
}

export async function saveTransferPreviewPhotoConsent(expectedOwner: unknown, enabled: unknown): Promise<ReceiptPhotoResult> {
  return savePhotoConsent(expectedOwner, enabled, TRANSFER_PREVIEW_PHOTO_CONSENT);
}

async function savePhotoConsent(expectedOwner: unknown, enabled: unknown, key: typeof RECEIPT_PHOTO_CONSENT | typeof TRANSFER_PREVIEW_PHOTO_CONSENT): Promise<ReceiptPhotoResult> {
  if (typeof enabled !== "boolean") return { ok: false, code: "invalid_input" };
  const owner = await requestOwner(expectedOwner);
  if (!owner.ok) return owner;
  try {
    // updateUser operates only on this verified session. No admin user update,
    // roles, email, wallet mapping or authorization metadata is changed.
    const { data, error } = await owner.supabase.auth.updateUser({ data: { [key]: enabled } });
    if (error || data.user?.id !== owner.user.id || data.user.user_metadata?.[key] !== enabled)
      return { ok: false, code: "save_failed" };
    return { ok: true, ownerId: owner.user.id, enabled };
  } catch { return { ok: false, code: "save_failed" }; }
}
