#!/usr/bin/env bash
# Verify the workspace, then deploy + initialize a demo Paluwagan circle on
# TESTNET: members = [salapi-demo, friend1, friend2]. Friend secrets are
# written to web/.env.local (gitignored) and never echoed.
set -euo pipefail
export PATH="/usr/local/bin:$HOME/.cargo/bin:$PATH"
# shellcheck disable=SC1091
source "$HOME/.cargo/env" 2>/dev/null || true
cd /mnt/c/Users/Lenovo/OneDrive/Documents/Claude/Projects/Hackathon
export CARGO_TARGET_DIR="$HOME/salapi-target"
ENVF="web/.env.local"
NET="testnet"
TOKEN="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
AMOUNT="769230769" # ~ ₱500 / round at the app's display rate

if grep -q '^PALUWAGAN_CONTRACT=' "$ENVF" 2>/dev/null; then
  echo "already provisioned: $(grep '^PALUWAGAN_CONTRACT=' "$ENVF")"
  exit 0
fi

echo "=== TEST (workspace incl. new paluwagan getters) ==="
rustup target add wasm32v1-none wasm32-unknown-unknown >/dev/null 2>&1 || true
cargo test --workspace --color never
echo "=== BUILD ==="
stellar contract build

echo "=== FRIENDS (Friendbot-funded demo members) ==="
stellar keys generate friend1 --network "$NET" --fund >/dev/null 2>&1 || true
stellar keys generate friend2 --network "$NET" --fund >/dev/null 2>&1 || true
stellar keys fund friend1 --network "$NET" >/dev/null 2>&1 || true
stellar keys fund friend2 --network "$NET" >/dev/null 2>&1 || true
DEMO="$(stellar keys address salapi-demo)"
F1="$(stellar keys address friend1)"
F2="$(stellar keys address friend2)"

echo "=== DEPLOY paluwagan ==="
W="$CARGO_TARGET_DIR/wasm32v1-none/release/paluwagan.wasm"
PAL="$(stellar contract deploy --wasm "$W" --source salapi-demo --network "$NET")"
echo "PALUWAGAN_CONTRACT=$PAL"

echo "=== INIT circle [demo, friend1, friend2] @ $AMOUNT ==="
MEMBERS="[\"$DEMO\",\"$F1\",\"$F2\"]"
stellar contract invoke --id "$PAL" --source salapi-demo --network "$NET" -- \
  initialize --token "$TOKEN" --members "$MEMBERS" --amount "$AMOUNT"

{
  echo ""
  echo "# Paluwagan demo circle (testnet)"
  echo "PALUWAGAN_CONTRACT=$PAL"
  echo "FRIEND1_PUBLIC=$F1"
  echo "FRIEND1_SECRET=$(stellar keys show friend1)"
  echo "FRIEND2_PUBLIC=$F2"
  echo "FRIEND2_SECRET=$(stellar keys show friend2)"
} >> "$ENVF"

echo "FRIEND1_PUBLIC=$F1"
echo "FRIEND2_PUBLIC=$F2"
echo "ENV_APPENDED=$ENVF"
echo "=== DONE ==="
