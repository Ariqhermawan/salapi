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

Apply the Supabase migration to staging before using the new flow there. Record an explorer receipt for a signed-in username transfer and a campaign donation, and compare each receipt with the amount and destination shown in review. Apply the migration to the deployed app's database before releasing the update. [Supabase migration](../../web/supabase/migrations/20261123120000_week1_confirmation_intents.sql)

The original Week 1 report records the earlier work on exact XLM amounts. Salapi's transparency page shows existing Testnet receipts. [Original Week 1 report](https://github.com/Ariqhermawan/salapi/blob/main/docs/instawards/week-1-d1.md) · [Salapi transparency](https://salapi.app/transparency)
