import "server-only";
import { StrKey } from "@stellar/stellar-sdk";
import { createSupabaseServer } from "@/lib/supabase/server";
import { isLocalPreview } from "@/lib/local-preview";
import { RECIPIENT_USERNAME_PATTERN, recipientUsername } from "@/lib/recipient-review";
import { CONTRACTS, readContract, sc } from "./stellar";
import { readTransferWalletIdentity } from "./walletActivityIdentity";

/** Optional review presentation only. No signer, provisioning, or mutation. */
export async function readTransferRecipientIdentity(input: string, address: string) {
  const username = recipientUsername(input);
  if (isLocalPreview || !RECIPIENT_USERNAME_PATTERN.test(username) || !StrKey.isValidEd25519PublicKey(address))
    return { ok: false as const, code: "unavailable" as const };
  try {
    const { data, error } = await (await createSupabaseServer()).auth.getUser();
    if (error || !data.user || data.user.is_anonymous !== false) return { ok: false as const, code: "unavailable" as const };
    // The client cannot use this endpoint to attach another wallet's photo to
    // a reviewed name. Re-resolve first, and only then read its consenting owner.
    const resolved = await readContract(CONTRACTS.usernameRegistry, "resolve", [sc.str(username)]);
    if (resolved !== address) return { ok: false as const, code: "changed" as const };
    const identity = await readTransferWalletIdentity(address);
    return identity ? { ok: true as const, username, ...identity } : { ok: false as const, code: "unavailable" as const };
  } catch { return { ok: false as const, code: "unavailable" as const }; }
}
