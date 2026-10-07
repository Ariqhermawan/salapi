"use server";

import { readCircleTestnetCampaign } from "@/lib/server/circlesTestnet";
import { resolveCirclesSignupIdentity } from "@/lib/server/circlesSignup";
import { getAuthenticatedSigner } from "@/lib/server/userWallet";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { invokeAs, sc, txLink } from "@/lib/server/stellar";
import { campaignError } from "@/lib/campaign";
import { isLocalPreview } from "@/lib/local-preview";
import { circleDonationAmount, circleDonationTerms, parseCircleDonation, type CircleDonationResult } from "@/lib/circles/donation";

/** One QA donation, with reviewed terms and a verified saved-wallet owner. */
export async function donateCircleTestnet(input: unknown): Promise<CircleDonationResult> {
  if (isLocalPreview) return { ok: false, error: "Local preview cannot submit a Testnet donation." };
  const v = parseCircleDonation(input);
  if (!v) return { ok: false, error: "Review a valid native XLM amount and campaign first." };
  let submissionStarted = false;
  try {
    const identity = await resolveCirclesSignupIdentity();
    if (identity.status !== "verified" || identity.ownerId !== v.expectedOwnerId)
      return { ok: false, error: "Your account changed or could not be verified. No donation was submitted." };
    const mapping = await readCircleTestnetCampaign(v.circleId);
    if (!mapping.ok || !mapping.donationOpen || circleDonationTerms(mapping) !== v.termsKey)
      return { ok: false, error: "Campaign terms are unavailable, changed or closed. Review again. No donation was submitted." };
    const { data: wallet, error } = await createSupabaseAdmin().from("wallets").select("public_key")
      .eq("user_id", v.expectedOwnerId).maybeSingle();
    if (error || typeof wallet?.public_key !== "string")
      return { ok: false, error: "Prepare your personal Testnet wallet before donating. No donation was submitted." };
    const signer = await getAuthenticatedSigner();
    if (signer.demo || signer.publicKey !== wallet.public_key)
      return { ok: false, error: "Saved wallet identity changed. No donation was submitted." };
    const current = await resolveCirclesSignupIdentity();
    if (current.status !== "verified" || current.ownerId !== v.expectedOwnerId)
      return { ok: false, error: "Your account changed. No donation was submitted." };
    submissionStarted = true;
    const result = await invokeAs(signer.secret, mapping.contractId!, "donate", [
      sc.u64(BigInt(mapping.mapping.campaignId)), sc.addr(signer.publicKey), sc.i128(circleDonationAmount(v.amount)!),
    ]);
    if (result.ok) return { ok: true, hash: result.hash, link: txLink(result.hash),
      campaignId: mapping.mapping.campaignId, ownerId: v.expectedOwnerId };
    if (result.pending) return { ok: false, pending: true, hash: result.hash, link: txLink(result.hash), error: result.error };
    return { ok: false, error: campaignError(result.error) };
  } catch { return submissionStarted
    ? { ok: false, pending: true, error: "Submission status is unknown. Inspect Activity without sending again." }
    : { ok: false, error: "The campaign or verified wallet is unavailable. No new donation was submitted." }; }
}
