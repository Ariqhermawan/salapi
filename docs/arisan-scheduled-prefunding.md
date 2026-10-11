# Scheduled, fully prefunded Arisan candidate

This adds a separate days-based Testnet contract candidate. It neither upgrades
nor migrates the deployed legacy and installment contracts. Configure its ID as
`ARISAN_SCHEDULED_CONTRACT`; leave `ARISAN_ROOMS_CONTRACT` and
`ARISAN_INSTALLMENTS_CONTRACT` unchanged. Testnet tokens have no monetary value.

## Agreement and funding

The host and every invited member review the fixed number of seats, share per
round, full-cycle obligation, funding deadline, interval and first draw date.
Joining reserves a seat without transferring tokens. Members can make several
explicit contributions, but Start requires every seat to be filled, every
member to have paid exactly `member_target * share`, and the attributed room
pool to equal `member_target * member_target * share`. Another room's balance
cannot satisfy this gate. No later installments are needed after Start.

`first_draw_at` is the earliest time a member may finalize the first payout,
not an automatic payment promise. The commitment cutoff precedes it by the
reported reveal window. Start preserves the agreed dates and must occur before
the funding deadline and first commitment cutoff. Scheduled rooms reject host
postponement. Before Start, leaving and cancellation preserve the existing
exact-actual-contribution refund rules. After the funding deadline, deposits and
Start are rejected, while cancellation remains available.

## ABI and isolated storage

Existing `create_room` and `create_installment_room` ABIs, the serialized `Room`
layout, `installments_version() == 1` and `installment_contract_info` remain.
New entry points are:

```rust
create_scheduled_room(
    host: Address,
    code: Symbol,
    name: String,
    member_target: u32,
    share: i128,
    interval_seconds: u64,
    first_draw_at: u64,
    funding_deadline: u64,
) -> Result<u32, Error>

scheduled_version() -> u32 // 1
scheduled_contract_info() -> Result<ScheduledContractInfo, Error>
scheduled_room_info(room_id: u32) -> Result<RoomSchedule, Error>
initialize_scheduled(token: Address) -> Result<(), Error>
scheduled_only() -> bool
```

`RoomSchedule` is stored only at the appended `DataKey::RoomSchedule(room_id)`:

```rust
RoomSchedule {
    version: u32, // 1
    interval_seconds: u64,
    first_draw_at: u64,
    first_commit_at: u64,
    funding_deadline: u64,
}

ScheduledContractInfo {
    version: u32, // 1
    token: Address,
    min_interval_days: u32, // 1
    max_interval_days: u32, // 365
    first_commit_window: u64,
    reveal_window: u64,
    max_first_draw_delay: u64,
    max_funding_window: u64,
}
```

The schedule getter returns `NotFound` for unscheduled rooms. The existing
`Room.cadence` is only a compatibility field: 30 days maps to `Monthly`, all
other scheduled intervals map to `Weekly`. Clients must use the schedule getter
to display or validate custom intervals. `get_room`, `get_members`,
`funding_state`, `kocok_at`, `reveal_at` and `draw_phase` keep their ABIs.

