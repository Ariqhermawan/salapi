# Salapi

[![CI](https://github.com/Ariqhermawan/salapi/actions/workflows/ci.yml/badge.svg)](https://github.com/Ariqhermawan/salapi/actions/workflows/ci.yml)

A crypto-invisible financial app for non-crypto Filipinos: GCash-funded Stellar
wallet + programmable vaults (disaster relief, paluwagan, smart savings) + P2P
transfer. Users see only pesos — Stellar is the invisible plumbing.

> Submitted to the **Stellar Philippines Ambassador Chapter** — Instaward.
> Scope, budget, and 30-day plan are provided to the Chapter Lead separately.
> **Live on Stellar testnet** — verifiable contract IDs + tx hashes: [`DEPLOYMENTS.md`](DEPLOYMENTS.md)

This README doubles as the **reviewer evidence index**.

---

## Architecture — one shared primitive

Every vault is the same Soroban contract primitive holding the pooled token under rules; the
features are different rule-sets on that base, plus P2P transfer on one wallet.
This is what keeps a broad scope coherent and verifiable — one platform, not six
projects.

Week 1 Deliverable 1 adds one exact application money boundary at
[`web/lib/money.ts`](web/lib/money.ts). Contract-facing actions accept a decimal
string plus its display currency, convert it to integer stroops with
deterministic half-up rounding, and pass only `i128` token units to Soroban.
The inventory, baseline capability statement, and evidence commands live in
[`docs/instawards/week-1-d1.md`](docs/instawards/week-1-d1.md).

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
cargo test --workspace --locked
cargo build --workspace --target wasm32-unknown-unknown --release --locked
cd web && npm run test:money
```

## Status — mapped to the SOW's four checkpoints

| Week | Checkpoint | This repo |
|---|---|---|
| **1 · Foundation** | Lock core, tests, something breakable | ✅ workspace, integer money boundary, **19 Rust tests + 5 exact money tests pass**, WASM builds, architecture/evidence README |
| **2 · Scaffold** | Deploy on testnet, verifiable tx trails | ✅ 5 contracts build + **11 tests pass**; 5 live on testnet w/ verifiable tx trail ([DEPLOYMENTS.md](DEPLOYMENTS.md)); disaster + paluwagan + smart-savings rule-sets added |
| **3 · Connect** | Wire front-end, indexer, real user | ✅ Next.js 16 PWA live on Vercel (`salapi.app`); GCash + QRIS sandbox top-up; transparency dashboard with on-chain receipts; 6th contract `arisan_rooms` with browser-CSPRNG-at-edge randomness; 4 locales (en/tl/id/vi); display-currency picker (USD/PHP/IDR/VND) |
| **4 · Prove** | Demo + docs for non-technical reviewer | ⏳ tagged release + walkthrough video; live URL public ([salapi.app](https://salapi.app)) |

## Deployment

### Live URL

**Web app:** [salapi.app](https://salapi.app)
**Network:** Stellar **Testnet** (`Test SDF Network ; September 2015`)

### Testnet contracts (live, verifiable)

All 6 contracts deployed to Stellar Testnet. Verify each on Stellar Expert:
`https://stellar.expert/explorer/testnet/contract/<CONTRACT_ID>`

| Contract | Contract ID |
|---|---|
| base-vault | `CBC6BTKW5VA6Y2XH6WP4IEPWDZ7TBPYSIIOZQMTEH62N62NFT4F4VYDD` |
| username-registry | `CDDINUQXTF6SHZN2ZJ36IT7P4YOJ3OZN3H6LTYHVCQ35YYO7YTAWM4G3` (latest redeploy id in [`DEPLOYMENTS.md`](DEPLOYMENTS.md)) |
| disaster | `CCKQ3UVBZ75KSZDO6IPA5U6PFARJG4PLRGN2SAIW5RAGQ6K4B7ZDWBUZ` |
| paluwagan | `CCXNSK6IGPSB4QGUSNB2EFZWYV53NKVX5AV3XSJANCDDD7TULGQSY37X` |
| smart-savings | `CBQBUAOP3T235Q2U63XNC2NQVNAOXQL2KHWALO6FTIOJS46NTKIZJ5WI` |
| arisan-rooms | `CDAUA3TN4PRJFVHWBITT2DZMCY24DEZRA4NQLZLEX5CKL6AOA6RLII4S` |

Token: native XLM Stellar Asset Contract (`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`). The contracts are token-agnostic (each takes a token address at init); mainnet will target USDC or a peso-pegged anchor token.

Full audit trail — deploy tx hashes, init tx hashes, end-to-end flow tx
hashes for every feature — in [`DEPLOYMENTS.md`](DEPLOYMENTS.md).

### Mainnet contracts

Mainnet deploy is the team's next milestone. Runbook: [`MAINNET-DEPLOY.md`](MAINNET-DEPLOY.md).
Once the 6 contracts land on Mainnet, IDs will be added here.

| Contract | Contract ID (Mainnet) |
|---|---|
| base-vault | _pending_ |
| username-registry | _pending_ |
| disaster | _pending_ |
| paluwagan | _pending_ |
| smart-savings | _pending_ |
| arisan-rooms | _pending (deployed with `--features production-cadences` for real 7d/14d/30d rotation timing)_ |

Verify on Stellar Expert (Mainnet): `https://stellar.expert/explorer/public/contract/<CONTRACT_ID>`.

## base-vault — interface (Week 1)

| Fn | Purpose |
|---|---|
| `initialize(admin, token)` | one-time: disbursement authority + the token held |
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
