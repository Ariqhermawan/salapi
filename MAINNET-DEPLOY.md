# Salapi - Stellar Mainnet Deployment Runbook

**For:** Edwin (or whoever holds the team's Stellar keys).

**Why:** The Stellar PH Hackathon 2026 submission requires the MVP deployed to
Stellar **Mainnet** (Stage 2), with Stellar Expert (Mainnet) screenshots.
Salapi's 6 contracts are currently **Testnet only** (see `DEPLOYMENTS.md`).
This runbook deploys the same, already-tested contracts to Mainnet —
`arisan_rooms` is rebuilt with the `production-cadences` feature flag so the
mainnet wasm uses real day-based timings instead of the seconds-based demo.

It is the exact Testnet process you already ran (`scripts/wsl-deploy-testnet.sh`)
with only two changes: a real funded account instead of a Friendbot one, and
the `mainnet` network.

---

## Scope - recommended: MINIMAL

**MINIMAL (this runbook):** deploy the **6 contracts** to Mainnet, record the
contract IDs, screenshot them on Stellar Expert. This satisfies the hackathon
requirement. The live app stays Testnet-facing, so no real user money moves and
the app's "Testnet version" labelling stays accurate and honest.

**FULL (do NOT rush this for the deadline):** repointing the app's managed
signer and `web/.env.local` to Mainnet so the app itself runs on real XLM. That
is a real custody and security decision. Keep it as a separate, deliberate task;
it is NOT required to satisfy the hackathon checklist.

---

## Prerequisite - the one real blocker (only the team can do this)

You need ONE funded Stellar **Mainnet** account.

- Friendbot does NOT exist on Mainnet, so there is no free funding.
- The hackathon provides XLM to registered teams. Claim it: ask the organizers
  in the Telegram group how and where (you give them a Mainnet address, they
  send XLM).
- Budget: 6 contract deploys plus the account reserve. Aim for roughly 25 to 35
  XLM available to be safe.
- The account's **secret key stays with you.** Never paste it into any chat,
  document, or tool, and never share it with anyone (including any AI assistant).

If you do not have this funded account yet, STOP. Getting it is today's priority.

---

## Steps (run in WSL, same environment as the Testnet deploy)

### 1. Configure the Mainnet network

```
stellar network add mainnet \
  --rpc-url <CURRENT_MAINNET_RPC_URL> \
  --network-passphrase "Public Global Stellar Network ; September 2015"
```

The passphrase above is a fixed constant. For `<CURRENT_MAINNET_RPC_URL>` use
the current public Mainnet Soroban RPC (see developers.stellar.org) or your own
RPC provider's URL.

### 2. Set up the deployer identity

```
stellar keys generate mainnet-deployer      # NOTE: no --fund (no Friendbot on Mainnet)
stellar keys address mainnet-deployer        # send the hackathon XLM to THIS address
```

Wait until it is funded, then verify at:
`https://stellar.expert/explorer/public/account/<address>`

### 3. Build the contracts

```
cd /mnt/c/Users/Lenovo/OneDrive/Documents/Claude/Projects/Hackathon
export CARGO_TARGET_DIR="$HOME/salapi-target"
stellar contract build
# Rebuild arisan_rooms with the production-cadences feature flag so the wasm
# deployed to Mainnet uses real 7d/14d/30d cadences (not the 60s/120s/300s
# preview values used by the live Testnet demo). The second build overwrites
# the default arisan_rooms.wasm.
stellar contract build --package arisan_rooms --features production-cadences
```

Produces the 6 wasm files in `$HOME/salapi-target/wasm32v1-none/release/`.

### 4. Deploy the 6 contracts to Mainnet

```
W="$HOME/salapi-target/wasm32v1-none/release"
stellar contract deploy --wasm "$W/base_vault.wasm"        --source mainnet-deployer --network mainnet
stellar contract deploy --wasm "$W/username_registry.wasm" --source mainnet-deployer --network mainnet
stellar contract deploy --wasm "$W/disaster.wasm"          --source mainnet-deployer --network mainnet
stellar contract deploy --wasm "$W/paluwagan.wasm"         --source mainnet-deployer --network mainnet
stellar contract deploy --wasm "$W/smart_savings.wasm"     --source mainnet-deployer --network mainnet
stellar contract deploy --wasm "$W/arisan_rooms.wasm"      --source mainnet-deployer --network mainnet
```

Run them one at a time and **record each printed Contract ID** (`C...`).

Gotcha (same as Testnet): the first 64-hex string in stderr is the WASM hash,
NOT the deploy tx hash. The real tx is on the explorer / "Signing transaction"
line.

### 5. (Optional) Initialize

Only needed if you want the Mainnet contracts functional, not just deployed.
For the hackathon "deployed + screenshot" requirement, step 4 alone is enough.

```
TOKEN=$(stellar contract id asset --asset native --network mainnet)
stellar contract invoke --id <disaster_id>      --source mainnet-deployer --network mainnet -- initialize --admin <mainnet-deployer-address> --token "$TOKEN"
stellar contract invoke --id <smart_savings_id> --source mainnet-deployer --network mainnet -- initialize --token "$TOKEN"
stellar contract invoke --id <arisan_rooms_id>  --source mainnet-deployer --network mainnet -- initialize --token "$TOKEN"
# paluwagan initialize also needs --members and --amount; see scripts/wsl-paluwagan-setup.sh
```

### 6. Screenshots for the submission

For each contract, open and screenshot:
`https://stellar.expert/explorer/public/contract/<CONTRACT_ID>`
(On stellar.expert, `public` is the Mainnet network.)

### 7. Hand back to finish the README

Send the 6 Mainnet contract IDs and the screenshots to Ariq. The repo README
"Deployment" section (Testnet + Mainnet, in the hackathon's required format)
gets filled in from those.

---

## Notes

- Mainnet transactions are real and permanent. Deploy fees are small but real.
- Deploy deliberately, one contract at a time, confirming each succeeds.
- This runbook does NOT touch `web/.env.local` or the app. Minimal scope only.
