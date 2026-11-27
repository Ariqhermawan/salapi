import "server-only";

import { StrKey } from "@stellar/stellar-sdk";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { isLocalPreview } from "@/lib/local-preview";
import { estimateUsdc } from "@/lib/market-prices";
import { isSignupSourceChoice, referralCode, referralCodeFromNext, referralSignupEligible, signupReturnPath, type SignupSource } from "@/lib/referral";
import { getMarketPrices } from "@/lib/server/marketPrices";
import { CONTRACTS, donationCampaignId, readContract, sc } from "@/lib/server/stellar";
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

type Account = NonNullable<Awaited<ReturnType<typeof account>>>;
type Admin = ReturnType<typeof createSupabaseAdmin>;
type RewardStatus = "eligible" | "pending" | "preparing" | "submitted" | "paid" | "failed" | "unavailable";
const REFERRAL_USERNAME = /^[a-z0-9_]{3,32}$/;
const REFERRAL_FRIEND_LIMIT = 100;

function rewardStatus(value: unknown): RewardStatus | null {
  return typeof value === "string" && ["pending", "preparing", "submitted", "paid", "failed"].includes(value)
    ? value as RewardStatus : null;
}

async function findInviter(admin: Admin, code: string, user: Account) {
  const { data: inviter, error } = await admin.from("referral_codes").select("owner_id,created_at").eq("code", code)
    .abortSignal(AbortSignal.timeout(4000)).maybeSingle();
  if (error) throw new Error("Referral code lookup failed");
  if (!inviter || inviter.owner_id === user.id || Date.parse(inviter.created_at) > Date.parse(user.created_at)) return null;
  return inviter.owner_id as string;
}

async function ownSource(admin: Admin, user: Account): Promise<SignupSource | null> {
  const { data, error } = await admin.from("referral_attributions").select("source").eq("invited_id", user.id)
    .abortSignal(AbortSignal.timeout(4000)).maybeSingle();
  if (error) throw new Error("Signup source lookup failed");
  return data?.source ?? null;
}

/** A saved answer wins on retries or concurrent sign-ins. Only new accounts get a pending question. */
export async function prepareSignupSource(next: string): Promise<string | null> {
  if (!configured()) return null;
  const user = await account();
  if (!user) return null;
  const admin = createSupabaseAdmin();
  let source = await ownSource(admin, user);
  if (source === null && referralSignupEligible(user.created_at, user.last_sign_in_at)) {
    const code = referralCodeFromNext(next);
    const inviter = code ? await findInviter(admin, code, user) : null;
    const { error } = await admin.from("referral_attributions").upsert({
      invited_id: user.id, inviter_id: inviter, source: inviter ? "invite_link" : "unanswered",
    }, { onConflict: "invited_id", ignoreDuplicates: true }).abortSignal(AbortSignal.timeout(4000));
    if (error) throw new Error("Signup source could not be stored");
    source = await ownSource(admin, user);
  }
  if (source === "unanswered") return `/you/heard?next=${encodeURIComponent(signupReturnPath(next))}`;
  return null;
}

export async function readSignupSource() {
  if (isLocalPreview) return { status: "preview" as const };
  if (!configured()) return { status: "unavailable" as const };
  try {
    const user = await account();
    if (!user) return { status: "guest" as const };
    return { status: "ready" as const, source: await ownSource(createSupabaseAdmin(), user) };
  } catch {
    return { status: "unavailable" as const };
  }
}

