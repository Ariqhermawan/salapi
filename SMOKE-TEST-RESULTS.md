# Salapi — Pre-mainnet Smoke Test Results

**Date:** 2026-05-23
**Build under test:** post-Arisan-Rooms v2 (CSPRNG) + production-cadences
feature flag (`c821b80`). Live at `salapi-blond.vercel.app`.
**Method:** HTTP status sweep via `curl`, then DOM/text sweep via the
Claude_in_Chrome extension across 4 locales (en, tl, id, vi) and 4
display currencies (USD, PHP, IDR, VND). Console logs read after each
page load. Small bugs fixed inline in the same session; bigger items
deferred at the bottom with a one-line repro.

Legend: `✓` works · `⚠ <note>` works with caveat · `✗ <bug>` broken.

---

## Routes matrix (HTTP)

| Route | Status |
|---|---|
| `/` | `200` ✓ |
| `/vaults` | `200` ✓ |
| `/send` | `200` ✓ |
| `/activity` | `200` ✓ |
| `/settings` | `200` ✓ |
| `/settings/language` | `200` ✓ |
| `/settings/currency` | `200` ✓ |
| `/paluwagan` | `200` ✓ |
| `/savings` | `200` ✓ |
| `/transparency` | `200` ✓ |
| `/circles` | `200` ✓ |
| `/circles/tino-relief` | `200` ✓ |
| `/circles/tino-relief/donate` | `200` ✓ |
| `/circles/tino-relief/manage` | `200` ✓ |
| `/circles/ate-mei-dialysis` | `200` ✓ |
| `/circles/arisan-banjir-jakarta` | `200` ✓ |
| `/circles/barangay-library` | `200` ✓ |
| `/circles/ofw-family-tuition` | `200` ✓ |
| `/arisan` | `200` ✓ |
| `/arisan/new` | `200` ✓ |
| `/arisan/join` | `200` ✓ |
| `/topup` | `200` ✓ |
| `/withdraw` | `200` ✓ |
| `/receive` | `200` ✓ |
| `/offline` | `200` ✓ |
| `/learn` | `200` ✓ |
| `/you/kyc-tier` | `200` ✓ |
| `/signin` | `200` ✓ |
| `/onboarding` | `200` ✓ |

29 / 29 routes return `200`.

## Locale matrix (visual sweep, key screens)

For each locale, switched via `localStorage.setItem('salapi_locale', …)`
+ matching `salapi_locale` cookie, then navigated and read DOM text.

| Screen | en | tl | id | vi |
|---|---|---|---|---|
| Home — greeting, balance, vault tiles, action grid | ✓ "Hi 👋" | ✓ "Kumusta 👋" | ✓ "Halo 👋" | ✓ "Xin chào 👋" |
| Home — Disaster Relief Pool figure | ✓ $22.32 | ✓ ₱1,294.50 | ✓ Rp 357.103 | ✓ ₫569.134 |
| Home — vault rail labels | ✓ Paluwagan/Smart savings/Send by @ | ✓ Paluwagan/Ipon/Padala @ | ✓ Arisan/Nabung/Kirim @ | ✓ Chơi hụi/Tiết kiệm/Gửi @ |
| Home — circles strip category badges | ✓ DISASTER RELIEF / MEDICAL / EDUCATION | ✗ → ✓ FIXED — was English-bleed-through, now i18n-keyed | ✗ → ✓ FIXED | ✗ → ✓ FIXED |
| Settings — section labels (You, Accounts, Preferences, Security, Help, Legal) | ✓ | ✓ | ✓ | ✓ |
| Settings — language switcher (Tagalog · Filipino · PHP, etc.) | ✓ | ✓ | ✓ | ✓ |
| Paluwagan — round chip, Live pulse, pot, share, members | ✓ | ✓ | ✓ | ✓ |
| Savings — goal hero, percentage, allocator | ✓ | ✓ | ✓ | ✓ |
| Transparency — pool total, status, disburse gate, verifiable trail | ✓ | ✓ | ✓ | ✓ |
| Transparency — "Contracts powering Salapi" lists all 6 (base/username/disaster/paluwagan/smart_savings/arisan_rooms) | ✓ | ✓ | ✓ | ✓ |
| Circles — list, cause cards, "Begin" CTA | ✓ | ✓ | ✓ | ✓ |
| Circle detail (tino-relief) — raised, goal, story, donate CTA | ✓ | ✓ | ✓ | ✓ |
| Arisan — list, "Verify · Arisan Rooms" demo room renders | ✓ Pratinjau chip · 3/3 · Done · Pot $51.72 | ✓ | ✓ | ✓ Bản xem trước · Rp 827.586 |
| Arisan/new — name, members stepper, share input, cadence picker | ✓ | ✓ | ✓ | ✓ |
| Arisan/join — 6-char code input | ✓ | ✓ | ✓ | ✓ |
| Send | ⚠ tab title was generic "Salapi, crypto-invisible…" → FIXED (added `metadata` to `/send/page.tsx`) | ✓ | ✓ | ✓ |
| Receive | ⚠ tab title generic + no per-route title → FIXED (split into server `page.tsx` + `ReceiveScreen.tsx`) | ✓ | ✓ | ✓ |
| Offline — "You're offline / Reconnect to use Salapi…" | ✓ | ✓ | ✓ | ✓ |

⚠ VI on Home shows `ĐANG CHẠY` twice consecutively (eyebrow `home.liveToday` and the pulse `home.liveNow` both translate to "Đang chạy"). It's not a bug — both phrases legitimately map to the same Vietnamese word — but visually redundant. Could be polished by making one say "Hôm nay" or "Mới nhất". Deferred to a copy pass with a native speaker.

## Currency matrix (visual sweep)

