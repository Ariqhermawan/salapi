// AES-256-GCM encryption for per-user Stellar secret keys at rest.
// Key = WALLET_ENC_KEY env (32 random bytes, base64). SERVER ONLY.
// Stored blob format: ivB64:tagB64:cipherB64

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
  const [ivB, tagB, encB] = blob.split(":");
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
}
