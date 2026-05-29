# Arisan / Paluwagan draw — trust design (P1)

The one real CRITICAL from the security audit: `arisan_rooms::kocok` takes a
caller-supplied `winner_idx` and only bounds-checks it. `require_auth()` proves
the caller is *a* member, so **a member calling the contract directly can pass
their own index and win every round.** Through the app this is masked (the
server draws the index with a CSPRNG), but the contract itself is not
tamper-resistant.

This doc picks the path forward. It is a **design decision**, not a mechanical
fix — do not rush it into the demo redeploy.

---

## Why the obvious fixes don't work (the footprint trap)

The winner is a **token-transfer destination**. Soroban computes a
transaction's storage/data **footprint during simulation**, then re-runs during
execution and **traps if execution touches anything not in the simulated
footprint**.

- `env.prng()` returns *different values* in simulation vs execution. If it
  drove `winner_idx`, simulation would compute (and declare the footprint for)
  one member; execution would pick a different member whose ledger entries
  aren't in the footprint → **trap "outside the footprint."**
- A ledger-seeded pick inside `kocok` (`env.ledger().sequence()` / `timestamp()`)
  has the **same problem** — the value differs between simulate and execute.

That is exactly why the current design pushes `winner_idx` to the client: the
index is a fixed argument, so simulation and execution agree on the destination.
The cost is that the client (or a direct-calling member) controls it.

---

## The key insight: commit-reveal **resolves** the footprint trap

The trap only bites when the random value is produced *inside* the kocok call.
If the entropy is **committed in an earlier transaction** and merely **revealed
as fixed arguments** in the kocok transaction, then at kocok time `winner_idx`
is computed from **inputs that are constant for that tx** → simulation and
execution see the same seeds → same winner → same footprint. **No trap, and the
caller can't choose the outcome.**

So commit-reveal is not just "more secure" — it's the design that is *both*
footprint-safe *and* tamper-resistant.

---

## Options

### (A) Honest custodial CSPRNG — RECOMMENDED for the mainnet candidate
Keep today's model: the Salapi server draws `winner_idx` with
`crypto.getRandomValues` and submits `kocok`. Salapi already custodies keys and
calls the contract, so the realistic trust boundary is "the operator draws
fairly."
- **Make it honest in UI + pitch:** the draw is operator-run, not a trustless
  VRF. Optionally publish, per round, `commitment = sha256(seed)` *before* the
  draw and the `seed` after — so anyone can verify the operator didn't grind.
- **Contract change:** none (or just store the published commitment for audit).
- **Effort:** ~zero. **Trust:** custodial, but transparent and verifiable
  after the fact. Correct posture for a v1 with a custodial wallet model anyway.

### (B) Commit-reveal with multi-party entropy — the v2 trust upgrade
Trustless within the member set. Sketch:

```
// new persistent state per (room, round):
//   Commit(room, round, member) -> BytesN<32>   // sha256(seed_i)
//   Reveal(room, round, member) -> BytesN<32>   // seed_i
//   CommitCount(room, round), RevealCount(room, round)

pub fn commit_seed(env, room_id, member, hash: BytesN<32>) -> Result<(),Error>
    // member.require_auth(); must be an unwon member; round must be in COMMIT phase;
    // one commit per member per round; store hash; bump CommitCount.

pub fn kocok(env, room_id, caller, reveals: Vec<(Address, BytesN<32>)>) -> Result<Address,Error>
    // caller.require_auth() + membership.
    // require all committed members present in `reveals`;
    // for each: assert sha256(seed_i) == Commit(member); store Reveal.
    // seed = sha256(concat(sorted seed_i));           // canonical order
    // pool = unwon members (sorted deterministically);
    // winner_idx = u32::from_be_bytes(seed[0..4]) % pool.len();
    // pay pool[winner_idx]; mark won; advance round.
```

- **Tamper-resistance:** each `seed_i` is locked at commit time. The last
  revealer already committed theirs, so they can't grind — with ≥2 honest
  committers the result is unbiased. ✓
- **Footprint:** `reveals` are fixed args in the kocok tx → deterministic
  winner → deterministic destination → no trap. ✓
- **Liveness risk:** a committed member who refuses to reveal stalls the round.
  Mitigations (pick one): (i) reveal deadline → after it, derive `seed` from the
  revealed subset (requires ≥1 honest revealer; acceptable for a friends-circle
  ROSCA); (ii) skip/penalize non-revealers next round. Must be specified + tested.
- **UX cost:** two phases (commit window, then reveal/kocok). The app can
  auto-commit a fresh random `seed_i` per member at round start (still
  crypto-invisible — the user just sees "round opening"), and auto-reveal at
  kocok. So the 2-phase flow can stay invisible to users.
- **Effort:** real — new state, two entrypoints, phase machine, liveness rule,
  a full test suite (commit→reveal→pay, grind-resistance, missing-reveal
  timeout). Plus the server actions for commit/reveal. A focused work-package,
  not a one-liner.

### (C) VRF via BLS12-381 host functions
Soroban exposes BLS12-381 ops. A VRF gives verifiable randomness from a single
proof, but needs a VRF keyholder — which reintroduces trust unless it's a
threshold/distributed key. Cryptographically heavier than a friends-circle
ROSCA warrants. **Not recommended** unless Salapi later needs large, anonymous,
adversarial circles.

---

## Recommendation & path

1. **Mainnet candidate → ship (A).** Add the per-round published
   commitment/seed for after-the-fact auditability, and state plainly in UI +
   pitch that the draw is operator-run (honest custodial). Zero footprint risk,
   matches the custodial wallet model, deployable now.
2. **v2 trust milestone → implement (B) commit-reveal**, auto-committed /
   auto-revealed by the app so it stays crypto-invisible. This is the
   "trustless draw" headline upgrade. Scope it as its own PR with the liveness
   rule decided up front and a full test matrix.
3. **(C) only** if the product later moves to large adversarial circles.

> Do not couple (B) to the hackathon redeploy. The honest framing in (A) is
> defensible today; (B) is a roadmap item, not a blocker.
