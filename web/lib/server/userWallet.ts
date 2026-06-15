// Resolves the Stellar signer for the *current request*:
//  - signed-in Supabase user  → their own custodial testnet wallet
//    (generated + Friendbot-funded + AES-GCM-encrypted on first use)
//  - no Supabase env / no session → the shared demo signer (unchanged behaviour)
// SERVER ONLY.

import { Keypair } from "@stellar/stellar-sdk";
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

/** The signer to use for on-chain actions this request. */
export async function getSigner(): Promise<Signer> {
  if (!supabaseConfigured() || !supabaseAdminConfigured()) return demoSigner();

  // Resolve the authenticated user. If the auth subsystem is unreachable or
  // there is no session, fall back to the shared demo signer (unchanged).
  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    return demoSigner();
  }
  if (!userId) return demoSigner();

  // From here the user IS authenticated. A failure to resolve or decrypt
  // THEIR wallet must NOT silently downgrade to the shared demo signer — that
  // would sign this user's transaction with a key that isn't theirs and
  // misattribute funds. Let such failures throw so callers surface an error
  // instead of moving money from the wrong account.
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("wallets")
    .select("public_key, secret_cipher")
    .eq("user_id", userId)
    .maybeSingle();

  if (data?.public_key && data?.secret_cipher) {
    return {
      publicKey: data.public_key as string,
      secret: decryptSecret(data.secret_cipher as string),
      demo: false,
    };
  }

  // First sign-in for this user → mint + fund + persist an encrypted wallet.
  // Concurrency: `wallets.user_id` is the PRIMARY KEY, so two parallel
  // first-sign-in requests for the same user would race on insert. We use
  // upsert(ignoreDuplicates) so the race-loser quietly no-ops, then we
  // re-SELECT the canonical row and return it, guaranteeing this request
  // and every later request resolve to the SAME keypair (never an orphan).
  const kp = Keypair.random();
  try {
    await fetch(`${FRIENDBOT}/?addr=${kp.publicKey()}`, {
      cache: "no-store",
    });
  } catch {
    /* funding is best-effort; balance can be topped up later */
  }
  await admin.from("wallets").upsert(
    {
      user_id: userId,
      public_key: kp.publicKey(),
      secret_cipher: encryptSecret(kp.secret()),
    },
    { onConflict: "user_id", ignoreDuplicates: true }
  );

  const { data: row } = await admin
    .from("wallets")
    .select("public_key, secret_cipher")
    .eq("user_id", userId)
    .maybeSingle();
  if (row?.public_key && row?.secret_cipher) {
    return {
      publicKey: row.public_key as string,
      secret: decryptSecret(row.secret_cipher as string),
      demo: false,
    };
  }
  // Re-read failed (transient): fall back to our freshly minted keypair.
  return { publicKey: kp.publicKey(), secret: kp.secret(), demo: false };
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
