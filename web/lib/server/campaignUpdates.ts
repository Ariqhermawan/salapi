import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { StrKey } from "@stellar/stellar-sdk";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE, supabaseConfigured, supabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServer } from "@/lib/supabase/server";
import { isLocalPreview } from "@/lib/local-preview";
import { CONTRACTS, donationCampaignId, readContract, sc } from "@/lib/server/stellar";
import { validatedCircleTestnetMapping, validatedCircleTestnetCampaign } from "@/lib/circles/testnet";
import { CAMPAIGN_UPDATE_UUID, CAMPAIGN_EMAIL_BATCH_LIMIT, campaignUpdateId, campaignUpdateText,
  campaignUpdateEmail, campaignUpdateEmailText, campaignEmailIdempotencyKey, campaignEmailRetryAllowed,
  type CampaignPublicUpdate, type CampaignUpdateSubscriptionInput, type PublishCampaignUpdateInput,
  type CampaignUpdateSubscriptionState, type CampaignUpdateResult, type CampaignUpdateDispatchResult } from "@/lib/campaign-updates";

const SUBSCRIPTIONS = "campaign_update_subscriptions";
const UPDATES = "campaign_updates";
const OUTBOX = "campaign_update_outbox";
const MAPPING_COLUMNS = "network,contract_id,circle_slug,campaign_id,campaign_title,creator_wallet,beneficiary_wallet,token_id,approver_wallets,creator_cut_bps,funding_deadline,review_deadline,purpose,archived_at";
const PUBLIC_COLUMNS = "id,campaign_id,title,body,published_at";
const UNAVAILABLE = "Campaign email updates are unavailable. No email was sent.";
type Owner = { ownerId: string; email: string | null; wallet: string | null };
type Scope = { network: "testnet"; contractId: string; campaignId: string; creatorWallet: string };
type Failure = { ok: false; error: string };

async function bounded<T>(operation: PromiseLike<T>, milliseconds = 8_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([Promise.resolve(operation), new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Update service timed out")), milliseconds);
  })]); } finally { if (timer) clearTimeout(timer); }
}

function admin(): SupabaseClient {
  if (!supabaseAdminConfigured()) throw new Error(UNAVAILABLE);
  const url = new URL(SUPABASE_URL);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error(UNAVAILABLE);
  const origin = url.origin;
  const boundedFetch: typeof fetch = (input, init) => {
    const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (target.origin !== origin || target.username || target.password) return Promise.reject(new Error("Unexpected update service origin"));
    const timeout = AbortSignal.timeout(8_000);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(input, { ...init, signal, redirect: "error", cache: "no-store" });
  };
  return createClient(origin, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: boundedFetch },
  });
}

function providerConfig(): { key: string; from: string } | null {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.CAMPAIGN_UPDATES_FROM?.trim();
  if (!key || !from || key.length > 512 || /\s/.test(key) || from.length > 200 || /[\r\n]/.test(from)) return null;
  const address = from.match(/^(?:[^<>]+<([^<>]+)>|([^<>]+))$/);
  if (!address || !campaignUpdateEmail(address[1] ?? address[2])) return null;
  // No default sandbox sender: a configured and provider-verified sender is required.
  return { key, from };
}

async function owner(options: { requireEmail?: boolean; requireWallet?: boolean } = {}): Promise<Owner> {
  if (isLocalPreview || !supabaseConfigured()) throw new Error("Sign in with your verified account to use campaign updates.");
  const request = await createSupabaseServer();
  const { data, error } = await bounded(request.auth.getUser());
  const user = data?.user;
  if (error || !user || user.is_anonymous !== false || typeof user.id !== "string" || !CAMPAIGN_UPDATE_UUID.test(user.id))
    throw new Error("Your signed-in account could not be verified. No email was sent.");
  // Never authorize using user_metadata, user-provided email or a shared demo wallet.
  const email = campaignUpdateEmail(user.email);
  const confirmed = typeof user.email_confirmed_at === "string" && Number.isFinite(Date.parse(user.email_confirmed_at));
  if (options.requireEmail !== false && (!email || !confirmed)) throw new Error("Verify your account email before subscribing to campaign updates.");
  let wallet: string | null = null;
  if (options.requireWallet !== false) {
    const row = await admin().from("wallets").select("public_key").eq("user_id", user.id).maybeSingle();
    if (row.error || typeof row.data?.public_key !== "string" || !StrKey.isValidEd25519PublicKey(row.data.public_key))
      throw new Error("Prepare your personal Testnet wallet before using campaign updates.");
    wallet = row.data.public_key;
  }
  return { ownerId: user.id, email: confirmed ? email : null, wallet };
}

