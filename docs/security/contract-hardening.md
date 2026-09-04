# Salapi — Contract Hardening Plan (pre-mainnet)

**Status:** the 6 Soroban contracts are **live on TESTNET** and back the hackathon
demo. This document is the **mainnet-prep** remediation plan. Nothing here is
applied or deployed yet — applying it means: edit source → `cargo test` (in a
Rust-capable Linux/WSL env) → `stellar contract build` → redeploy → rewire env
→ re-evidence. **Do not rush this before the demo submission** (redeploy changes
contract IDs and can break the working testnet demo).

The deployable **TypeScript** fixes from the same audit are already **merged to
`main` and live** (`6ebe3e6`): open-redirect guard, fail-closed signer,
decrypt-guard, amount validation, username length cap, kocok winnerIdx sentinel,
self-send guard. This file covers only the **contract** items.

---

## Why this couldn't be implemented + tested in the audit session

`cargo test` cannot link on the dev machine: the native Windows GNU toolchain
(`x86_64-w64-mingw32-gcc`) hits `ld: error: export ordinal too large` because of
soroban-sdk's exported-symbol count. WSL has the `stellar` CLI but no `cargo`.
The contracts **compile** (`cargo check` / wasm build are fine) — only the
native test-binary **link** fails. Money-handling contract changes must be
**run through `cargo test`** before redeploy, so they belong in a Rust-capable
environment (Linux box, CI, or WSL with rustup installed), not staged untested.

---

## Audit corrections (verified against the code — severity downgrades)

Two findings the automated reviewers rated CRITICAL/HIGH are **not** real,
confirmed by reading the code:

1. **"Unchecked i128 arithmetic → silent overflow / fund corruption."**
   FALSE. The workspace `Cargo.toml` already sets `[profile.release]
   overflow-checks = true`. On overflow the contract **traps and the whole tx
   reverts** — same safety outcome as `checked_*`. Adding `checked_*` only
   upgrades a generic trap into a typed `Error` (nicer UX), it is **not** a
   security fix. → Severity LOW / optional polish.

2. **"CEI ordering violations (state written after token transfer) → reentrancy."**
   Moot here. Soroban transactions are **atomic** (a failed transfer traps and
   reverts all state), and the standard SAC `transfer` has **no recipient
   callback**, so there is no reentrancy window. Salapi controls the token at
   init. → Reordering gives ~zero real benefit and risks "round advanced but
   transfer reverted" confusion (also moot under atomicity). **Skip.**

These are recorded so nobody "fixes" non-issues and destabilises working code.

---

## P1 — `arisan_rooms::kocok` winner selection is caller-controlled (CRITICAL, real)

**File:** `contracts/arisan_rooms/src/lib.rs` (`kocok`, ~L421-509).
**Issue:** `winner_idx: u32` comes from the caller; the contract only
bounds-checks (`winner_idx >= pool.len()` → `InvalidParams`) then
`pool.get(winner_idx)`. `caller.require_auth()` only proves the caller is *a*
member. So **a member calling the contract directly can pass their own pool
index and win every round.**

**Why it's built this way (do not naively "fix" with `env.prng`):** the winner
becomes a token-transfer **destination**. Soroban's `env.prng()` returns
different values in simulation vs execution; if that drove the destination, the
member chosen at execution might not be in the footprint computed at simulation
→ trap *"outside the footprint."* The client-supplied-index pattern was chosen
specifically so simulation and execution agree on the destination. A
ledger-seeded in-contract pick (`ledger().sequence()` etc.) has the **same**
footprint problem.

**Through the Salapi app this is mitigated** — `arisanKocok` server action draws
the index with `crypto.getRandomValues` (CSPRNG) server-side, so an app user
cannot pick the winner. The hole is a **member bypassing the app and calling the
contract directly.**

**Options (pick deliberately — this is real protocol work, must be tested):**

