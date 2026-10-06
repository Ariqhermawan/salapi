# CoinGecko market-reference display

## Scope and evidence boundaries

The wallet still holds native Stellar Testnet XLM. A dollar estimate based on
mainnet market prices does not make Testnet tokens redeemable, add a USDC
trustline, or convert XLM to USDC. USDC is a price reference only.

The server wallet DTO includes the confirmed native balance as an exact integer
`nativeStroops` string. Home, the legacy wallet, the faucet balance and the
withdrawal sandbox multiply that amount by CoinGecko's current fiat quote for
display only. USD, PHP, IDR and VND use provider quotes, not fixed exchange rates.
The estimate is approximate; exact XLM remains visible in its details.

Transfer, D3/D4 and Arisan amount conversion and signing are unchanged. Their
existing fixed demo conversion is **not** a CoinGecko execution quote. Send
explicitly warns about this before confirmation. The withdrawal sandbox shows
its separate fixed demo form limit and does not transfer tokens or fiat.
Historical receipts and fictional Circles fixtures are not repriced as real
payments.

## Configuration

Set `COINGECKO_DEMO_API_KEY` in the server environment. For local work, use the
ignored `web/.env.local` file. Never use a `NEXT_PUBLIC_` prefix, a client-side
provider request, a URL query containing the key, or a committed credential.
Restart the local server after changing the environment.

For Vercel, configure the secret separately in the intended Preview or
Production environment and redeploy that environment after authorization.
Git push does not copy a local `.env.local` file to Vercel. Do not alter wallet
encryption keys, Supabase wallet rows, contract IDs, or local-preview flags as
part of configuring the price key.

The server calls the official Demo `/simple/price` endpoint with the
`x-cg-demo-api-key` header. Asset IDs are `stellar` and `usd-coin`, currencies are
`usd,php,idr,vnd`, and each quote includes its provider update timestamp.
`GET /api/market-prices` exposes validated prices and timestamps only. It is
read-only, unauthenticated and never returns credentials or wallet information.

## Refresh, expiry and quota

One app-level provider shares a quote across wallet widgets. It checks every
60 seconds while the app is visible, pauses polling in hidden tabs and refreshes
on return. There is no websocket and no guarantee of receiving every price tick.
The server deduplicates in-flight requests, caches for 60 seconds and uses Next's
shared upstream data cache. Caller request/body reading is bounded to four
seconds and 16 KiB. Next's internal background revalidation is not covered by
that caller timeout. Failed requests have a 60-second retry backoff.

After a long idle period or process restart, Next may first return an expired
cached HTTP 200 body while revalidating in the background. Only a structurally
valid but expired quote permits one forced uncached recovery within the same
four-second caller deadline and shared in-flight request. Malformed data,
future timestamps, HTTP errors and timeouts do not trigger that retry. This
rare recovery and background revalidation can consume two upstream credits.

A quote older than two minutes is labelled stale. After a failed refresh, a
previous valid quote is immediately labelled stale. A quote older than five
minutes is removed and the UI shows unavailable, not a made-up zero or a fixed
price fallback. Quote validation rejects missing assets/currencies, nonpositive
prices, malformed timestamps and excessive future skew.

The free Demo account has 10,000 monthly credits and 100 requests/minute as
verified during setup. An uninterrupted global request every minute would need
43,200 requests in 30 days, even before retries or multi-instance cache misses.
The current cache is **not a distributed monthly quota limiter**. For low-traffic
testing, watch usage in the CoinGecko dashboard. Before promising continuous
production availability, choose a longer shared refresh interval and expiry
policy, add a centrally enforced quota/cache, or approve a sufficient paid plan.
No paid plan or automatic paid upgrade is configured here. Provider limits or
failures degrade to stale/unavailable display without blocking transaction rails.

Visible linked attribution next to the price follows CoinGecko's attribution
guide. Do not remove it or imply endorsement.

## Verification

Run all unit tests, typecheck, lint, the exact-money guard and the production
build. The market-price unit suites exercise normalization, expiry, deduplication,
timeouts, failure retention and credential omission. Browser pricing tests use
clearly isolated wallet/price fixtures. They prove rendered state and refresh
behavior, not deployed Gmail login, real wallet funding or on-chain execution.

With an authorized configured local/Preview server, request
`/api/market-prices` without mocking it. Confirm a valid source, asset prices and
timestamps. Check that browser responses, logs and client bundles do not contain
the API key. Then verify one confirmed QA wallet balance against Horizon and
compare its exact XLM times the provider price. Do not fund or transact another
user's wallet just to test this display.

### Local candidate verification recorded during implementation

- 931/931 unit tests passed; typecheck, lint, money-path guard (including its
  seeded violation check), diff check and production build passed.
- 137 browser tests passed; two opt-in live contract tests were skipped. The
  eight pricing scenarios used synthetic balances and quotes, verified the
  actual unfunded runtime's wallet failure before substitution, and blocked
  all mutation requests. These are not native Android or live-user E2E proof.
- The actual keyed CoinGecko endpoint returned fresh XLM/USDC quotes for all
  four supported currencies after the expired-cache recovery fix. Concurrent
  GET responses matched; credentials were absent from JSON/headers; POST was
  rejected with 405. The configured key was absent from client static bundles.
- No Gmail QA login, wallet funding, token transfer, GitHub push, Vercel
  environment update, or deployment was performed for this pricing check.

## Official references

- Simple price API: https://docs.coingecko.com/demo/reference/simple-price
- Pricing and Demo limits: https://www.coingecko.com/en/api/pricing
- Attribution: https://brand.coingecko.com/resources/attribution-guide
