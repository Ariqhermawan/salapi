#!/usr/bin/env bash
# Build, deploy and initialize the Arisan Rooms contract on TESTNET.
# Idempotent: a prior ARISAN_ROOMS_CONTRACT block in web/.env.local is
# stripped and rewritten. No member-list at init — rooms are created at
# runtime via the app (the contract holds many rooms keyed by room_id).
set -euo pipefail
export PATH="/usr/local/bin:$HOME/.cargo/bin:$PATH"
# shellcheck disable=SC1091
source "$HOME/.cargo/env" 2>/dev/null || true
cd /mnt/c/Users/Lenovo/OneDrive/Documents/Claude/Projects/Hackathon
export CARGO_TARGET_DIR="$HOME/salapi-target"
ENVF="web/.env.local"
NET="testnet"
TOKEN="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"

if grep -q '^ARISAN_ROOMS_CONTRACT=' "$ENVF" 2>/dev/null; then
  echo "re-provisioning: stripping previous Arisan-Rooms block from $ENVF"
  cp "$ENVF" "$ENVF.bak"
  sed -i '/^# Arisan Rooms contract/,/^ARISAN_ROOMS_CONTRACT=/d' "$ENVF"
fi

echo "=== BUILD (wasm32v1-none for stellar v26) ==="
rustup target add wasm32v1-none >/dev/null 2>&1 || true
stellar contract build

W="$CARGO_TARGET_DIR/wasm32v1-none/release/arisan_rooms.wasm"
if [ ! -f "$W" ]; then
  echo "WASM not found at $W" >&2
  exit 1
fi
echo "WASM size: $(stat -c%s "$W") bytes"

echo "=== DEPLOY arisan_rooms ==="
ARISAN="$(stellar contract deploy --wasm "$W" --source salapi-demo --network "$NET")"
echo "ARISAN_ROOMS_CONTRACT=$ARISAN"

echo "=== INIT (token=XLM SAC) ==="
stellar contract invoke --id "$ARISAN" --source salapi-demo --network "$NET" -- \
  initialize --token "$TOKEN"

{
  echo ""
  echo "# Arisan Rooms contract (testnet)"
  echo "ARISAN_ROOMS_CONTRACT=$ARISAN"
} >> "$ENVF"

echo "ENV_APPENDED=$ENVF"
echo "=== DONE ==="
