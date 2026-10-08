import { StrKey } from "@stellar/stellar-sdk";
import type { Campaign } from "../campaign";
import type { CampaignDonorSummaryResult } from "../campaign-donor";
import { SEED_CIRCLES } from "./seed";

// This catalog is fictional. A mapping only enables an explicitly reviewed
// Testnet QA exercise; it does not verify an organizer, NGO, photo or delivery.
export const CIRCLES_TESTNET_QA_LABEL = "QA Testnet · fictional cause" as const;
export const CIRCLES_TESTNET_PURPOSE = "fictional-circles-qa" as const;
export const CIRCLES_TESTNET_MAX_BATCH = 27;
export type CircleTestnetCode = "invalid_circle" | "not_configured" | "unmapped" | "unavailable" | "local_preview";
export type CircleTestnetMapping = {
  campaignId: string;
  creatorWallet: string;
  beneficiaryWallet: string;
  approverWallets: string[];
  creatorCutBps: number;
  fundingDeadline: string;
  reviewDeadline: string;
};
type CircleTestnetEnvelope = {
  network: "testnet";
  contractId: string | null;
  circleId: string;
  qaLabel: typeof CIRCLES_TESTNET_QA_LABEL;
};
export type CircleTestnetCampaignResult = CircleTestnetEnvelope & ({
  ok: true;
  available: true;
  status: "ready" | "expired" | "closed";
  donationOpen: boolean;
  mapping: CircleTestnetMapping;
  // Public reads never invent or cache the current viewer's contribution.
  campaign: Omit<Campaign, "contribution">;
  donorSummary?: CampaignDonorSummaryResult;
  now: string;
} | {
  ok: false;
  available: false;
  code: CircleTestnetCode;
  donationOpen: false;
  mapping: null;
  campaign: null;
  now: null;
});
export type CircleTestnetBatchResult = {
  ok: boolean;
  network: "testnet";
  contractId: string | null;
  checkedAt: string;
  campaigns: Record<string, CircleTestnetCampaignResult>;
  code?: CircleTestnetCode;
};
export type StoredCircleTestnetMapping = CircleTestnetMapping & { circleId: string; campaignTitle: string };

export function canonicalCircleTestnetSlug(input: unknown): string | null {
  if (typeof input !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input) || input.length > 80) return null;
  return SEED_CIRCLES.some(circle => circle.id === input) ? input : null;
}

export function circleTestnetCampaignTitle(input: unknown): string | null {
  const slug = canonicalCircleTestnetSlug(input);
  return slug ? `QA Circles: ${slug}` : null;
}

export function circleTestnetSlugs(input: unknown = undefined): string[] | null {
  if (input === undefined) return SEED_CIRCLES.map(circle => circle.id);
  if (!Array.isArray(input) || !input.length || input.length > CIRCLES_TESTNET_MAX_BATCH) return null;
  const slugs = input.map(canonicalCircleTestnetSlug);
  if (slugs.some(slug => slug === null) || new Set(slugs).size !== slugs.length) return null;
  return slugs as string[];
}

function canonicalU64(input: unknown): string | null {
  if (typeof input !== "string" || !/^[1-9][0-9]{0,19}$/.test(input) || BigInt(input) > (1n << 64n) - 1n) return null;
  return input;
}

