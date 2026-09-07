#!/usr/bin/env bash
# Build, upload, deploy, and initialize both Deliverable 2 Arisan variants.
#
# Prerequisites:
#   - Stellar CLI with a funded Testnet identity
#   - STELLAR_SOURCE set to that identity alias or secret (default: salapi-d2-demo)
#
# This script prints public IDs only. It does not create keys or edit .env files.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NETWORK="${STELLAR_NETWORK:-testnet}"
SOURCE="${STELLAR_SOURCE:-salapi-d2-demo}"
TOKEN="${STELLAR_NATIVE_TOKEN:-CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC}"
OUT="${CARGO_TARGET_DIR:-$ROOT/target}/d2-deploy"

cd "$ROOT"
mkdir -p "$OUT/demo" "$OUT/long"

deploy_variant() {
  local name="$1"
  local out_dir="$OUT/$name"
  shift

  stellar contract build --locked --package arisan-rooms --out-dir "$out_dir" "$@"

  local wasm="$out_dir/arisan_rooms.wasm"
  local wasm_hash
  local contract_id
  wasm_hash="$(stellar -q contract upload --wasm "$wasm" --source "$SOURCE" --network "$NETWORK")"
  contract_id="$(stellar -q contract deploy --wasm-hash "$wasm_hash" --source "$SOURCE" --network "$NETWORK")"
  stellar -q contract invoke --id "$contract_id" --source "$SOURCE" --network "$NETWORK" -- \
    initialize --token "$TOKEN" >/dev/null

  printf '%s_WASM_HASH=%s\n' "$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')" "$wasm_hash"
  printf '%s_CONTRACT_ID=%s\n' "$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')" "$contract_id"
}

deploy_variant demo
deploy_variant long --features production-cadences

printf '\nSet ARISAN_ROOMS_CONTRACT to DEMO_CONTRACT_ID for the public demo.\n'
printf 'Keep LONG_CONTRACT_ID as the real-cadence Testnet evidence deployment.\n'
