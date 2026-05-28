// AES-256-GCM encryption for per-user Stellar secret keys at rest.
// SERVER ONLY. Stored blob format: ivB64:tagB64:cipherB64.
//
// Key = WALLET_ENC_KEY env, base64-encoded, exactly 32 bytes (256 bits)
// after decoding. Generate once per environment with:
//   openssl rand -base64 32
// Paste the result into Vercel Project Settings → Environment Variables
// (encrypted) under WALLET_ENC_KEY. Mirror to web/.env.local for local
// dev. NEVER commit this value to git, Slack, or any chat.
//
// Rotation: if the key is ever suspected compromised, all rows in the
// `wallets` Supabase table become unreadable to the new key. There is
// NO automated re-encryption migration today — the operationally safe
// path is:
//   1. Pause new sign-ups (or accept that users will get a new wallet
//      after rotation).
//   2. Set WALLET_ENC_KEY_NEW = the new key in env, keep WALLET_ENC_KEY
//      = the old key.
//   3. Write a one-time admin migration that reads each `secret_cipher`
//      with the old key, re-encrypts with the new key, writes back.
//      (Not implemented yet — add when the first rotation is needed.)
//   4. Swap WALLET_ENC_KEY to the new value, remove WALLET_ENC_KEY_NEW.
// Before mainnet: document the runbook for the on-call holder; treat
// this key like a database master password.

import crypto from "node:crypto";

function key(): Buffer {
  const b64 = process.env.WALLET_ENC_KEY;
  if (!b64) throw new Error("WALLET_ENC_KEY missing");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32)
    throw new Error("WALLET_ENC_KEY must decode to 32 bytes");
  return k;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join(":");
}

export function decryptSecret(blob: string): string {
  const parts = blob.split(":");
  if (parts.length !== 3)
    throw new Error("walletCrypto: malformed cipher blob");
  const [ivB, tagB, encB] = parts;
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(ivB, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encB, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Auth-tag mismatch or malformed input — possible WALLET_ENC_KEY rotation
    // without re-encryption, or data tampering. Never echo the blob/secret.
    throw new Error("walletCrypto: decryption failed");
  }
}
