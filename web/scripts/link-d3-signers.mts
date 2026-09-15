// Link retained D3 Testnet signer keys to pre-created Supabase users.
//
// Required environment variables are intentionally supplied at runtime, not
// committed: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// WALLET_ENC_KEY, D3_SIGNER_UID_1..3, and D3_SIGNER_ALIAS_1..3.
// The Stellar CLI reads each secret from its owner-only identity store; this
// script never prints a secret or cipher blob and refuses to overwrite rows.
import { spawnSync } from "node:child_process";
import { Keypair } from "@stellar/stellar-sdk";
import { createClient } from "@supabase/supabase-js";
import { encryptSecret, decryptSecret } from "../lib/server/walletCrypto.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configDir = process.env.D3_STELLAR_CONFIG_DIR;
if (!url || !serviceRole || !process.env.WALLET_ENC_KEY || !configDir) {
  throw new Error("Missing Supabase, wallet encryption, or Stellar config env");
}

const entries = [1, 2, 3].map((n) => {
  const uid = process.env[`D3_SIGNER_UID_${n}`];
  const alias = process.env[`D3_SIGNER_ALIAS_${n}`];
  if (!uid || !alias) throw new Error(`Missing D3 signer ${n} UID or alias`);
  return { n, uid, alias };
});

function secretFor(alias: string): string {
  const result = spawnSync(
    "stellar",
    ["keys", "secret", alias, "--config-dir", configDir!, "--quiet"],
    { encoding: "utf8" }
  );
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`Could not read Stellar identity ${alias}`);
  }
  return result.stdout.trim();
}

const admin = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

for (const entry of entries) {
  const secret = secretFor(entry.alias);
  const publicKey = Keypair.fromSecret(secret).publicKey();

  const { data: owner, error: ownerError } = await admin
    .from("wallets")
    .select("user_id, public_key")
    .eq("public_key", publicKey)
    .maybeSingle();
  if (ownerError) throw new Error(`Signer ${entry.n} lookup failed`);
  if (owner && owner.user_id !== entry.uid) {
    throw new Error(`Signer ${entry.n} is already assigned to another user`);
  }

  const { data: existing, error: existingError } = await admin
    .from("wallets")
    .select("user_id, public_key, secret_cipher")
    .eq("user_id", entry.uid)
    .maybeSingle();
  if (existingError) throw new Error(`User ${entry.n} lookup failed`);

  if (existing) {
    if (existing.public_key !== publicKey) {
      throw new Error(`Refusing to replace existing wallet for signer ${entry.n}`);
    }
    if (decryptSecret(existing.secret_cipher) !== secret) {
      throw new Error(`Existing wallet secret mismatch for signer ${entry.n}`);
    }
    console.log(`Signer ${entry.n} already linked: ${entry.uid} → ${publicKey}`);
    continue;
  }

  const { error: insertError } = await admin.from("wallets").insert({
    user_id: entry.uid,
    public_key: publicKey,
    secret_cipher: encryptSecret(secret),
  });
  if (insertError) throw new Error(`Signer ${entry.n} insert failed`);

  const { data: inserted, error: verifyError } = await admin
    .from("wallets")
    .select("user_id, public_key, secret_cipher")
    .eq("user_id", entry.uid)
    .single();
  if (verifyError || !inserted || decryptSecret(inserted.secret_cipher) !== secret) {
    throw new Error(`Signer ${entry.n} read-back verification failed`);
  }
  console.log(`Signer ${entry.n} linked: ${entry.uid} → ${publicKey}`);
}
