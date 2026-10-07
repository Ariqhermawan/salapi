/** Public/client-safe contracts. Recipient email is returned only to its owner. */
export type CampaignUpdateSubscriptionInput = {
  campaignId: string;
  expectedOwnerId: string;
  subscribed: boolean;
  notifyOk?: boolean;
};
export type PublishCampaignUpdateInput = {
  campaignId: string;
  expectedOwnerId: string;
  idempotencyKey: string;
  title: string;
  body: string;
  publicAcknowledged: boolean;
};
export type CampaignPublicUpdate = {
  id: string;
  campaignId: string;
  title: string;
  body: string;
  publishedAt: string;
  label: "QA Testnet organizer update";
  verifiedProof: false;
};
export type CampaignUpdateSubscriptionState =
  | { ok: true; status: "verified"; ownerId: string; email: string; subscribed: boolean; providerConfigured: boolean; canPublish: boolean }
  | { ok: false; status: "guest" | "unavailable" | "unverified"; error: string };
export type CampaignUpdateResult = { ok: true; subscribed: boolean; providerConfigured: boolean } | { ok: false; error: string };
export type CampaignUpdateDispatchResult =
  | { ok: true; accepted: number; unknown: number; rejected: number; cancelled: number; remaining: number; needsReview: number; deliveryVerified: false }
  | { ok: false; error: string; unavailable?: true };

export const CAMPAIGN_UPDATE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CAMPAIGN_EMAIL_BATCH_LIMIT = 5;
// Resend retains idempotency keys for 24 hours. Leave a one-hour safety margin.
export const CAMPAIGN_EMAIL_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

export function campaignUpdateId(input: unknown): string {
  if (typeof input !== "string" || !/^[1-9][0-9]{0,19}$/.test(input) || BigInt(input) > 18446744073709551615n)
    throw new Error("Invalid campaign ID.");
  return input;
}
export function campaignUpdateText(input: unknown, max: number): string {
  if (typeof input !== "string") throw new Error("Enter the update text.");
  const value = input.trim();
  if (!value || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || (max === 120 && /[\r\n]/.test(value)))
    throw new Error(`Update text must be 1-${max} characters without control characters.`);
  return value;
}
export function campaignUpdateEmail(input: unknown): string | null {
  if (typeof input !== "string" || input.trim().length > 200 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.trim())) return null;
  return input.trim().toLowerCase();
}
export function campaignUpdateEmailText(campaignId: string, title: string, body: string): string {
  return ["QA Testnet campaign update", "This campaign is a QA exercise, not a donation to a real person or NGO.",
    "This organizer-published update is not independently verified proof.", "", title, "", body, "",
    `Campaign: https://salapi.app/campaigns?id=${campaignUpdateId(campaignId)}`,
    "You opted into this campaign's organizer updates using your verified account email.",
    "To stop updates, sign in and turn off email updates on that campaign. No payment is required."].join("\n");
}
export function campaignEmailIdempotencyKey(outboxId: string): string {
  if (!CAMPAIGN_UPDATE_UUID.test(outboxId)) throw new Error("Invalid outbox ID.");
  return `campaign-update/${outboxId.toLowerCase()}`;
}
export function campaignEmailRetryAllowed(firstAttemptAt: string | null, now: number): boolean {
  if (firstAttemptAt === null) return true;
  const first = Date.parse(firstAttemptAt);
  return Number.isFinite(first) && first <= now && now - first < CAMPAIGN_EMAIL_RETRY_WINDOW_MS;
}
