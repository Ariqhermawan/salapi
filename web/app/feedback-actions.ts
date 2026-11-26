"use server";

import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseAdminConfigured, supabaseConfigured } from "@/lib/supabase/env";
import { isLocalPreview } from "@/lib/local-preview";
import { campaignState, publicCampaignForFeedback } from "@/app/campaign-actions";
import { currentWalletPublicKey } from "@/lib/server/userWallet";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAMPAIGN_ID = /^(?:0|[1-9][0-9]{0,19})$/;
const KINDS = ["app_feedback", "campaign_feedback", "campaign_report"] as const;
const CATEGORIES = ["suggestion", "bug", "question", "fraud", "scam", "misleading_story", "money_not_used", "misleading", "inappropriate", "suspicious", "other"] as const;
type FeedbackKind = typeof KINDS[number];
const REPORT_BUCKET = "campaign-report-evidence";
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PHOTO_LIMIT = 2 * 1024 * 1024;
const TOTAL_PHOTO_LIMIT = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

type Identity = { ok: true; signedIn: boolean; ownerId?: string } | { ok: false; signedIn: false };

async function verifiedOwner(): Promise<string | null> {
  if (isLocalPreview || !supabaseConfigured()) return null;
  try {
    const { data, error } = await (await createSupabaseServer()).auth.getUser();
    const user = data.user;
    if (error || !user || user.is_anonymous || !UUID.test(user.id)) return null;
    return user.id;
  } catch { return null; }
}

export async function feedbackIdentity(): Promise<Identity> {
  if (isLocalPreview || !supabaseConfigured()) return { ok: false, signedIn: false };
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.getUser();
    if (error && !isAuthSessionMissingError(error)) return { ok: false, signedIn: false };
    const user = data.user;
    if (!user || user.is_anonymous || !UUID.test(user.id)) return { ok: true, signedIn: false };
    return { ok: true, signedIn: true, ownerId: user.id };
  } catch { return { ok: false, signedIn: false }; }
}

export async function submitFeedback(input: {
  expectedOwnerId: string;
  kind: FeedbackKind;
  category: string;
  message: string;
  campaignId?: string;
  evidencePaths?: string[];
}) {
  if (isLocalPreview || !supabaseAdminConfigured())
    return { ok: false as const, error: "Feedback is unavailable in this preview. Nothing was saved." };
  if (!input || typeof input !== "object" || !UUID.test(input.expectedOwnerId)
    || !KINDS.includes(input.kind) || !CATEGORIES.includes(input.category as typeof CATEGORIES[number])
    || typeof input.message !== "string" || input.message.trim().length < 10 || input.message.trim().length > 3000)
    return { ok: false as const, error: "Check the form and try again. Nothing was saved." };
  const campaignId = input.campaignId;
  if (input.kind === "app_feedback" ? campaignId !== undefined : typeof campaignId !== "string" || !CAMPAIGN_ID.test(campaignId))
    return { ok: false as const, error: "This campaign link is invalid. Nothing was saved." };
  const evidencePaths = input.evidencePaths ?? [];
  if (!Array.isArray(evidencePaths) || input.kind === "campaign_report" && (evidencePaths.length < 1 || evidencePaths.length > 5)
    || input.kind !== "campaign_report" && evidencePaths.length !== 0)
    return { ok: false as const, error: "Add at least one valid photo to this report. Nothing was saved." };
  if (input.kind !== "app_feedback") {
    const target = await publicCampaignForFeedback(campaignId);
    if (!target.ok) return { ok: false as const, error: "This campaign could not be verified on Stellar Testnet. Nothing was saved." };
  }
  const ownerId = await verifiedOwner();
  if (!ownerId) return { ok: false as const, error: "Sign in to send feedback. Nothing was saved." };
  if (ownerId !== input.expectedOwnerId) return { ok: false as const, error: "Your account changed. Refresh the page and try again." };
  const safePaths = evidencePaths.every(path => typeof path === "string"
    && path.startsWith(`${ownerId}/${campaignId}/`)
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i.test(path.slice(`${ownerId}/${campaignId}/`.length)));
  if (!safePaths) return { ok: false as const, error: "The photo upload could not be verified. Nothing was saved." };
  try {
    const { data, error } = await createSupabaseAdmin().rpc("submit_app_feedback", {
      p_user_id: ownerId,
      p_kind: input.kind,
      p_category: input.category,
      p_message: input.message.trim(),
      p_campaign_id: campaignId ?? null,
      p_evidence_paths: evidencePaths,
    });
    if (error || data !== "saved") {
      if (evidencePaths.length) await createSupabaseAdmin().storage.from(REPORT_BUCKET).remove(evidencePaths).catch(() => undefined);
      if (!error && data === "rate_limited") return { ok: false as const, error: "You have sent a few messages recently. Please try again in 10 minutes." };
      return { ok: false as const, error: "Feedback could not be saved. Try again later." };
    }
    return { ok: true as const };
  } catch {
    if (evidencePaths.length) await createSupabaseAdmin().storage.from(REPORT_BUCKET).remove(evidencePaths).catch(() => undefined);
    return { ok: false as const, error: "Feedback could not be saved. Try again later." };
  }
}

