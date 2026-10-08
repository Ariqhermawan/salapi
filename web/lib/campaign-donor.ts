/** Donor metadata is attached only to an independently confirmed D4 receipt.
 * Anonymous means hidden in this app, not private on the public blockchain.
 */
export const CAMPAIGN_DONOR_PAGE_SIZE = 10;
export const CAMPAIGN_DONOR_COMMENT_BYTES = 500;
export const CAMPAIGN_DONOR_ANONYMITY_NOTICE = "Anonymous hides your name, photo, wallet and receipt link in this feed. Stellar transactions remain public and amounts or timing can still identify a donation.";
export type CampaignDonorCode = "invalid_campaign" | "invalid_input" | "invalid_cursor" | "local_preview" | "not_configured"
  | "unauthenticated" | "account_changed" | "no_wallet" | "unavailable" | "confirmation_unavailable"
  | "failed_receipt" | "receipt_mismatch" | "metadata_unavailable";
export type CampaignDonorInput = { hash: string; expectedOwnerId: string; comment: string; anonymous: boolean; publicProfileOk: boolean };
export type CampaignDonorRecordResult =
  | { ok: true; status: "recorded" | "already_recorded"; ownerId: string; campaignId: string; hash: string }
  | { ok: false; code: CampaignDonorCode; campaignId: string; hash: string | null; retryMetadataOnly: boolean; donationConfirmed: boolean };
export type CampaignDonorEntry = {
  id: string; network: "testnet"; campaignId: string; createdAt: string; amountStroops: string; asset: "XLM";
  badge: "confirmed_testnet"; anonymous: boolean; comment: string;
  donor: null | { address: string; handle: string | null; photoUrl: string | null };
  hash: string | null; link: string | null;
};
export type CampaignDonorFeedResult =
  | { ok: true; campaignId: string; entries: CampaignDonorEntry[]; nextCursor: string | null; anonymityNotice: string }
  | { ok: false; campaignId: string; code: CampaignDonorCode };

/** Count-only public projection. Accounts and wallet fallbacks are not proof of
 * distinct humans. Recorded coverage means receipts may be missing from metadata. */
export type CampaignDonorSummaryResult =
  | { ok: true; campaignId: string; count: number; basis: "accounts" | "wallets" | "mixed";
      coverage: "complete" | "recorded"; confirmedTotalStroops: string }
  | { ok: false; campaignId: string; code: CampaignDonorCode };

export function canonicalDonorCampaignId(input: unknown): string | null {
  return typeof input === "string" && /^[1-9]\d{0,19}$/.test(input) && BigInt(input) <= 18_446_744_073_709_551_615n ? input : null;
}
export function campaignDonorCursor(input: unknown): input is string {
  return typeof input === "string" && /^[1-9]\d{0,18}$/.test(input) && BigInt(input) <= 9_223_372_036_854_775_807n;
}
export function campaignDonorHash(input: unknown): input is string {
  return typeof input === "string" && /^[a-f0-9]{64}$/.test(input) && !/^0+$/.test(input);
}
export function campaignDonorComment(input: unknown): string | null {
  if (typeof input !== "string") return null;
  // Plain text only. React escapes markup; reject controls/bidi overrides that
  // could disguise an identity or receipt. Newlines are allowed for comments.
  const value = input.normalize("NFC").trim();
  return !/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/.test(value)
    && new TextEncoder().encode(value).length <= CAMPAIGN_DONOR_COMMENT_BYTES ? value : null;
}
export function parseCampaignDonorInput(input: unknown): CampaignDonorInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["hash", "expectedOwnerId", "comment", "anonymous", "publicProfileOk"].includes(key))) return null;
  const comment = campaignDonorComment(value.comment);
  if (!campaignDonorHash(value.hash) || typeof value.expectedOwnerId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.expectedOwnerId)
    || typeof value.anonymous !== "boolean" || typeof value.publicProfileOk !== "boolean" || value.anonymous && value.publicProfileOk || comment === null) return null;
  return { hash: value.hash, expectedOwnerId: value.expectedOwnerId, comment, anonymous: value.anonymous, publicProfileOk: value.publicProfileOk };
}
