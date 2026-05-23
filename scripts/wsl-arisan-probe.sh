#!/usr/bin/env bash
# One-shot probe of arisan_rooms.create_room via stellar-cli to surface a
# richer error than the JS RPC layer can show. Args mirror what arisanCreate
# does for the demo, but with a wider safety buffer on first_kocok.
set -euo pipefail
export PATH="/usr/local/bin:$HOME/.cargo/bin:$PATH"
cd /mnt/c/Users/Lenovo/OneDrive/Documents/Claude/Projects/Hackathon

CID="${ARISAN_ROOMS_CONTRACT:-CC6KS422MFCMAC7R654R4KSY47HO2IBHJLKBQACL5M6XXPXXISSVLCCP}"
DEMO="$(stellar keys address salapi-demo)"
NOW="$(date +%s)"
FK=$((NOW + 180))
JD=$((NOW + 120))

echo "demo=$DEMO"
echo "now=$NOW first_kocok=$FK join_deadline=$JD"

stellar contract invoke \
  --id "$CID" --source salapi-demo --network testnet -- \
  create_room \
  --host "$DEMO" \
  --name VerifyProbe \
  --member_target 3 \
  --share 1000000000 \
  --cadence Weekly \
  --first_kocok "$FK" \
  --join_deadline "$JD"
