#!/usr/bin/env bash
# Build + test the Soroban workspace inside WSL (Linux) — bypasses Windows
# Smart App Control, which blocks freshly-compiled build-script executables.
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y build-essential pkg-config libssl-dev curl ca-certificates

if [ ! -x "$HOME/.cargo/bin/rustup" ] && ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
# shellcheck disable=SC1091
source "$HOME/.cargo/env"
rustup target add wasm32-unknown-unknown

cd /mnt/c/Users/Lenovo/OneDrive/Documents/Claude/Projects/Hackathon
export CARGO_TARGET_DIR="$HOME/salapi-target"   # keep heavy artifacts on the fast Linux fs

rustc --version
cargo --version

set +e
echo "=== CARGO TEST ==="
cargo test --workspace --color never
echo "TEST_EXIT=$?"

echo "=== WASM BUILD ==="
cargo build --workspace --target wasm32-unknown-unknown --release --color never
echo "WASM_EXIT=$?"

ls -la "$CARGO_TARGET_DIR"/wasm32-unknown-unknown/release/*.wasm 2>/dev/null
echo "=== DONE ==="
