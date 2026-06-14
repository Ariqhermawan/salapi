# Security & Design Tradeoffs

Salapi is a **testnet preview / grant-stage prototype**. It runs on the Stellar **test network**; the "pesos" and "rupiah" shown in the UI are a cosmetic display layer over valueless testnet XLM. Nothing here custodies real money. This document states the deliberate tradeoffs so they are read as conscious design, not as undiscovered bugs, and lists what must change before any mainnet / real-value deployment.

## Secrets

- All real secrets live only in gitignored files (`web/.env.local`), never committed. This was verified by a full git-history secret scan (all commits, branches, and tags) before this repo was made public: no API keys, private keys, Stellar secret seeds, or service-role keys appear anywhere in the tree or history.
- Only `web/.env.example` (placeholders) is committed.

## Custodial wallet model (crypto-invisible)

- An authenticated user (Supabase session) gets their **own** custodial testnet wallet: generated on first use, Friendbot-funded, and stored **AES-256-GCM encrypted at rest** (random IV per record, auth-tag verified on decrypt). Users never see a key or seed phrase. This is the "crypto-invisible" design.
- With no Supabase env or no session, the signer falls back to **one shared demo wallet** so the public demo works without sign-in. This is intentional, testnet-only, and not how an authenticated user's funds are handled.
- Once a user is authenticated, a failed wallet decrypt deliberately **throws** rather than silently falling back to the demo signer (which would misattribute funds).
- The demo "friends" helpers (used to animate paluwagan / arisan circles in the public demo) sign with **throwaway testnet keypairs** held only for the demo. Before any value-bearing deployment they must be gated behind a demo flag or removed.

## Randomness (arisan / lottery draw)

- The draw is a **two-phase sealed on-chain PRNG**: `seal_kocok` draws a seed via Soroban's `env.prng()` and stores it under a fixed `Seal(room_id, round)` key (so the seed cannot change the transaction footprint), then `kocok` derives `winner = unwon[seed % unwon_len]` deterministically. The result is fixed before the paying transaction and is identical in simulation and execution, so **no ordinary caller, not even the server, can pick the winner**, and the unwon-pool construction guarantees distinct winners and exact fund conservation.
- **Caveat:** `env.prng()` is seeded deterministically from ledger / transaction-set data, so the draw is **not unbiasable by a validator** who can influence the seed source or transaction ordering, combined with whoever lands the seal transaction first. This is a fairness/ordering bias, not a fund-loss risk.
- **Mainnet plan:** replace `env.prng()` with a commit-reveal scheme across members or an external VRF.

## Disaster-relief vault

- The public disaster-relief pool is intentionally scaled large on testnet (~$2M of testnet value) to demonstrate the transparency dashboard. It is guarded by a **single admin key** that can toggle the disaster flag and disburse from the pool, with no per-transaction cap, timelock, or multisig yet. This is a deliberate day-30 simplification; the DAO / multi-signer "AI Tribunal" governance is the Build-Award roadmap.
- **Mainnet plan:** move the admin to a Stellar multisig or multi-admin scheme, add a per-disbursement cap and/or a short timelock between activating a disaster and the first disbursement, and emit a distinct high-value event.

## Contract upgradeability

- The contracts are currently **immutable**: no `set_admin` / `transfer_admin` and no WASM upgrade entry point. A lost admin key cannot be rotated. This is an intentional simplicity/immutability tradeoff for the prototype.
- **Mainnet plan:** for value-bearing contracts, decide explicitly between (a) keeping them immutable as a security feature, or (b) adding guarded admin rotation + upgrade behind a multisig.

## Web application security

- Per-request **nonce-based CSP** with `strict-dynamic` (no `script-src 'unsafe-inline'`), plus HSTS, `X-Frame-Options: DENY`, `nosniff`, a strict `Referrer-Policy`, and a locked-down `Permissions-Policy`. The static `/landing` route keeps its own scoped CSP.
- Every server action **re-validates input** on the server (amounts, usernames, codes) because server actions are reachable by direct POST; the client gate is never trusted.
- No `dangerouslySetInnerHTML`; all `target="_blank"` links carry `rel="noopener noreferrer"`; the OAuth callback has an open-redirect guard.

## Before mainnet / real value (hardening checklist)

1. Call `extend_ttl` on the persistent entries each round depends on, across all contracts, sized past the real cadence, and add a long-horizon TTL test.
2. Replace `env.prng()` with commit-reveal or an external VRF for the draw.
3. Move the disaster admin to multisig + per-disbursement cap + timelock.
4. Gate or remove the demo "friends" helpers.
5. Add on-chain min/max length and charset validation to username register/rename.
6. Do peso to stroop money-math in integer/bigint space (avoid floating point).
7. Add rate limiting to public write endpoints (e.g. the circles waitlist).

## Responsible disclosure

This is a testnet prototype with no real funds at risk. If you find a security issue, please open a private report rather than a public issue.
