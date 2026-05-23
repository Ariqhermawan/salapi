#!/usr/bin/env bash
# Verify the postpone_kocok contract path live: read KocokAt before/after
# a postpone, then call postpone again (expect AlreadyPostponed). Uses
# the same salapi-demo signer the live app uses, so a successful run
# proves the host-only path works end-to-end on the deployed contract.
set -euo pipefail
export PATH="/usr/local/bin:$HOME/.cargo/bin:$PATH"
cd /mnt/c/Users/Lenovo/OneDrive/Documents/Claude/Projects/Hackathon

CID="${ARISAN_ROOMS_CONTRACT:-CDAUA3TN4PRJFVHWBITT2DZMCY24DEZRA4NQLZLEX5CKL6AOA6RLII4S}"
ROOM="${1:-2}"
ROUND="${2:-1}"
DEMO="$(stellar keys address salapi-demo)"

echo "contract=$CID  host=$DEMO  room=$ROOM  round=$ROUND"
echo
echo "=== BEFORE: kocok_at($ROOM, $ROUND) ==="
stellar contract invoke --id "$CID" --source salapi-demo --network testnet -- \
  kocok_at --room_id "$ROOM" --round "$ROUND" 2>&1 | tail -3

echo
echo "=== postpone_kocok (1st call, delay=60) ==="
stellar contract invoke --id "$CID" --source salapi-demo --network testnet --send=yes -- \
  postpone_kocok --room_id "$ROOM" --host "$DEMO" --delay 60 2>&1 | tail -10

echo
echo "=== AFTER 1st: kocok_at($ROOM, $ROUND) ==="
stellar contract invoke --id "$CID" --source salapi-demo --network testnet -- \
  kocok_at --room_id "$ROOM" --round "$ROUND" 2>&1 | tail -3

echo
echo "=== postpone_kocok (2nd call, must reject) ==="
stellar contract invoke --id "$CID" --source salapi-demo --network testnet --send=yes -- \
  postpone_kocok --room_id "$ROOM" --host "$DEMO" --delay 60 2>&1 | tail -10 || true