function assertExpectedOwner(actual: Owner, expected: unknown) {
  if (typeof expected !== "string" || !CAMPAIGN_UPDATE_UUID.test(expected) || actual.ownerId !== expected)
    throw new Error("Your signed-in account changed. Review your account and try again.");
}

async function scope(input: unknown, db: SupabaseClient): Promise<Scope> {
  if (isLocalPreview) throw new Error(UNAVAILABLE);
  const id = campaignUpdateId(input);
  const contract = donationCampaignId();
  if (!contract || !StrKey.isValidContract(contract)) throw new Error(UNAVAILABLE);
  const stored = await db.from("circles_testnet_campaigns").select(MAPPING_COLUMNS).eq("network", "testnet")
    .eq("contract_id", contract).eq("campaign_id", id).is("archived_at", null).maybeSingle();
  if (stored.error) throw new Error(UNAVAILABLE);
  const mapping = validatedCircleTestnetMapping(stored.data, contract, CONTRACTS.tokenXlmSac);
  if (!mapping || mapping.campaignId !== id) throw new Error("This campaign has no approved active Circles QA mapping.");
  const [version, token, raw] = await bounded(Promise.all([
    readContract(contract, "version"), readContract(contract, "token"), readContract(contract, "campaign", [sc.u64(BigInt(id))]),
  ]));
  if (version !== 4 || token !== CONTRACTS.tokenXlmSac || !validatedCircleTestnetCampaign(raw, mapping, CONTRACTS.tokenXlmSac))
    throw new Error("The QA mapping no longer matches the current Testnet campaign. No email was sent.");
  return { network: "testnet", contractId: contract, campaignId: id, creatorWallet: mapping.creatorWallet };
}

function matchScope(value: Scope) {
  return { network: value.network, contract_id: value.contractId, campaign_id: value.campaignId };
}
function rpcScope(value: Scope) {
  return { p_network: value.network, p_contract: value.contractId, p_campaign: value.campaignId };
}
function safeError(error: unknown): Failure {
  // Only known local validation text is useful. DB/provider messages can contain PII.
  const message = error instanceof Error ? error.message : "";
  const allowed = [UNAVAILABLE, "Invalid campaign ID.", "Your signed-in account changed. Review your account and try again.",
    "This campaign has no approved active Circles QA mapping.", "The QA mapping no longer matches the current Testnet campaign. No email was sent.",
    "Your signed-in account could not be verified. No email was sent.", "Sign in with your verified account to use campaign updates.",
    "Verify your account email before subscribing to campaign updates.", "Prepare your personal Testnet wallet before using campaign updates."];
  return { ok: false, error: allowed.includes(message) ? message : UNAVAILABLE };
}

export async function readCampaignUpdateSubscription(input: string): Promise<CampaignUpdateSubscriptionState> {
  try {
    const who = await owner();
    const db = admin();
    const target = await scope(input, db);
    const row = await db.from(SUBSCRIPTIONS).select("active,notify_ok").match({ ...matchScope(target), user_id: who.ownerId }).maybeSingle();
    if (row.error) return { ok: false, status: "unavailable", error: UNAVAILABLE };
    return { ok: true, status: "verified", ownerId: who.ownerId, email: who.email!,
      subscribed: row.data?.active === true && row.data?.notify_ok === true, providerConfigured: providerConfig() !== null,
      canPublish: who.wallet === target.creatorWallet };
  } catch (error) {
    return { ...safeError(error), status: !supabaseConfigured() || isLocalPreview ? "guest" : "unavailable" };
  }
}

