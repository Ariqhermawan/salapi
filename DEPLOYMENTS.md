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
