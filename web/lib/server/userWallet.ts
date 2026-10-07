// Resolves the Stellar signer for the *current request*:
//  - signed-in Supabase user  → their own custodial testnet wallet
//    (generated + Friendbot-funded + AES-GCM-encrypted on first use)
//  - no Supabase env / no session → the shared demo signer (unchanged behaviour)
// SERVER ONLY.

import { Keypair } from "@stellar/stellar-sdk";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { isLocalPreview } from "@/lib/local-preview";
import { demoPublic } from "@/lib/server/stellar";
import { ensureTestnetAccount, getTestnetNativeBalance } from "@/lib/server/walletReadiness";
import {
  supabaseConfigured,
  supabaseAdminConfigured,
} from "@/lib/supabase/env";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret } from "@/lib/server/walletCrypto";

export type Signer = { publicKey: string; secret: string; demo: boolean };

function demoSigner(): Signer {
  return {
    publicKey: demoPublic(),
    secret: process.env.SALAPI_DEMO_SECRET ?? "",
    demo: true,
  };
}

function savedSigner(row: { public_key?: unknown; secret_cipher?: unknown }): Signer {
  if (typeof row.public_key !== "string" || typeof row.secret_cipher !== "string")
    throw new Error("Your saved wallet is unavailable. No transaction was submitted.");
  const secret = decryptSecret(row.secret_cipher);
  if (Keypair.fromSecret(secret).publicKey() !== row.public_key)
    throw new Error("Saved wallet identity mismatch. No transaction was submitted.");
  return { publicKey: row.public_key, secret, demo: false };
}

/** Resolve only a verified owner, never infer a guest from client setup errors. */
async function walletOwner(authenticatedOnly: boolean, privileged = false): Promise<string | null> {
  if (isLocalPreview) throw new Error("Local preview cannot submit transactions or provision wallets.");
  function guest() {
    if (authenticatedOnly) throw new Error("Sign in to prepare your personal Testnet wallet.");
    return null;
  }
  if (!supabaseConfigured()) return guest();

  // Only a confirmed missing session may use the shared demo identity. An
  // unreachable auth service does not prove that this request is anonymous.
  let supabase: Awaited<ReturnType<typeof createSupabaseServer>>;
  try { supabase = await createSupabaseServer(); }
  catch { throw new Error("Authentication is unavailable. No transaction was submitted."); }
  let result: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try {
    result = await supabase.auth.getUser();
  } catch (error) {
    if (isAuthSessionMissingError(error)) return guest();
    throw new Error("Authentication is unavailable. No transaction was submitted.");
  }
  const { data: { user }, error } = result;
  if (error) {
    if (user === null && isAuthSessionMissingError(error)) return guest();
    throw new Error("Authentication is unavailable. No transaction was submitted.");
  }
  if (user === null) return guest();
  if (typeof user?.id !== "string" || !user.id)
    throw new Error("Authentication is unavailable. No transaction was submitted.");
  // Privileged signer controls require an actual, nonanonymous Auth owner.
  // These checks never change the intentional getSigner's guest-demo behavior.
  if (privileged && (user.is_anonymous !== false || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)))
    throw new Error("Authentication is unavailable. No transaction was submitted.");
  return user.id;
}

async function resolveReadySigner(authenticatedOnly: boolean): Promise<{ signer: Signer; nativeBalance: bigint | null }> {
  const userId = await walletOwner(authenticatedOnly);
  if (!userId) return { signer: demoSigner(), nativeBalance: null };
  if (!supabaseAdminConfigured())
    throw new Error("Wallet service is unavailable. No transaction was submitted.");

  // From here the user IS authenticated. A failure to resolve or decrypt
  // THEIR wallet must NOT silently downgrade to the shared demo signer — that
  // would sign this user's transaction with a key that isn't theirs and
  // misattribute funds. Let such failures throw so callers surface an error
  // instead of moving money from the wrong account.
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("wallets")
    .select("public_key, secret_cipher")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("Your saved wallet could not be loaded. No transaction was submitted.");
  if (data != null) {
    const signer = savedSigner(data);
    const nativeBalance = await ensureTestnetAccount(signer.publicKey);
    return { signer, nativeBalance };
  }

  // First sign-in for this user → mint + fund + persist an encrypted wallet.
  // Concurrency: `wallets.user_id` is the PRIMARY KEY, so two parallel
  // first-sign-in requests for the same user would race on insert. We use
  // upsert(ignoreDuplicates) so the race-loser quietly no-ops, then we
  // re-SELECT the canonical row and return it, guaranteeing this request
  // and every later request resolve to the SAME keypair (never an orphan).
  const kp = Keypair.random();
  const { error: saveError } = await admin.from("wallets").upsert(
    {
      user_id: userId,
      public_key: kp.publicKey(),
      secret_cipher: encryptSecret(kp.secret()),
    },
    { onConflict: "user_id", ignoreDuplicates: true }
  );
  if (saveError) throw new Error("Your wallet could not be saved. No transaction was submitted.");

  const { data: row, error: readError } = await admin
    .from("wallets")
    .select("public_key, secret_cipher")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError || row == null)
    throw new Error("Your saved wallet could not be confirmed. No transaction was submitted.");
  const signer = savedSigner(row);
  // Verify/fund only the persisted winner. A retry after failed funding reuses
  // this same canonical row, never a replacement keypair or encryption blob.
  const nativeBalance = await ensureTestnetAccount(signer.publicKey);
  return { signer, nativeBalance };
}

