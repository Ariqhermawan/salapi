#!/usr/bin/env bash
# Deploy ONLY after the team has confirmed three immutable signer public keys.
# STELLAR_SOURCE is a funded CLI identity alias; DISASTER_SIGNERS is a JSON array.
# No application configuration, production alias, or existing vault is modified.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${STELLAR_SOURCE:?Set a funded Testnet CLI identity alias}"
: "${DISASTER_SIGNERS:?Set exactly three confirmed public addresses as a JSON array}"
export DISASTER_SIGNERS
cd "$ROOT/web"
node --input-type=module -e '
  import { StrKey } from "@stellar/stellar-sdk";
  const a = JSON.parse(process.env.DISASTER_SIGNERS);
  if (!Array.isArray(a) || a.length !== 3 || new Set(a).size !== 3 ||
      a.some(x => typeof x !== "string" || !StrKey.isValidEd25519PublicKey(x))) {
    throw new Error("Exactly three distinct Stellar public account addresses are required");
  }
'
cd "$ROOT"
stellar contract build --locked --package disaster
WASM="$ROOT/target/wasm32v1-none/release/disaster.wasm"
stellar contract deploy --wasm "$WASM" --source-account "$STELLAR_SOURCE" \
  --rpc-url https://soroban-testnet.stellar.org --network-passphrase 'Test SDF Network ; September 2015' -- \
  --signers "$DISASTER_SIGNERS" \
  --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
  --cap_bps 2000 --timelock_ledgers 20
# Constructor initializes the vault paused. Enabling payouts needs two approvals.
# Set the returned ID as DISASTER_CONTRACT in Vercel, then redeploy and verify /transparency.
