# Instawards Week 2 — Deliverable 2

## Manipulation-resistant commit-reveal draw

Status: **complete and submitted for review** on
[`codex/week2-deliverable2`](https://github.com/Ariqhermawan/salapi/pull/6).
Evidence run: 2026-09-07 on Stellar Testnet.

Salapi's arisan draw uses a participant commit-reveal protocol. Every eligible
member fixes a secret before anyone can see the other secrets, then reveals it
in a later window. The contract combines valid reveals and selects the winner
without accepting a caller-supplied winner or random index.

## Protocol

For every active room round, the contract exposes three time-based phases:

1. **Commit** — each member who has not won submits one 32-byte commitment.
2. **Reveal** — a committer submits the corresponding 32-byte secret.
3. **Finalizable** — after the reveal deadline, any room member can complete
   the round.

The commitment is:

```text
SHA-256(
  ScVal(Address(contract_id)).XDR
  || ScVal(U32(room_id)).XDR
  || ScVal(U32(round)).XDR
  || ScVal(Address(participant)).XDR
  || ScVal(Bytes(secret_32)).XDR
)
```

These five XDR values have fixed sizes for the accepted types: 40, 8, 8, 44,
and 40 bytes respectively, making the commitment preimage exactly 140 bytes.
Binding the contract, room, round, and participant prevents a valid reveal
from being replayed in another deployment, room, round, or wallet.

The managed-wallet application derives a stable 32-byte secret with
HMAC-SHA-256 from the participant's signing secret and the same deployment,
room, round, and participant context. The secret stays off-chain during the
commit phase and can be recovered after a page refresh without adding a new
secret database.

## Winner derivation and timeout rules

- Valid secrets are combined in the contract's immutable roster order.
- If at least one eligible member reveals, only revealers are eligible to win
  that round. A non-revealer remains unwon and may participate next round.
- If nobody reveals, the contract hashes immutable round context and selects
  from all unwon members. This fallback is deliberately deterministic so a
  missing reveal cannot lock the prefunded pool.
- Every successful finalization pays exactly `member_count * share`, records
  one new winner, and advances the round. After the final round, the room is
  `Done` and the prefunded contract balance is zero.

The demo Testnet build uses a 30-second reveal window. The long-cadence
Testnet build uses a 24-hour reveal window. Both variants are compiled from
the same source with the existing `production-cadences` feature flag.

## Rejections covered

- duplicate commitment;
- duplicate reveal;
- reveal without a commitment;
- reveal whose secret does not match its commitment;
- cross-round replay;
- cross-deployment replay;
- commit or reveal outside its phase;
- actions by non-members or members who already won.

## Threat model and residual limitations

The protocol prevents an administrator, transaction caller, or single
participant from directly supplying the winning member or changing a secret
after committing it. Contract and round binding prevent commitment reuse.

It does **not** provide formally proven randomness. A last revealer can see
earlier revealed secrets and choose not to reveal. Per-round forfeiture makes
that choice costly because the member cannot win that round, but it does not
eliminate all strategic influence. If nobody reveals, the liveness fallback
is publicly predictable; it exists to release funds and advance the cycle,
not to claim unpredictability. Validator ordering, compromised managed-wallet
keys, and endpoint availability remain outside this contract's guarantees.

## Fresh Testnet deployments

Both deployments were built from this branch and initialized with the native
XLM Stellar Asset Contract
`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`.

| Variant | Contract and WASM | Deployment transactions |
|---|---|---|
| Demo, 30-second reveal window | [`CDFIM3DPANUDSZJUMVFYOGCMMWUS545KDIZQIHBZWMWCA4THFKCPVB6N`](https://stellar.expert/explorer/testnet/contract/CDFIM3DPANUDSZJUMVFYOGCMMWUS545KDIZQIHBZWMWCA4THFKCPVB6N) · `17c1838e…82416` · 21,725 bytes | [upload](https://stellar.expert/explorer/testnet/tx/d6bbf81a4ce05a7a83a47cd793b19e8b1bbde315a06529eb3408d3cc7b0eb114) · [deploy](https://stellar.expert/explorer/testnet/tx/7dd3d2a1ba72d6ff3a3a6526d935af590abf736bc9a7058e6b8d1f82a8539fc0) · [initialize](https://stellar.expert/explorer/testnet/tx/ad12f9f3b41474739cc17973b150d323f50bb675a00e76252873f8bb6bc5a886) |
| Long cadence, 24-hour reveal window | [`CAYJ7G3CPT5LYKV2P5E4GL7TNVDQKMMW6SA4WA4QYQZKCNLK45GE4VUL`](https://stellar.expert/explorer/testnet/contract/CAYJ7G3CPT5LYKV2P5E4GL7TNVDQKMMW6SA4WA4QYQZKCNLK45GE4VUL) · `e867a857…d813` · 21,746 bytes | [upload](https://stellar.expert/explorer/testnet/tx/920004c77f35484a821e61d0dfa4893236e61b770b45beab6e984bc60f9411ce) · [deploy](https://stellar.expert/explorer/testnet/tx/bc4845dc99bceb87a16a547382a0ab2cd6ad9d1e22676b37488aa7748fa58e87) · [initialize](https://stellar.expert/explorer/testnet/tx/0aa1d9063435e0fd3c087256b3711a30edd10afffb077aa4dc8b6bd4280ae5dd) |

The complete demo WASM hash is
`17c1838ed2345333157f89e16b7fccd6e52e4d5e5b47431c81a0780b92f82416`;
the long-cadence hash is
`e867a857db2020bc73fc4b06dd76c4d4abea1d6113f668dee54fcfe82040d813`.

## Real N=3 Testnet acceptance run

Room 1 (`Q2DEKB`) used a 6.50 PHP display share, which converts exactly to
10,000,000 stroops (1 Testnet XLM). Each of three members prefunded three
shares, and every finalized round paid a 30,000,000-stroop pot.

| Stage | Public transaction evidence | Result |
|---|---|---|
| Create and prefund | [create](https://stellar.expert/explorer/testnet/tx/01f0ea9a65551693c985665605486b934e2a4164f49a9261bdeb6ab1fd112561) · [friend 1 joins](https://stellar.expert/explorer/testnet/tx/11facefe7031db81df9b413e349072987bfde99dcee09ecab8958cd39de886c0) · [friend 2 joins](https://stellar.expert/explorer/testnet/tx/c1925bc1e99eb74810766910ddba5e28bbc8cfe274fe83588a0181bca49276bd) · [start](https://stellar.expert/explorer/testnet/tx/a353819f14e1087f89c2bab5043b3ef4cda6a7ffb1f4c7adbb2502a1531ce740) | Three seats funded before round 1 |
| Round 1: normal | [commit 1](https://stellar.expert/explorer/testnet/tx/efca73dbb639f665da6adc7fad7694cfc23ee6307dd718f2dd78854f371afc37) · [commit 2](https://stellar.expert/explorer/testnet/tx/e688068a52ee495de3385dd2348257c919cdd23cb13a7233ad1d1498fa29757c) · [commit 3](https://stellar.expert/explorer/testnet/tx/857ae1aa4693eae64828db99cbdf38db8f4e0bbad90ec0c1d880a08f825f579b) · [reveal 1](https://stellar.expert/explorer/testnet/tx/3349ecf2164e9de408e2bb6a60a2c511dc40a3b5e8acf615fcfea4bd622824d8) · [reveal 2](https://stellar.expert/explorer/testnet/tx/212b94c151a3daebd95c3bbcb2029b6692c575c2d0f1f5d528da730d6d07f51c) · [reveal 3](https://stellar.expert/explorer/testnet/tx/e17dae2932f838f6ea1451a74bf008f83461efd86d0b5b708d83b9c1a270a10a) · [finalize](https://stellar.expert/explorer/testnet/tx/f83d24369795458db27a033e921ce84c261840ca29019baaa151dcb1518e50cb) | `reveal_count=3`, `fallback=false`; Teman A won |
| Round 2: timeout | [host commit](https://stellar.expert/explorer/testnet/tx/c6501000267b8fa2af20b046ddbf5e82aa9ebf3793a3c2faf9a554dbd6acae13) · [friend commit](https://stellar.expert/explorer/testnet/tx/39cf561fe4857256dd4800f3dc746656abf0db4785d7974b1f083e5f804e25d7) · [only reveal](https://stellar.expert/explorer/testnet/tx/23256eb94bede3cbd5ba215d30d66e4d07a8a8c86b0c70ee7ec881a801820810) · [finalize](https://stellar.expert/explorer/testnet/tx/1fc95b8cbd2c5a3f54e5b44f0dad88aac55df5af30e5e1c7a0e9fb6ab5a7d0bc) | `reveal_count=1`, `fallback=false`; non-revealer excluded and You won |
| Round 3: no reveal | [commit](https://stellar.expert/explorer/testnet/tx/da1cfccee66039be97727ba189bb0a396d8ffd52161e0301fede3bc7c886a155) · [finalize](https://stellar.expert/explorer/testnet/tx/89734260b9a5c1bb099ed65f26a0f815059aea5d6b6fb8aa27f3c7c5c9a256b0) | `reveal_count=0`, `fallback=true`; Teman B won |

The final state was `Done` with three distinct winners. A read-only native-token
`balance(contract_id)` invocation returned exactly `"0"` stroops after the
last payout. The contract event stream at ledgers 4,554,145–4,554,194 records
all `commit`, `reveal`, and `finalize` events, including the reveal counts and
fallback flags above.

## Automated verification

All of the following passed on the final branch state:

- `cargo test --workspace --locked`: 26 unit tests passed, including 13 Arisan
  tests;
- `cargo test -p arisan-rooms --features production-cadences --locked`: 13/13;
- `cargo build --workspace --target wasm32-unknown-unknown --release --locked`;
- `npm run test:money`: 5/5 and `npm run test:arisan`: 3/3;
- `npx tsc --noEmit`, `npm run lint -- --quiet`, and `npm run build`;
- local production Playwright run: 20/20, including `/arisan` and `/docs`.

Negative contract tests cover duplicates, invalid secrets, missing
commitments, non-members, out-of-phase calls, cross-round replay, and
cross-deployment replay. The full-cycle test also asserts zero contract-token
residual.

## Reproduce and review

- Weekly PR with 20 separate commits:
  https://github.com/Ariqhermawan/salapi/pull/6
- Build and deploy both variants:
  `bash scripts/deploy-arisan-d2-testnet.sh`
- Run the real Testnet acceptance cycle from `web/`:
  `npx tsx scripts/verify-arisan.mts`

The Testnet verifier requires the public and secret keys for one host and two
throwaway friend identities through environment variables or an untracked
`web/.env.local`. No secret is stored in the repository or printed in this
report.
