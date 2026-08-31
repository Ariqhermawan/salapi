# Instawards Week 1 — Deliverable 1

This page is the committed money-path inventory and evidence index for D1.
Deliverable 2 (commit-reveal specification and threat model) is intentionally
out of this branch and is not represented as completed work.

## Baseline

- Repository: [Ariqhermawan/salapi](https://github.com/Ariqhermawan/salapi)
- Baseline tag: [`instawards-salapi-baseline`](https://github.com/Ariqhermawan/salapi/releases/tag/instawards-salapi-baseline)
- Baseline commit: `bf3df4e8dcfdaeef71df681010ac57302047c7ca`
- Existing public app: [salapi.app](https://salapi.app) on Stellar Testnet
- Existing capability: managed testnet wallets, @username transfer, disaster
  contributions, Paluwagan, Smart Savings, Arisan Rooms, and public on-chain
  receipts. The baseline contracts already use integer `i128` amounts and
  release overflow checks; D1 hardens the application boundary only.

## Money-path inventory

`IN` means a value can enter a contract or is the exact conversion immediately
before that call. `OUT` means display, preview, or sandbox bookkeeping that
does not move pooled value on-chain.

| Module / path | Decision | Reason |
|---|---|---|
| `contracts/base-vault/src/lib.rs` | IN | Stores and transfers token amounts as validated `i128`; no floating point. |
| `contracts/disaster/src/lib.rs` | IN | `contribute`/`disburse` and the conservation total are integer `i128` paths. |
| `contracts/paluwagan/src/lib.rs` | IN | Fixed share and round pot are integer `i128` values enforced by the contract. |
| `contracts/smart-savings/src/lib.rs` | IN | Goal target, saved balance, deposits, and withdrawals are integer `i128`. |
| `contracts/arisan_rooms/src/lib.rs` | IN | Share, locked pot, payouts, and refunds are integer `i128`; the existing full-cycle test ends at zero. |
| `contracts/username-registry/src/lib.rs` | OUT | Resolves names to addresses and never holds a money amount. |
| `web/lib/money.ts` | IN | Single exact boundary: decimal string + currency → deterministic integer stroops. |
| `web/lib/server/stellar.ts#getNativeBalance` | IN | Parses Horizon’s decimal XLM string into stroops without floating point before balance use. |
| `web/lib/server/stellar.ts#stroopsToPesos`, `fmtPeso` | OUT | Reverse conversion is presentation-only; it never becomes a contract argument. |
| `web/app/actions.ts` (`sendByUsername`, `disasterContribute`, `smartSavingsOpen`, `smartSavingsDeposit`, `arisanCreate`) | IN | Validates the shared money payload and passes only `sc.i128(integer_stroops)` to contracts. |
| `web/components/SendForm.tsx`, `SendScreen.tsx` | IN | Sends the raw input string and selected currency to the server boundary. |
| `web/components/screens/TransparencyScreen.tsx` | IN | Sends a raw donation string and currency; local numbers remain display state only. |
| `web/components/screens/SavingsScreen.tsx` | IN | Sends raw goal/deposit strings; local envelope allocations are separate UI state. |
| `web/components/screens/ArisanCreateScreen.tsx` | IN | Sends the raw share string and currency to `arisanCreate`. |
| `web/scripts/exercise-flows.mts`, `verify-arisan.mts` | IN | Evidence scripts call the same server actions with the exact payload shape. |
| `web/lib/ui/currency.ts`, `Wallet.tsx`, `ui/kit.tsx` | OUT | Formats balances and labels for humans; no contract invocation. |
| `web/lib/savings.ts` | OUT | Splits a local UI envelope after a confirmed deposit; the contract receives the single exact amount. |
| `web/lib/circles/*` and Circles screens | OUT | Preview/waitlist data; no live contribution or contract transfer in this scope. |
| `web/components/screens/TopUpScreen.tsx`, `WithdrawScreen.tsx` | OUT | Testnet Friendbot/anchor simulations; no amount is transferred to a contract. |

## D1 checks

Run from the repository root unless noted:

```bash
cargo test --workspace --locked
cargo build --workspace --target wasm32-unknown-unknown --release --locked
cd web && npm run test:money && npx tsc --noEmit
node scripts/check-money-path.mjs --seeded-violation
node scripts/check-money-path.mjs
```

The named CI job is [`money-path-integrity`](../../.github/workflows/ci.yml).
It proves the guard can fail on a seeded `Number()` conversion, scans the
inventoried boundary, and runs the exact conversion/conservation tests.

Public evidence:

- [Pull request #3](https://github.com/Ariqhermawan/salapi/pull/3) — post-baseline D1 changes
- [Green CI run 33364284156](https://github.com/Ariqhermawan/salapi/actions/runs/33364284156) — all three jobs passed

No contract was redeployed for D1: the inventory found no contract-side
change was necessary. The pull request remains open for review; Deliverable 2
is not part of this PR.
