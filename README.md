# Salapi

**Trustless community money pools on Stellar.** Crypto-invisible peso and rupiah savings circles (arisan / paluwagan), donations, and a transparent disaster-relief vault for Southeast Asia.

> **Status: Live testnet preview.** Working PWA on Stellar testnet, 6 Soroban contracts deployed and verified on testnet. No mainnet, no real funds (testnet XLM only), no live user metrics yet. Everything below is labelled shipped, in progress, or roadmap, and nothing is overstated.

**Live app:** https://salapi.app
**Public transparency dashboard:** https://salapi.app/transparency
**Repo:** https://github.com/Ariqhermawan/salapi

[![Live demo](https://img.shields.io/badge/demo-salapi.app-brightgreen)](https://salapi.app)
[![Network](https://img.shields.io/badge/network-Stellar%20Testnet-blue)](https://salapi.app/transparency)
[![Contracts](https://img.shields.io/badge/Soroban%20contracts-6%20deployed%20%26%20verified-blueviolet)](https://salapi.app/transparency)
[![soroban-sdk](https://img.shields.io/badge/soroban--sdk-22-orange)](https://developers.stellar.org/)
[![Security](https://img.shields.io/badge/security-nonce--CSP%20%2B%20strict--dynamic-informational)](#security-and-testnet-honesty)

---

## The problem

Across Southeast Asia, **rotating savings circles** are a daily financial habit: *arisan* in Indonesia, *paluwagan* in the Philippines. Everyone contributes to a shared pot each period; each period one member receives the whole pot, by draw or by turn, until everyone has had a payout. These circles are widely documented in the household-finance literature for both countries and remain a mainstream way that families and communities save together.

These circles are huge, informal, and built entirely on personal trust. The structural weak point is always the same: **the money moves through a human who promises to be trustworthy.** The organizer holds the pot. The organizer runs the draw. The organizer can be late, can lose the cash, can play favorites with the draw, or can simply disappear with the money. The same trust gap shows up in community donations and in disaster relief, where contributors have no way to verify that what they gave actually arrived where it was promised.

The usual "fix" is *more* trust: a better-known organizer, a stricter group chat, a paper ledger. That does not remove the single point of failure. It just renames it.

## What Salapi is

Salapi replaces the trusted human in the middle with a smart contract on Stellar. The pot is held by an on-chain vault, the rules are enforced on-chain, and **anyone can check the ledger** - contributors, members, and outside reviewers alike.

To the user it looks and behaves like a familiar local money app (GCash, Dana): you send to an **@handle**, you join a savings circle, you contribute, you receive. The blockchain is invisible. To everyone else, the system is **verifiable by default** - every contribution, every payout, and every draw is a public on-chain event.

That is the thesis in one line: **crypto-invisible to the user, verifiable by default to everyone.**

## What funding unlocks

The Stellar Startup Track is milestone-based, so this is framed as milestones to define together with the Stellar Builder Team rather than a fixed grant ask. Each milestone moves Salapi from a verified testnet preview toward a real, compliant mainnet pilot, and each produces an output a reviewer can check:

1. **Harden the core (about 1 to 2 months).** Complete the remaining draw and disaster-vault hardening: ship VRF or commit-reveal for the arisan draw and add multisig plus cap plus timelock controls on the disaster-vault admin. The integer-only application money boundary is already shipped in Week 1 Deliverable 1. *Verifiable output:* updated contracts redeployed to testnet with the new transaction trail in `DEPLOYMENTS.md`, and a `/transparency` page reflecting the hardened contracts.
2. **Anchor sandbox integration (about 2 to 3 months).** Integrate a SEP-24 anchor sandbox for PHP and IDR on and off ramps and run end-to-end top-up test transactions on testnet. *Verifiable output:* a fiat-to-on-chain test transaction trail, executed first on testnet.
3. **Mainnet pilot (about 3 to 4 months).** Deploy to mainnet and run a first pilot with a small number of real savings circles. *Verifiable output:* mainnet contract IDs published on `/transparency` and a first set of real on-chain cycles.

Milestone 1 is a self-contained first step. The work it funds is a third-party security review, anchor and compliance integration, and dedicated builder time through the pilot.

## What is live vs roadmap

**Live on testnet today** is the wallet, send-by-handle, the disaster-relief vault with its public transparency dashboard, the prefund arisan/paluwagan circle with an on-chain sealed draw, and goal-based smart-savings - all backed by 6 Soroban contracts deployed and verified on Stellar testnet. **The fiat on-ramp (Xendit / GCash / QRIS) and mainnet are roadmap, not shipped.**

| Capability | On-chain primitive | Status |
|---|---|---|
| Send by `@handle` (with `rename`, old name kept as a money-safe alias) | `username-registry` | Shipped (testnet) |
| Disaster-relief vault + public transparency dashboard | `disaster` | Shipped (testnet) |
| Prefund arisan / paluwagan circle with two-phase sealed on-chain draw | `arisan-rooms` (built on `base-vault`) | Shipped (testnet) |
| Rotating savings circle (turn-based ROSCA) | `paluwagan` (built on `base-vault`) | Shipped (testnet) |
| Goal-based smart savings | `smart-savings` (built on `base-vault`) | Shipped (testnet) |
| Shared vault accounting primitive | `base-vault` | Shipped (testnet) |
| 4 locales (en / tl / id / vi) + multi-currency display (USD / PHP / IDR / VND) | app layer | Shipped |
| Per-request nonce CSP + security headers, custodial encrypted wallet | app / infra layer | Shipped |
| Fee sponsorship (gasless via fee-bump) | app layer | Coded, opt-in, off in default deploy |
| Fiat on-ramp: GCash / QRIS / Xendit auto-converting to an on-chain asset | anchor / SEP-24 path | Roadmap (not shipped) |
| Mainnet deployment | - | Roadmap (not shipped) |

### Why prefund arisan is a real improvement, not just "arisan on a blockchain"

In the prefund model, each member's full obligation for the whole cycle is locked into the contract **up front**. After N rounds have paid out, the room balance is exactly zero. That single property removes the three classic arisan failure modes by construction:

- **Late payment** is impossible - the funds are already in the vault.
- **Default** is impossible - a member cannot owe what they have already escrowed.
- **Absconding** is impossible - there is no organizer holding cash to run off with; the contract holds the pot and the rules.

This is the most differentiated technical claim in the project, and it is checkable on-chain.

## Why Stellar

Stellar is not a logo here. Each core feature depends on something Stellar gives cleanly that a general-purpose chain would not:

- **Low, predictable fees and fast finality** make micro-contribution savings circles and per-handle peso/rupiah sends economically viable. A cents-level community contribution cannot carry general-purpose-chain gas overhead; on Stellar it can.
- **The SEP-24 anchor standard** is the credible, regulated path to real PHP/IDR on and off ramps. The production plan is a licensed Stellar anchor, not a bespoke payment hack.
- **Soroban** carries the logic that matters: the two-phase sealed on-chain draw and the prefund custody accounting.
- **Asset-agnostic contracts.** The vault primitive takes a token `Address`, so the same contracts move testnet XLM today and can move USDC, a peso-pegged stablecoin, or a rupiah-backed stablecoin tomorrow with no contract rewrite.
- **Ecosystem alignment.** Stellar's disaster and humanitarian work (Stellar Aid Assist) is built on exactly the values Salapi's disaster vault embodies - transparency on where and when funds arrived, no middlemen, usable without a bank account. Salapi's vault is a **grassroots, community-side** take on that pattern (see honesty note below). Salapi targets the Philippines, Indonesia, and Vietnam remittance corridors, which sit within Stellar's stated focus on financial inclusion in emerging markets.

## Architecture

A thin, four-layer model. The PWA never talks to a contract directly; all signing and contract invocation happen server-side.

Week 1 Deliverable 1 adds one exact application money boundary at
[`web/lib/money.ts`](web/lib/money.ts). Contract-facing actions accept a decimal
string plus its display currency, convert it to integer stroops with
deterministic half-up rounding, and pass only `i128` token units to Soroban.
The inventory, baseline capability statement, and evidence commands live in
[`docs/instawards/week-1-d1.md`](docs/instawards/week-1-d1.md).

```
┌──────────────────────────────────────────────────────────────┐
│  PWA  (Next.js 16 · React 19 · Tailwind v4 · TypeScript)       │
│  send-by-@handle · arisan room · disaster vault · savings      │
│  4 locales (en/tl/id/vi) · multi-currency display              │
└───────────────────────────────┬──────────────────────────────┘
                                 │  React Server Actions
┌───────────────────────────────▼──────────────────────────────┐
│  Server actions  (web/app/actions.ts)                          │
│  input validation · session/wallet resolution                 │
└───────────────────────────────┬──────────────────────────────┘
                                 │
┌───────────────────────────────▼──────────────────────────────┐
│  Server Stellar layer  (web/lib/server/stellar.ts)             │
│  key custody · tx build/sign · invoke · optional fee-sponsor   │
│  soroban-sdk 22 contracts · native XLM SAC (testnet)           │
└───────────────────────────────┬──────────────────────────────┘
                                 │  Soroban RPC / Horizon (testnet)
┌───────────────────────────────▼──────────────────────────────┐
│  Soroban contracts (testnet)                                   │
│   username-registry · disaster · arisan-rooms                  │
│   paluwagan · smart-savings   ──built on──►  base-vault        │
└──────────────────────────────────────────────────────────────┘
```

The rule-set contracts (`arisan-rooms`, `paluwagan`, `smart-savings`, `disaster`) are built on top of one shared `base-vault` primitive. The web app invokes the rule-set contracts, the username registry, and the native XLM SAC - it does not call `base-vault` directly; that is the internal foundation the others sit on.

### Send-by-handle data flow

1. User enters `@handle` and an amount in pesos/rupiah.
2. Server resolves `@handle` to a Stellar account via `username-registry`.
3. Server builds, signs, and submits the payment from the sender's custodial wallet.
4. UI shows a peso/rupiah confirmation and a link to the transaction on Stellar Expert. The user never sees a key, an XLM amount, or a contract address.

## Contracts

Built with **`soroban-sdk = "22"`** (workspace-pinned in the root `Cargo.toml`; every contract crate inherits it). Release profile is hardened: `overflow-checks = true`, `panic = "abort"`, `lto = true`, `opt-level = "z"`. The contracts are MIT-licensed and open-source in this repo.

> **Live IDs.** The web app hardcodes only `disaster`, `username-registry`, and the token SAC; `paluwagan`, `smart-savings`, and `arisan-rooms` are read from environment at runtime. The `/transparency` page is canonical for the live `disaster` and `username-registry` balances; for the `arisan-rooms` redeploy trail, `DEPLOYMENTS.md` is the authoritative record. The IDs below are verified from source and `DEPLOYMENTS.md` at the time of writing.

| Contract | Crate (`--package`) | Testnet contract ID | Source path |
|---|---|---|---|
| base-vault | `base-vault` | `CBC6BTKW5VA6Y2XH6WP4IEPWDZ7TBPYSIIOZQMTEH62N62NFT4F4VYDD` | `contracts/base-vault` |
| username-registry | `username-registry` | `CDDINUQXTF6SHZN2ZJ36IT7P4YOJ3OZN3H6LTYHVCQ35YYO7YTAWM4G3` | `contracts/username-registry` |
| disaster | `disaster` | `CCKQ3UVBZ75KSZDO6IPA5U6PFARJG4PLRGN2SAIW5RAGQ6K4B7ZDWBUZ` | `contracts/disaster` |
| paluwagan | `paluwagan` | `CCXNSK6IGPSB4QGUSNB2EFZWYV53NKVX5AV3XSJANCDDD7TULGQSY37X` | `contracts/paluwagan` |
| smart-savings | `smart-savings` | `CBQBUAOP3T235Q2U63XNC2NQVNAOXQL2KHWALO6FTIOJS46NTKIZJ5WI` | `contracts/smart-savings` |
| arisan-rooms (sealed-draw demo variant) | `arisan-rooms` | `CAI2KBQW6ZCM7TNJVT3UXC5IW6VLBN4DFDORNICWMQFJM7NVLBSKV3Y2` (read from env as `ARISAN_ROOMS_CONTRACT`) | `contracts/arisan_rooms` |
| arisan-rooms (sealed-draw production-cadence variant) | `arisan-rooms` | `CASG62WFLR7FTBVSCG7PZ56HMSXJYZC23YYGNBIQUM2UW4WU7P6H6L4V` (recorded as `ARISAN_ROOMS_PROD_CONTRACT`) | `contracts/arisan_rooms` |
| Token (native XLM SAC, testnet only) | - | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` | n/a |

> **Notes.**
> - The `arisan-rooms` directory is `contracts/arisan_rooms` (underscore) but the crate name is `arisan-rooms` (hyphen). Use the hyphen for any `cargo` or `stellar contract build --package arisan-rooms` command.
> - There are two sealed-draw arisan deploys. The **demo variant** (`CAI2KBQW…`, `ARISAN_ROOMS_CONTRACT`) is what the live web app invokes; it runs a fast N=3 cycle for the public demo. The **production-cadence variant** (`CASG62WF…`, `ARISAN_ROOMS_PROD_CONTRACT`) compiles under `--features production-cadences` and is the mainnet candidate. Both use the sealed-PRNG draw described below.
> - The arisan draw mechanism has evolved (deterministic, then CSPRNG-at-edge, now the sealed-PRNG design); `DEPLOYMENTS.md` records the full redeploy trail and the prior superseded IDs.

Explorer link pattern: `https://stellar.expert/explorer/testnet/contract/<CONTRACT_ID>`.

## How it works

### Two-phase sealed on-chain draw

The arisan winner is chosen by an on-chain pseudo-random draw in two phases: `seal_kocok` commits the round under a fixed key using the contract environment's PRNG, then a deterministic `kocok` resolves the winner from the unwon pool. The caller does not supply a winner index, so no organizer (and not even the server) can pick the recipient. A full N=3 cycle has been exercised end-to-end through the app.

Honest caveat: the seed comes from Soroban's ledger-seeded PRNG (`env.prng()`), which removes caller and organizer control but is **not validator-proof** - a validator able to influence the seed source or transaction ordering could bias the outcome. This is a fairness/ordering bias, not a fund-loss risk. A commit-reveal or VRF upgrade is funded milestone 1.

### Disaster-relief vault

The vault enforces a disaster gate on-chain (contributions and the relief flow are governed by contract state, not by app code), and the public dashboard reads the live `total()` straight off chain. The contract's SAC balance equals its reported `total()`, so the accounting is independently checkable - see "What the on-chain trail proves."

### Custody model (crypto-invisible)

Each user gets a per-user testnet wallet, Friendbot-funded, with the secret **AES-256-GCM encrypted at rest**. When there is no session, a shared demo wallet is used so the app is explorable without signup. Users transact in pesos/rupiah; keys and XLM are never surfaced.

### Fee sponsorship (coded, opt-in)

A gasless path via fee-bump is implemented: `invokeSponsored()` falls back to user-paid `invokeAs()` when `SALAPI_SPONSOR_SECRET` is unset. It is real code, **off by default** in the standard deploy - described here as a coded option, not a shipped user-facing guarantee.

## What the on-chain trail proves

`DEPLOYMENTS.md` records deploy, init, and flow transaction hashes for every contract (base-vault, username-registry, disaster verified 2026-05-18; paluwagan and smart-savings verified 2026-05-19; arisan-rooms across iterations through 2026-06-13). Together they demonstrate four things a reviewer can check independently:

1. **Real network.** The contracts are deployed and invoked on Stellar testnet, with explorer-linkable transactions.
2. **Rules enforced on-chain.** The disaster gate rejects out-of-state contributions at the contract level (`NotInDisaster`), not in the UI.
3. **Accounting is correct.** The disaster vault's SAC balance equals its on-chain `total()`.
4. **Prefund zero-balance.** After a full arisan cycle the room balance is exactly zero, the structural guarantee described above.

> **Testnet honesty.** The disaster dashboard currently reports a `total()` of `180884964899773` stroops (about 18,088,496 XLM), which a peso/USD display renders as a large figure. **This is testnet XLM. It has no real-world value, it is not custody of anyone's money, and it must not be read as funds under management.** It exists to exercise the vault and transparency flow at scale on testnet.

## Security and testnet honesty

**Shipped (verifiable in `SECURITY.md` and source):**

- **Per-request nonce CSP with `strict-dynamic`** - no `script-src 'unsafe-inline'`.
- HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict `Referrer-Policy`, locked `Permissions-Policy`.
- Server-side re-validation of requests; no `dangerouslySetInnerHTML`; OAuth open-redirect guard.
- Custodial keys AES-256-GCM encrypted at rest.

**Honest limitations and hardening roadmap (from `SECURITY.md`):**

- Contracts are **immutable** - no admin rotation, no upgrade entry point.
- The draw seed is ledger-seeded (`env.prng()`) and not validator-proof; VRF or commit-reveal is a tracked hardening item.
- The application-to-contract money boundary now uses exact integer stroop conversion with deterministic rounding, conservation tests, and a CI regression guard (Week 1 Deliverable 1). Contract-side amounts were already integer-only at the baseline.
- Open items: TTL extension, multisig + cap + timelock on disaster admin, demo-helper gating, and rate limiting.
- No third-party security audit has been performed. None is claimed.

**Non-negotiable honesty posture:** no fabricated users, traction, revenue, audits, partnerships, or testimonials anywhere in this project. Testnet is always labelled testnet. The disaster pool is testnet XLM with no value. The fiat on-ramp is roadmap. Mainnet is not done. Where a number is not yet measured, this README uses an explicit placeholder rather than an invented figure.

## Why the need is real

There are **no live user or revenue numbers yet** - and this README will not invent any. What is real today is **proof of execution** plus a **well-documented market behavior**:

- **Proof of execution:** a working testnet PWA, 6 Soroban contracts deployed *and* verified, a full ROSCA lifecycle exercised on-chain, and a public transparency dashboard - all checkable without contacting the team.
- **Documented behavior:** arisan and paluwagan are large, recurring informal-savings practices in Indonesia and the Philippines, with a concrete and repeated trust-failure pain (the organizer mishandles or absconds with the pot).
- **In-market founder context:** see "Founder."

What is **not** yet done is founder-side discovery: structured organizer interviews, a waitlist, or a named pilot circle. That work is deliberately framed as the first funded milestone rather than asserted as completed validation.

| Metric | Value |
|---|---|
| Monthly active users | not yet measured (testnet preview) |
| Total value processed (real funds) | none - testnet XLM only |
| Mainnet transactions | none - not deployed |
| Contracts deployed and verified (testnet) | 6 |
| Locales shipped | 4 (en / tl / id / vi) |

## Roadmap

Separated by status. Roadmap items are written as verifiable outputs, not vibes, and contain no invented numbers.

**Shipped (testnet):** wallet + send-by-handle; disaster vault + transparency dashboard; prefund arisan with sealed on-chain draw; paluwagan; smart-savings; exact integer application money boundary; 4 locales; multi-currency display; nonce-CSP + security headers.

**In progress:** draw hardening (VRF / commit-reveal); disaster-admin controls (multisig + cap + timelock); analytics enablement (Vercel Analytics and Speed Insights are wired, but opt-in until the Vercel dashboard endpoints are enabled).

**Roadmap (not shipped):**

- **SEP-24 anchor integration** for real PHP/IDR on and off ramps; execute on-ramp test transactions on testnet first.
- **Fiat on-ramp** (GCash / QRIS via Xendit) auto-converting to an on-chain asset - the crypto-invisible top-up. Current build ships sandbox top-up affordances only.
- **Production asset path:** XLM today, USDC next, then a peso-pegged or rupiah-backed stablecoin - enabled by the asset-agnostic vault.
- **Mainnet launch** as the final milestone (a `MAINNET-DEPLOY.md` runbook exists; mainnet IDs are pending).
- Metric targets will be expressed against verifiable on-chain measures, not growth multipliers, once there is anything real to measure.

## How this differs from existing solutions

Trustless ROSCA implementations exist in the Soroban ecosystem (for example susu-style protocols; susu is the West African cousin of arisan/paluwagan). Salapi's differentiation is deliberate and stated plainly:

- A **Southeast Asia cultural beachhead** (arisan/paluwagan specifically) with 4 locales and a crypto-invisible fiat on-ramp design, not a chain-agnostic protocol.
- A **social-impact hero use case** (the disaster-relief vault + transparency dashboard), beyond savings circles.
- A **consumer-grade PWA** that hides the chain, not a developer-facing contract suite.

## Founder

**Ariq Hermawan** - in-market operator and builder. Customer Operations at EveryX and owner-operator of EL Barbershop, with direct small-business, customer, and operations exposure in the region Salapi serves.

- **Contact:** ariqhermawan@gmail.com · https://github.com/Ariqhermawan
- **Commitment:** building Salapi as the primary project, with the intent to go full-time through the funded mainnet pilot.
- **What de-risks the solo, non-protocol-veteran profile:** the founder operates inside the exact market Salapi serves (everyday peso/rupiah customers and small-business cash flow) and is positioned to recruit candidate pilot circles from that local network. No blockchain credentials are claimed beyond the verifiable on-chain work in this repo; the contracts, deploy trail, and transparency dashboard are the evidence. Funding milestone 1 includes a third-party security review to cover the protocol-depth gap, and a named pilot circle plus organizer interviews are the first discovery deliverables once funded. No advisors, collaborators, or pilot partners are claimed today; that would be fabrication.

## Vision and ecosystem alignment

Salapi is aimed squarely at Stellar's stated priorities - **financial inclusion, remittance, payments, and consumer dApps in emerging markets.** The wedge is the informal savings circle (a behavior large numbers already practice), the hero is grassroots disaster relief, and the production endpoint is a licensed SEP-24 anchor bringing real peso and rupiah on and off ramps to the corridors Salapi targets (PH / ID / VN).

> **Affiliation note:** Salapi's disaster vault is *inspired by and aligned with* the transparency values of Stellar Aid Assist. It is an independent, community-side project and is **not affiliated with, endorsed by, or part of** the Stellar Development Foundation's Aid Assist program or the Stellar Disbursement Platform.

## Run it locally

The repo has two parts: the Soroban contracts (Rust) and the web app (Next.js).

**Contracts**

```bash
# build a single contract (note the hyphen in the crate name)
stellar contract build --package arisan-rooms

# build all workspace contracts
stellar contract build
```

`stellar contract build` is the supported path and produces the optimized wasm used in the deploy trail. (`cargo build --release --target wasm32-unknown-unknown` also compiles the crates but emits raw, non-post-processed wasm; prefer the Stellar CLI.) Requires the Rust toolchain, the `wasm32-unknown-unknown` target, and the Stellar CLI. Deploy/init scripts and the full transaction trail are in `DEPLOYMENTS.md` and `scripts/`.

**Web app**

```bash
cd web
npm install
npm run dev   # http://localhost:3000
```

Before `npm run dev`, create `web/.env.local` with the values the server layer needs (the repo does not ship an example file, and `.env.local` is gitignored):

- `PALUWAGAN_CONTRACT`, `SMARTSAVINGS_CONTRACT`, `ARISAN_ROOMS_CONTRACT` - the testnet contract IDs the app reads at runtime (the `disaster`, `username-registry`, and token SAC IDs are in `web/lib/server/stellar.ts`).
- The wallet-encryption secret used for AES-256-GCM custody, and the Supabase secrets for sessions.
- Optionally `SALAPI_SPONSOR_SECRET` to enable the opt-in gasless fee-bump path.
- Set `VERCEL_OBSERVABILITY_ENABLED=1` only after Vercel Analytics and Speed Insights are enabled for the project; it is intentionally off by default so local/early deployments do not load unavailable `/_vercel/*` endpoints.

See `SECURITY.md` for the security model and `DEPLOYMENTS.md` for the on-chain evidence trail.

## License

MIT. The Soroban contracts are open-source in this repository under the same license.
