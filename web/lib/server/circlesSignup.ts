import "server-only";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseConfigured, supabaseAdminConfigured } from "@/lib/supabase/env";
import { isLocalPreview } from "@/lib/local-preview";
import { isLocale } from "@/lib/i18n/config";
import type { CirclesSignupIdentity, CirclesSignupInput, CirclesSignupResult } from "@/lib/circles/signup";

function validEmail(value: unknown): value is string {
  return typeof value === "string" && value.trim().length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function resolveCirclesSignupIdentity(): Promise<CirclesSignupIdentity> {
  if (isLocalPreview || !supabaseConfigured()) return { status: "unavailable" };
  let supabase: Awaited<ReturnType<typeof createSupabaseServer>>;
  try { supabase = await createSupabaseServer(); }
  catch { return { status: "unavailable" }; }
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return { status: data.user === null && isAuthSessionMissingError(error) ? "guest" : "unavailable" };
    const user = data.user;
    if (user === null) return { status: "guest" };
    if (!user || typeof user.id !== "string" || !user.id) return { status: "unavailable" };
    // Anonymous accounts and unconfirmed addresses must not be labelled verified.
    // user_metadata is user-editable and is deliberately never read here.
    if (user.is_anonymous || !validEmail(user.email) || typeof user.email_confirmed_at !== "string" || !Number.isFinite(Date.parse(user.email_confirmed_at)))
      return { status: "unverified" };
    const google = user.app_metadata?.provider === "google" || (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes("google"));
    return { status: "verified", ownerId: user.id, email: user.email.trim().toLowerCase(), source: google ? "google" : "account" };
  } catch (error) {
    return { status: isAuthSessionMissingError(error) ? "guest" : "unavailable" };
  }
}

export async function saveCirclesLaunchSubscription(input: CirclesSignupInput): Promise<CirclesSignupResult> {
  if (isLocalPreview) return { ok: false, error: "Local preview does not submit waitlist details." };
  // This is a public server endpoint. Require an actual boolean consent, not
  // truthy strings, even when a caller bypasses the rendered checkbox.
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid request." };
  if (input.notifyOk !== true) return { ok: false, error: "Choose the optional email updates checkbox before subscribing." };
  if (typeof input.circleId !== "string" || !/^[a-z0-9][a-z0-9:-]{0,119}$/.test(input.circleId)
    || !isLocale(input.locale) || typeof input.pesoPledge !== "number" || !Number.isFinite(input.pesoPledge)
    || input.pesoPledge < 0 || input.pesoPledge > 10_000_000 || typeof input.anonymous !== "boolean")
    return { ok: false, error: "Invalid request." };
  if (!supabaseAdminConfigured()) return { ok: false, error: "Launch notifications are unavailable. Nothing was saved." };

  const identity = await resolveCirclesSignupIdentity();
  if (identity.status === "unavailable") return { ok: false, error: "Your account could not be verified. Nothing was saved. Try again." };
  if (identity.status === "unverified") return { ok: false, error: "Verify your account email before subscribing. Nothing was saved." };
  if (input.expectedOwnerId !== undefined && (typeof input.expectedOwnerId !== "string" || identity.status !== "verified" || identity.ownerId !== input.expectedOwnerId))
    return { ok: false, error: "Your signed-in account changed. Review your email and try again." };
  // Verified server email overrides every supplied client email, including a
  // forged value. A confirmed guest may use the legacy manual email flow.
  const rawEmail = identity.status === "verified" ? identity.email : input.email;
  if (!validEmail(rawEmail)) return { ok: false, error: "Enter a valid email address." };
  const email = rawEmail.trim().toLowerCase();
  try {
    const admin = createSupabaseAdmin();
    const { error } = await admin.from("circles_waitlist").insert({
      email, circle_id: input.circleId, peso_pledge: Math.floor(input.pesoPledge),
      anonymous: input.anonymous, marketing_ok: input.marketingOk === true, locale: input.locale,
    });
    // DB errors may contain addresses or submitted values. Never log or expose
    // their raw message, and never return success without confirmed persistence.
    if (error) return { ok: false, error: "The signup could not be saved. Try again. No payment was made." };
    return { ok: true, kind: "launch-subscription", persisted: true };
  } catch {
    return { ok: false, error: "The signup could not be saved. Try again. No payment was made." };
  }
}
