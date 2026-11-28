import { createHash } from "node:crypto";

export const CONFIRMATION_INTENT_TTL_SECONDS = 120;

export type ConfirmationIntentAction =
  | "username_send"
  | "wallet_withdrawal"
  | "campaign_create"
  | "campaign_donate"
  | "campaign_submit_proof"
  | "campaign_approve"
  | "campaign_release"
  | "campaign_refund"
  | "campaign_close_empty"
  | "recurring_campaign_create"
  | "recurring_campaign_donate"
  | "recurring_campaign_submit_proof"
  | "recurring_campaign_approve"
  | "recurring_campaign_release"
  | "recurring_campaign_refund"
  | "recurring_campaign_close_empty";

export type ConfirmationIntentDigestInput = {
  action: ConfirmationIntentAction;
  ownerId: string;
  walletAddress: string;
  payload: unknown;
  transactionXdr: string;
  feeStroops: string;
  expiresAt: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Confirmation contains an invalid number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const fields = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${fields.map(([key, field]) => `${JSON.stringify(key)}:${canonicalJson(field)}`).join(",")}}`;
  }
  throw new Error("Confirmation contains an unsupported value");
}

export function confirmationIntentDigest(input: ConfirmationIntentDigestInput): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

export function validConfirmationIntentId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