- **(A) Honesty-framed custodial draw (cheap, matches the custodial model).**
  Salapi already custodies keys and the server already calls `kocok`. Accept
  that the draw is *server-run CSPRNG*, and make the UI/pitch **honest** that the
  draw is operator-run (not trustless VRF). Optionally publish the CSPRNG
  seed/commitment per round for after-the-fact auditability. **No contract
  change.** Lowest risk; correct if the product is honest about it.

- **(B) Commit-reveal with unpredictable entropy (trustless-ish, real work).**
  Host commits `H = sha256(seed)` at round start (before the kocok window).
  At kocok, host reveals `seed`; contract checks `sha256(seed) == H`, then
  `winner_idx = (seed ⊕ mixed_entropy) % pool.len()`. A single committer can
  still grind `seed` unless mixed with a value they could not predict at commit
  time — combine **multiple members' commits**, or mix with a ledger value
  revealed only after commit. Must also ensure the footprint covers all
  candidate destinations. Non-trivial; needs careful design + thorough tests.

- **(C) VRF via the BLS12-381 host functions.** Strongest, most work.

**Recommendation:** ship **(A)** for the mainnet candidate (honest custodial
draw + published commitment), and treat **(B)/(C)** as a v2 trust upgrade. Do
not block mainnet on a rushed commit-reveal.

---

## P2 — `paluwagan::initialize` accepts duplicate members → permanent deadlock (MED)

**File:** `contracts/paluwagan/src/lib.rs` (`initialize`, L40-57).
**Issue:** `members` is stored as-is. A duplicate address can only fill one
`Paid(round, addr)` slot, so `PaidCount` can never reach `members.len()` →
`payout` is never callable → the circle is permanently stuck and pre-funded
contributions are trapped until/unless an exit path exists.

**Fix (additive):** add an error variant and a uniqueness check.

```rust
// in `enum Error`
DuplicateMember = 7,

// in initialize(), after the amount/len check:
let n = members.len();
for i in 0..n {
    let a = members.get(i).unwrap();
    for j in (i + 1)..n {
        if members.get(j).unwrap() == a {
            return Err(Error::DuplicateMember);
        }
    }
}
```

**Test to add (run in a Rust env):** `initialize` with a duplicated address
returns `Err(DuplicateMember)`; the existing happy-path tests (unique members)
still pass.

---

## P3 — `username-registry` has no length/charset validation → homoglyph phishing (MED)

**File:** `contracts/username-registry/src/lib.rs` (`register` L30, `rename` L60).
**Issue:** `username: String` is unvalidated on-chain. Empty, 500-char, or
Unicode-homoglyph names (`@salapi` vs Cyrillic `@ѕаlapi`) are distinct on-chain
but visually identical → a lookalike can intercept username-addressed funds.

**App side is already mitigated live** (`registerUsername`/`renameUsername`
sanitize to `[a-z0-9_]` and now cap length 3–32). This closes the **direct
contract-call** path.

**Fix (additive):** add an error + a shared validator; call it in `register`
and `rename`.

```rust
// in `enum Error`
InvalidUsername = 4,

// helper (module-level fn, not on the contract impl):
fn valid_username(s: &String) -> bool {
    let len = s.len();
    if len < 3 || len > 32 { return false; }
    let mut buf = [0u8; 32];
    s.copy_into_slice(&mut buf[..len as usize]); // len<=32 guaranteed above
    for i in 0..len as usize {
        let c = buf[i];
        let ok = (b'a'..=b'z').contains(&c) || (b'0'..=b'9').contains(&c) || c == b'_';
        if !ok { return false; }
    }
    true
}

// register(): after require_auth, before the taken/registered checks:
if !valid_username(&username) { return Err(Error::InvalidUsername); }
// rename(): validate new_username the same way before the taken check.
```

**Test to add:** rejects uppercase / non-`[a-z0-9_]` / len<3 / len>32; accepts a
normal handle. Confirm existing tests use only valid handles (else update them).

