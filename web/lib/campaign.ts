import { StrKey, nativeToScVal, type xdr } from "@stellar/stellar-sdk";
import { creatorCutBps } from "./campaign-money.ts";

export type Campaign = {
  id: string; title: string; state: "Funding" | "PendingProof" | "Refundable" | "Released" | "Closed";
  config: { creator: string; beneficiary: string; token: string; creator_cut_bps: number;
    funding_deadline: string; review_deadline: string; approvers: string[] };
  total: string; escrow: string; proofHash: string | null; proofUrl: string; approvals: string[];
  contribution: { amount: string; refunded: boolean };
};
export type CampaignEvent = { id: string; hash: string; link: string; campaignId: string; action: string; time: string };

// Rust contract structs use Symbol keys, not the SDK's default String keys.
export function campaignStruct(fields: Record<string, xdr.ScVal | xdr.ScVal[]>): xdr.ScVal {
  return nativeToScVal(fields, { type: Object.fromEntries(Object.keys(fields).map(key => [key, ["symbol", null]])) });
}

export function campaignId(input: unknown, zero = false): bigint {
  if (typeof input !== "string" || !/^\d{1,20}$/.test(input)) throw new Error("Invalid campaign ID");
  const n = BigInt(input);
  if (n < (zero ? 0n : 1n) || n > (1n << 64n) - 1n) throw new Error("Invalid campaign ID");
  return n;
}
export function accountAddress(input: unknown): string {
  if (typeof input !== "string" || !StrKey.isValidEd25519PublicKey(input.trim()))
    throw new Error("Enter a Stellar public wallet address starting with G");
  return input.trim();
}
export function proofHash(input: unknown): string {
  if (typeof input !== "string" || !/^[a-fA-F0-9]{64}$/.test(input) || /^0+$/.test(input))
    throw new Error("Proof hash must be a non-zero, 64-character SHA-256 hash");
  return input.toLowerCase();
}
export function publicProofUrl(input: unknown): string {
  if (typeof input !== "string" || input.length > 512) throw new Error("Provide a public HTTPS proof link (max 512 characters)");
  const url = new URL(input);
  if (url.protocol !== "https:" || url.username || url.password || url.href.length > 512) throw new Error("Proof link must use HTTPS without credentials and fit 512 characters");
  return url.href;
}
export function parseCampaignConfig(input: unknown, now: bigint) {
  if (!input || typeof input !== "object") throw new Error("Invalid campaign configuration");
  const v = input as Record<string, unknown>;
  const title = typeof v.title === "string" ? v.title.trim() : "";
  if (!title || new TextEncoder().encode(title).length > 120) throw new Error("Title must be 1–120 UTF-8 bytes");
  const beneficiary = accountAddress(v.beneficiary);
  if (!Array.isArray(v.approvers) || v.approvers.length !== 3) throw new Error("Choose exactly three approver wallets");
  const approvers = v.approvers.map(accountAddress);
  if (new Set(approvers).size !== 3) throw new Error("Approver wallets must be distinct");
  const funding = campaignId(v.fundingDeadline);
  const review = campaignId(v.reviewDeadline);
  if (funding <= now || review <= funding) throw new Error("Funding must end in the future; review must end after funding");
  return { title, beneficiary, approvers, funding, review, cutBps: creatorCutBps(v.creatorCut) };
}

export const CAMPAIGN_ERRORS: Record<string, string> = {
  "1": "Campaign not found or archived; refresh before retrying.",
  "2": "Exactly three distinct approvers are required.",
  "3": "Invalid funding/review deadlines.", "4": "Invalid campaign configuration.",
  "5": "Enter a positive donation amount.", "6": "The funding deadline has passed.",
  "7": "This campaign cannot perform that action in its current state.",
  "8": "The required deadline has not passed yet.", "9": "The review deadline has passed.",
  "10": "Proof has already been submitted and cannot be replaced.",
  "11": "Approval must reference the exact submitted proof hash.",
  "12": "This wallet is not a configured campaign approver.",
  "13": "This wallet has already approved the proof.", "14": "Two different approvers must approve first.",
  "15": "Refund is unavailable because timely approval is complete, or the campaign is not empty.",
  "16": "This wallet has no unclaimed donation to refund.", "17": "Amount exceeds supported limits.",
};
export function campaignError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = message.match(/Error\(Contract, #(\d+)\)/)?.[1];
  return code && CAMPAIGN_ERRORS[code] ? CAMPAIGN_ERRORS[code]
    : message.length < 200 && !message.includes("HostError") ? message
    : "Transaction could not be confirmed. Refresh campaign state and check your transaction before retrying.";
}
