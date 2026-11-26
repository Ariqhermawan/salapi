"use server";

import { prepareSignupSource, saveSignupSource } from "@/lib/server/referrals";
import { safeAppFallback } from "@/lib/ui/app-navigation";

export async function applySignInReferral(next: string) {
  return prepareSignupSource(safeAppFallback(next));
}

export async function submitSignupSource(choice: unknown, code: unknown) {
  return saveSignupSource(choice, code);
}
