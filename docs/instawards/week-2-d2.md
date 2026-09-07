# Instawards Week 2 — Deliverable 2

## Manipulation-resistant commit-reveal draw

Status: implementation in progress on `codex/week2-deliverable2`.

Salapi's arisan draw uses a participant commit-reveal protocol. Every eligible
member fixes a secret before anyone can see the other secrets, then reveals it
in a later window. The contract combines valid reveals and selects the winner
without accepting a caller-supplied winner or random index.

## Protocol

For every active room round, the contract exposes three time-based phases:

1. **Commit** — each member who has not won submits one 32-byte commitment.
2. **Reveal** — a committer submits the corresponding 32-byte secret.
3. **Finalizable** — after the reveal deadline, any room member can complete
   the round.

The commitment is:

```text
SHA-256(
  ScVal(Address(contract_id)).XDR
  || ScVal(U32(room_id)).XDR
  || ScVal(U32(round)).XDR
  || ScVal(Address(participant)).XDR
  || ScVal(Bytes(secret_32)).XDR
)
```

These five XDR values have fixed sizes for the accepted types: 40, 8, 8, 44,
and 40 bytes respectively, making the commitment preimage exactly 140 bytes.
Binding the contract, room, round, and participant prevents a valid reveal
from being replayed in another deployment, room, round, or wallet.

The managed-wallet application derives a stable 32-byte secret with
HMAC-SHA-256 from the participant's signing secret and the same deployment,
room, round, and participant context. The secret stays off-chain during the
commit phase and can be recovered after a page refresh without adding a new
secret database.

## Winner derivation and timeout rules

- Valid secrets are combined in the contract's immutable roster order.
- If at least one eligible member reveals, only revealers are eligible to win
  that round. A non-revealer remains unwon and may participate next round.
- If nobody reveals, the contract hashes immutable round context and selects
  from all unwon members. This fallback is deliberately deterministic so a
  missing reveal cannot lock the prefunded pool.
- Every successful finalization pays exactly `member_count * share`, records
  one new winner, and advances the round. After the final round, the room is
  `Done` and the prefunded contract balance is zero.

The demo Testnet build uses a 30-second reveal window. The long-cadence
Testnet build uses a 24-hour reveal window. Both variants are compiled from
the same source with the existing `production-cadences` feature flag.

## Rejections covered

- duplicate commitment;
- duplicate reveal;
- reveal without a commitment;
- reveal whose secret does not match its commitment;
- cross-round replay;
- cross-deployment replay;
- commit or reveal outside its phase;
- actions by non-members or members who already won.

## Threat model and residual limitations

The protocol prevents an administrator, transaction caller, or single
participant from directly supplying the winning member or changing a secret
after committing it. Contract and round binding prevent commitment reuse.

It does **not** provide formally proven randomness. A last revealer can see
earlier revealed secrets and choose not to reveal. Per-round forfeiture makes
that choice costly because the member cannot win that round, but it does not
eliminate all strategic influence. If nobody reveals, the liveness fallback
is publicly predictable; it exists to release funds and advance the cycle,
not to claim unpredictability. Validator ordering, compromised managed-wallet
keys, and endpoint availability remain outside this contract's guarantees.

## Acceptance evidence

Before this report is marked complete it will include:

- two fresh Testnet contract IDs (demo and long-cadence);
- a normal three-member commit-reveal-finalize transaction trail;
- a timeout transaction trail with at least one non-revealer;
- CI output for duplicate, cross-round, and cross-deployment rejection tests;
- a full-cycle zero-residual test and transaction trail;
- contract events and Stellar Explorer links;
- the application-orchestration pull request.
