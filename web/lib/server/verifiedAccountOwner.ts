import "server-only";
import { isLocalPreview } from "@/lib/local-preview";
import { supabaseAdminConfigured } from "@/lib/supabase/env";
import { resolveCirclesSignupIdentity } from "@/lib/server/circlesSignup";

export type AccountOwnerFailure = {
  ok: false;
  code: "local_preview" | "unavailable" | "unauthenticated" | "unverified" | "account_changed";
  error: string;
};

export type AccountOwnerResult = { ok: true; userId: string } | AccountOwnerFailure;

/** Bind private account data to the server-verified, confirmed Supabase user. */
export async function verifiedAccountOwner(expectedOwnerId: unknown): Promise<AccountOwnerResult> {
  if (isLocalPreview) return { ok: false, code: "local_preview", error: "Local preview does not save account data." };
  if (!supabaseAdminConfigured()) return { ok: false, code: "unavailable", error: "Private account storage is unavailable. Nothing was saved." };
  const identity = await resolveCirclesSignupIdentity();
  if (identity.status === "guest") return { ok: false, code: "unauthenticated", error: "Sign in with a verified account to save private data." };
  if (identity.status === "unverified") return { ok: false, code: "unverified", error: "Verify your account email before saving private data." };
  if (identity.status !== "verified") return { ok: false, code: "unavailable", error: "Your account could not be checked. Nothing was saved." };
  if (typeof expectedOwnerId !== "string" || identity.ownerId !== expectedOwnerId)
    return { ok: false, code: "account_changed", error: "Your signed-in account changed. Refresh the page and try again." };
  return { ok: true, userId: identity.ownerId };
}