Switched via `localStorage.setItem('salapi_currency', …)`, sampled the key
money figures on each screen.

| Currency | Symbol | Home balance | Paluwagan pot | Disaster pool | Arisan pot | Notes |
|---|---|---|---|---|---|---|
| USD (en default) | `$` | ✓ $2,113.15 | ✓ $25.86 | ✓ $22.32 | ✓ $51.72 | 2 dp |
| PHP (tl default) | `₱` | ✓ ₱122,554.20 | ✓ ₱1,500 | ✓ ₱1,294.50 | ✓ ₱3,000 | 2 dp · en-PH grouping |
| IDR (id default) | `Rp ` | ✓ Rp 33.808.055 | ✓ Rp 413.793 | ✓ Rp 357.103 | ✓ Rp 827.586 | 0 dp · id-ID dot-thousand |
| VND (vi default) | `₫` | ✓ ₫53.881.588 | ✓ ₫659.483 | ✓ ₫569.134 | ✓ ₫1.318.966 | 0 dp · vi-VN dot-thousand |

No NaN / undefined artifacts on slow loads (race tested by reload-spam,
no race). The illustrative-rate disclaimer reads accurately
("≈ $2,113.00") in every locale.

## Flow matrix (testnet)

| # | Flow | Result |
|---|---|---|
| 1 | Top-up sandbox (`/topup` GCash path) | ✓ — Friendbot-funded balance increments and the toast confirms |
| 2 | Send by username (`/send`) | ✓ — see Week-2 trail (`a07c6a6c…1e239`) |
| 3 | Paluwagan: payMine + friendsPay + collect | ✓ — see Week-2 trail (`62fcc4e6…5e0c8`, `4193926c…11d9f`) |
| 4 | Smart Savings open + deposit | ✓ — see Week-2 trail (`a08d121c…318fd`, `41a904c3…2a18a`) |
| 5 | Disaster contribute (`/transparency` → Donate) | ✓ — see Week-2 trail (`14c46d1e…7ae69`) |
| 6 | Arisan Rooms full N=3 prefund cycle | ✓ — `verify-arisan.mts` PASS on `CDAUA3TN…OMT` (demo, CSPRNG): create → friends join → start → 3 kocoks → Done, balance 0 |
| 7 | Arisan postpone (one allowed, second rejected) | — covered by contract-level invariant: `postpone_kocok` checks `delay <= MAX_POSTPONE_SECONDS` and an `AlreadyPostponed` flag is set per round (see `lib.rs`). Not exercised end-to-end via UI this pass. |
| 8 | Arisan cancel while Open (locks refund) | ✓ — covered by unit test `host_can_cancel_open_room_and_refund_all` (5/5 green under both feature flags) |

## Quality matrix

| Check | Result |
|---|---|
| Console clean on every screen visited | ✓ — `read_console_messages` filtered to `error\|Error\|warning\|Hydration\|404\|500` returned no messages on `/`, `/settings`, `/paluwagan`, `/savings`, `/transparency`, `/send`, `/vaults`, `/arisan`, `/offline` |
| Offline screen renders cleanly when navigated to | ✓ — "You're offline / Reconnect to use Salapi. Your money is safe on-chain." |
| All 6 contracts present in Transparency's "Contracts powering Salapi" rail | ✓ — base-vault, username-registry, disaster, paluwagan, smart-savings, arisan-rooms |
| Reduced motion (`prefers-reduced-motion: reduce`) | — deferred (no direct toggle exposed via the Chrome MCP); the kocok `useCountUp` already gates on `window.matchMedia('(prefers-reduced-motion: reduce)').matches`, so the framework support exists. Manual confirm during a DevTools pass at Lighthouse-time. |
| PWA install prompt | — deferred to Stream 4 (Lighthouse fix-pack) |

---

## Fixes applied inline this session

1. **`web/components/CirclesHomeStrip.tsx`** — was importing the static
   English `CATEGORY_LABEL` from `web/lib/circles/types.ts`. Replaced with
   `t(CATEGORY_LABEL_KEY[c.category])` to match the convention used by
   `CircleDetailScreen.tsx`, `CirclesCreateScreen.tsx`, and
   `CirclesDiscoverScreen.tsx`. All 6 category labels exist in all 4
   locales (`circles.cat{Disaster,Medical,Education,Family,Creator,Community}`).
2. **`web/app/send/page.tsx`** — added `export const metadata = { title: "Send · Salapi" };`
   so the browser tab is no longer the generic site title.
3. **`web/app/receive/page.tsx` + `web/components/screens/ReceiveScreen.tsx`** —
   split the `"use client"` component out of the route file so the route
   can carry a server `metadata` export. Behavior unchanged; only the tab
   title is fixed.

## Deferred — file at the bottom for next pass

- **Vaults — Disaster pool sometimes reads `Rp 0` on cold load.** The
  `readRetry` polyfill in `web/app/actions.ts` already catches degraded
  reads and re-tries 4× with backoff, but the IDR/VND conversion on a
  very small XLM tail can land at zero after rounding. Repro: load
  `/vaults` cold under IDR display currency a few times. Proposed fix:
  treat sub-1-stroop reads as degraded (same predicate as the disaster
  retry) inside `arisanList` / `paluwaganState` callers that share the
  Vaults page's RPC burst.
- **VI Home — `ĐANG CHẠY` appears twice in a row.** Eyebrow
  (`home.liveToday`) and pulse (`home.liveNow`) both render to the same
  Vietnamese word. Not wrong, just visually redundant. Proposed fix:
  change `home.liveToday` to "HÔM NAY" (literally "today") for
  contrast with "ĐANG CHẠY" ("running") in the pulse.
- **`prefers-reduced-motion` and PWA installability** — picked up by the
  Lighthouse fix-pack (Stream 4).
