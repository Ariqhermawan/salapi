"use server";

import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { isLocalPreview, PREVIEW_WALLET } from "@/lib/local-preview";
import { CONTRACTS, readContract, sc } from "@/lib/server/stellar";
import { supabaseConfigured, supabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/** Read only the verified request owner's public identity. No signer or wallet creation. */
export async function settingsHandle(): Promise<{ ok: true; handle: string | null } | { ok: false }> {
  if (isLocalPreview) return { ok: true, handle: PREVIEW_WALLET.handle };
  if (!supabaseConfigured()) return { ok: true, handle: null };
  try {
    const supabase = await createSupabaseServer();
    // A client/config failure is not evidence that the visitor is anonymous.
    const auth = await supabase.auth.getUser().catch((error: unknown) => {
      if (isAuthSessionMissingError(error)) return { data: { user: null }, error: null };
      throw error;
    });
    if (auth.error) {
      if (isAuthSessionMissingError(auth.error) && auth.data.user === null)
        return { ok: true, handle: null };
      return { ok: false };
    }
    const user = auth.data.user;
    if (user === null) return { ok: true, handle: null };
    if (!user || typeof user.id !== "string" || !user.id.trim() || !supabaseAdminConfigured())
      return { ok: false };

    const { data, error } = await createSupabaseAdmin()
      .from("wallets").select("public_key").eq("user_id", user.id).maybeSingle();
    if (error) return { ok: false };
    if (data === null) return { ok: true, handle: null };
    if (!data || typeof data.public_key !== "string" || !data.public_key)
      return { ok: false };

    try {
      const handle = await readContract(CONTRACTS.usernameRegistry, "username_of", [sc.addr(data.public_key)]);
      // This registry returns a string on success, not an optional value.
      return typeof handle === "string" && handle.length > 0
        ? { ok: true, handle } : { ok: false };
    } catch (error) {
      // username-registry::Error::NotFound = 3. Other RPC/contract failures
      // must not offer Claim as though the user's existing name disappeared.
      if (error instanceof Error && /Error\(Contract, #3\)/.test(error.message))
        return { ok: true, handle: null };
      return { ok: false };
    }
  } catch {
    return { ok: false };
  }
}
