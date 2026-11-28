#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_ACCOUNT="${1:-${STELLAR_SOURCE_ACCOUNT:-}}"
TOKEN="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
WASM="$ROOT/target/wasm32v1-none/release/recurring_campaign.wasm"

if [[ -z "$SOURCE_ACCOUNT" ]]; then
  echo "Pass a Testnet source identity: $0 <stellar-key-alias-or-public-key>" >&2
  exit 2
fi

cargo build --manifest-path "$ROOT/Cargo.toml" -p recurring-campaign --target wasm32v1-none --release --locked
stellar contract deploy --wasm "$WASM" --source-account "$SOURCE_ACCOUNT" --network testnet -- --token "$TOKEN"
