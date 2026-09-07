// Server-only commit-reveal primitives shared by the arisan actions and tests.

import { createHash, createHmac } from "node:crypto";
import { Address, Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";

function u32(value: number): xdr.ScVal {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error("arisan commitment: invalid u32");
  }
  return nativeToScVal(value, { type: "u32" });
}

function address(value: string): xdr.ScVal {
  return new Address(value).toScVal();
}

/** Stable off-chain secret for this managed wallet and round.
 *
 * HMAC gives every deployment/room/round an independent pseudorandom secret,
 * while deterministic derivation lets a participant reveal after refreshing
 * the page without persisting another sensitive value. */
export function deriveArisanSecret(input: {
  signingSecret: string;
  contractId: string;
  roomId: number;
  round: number;
  participant: string;
}): Buffer {
  const key = Buffer.from(Keypair.fromSecret(input.signingSecret).rawSecretKey());
  return createHmac("sha256", key)
    .update("salapi:arisan:secret:v1\0", "utf8")
    .update(address(input.contractId).toXDR())
    .update(u32(input.roomId).toXDR())
    .update(u32(input.round).toXDR())
    .update(address(input.participant).toXDR())
    .digest();
}

/** Canonical fixed-width preimage mirrored by the Soroban contract. */
export function arisanCommitmentPreimage(input: {
  contractId: string;
  roomId: number;
  round: number;
  participant: string;
  secret: Uint8Array;
}): Buffer {
  if (input.secret.length !== 32) {
    throw new Error("arisan commitment: secret must be 32 bytes");
  }
  const preimage = Buffer.concat([
    address(input.contractId).toXDR(),
    u32(input.roomId).toXDR(),
    u32(input.round).toXDR(),
    address(input.participant).toXDR(),
    xdr.ScVal.scvBytes(Buffer.from(input.secret)).toXDR(),
  ]);
  if (preimage.length !== 140) {
    throw new Error("arisan commitment: unexpected XDR width");
  }
  return preimage;
}

export function createArisanCommitment(
  input: Parameters<typeof arisanCommitmentPreimage>[0]
): Buffer {
  return createHash("sha256")
    .update(arisanCommitmentPreimage(input))
    .digest();
}
