"use server";

import { saveOnboardingUsername } from "@/lib/server/usernameOnboarding";

export async function completeUsername(expectedOwner: string, name: string) {
  return saveOnboardingUsername(expectedOwner, name);
}