export async function createReportUploadTickets(expectedOwnerId: string, campaignId: string,
  files: Array<{ type: string; size: number }>) {
  if (isLocalPreview || !supabaseAdminConfigured()) return { ok: false as const, error: "Photo reports are unavailable in this preview." };
  if (!UUID.test(expectedOwnerId) || !CAMPAIGN_ID.test(campaignId) || !Array.isArray(files) || files.length < 1 || files.length > 5
    || files.some(file => !file || !PHOTO_TYPES.has(file.type) || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > PHOTO_LIMIT)
    || files.reduce((sum, file) => sum + file.size, 0) > TOTAL_PHOTO_LIMIT)
    return { ok: false as const, error: "Choose 1–5 JPG, PNG, or WebP photos. Each must be 2 MB or smaller." };
  const ownerId = await verifiedOwner();
  if (!ownerId || ownerId !== expectedOwnerId) return { ok: false as const, error: "Sign in again before uploading report photos." };
  const target = await publicCampaignForFeedback(campaignId);
  if (!target.ok) return { ok: false as const, error: "This campaign could not be verified on Stellar Testnet." };
  const admin = createSupabaseAdmin();
  const tickets: Array<{ path: string; token: string }> = [];
  try {
    for (const file of files) {
      const path = `${ownerId}/${campaignId}/${crypto.randomUUID()}.${IMAGE_EXTENSIONS[file.type]}`;
      const { data, error } = await admin.storage.from(REPORT_BUCKET).createSignedUploadUrl(path, { upsert: false });
      if (error || !data?.token || data.path !== path) throw new Error("Unable to prepare private photo upload");
      tickets.push({ path, token: data.token });
    }
    return { ok: true as const, tickets };
  } catch {
    if (tickets.length) await admin.storage.from(REPORT_BUCKET).remove(tickets.map(ticket => ticket.path)).catch(() => undefined);
    return { ok: false as const, error: "Photo upload could not be prepared. Nothing was submitted." };
  }
}

export async function cancelReportUploads(expectedOwnerId: string, campaignId: string, paths: string[]) {
  if (!supabaseAdminConfigured() || !UUID.test(expectedOwnerId) || !CAMPAIGN_ID.test(campaignId)
    || !Array.isArray(paths) || paths.length > 5) return { ok: false as const };
  const ownerId = await verifiedOwner();
  const prefix = `${ownerId}/${campaignId}/`;
  if (!ownerId || ownerId !== expectedOwnerId || paths.some(path => typeof path !== "string" || !path.startsWith(prefix)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i.test(path.slice(prefix.length))))
    return { ok: false as const };
  try {
    const { error } = await createSupabaseAdmin().storage.from(REPORT_BUCKET).remove(paths);
    return { ok: !error } as const;
  } catch { return { ok: false as const }; }
}

type CampaignRatingRow = { rating: number; comment: string; created_at: string };
function validRatingRow(value: unknown): value is CampaignRatingRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Number.isInteger(row.rating) && Number(row.rating) >= 1 && Number(row.rating) <= 5
    && typeof row.comment === "string" && row.comment.length <= 500
    && typeof row.created_at === "string" && Number.isFinite(Date.parse(row.created_at));
}

