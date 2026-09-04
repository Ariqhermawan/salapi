# Salapi — Demo Video Script & Shot-List

Target: a **~3-minute** pitch demo of the live PWA (`salapi-blond.vercel.app`).
Voice matches the deck: *"The money moves. The trust does not. Until now."*
**Honesty spine:** show the TESTNET / sandbox chips — don't hide them. They're
the credibility, not a flaw.

---

## Pre-record setup (do once)

- **Device frame:** record a phone viewport (~390×844). Use Chrome DevTools
  device mode or a phone mirror. Portrait.
- **Clean state:** use an Incognito window (avoids stale manifest/cache from
  earlier sessions) and a fresh demo account, OR a pre-seeded demo wallet.
- **Fund the wallet:** run the in-app sandbox top-up (`/topup`) so the balance
  is non-zero before you record (Friendbot-funded on testnet).
- **Second tab ready:** open `stellar.expert/explorer/testnet` — you'll cut to
  it for the proof beat.
- **Locale/currency:** set the locale + display currency you want on screen
  (PHP or IDR) in `/settings` beforehand.
- **Capture:** 1080×1920 or 1440p, 30fps, system audio off, clean VO track.

---

## MAIN CUT (~3:00)

### 1 · Hook — 0:00–0:18
- **On screen:** Salapi cold-open / home, balance visible.
- **VO:** "Across Southeast Asia, money moves — but trust doesn't. Cak Budi
  raised 1.7 billion rupiah and was never charged. The Philippines lost 545
  billion pesos in flood relief. The problem isn't one bad actor — it's that
  money flows through someone you have to trust."

### 2 · Crypto-invisible reveal — 0:18–0:45
- **Action:** tap **Sign in with Google** → land on the wallet. Pan the balance
  shown in **pesos/rupiah**. Scroll the home screen.
- **VO:** "Salapi looks like GCash or Dana. One Google login. Pesos and rupiah
  on every screen. No crypto words. No seed phrase. The user never touches a
  key — but everything underneath settles on Stellar."

### 3 · Hero flow — Disaster relief — 0:45–1:25
- **Action:** go to the **Disaster Relief** vault (`/circles`). **Contribute**
  a small amount → show the success + the public-receipt framing. Point out the
  pool total updating.
- **VO:** "Here's the difference. I donate to a relief pool. The contract holds
  the money — not an organizer. The pool total, every contribution, every
  payout: a public receipt anyone can check. Cak Budi becomes impossible."

### 4 · SEA-native — Paluwagan / Arisan — 1:25–2:05
- **Action:** open **Paluwagan** (`/paluwagan`) **or** **Arisan** (`/arisan`).
  Show members + the round. Trigger the rotation/draw (pay share → collect, or
  run a kocok round). Show the pot moving to the winner.
- **VO:** "This is paluwagan — a rotating savings circle. Everyone pays in, the
  whole pot rotates by an on-chain rule. The contract picks and pays the
  recipient. Kontrak yang pegang pot — bukan bandar. No organizer can run off
  with it."

### 5 · The magic — send by username — 2:05–2:25
- **Action:** `/send` → send to a **@username** (not an address). Show success.
- **VO:** "And sending money? Just a username. No wallet addresses, no QR
  gymnastics. It feels like any e-wallet."

### 6 · THE PROOF — 2:25–2:55  *(the differentiator — don't skip)*
- **Action:** open **`/transparency`** → tap a contract (e.g. the disaster
  vault) → **cut to the stellar.expert tab** showing the real transactions +
  events on Stellar testnet. Linger on a tx hash.
- **VO:** "None of this is a mock. Five contracts, live on Stellar testnet.
  Every flow you just saw is a real transaction — here it is on the public
  explorer. Crypto-invisible to the user. Verifiable by anyone. That's the
  whole idea."

### 7 · Close — 2:55–3:10
- **On screen:** the closing slide (deck slide 9/10) or the app + URL overlay.
- **VO:** "Salapi. A trust layer for Southeast Asian money. Live today at
  salapi-blond.vercel.app. We're raising to take it to mainnet. Thank you."

---

## What to keep honest on screen
- Leave the **TESTNET** chip visible — say "live on Stellar testnet."
- `/topup` & `/withdraw` are **sandbox-labeled** (real anchors = Build-Award);
  if you show them, say "sandbox today — licensed anchors at mainnet." Don't
  imply live GCash cash-in/out.
- Don't show any screen implying fiat is moving for real yet.

---

## Appendix — all 5 live flows (exact steps, for a longer cut or B-roll)

Each is a real on-chain tx — cross-reference [`../operations/deployments.md`](../operations/deployments.md) for the matching
stellar.expert link if you want to show the receipt for that specific action.

1. **Send by username** — `/send` → enter `@handle` + amount → confirm.
   (contract: username-registry resolve + XLM SAC transfer)
2. **Disaster relief** — `/circles` → open the relief vault → **Contribute** →
   (admin) **disburse** while a disaster is active. (contract: disaster)
3. **Paluwagan** — `/paluwagan` → pay your share → when all paid, **Collect**
   rotates the pot to the round's recipient. (contract: paluwagan)
4. **Smart-savings** — `/savings` → **open a goal** (target) → **deposit** →
   watch progress toward the goal. (contract: smart-savings)
5. **Arisan** — `/arisan` → **create a room** (members, share, cadence) →
   join → **start** → **kocok** each round; the winner is recorded on-chain and
   the pot transfers. (contract: arisan-rooms)

> Note on the draw (if asked): the kocok winner is recorded on-chain via the
> contract; the testnet preview uses an operator CSPRNG draw (honest custodial
> model). Commit-reveal / VRF is the planned v2 trust upgrade — say so plainly
> if a judge probes it.

---

## Editing notes
- Keep cuts tight; 3:00 is a ceiling, not a target — 2:30 is fine.
- The **proof beat (Scene 6) is the moment that wins** — give it room, let the
  explorer load, show a real hash. That's what no template fintech demo can do.
- Add captions/subtitles (mobile-muted viewing).
- Lower-third the contract IDs or the `/transparency` URL during Scene 6.
