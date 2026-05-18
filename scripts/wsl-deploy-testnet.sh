#!/usr/bin/env bash
# Week 2 — deploy the Salapi contracts to Stellar TESTNET and generate a
# verifiable on-chain tx trail. Run inside WSL (stellar-cli lives there).
set -euo pipefail

export PATH="/usr/local/bin:$HOME/.cargo/bin:$PATH"
# shellcheck disable=SC1091
source "$HOME/.cargo/env" 2>/dev/null || true
cd /mnt/c/Users/Lenovo/OneDrive/Documents/Claude/Projects/Hackathon
export CARGO_TARGET_DIR="$HOME/salapi-target"
NET="testnet"
W="$CARGO_TARGET_DIR/wasm32v1-none/release"

echo "stellar: $(stellar --version | head -n1)"

mkkey() { stellar keys generate "$1" --network "$NET" --fund >/dev/null 2>&1 || true; }
echo "=== IDENTITIES ==="
for k in deployer donor; do mkkey "$k"; done
DEPLOYER=$(stellar keys address deployer)
DONOR=$(stellar keys address donor)
echo "DEPLOYER=$DEPLOYER"
echo "DONOR=$DONOR"

echo "=== ENSURE WASM TARGET ==="
rustup target add wasm32v1-none wasm32-unknown-unknown >/dev/null 2>&1 || true

echo "=== BUILD (optimized wasm) ==="
stellar contract build
ls -la "$W"/*.wasm

echo "=== DEPLOY CONTRACTS ==="
stellar contract deploy --wasm "$W/base_vault.wasm"        --source deployer --network "$NET" --alias base_vault
stellar contract deploy --wasm "$W/username_registry.wasm" --source deployer --network "$NET" --alias username_registry
stellar contract deploy --wasm "$W/disaster.wasm"          --source deployer --network "$NET" --alias disaster

echo "=== TEST TOKEN (native XLM SAC — no trustline / no mint needed) ==="
TOKEN=$(stellar contract asset deploy --asset native --source deployer --network "$NET" 2>/dev/null \
  || stellar contract id asset --asset native --network "$NET")
echo "TOKEN_CONTRACT=$TOKEN"

echo "=== USERNAME REGISTRY trail ==="
stellar contract invoke --id username_registry --source donor --network "$NET" -- \
  register --user "$DONOR" --username juandelacruz
stellar contract invoke --id username_registry --source donor --network "$NET" -- \
  resolve --username juandelacruz

echo "=== DISASTER VAULT trail ==="
stellar contract invoke --id disaster --source deployer --network "$NET" -- \
  initialize --admin "$DEPLOYER" --token "$TOKEN"
stellar contract invoke --id disaster --source donor --network "$NET" -- \
  contribute --from "$DONOR" --amount 50000000
stellar contract invoke --id disaster --source deployer --network "$NET" -- \
  set_disaster --active true
stellar contract invoke --id disaster --source deployer --network "$NET" -- \
  disburse --to "$DONOR" --amount 20000000
stellar contract invoke --id disaster --source deployer --network "$NET" -- \
  total

echo "=== EVIDENCE SUMMARY ==="
echo "network=testnet"
echo "deployer=$DEPLOYER"
echo "token_contract=$TOKEN"
stellar contract alias ls 2>/dev/null || true
echo "=== DONE ==="