export async function setCampaignUpdateSubscription(input: CampaignUpdateSubscriptionInput): Promise<CampaignUpdateResult> {
  if (!input || typeof input !== "object" || typeof input.subscribed !== "boolean" ||
    typeof input.expectedOwnerId !== "string" || !CAMPAIGN_UPDATE_UUID.test(input.expectedOwnerId))
    return { ok: false, error: "Invalid subscription request." };
  if (input.subscribed && input.notifyOk !== true) return { ok: false, error: "Choose the optional campaign email updates checkbox first." };
  try {
    const id = campaignUpdateId(input.campaignId);
    const who = await owner({ requireEmail: input.subscribed, requireWallet: input.subscribed });
    assertExpectedOwner(who, input.expectedOwnerId);
    const db = admin();
    if (!input.subscribed) {
      // Revocation does not depend on a live RPC, current mapping or usable wallet.
      // A user must still be able to stop emails when a campaign has been archived.
      const contract = donationCampaignId();
      if (!contract) return { ok: false, error: UNAVAILABLE };
      const result = await db.rpc("campaign_updates_unsubscribe", {
        p_network: "testnet", p_contract: contract, p_campaign: id, p_user: who.ownerId,
      });
      if (result.error || result.data !== true) return { ok: false, error: UNAVAILABLE };
      return { ok: true, subscribed: false, providerConfigured: providerConfig() !== null };
    }
    const target = await scope(id, db);
    const result = await db.rpc("campaign_updates_subscribe", { ...rpcScope(target),
      p_user: who.ownerId, p_wallet: who.wallet, p_email: who.email, p_notify_ok: input.notifyOk === true,
    });
    if (result.error || result.data !== true) return { ok: false, error: UNAVAILABLE };
    // Saving an opt-in never sends an email, moves money or authorizes a donation.
    return { ok: true, subscribed: true, providerConfigured: providerConfig() !== null };
  } catch (error) { return safeError(error); }
}

export async function readPublicCampaignUpdates(input: string): Promise<{ ok: true; updates: CampaignPublicUpdate[] } | Failure> {
  try {
    const db = admin();
    const target = await scope(input, db);
    const result = await db.from(UPDATES).select(PUBLIC_COLUMNS).match(matchScope(target)).order("published_at", { ascending: false }).limit(20);
    if (result.error || !Array.isArray(result.data)) return { ok: false, error: "Campaign updates are unavailable." };
    const updates = result.data.map(row => {
      if (!CAMPAIGN_UPDATE_UUID.test(row.id) || row.campaign_id !== target.campaignId ||
        !Number.isFinite(Date.parse(row.published_at))) throw new Error(UNAVAILABLE);
      return { id: row.id, campaignId: row.campaign_id, title: campaignUpdateText(row.title, 120),
        body: campaignUpdateText(row.body, 4000), publishedAt: row.published_at,
        label: "QA Testnet organizer update" as const, verifiedProof: false as const };
    });
    return { ok: true, updates };
  } catch { return { ok: false, error: "Campaign updates are unavailable." }; }
}

export async function publishCampaignUpdate(input: PublishCampaignUpdateInput): Promise<{ ok: true; updateId: string; published: true; emailStatus: "queued"; providerConfigured: boolean } | Failure> {
  if (!input || typeof input !== "object" || input.publicAcknowledged !== true || typeof input.idempotencyKey !== "string" ||
    typeof input.expectedOwnerId !== "string" || !CAMPAIGN_UPDATE_UUID.test(input.idempotencyKey) ||
    !CAMPAIGN_UPDATE_UUID.test(input.expectedOwnerId)) return { ok: false, error: "Review and acknowledge the public QA update before publishing." };
  let title: string, body: string;
  try { title = campaignUpdateText(input.title, 120); body = campaignUpdateText(input.body, 4000); }
  catch { return { ok: false, error: "Enter a title (up to 120 characters) and update (up to 4000 characters)." }; }
  try {
    const who = await owner();
    assertExpectedOwner(who, input.expectedOwnerId);
    const db = admin();
    const target = await scope(input.campaignId, db);
    if (target.creatorWallet !== who.wallet) return { ok: false, error: "Only the verified campaign creator can publish organizer updates." };
    const saved = await db.rpc("campaign_updates_publish", { ...rpcScope(target), p_update: input.idempotencyKey.toLowerCase(),
      p_user: who.ownerId, p_creator: who.wallet, p_title: title, p_body: body,
      p_email_text: campaignUpdateEmailText(target.campaignId, title, body),
    });
    if (saved.error || saved.data !== input.idempotencyKey.toLowerCase()) return { ok: false, error: "The update could not be confirmed. Retry using the same update request ID." };
    return { ok: true, updateId: saved.data, published: true, emailStatus: "queued", providerConfigured: providerConfig() !== null };
  } catch (error) { return safeError(error); }
}