/** Public ratings omit account IDs and wallet addresses. */
export async function campaignRatingState(inputId: unknown) {
  if (typeof inputId !== "string" || !/^[1-9][0-9]{0,19}$/.test(inputId))
    return { ok: false as const, error: "This campaign link is invalid." };
  if (isLocalPreview || !supabaseAdminConfigured())
    return { ok: false as const, error: "Campaign ratings are unavailable in this preview." };
  try {
    const state = await campaignState(inputId);
    if (!state.ok) return { ok: false as const, error: "Campaign details could not be verified on Stellar Testnet." };
    const campaign = state.campaigns[0];
    if (!campaign || campaign.id !== inputId) return { ok: false as const, error: "This campaign could not be found." };
    const ownerId = await verifiedOwner();
    const admin = createSupabaseAdmin();
    const feed = await admin.from("campaign_ratings").select("rating,comment,created_at")
      .eq("campaign_id", inputId).order("created_at", { ascending: false }).limit(20);
    if (feed.error || !Array.isArray(feed.data) || !feed.data.every(validRatingRow))
      return { ok: false as const, error: "Campaign ratings could not be loaded." };
    let ownRating: CampaignRatingRow | null = null;
    if (ownerId) {
      const own = await admin.from("campaign_ratings").select("rating,comment,created_at")
        .eq("campaign_id", inputId).eq("user_id", ownerId).maybeSingle();
      if (own.error || own.data && !validRatingRow(own.data)) return { ok: false as const, error: "Your rating could not be loaded." };
      ownRating = own.data as CampaignRatingRow | null;
    }
    const wallet = ownerId ? await currentWalletPublicKey() : null;
    const donation = BigInt(campaign.contribution.amount) > 0n && wallet !== null && state.viewer === wallet;
    const proofAvailable = campaign.proofHash !== null;
    const ratings = feed.data.map(row => ({ rating: row.rating, comment: row.comment, createdAt: row.created_at }));
    const average = ratings.length ? ratings.reduce((sum, row) => sum + row.rating, 0) / ratings.length : 0;
    return { ok: true as const, campaign: { id: campaign.id, title: campaign.title, state: campaign.state, proofAvailable },
      viewer: { signedIn: ownerId !== null, hasDonated: donation, canRate: donation && proofAvailable, rating: ownRating?.rating ?? null,
        comment: ownRating?.comment ?? "" }, ratings, totalRatings: ratings.length, average };
  } catch { return { ok: false as const, error: "Campaign ratings could not be loaded." }; }
}

export async function submitCampaignRating(input: { expectedOwnerId: string; campaignId: string; rating: number; comment: string }) {
  if (!input || typeof input !== "object" || !UUID.test(input.expectedOwnerId) || typeof input.campaignId !== "string"
    || !/^[1-9][0-9]{0,19}$/.test(input.campaignId) || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5
    || typeof input.comment !== "string" || input.comment.trim().length > 500)
    return { ok: false as const, error: "Check your rating and try again." };
  if (isLocalPreview || !supabaseAdminConfigured()) return { ok: false as const, error: "Ratings are unavailable in this preview." };
  const ownerId = await verifiedOwner();
  if (!ownerId) return { ok: false as const, error: "Sign in with your personal account to rate this cause." };
  if (ownerId !== input.expectedOwnerId) return { ok: false as const, error: "Your account changed. Refresh and try again." };
  try {
    const state = await campaignState(input.campaignId);
    if (!state.ok) return { ok: false as const, error: "Campaign details could not be verified on Stellar Testnet." };
    const campaign = state.campaigns[0];
    const wallet = await currentWalletPublicKey();
    if (!campaign || campaign.id !== input.campaignId || !wallet || state.viewer !== wallet
      || BigInt(campaign.contribution.amount) <= 0n || campaign.proofHash === null)
      return { ok: false as const, error: "Only a confirmed donor can rate a cause after its organizer submits proof." };
    const { data, error } = await createSupabaseAdmin().rpc("submit_campaign_rating", {
      p_user_id: ownerId, p_campaign_id: input.campaignId, p_rating: input.rating, p_comment: input.comment.trim(),
    });
    if (error || data !== "saved") return { ok: false as const, error: "Your rating could not be saved. Try again later." };
    return { ok: true as const };
  } catch { return { ok: false as const, error: "Your rating could not be saved. Try again later." }; }
}
