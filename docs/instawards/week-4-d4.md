# Deliverable 4 — Donation campaigns with proof-gated release or full refunds

Status (22 September 2026): contract, authenticated application integration,
automated checks, and real Testnet SDK acceptance implemented. Production
browser acceptance and the final public demo are pending; they are not implied
by the SDK receipts below.

## Scope and locked rules

D4 is a separate `donation-campaign` contract, not an extension of the D3 shared
Disaster Vault. Each campaign has its own immutable creator, beneficiary,
creator share (0–10%), funding deadline, review deadline, and exactly three
distinct approvers. The Testnet deployment fixes the native XLM SAC at
construction. A new campaign cannot edit its rules or use another asset.

1. Donors contribute only before the funding deadline. Amounts accumulate per
   original donor and per campaign.
2. After funding closes, the creator submits one SHA-256 proof hash and public
   document link before the review deadline. Proof cannot be replaced.
3. Two different configured wallets approve that exact hash before review
   closes. The creator is not implicitly an approver, and proposing proof is
   not an approval. An approver may also be a creator/beneficiary if explicitly
   configured; independent human review is an operational responsibility.
4. Anyone may execute a timely approved release to the fixed recipients.
   The creator receives `floor(total * creator_cut_bps / 10000)`; the beneficiary
   receives the entire remainder. Campaign escrow becomes zero and `Released`
   is terminal. A timely quorum remains releasable after the review deadline.
5. If proof or quorum is missing when review closes, each original donor can
   claim their full recorded contribution. No creator/platform cut is charged.
   After the last refund, escrow is zero and the campaign is `Closed`.

Boundary rules are exact: funding/proof/approval windows use `< deadline`;
refund eligibility uses `>= review_deadline`. Release and refund cannot both
win. D4 has no D3 20-ledger delay, global signer set, pause control, or 20% cap.
The creator share is not a platform fee.

Campaigns share one deployed contract/token account, but accounting and payout
authorization are isolated per campaign. Direct token transfers outside
`donate` are not recorded donations and cannot be refunded by this module.

## Application and reproduction

- `/campaigns`: create, browse, donate, submit/hash proof, approve, release and
  claim refunds. Locked terms and exact split are visible before confirmation.
- `/circles`: entry point to the real D4 module, separate from preview cards.
- `/transparency`: bounded recent events plus durable public acceptance links.
- `/docs`: active contract and report links.
- Every application write requires a signed-in account and its existing
  encrypted wallet. No shared demo-wallet fallback or client-supplied signer.
- Input stays decimal text until BigInt conversion; contract money is `i128`.
  PHP/IDR are illustrative displays, not fiat deposits. The 6.50 PHP example is
  exactly 1 Testnet XLM / 10,000,000 stroops.
- The public deployment below is pinned in `web/lib/server/stellar.ts`.
  `DONATION_CAMPAIGN_CONTRACT` is an optional server-side override; an invalid
  override fails closed. Version 4 and the Testnet XLM token must verify before
  actions are enabled. Existing wallet encryption/auth settings are unchanged.

```bash
cargo test --workspace --locked
stellar contract build --locked --package donation-campaign
cd web
npm run test:campaign
npm run test:money
npm run test:arisan
npm run test:disaster
node scripts/check-money-path.mjs --seeded-violation
npx tsc --noEmit
npm run lint
npm run build
# Start the production build, then run the existing browser suite:
E2E_BASE_URL=http://localhost:4747 npm run test:e2e
```

The 16 D4 Rust tests cover immutable terms, invalid configurations, exact
deadline boundaries, real authorization/replay rejection, proof/approver
validation, below-quorum/duplicate actions, full repeated-donation refunds,
release/refund exclusion, per-campaign isolation, transfer rollback, empty
closure, unsolicited tokens, rounding, and the maximum `i128` split.