type OutboxRow = { id: string; lease_token: string; user_id: string; recipient_email: string; subscription_id: string;
  subject: string; email_text: string; sender: string; first_attempt_at: string };
type ProviderOutcome = { status: "accepted" | "unknown" | "rejected"; providerId: string | null; retryAfter: string | null };

async function sendOne(config: { key: string }, row: OutboxRow): Promise<ProviderOutcome> {
  const retry = new Date(Date.now() + 60_000).toISOString();
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8_000),
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json", "Idempotency-Key": campaignEmailIdempotencyKey(row.id) },
      body: JSON.stringify({ from: row.sender, to: [row.recipient_email], subject: row.subject, text: row.email_text }),
    });
    // A 5xx/timeout/malformed success can be accepted upstream. Retry the exact
    // immutable payload with the SAME key, never pretend it failed definitively.
    if (response.ok) {
      const raw: unknown = await response.json();
      const id = raw && typeof raw === "object" ? (raw as { id?: unknown }).id : null;
      return typeof id === "string" && CAMPAIGN_UPDATE_UUID.test(id)
        ? { status: "accepted", providerId: id, retryAfter: null }
        : { status: "unknown", providerId: null, retryAfter: retry };
    }
    if (response.status === 429) {
      const seconds = Number(response.headers.get("Retry-After"));
      return { status: "unknown", providerId: null,
        retryAfter: new Date(Date.now() + Math.max(60, Number.isFinite(seconds) ? Math.min(seconds, 3600) : 60) * 1000).toISOString() };
    }
    return response.status >= 400 && response.status < 500 && response.status !== 408
      ? { status: "rejected", providerId: null, retryAfter: null }
      : { status: "unknown", providerId: null, retryAfter: retry };
  } catch { return { status: "unknown", providerId: null, retryAfter: retry }; }
}

async function recipientStillConsents(db: SupabaseClient, target: Scope, row: OutboxRow): Promise<boolean | null> {
  try {
    const subscription = await db.from(SUBSCRIPTIONS).select("user_id,email,active,notify_ok,revoked_at")
      .match({ ...matchScope(target), id: row.subscription_id, user_id: row.user_id }).maybeSingle();
    if (subscription.error) return null;
    const record = subscription.data;
    if (!record || record.active !== true || record.notify_ok !== true || record.revoked_at !== null || record.email !== row.recipient_email) return false;
    const account = await bounded(db.auth.admin.getUserById(row.user_id));
    if (account.error) return null;
    const user = account.data?.user;
    return !!user && user.id === row.user_id && user.is_anonymous === false &&
      typeof user.email_confirmed_at === "string" && Number.isFinite(Date.parse(user.email_confirmed_at)) &&
      campaignUpdateEmail(user.email) === row.recipient_email;
  } catch { return null; }
}

