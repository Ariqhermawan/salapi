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
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return demoSigner();

    const admin = createSupabaseAdmin();
    const { data } = await admin
      .from("wallets")
      .select("public_key, secret_cipher")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data?.public_key && data?.secret_cipher) {
      return {
        publicKey: data.public_key as string,
        secret: decryptSecret(data.secret_cipher as string),
        demo: false,
      };
    }

    // First sign-in for this user → mint + fund + store an encrypted wallet.
    const kp = Keypair.random();
    try {
      await fetch(`${FRIENDBOT}/?addr=${kp.publicKey()}`, {
        cache: "no-store",
      });
    } catch {
      /* funding is best-effort; balance can be topped up later */
    }
    await admin.from("wallets").insert({
      user_id: user.id,
      public_key: kp.publicKey(),
      secret_cipher: encryptSecret(kp.secret()),
    });
    return { publicKey: kp.publicKey(), secret: kp.secret(), demo: false };
  } catch {
    return demoSigner();
  }
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
