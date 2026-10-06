// Resolves the Stellar signer for the *current request*:
//  - signed-in Supabase user  → their own custodial testnet wallet
//    (generated + Friendbot-funded + AES-GCM-encrypted on first use)
//  - no Supabase env / no session → the shared demo signer (unchanged behaviour)
// SERVER ONLY.

import { Keypair } from "@stellar/stellar-sdk";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { isLocalPreview } from "@/lib/local-preview";
import { FRIENDBOT, demoPublic } from "@/lib/server/stellar";
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

/** The signer to use for on-chain actions this request. */
export async function getSigner(): Promise<Signer> {
  if (isLocalPreview) throw new Error("Local preview cannot submit transactions or provision wallets.");
  if (!supabaseConfigured()) return demoSigner();

  // Only a confirmed missing session may use the shared demo identity. An
  // unreachable auth service does not prove that this request is anonymous.
  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user }, error: authError,
    } = await supabase.auth.getUser();
    if (authError) {
      if (isAuthSessionMissingError(authError)) return demoSigner();
      throw new Error("Authentication is unavailable. No transaction was submitted.");
    }
    userId = user?.id ?? null;
  } catch (error) {
    if (isAuthSessionMissingError(error)) return demoSigner();
    throw new Error("Authentication is unavailable. No transaction was submitted.");
  }
  if (!userId) return demoSigner();
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
  if (data != null) return savedSigner(data);

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
  // Only fund the persisted winner, never a discarded key from a failed insert
  // or concurrent first-use request. Funding remains best-effort.
  if (signer.publicKey === kp.publicKey()) {
    try {
      await fetch(`${FRIENDBOT}/?addr=${signer.publicKey}`, { cache: "no-store" });
    } catch {
      /* balance can be topped up later */
    }
  }
  return signer;
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
  const userId = await currentUserId();
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

/** Read-only shared-demo identity only when browser auth is not configured. */
export async function currentArisanPublicKey(): Promise<string | null> {
  if (isLocalPreview) return null;
  if (!supabaseConfigured()) return demoPublic();
  return currentWalletPublicKey();
}
