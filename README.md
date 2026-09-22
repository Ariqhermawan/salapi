# Salapi

**Trustless community money pools on Stellar.** Salapi is a crypto-invisible
wallet for peso/rupiah transfers, arisan and paluwagan savings circles, goal
savings, and transparent disaster relief across Southeast Asia.

> **Status: live Testnet preview.** The PWA and seven Soroban contract packages
> run on Stellar Testnet. There is no mainnet deployment, no real money, and no
> live user or revenue metric to report.

| Public entry point | Link |
|---|---|
| Live app | https://salapi.app |
| Reviewer documentation | https://salapi.app/docs |
| Transparency dashboard | https://salapi.app/transparency |
| Source repository | https://github.com/Ariqhermawan/salapi |

## Why Salapi exists

Arisan in Indonesia and paluwagan in the Philippines are familiar ways for
families and communities to save together. The weak point is usually the same:
one organizer holds the pot, keeps the ledger, and runs the draw. Late payment,
missing cash, favoritism, or an organizer disappearing can break the whole
circle.

Salapi moves the pool rules and accounting into Soroban contracts. A member
uses a familiar peso or rupiah interface; the underlying contribution, payout,
or draw produces a public Stellar receipt that anyone can verify.

## What is live

| Capability | Status |
|---|---|
| Send by `@handle` | Shipped on Testnet |
| Disaster-relief vault + public transparency page | Shipped on Testnet |
| Prefunded arisan / paluwagan circle with commit-reveal draw | Shipped on Testnet |
| Goal-based smart savings | Shipped on Testnet |
| Four locales and USD/PHP/IDR/VND display | Shipped |
| Exact integer money boundary | Shipped in Week 1 D1 |
| Disaster 2-of-3 approvals, rolling cap, timelock, pause/unpause | D3 implementation; live cutover tracked in the D3 report |
| Proof-gated donation campaigns with exact release/full refunds | D4 implemented and Testnet-verified; live acceptance tracked in the D4 report |
| Fiat on-ramp (GCash / QRIS / Xendit) | Roadmap |
| Mainnet deployment | Roadmap |

In the prefunded circle model, each member locks the full cycle obligation up
front. The contract can therefore enforce that late payment, default, and an
organizer absconding cannot drain an otherwise funded room. The draw uses
participant commitments followed by verified reveals; the transaction caller
cannot provide the winner or a random index.

## Why Stellar

- Low, predictable fees make small community contributions practical.
- Soroban holds the custody, draw, and accounting rules on-chain.
- The contracts accept a token address, so Testnet XLM can later be replaced by
  USDC or a regulated peso/rupiah asset without changing the vault primitive.
- SEP-24 is the planned standard path for a licensed PHP/IDR anchor; it is not
  shipped in the current preview.

## Architecture in one view

```text
PWA (Next.js) → server actions → Soroban RPC / Horizon → Stellar Testnet
                  validation       signing + contract calls
```

The application accepts a decimal string and display currency, validates it,
and converts it once to integer stroops. Contract calls receive only integer
`i128` token units; display formatting never becomes a contract argument.

The web layer uses `@stellar/stellar-sdk` 15.1.0. The Rust workspace uses
Soroban SDK 22. The seven contract packages are `base-vault`,
`username-registry`, `disaster`, `paluwagan`, `smart-savings`, and
`arisan-rooms`, and `donation-campaign`.

Contract IDs, explorer links, deploy hashes, and the full transaction trail are
kept in [`docs/operations/deployments.md`](docs/operations/deployments.md) and
summarized for reviewers at [salapi.app/docs](https://salapi.app/docs).

## Testnet honesty and security boundaries

- Testnet XLM has no real-world value and is not funds under management.
- User wallets are custodial testnet wallets; secrets are AES-256-GCM encrypted
  at rest. A shared demo wallet is used only when no session is present.
- Contracts are currently immutable and have no admin rotation or upgrade
  entry point.
- D4 records separate campaign escrows, proof-bound 2-of-3 approvals and
  full donor-claimed refunds. Its immutable creator share is not a platform fee.
  D3/D4 authenticated controls never use the shared anonymous demo wallet.
- D3 adds contract-level 2-of-3 approval, a rolling cap and timelock. Its
  operational signer set and live-app cutover must be verified separately;
  the historical single-admin contract is not D3 evidence. Independent key
  custody and an external audit remain prerequisites for real-value use.
- The commit-reveal draw still has documented last-revealer and predictable
  no-reveal fallback trade-offs; see `SECURITY.md` before any mainnet use.
- No third-party security audit, fiat anchor, or mainnet pilot is claimed.

The detailed security model is in [`SECURITY.md`](SECURITY.md).

## Roadmap

1. Complete D3 operational cutover/evidence and independent security review.
2. Integrate a SEP-24 anchor sandbox and verify PHP/IDR test transactions.
3. Run a deliberately small mainnet pilot after security, custody, and
   compliance review.

These are roadmap items, not current product claims.

## Run locally

The repository contains Soroban contracts and a Next.js web app.

```bash
# Web app
cd web
npm install
npm run dev       # http://localhost:3000
```

Create `web/.env.local` with the Testnet contract IDs (`PALUWAGAN_CONTRACT`,
`SMARTSAVINGS_CONTRACT`, `ARISAN_ROOMS_CONTRACT`, `DISASTER_CONTRACT`) and server secrets
(`SALAPI_DEMO_SECRET`, `WALLET_ENC_KEY`, and the Supabase values). Set
`NEXT_PUBLIC_SITE_URL` when deploying under a different origin. Never commit a
secret file.

D4 defaults to the verified public Testnet deployment recorded in the D4 report.
Set `DONATION_CAMPAIGN_CONTRACT` only to deliberately override it with another
compatible deployment. This public ID does not require a new wallet encryption
key or changes to existing users' wallets.

For contract work, install Rust, the `wasm32-unknown-unknown` target, and the
Stellar CLI, then run:

```bash
stellar contract build
cargo test --workspace --locked
```

## Public evidence

- Week 1 D1 report: [`docs/instawards/week-1-d1.md`](docs/instawards/week-1-d1.md)
- Week 2 D2 report: [`docs/instawards/week-2-d2.md`](docs/instawards/week-2-d2.md)
- D3 controls, tests, and deployment status: [`docs/instawards/week-3-d3.md`](docs/instawards/week-3-d3.md)
- D4 release/refund controls, raw receipts and self-review: [`docs/instawards/week-4-d4.md`](docs/instawards/week-4-d4.md)
- Deployment and transaction trail: [`docs/operations/deployments.md`](docs/operations/deployments.md)
- Security model: [`SECURITY.md`](SECURITY.md)
- Reviewer guide: https://salapi.app/docs

## License

MIT. The Soroban contracts and web application are open source in this
repository.
