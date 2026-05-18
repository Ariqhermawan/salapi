#!/usr/bin/env bash
# Provision a dedicated TESTNET demo signer for server-side tx submission.
# Testnet only — no real value. Secret is written to web/.env.local
# (gitignored) and NEVER echoed to logs.
set -euo pipefail
export PATH="/usr/local/bin:$HOME/.cargo/bin:$PATH"

NAME="salapi-demo"
ENVF="/mnt/c/Users/Lenovo/OneDrive/Documents/Claude/Projects/Hackathon/web/.env.local"

stellar keys generate "$NAME" --network testnet --fund >/dev/null 2>&1 || true
# ensure funded (idempotent; ignore if already)
stellar keys fund "$NAME" --network testnet >/dev/null 2>&1 || true

PUB="$(stellar keys address "$NAME")"
SEC="$(stellar keys show "$NAME")"

{
  echo "# Auto-generated — TESTNET demo signer. Do NOT commit. No real value."
  echo "STELLAR_NETWORK=testnet"
  echo "STELLAR_RPC_URL=https://soroban-testnet.stellar.org"
  echo "SALAPI_DEMO_PUBLIC=$PUB"
  echo "SALAPI_DEMO_SECRET=$SEC"
  echo "NEXT_PUBLIC_STELLAR_NETWORK=testnet"
} > "$ENVF"

echo "DEMO_SIGNER_PUBLIC=$PUB"
echo "ENV_WRITTEN=$ENVF"
echo "=== DONE ==="
