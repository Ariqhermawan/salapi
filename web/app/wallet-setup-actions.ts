"use server";

import { isLocalPreview } from "@/lib/local-preview";
import { prepareAuthenticatedWallet } from "@/lib/server/userWallet";

/** Explicit authenticated retry. Never serialize custody secrets to the client. */
export async function initializeWallet() {
  if (isLocalPreview) return { ok: false as const };
  try {
    const wallet = await prepareAuthenticatedWallet();
    return { ok: true as const, address: wallet.publicKey };
  } catch {
    // Network/provider messages may contain sensitive internals. The screen
    // provides a localized, retryable status instead of returning raw errors.
    return { ok: false as const };
  }
}
