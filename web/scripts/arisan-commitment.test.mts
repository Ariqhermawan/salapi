import test from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import {
  arisanCommitmentPreimage,
  createArisanCommitment,
  deriveArisanSecret,
} from "../lib/server/arisanCommitment.ts";

const contractId = "CAI2KBQW6ZCM7TNJVT3UXC5IW6VLBN4DFDORNICWMQFJM7NVLBSKV3Y2";
const signer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7));

function roundInput(round = 1) {
  const participant = signer.publicKey();
  const secret = deriveArisanSecret({
    signingSecret: signer.secret(),
    contractId,
    roomId: 42,
    round,
    participant,
  });
  return { contractId, roomId: 42, round, participant, secret };
}

test("commitment preimage has the contract's fixed 140-byte XDR layout", () => {
  const input = roundInput();
  assert.equal(input.secret.length, 32);
  assert.equal(arisanCommitmentPreimage(input).length, 140);
  assert.equal(createArisanCommitment(input).length, 32);
});

test("managed-wallet secret survives retries but changes with round context", () => {
  const first = roundInput(1);
  const retry = roundInput(1);
  const nextRound = roundInput(2);
  assert.deepEqual(first.secret, retry.secret);
  assert.notDeepEqual(first.secret, nextRound.secret);
  assert.notDeepEqual(
    createArisanCommitment(first),
    createArisanCommitment(nextRound)
  );
});

test("commitment rejects non-32-byte secrets", () => {
  const input = roundInput();
  assert.throws(() =>
    arisanCommitmentPreimage({ ...input, secret: Buffer.alloc(31) })
  );
});
