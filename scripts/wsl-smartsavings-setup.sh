#!/usr/bin/env bash
# Deploy + initialize the Smart-Savings vault on TESTNET (single-owner =
# the managed demo signer). Appends SMARTSAVINGS_CONTRACT to web/.env.local.
set -euo pipefail
export PATH="/usr/local/bin:$HOME/.cargo/bin:$PATH"
# shellcheck disable=SC1091
source "$HOME/.cargo/env" 2>/dev/null || true
cd /mnt/c/Users/Lenovo/OneDrive/Documents/Claude/Projects/Hackathon
export CARGO_TARGET_DIR="$HOME/salapi-target"
ENVF="web/.env.local"
NET="testnet"
TOKEN="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"

if grep -q '^SMARTSAVINGS_CONTRACT=' "$ENVF" 2>/dev/null; then
  echo "re-provisioning: stripping previous Smart-Savings block from $ENVF"
  cp "$ENVF" "$ENVF.bak"
  sed -i '/^# Smart-Savings vault/,/^SMARTSAVINGS_CONTRACT=/d' "$ENVF"
fi

rustup target add wasm32v1-none >/dev/null 2>&1 || true
echo "=== BUILD ==="
stellar contract build

echo "=== DEPLOY smart-savings ==="
W="$CARGO_TARGET_DIR/wasm32v1-none/release/smart_savings.wasm"
SS="$(stellar contract deploy --wasm "$W" --source salapi-demo --network "$NET")"
echo "SMARTSAVINGS_CONTRACT=$SS"

echo "=== INIT (token = native XLM SAC) ==="
stellar contract invoke --id "$SS" --source salapi-demo --network "$NET" -- \
  initialize --token "$TOKEN"
# Real deploy + initialize tx hashes are recovered from chain via
# scripts/wsl-txtrail.sh (Horizon) — the authoritative, explorer-verifiable
# source for docs/operations/deployments.md. (CLI stderr mixes in the wasm-upload hash.)

{
  echo ""
  echo "# Smart-Savings vault (testnet)"
  echo "SMARTSAVINGS_CONTRACT=$SS"
} >> "$ENVF"

echo "ENV_APPENDED=$ENVF"
echo "=== DONE ==="