export async function dispatchCampaignUpdateEmails(input: { campaignId: string; updateId: string; expectedOwnerId: string }): Promise<CampaignUpdateDispatchResult> {
  if (!input || typeof input !== "object" || typeof input.updateId !== "string" || typeof input.expectedOwnerId !== "string" ||
    !CAMPAIGN_UPDATE_UUID.test(input.updateId) || !CAMPAIGN_UPDATE_UUID.test(input.expectedOwnerId))
    return { ok: false, error: "Invalid update dispatch request." };
  let providerAttempted = false;
  try {
    const who = await owner();
    assertExpectedOwner(who, input.expectedOwnerId);
    const db = admin();
    const target = await scope(input.campaignId, db);
    if (target.creatorWallet !== who.wallet) return { ok: false, error: "Only the verified campaign creator can dispatch organizer updates." };
    const config = providerConfig();
    if (!config) return { ok: false, unavailable: true, error: "Email delivery is not configured. The public update remains available; no email was sent." };
    const update = await db.from(UPDATES).select("id,creator_wallet,published_by").match({ ...matchScope(target), id: input.updateId.toLowerCase() }).maybeSingle();
    if (update.error || !update.data || update.data.creator_wallet !== who.wallet || update.data.published_by !== who.ownerId)
      return { ok: false, error: "This public update could not be verified for your account." };
    const claimed = await db.rpc("campaign_updates_claim", { ...rpcScope(target), p_update: input.updateId.toLowerCase(),
      p_sender: config.from, p_limit: CAMPAIGN_EMAIL_BATCH_LIMIT,
    });
    if (claimed.error || !Array.isArray(claimed.data) || claimed.data.length > CAMPAIGN_EMAIL_BATCH_LIMIT) return { ok: false, error: UNAVAILABLE };
    const counts = { accepted: 0, unknown: 0, rejected: 0, cancelled: 0 };
    for (const row of claimed.data as OutboxRow[]) {
      if (!CAMPAIGN_UPDATE_UUID.test(row.id) || !CAMPAIGN_UPDATE_UUID.test(row.lease_token) || !CAMPAIGN_UPDATE_UUID.test(row.user_id) ||
        !CAMPAIGN_UPDATE_UUID.test(row.subscription_id) || campaignUpdateEmail(row.recipient_email) !== row.recipient_email ||
        typeof row.sender !== "string" || row.sender.length > 200 || /[\r\n]/.test(row.sender) ||
        typeof row.subject !== "string" || row.subject.length > 160 || /[\r\n]/.test(row.subject) ||
        typeof row.email_text !== "string" || row.email_text.length > 6000 || !campaignEmailRetryAllowed(row.first_attempt_at, Date.now())) {
        counts.unknown++; continue; // Fail closed; never send malformed/expired claimed records.
      }
      const consent = await recipientStillConsents(db, target, row);
      if (consent === true) providerAttempted = true;
      const outcome = consent === true ? await sendOne(config, row) : {
        status: consent === false ? "cancelled" as const : "unknown" as const,
        providerId: null, retryAfter: consent === false ? null : new Date(Date.now() + 60_000).toISOString(),
      };
      const finished = await db.rpc("campaign_updates_finish", { p_outbox: row.id, p_lease: row.lease_token,
        p_status: outcome.status, p_provider_id: outcome.providerId, p_retry_after: outcome.retryAfter,
      });
      // Accepted means only provider acceptance, not recipient delivery/read. If
      // persistence fails, the leased row is retried idempotently after expiry.
      if (finished.error || finished.data !== true) counts.unknown++;
      else counts[outcome.status]++;
    }
    const remaining = await db.from(OUTBOX).select("status", { count: "exact" }).match({ update_id: input.updateId.toLowerCase() })
      .in("status", ["pending", "inflight", "unknown", "needs_review"]).limit(1000);
    if (remaining.error || !Array.isArray(remaining.data) || typeof remaining.count !== "number") return { ok: false, error: "Dispatch status could not be confirmed. Retry the same update ID; do not publish a duplicate update." };
    return { ok: true, ...counts, remaining: remaining.count,
      needsReview: remaining.data.filter(row => row.status === "needs_review").length, deliveryVerified: false };
  } catch (error) {
    // Once a provider request starts, a DB/network exception does not prove that
    // no email was accepted. Preserve the same outbox/update for reconciliation.
    return providerAttempted ? { ok: false, error: "Email dispatch status is unknown. Some requests may have been accepted. Retry the same update ID; do not publish a duplicate update." }
      : safeError(error);
  }
}
