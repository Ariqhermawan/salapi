"use server";

import { recordReferralSignup } from "@/lib/server/referrals";

export async function applySignInReferral(next: string) {
  if (typeof next !== "string" || next.length > 32) return;
  await recordReferralSignup(next);
}
