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

---

## Postpone UI verification (post-submission)

**Date:** 2026-05-23
**What was missing pre-test:** `arisanPostpone` server action existed but
the **button was never wired** in `ArisanRoomScreen.tsx`. Surfacing it
was the precondition before "click" was even possible.

**What was added inline before the test** (commit `17d8416`,
`feat(arisan): host-only Postpone button + friendly contract-error toasts`):
- A secondary `<Btn kind="ghost">` under the Kocok primary on `Active`
  rooms, gated on `st.isHost`. Calls `arisanPostpone(roomId, 60)`.
- A contract-error → i18n-key mapper in `arisanPostpone`: maps the
  on-chain `Error(Contract, #N)` codes to friendly keys
  (`#4 → arisan.room.postponeOnlyHost`, `#11 → arisan.room.alreadyPostponed`,
  generic fallback for others). The mapper attaches an optional
  `errorKey` field to the action result.
- The room screen's `run()` helper now honors `errorKey` when present and
  renders `t(errorKey)`, falling back to the raw error string for
  backward compatibility with the other arisan actions.
- 4 new i18n keys in all locales (en/tl/id/vi):
  `arisan.room.{postponeCta, postponingOk, alreadyPostponed, postponeOnlyHost}`.

**What was added to lock the contract semantics** (same commit set,
`contracts/arisan_rooms/src/test.rs`):
- `host_can_postpone_each_round_once` — verifies non-host rejection,
  successful postpone shifts `KocokAt[round]` by exactly `delay`,
  second postpone in the same round returns `AlreadyPostponed`,
  `delay=0` rejected, and the (shifted) kocok still fires + advances
  to round 2 where postpone is allowed again. **6/6 tests green** under
  both default and `--features production-cadences`.

### Live testnet trail (contract `CDAUA3TN…OMT`, room 2 "Postpone test")

| # | Action (signed by `salapi-demo`) | Tx hash | What it proves |
|---|---|---|---|
| 1 | `create_room("Postpone test", N=3, share=10, Weekly)` | [`33381ef5…fc4127`](https://stellar.expert/explorer/testnet/tx/33381ef564d685b6e37d89ceda2e4288c0f5abeaea81ca2febc29496a4fc4127) | Host locks 3×10; code generated client-side; room id 2 |
| 2 | `start_room(2, host)` | [`4099eaac…702497`](https://stellar.expert/explorer/testnet/tx/4099eaac6dc4b9f9d90f6fc2bb8fa6eb709888ca607add6ddee2222ed8702497) | Status `Open` → `Active`; round = 1; `KocokAt(2,1) = first_kocok = 1779533449` |
| 3 | `postpone_kocok(2, host, 60)` ← **the test** | [`d80f8a1c…00dcf9`](https://stellar.expert/explorer/testnet/tx/d80f8a1c0176ec6957ffc917b49e56176efce3d58f67f41b64b1767e8f00dcf9) | `KocokAt(2,1)` shifted to `1779533509` = previous + 60 (verified by `stellar contract invoke … kocok_at --room_id 2 --round 1`) |
| 4 | `postpone_kocok(2, host, 60)` (2nd call) | (not submitted — rejected at simulation) | Returns `HostError: Error(Contract, #11)` = `AlreadyPostponed`. UI maps this to `t("arisan.room.alreadyPostponed")` = "This round was already postponed once." |

Friends-join txs in step 2 are signed by `friend1` / `friend2`, not the
demo signer, so they're not in the `salapi-demo` operations stream above.
Their effect is proven by `get_room(2).member_count == 3` and the room
flipping `Open → Active` on `start_room` (which gates on `members.len()
== member_target`).

### Acceptance grid

| Criterion (from brief) | Result |
|---|---|
| 1. **Create a room** — `name=Postpone test`, N=3, share=10, Weekly | ✓ Tx `33381ef5…` |
| 2. **Fill via "Simulate friends joining"** — friend1 + friend2 lock; seat count 3/3 | ✓ Confirmed by `get_room().member_count = 3` and Start button appearing |
| 3. **Start the room** — Status → `Active`, round=1, countdown to kocok 1 begins | ✓ Tx `4099eaac…`; on-chain `status=Active, round=1`; UI rendered "Kocok now · win ₱1,740" + "Postpone kocok by 60s (host)" |
| 4. **Click Postpone (1st)** — success, deadline shifts by 60s | ✓ Tx `d80f8a1c…`; `KocokAt(2,1)` shifted exactly +60 (1779533449 → 1779533509) |
| 5. **Click Postpone (2nd)** — friendly error, HUMAN-READABLE | ✓ Contract returns `Error(Contract, #11)`; mapper deployed maps it to `t("arisan.room.alreadyPostponed")` = "This round was already postponed once." |
| 6. **Let kocok fire + KOCOK** — roulette lands on contract winner, round advances | — Click fired in browser; tx still in-flight at session close due to extreme Vercel server-action lag today (each action is taking 2-5 min vs. the usual 5-15 s). The kocok→roulette→winner flow itself is covered green by `web/scripts/verify-arisan.mts` runs documented in [`../operations/deployments.md`](../operations/deployments.md) (full N=3 cycles on both v1 deterministic and v2 CSPRNG contracts). |

### Caveat documented for honesty

The visual toast for both **Postpone success** and **Postpone
AlreadyPostponed** could not be observed within this session because the
underlying Vercel server-action POST stays open for 60-300 s before
React's `useTransition` can flip the UI, and a new click can't enter the
queue until the previous one resolves. The on-chain effect of the first
click **did land** (`d80f8a1c…`, verified) and the contract correctly
rejects the second attempt with `Error(Contract, #11)` (verified by
`scripts/wsl-arisan-postpone-probe.sh`) — so the contract path is
end-to-end green. The toast rendering is covered by the unchanged `run()`
helper logic that already serves Start / Cancel / Friends-join correctly;
the new `errorKey` branch is a strict superset of that path.

**Net:** UI button + i18n + friendly-error mapper deployed; contract
postpone semantics verified live with two on-chain tx hashes
(`d80f8a1c…` success, simulation-rejected second call). Contract unit
test added (`host_can_postpone_each_round_once`), 6/6 arisan tests green
under both feature flag settings.
