# Personal Testnet wallet readiness

This change strengthens the existing custodial Stellar Testnet wallet flow.
It does not migrate assets to USDC, rotate encryption keys, replace existing
wallets, alter database schemas, or redeploy any contract.

## Expected behavior

- OAuth exchanges the login code for a session before preparing the verified
  user's personal wallet. A wallet-service failure preserves the session and
  sends the user to `/wallet/setup` with the original destination.
- A new encrypted keypair is persisted before any funding request. Concurrent
  requests re-read the canonical `wallets.user_id` row. Failed funding and
  retries reuse that same saved address, not a newly generated wallet.
- Horizon Testnet is authoritative. Only an explicit account-not-found (404)
  response permits Friendbot funding during setup. Existing accounts, including
  low or zero balances, do not trigger an automatic faucet request.
- Setup reports success only after Horizon confirms the same saved account.
  A rejected or lost Friendbot response is reconciled against that address.
- `/wallet/setup` GET only renders a screen. The explicit retry action requires
  a verified user and never returns a custody secret. Continue replaces the
  setup route with the original safe app destination.
- Missing accounts, provider failures and malformed balance responses are not
  zero balances. UI consumers handle a structured unavailable response instead
  of an expected server HTTP 500. A confirmed on-chain zero is still valid.
- D4 actions may prepare their authenticated owner's canonical wallet. D3
  privileged signer controls retain their existing stored-wallet-only behavior.
- The existing explicit Testnet faucet and simulated fiat provider flows are
  not converted into real deposits or withdrawals by this change.

## Automated checks

From `web`, run:

```text
npm run test:wallet
npm run test:revamp
npx tsc --noEmit
npm run lint
node scripts/check-money-path.mjs --seeded-violation
node scripts/check-money-path.mjs
npm run build
npm run test:e2e
```

Playwright expects a running local production server. Its wallet-setup success
and failure scenarios use explicitly isolated HTTP fixtures. Guest denial is
also tested against the actual server without mocked authentication. These
checks do not establish that deployed Gmail OAuth, Supabase persistence or
Friendbot funding works with actual users.

## Preview acceptance before production

Use the existing correct project configuration, with local preview disabled.
Do not replace `WALLET_ENC_KEY` or regenerate existing wallet rows for testing.
Use dedicated authorized QA accounts, never another user's credentials.

1. Sign in with two different Gmail QA accounts. Each account must have a
   different saved public address and its own verified Testnet account.
2. Sign out and sign back in, then reload. Each user must retain their original
   address. Confirm balances against the same accounts in a Testnet explorer.
3. Exercise an unavailable setup provider in an isolated QA environment. There
   must be no ready claim or fabricated balance. A subsequent successful retry
   must retain the saved address and return to the original intended screen.
4. With explicit authorization for a Testnet-only QA transaction, verify one
   small transfer between these accounts and both sides' transaction history.
5. Require passing Linux CI contract regressions before merging. If local Rust
   execution is blocked by Windows Application Control, do not disable that
   policy and do not represent the blocked check as passed.

No real fiat payment or production merge is authorized by this checklist.