/** Existing guest demo behavior is retained; real users must be Testnet-ready. */
export async function getSigner(): Promise<Signer> { return (await resolveReadySigner(false)).signer; }

/** OAuth/setup/D4 may provision the signed-in owner's canonical wallet only. */
export async function prepareAuthenticatedWallet(): Promise<Signer> { return (await resolveReadySigner(true)).signer; }

/**
 * The legacy wallet action retains its canonical setup/readiness semantics,
 * but uses the balance already confirmed by readiness instead of repeating
 * that same Horizon read. This helper is not a read-only GET entry point.
 * Only public display fields leave this server helper, never custody keys.
 */
export async function walletBalanceSnapshot(): Promise<{ publicKey: string; nativeBalance: bigint }> {
  const ready = await resolveReadySigner(false);
  const publicKey = ready.signer.publicKey;
  return { publicKey, nativeBalance: ready.nativeBalance ?? await getTestnetNativeBalance(publicKey) };
}

/** Current Supabase user id, or null when unauthenticated / not configured. */
export async function currentUserId(): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/** Privileged D3 actions never provision a wallet or fall back to demo keys. */
export async function getAuthenticatedSigner(): Promise<Signer> {
  if (isLocalPreview) throw new Error("Local preview cannot use signer controls.");
  // Revalidate this read independently: a previous action check does not make
  // a later errored/anonymous Auth response suitable for custody access.
  const userId = await walletOwner(true, true);
  if (!userId) throw new Error("Sign in to use signer controls");
  if (!supabaseAdminConfigured()) throw new Error("Wallet service is unavailable");
  const { data, error } = await createSupabaseAdmin().from("wallets")
    .select("public_key, secret_cipher").eq("user_id", userId).maybeSingle();
  if (error || !data?.public_key || !data.secret_cipher)
    throw new Error("Your saved wallet is unavailable. Signer actions are blocked.");
  const secret = decryptSecret(data.secret_cipher);
  if (Keypair.fromSecret(secret).publicKey() !== data.public_key)
    throw new Error("Saved wallet identity mismatch. Signer actions are blocked.");
  return { publicKey: data.public_key, secret, demo: false };
}

/**
 * The current user's stored wallet public key, resolved READ-ONLY: it never
 * mints, funds, or persists a wallet. Returns null for anonymous/demo visitors
 * and for signed-in users who have no wallet row yet. Use this (not getSigner)
 * for pure reads like showing the @handle, so a page load never provisions a
 * wallet as a side effect.
 */
export async function currentWalletPublicKey(): Promise<string | null> {
  if (!supabaseAdminConfigured()) return null;
  const userId = await currentUserId();
  if (!userId) return null;
  try {
    const admin = createSupabaseAdmin();
    const { data } = await admin
      .from("wallets")
      .select("public_key")
      .eq("user_id", userId)
      .maybeSingle();
    return (data?.public_key as string) ?? null;
  } catch {
    return null;
  }
}

/** Read-only shared-demo identity for unconfigured auth or confirmed guests. */
export async function currentArisanPublicKey(): Promise<string | null> {
  if (isLocalPreview) return null;
  if (!supabaseConfigured()) return demoPublic();

  let supabase: Awaited<ReturnType<typeof createSupabaseServer>>;
  try {
    supabase = await createSupabaseServer();
  } catch {
    return null;
  }
  let userId: string;
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) return user === null && isAuthSessionMissingError(error) ? demoPublic() : null;
    if (user === null) return demoPublic();
    if (typeof user?.id !== "string" || user.id.length === 0) return null;
    userId = user.id;
  } catch (error) {
    // An outage cannot establish that this request belongs to a guest.
    return isAuthSessionMissingError(error) ? demoPublic() : null;
  }

  if (!supabaseAdminConfigured()) return null;
  try {
    const { data, error } = await createSupabaseAdmin()
      .from("wallets")
      .select("public_key")
      .eq("user_id", userId)
      .maybeSingle();
    // Never provision, decrypt, or substitute a demo identity after sign-in.
    if (error || typeof data?.public_key !== "string" || !data.public_key) return null;
    return data.public_key;
  } catch {
    return null;
  }
}
