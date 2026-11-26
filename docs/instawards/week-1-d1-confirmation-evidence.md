# Week 1 D1 Transaction Confirmation Evidence

The D1 implementation began in commit `2275dae0ec5f5fe059838ebe20a58032fd53567b`. The local checks below ran on 26 November 2026. Staging acceptance requires the Supabase migration and signed-in Stellar Testnet checks. [Implementation commit](https://github.com/Ariqhermawan/salapi/commit/2275dae0ec5f5fe059838ebe20a58032fd53567b)

## What changed

Salapi prepares an unsigned Stellar Testnet transaction when a signed-in user reviews a username transfer or campaign action. The review shows the transaction details and maximum network fee. The user confirms the prepared transaction in the app. The confirmation is tied to that user's wallet and action, expires after two minutes, and can be used once.

Before signing, the server checks the reviewed transaction and verifies the recipient or the relevant campaign state again. This covers sending by username and creating a campaign, donating, submitting proof, approving proof, releasing funds, claiming a refund, and closing an empty campaign. [Send implementation](../../web/app/actions.ts) · [Campaign implementation](../../web/app/campaign-actions.ts)

## Local verification

| Check | Result | Evidence |
| --- | --- | --- |
| D1 automated suite | 142 passed | Tests include account and wallet binding, expiry, cancellation, one-time use, and rejection of changed transaction details. [Confirmation tests](../../web/scripts/confirmation-intent.test.mts) · [Prepared transaction tests](../../web/scripts/prepared-contract-transaction.test.mts) · [Campaign tests](../../web/scripts/campaign-confirmation.test.mts) |
| Full web script suite | 2,186 passed | All `scripts/*.test.mts` files, including the D1 tests, Arisan, campaign preview, and wallet regressions. |
| Send browser tests | 14 passed | Local app with test responses for recipient review, amount, and confirmation. [Send Playwright suite](../../web/e2e/send-recipient.spec.ts) |
| Campaign browser tests | 19 passed, 1 skipped | Local app with test responses for the campaign review flow and direct guest authorization checks. The skipped case is an optional live Testnet read. [Campaign Playwright suite](../../web/e2e/campaigns.spec.ts) |
| Build and code checks | Passed | Next.js production build with webpack, TypeScript check, and targeted ESLint. |

After installing the app dependencies, run from `web`.

```bash
npm run test:week1-d1
npx next build --webpack
npx tsc --noEmit
npm run start -- -p 4747
```

With the local app running, open a second terminal in `web` and run the browser suites.

```bash
E2E_BASE_URL=http://localhost:4747 npx playwright test e2e/send-recipient.spec.ts e2e/campaigns.spec.ts --workers=1
```

The GitHub Actions web job also runs the D1 automated suite. [CI workflow](../../.github/workflows/ci.yml)

## Testnet acceptance

The `revamp-ui` branch was tested with a fresh local Supabase instance that applied the confirmation-intent migration and signed-in QA wallets on Stellar Testnet. The app submitted each transaction through its review and confirmation screen. Transaction envelopes were checked against the Stellar Testnet RPC. [Supabase migration](../../web/supabase/migrations/20261123120000_week1_confirmation_intents.sql)

| Action | Confirmed Testnet result | Explorer |
| --- | --- | --- |
| Send by username | The native XLM contract transferred 1 XLM to the recipient wallet shown in review. | [Send transaction](https://stellar.expert/explorer/testnet/tx/fce40c024b71d4517aa5634366e3166e49300adbf603a254265dbed642f927d4) |
| Send with native input | Entering 0.1250001 XLM without a market quote preserved all seven native decimal places through review and ledger confirmation. | [Native amount transaction](https://stellar.expert/explorer/testnet/tx/8fb25c7ba570bb02b0835631f53ed51ead4ef84caaabd47ead05e959b1bc4189) |
| Create campaign | The D4 contract created QA campaign #35 with a 5% creator share and three designated approvers. | [Create transaction](https://stellar.expert/explorer/testnet/tx/16e3e1d3fa0d55dd68eac84eaaef281e0dac70cedd9cc554547add473240f83e) |
| Donate | The D4 contract accepted 8.9230769 XLM for campaign #35. The app displayed the confirmed Testnet donor badge. | [Donation transaction](https://stellar.expert/explorer/testnet/tx/deb30e8284cb6da11bf15441a362a8998b7ee1ca26a305ea03e13465de84b639) |
| Submit proof | The organizer submitted the public QA document URL and its SHA-256 after funding closed. | [Proof transaction](https://stellar.expert/explorer/testnet/tx/9ec1d3eebc8f9e51345ce7f7f1ba030e9db4039a86c3a6ef49d74ebced63cc2a) |
| Approve proof | Two separate reviewer wallets approved the submitted proof. | [First approval](https://stellar.expert/explorer/testnet/tx/9058321b728ff762651b9533cf653ac9ff27a2f577f0bd5f65f10f1b358a7868) · [Second approval](https://stellar.expert/explorer/testnet/tx/96085ae4082e255a686127252e04d851771d9d367e0b87e8004a7734ff978f6a) |
| Release | The campaign entered `Released` with two approvals and 0 XLM remaining in escrow. | [Release transaction](https://stellar.expert/explorer/testnet/tx/baf562ad91e158b7f6f7c32f3274d16d2ae71743d8a68953b445e6391b3b5f03) |

Apply the migration to the deployed app's database before releasing the confirmation update there.

The original Week 1 report records the earlier work on exact XLM amounts. Salapi's transparency page shows existing Testnet receipts. [Original Week 1 report](https://github.com/Ariqhermawan/salapi/blob/main/docs/instawards/week-1-d1.md) · [Salapi transparency](https://salapi.app/transparency)
