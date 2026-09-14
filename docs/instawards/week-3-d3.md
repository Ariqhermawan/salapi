# Deliverable 3 — Disaster Vault authorization controls

Status: implementation, local regression checks, and isolated Testnet acceptance
verified on 14 September 2026 on `codex/week3-deliverable3`. Operational signer
selection and `salapi.app` cutover are pending; D3 is not yet fully complete.

## Scope and behavior

The `disaster` package replaces the legacy single-admin implementation with
an immutable constructor-configured set of exactly three distinct signers.
There is no `initialize`, signer replacement, WASM upgrade, direct `disburse`,
or single-admin `set_disaster` entrypoint.

1. A signer creates an immutable proposal: recipient/amount, pause, or unpause.
2. Two different signers explicitly approve that proposal. Proposing is not
   an implicit approval. Each call uses Soroban `require_auth()`.
3. Payouts wait 20 ledgers from the second approval. A third approval does not
   restart the timer. Any of the three authenticated signers may execute.
4. At execution, the contract reads its actual token balance and requires
   `executed_in_rolling_24h + proposed_amount <= floor(balance_now * 2000 / 10000)`.
   The exact window is `(execution_timestamp - 86400, execution_timestamp]`.
   Cap capacity is not reserved by proposal creation or approval.
5. The vault starts paused. Pause and unpause each require a proposal, two
   approvals, and execution; these controls have no payout timelock so that
   the quorum can respond promptly. Contributions remain available while paused.
6. Each pause/unpause transition increments a control epoch. Old control
   proposals cannot undo a later pause. Payout approvals survive a pause, but
   execution stays blocked until a fresh quorum-approved unpause.
7. Executed proposals cannot execute again. Privileged transitions emit
   `propose`, `approve`, `execute`, and `paused` events; initialization and
   contributions also emit events.

### Example (valueless Testnet XLM)

Start with 100 XLM in the vault and no recent payouts. A 10 XLM payout leaves
90 XLM. A second 10 XLM proposal fails: 10 + 10 exceeds 20% of 90 (=18).
A separately approved 8 XLM proposal can succeed at equality, leaving 82 XLM.
The cap is reevaluated for every execution, including proposals approved earlier.

## Application integration

- `/transparency` exposes real configuration, balance (including valid zero),
  current rolling allowance, paginated proposals, approvals, ledger wait,
  transaction receipts, and the active configured contract address.
- Logged-in members of the fixed signer set can propose, approve, and execute.
  The server loads only their existing encrypted wallet record, verifies its
  public key, and rejects missing sessions, missing records, demo fallback,
  and non-signer wallets. It never provisions a new wallet on a privileged path.
- Amounts remain decimal strings until the existing D1 integer conversion.
  Proposal IDs remain strings/bigints, including values above JavaScript's
  safe-number range.
- `DISASTER_CONTRACT` is the single server-side configuration for actions,
  public state, and `/docs`. Version 3, exactly three distinct signers, native
  Testnet XLM SAC, 2000 bps, and 20 ledgers must verify before actions are enabled.
  Missing or legacy configuration fails closed; there is no legacy fallback.
- Live events are a bounded view (up to 100 events in the preceding 720
  ledgers), not a permanent index or a complete 24-hour transaction archive.
  Public on-chain proposal state is authoritative. Evidence is archived separately.

## Reproducible acceptance checks

```bash
cargo test -p disaster --locked
cargo test --workspace --locked
stellar contract build --locked --package disaster
cd web
npm run test:disaster
npm run test:money
npm run test:arisan
npx tsc --noEmit
npm run build
```

Named Rust checks cover invalid signer initialization; two-of-three success;
below-threshold and duplicate approvals; authentication bound to the proposal;
pre/post timelock execution; aggregate rolling cap and exact expiry; paused
execution; quorum unpause; stale-control replay; double execution; balance
conservation; integer rounding; direct token donations; missing history failing
closed; immutable entrypoints; events and pagination.

The CI steps **D3 threshold, cap, timelock and pause controls** and
**D3 exact amounts and signer guards** expose these checks to reviewers.
The full workspace and existing D1/D2 regression suites also run.

### Recorded local results (14 September 2026)

| Check | Result |
| --- | --- |
| Disaster contract | 18/18 passed |
| Full Rust workspace | 42/42 passed, including the 18 disaster tests |
| D3 exact input/signer helpers | 5/5 passed |
| D1 money conversion | 5/5 passed; seeded guard rejection verified |
| D2 commitment encoding | 3/3 passed |
| Web E2E | 28/28 passed, including the opt-in live Testnet read |
| Type-check / lint | Passed; lint has 0 errors and 27 warnings |
| Production build | `npx next build --webpack` passed |
| WASM | Stellar CLI build passed, 14,336 bytes |

The E2E suite includes four **mocked-response UI tests**, three **real HTTP
unauthenticated-action rejection tests**, one **real Testnet public-read test**,
and 20 existing regression tests. Mocked signer UI results are not evidence of
authenticated multi-user on-chain execution. That live-app check remains pending.
Visual inspection also confirmed the local public page shows the real balance,
allowance, proposal states, and the evidence-only contract address.

The default local Turbopack build encountered Google Fonts download/TLS failures;
the Webpack production build completed using the same application source. CI
continues to run the standard `npm run build` on its clean runner.

To include the live-read E2E test, start the local production app with the
evidence-only ID as `DISASTER_CONTRACT` and a disposable demo read wallet, then run:

```bash
D3_E2E_CONTRACT=CDC3HBAQY53THCXWIVROPSGM745WELMZ3Z4Y2ATKEBFSFRCETG4SY35D npm run test:e2e
```