---

## P4 — `paluwagan::payout` is callable by anyone (MED, anti-grief)

**File:** `contracts/paluwagan/src/lib.rs` (`payout`, L102-138).
**Issue:** no auth/membership check. The recipient is deterministic (fixed by
round) so funds **can't be redirected**, but any account can trigger payouts at
unexpected times and burn fees. Low severity; harden by requiring the caller be
a member.

```rust
pub fn payout(env: Env, caller: Address) -> Result<Address, Error> {
    caller.require_auth();
    let members: Vec<Address> = env.storage().instance()
        .get(&DataKey::Members).ok_or(Error::NotInitialized)?;
    if !members.iter().any(|m| m == caller) { return Err(Error::NotMember); }
    // ... unchanged ...
}
```

**Note:** this changes the `payout` signature → the server action
(`paluwaganCollect`/equivalent) must pass the caller address. Coordinate the TS
change with the redeploy.

---

## P5 — `disaster::disburse` has no per-tx cap; admin key is fixed forever (MED)

**File:** `contracts/disaster/src/lib.rs` (`initialize` L41, `disburse` L97-134).
**Issue:** a compromised admin can drain the pool in one call; a lost admin key
freezes the pool forever (no admin transfer). Relief-fund centralisation risk.

**Fix (additive):**
- Add an optional `max_disburse_per_tx` set at init (or via an admin setter);
  in `disburse`, `if amount > max { return Err(Error::AmountTooLarge); }`.
- Add a two-step admin transfer: `propose_admin(new)` (admin-auth) writes a
  `PendingAdmin`; `accept_admin()` (pending-auth) promotes it. Avoids a single
  fat-finger handing off control.

Both are additive and testable; design the storage keys + errors, add tests.

---

## P6 — TTL bumps on long-running ROSCAs (LOW-MED, mainnet longevity)

**Files:** `arisan_rooms` + `paluwagan` persistent storage.
**Issue:** persistent entries (`Room`, `Members`, `Won`, `KocokAt`, `Paid`,
`PaidCount`, `RoomByCode`) are never `extend_ttl`'d. A monthly 20-member ROSCA
runs ~20 months; entries could be evicted mid-cycle and brick the room. Not a
demo issue (testnet cadence is seconds) — matters for mainnet.

**Fix:** on every read/write of a persistent entry, call
`env.storage().persistent().extend_ttl(&key, low_watermark, high_watermark)`
with a TTL sized to the room/circle lifecycle. Apply consistently; add a test
that advances the ledger and confirms entries survive.

---

## Redeploy runbook (do in a Rust-capable env; test-gated)

1. **Pre-gate:** `cargo test` for the whole workspace must be **green** in a
   Linux/WSL env with rustup (the native Windows GNU link bug blocks tests on
   the dev box). Do not deploy on a red or unrun suite.
2. `stellar contract build` (per the existing WSL/stellar-cli flow) → fresh
   `.wasm` per changed contract.
3. `stellar contract deploy` each changed contract → **new contract IDs**.
4. **Rewire** `web/.env.local` *and* Vercel encrypted env: update
   `PALUWAGAN_CONTRACT`, `DISASTER_CONTRACT`, `ARISAN_ROOMS_CONTRACT`,
   `USERNAME_REGISTRY_CONTRACT`, etc. to the new IDs. (Unchanged contracts keep
   their IDs.)
5. Update any TS that changed signatures (e.g. P4 `payout(caller)`).
6. Update `DEPLOYMENTS.md` + `/transparency` contract list with new IDs.
7. Re-run all 5 day-30 flows on testnet and re-capture stellar.expert evidence.
8. Only then consider mainnet.

**Order suggestion:** P2 + P3 first (smallest, additive, highest signal:
deadlock + homoglyph), then P4/P5, then P6, then decide P1 (A vs B/C).
