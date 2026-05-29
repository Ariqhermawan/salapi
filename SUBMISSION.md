# Salapi — Stellar PH / AIBC 2026 submission

> Copy-paste source for the submission form. Every claim here is verifiable
> on-chain or in the live app — keep it that way (honesty spine).

---

## One-liner

**Salapi is a trust layer for Southeast Asian money — a crypto-invisible
peso/rupiah wallet where every transaction has a public receipt on Stellar.**
It looks like GCash or Dana. Underneath, it's verifiable by default.

---

## The problem (one paragraph)

Trust in SEA money movement is broken architecture, not one bad actor. Cak
Budi raised Rp 1.7B from 30M followers and was never charged. Indonesia's
biggest charity ACT (30M donors) was caught skimming in 2022. The Philippines
lost ₱545B in flood-relief funds in 2025. The common failure: money moves
through a human who promises to be trustworthy. **Salapi removes the need to
trust the human — the contract holds the pot, and anyone can check.**

---

## The solution

A consumer wallet with **no crypto words, no seed phrase, one Google login** —
pesos and rupiah on every screen. Every action settles on Stellar (Soroban),
so every donation, savings circle, and transfer carries an independently
verifiable public receipt. **Crypto-invisible to the user; verifiable by
default to anyone.**

---

## What is LIVE on day 30 (verifiable now)

- **Live PWA:** https://salapi-blond.vercel.app  (installable, multi-locale
  en/tl/id/vi, multi-currency USD/PHP/IDR/VND)
- **Five feature contracts on Stellar testnet**, on a shared `base-vault`
  primitive — every call is a real on-chain transaction (not a unit test),
  evidenced on stellar.expert. The in-app **`/transparency`** page lists the
  canonical live contract IDs with explorer links:

  | Contract | Testnet ID |
  |---|---|
  | disaster relief (hero) | `CCKQ3UVBZ75KSZDO6IPA5U6PFARJG4PLRGN2SAIW5RAGQ6K4B7ZDWBUZ` |
  | username-registry | `CDDINUQXTF6SHZN2ZJ36IT7P4YOJ3OZN3H6LTYHVCQ35YYO7YTAWM4G3` |
  | paluwagan (ROSCA) | `CCXNSK6IGPSB4QGUSNB2EFZWYV53NKVX5AV3XSJANCDDD7TULGQSY37X` |
  | smart-savings | `CBQBUAOP3T235Q2U63XNC2NQVNAOXQL2KHWALO6FTIOJS46NTKIZJ5WI` |
  | arisan-rooms | see `/transparency` (current build) |
  | base-vault (primitive) | `CBC6BTKW5VA6Y2XH6WP4IEPWDZ7TBPYSIIOZQMTEH62N62NFT4F4VYDD` |

  Explorer: `https://stellar.expert/explorer/testnet/contract/<ID>`

- **Five end-to-end flows demonstrated on-chain** (username send, disaster
  contribute→disburse, paluwagan full-round rotation, smart-savings goal +
  deposit, arisan multi-round draw) — each with a stellar.expert tx link in
  `DEPLOYMENTS.md`.

---

## How it works (tech)

- **Frontend:** Next.js (App Router) PWA + React, inline-styled kit, design
  tokens. Installable, offline-aware, safe-area-correct.
- **Identity & custody:** Supabase auth (Google SSO) + per-user custodial
  Stellar wallet, secret encrypted at rest with AES-256-GCM. Users never see
  keys — that's the crypto-invisible promise.
- **Chain:** Soroban smart contracts in Rust. Reads simulate (no signature);
  writes sign + submit + poll. Native XLM SAC for value transfer.
- **Honest randomness:** the arisan/paluwagan winner is recorded on-chain via
  a contract call. The testnet preview uses a CSPRNG-at-edge draw (the Soroban
  footprint trap rules out `env.prng()` for transfer destinations) — see the
  honesty note below.

---

## Honest framing (non-negotiable)

- **Day-30 = LIVE on testnet.** Everything above is real and checkable today.
- **Beyond day 30 = explicitly labeled preview / Build-Award**, never claimed
  as ready: licensed fiat anchors (GCash on/off-ramp is sandbox-labeled today),
  mainnet migration, DAO/AI-tribunal governance for disaster disbursement.
- **Arisan draw trust model:** today's draw is operator-run CSPRNG, honestly
  framed as such; **commit-reveal or VRF is the planned v2 trust upgrade**
  (documented in `DEPLOYMENTS.md` and `SECURITY-CONTRACT-HARDENING.md`).
- No fabricated balances, tx hashes, or pool figures anywhere.

---

## Why it's big

- **370M** people across the Philippines and Indonesia.
- **~$53B/yr** diaspora remittance into the two markets (World Bank/KNOMAD 2024).
- The ceiling is every economy where institutions are weak — donations,
  disaster funds, savings circles, government welfare. That's a trust layer,
  not a single app.

---

## Team

- **M. Ariq Hermawan** — Founder & CEO. Repeat fintech founder (catatu.app),
  5-yr cash-economy SME operator (EL Barbershop). Product + Indonesia GTM.
- **Edwin Farrel Juniawan** — Co-Founder & CTO. 8+ production SaaS shipped
  across US/CA/AU/UK; "Insurer AI of the Year" (Ask Ellie) on Salapi's core
  stack (Next.js + Supabase). Owns engineering + Soroban contracts.
- **Steve Jimenez** — Co-Founder & CMO. PH web3 operator; SEA Lead at EveryX
  (same company as Ariq); Co-Founder IMPACTph. Philippines GTM + ecosystem.

---

## The ask

Raising **US$200K on a SAFE** for: (1) mainnet migration in ~90 days,
(2) licensed anchor partnerships in PH + ID, (3) first 10,000 verified users
across two pilot cities.

---

## Links

- Live app: https://salapi-blond.vercel.app
- Transparency / live contracts: https://salapi-blond.vercel.app/transparency
- Pitch deck: (Google Drive — final 10-page version)
- On-chain evidence: `DEPLOYMENTS.md` (every flow, every tx link)

---

## Final pre-submission checklist

- [ ] **Deck:** confirm the Google Drive copy is the **final 10-page** version
      (founders slide 10 with photos + corrected bios; Edwin = "Next.js +
      Supabase", no "Stripe"). Re-upload if the Drive copy is stale.
- [ ] **Demo video** recorded (screen-record the 5 live flows on the PWA).
- [ ] **Submission form** filled using the sections above.
- [ ] **Links** all resolve (live app, /transparency, deck, repo).
- [ ] (Pre-mainnet, not blocking submission) merge PR #1 (contract hardening
      P2–P5) as part of the deliberate redeploy — see
      `SECURITY-CONTRACT-HARDENING.md`.