CI does not depend on mutable Testnet history: this opt-in test is skipped unless
`D3_E2E_CONTRACT` is supplied. The other seven D3 web checks run locally in CI.

## Testnet evidence and application cutover

The isolated acceptance exerciser is:

```bash
# From web/, after building the contract.
node --experimental-strip-types scripts/disaster-testnet.mts
```

It generates five funded Testnet wallets in memory, deploys the WASM with an
atomic constructor, and runs blocked/successful threshold, timelock, pause,
cap, and double-execution scenarios. It saves **public** transaction envelopes,
results, metadata, configuration, and the WASM checksum under `output/d3-testnet/`.
Private keys are neither printed nor saved. Simulation rejections are explicitly
identified as simulations, not fabricated transaction hashes.

**Do not use its evidence-only contract as the live app deployment.** Its
disposable signer keys are unavailable after the process exits.

### Public acceptance record

- [Evidence-only Testnet contract](https://stellar.expert/explorer/testnet/contract/CDC3HBAQY53THCXWIVROPSGM745WELMZ3Z4Y2ATKEBFSFRCETG4SY35D)
- [Public XDR and final-state archive](evidence/week-3-d3-testnet.json)
- WASM SHA-256: `5be00ffbdba59020da99724538691e0e4104203e8e9a5f3f68697851212b1a8f`
- 26 successful submitted transactions; 9 expected simulation rejections
  (not submitted transactions). Final state recorded at ledger `4669941`.

| On-chain scenario | Transaction |
| --- | --- |
| Atomic deployment with fixed signers | [Deploy](https://stellar.expert/explorer/testnet/tx/ab9d4eb740632599c11c2f1243ebb952f98b6e6208c21c53878ea467e758fa44) |
| Contribute 100 XLM while paused | [Contribute](https://stellar.expert/explorer/testnet/tx/945b329614cd7d22c6f5974c61391295342bb4b2343c4a0aae58a00ed0b8ee33) |
| Two approvals then unpause | [Unpause](https://stellar.expert/explorer/testnet/tx/ee09bbf199461476cca4b73ead03436b8d81af2f3ff1f79e478c8cf6cccf65ed) |
| Quorum pause | [Pause](https://stellar.expert/explorer/testnet/tx/2deba5751473f9e7aa2a437c1856888fe014b37ac7e35f0319aaa3e39b24fd96) |
| Fresh quorum unpause | [Resume](https://stellar.expert/explorer/testnet/tx/fd96ad31fed09aa91e72185ee2a5f532b4f724356691f1fd4764e048b46c640e) |
| 10 XLM payout after the timelock | [Payout](https://stellar.expert/explorer/testnet/tx/8120c9c2380e611849a970b3f527eecd5538a9ccf681b64aacb4ed4d3d1d0c3a) |
| 8 XLM payout at exact remaining allowance | [Exact-cap payout](https://stellar.expert/explorer/testnet/tx/5a18ae6b54a4bb96b73bddac134401c906fb13b013b396b6d9ad29c9fe66805b) |

The archive includes every approval transaction, signed transaction envelopes,
results, metadata, rejected simulation envelopes/errors, fixed signer addresses,
and the final six proposal records. It contains no private keys. Its 26 hashes,
signatures, successful result codes, and WASM checksum were independently
recomputed locally before publication. This is internal verification, not an audit.

After the 10 XLM payout, another approved 10 XLM payout was rejected because
`10 + 10 > 90 * 20%`. The 8 XLM payout succeeded because `10 + 8 = 90 * 20%`.
Final vault balance: **82 XLM**; spending in the preceding 24 hours: **18 XLM**;
current cap: **16.4 XLM**; remaining allowance: **0 XLM**. The 24-hour expiry
boundary was verified in deterministic Rust tests, not by waiting a full day
during this Testnet run.

The team must confirm three operational Testnet signer public addresses before
the live deployment. The addresses must match those users' existing Salapi
wallets if they will approve through the current managed-wallet UI.

```bash
export STELLAR_SOURCE=your-funded-testnet-cli-identity
export DISASTER_SIGNERS='["G...first...","G...second...","G...third..."]'
bash scripts/deploy-disaster-d3-testnet.sh
```

Then set the new ID as `DISASTER_CONTRACT` in Vercel Production/Preview and
redeploy. Verify that `/transparency` and `/docs` show the same ID and that
the signer accounts can complete the flow. The old vault's balances and
transactions do not move automatically; retain its deployment as historical.
No old-vault transfer or production alias change is performed by the script.

Pending completion evidence: confirmed operational signer set, live-app
cutover, authenticated multi-user browser E2E, public CI/PR links, and final
reviewer screenshots. Do not mark the entire SOW deliverable complete until
these have been verified.

## Security boundaries and self-review

- Testnet only; not a third-party audit, production readiness, or independently
  decentralized custody. Existing managed wallet keys remain server-custodied.
  A compromise of that custody service can compromise multiple signer keys.
- Two colluding signers can approve payouts within the implemented cap and
  timelock. The contract does not independently verify whether a real disaster
  exists or a recipient is legitimate.
- Losing access to two signers freezes privileged actions; signer rotation is
  intentionally unavailable. Never use unconfirmed or throwaway keys for the
  operational deployment.
- Configuration/proposals/history receive TTL extensions. Missing proposal or
  spending history fails closed and requires restoration, not reset to zero.
- Exact rolling history is pruned on payout and scanned linearly. This is a
  low-volume Testnet design, not a high-throughput production index.
- The 20-ledger delay is a ledger count, not a fixed number of seconds.
- Expected contract rejections must leave balances and proposal execution
  state unchanged. Failed or uncertain web submissions require a state refresh
  before a user retries.
