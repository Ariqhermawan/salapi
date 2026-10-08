import "server-only";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { StrKey } from "@stellar/stellar-sdk";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseConfigured, supabaseAdminConfigured } from "@/lib/supabase/env";
import { isLocalPreview } from "@/lib/local-preview";

/** Display reads never provision, fund, decrypt or fall back to demo wallets. */
export async function readAccountWallet() {
  if (isLocalPreview || !supabaseConfigured() || !supabaseAdminConfigured()) return { ok: false as const, code: "unavailable" };
  try {
    const client = await createSupabaseServer();
    const { data, error } = await client.auth.getUser();
    if (error) return { ok: false as const, code: data.user === null && isAuthSessionMissingError(error) ? "guest" : "unavailable" };
    if (data.user === null) return { ok: false as const, code: "guest" };
    if (data.user.is_anonymous !== false || !/^[0-9a-f-]{36}$/i.test(data.user.id)) return { ok: false as const, code: "unavailable" };
    const ownerId = data.user.id;
    const wallet = await createSupabaseAdmin().from("wallets").select("public_key").eq("user_id", ownerId)
      .abortSignal(AbortSignal.timeout(4_000)).maybeSingle();
    if (wallet.error) return { ok: false as const, code: "unavailable" };
    if (wallet.data === null) return { ok: false as const, code: "no_wallet", ownerId };
    if (typeof wallet.data?.public_key !== "string" || !StrKey.isValidEd25519PublicKey(wallet.data.public_key)) return { ok: false as const, code: "unavailable" };
    return { ok: true as const, ownerId, address: wallet.data.public_key as string };
  } catch (error) { return { ok: false as const, code: isAuthSessionMissingError(error) ? "guest" : "unavailable" }; }
}