export async function saveSignupSource(choice: unknown, rawCode: unknown) {
  if (!isSignupSourceChoice(choice) || typeof rawCode !== "string" || rawCode.length > 16
    || (choice !== "referral" && rawCode !== "")) return "invalid" as const;
  if (!configured()) return "unavailable" as const;
  try {
    const user = await account();
    if (!user) return "unavailable" as const;
    const admin = createSupabaseAdmin();
    if (await ownSource(admin, user) !== "unanswered") return "alreadyAnswered" as const;
    const code = rawCode ? referralCode(rawCode) : null;
    const inviter = code ? await findInviter(admin, code, user) : null;
    if (rawCode && !inviter) return "invalid" as const;
    const { data, error } = await admin.from("referral_attributions").update({ source: choice, inviter_id: inviter })
      .eq("invited_id", user.id).eq("source", "unanswered").select("source")
      .abortSignal(AbortSignal.timeout(4000)).maybeSingle();
    if (error) return "unavailable" as const;
    return data ? "saved" as const : "alreadyAnswered" as const;
  } catch {
    return "unavailable" as const;
  }
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
    const [profile, count, market, attributions] = await Promise.all([
      admin.from("referral_codes").select("code").eq("owner_id", user.id).abortSignal(AbortSignal.timeout(4000)).single(),
      admin.from("referral_attributions").select("invited_id", { count: "exact", head: true })
        .eq("inviter_id", user.id).abortSignal(AbortSignal.timeout(4000)),
      getMarketPrices(),
      admin.from("referral_attributions").select("invited_id,recorded_at").eq("inviter_id", user.id)
        .order("recorded_at", { ascending: false }).limit(REFERRAL_FRIEND_LIMIT)
        .abortSignal(AbortSignal.timeout(4000)),
    ]);
    const code = profile.data && referralCode(profile.data.code);
    if (profile.error || count.error || count.count === null || attributions.error || !code) return { status: "unavailable" as const };

    const rows = (attributions.data ?? []).filter(row => typeof row.invited_id === "string"
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.invited_id)
      && typeof row.recorded_at === "string" && Number.isFinite(Date.parse(row.recorded_at)));
    const inviteeIds = rows.map(row => row.invited_id as string);
    const wallets = inviteeIds.length
      ? await admin.from("wallets").select("user_id,public_key").in("user_id", inviteeIds)
        .abortSignal(AbortSignal.timeout(4000))
      : { data: [], error: null };
    const walletByUser = new Map((wallets.data ?? []).map(row => [row.user_id as string, row.public_key as unknown]));
    const usernameByUser = new Map<string, string>();
    const usernameRows = rows.filter(row => typeof walletByUser.get(row.invited_id) === "string"
      && StrKey.isValidEd25519PublicKey(walletByUser.get(row.invited_id) as string));
    let usernameIndex = 0;
    await Promise.all(Array.from({ length: Math.min(6, usernameRows.length) }, async () => {
      while (usernameIndex < usernameRows.length) {
        const row = usernameRows[usernameIndex++];
        const wallet = walletByUser.get(row.invited_id);
        if (typeof wallet !== "string") continue;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const handle = await Promise.race([
            readContract(CONTRACTS.usernameRegistry, "username_of", [sc.addr(wallet)]),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 3500); }),
          ]);
          if (typeof handle === "string" && REFERRAL_USERNAME.test(handle)) usernameByUser.set(row.invited_id, handle);
        } catch { /* The invite row stays available with a generic label if the public registry is unavailable. */ }
        finally { if (timer) clearTimeout(timer); }
      }
    }));

    const contractId = donationCampaignId();
    let publicDonationsReady = false;
    const publicDonationStroops = new Map<string, bigint>();
    if (inviteeIds.length && contractId && StrKey.isValidContract(contractId) && market.status === "fresh") {
      const donations = await admin.from("campaign_donors").select("owner_id,amount_stroops", { count: "exact" })
        .eq("network", "testnet").eq("contract_id", contractId).in("owner_id", inviteeIds)
        .eq("anonymous", false).eq("public_profile_ok", true).limit(5000)
        .abortSignal(AbortSignal.timeout(6000));
      if (!donations.error && donations.data && donations.count === donations.data.length) {
        publicDonationsReady = true;
        for (const donation of donations.data) {
          if (typeof donation.owner_id !== "string" || typeof donation.amount_stroops !== "string"
            || !/^[1-9]\d{0,38}$/.test(donation.amount_stroops)) {
            publicDonationsReady = false;
            break;
          }
          const current = publicDonationStroops.get(donation.owner_id) ?? 0n;
          publicDonationStroops.set(donation.owner_id, current + BigInt(donation.amount_stroops));
        }
      }
    }
    const invitedFriends = rows.map(row => {
      const total = publicDonationStroops.get(row.invited_id);
      const estimated = publicDonationsReady && total ? estimateUsdc(total.toString(), market) : null;
      return {
        username: usernameByUser.get(row.invited_id) ?? null,
        joinedAt: row.recorded_at,
        publicDonatedCents: !publicDonationsReady ? null : total === undefined ? 0
          : estimated === null || !Number.isSafeInteger(Math.round(estimated * 100)) ? null : Math.round(estimated * 100),
      };
    });

    let qualifiedCount = 0;
    let progressStatus: "ready" | "unavailable" = "unavailable";
    if (contractId && market.status === "fresh" && StrKey.isValidContract(contractId)) {
      const totals = await admin.rpc("referral_donation_totals", { p_inviter_id: user.id, p_contract_id: contractId })
        .abortSignal(AbortSignal.timeout(6000));
      if (!totals.error && Array.isArray(totals.data)) {
        progressStatus = "ready";
        const maxI128 = 170_141_183_460_469_231_731_687_303_715_884_105_727n;
        for (const row of totals.data as unknown[]) {
          if (!row || typeof row !== "object" || Array.isArray(row)) { progressStatus = "unavailable"; break; }
          const total = (row as Record<string, unknown>).amount_stroops;
          if (typeof total !== "string" || !/^(?:0|[1-9]\d{0,99})$/.test(total)) { progressStatus = "unavailable"; break; }
          const raw = BigInt(total);
          if (raw > maxI128) { progressStatus = "unavailable"; break; }
          if ((estimateUsdc(total, market) ?? 0) >= 5) qualifiedCount += 1;
        }
        if (progressStatus === "unavailable") qualifiedCount = 0;
      }
    }

    let currentRewardStatus: RewardStatus = "unavailable";
    let rewardHash: string | null = null;
    let usdcTrustline: boolean | null = null;
    let walletReady = false;
    if (progressStatus === "ready" && qualifiedCount >= 10) {
      const payout = await admin.from("referral_reward_payouts").select("status,transaction_hash")
        .eq("owner_id", user.id).abortSignal(AbortSignal.timeout(4000)).maybeSingle();
      if (!payout.error) {
        const savedStatus = rewardStatus(payout.data?.status);
        currentRewardStatus = payout.data ? savedStatus ?? "unavailable" : "eligible";
        rewardHash = typeof payout.data?.transaction_hash === "string" ? payout.data.transaction_hash : null;
        if (currentRewardStatus === "eligible" || currentRewardStatus === "pending" || currentRewardStatus === "preparing" || currentRewardStatus === "submitted") {
          const wallet = await admin.from("wallets").select("public_key").eq("user_id", user.id)
            .abortSignal(AbortSignal.timeout(4000)).maybeSingle();
          if (!wallet.error && typeof wallet.data?.public_key === "string" && StrKey.isValidEd25519PublicKey(wallet.data.public_key)) {
            walletReady = true;
            usdcTrustline = await referralUsdcTrustline(wallet.data.public_key);
          } else if (!wallet.error) usdcTrustline = false;
        }
      }
    } else if (progressStatus === "ready") {
      currentRewardStatus = "eligible";
    }

    return { status: "ready" as const, code, invitedCount: count.count, invitedFriends,
      invitedFriendsTruncated: count.count > invitedFriends.length, publicDonationsReady,
      qualifiedCount, progressStatus, rewardStatus: currentRewardStatus, rewardHash, usdcTrustline, walletReady };
  } catch {
    return { status: "unavailable" as const };
  }
}

async function referralUsdcTrustline(publicKey: string): Promise<boolean | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`https://horizon-testnet.stellar.org/accounts/${publicKey}`, {
      cache: "no-store", redirect: "error", signal: controller.signal,
    });
    if (!response.ok) return null;
    const raw: unknown = await response.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const accountData = raw as { account_id?: unknown; balances?: unknown };
    if (accountData.account_id !== publicKey || !Array.isArray(accountData.balances)) return null;
    return accountData.balances.some(value => value && typeof value === "object" && !Array.isArray(value)
      && (value as Record<string, unknown>).asset_type === "credit_alphanum4"
      && (value as Record<string, unknown>).asset_code === "USDC"
      && (value as Record<string, unknown>).asset_issuer === "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
