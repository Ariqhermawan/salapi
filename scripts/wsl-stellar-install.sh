#!/usr/bin/env bash
# Install the `stellar` CLI inside WSL/Linux (native Windows is blocked by
# Smart App Control). Prefers the prebuilt Linux binary; falls back to cargo.
set -euo pipefail

if command -v stellar >/dev/null 2>&1; then
  echo "already installed: $(stellar --version | head -n1)"
  exit 0
fi

# shellcheck disable=SC1091
source "$HOME/.cargo/env" 2>/dev/null || true

api="$(curl -fsSL https://api.github.com/repos/stellar/stellar-cli/releases/latest)"
url="$(printf '%s' "$api" | grep -oE 'https://[^"]*x86_64-unknown-linux-gnu[^"]*\.tar\.gz' | head -n1)"

if [ -n "${url:-}" ]; then
  echo "prebuilt: $url"
  curl -fsSL "$url" -o /tmp/stellar-cli.tar.gz
  mkdir -p /tmp/stellar-cli-x && tar -xzf /tmp/stellar-cli.tar.gz -C /tmp/stellar-cli-x
  binp="$(find /tmp/stellar-cli-x -maxdepth 3 -type f -name stellar | head -n1)"
  [ -n "$binp" ] && install -m 0755 "$binp" /usr/local/bin/stellar
fi

if ! command -v stellar >/dev/null 2>&1; then
  echo "prebuilt not found — building via cargo (slow)"
  cargo install --locked stellar-cli
  install -m 0755 "$HOME/.cargo/bin/stellar" /usr/local/bin/stellar 2>/dev/null || true
fi

stellar --version
echo "=== STELLAR CLI READY ==="