The TypeScript checks cover amount/configuration parsing, exact split,
Soroban Symbol-key struct encoding, and cryptographic verification of the
published acceptance archive. CI exposes named D4 steps and runs the full
existing D1–D3 regression suite. [Successful implementation CI](https://github.com/Ariqhermawan/salapi/actions/runs/35677663740)
corresponds to commit `facfe14`; later documentation/evidence commits require
their own CI result.

Browser checks distinguish local mocked UI transitions, real unauthenticated
HTTP rejection tests, and an opt-in real Testnet public-state read using
`D4_E2E_CONTRACT`. These do not substitute for signed-in live browser execution.

## Deployed Testnet and raw evidence

- Contract: `CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU`
- [Contract explorer](https://stellar.expert/explorer/testnet/contract/CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU)
- Token: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
- Optimized WASM SHA-256: `c5c8df039b8659ccf47b35ff70410da0e03d51e7907c4977fedd2d7e46a1da3b`
- [Public signed XDR, raw RPC responses, rejected simulations and final state](evidence/week-4-d4-testnet.json)

The archive records 13 successful submitted transactions and 12 expected
simulation rejections (not submitted failed transactions). Three retained
Testnet wallets were used; no keys, passwords or encrypted wallet blobs are
published. Run `npm run test:campaign` to recompute transaction hashes, verify
signatures/success codes, match displayed receipts, and check exact outcomes.

| Path | Verified result | Receipt |
| --- | --- | --- |
| Deploy | Immutable native-XLM contract | [Deploy](https://stellar.expert/explorer/testnet/tx/af53ce4437af222f5c9f41bd79b65e67a7ae5f85497576148b2606f4e2ca715f) |
| Campaign #1 donation | 100.0000001 XLM escrowed | [Donation](https://stellar.expert/explorer/testnet/tx/b1f1caa7b7d6e369d147f5faf8817930ae84acc0487e244d17f633a03c9ebb2a) |
| Campaign #1 release | 5 XLM creator + 95.0000001 XLM beneficiary; zero escrow | [Release](https://stellar.expert/explorer/testnet/tx/c5c9ae1a3e180b7e1f7f3a71a79cbc787c95054522359444bef0cd4665df6f2e) |
| Campaign #2 donor A | Full 30 XLM returned | [Refund A](https://stellar.expert/explorer/testnet/tx/26e12d1705d8fce36ac95a7c256979719de70a30f26f1ac075c57869bd6f1a7b) |
| Campaign #2 donor B | Full 20 XLM returned; zero escrow; Closed | [Refund B](https://stellar.expert/explorer/testnet/tx/1a1b77d7cc1486f1123d5bdd16151db068a015e87079e0b064368ce75fe2f70e) |

Release recipient balance deltas and full donor returns were checked with
transaction fees accounted separately. Zero escrow means the individual
campaign's balance, not an assumption about unrelated campaigns.

The proof document at `/evidence/d4-demo-proof.txt` is explicitly a technical
fixture, not evidence of real-world aid delivery. The archive hash matches
its bytes. The SDK runner is `web/scripts/campaign-testnet.mts`; it uses the
existing owner-only Stellar identity store and writes public results under
`output/d4-testnet/`. Reruns create additional Testnet campaigns; they do not
reset existing state. It must never target Mainnet.

## Security self-review and operational limits

- Authorization: creator/donor/approver actions require the matching Soroban
  authorization; UI signer identity comes only from the authenticated wallet.
  Duplicate approvals, wrong hashes and cross-campaign replay are tested.
- Conservation: checked integer additions; overflow-safe floor split;
  beneficiary receives the remainder; per-donor refunds are single-use.
  Failed token transfers roll back state atomically. No sweep/admin payout,
  mutation, upgrade, or signer replacement entrypoint exists.
- Timing/races: the contract's ledger timestamp, not the browser clock,
  decides eligibility. A timely quorum blocks refunds permanently; otherwise
  the first refund starts the refund path. Terminal states reject repeats.
- Custody: test accounts use Salapi-managed keys. The three validation
  identities are held by one operator, not three independent organizations.
  Compromise of the custody service can compromise multiple approvers.
- Human trust: two colluding approvers can approve false proof. A hash binds
  document bytes, not truth or NGO legitimacy. Public links may become
  unavailable; reviewers should retain the approved document.
- Availability: persistent entries extend TTL on access/write. Very inactive
  entries may require Soroban restoration. The application is not a permanent
  indexer and the recent event feed is bounded. Direct unsolicited transfers
  have no recovery route; only the donation form records refundable deposits.
- Testnet only; no real-value readiness or independent audit is claimed.
  Separate NGO custody, compliance, disaster recovery and Mainnet review
  remain prerequisites outside this delivery.

## Remaining acceptance evidence

After the deployment is live: verify the pinned contract on `salapi.app`, run
authenticated release and refund paths through the public UI, record the
receipts and final states here, and attach the public demo/evidence index.
