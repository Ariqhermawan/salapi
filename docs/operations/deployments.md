# Salapi — Stellar Testnet Deployment Evidence (SOW Week 2)

**Network:** Stellar **Testnet** (`Test SDF Network ; September 2015`)
**Date:** 2026-05-18 · **Deployer:** `GC2P5KXDI74CGDIB3GR7IULRLHZCC4U4JCCYASXVCMVWUMUBWZNBTBNP`
**Reproduce:** `bash scripts/wsl-deploy-testnet.sh` (WSL; identities Friendbot-funded)

Every line below is independently verifiable on a public block explorer. The
test token is the **native XLM Stellar Asset Contract** (no trustline/mint
friction); production = USDC. Contracts are asset-agnostic (`token: Address`).

## Deployed contracts

| Contract | Contract ID | Deploy tx |
|---|---|---|
| base-vault | `CBC6BTKW5VA6Y2XH6WP4IEPWDZ7TBPYSIIOZQMTEH62N62NFT4F4VYDD` | [`d0d15411…67ba0`](https://stellar.expert/explorer/testnet/tx/d0d154113feac26e1f4505195c86483e3ce228febc720de4afbed98e95e67ba0) |
| username-registry | `CDDINUQXTF6SHZN2ZJ36IT7P4YOJ3OZN3H6LTYHVCQ35YYO7YTAWM4G3` | [`b98b8d76…489a`](https://stellar.expert/explorer/testnet/tx/b98b8d76042e67d941ee6d59e5a80062d57797f332102df69a64c6829b98489a) |
| disaster (hero) | `CCKQ3UVBZ75KSZDO6IPA5U6PFARJG4PLRGN2SAIW5RAGQ6K4B7ZDWBUZ` | [`1bed6a16…91d12`](https://stellar.expert/explorer/testnet/tx/1bed6a16e6b6b2a8fddf3c8e247764f77f80bc18f58cd019bec225e60d891d12) |

Token (native XLM SAC): `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`

Explorer (contract): `https://stellar.expert/explorer/testnet/contract/<CONTRACT_ID>`

## Verifiable transaction trail

| # | Action | Contract | Tx hash (explorer) | Result |
|---|---|---|---|---|
| 1 | `register("juandelacruz", donor)` | username-registry | [`00d08614…f8bf913`](https://stellar.expert/explorer/testnet/tx/00d0861463b124d7ec83b1cb5ef65f4b13579167127b8acede5c01362f8bf913) | ok |
| 2 | `resolve("juandelacruz")` | username-registry | read-only | → `GDHYUD…KLJ3` (donor) |
| 3 | `initialize(admin, token)` | disaster | [`f49b815b…20beb1`](https://stellar.expert/explorer/testnet/tx/f49b815b47b052ba12f288c64c1e11e336b9a6a1afaf5d359db08b928e20beb1) | ok |
| 4 | `contribute(donor, 5 XLM)` | disaster | [`618dedd7…ad0cd66`](https://stellar.expert/explorer/testnet/tx/618dedd72dd1ba49f7432dc33e237007da5280c857d00e4eff6164247ad0cd66) | transfer + `contrib` event, 50000000 |
| 5 | `set_disaster(true)` | disaster | [`7ecdeaf1…5608d0a`](https://stellar.expert/explorer/testnet/tx/7ecdeaf152745257b1d0f619503f6f59971068ad1a3bf7dd8499a08295608d0a) | `disaster=true` event |
| 6 | `disburse(donor, 2 XLM)` | disaster | [`1115f685…986a837`](https://stellar.expert/explorer/testnet/tx/1115f685287faf7b508e97d378df5f4ccb1ccc302d007b2190776ad0c986a837) | transfer + `disburse` event, 20000000 |
| 7 | `total()` | disaster | read-only | → `30000000` (= 3 XLM) |

## What this proves

- **Contracts run on a real Stellar network**, not just local tests.
- **The disaster gate is enforced on-chain**: an earlier attempt to `disburse`
  before `set_disaster(true)` failed with `NotInDisaster` — disbursement only
  succeeded after a disaster was declared (txs #5 → #6).
- **On-chain accounting is correct**: contributed `50000000` − disbursed
  `20000000` = `total() = 30000000` (5 − 2 = 3 XLM), read back from chain (#7).
- **Token transfers are real**: native-asset `transfer` events on the SAC
  (`CDLZ…CYSC`) for both contribute (donor → vault) and disburse (vault → donor).

## Scope note

Deployed this round: base-vault, username-registry, disaster (hero) + native
token SAC. `paluwagan` and `smart-savings` rule-set modules are the next Week-2
item (scaffold + tests, then deploy). DAO governance + AI Tribunal remain
Build-Award vision, explicitly out of the 30-day scope (see SOW §13).

**Update:** `username-registry` was redeployed adding `rename()` so users can
change their display @username. The previous name is kept as a permanent
money-safe alias (still resolves to the same account). The new contract starts
empty, so the historical `register/resolve("juandelacruz")` trail (#1–2) is on
the now-superseded contract id.

---

## Week 2 (continued) — Paluwagan + Smart-Savings deployed, full app-flow trail

**Date:** 2026-05-19 (UTC, per on-chain ledger close time — what stellar.expert shows)
**Source / signer:** `GCUBT6T7SMQKJE5L2TJLUQQPSBBU5GVHALGLWWECEJUIV2YFFCSXGHY7`
— the app's managed demo signer (SOW §13 managed-wallet model). Every tx below
was submitted by this account.
**Reproduce:** `bash scripts/wsl-paluwagan-setup.sh` and
`bash scripts/wsl-smartsavings-setup.sh` (WSL; redeploy fresh, append ids to
`web/.env.local`), then the five day-30 flows through the real app server
actions via `cd web && npx tsx scripts/exercise-flows.mts`. Recover hashes from
chain with `bash scripts/wsl-txtrail.sh`; validate every hash with
`bash scripts/wsl-verify-tx.sh <hash …>`.

### Deployed contracts

| Contract | Contract ID | Deploy tx |
|---|---|---|
| paluwagan | `CCXNSK6IGPSB4QGUSNB2EFZWYV53NKVX5AV3XSJANCDDD7TULGQSY37X` | [`5b83a701…74116`](https://stellar.expert/explorer/testnet/tx/5b83a7016831147009914c2b4a7a81fc8a046b7b891cd2f8c087d271c9974116) |
| smart-savings | `CBQBUAOP3T235Q2U63XNC2NQVNAOXQL2KHWALO6FTIOJS46NTKIZJ5WI` | [`bafc88a1…c5601`](https://stellar.expert/explorer/testnet/tx/bafc88a148704499b16567f0b72030d8286c354964e35e586978078292cc5601) |

Token (native XLM SAC): `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
(unchanged; both new contracts are asset-agnostic — `token: Address` — so
production = USDC). Explorer (contract):
`https://stellar.expert/explorer/testnet/contract/<CONTRACT_ID>`

### Verifiable transaction trail

`initialize` for each new contract, then the five SOW day-30 flows exercised
**end to end through `web/app/actions.ts`** (no UI bypass — the same functions
the app calls):

| # | Action (server action) | Contract | Tx hash (explorer) | Result |
|---|---|---|---|---|
| 1 | `initialize(token,[demo,friend1,friend2],769230769)` | paluwagan | [`564bf607…c2f69`](https://stellar.expert/explorer/testnet/tx/564bf60760a5ae18ed72d04710c08bb5b83386cd62c2624c8dbfdbf1a89c2f69) | ok · circle ≈ ₱500/round |
| 2 | `initialize(token)` | smart-savings | [`3d363ef9…4e71d`](https://stellar.expert/explorer/testnet/tx/3d363ef9057102540509b2767da57771b84b0518aaf30241cf28627db2d4e71d) | ok |
| 3 | `registerUsername("salapidemo")` | username-registry | [`d1c96658…239b7`](https://stellar.expert/explorer/testnet/tx/d1c9665861dd3319a076e5cba6f8cad29d5093bab8c5d769fac504a7c06239b7) | ok |
| 4 | `resolve("salapidemo")` / `myUsername()` | username-registry | read-only | → demo `GCUBT6T7…GHY7` |
| 5 | `sendByUsername("salapidemo", 10)` | token SAC | [`a07c6a6c…1e239`](https://stellar.expert/explorer/testnet/tx/a07c6a6c085c5abafeec0f87e9aeadcb7ee722990d2b2d857de95da31ca1e239) | ok · SAC `transfer` event |
| 6 | `disasterContribute(25)` | disaster | [`14c46d1e…7ae69`](https://stellar.expert/explorer/testnet/tx/14c46d1e5784c1fcbf4a5a4e9cada5a9abbfdbab62b4e377bf386f20d1f7ae69) | ok · `contrib` event |
| 7 | `paluwaganPayMine()` (demo pays share) | paluwagan | [`62fcc4e6…5e0c8`](https://stellar.expert/explorer/testnet/tx/62fcc4e69b866e5c2a8c30622f67646cb076f37f66494cab5d174df38ca5e0c8) | ok |
| 8 | `paluwaganFriendsPay()` (friend1+friend2) | paluwagan | 2 friend-signed `contribute` tx — not listed individually; their effect is proven by #9 (`payout` is contract-gated to fail unless all 3 members paid) | ok · paid=2 |
| 9 | `paluwaganCollect()` → `payout()` rotates pot | paluwagan | [`4193926c…11d9f`](https://stellar.expert/explorer/testnet/tx/4193926c9550e2bec891ad3e5597bff624397668cd7940576933f20570711d9f) | ok · pot → member 0 (demo) |
| 10 | `smartSavingsOpen(5000)` → `open_goal` | smart-savings | [`a08d121c…318fd`](https://stellar.expert/explorer/testnet/tx/a08d121cdbda60b698b49b288ea26311385565f29ff0747f304771f953a318fd) | ok |
| 11 | `smartSavingsDeposit(100)` → `deposit` | smart-savings | [`41a904c3…2a18a`](https://stellar.expert/explorer/testnet/tx/41a904c3188dedb89cc82d4095336bea8a320d44ef50c819ee935702f852a18a) | ok · `deposit` event |

Every hash above (and the two deploy tx) was confirmed `successful=true` on
Horizon testnet **and** HTTP 200 on the stellar.expert API
(`scripts/wsl-verify-tx.sh`); ledger range 2641745 → 2641883.

### What this proves

- **Paluwagan and Smart-Savings run on real Stellar testnet**, not just unit
  tests — deployed, initialized, and exercised (above).
- **All five SOW day-30 flows complete end to end through the actual app
  server actions** (`web/app/actions.ts`) — username register/resolve, P2P
  send-by-@username, disaster contribute, the full Paluwagan round
  (pay → friends pay → rotate), and Smart-Savings open → deposit — each a real,
  independently verifiable testnet transaction.
- **Paluwagan's rotation rule is enforced on-chain**: `payout()` (#9) only
  succeeded once every member had paid the round (#7 + the #8 friend tx). The
  contract returns `RoundNotComplete` otherwise — so #9 succeeding is itself
  proof the round was fully funded.
- **Smart-Savings custody is real**: a goal was opened (#10) then funded on
  chain (#11); the contract holds the funds and only releases them once the
  target is met or the unlock ledger passes.

### Update to the earlier scope note

The 2026-05-18 "Scope note" listed Paluwagan + Smart-Savings as the *next*
Week-2 item (scaffold + tests, then deploy). **That is now done** — both are
deployed, initialized, and exercised end to end via the app (this section).
DAO governance + the AI Tribunal remain Build-Award vision, still explicitly
out of the 30-day scope (SOW §13).

---

## Current Arisan deployment — Instawards Week 2 D2

**Date:** 2026-09-07 UTC · **Network:** Stellar Testnet · **Status:** active
evidence deployment.

| Variant | Contract | Upload · deploy · initialize |
|---|---|---|
| Demo, 30-second reveal | [`CDFIM3DPANUDSZJUMVFYOGCMMWUS545KDIZQIHBZWMWCA4THFKCPVB6N`](https://stellar.expert/explorer/testnet/contract/CDFIM3DPANUDSZJUMVFYOGCMMWUS545KDIZQIHBZWMWCA4THFKCPVB6N) | [`d6bbf81a…eb114`](https://stellar.expert/explorer/testnet/tx/d6bbf81a4ce05a7a83a47cd793b19e8b1bbde315a06529eb3408d3cc7b0eb114) · [`7dd3d2a1…539fc0`](https://stellar.expert/explorer/testnet/tx/7dd3d2a1ba72d6ff3a3a6526d935af590abf736bc9a7058e6b8d1f82a8539fc0) · [`ad12f9f3…a886`](https://stellar.expert/explorer/testnet/tx/ad12f9f3b41474739cc17973b150d323f50bb675a00e76252873f8bb6bc5a886) |
| Long cadence, 24-hour reveal | [`CAYJ7G3CPT5LYKV2P5E4GL7TNVDQKMMW6SA4WA4QYQZKCNLK45GE4VUL`](https://stellar.expert/explorer/testnet/contract/CAYJ7G3CPT5LYKV2P5E4GL7TNVDQKMMW6SA4WA4QYQZKCNLK45GE4VUL) | [`920004c7…411ce`](https://stellar.expert/explorer/testnet/tx/920004c77f35484a821e61d0dfa4893236e61b770b45beab6e984bc60f9411ce) · [`bc4845dc…58e87`](https://stellar.expert/explorer/testnet/tx/bc4845dc99bceb87a16a547382a0ab2cd6ad9d1e22676b37488aa7748fa58e87) · [`0aa1d906…ae5dd`](https://stellar.expert/explorer/testnet/tx/0aa1d9063435e0fd3c087256b3711a30edd10afffb077aa4dc8b6bd4280ae5dd) |

The current contract replaces the earlier deterministic, caller-CSPRNG, and
sealed-PRNG experiments with participant-bound commit-reveal. The real N=3
acceptance run proves a normal three-reveal round, a one-reveal timeout round,
a zero-reveal fallback round, three distinct winners, and a final contract
token balance of zero. See the concise
[`week-2-d2.md`](../instawards/week-2-d2.md) report for every transaction and
the exact threat model. Reproduce fresh deployments with
`bash scripts/deploy-arisan-d2-testnet.sh`.

The Arisan sections below are retained only as a historical record. Their
contract IDs and scripts are superseded and must not be used as current D2
evidence.

---

## Historical — superseded deterministic Arisan deployment

**Date:** 2026-05-23 (UTC, per on-chain ledger close time)
**Source / signer:** `GCUBT6T7SMQKJE5L2TJLUQQPSBBU5GVHALGLWWECEJUIV2YFFCSXGHY7` (managed demo signer; SOW §13).
**Reproduction status:** superseded; use the current D2 deployment script and
verifier documented above.

A *prefund* ROSCA: every member locks their full cycle commitment (N × share)
into the contract before round 1. Each round, the contract picks a winner from
members who haven't won yet, and transfers the pot (N × share) to them. After
N rounds, every member has won exactly once and the contract balance is
*exactly* zero by construction — **late payment, default, and abscond are
structurally impossible** because there is no payment owed after join. One
contract holds many rooms keyed by `room_id`; rooms are *invite-only* via a
6-char code; there is no discovery.

### Deployed contract

| Contract | Contract ID | Deploy tx |
|---|---|---|
| arisan-rooms | `CD5HJBO7L3PRKHON6AR6QAVQ6V7BJJNP6UCJK3W7HIOD7D72DHLKNKTN` | [`bab82f67…7da13c`](https://stellar.expert/explorer/testnet/tx/bab82f674a11418dfbabb43ccab4006fc252d6c2bbdf084ceb312320f87da13c) |

Token (native XLM SAC): `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
(unchanged; production = USDC, the contract is asset-agnostic).

### Verifiable transaction trail · full N=3 prefund cycle

| # | Action (server action) | Tx hash (explorer) | Result |
|---|---|---|---|
| 1 | `arisanCreate({name, memberTarget:3, sharePesos:1000, cadence:"Weekly"})` — host locks 3× share | [`6f3564de…66a646`](https://stellar.expert/explorer/testnet/tx/6f3564debf77b05d35cfde9c2f5ad5fc844a2b3cf662577bc85940fea566a646) | room_id=1, code `ZBBY3C` |
| 2 | `arisanFriendsJoin(1)` — friend1 + friend2 join via code, each locks 3× share | (two friend-signed `join_room` tx — effect proven by row 5's 3/3 seats) | joined=2 |
| 3 | `arisanStart(1)` — host opens the cycle | [`ae49b679…5b0db`](https://stellar.expert/explorer/testnet/tx/ae49b67940bb626f4abd700d07e4a46a0816120cc51fe26d67e12d2f0eac9a76) | status → Active |
| 4 | `arisanKocok(1)` round 1 — contract picks winner on-chain, transfers pot | [`4267d9c8…85472b`](https://stellar.expert/explorer/testnet/tx/4267d9c8e4e2d9aeb036127ef39f00276233a4de9d61ecc5bc97d07bc785472b) | winner = friend1 (Teman A) |
| 5 | `arisanKocok(1)` round 2 — pool excludes prior winner | [`c3301c05…04b17`](https://stellar.expert/explorer/testnet/tx/c3301c0599be2e52622749d6bc4e15c891fd51d0c71e3a05cec16e25d1e04b17) | winner = friend2 (Teman B) |
| 6 | `arisanKocok(1)` round 3 — final round | [`f21683d8…b052b`](https://stellar.expert/explorer/testnet/tx/f21683d8fe2faec3559b7ceed68a75cc3744f0d4f409bcefa8291ef5168b052b) | winner = host (You) · status → Done |

### What this proves

- **Real Stellar testnet**, not unit tests. Six independent transaction
  hashes above; each was signed by the relevant party (host or friend
  Friendbot-funded key) and confirmed `SUCCESS` by Soroban RPC.
- **Prefund model holds**: every member locked N × share *before* round 1.
  After three `kocok` calls, the pot was disbursed three times, the contract
  balance for this room returned to **exactly zero**, and **every member won
  exactly once** (no repeats — the pool excludes prior winners by design).
- **Status state machine is enforced on-chain**: `Open` → `Active` (after
  `start_room`) → `Done` (after the N-th `kocok`). `start_room` is gated on
  `members.len() == member_target`; `kocok` is gated on
  `now ≥ next_kocok_deadline`.
- **Late payment / default / abscond are structurally impossible**: there is
  no payment owed after join. A member who stops engaging still wins their
  turn — their already-locked share funds the pot for everyone.

### Honesty notes (Build-Award preview)

- **Winner selection is deterministic on `(room_id, round)`** — not Soroban
  PRNG. Reason: PRNG output isn't available during transaction-footprint
  simulation, so a PRNG-driven `transfer(winner, …)` would write to a
  different account at execution than at simulation time, failing with
  "outside the footprint." Deterministic + fair (each member draws once)
  is the testnet preview compromise; **commit-reveal or VRF** is the
  production path.
- **Cadences run in seconds, not days**, so a full N=3 cycle is observable
  in a hackathon demo (JOIN_WINDOW=60s, Weekly=60s, Biweekly=120s,
  Monthly=300s). Production values would be 3 days / 7 / 14 / 30 days
  respectively. The "Pratinjau · Build-Award" chip in the UI flags this
  openly.

---

## Historical — superseded caller-CSPRNG Arisan deployment

**Date:** 2026-05-23 (UTC; same day, follow-up deploy)
**Why an update:** the first Week-3 deploy hit Soroban's storage-footprint
guard whenever the contract picked random storage keys (`pick_code` for
invite codes, `gen_range` for winner addresses). The compromise was to make
those picks *deterministic* on `(room_id)` / `(room_id, round)` — which
worked, but anyone with the join order could pre-compute every winner before
round 1 and any open room's code could be enumerated from `room_count()`.

This deploy moves the entropy to where it can be both real and footprint-safe:
- the **caller's browser CSPRNG** (`crypto.getRandomValues`) generates the
  invite code and the winner index;
- the values arrive in the transaction's argument list, so simulation and
  execution see *identical* inputs and the storage footprint matches;
- the contract **validates** them on-chain (invite-code uniqueness via
  `RoomByCode(code)` collision check; `winner_idx < pool.len()`).

Soroban's on-chain PRNG would still be the more honest *contract-internal*
source — commit-reveal or VRF is the hardening path — but CSPRNG-at-the-edge
is true randomness, not a predictable LCG, and the contract still gets the
final say on what's accepted.

### Deployed contract

| Contract | Contract ID | Deploy tx |
|---|---|---|
| arisan-rooms (v2, CSPRNG) | `CDAUA3TN4PRJFVHWBITT2DZMCY24DEZRA4NQLZLEX5CKL6AOA6RLII4S` | [`5c07d689…22364`](https://stellar.expert/explorer/testnet/tx/5c07d6896fc778d71048a4457fca7bff475764d47ded7ece7a918213c3022364) |

Wasm upload tx: [`63a2ade1…18f9d9`](https://stellar.expert/explorer/testnet/tx/63a2ade1a1c5c61592068d3c0b233d4aee151ce7cd3adfac37e68c2a4218f9d9).
Init (XLM SAC) tx: [`f4b18aac…1aa1dbf`](https://stellar.expert/explorer/testnet/tx/f4b18aacab47f6df4a7b3451bc339953743e682fa35ba87e1b66408bd1aa1dbf).
The previous v1 contract id stays in this document for the historical trail
but is no longer the active id in `web/.env.local`.

### Verifiable transaction trail · full N=3 prefund cycle (v2)

Run via `cd web && npx tsx scripts/verify-arisan.mts`; ordering of winners
*differs from the v1 run* (the seed is now CSPRNG, not `room_id * golden`)
— exactly the property the fix was meant to restore.

| # | Action (server action) | Tx hash (explorer) | Result |
|---|---|---|---|
| 1 | `arisanCreate({name, memberTarget:3, sharePesos:1000, cadence:"Weekly"})` — client-gen code `S3KG8N`, contract checks uniqueness | [`1689a1c9…8a4300`](https://stellar.expert/explorer/testnet/tx/1689a1c9b034c4f801cc1d0f9368a6d075d582558a6741988673aa9f608a4300) | room_id=1, code `S3KG8N` |
| 2 | `arisanFriendsJoin(1)` — friend1 + friend2 join via code (each locks 3× share) | (two friend-signed `join_room` tx — effect proven by row 3's 3/3 seats) | joined=2 |
| 3 | `arisanStart(1)` — host opens the cycle | [`83f5420f…26014`](https://stellar.expert/explorer/testnet/tx/83f5420f8afa5f5e694e81af98a5476b6bd35a9d71e5500eec4eee5c94f26014) | status → Active |
| 4 | `arisanKocok(1)` round 1 — caller draws idx from CSPRNG, contract validates + pays | [`510f9de5…65e4fd`](https://stellar.expert/explorer/testnet/tx/510f9de5d2f1c439cc582a971740caea145fc1821a1fb8db25a473542665e4fd) | winner = host (You) |
| 5 | `arisanKocok(1)` round 2 — pool excludes prior winner | [`649fc675…1b3117`](https://stellar.expert/explorer/testnet/tx/649fc675c3c51195aa4eadeb6a196ba8e77e43758f6c02e9af8471b5131b3117) | winner = friend1 (Teman A) |
| 6 | `arisanKocok(1)` round 3 — final round | [`5d7d8966…c23fe0`](https://stellar.expert/explorer/testnet/tx/5d7d8966c3e5d277f3a8a9c2ac2dcdff33f55b09e26c1aa89b9c3c5163c23fe0) | winner = friend2 (Teman B) · status → Done |

### Updated honesty notes (Build-Award preview)

- **Winner is drawn from the caller's browser CSPRNG**
  (`crypto.getRandomValues`), submitted as a `kocok(room_id, caller,
  winner_idx)` argument, and validated on-chain (`winner_idx < pool.len`,
  caller in `members`, deadline reached, member not in `Won`). The contract
  remains the source of truth for "who's eligible"; the caller picks one
  from that eligible pool.
- **Invite codes are drawn from the same CSPRNG** (6 chars from the 32-char
  alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, ~10^9 space), checked for
  uniqueness on-chain via `RoomByCode(code)`. The client pre-flights up to 4
  candidates so a 1-in-billion collision still resolves cleanly.
- **No-repeat is still structurally enforced** by the pool construction: the
  contract builds the pool of unwon members each round and rejects any
  `winner_idx` outside that pool's length.
- **Cadences still run in seconds, not days**, for demo observability
  (preview-vs-prod numbers unchanged from the v1 notes above).
- **Hardening path:** commit-reveal or on-chain VRF would make the *contract
  itself* the source of unpredictability, removing trust in the caller's
  CSPRNG. That sits beyond the 30-day SOW; this deploy is the honest
  in-scope answer.

---

## Historical — superseded sealed-PRNG long-cadence deployment

**Date:** 2026-05-23 (UTC; same day as the v2 CSPRNG deploy).
**Why a separate variant:** the live demo contract above runs in SECONDS
(`JOIN_WINDOW=60s`, `Weekly=60s`, `Biweekly=120s`, `Monthly=300s`) so a full
N=3 cycle fits inside a hackathon demo. That's *wrong for mainnet* — a real
"weekly" arisan firing every 60 seconds is unusable. The fix is a cargo
feature flag, not a fork: same source, one flag, two binaries.

Build the demo variant (default — what's live on
`salapi-blond.vercel.app/arisan`):

```
stellar contract build --package arisan-rooms
```

Build the mainnet candidate (days-based timings):

```
stellar contract build --package arisan-rooms --features production-cadences
```

Cargo manifest:

```toml
[features]
default = []
production-cadences = []
```

`#[cfg(feature = "production-cadences")]` gates flip `JOIN_WINDOW` 60s →
3 days, `MAX_POSTPONE_SECONDS` 300s → 3 days, `GRACE_PERIOD` 180s → 14
days, and the `cadence_seconds` match so `Weekly`/`Biweekly`/`Monthly`
resolve to 7/14/30 days.

`cargo test -p arisan-rooms` passes 5/5 under **both** flag settings. The
existing tests use a 4-day `first_kocok` offset and 7-/14-day advance ticks
between rounds — safe margin for the production-cadences run, no test
parameterization needed.

### Deployed contract (testnet)

| Contract | Contract ID | Explorer |
|---|---|---|
| arisan-rooms (production-cadences) | `CASG62WFLR7FTBVSCG7PZ56HMSXJYZC23YYGNBIQUM2UW4WU7P6H6L4V` | [contract](https://stellar.expert/explorer/testnet/contract/CASG62WFLR7FTBVSCG7PZ56HMSXJYZC23YYGNBIQUM2UW4WU7P6H6L4V) |

Re-deployed 2026-06-13 with the **sealed-PRNG draw** (`seal_kocok` + deterministic
`kocok`, no caller-supplied winner_idx). The prior id
`CC2F3Y7TP72AZNGXAQWGXEDE2NLXCCW3ONGTAHW2SJG7BVLMSPIJEVYK` is the superseded
CSPRNG-at-edge variant. Deploy + init was confirmed on-chain; the transactions
remain visible on the contract explorer page linked above. (The demo variant
was also re-deployed with the
sealed draw: `ARISAN_ROOMS_CONTRACT = CAI2KBQW6ZCM7TNJVT3UXC5IW6VLBN4DFDORNICWMQFJM7NVLBSKV3Y2`.)

Recorded in `web/.env.local` as **`ARISAN_ROOMS_PROD_CONTRACT`** (separate
from `ARISAN_ROOMS_CONTRACT` so the live web app kept targeting the demo
variant). This contract and its removed WSL-only script are superseded by the
current D2 deployment above.

### What this proves

- **The mainnet candidate compiles, deploys, and initializes cleanly on
  testnet** under exactly the cargo flag the mainnet runbook will use.
- **There are no two divergent forks of the contract** — same source, one
  flag. Anyone reviewing can verify both variants from a single review.
- **The hackathon-required "Mainnet" deploy step** is tracked separately from
  this public Testnet evidence; the `arisan_rooms` build step uses
  `--features production-cadences`. Live web stays on the demo
  variant so the public N=3 cycle remains observable in ~3 minutes.

---

## Visual evidence — live testnet app, captured 2026-05-30

Reviewers don't have to take our word for the on-chain trail — they can also
see the running UI. The screenshots below were captured directly against the
live production deploy at `https://salapi-blond.vercel.app` using
[vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser)
(a native Rust CDP CLI). Each flow is captured at two viewports so
mobile-first behavior and desktop layout are both visible.

**Reproduce locally:**

```bash
npm install -g agent-browser   # one-time, native Rust binary
agent-browser install          # auto-detects existing Chrome
node scripts/capture-evidence.mjs   # writes evidence/*.png
```

The script visits 7 routes × 2 viewports = 14 PNGs in `evidence/`, no auth
required for any of them (all flows render the unauthenticated state of
each screen).

<table>
<thead>
<tr><th>#</th><th>Flow</th><th>Route</th><th>Mobile · 375×812</th><th>Desktop · 1440×900</th></tr>
</thead>
<tbody>
<tr><td>1</td><td>Home / V7 dashboard</td><td><code>/</code></td>
<td><img src="evidence/01-home-mobile.png" width="180"></td>
<td><img src="evidence/01-home-desktop.png" width="360"></td></tr>
<tr><td>2</td><td>Disaster Vault — public ledger</td><td><code>/transparency</code></td>
<td><img src="evidence/02-disaster-public-mobile.png" width="180"></td>
<td><img src="evidence/02-disaster-public-desktop.png" width="360"></td></tr>
<tr><td>3</td><td>Vaults overview</td><td><code>/vaults</code></td>
<td><img src="evidence/03-vaults-mobile.png" width="180"></td>
<td><img src="evidence/03-vaults-desktop.png" width="360"></td></tr>
<tr><td>4</td><td>Paluwagan — rotating savings</td><td><code>/paluwagan</code></td>
<td><img src="evidence/04-paluwagan-mobile.png" width="180"></td>
<td><img src="evidence/04-paluwagan-desktop.png" width="360"></td></tr>
<tr><td>5</td><td>Smart Savings vault</td><td><code>/savings</code></td>
<td><img src="evidence/05-savings-mobile.png" width="180"></td>
<td><img src="evidence/05-savings-desktop.png" width="360"></td></tr>
<tr><td>6</td><td>Send by @username</td><td><code>/send</code></td>
<td><img src="evidence/06-send-mobile.png" width="180"></td>
<td><img src="evidence/06-send-desktop.png" width="360"></td></tr>
<tr><td>7</td><td>Salapi Circles (Build-Award preview)</td><td><code>/circles</code></td>
<td><img src="evidence/07-circles-mobile.png" width="180"></td>
<td><img src="evidence/07-circles-desktop.png" width="360"></td></tr>
</tbody>
</table>

### What the screenshots prove

- **Day-30 SOW scope is shipped, not just compiled.** All 5 day-30 flows
  (Disaster public ledger, Vaults overview, Paluwagan, Smart Savings, Send
  by @username) render the real UI on the live production URL — not a
  staging or local instance.
- **Mobile-first is honest.** The mobile column is captured at iPhone X
  dimensions (375×812). No screen relies on desktop hover or breakpoint
  tricks to be usable.
- **Brand consistency.** Every screen ships the same nav shell (Home /
  Vaults / center action / Activity / You) and "Powered by Stellar"
  attribution — the crypto-invisible thesis isn't just on the home page.
- **Build-Award vision is in the codebase.** `/circles` exists and renders
  (row 7), labelled as the Build-Award expansion of the Disaster Vault
  primitive.

### Post-deploy smoke test (operational)

The same browser primitive backs a post-deploy smoke test that runs at the
end of `scripts/sync-vercel-env.mjs`. After Vercel reports `READY`,
`scripts/vercel-check.mjs` invokes `scripts/post-deploy-smoke.mjs` against
the production alias, asserts the hero text renders, and exits non-zero on
`Application error` / `500` / `404` / missing brand. This closes the
silent failure mode where a build is green but the page is broken.

---

## Disaster Vault — pool scaled to ~$2M (live testnet figure), 2026-06-02

**Date:** 2026-06-02 (UTC, per on-chain ledger close time)
**Contract:** disaster (hero) `CCKQ3UVBZ75KSZDO6IPA5U6PFARJG4PLRGN2SAIW5RAGQ6K4B7ZDWBUZ`

The public **"Disaster Vault · POOL TOTAL · LIVE"** figure — shown on
`/transparency`, `/vaults`, home, and the landing prototype — reads `total()`
straight off this contract (`disasterState()` → `stroopsToPesos()` →
display). For the AIBC pitch the pool was filled with **real testnet XLM**
until `total()` ≈ a $2,000,000-equivalent figure. **Nothing is hardcoded:**
the number the app renders *equals* `total()`, and "Verify on stellar.expert"
resolves to this contract so anyone can check it.

> **This is testnet XLM (Friendbot faucet — no real-world value).** The honest
> framing is *"this is the scale the rail can move and account for, on a public
> network, verifiable by anyone"* — not a claim of real custody of $2M. All
> TESTNET / PREVIEW / SANDBOX badges remain in place.

### How (reproduce: `cd web && npx tsx scripts/fill-disaster-vault.mts --target-usd 2000000`)

1. **Mint** — 1,800 fresh testnet accounts, each Friendbot-funded with 10,000 XLM.
2. **Consolidate** — each account swept (classic native `payment`) into one hub
   `GCSMQCQYSJNS42EUSLNQTWDBLSAITYZP3B2LIC2632VV4X4ENTMHVKTO`
   (a throwaway consolidation account; **not** the app's demo signer, whose gas
   balance is left untouched).
3. **Contribute** — the hub invoked `contribute()` 60 times (one per batch).
   Each call is a **real** native-XLM SAC `transfer` into the vault followed by
   `Total += amount` (`total = Σ contributions − Σ disbursements`; no
   disbursements were made this round).

### Result (independently re-read from chain — `cd web && npx tsx scripts/verify-fill.mts`)

| Quantity | Value |
|---|---|
| `total()` (stroops) | `180884964899773` |
| `total()` (XLM) | 18,088,496.49 |
| Display (PHP, ₱6.5/XLM) | ₱117,575,227.18 |
| Display (USD anchor, ₱58/$) | **$2,027,159.09** |
| Vault custody — native-XLM SAC `balance(contract)` | 18,088,496.49 XLM — **equals `total()`** |
| `is_disaster_active()` | true |

The SAC-balance check is the proof that matters: the vault **holds** the XLM,
so `total()` is backed by real on-chain custody — not a free-floating counter.

### Representative contribute tx hashes

Each confirmed `successful=true` on Horizon testnet **and** HTTP 200 on the
stellar.expert API; ledger range 2,878,245 → 2,878,582.

| Batch | Tx hash (explorer) | Ledger |
|---|---|---|
| 1 | [`7ae2c1edd8…`](https://stellar.expert/explorer/testnet/tx/7ae2c1edd894c87acc0300dc98a48997947caba441f4dc52258424e8d3afa293) | 2,878,245 |
| 2 | [`5e38ca7ad2…`](https://stellar.expert/explorer/testnet/tx/5e38ca7ad221eb3647bd91bee6a7baebbdadd118d77992370ece2f70787d7a5f) | 2,878,249 |
| 3 | [`9f0c27ac66…`](https://stellar.expert/explorer/testnet/tx/9f0c27ac66b3a26d3436a5c81231d410632ab7555d331463534339d32bee30ca) | 2,878,253 |
| 58 | [`67d0d2aeb3…`](https://stellar.expert/explorer/testnet/tx/67d0d2aeb3768d71f3d0d62303dd6959df167b9ff3291f10bfb0e040628e983e) | 2,878,574 |
| 59 | [`1486ebfdd9…`](https://stellar.expert/explorer/testnet/tx/1486ebfdd91d3c313e77fe7e2e4dc607d49a70a9af438e70115b42a49438c799) | 2,878,578 |
| 60 | [`c3c4af1b39…`](https://stellar.expert/explorer/testnet/tx/c3c4af1b39b98eb5870bd041c40a01117e3544d8678abc30ece4d55b123cd21b) | 2,878,582 |

60 contribute transactions in all (1,798 of 1,800 funded accounts swept; 2
sweeps failed and were skipped — those funds simply weren't contributed).
Verify any hash with `bash scripts/wsl-verify-tx.sh <hash …>` or
`cd web && npx tsx scripts/verify-fill.mts <hash …>`. Contract page:
`https://stellar.expert/explorer/testnet/contract/CCKQ3UVBZ75KSZDO6IPA5U6PFARJG4PLRGN2SAIW5RAGQ6K4B7ZDWBUZ`

### What this proves

- **The live figure is real and on-chain** — `/transparency` and the landing
  snapshot show `total()` ≈ $2.03M because the vault genuinely holds 18.09M
  testnet XLM (verified via the contract's own SAC balance).
- **Auditable end to end, no login** — open the contract on stellar.expert,
  read `total()`, walk the contribute trail.
- **No real money, no mainnet** — every XLM came from the testnet Friendbot
  faucet; badges stay TESTNET / PREVIEW.