A fresh scheduled deployment must use `initialize_scheduled`, which appends an
immutable `ScheduledOnly` instance flag. `scheduled_only()` must return true
before its ID is enabled. On that deployment the retained public `create_room`
and `create_installment_room` ABIs reject without creating a room or charging
tokens. Scheduled creation uses a private shared helper, not a public bypass.
The original `initialize` retains mixed/legacy compatibility; reinitialization
cannot change its mode. Capability DTOs remain unchanged. Scheduled names must
be 1..120 UTF-8 bytes, nonempty and trimmed, with no Unicode control characters
or angle brackets. Scheduled invite codes use exactly six characters from
`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, and share is at most
10,000,000,000,000,000 stroops. The isolated deployment accepts only classic
G-address hosts and joining members; old initialized deployments retain their
Address-compatible behavior. These bounds prevent direct contract calls from
creating terms the supported web reader cannot safely process.

## Bounds and production-cadences build

- Interval is an exact multiple of 86,400 seconds, inclusive 1..365 days.
- Funding deadline is strictly future, at most 30 days from creation.
- `first_commit_at = first_draw_at - reveal_window`.
- `first_commit_at >= funding_deadline + first_commit_window`.
- `first_draw_at <= now + max_first_draw_delay`, where the maximum is the
  funding window plus first commit and reveal windows.
- All creation arithmetic, including the last planned round and emergency
  refund grace, is checked before the room is created or funded.

The `production-cadences` build reports a one-day minimum first commitment
window and a six-hour scheduled reveal window. A one-day scheduled interval
therefore leaves 18 hours for normal next-round commitments after an on-time
finalization. Unscheduled rooms keep their original compiled reveal window.
The default demo build reports shorter protocol windows and is not the
artifact intended for this deployment.

Later deadlines follow the agreed interval from the previous planned cutoff,
not the time finalization was submitted. A late finalization can shorten or
entirely miss the next commitment window. The contract does not invent a new
date or guarantee automatic finalization; participants or an operator must
submit the existing commit/reveal/finalization transactions.

If the next commitment window has already passed when the preceding round is
finalized, the next round is in Reveal or, if its reveal deadline also passed,
already Finalizable. With no valid reveal, the existing fallback still pays one
fixed pot to an unwon member. A room member can submit further overdue rounds
until Done; each member still wins only once and the pool reaches zero.
Alternatively a member can emergency-dissolve after the current planned reveal
deadline plus grace and refund unwon allocations. These are member-signed
operations, not permissionless operator payouts. Catch-up/refund tests cover
both paths and retain the original agreement timestamps. This protects the
available settlement paths, not unpredictable randomness or punctual payment.

## Rent maintenance and known limits

The schedule key, room accounting and draw keys use a 30-day-ledger target and
21-day-ledger renewal threshold. Instance and whole WASM code use a separate
7-day-ledger target and 6-day-ledger threshold. These values assume roughly
five-second ledgers, are clamped to the network maximum and do not reduce an
already longer TTL. Renewing an instance also rents the whole WASM code, so
extending everything to the network maximum can exceed the fee field itself.
Funding/draw operations and permissionless `keepalive_room` apply this bounded
policy. The native asset contract owns the pooled token-balance entry and renews it to its own
30-day ledger TTL when the room keeper calls its balance getter. There is no
timer inside the contract. The external repository keeper is described below;
a simulated read does not submit renewal.

Long gaps, including the 365-day interval, require submitted keepalive
transactions before expiry. Use a DAILY submitted keeper for the short code
TTL and bounded incremental code rent, not a single weekly renewal. Monitor
actual ledger TTL, measured fees and successful receipts. A multi-day outage
can make the next code renewal exceed the normal fee cap even before archival;
the operator must alert and perform explicitly bounded TTL recovery rather
than silently raising the cap. The room-data horizon alone is not sufficient
to promise liveness. If entries have already archived, restore the archived
room/code/asset entries and the pooled
asset balance before invoking the operation. Persistent archival is not a
refund or intentional fund destruction, but recovery costs and an operational
restoration path remain deployment obligations. Do not claim unattended
year-long liveness. The local suite advances both ledger sequence and time
through 365 days with a daily keeper and verifies retained schedule and escrow.

The no-reveal fallback is the existing predictable context hash. Its residual
last-revealer influence and predictable fallback are not fixed here. These
contracts are not a guarantee of fair randomness and must not hold real money
on the strength of these tests. Done retains history and does not start another
cycle automatically.

## Build and verification handoff

From this checkout's repository root, with a functioning pinned Rust toolchain:

```sh
cargo test -p arisan-rooms --lib --locked
cargo test -p arisan-rooms --lib --locked --features production-cadences
cargo fmt -p arisan-rooms -- --check
stellar contract build --locked --package arisan-rooms \
  --features production-cadences --out-dir /absolute/isolated/artifacts
```

`scheduled_generated_abi` exports `SCHEDULED_SPEC_HEX` from actual macro-generated
Soroban specification entries for independent web-encoder verification. The
older `INSTALLMENT_SPEC_HEX` export remains unchanged.

Deploy a new contract only, call `initialize_scheduled` with the native Testnet
XLM asset, then verify `scheduled_only() == true`, the on-chain WASM hash and
both capability DTOs before enabling
creation. No invocation may replace the IDs used by existing rooms. Check the
signed creation receipt against all eight scheduled arguments, then verify
three independent wallets through free join, partial contributions, blocked
Start, full Start, normal commit/reveal/payouts and exact cancellation refunds.
Local host tests and browser fixtures are not that independent-wallet gate.

## Implemented external daily keeper and its operational limits

The repository includes a secret-protected server worker and a GitHub Actions
workflow scheduled every 15 minutes on a best-effort basis. It processes one
durable rent job per run, due daily, using the operational Testnet signer.
Separate private maintenance records track confirmed keepalives, leases,
pending hashes and exact recovery envelopes. Notification `last_checked_at`
is not proof of submitted renewal. Cursor-based contract discovery scans at
most two new rooms per run and supplements confirmed-creation registration.

The 7/6-day code policy prevents rent on calls above its threshold, but a weekly
single renewal may cost more than the normal fee cap. The worker requires the
exact configured scheduled-only contract and a fresh unsigned room/funding
read. It handles Open and Active rooms, including expired Open rooms awaiting
cancellation. Its durable signer lease serializes writes to avoid sequence
races. Each operation is simulated with a total 5 TestXLM fee cap; above-cap
rent and archived state are refused for explicit operational review. It submits
only `keepalive_room(room_id)`, never loads member signing keys, and never
invokes Start, cancellation, commit, reveal or finalization.

A pending hash and exact signed recovery envelope are persisted before send.
Unknown acceptance must be reconciled before a new transaction is created.
Renewal is recorded only after a successful ledger receipt. Retry failures on
a later run, alert before the shorter code TTL expires, and explicitly escalate
archived-entry recovery. Simulation, HTTP success and notification reads are
not submitted renewal. Actual Testnet rent must be measured, not called free.

This bounded worker is not unlimited-scale maintenance: it needs working
secrets, migrations, workflow dispatch, signer funding and backlog monitoring.
The 365-day proof is a local ledger/time simulation with daily maintenance,
not 365 days of observed live operation. Deployment and operational evidence
must be verified separately before making availability claims.
