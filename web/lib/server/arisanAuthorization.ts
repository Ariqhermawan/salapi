import "server-only";
import { StrKey } from "@stellar/stellar-sdk";
import { isLocalPreview } from "@/lib/local-preview";
import { supabaseConfigured, supabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Authorization = { ok: true; publicKey: string } | { ok: false; error: string };

/** A request's verified, nonanonymous owner and saved public wallet only.
 * No demo fallback, custody decryption, provisioning, funding or profile data. */
export async function authenticatedArisanWallet(): Promise<Authorization> {
  if (isLocalPreview)
    return { ok: false, error: "Local preview cannot submit transactions." };
  if (!supabaseConfigured())
    return { ok: false, error: "Sign in with your saved Testnet wallet to use these controls." };

  let userId: string;
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.getUser();
    // An error always dominates a returned user. No stale/ambiguous session may
    // borrow a canonical wallet or the shared demo identity.
    if (error)
      return { ok: false, error: "Authentication is unavailable. No transaction was submitted." };
    const user = data?.user;
    if (user === null || user?.is_anonymous === true)
      return { ok: false, error: "Sign in with your saved Testnet wallet to use these controls." };
    if (!user || user.is_anonymous !== false || typeof user.id !== "string" || !UUID.test(user.id))
      return { ok: false, error: "Authentication is unavailable. No transaction was submitted." };
    userId = user.id;
  } catch {
    return { ok: false, error: "Authentication is unavailable. No transaction was submitted." };
  }

  if (!supabaseAdminConfigured())
    return { ok: false, error: "Your saved wallet is unavailable. Prepare your Testnet wallet first." };
  try {
    const { data, error } = await createSupabaseAdmin().from("wallets")
      .select("public_key").eq("user_id", userId).maybeSingle();
    if (error || typeof data?.public_key !== "string" || !StrKey.isValidEd25519PublicKey(data.public_key))
      return { ok: false, error: "Your saved wallet is unavailable. Prepare your Testnet wallet first." };
    return { ok: true, publicKey: data.public_key };
  } catch {
    return { ok: false, error: "Your saved wallet is unavailable. Prepare your Testnet wallet first." };
  }
}
