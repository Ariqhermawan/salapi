# Arisan installment prefunding candidate

This is a separate Testnet-XLM candidate. It does not migrate, upgrade or
modify existing full-deposit rooms. Local browser examples are test doubles,
not evidence of independent Gmail participants or live payments.

## Member flow

1. Review the invitation, fixed share, total obligation and funding deadline.
2. Join without a deposit. The transaction still requires network fees.
3. Contribute any positive amount up to the remaining obligation. Each
   installment requires a separate review and confirmation. There is no
   automatic debit or periodic charge.
4. The host can Start only after all seats are filled and every member has
   paid exactly `member count × share per round`.
5. After Start, the roster is fixed and no further contributions are required
   for that cycle. The existing commit/reveal and payout lifecycle applies.

For three members and a 1 XLM share, each member owes 3 XLM before Start.
The fully funded pool is 9 XLM, paying 3 XLM per round for three rounds.
One member can contribute 0.5 XLM and later 2.5 XLM. Joining never makes
that payment automatically.

Before Start, a non-host can leave and reclaim the amount actually paid.
The host can cancel and refund all actual contributions. At the funding
deadline, deposits and Start are rejected; cancellation remains available.
Network fees are not refundable. Unpaid obligations are not refunded.

## UI and configuration

- List: `/arisan/funding`
- Room: `/arisan/funding/<id>`
- New server variable: `ARISAN_INSTALLMENTS_CONTRACT`
- Discovery flag: `NEXT_PUBLIC_ARISAN_INSTALLMENTS=1`

Do not overwrite `ARISAN_ROOMS_CONTRACT`. The candidate variable cannot
equal the legacy contract ID. Empty or unsupported candidates fail closed.
The actual initialized native asset and compiled timings are checked before
signer access. USD amounts and USDC transfers are not added by this change.

`NEXT_PUBLIC_LOCAL_PREVIEW=1` is only for browser-local interaction examples.
Do not enable it on a deployment presented as a live Testnet application.

## Reminders and transaction recovery

The reminder is off by default and scoped to the contract, room and wallet
on the current browser. It shows the remaining deposit when the room is
opened. Email and push are not implemented. A downloadable `.ics` file can
be imported manually; Salapi does not claim that an alert has been scheduled
or delivered. Calendar events must be removed manually after funding.

Unknown submissions keep their original retry guard and hash. A confirmed
creation whose room ID was temporarily unreadable can be recovered using
its original receipt. Recovery verifies the transaction, configured contract,
creator wallet and room terms without loading a signing key or resubmitting.
If no hash was returned, inspect the original wallet/contract state instead
of creating a second room.

## Rollout gates and limits

- Build and inspect the new WASM artifact before a separate Testnet deploy.
- Initialize the new contract with the native Testnet XLM asset.
- Verify three independent Gmail wallets: free join, repeated partial funding,
  rejected premature Start, fully funded Start, normal commit/reveal, every
  payout, cancellation and exact refunds. Local actors do not satisfy this gate.
- Funding windows are limited to 30 days. Persistent room state is renewed on
  operations and `keepalive_room`; long cycles need maintenance before archive
  or restoration. There is no automatic keepalive scheduler in this change.
- A no-reveal fallback is predictable. This candidate is not a guarantee of
  fair randomness and must not be used with real money.
- Existing room IDs and active cycles remain on their original deployment.

## Local checks

From the repository root:

```sh
cargo test -p arisan-rooms --lib --locked
```

From `web`:

```sh
npm run test:arisan
npm run test:arisan-funding
node --experimental-strip-types scripts/verify-arisan-funding-abi.mts
```

Browser interaction coverage is in `e2e/arisan-installments.spec.ts` and
requires a separate localhost server with explicit local-preview mode.
`e2e/arisan-installments-unconfigured.spec.ts` checks a production-shaped
localhost build with the candidate ID and discovery flag unset.
