#!/usr/bin/env bash
# Build + deploy the PRODUCTION-CADENCES variant of arisan_rooms to TESTNET.
# This is the mainnet candidate: days-based JOIN_WINDOW (3d) / MAX_POSTPONE
# (3d) / GRACE (14d) and weekly/biweekly/monthly cadences in real days.
#
# It is deployed to TESTNET so we can prove the build + init step works
# under the same flag the mainnet runbook will use. The live web app
# (salapi-blond.vercel.app) continues to use the demo / seconds-based
# contract so the public N=3 cycle remains demo-able in ~3 minutes.
#
# Idempotent: a prior ARISAN_ROOMS_PROD_CONTRACT block in web/.env.local is
# stripped and rewritten. Does NOT touch ARISAN_ROOMS_CONTRACT (demo).
set -euo pipefail
export PATH="/usr/local/bin:$HOME/.cargo/bin:$PATH"
# shellcheck disable=SC1091
source "$HOME/.cargo/env" 2>/dev/null || true
cd /mnt/c/Users/Lenovo/OneDrive/Documents/Claude/Projects/Hackathon
export CARGO_TARGET_DIR="$HOME/salapi-target"
ENVF="web/.env.local"
NET="testnet"
TOKEN="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"

if grep -q '^ARISAN_ROOMS_PROD_CONTRACT=' "$ENVF" 2>/dev/null; then
  echo "re-provisioning: stripping previous Arisan-Rooms (prod) block from $ENVF"
  cp "$ENVF" "$ENVF.bak"
  sed -i '/^# Arisan Rooms contract (production-cadences/,/^ARISAN_ROOMS_PROD_CONTRACT=/d' "$ENVF"
fi

echo "=== BUILD (--features production-cadences, wasm32v1-none) ==="
rustup target add wasm32v1-none >/dev/null 2>&1 || true
stellar contract build --package arisan-rooms --features production-cadences

W="$CARGO_TARGET_DIR/wasm32v1-none/release/arisan_rooms.wasm"
if [ ! -f "$W" ]; then
  echo "WASM not found at $W" >&2
  exit 1
fi
# Keep a copy aside so a subsequent default build doesn't shadow it in the
# cache, and so the file is greppable in the workspace later if needed.
PROD_WASM="$CARGO_TARGET_DIR/wasm32v1-none/release/arisan_rooms_prod.wasm"
cp "$W" "$PROD_WASM"
echo "WASM size: $(stat -c%s "$PROD_WASM") bytes (saved as $PROD_WASM)"

echo "=== DEPLOY arisan_rooms (production-cadences) ==="
ARISAN_PROD="$(stellar contract deploy --wasm "$PROD_WASM" --source salapi-demo --network "$NET")"
echo "ARISAN_ROOMS_PROD_CONTRACT=$ARISAN_PROD"

echo "=== INIT (token=XLM SAC) ==="
stellar contract invoke --id "$ARISAN_PROD" --source salapi-demo --network "$NET" -- \
  initialize --token "$TOKEN"

{
  echo ""
  echo "# Arisan Rooms contract (production-cadences variant — mainnet candidate, deployed to testnet)"
  echo "ARISAN_ROOMS_PROD_CONTRACT=$ARISAN_PROD"
} >> "$ENVF"

# Restore the default (seconds-based) wasm in the build cache so any
# subsequent `next build` step or local cargo build sees the demo variant.
echo "=== Rebuilding default (demo) variant to restore cache ==="
stellar contract build --package arisan-rooms

echo "ENV_APPENDED=$ENVF"
echo "=== DONE ==="