/** Runtime validation also protects against an incorrectly populated admin table. */
export function validatedCircleTestnetMapping(input: unknown, contractId: string, tokenId: string): StoredCircleTestnetMapping | null {
  if (!StrKey.isValidContract(contractId) || !StrKey.isValidContract(tokenId) || !input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const circleId = canonicalCircleTestnetSlug(row.circle_slug);
  const id = canonicalU64(row.campaign_id);
  const funding = canonicalU64(row.funding_deadline);
  const review = canonicalU64(row.review_deadline);
  const wallets = [row.creator_wallet, row.beneficiary_wallet];
  if (row.network !== "testnet" || row.contract_id !== contractId || row.token_id !== tokenId ||
    row.purpose !== CIRCLES_TESTNET_PURPOSE || row.archived_at !== null || !circleId || !id || !funding || !review ||
    BigInt(review) <= BigInt(funding) || wallets.some(wallet => typeof wallet !== "string" || !StrKey.isValidEd25519PublicKey(wallet)) ||
    !Array.isArray(row.approver_wallets) || row.approver_wallets.length !== 3 || new Set(row.approver_wallets).size !== 3 ||
    row.creator_wallet === row.beneficiary_wallet ||
    row.approver_wallets.some(wallet => typeof wallet !== "string" || !StrKey.isValidEd25519PublicKey(wallet) || wallets.includes(wallet)) ||
    typeof row.creator_cut_bps !== "number" || !Number.isInteger(row.creator_cut_bps) || row.creator_cut_bps < 0 || row.creator_cut_bps > 1000 ||
    typeof row.campaign_title !== "string" || row.campaign_title !== circleTestnetCampaignTitle(circleId) ||
    new TextEncoder().encode(row.campaign_title).length > 120) return null;
  return { circleId, campaignId: id, campaignTitle: row.campaign_title, creatorWallet: row.creator_wallet as string,
    beneficiaryWallet: row.beneficiary_wallet as string, approverWallets: [...row.approver_wallets] as string[],
    creatorCutBps: row.creator_cut_bps, fundingDeadline: funding, reviewDeadline: review };
}

function rawU64(input: unknown): string | null {
  return typeof input === "bigint" && input > 0n && input <= (1n << 64n) - 1n ? input.toString() : null;
}

/** Require the complete immutable D4 config, never merely a matching campaign ID. */
export function validatedCircleTestnetCampaign(input: unknown, mapping: StoredCircleTestnetMapping, tokenId: string): Omit<Campaign, "contribution"> | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (!raw.config || typeof raw.config !== "object") return null;
  const config = raw.config as Record<string, unknown>;
  if (rawU64(raw.id) !== mapping.campaignId || raw.title !== mapping.campaignTitle || config.creator !== mapping.creatorWallet ||
    config.beneficiary !== mapping.beneficiaryWallet || config.token !== tokenId || config.creator_cut_bps !== mapping.creatorCutBps ||
    rawU64(config.funding_deadline) !== mapping.fundingDeadline || rawU64(config.review_deadline) !== mapping.reviewDeadline ||
    !Array.isArray(config.approvers) || config.approvers.length !== 3 ||
    config.approvers.some((wallet, index) => wallet !== mapping.approverWallets[index]) ||
    !Array.isArray(raw.state) || raw.state.length !== 1 || !["Funding", "PendingProof", "Refundable", "Released", "Closed"].includes(raw.state[0]) ||
    typeof raw.total !== "bigint" || raw.total < 0n || raw.total > (1n << 127n) - 1n ||
    typeof raw.escrow !== "bigint" || raw.escrow < 0n || raw.escrow > raw.total ||
    !Array.isArray(raw.approvals) || raw.approvals.length > 3 || new Set(raw.approvals).size !== raw.approvals.length ||
    raw.approvals.some(wallet => !mapping.approverWallets.includes(wallet))) return null;
  let proofHash: string | null = null;
  if (raw.proof_hash !== null) {
    if (!(raw.proof_hash instanceof Uint8Array) || raw.proof_hash.length !== 32 || !raw.proof_hash.some(byte => byte !== 0)) return null;
    proofHash = Array.from(raw.proof_hash, byte => byte.toString(16).padStart(2, "0")).join("");
  }
  if (typeof raw.proof_url !== "string" || raw.proof_url.length > 512 || (!proofHash && raw.proof_url !== "")) return null;
  if (proofHash) {
    try { const url = new URL(raw.proof_url); if (url.protocol !== "https:" || url.username || url.password || url.href.length > 512) return null; }
    catch { return null; }
  }
  if ((raw.state[0] === "Funding" && (proofHash || raw.approvals.length)) || (raw.approvals.length && !proofHash)) return null;
  return { id: mapping.campaignId, title: mapping.campaignTitle, state: raw.state[0] as Campaign["state"],
    config: { creator: mapping.creatorWallet, beneficiary: mapping.beneficiaryWallet, token: tokenId,
      creator_cut_bps: mapping.creatorCutBps, funding_deadline: mapping.fundingDeadline,
      review_deadline: mapping.reviewDeadline, approvers: [...mapping.approverWallets] },
    total: raw.total.toString(), escrow: raw.escrow.toString(), proofHash, proofUrl: raw.proof_url, approvals: [...raw.approvals] as string[] };
}

export function circleTestnetFailure(circleId: string, contractId: string | null, code: CircleTestnetCode): CircleTestnetCampaignResult {
  return { ok: false, available: false, network: "testnet", contractId, circleId, qaLabel: CIRCLES_TESTNET_QA_LABEL,
    code, donationOpen: false, campaign: null, mapping: null, now: null };
}

export function circleTestnetReady(mapping: StoredCircleTestnetMapping, campaign: Omit<Campaign, "contribution">,
  contractId: string, now: bigint): CircleTestnetCampaignResult {
  const donationOpen = campaign.state === "Funding" && now < BigInt(mapping.fundingDeadline);
  const status = donationOpen ? "ready" : campaign.state === "Funding" ? "expired" : "closed";
  const { circleId } = mapping;
  const publicMapping: CircleTestnetMapping = { campaignId: mapping.campaignId, creatorWallet: mapping.creatorWallet,
    beneficiaryWallet: mapping.beneficiaryWallet, approverWallets: [...mapping.approverWallets], creatorCutBps: mapping.creatorCutBps,
    fundingDeadline: mapping.fundingDeadline, reviewDeadline: mapping.reviewDeadline };
  return { ok: true, available: true, network: "testnet", contractId, circleId, qaLabel: CIRCLES_TESTNET_QA_LABEL,
    status, donationOpen, mapping: publicMapping, campaign, now: now.toString() };
}
