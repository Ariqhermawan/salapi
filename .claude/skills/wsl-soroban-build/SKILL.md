---
name: wsl-soroban-build
description: How to build, test, deploy, and verify the Salapi Soroban (Stellar) contracts from a Windows + WSL box. Use when touching anything under contracts/, deploying a contract, or recovering an on-chain transaction hash. Captures the WSL/stellar-cli gotchas that otherwise cost several wasted attempts.
---

# Building & deploying the Salapi Soroban contracts (Windows + WSL)

The contracts live in `contracts/` (Rust, `soroban-sdk`, target
`wasm32-unknown-unknown`). The dev box is Windows; the toolchain runs under
**WSL (Ubuntu)**. Canonical on-chain evidence — contract ids, wasm hashes, and
tx hashes — lives in [DEPLOYMENTS.md](../../../DEPLOYMENTS.md). Read it; do not
duplicate ids elsewhere.

## Build and test on WSL, not Windows-native

Windows-native `cargo test` on the contract workspace can fail at link time
(MinGW export-ordinal overflow on the larger crates such as `arisan-rooms`).
Build and test inside WSL instead:

- Full WASM build: `scripts/wsl-build.sh`
- One-time CLI install: `scripts/wsl-stellar-install.sh`
- Per-crate test (from WSL): `cargo test -p <crate>` (e.g. `paluwagan`,
  `disaster`, `smart-savings`, `username-registry`, `arisan-rooms`, `base-vault`)

CI (`.github/workflows/ci.yml`) builds the WASM and runs `cargo test --workspace`
on Ubuntu, so a green CI is the portable source of truth for "it builds".

## The one rule that saves the most time: put logic in a `.sh` file

Inline `wsl -d Ubuntu -u root -- bash -c '…'` **mangles `$VARS`, `$(...)`, and
leading `/mnt/...` path args** — an intermediate shell expands them to empty, and
Git-Bash rewrites `/mnt/c/...` into `C:/Program Files/Git/mnt/...`.

Reliable pattern — keep the logic in a committed `scripts/wsl-*.sh` file (its
internal `$VARS` are safe) and invoke it with path conversion disabled:

```
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- bash -c 'bash /mnt/c/<abs>/scripts/foo.sh args'
```

Inside the single-quoted `-c`, only literals survive (no `$`); `/mnt/...`
literals there are fine. WSL has `python3` but **no `jq`** — parse JSON with
python, not jq.

## Deploy and recover the real tx hash

Deploy with `scripts/wsl-deploy-testnet.sh` (signs with the demo signer set up by
`scripts/wsl-demo-signer.sh`). Network is **testnet**.

Gotcha: `stellar contract deploy --wasm` (CLI v26) prints the **WASM hash as the
first 64-hex token in stderr — that is NOT the transaction hash.** The real tx
hash is on the `🔗 …/tx/<hash>` / `Signing transaction:` lines, or recover it
authoritatively from Horizon:

- `scripts/wsl-txtrail.sh` — Horizon operation trail for the demo signer
- `scripts/wsl-verify-tx.sh <hash…>` — asserts Horizon `successful` + a
  stellar.expert 200

Append recovered hashes to `DEPLOYMENTS.md`; never record the wasm hash as a tx.

## Exercise the real server actions (no long-lived server)

From the web app, drive the actual `web/app/actions.ts` flows end to end:

```
cd web && npx tsx scripts/exercise-flows.mts
```

It loads `.env.local`, then dynamic-imports `app/actions` (extensionless import
so Next's `tsc` stays green). With no Supabase env, `getSigner()` falls back to
the demo signer. Verify specific flows with `web/scripts/verify-*.mts`.

## Secrets — never read or commit these

`web/.env.local` (+ `.bak`) and the vault-hub keypair
`web/scripts/.vault-hub.json` hold **real secrets** and are git-ignored. They are
also denied to the agent in `.claude/settings.json`. Stage commits by explicit
path — never `git add -A`/`git add .` — so a secret file can never be swept in.
