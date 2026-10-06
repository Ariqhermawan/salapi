import type { Campaign } from "./campaign";

/** Explicit local review mode. No keys or customer records are used. */
export const isLocalPreview = process.env.NEXT_PUBLIC_LOCAL_PREVIEW === "1";
export const PREVIEW_PROOF_URL = "/evidence/local-example-proof.txt";
export const PREVIEW_PROOF_HASH = "4709e27db6a7707a12557df52ad9ddb08c5258cd218847999c449055723a9fcc";
/** The one local sample asset is not a valid public proof submission. */
export function previewEvidenceUrl(input: unknown): string | null {
  return isLocalPreview && input === PREVIEW_PROOF_URL ? PREVIEW_PROOF_URL : null;
}
/** Migrate only the old seeded document; never change a user-supplied proof. */
export function normalizePreviewCampaigns(campaigns: Campaign[]): Campaign[] {
  if (!isLocalPreview) return campaigns;
  return campaigns.map(campaign => campaign?.id === "103"
    && campaign.proofUrl === "https://salapi.app/evidence/d4-demo-proof.txt"
    && campaign.proofHash === "a".repeat(64)
    ? { ...campaign, proofUrl: PREVIEW_PROOF_URL, proofHash: PREVIEW_PROOF_HASH }
    : campaign);
}
export const PREVIEW_WALLET = {
  address: "GAKZLTZFGSSM372XUKW2ZIJ5GSHVVIW5BYZIKIXRW2BW4MM6TUI5536Y",
  pesos: 50964.03,
  pesoLabel: "₱50,964.03",
  handle: "ariqhermawan",
  xlm: "7840.62",
};
export const PREVIEW_RECIPIENT = "GAVWJIZ45MHV2KWBHNBBB7YHU5CPTIDD3YONC4ZNP7IGE6Z3C777OV4H";
const beneficiary = "GAXPCCZD3AKYIRCI5CCX2TRIMVGQ45XEUEZPF5RBUZHYFRRZGN64ZNO3";
// Stable across server and browser bundles, so the local fixture cannot hydrate
// with a different deadline. Dates are example terms, not a live campaign clock.
export const PREVIEW_TIME = Date.UTC(2026, 9, 6) / 1000;
const now = PREVIEW_TIME;
export const PREVIEW_CAMPAIGNS: Campaign[] = [
  { id: "101", title: "Tino survivors, Cebu", state: "Funding", total: "7400000000", escrow: "7400000000", proofHash: null, proofUrl: "", approvals: [], contribution: { amount: "0", refunded: false },
    config: { creator: PREVIEW_WALLET.address, beneficiary, token: "Testnet XLM", creator_cut_bps: 500, funding_deadline: String(now + 604800), review_deadline: String(now + 1209600), approvers: [PREVIEW_WALLET.address, PREVIEW_RECIPIENT, beneficiary] } },
  { id: "102", title: "Dialysis support for Ate Mei", state: "Funding", total: "4200000000", escrow: "4200000000", proofHash: null, proofUrl: "", approvals: [], contribution: { amount: "0", refunded: false },
    config: { creator: PREVIEW_RECIPIENT, beneficiary, token: "Testnet XLM", creator_cut_bps: 0, funding_deadline: String(now + 864000), review_deadline: String(now + 1468800), approvers: [PREVIEW_WALLET.address, PREVIEW_RECIPIENT, beneficiary] } },
  { id: "103", title: "Books for the barangay library", state: "PendingProof", total: "6250000000", escrow: "6250000000", proofHash: PREVIEW_PROOF_HASH, proofUrl: PREVIEW_PROOF_URL, approvals: [PREVIEW_RECIPIENT], contribution: { amount: "100000000", refunded: false },
    config: { creator: PREVIEW_WALLET.address, beneficiary, token: "Testnet XLM", creator_cut_bps: 500, funding_deadline: String(now - 86400), review_deadline: String(now + 604800), approvers: [PREVIEW_WALLET.address, PREVIEW_RECIPIENT, beneficiary] } },
];

export function previewResult() {
  return { ok: true as const, localPreview: true as const, note: "Local preview completed. No transaction was submitted." };
}
