# Referral reward on Stellar Testnet

The referrals screen now derives progress from server-verified D4 Testnet donation receipts. A referred account qualifies once the sum of its recorded D4 donations is currently estimated at $5 or more using a fresh XLM/USDC quote. Ten distinct referred accounts qualify for one 20 USDC Testnet payment.

## Required setup

1. Apply `web/supabase/migrations/20261127100500_referral_testnet_rewards.sql`.
2. Install the immutable receipt table in `web/supabase/campaign_donors.sql` if it is not already present. The application fails closed when this table or the RPC quote is unavailable.
3. Create a dedicated, funded Stellar Testnet treasury with a USDC trustline. Configure its values as server-side Vercel environment variables:
   - `REFERRAL_REWARD_TREASURY_PUBLIC`
   - `REFERRAL_REWARD_TREASURY_SECRET`
4. Configure `COINGECKO_DEMO_API_KEY` for fresh XLM and USDC quotes. Without a fresh quote, donation progress is not counted and a reward cannot be claimed.

The public key must match the secret key. The payout path verifies that the account is on Testnet and has at least 20 USDC before creating a transfer. It never falls back to the demo wallet or a user's wallet. A reward record is unique per inviter; the signed transaction envelope and hash are persisted before submission, and retries may only resubmit that identical envelope while its transaction time bound is valid.

Recipients need a USDC trustline. They create it explicitly from the referrals screen with their authenticated wallet. Stellar reserves some Testnet XLM for that trustline; it is not a transaction fee. The UI reports a claim as paid only after Horizon confirms the transaction hash.

## Limitations

- This sends Testnet USDC only. Testnet balances have no real-world value and can be reset.
- Qualification uses the current fresh market estimate, so a referred account's qualifying state can change with the XLM/USDC quote.
- A transaction with an unknown Horizon outcome stays pending and is never replaced with a new payment automatically.
- Local development does not have a funded referral treasury configured, so the live payout path remains unavailable until the two treasury variables are set privately in the deployment environment.
