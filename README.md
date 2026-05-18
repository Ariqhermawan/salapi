# Salapi

[![CI](https://github.com/Ariqhermawan/salapi/actions/workflows/ci.yml/badge.svg)](https://github.com/Ariqhermawan/salapi/actions/workflows/ci.yml)

A crypto-invisible financial app for non-crypto Filipinos: GCash-funded Stellar
wallet + programmable vaults (disaster relief, paluwagan, smart savings) + P2P
transfer. Users see only pesos — USDC on Stellar is invisible plumbing.

> Submitted to the **Stellar Philippines Ambassador Chapter** — Instaward.
> Scope, budget, and 30-day plan are provided to the Chapter Lead separately.
> **Live on Stellar testnet** — verifiable contract IDs + tx hashes: [`DEPLOYMENTS.md`](DEPLOYMENTS.md)

This README doubles as the **reviewer evidence index**.

---

## Architecture — one shared primitive

Every vault is the same Soroban contract primitive holding USDC under rules; the
features are different rule-sets on that base, plus P2P transfer on one wallet.
This is what keeps a broad scope coherent and verifiable — one platform, not six
projects.

```
contracts/
  base-vault/          shared vault primitive (deposit / gated disburse / ledger) + tests
  username-registry/   @username -> Stellar account (P2P send) + tests
  disaster/            rule-set on base-vault   — Week 2
  paluwagan/           rule-set on base-vault   — Week 2
  smart-savings/       rule-set on base-vault   — Week 2
  yield-adapter/       pluggable DeFi strategy interface — Week 2/3
web/                   Next.js app + @stellar/stellar-sdk — Week 3
scripts/               deploy / Friendbot fund / seed — Week 2
```

## Build & test

Builds run in **WSL/Linux** (Rust 1.95, `wasm32-unknown-unknown`, soroban-sdk 22).
Windows-native builds are blocked by Smart App Control — see limitations below.

```bash
bash scripts/wsl-build.sh     # WSL Ubuntu: deps + rustup + cargo test + WASM build
# …or in any Linux shell with Rust installed:
cargo test --workspace
cargo build --workspace --target wasm32-unknown-unknown --release
```

## Status — mapped to the SOW's four checkpoints

| Week | Checkpoint | This repo |
|---|---|---|
| **1 · Foundation** | Lock core, tests, something breakable | ✅ workspace, base-vault + username-registry, **5 unit tests pass**, WASM builds (via WSL), architecture README |
| **2 · Scaffold** | Deploy on testnet, verifiable tx trails | ✅ 5 contracts build + **11 tests pass**; 3 live on testnet w/ verifiable tx trail ([DEPLOYMENTS.md](DEPLOYMENTS.md)); disaster + paluwagan + smart-savings rule-sets added |
| 3 · Connect | Wire front-end, indexer, real user | ⏳ Next.js + GCash sandbox + transparency dashboard |
| 4 · Prove | Demo + docs for non-technical reviewer | ⏳ walkthrough video, tagged release |

## base-vault — interface (Week 1)

| Fn | Purpose |
|---|---|
| `initialize(admin, token)` | one-time: disbursement authority + USDC token held |
| `deposit(from, amount)` | anyone contributes into the pool (auth required) |
| `disburse(to, amount)` | gated payout (admin-auth; rule-sets specialise this) |
| `total()` / `contribution_of(who)` / `admin()` | public reads (back the transparency dashboard) |

Emits `deposit` / `disburse` events — these become the on-chain audit trail the
public transparency dashboard renders in Week 3.

## Known Week-1 limitations (honest tiering)

- **Builds run in WSL/Linux, not Windows-native** — the dev host's Windows Smart
  App Control (enforced) blocks freshly-compiled Rust build-script executables
  (`os error 4551`). WSL Ubuntu is unaffected; `scripts/wsl-build.sh` is the
  supported path, and CI builds on Linux too.
- **No testnet deploy yet** — `stellar` CLI + testnet deploy is Week 2 (clean on
  Linux/WSL). Week 1 evidence is *contracts compile + 5 unit tests pass + WASM
  artifacts*, per the SOW.
- **Storage TTL** not yet bumped (instance/persistent entry extension) — a Week-2
  hardening item before testnet.
- **DAO governance + AI Tribunal** for the Disaster Vault are explicitly
  Build-Award vision, not in this 30-day scope (see SOW §13).
- `disburse` is a simple admin gate in the base primitive; the Disaster rule-set
  adds its transparent, condition-gated logic in Week 2.

## Compliance

Testnet only. No real funds. Team in Indonesia + Philippines (neither
OFAC-sanctioned); KYC/KYB at disbursement per SCF rules.
