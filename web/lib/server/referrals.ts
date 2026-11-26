import "server-only";

import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { isLocalPreview } from "@/lib/local-preview";
import { referralCode, referralCodeFromNext, referralSignupEligible } from "@/lib/referral";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseAdminConfigured, supabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServer } from "@/lib/supabase/server";

function configured() {
  return !isLocalPreview && supabaseConfigured() && supabaseAdminConfigured();
}

async function account() {
  const supabase = await createSupabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error && !isAuthSessionMissingError(error)) throw new Error("Account lookup failed");
  return !error && user?.is_anonymous === false ? user : null;
}

export async function referralInviteRedirect(raw: string): Promise<string> {
  const code = referralCode(raw);
  if (!code || !configured()) return "/";
  try {
    if (await account()) return "/";
    const { data, error } = await createSupabaseAdmin().from("referral_codes").select("code").eq("code", code)
      .abortSignal(AbortSignal.timeout(4000)).maybeSingle();
    return !error && data ? `/signin?next=${encodeURIComponent(`/r/${code}`)}` : "/";
  } catch {
    return "/";
  }
}

export async function recordReferralSignup(next: string) {
  const code = referralCodeFromNext(next);
  if (!code || !configured()) return;
  const user = await account();
  if (!user || !referralSignupEligible(user.created_at, user.last_sign_in_at)) return;
  const admin = createSupabaseAdmin();
  const { data: inviter, error } = await admin.from("referral_codes").select("owner_id,created_at").eq("code", code)
    .abortSignal(AbortSignal.timeout(4000)).maybeSingle();
  if (error) throw new Error("Referral code lookup failed");
  if (!inviter || inviter.owner_id === user.id || Date.parse(inviter.created_at) > Date.parse(user.created_at)) return;
  const { error: recordError } = await admin.from("referral_attributions").upsert(
    { invited_id: user.id, inviter_id: inviter.owner_id },
    { onConflict: "invited_id", ignoreDuplicates: true },
  ).abortSignal(AbortSignal.timeout(4000));
  if (recordError) throw new Error("Referral attribution could not be stored");
}

export async function readOwnReferral() {
  if (isLocalPreview) return { status: "preview" as const };
  if (!configured()) return { status: "unavailable" as const };
  try {
    const user = await account();
    if (!user) return { status: "guest" as const };
    const admin = createSupabaseAdmin();
    const { error: createError } = await admin.from("referral_codes").upsert({ owner_id: user.id },
      { onConflict: "owner_id", ignoreDuplicates: true }).abortSignal(AbortSignal.timeout(4000));
    if (createError) return { status: "unavailable" as const };
    const [profile, count] = await Promise.all([
      admin.from("referral_codes").select("code").eq("owner_id", user.id).abortSignal(AbortSignal.timeout(4000)).single(),
      admin.from("referral_attributions").select("invited_id", { count: "exact", head: true })
        .eq("inviter_id", user.id).abortSignal(AbortSignal.timeout(4000)),
    ]);
    const code = profile.data && referralCode(profile.data.code);
    if (profile.error || count.error || count.count === null || !code) return { status: "unavailable" as const };
    return { status: "ready" as const, code, invitedCount: count.count };
  } catch {
    return { status: "unavailable" as const };
  }
}
