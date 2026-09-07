// Deliverable 2 end-to-end proof on Stellar Testnet.
//
// One N=3 prefunded cycle proves all required paths:
//   round 1 — every eligible member commits and reveals (normal path)
//   round 2 — every eligible member commits, only one reveals (timeout path)
//   round 3 — no eligible member reveals (deterministic liveness fallback)
// The final assertions require three distinct winners, Done status, and an
// actual zero balance read from the deployed contract.
//
// Run from web/: npx tsx scripts/verify-arisan.mts

import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const value = line.trim();
  if (!value || value.startsWith("#")) continue;
  const separator = value.indexOf("=");
  if (separator < 0) continue;
  process.env[value.slice(0, separator)] = value.slice(separator + 1);
}

const A = await import("../app/actions");

async function waitUntil(timestamp: number, reason: string) {
  const milliseconds = Math.max(
    0,
    (timestamp - Math.floor(Date.now() / 1000) + 2) * 1000
  );
  if (milliseconds === 0) return;
  console.log(`   waiting ${Math.ceil(milliseconds / 1000)}s — ${reason}`);
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function roomState(roomId: number) {
  const state = await A.arisanRoomState(roomId);
  if (!state.ready) throw new Error(`room read failed: ${state.error ?? "unknown"}`);
  return state;
}

async function fundSigners() {
  for (const key of ["SALAPI_DEMO_PUBLIC", "FRIEND1_PUBLIC", "FRIEND2_PUBLIC"]) {
    const address = process.env[key];
    if (!address) continue;
    try {
      await fetch(`https://friendbot.stellar.org/?addr=${address}`, {
        cache: "no-store",
      });
    } catch {
      // Already-funded Testnet accounts are expected.
    }
  }
}

async function commitAll(roomId: number) {
  const before = await roomState(roomId);
  const me = before.seats.find((seat) => seat.isYou);
  if (me && !me.won && !me.committed) {
    const result = await A.arisanCommit(roomId);
    if (!result.ok) throw new Error(`host commit failed: ${result.error}`);
    console.log(`   host commit: ${result.link}`);
  }
  const friends = await A.arisanFriendsCommit(roomId);
  if (!friends.ok) throw new Error(`friend commit failed: ${friends.error}`);
  for (const link of friends.links) console.log(`   friend commit: ${link}`);
  const after = await roomState(roomId);
  if (after.commitCount !== after.eligibleCount) {
    throw new Error(
      `expected ${after.eligibleCount} commitments, got ${after.commitCount}`
    );
  }
  return after;
}

async function revealAll(roomId: number) {
  const before = await roomState(roomId);
  const me = before.seats.find((seat) => seat.isYou);
  if (me && !me.won && me.committed && !me.revealed) {
    const result = await A.arisanReveal(roomId);
    if (!result.ok) throw new Error(`host reveal failed: ${result.error}`);
    console.log(`   host reveal: ${result.link}`);
  }
  const friends = await A.arisanFriendsReveal(roomId);
  if (!friends.ok) throw new Error(`friend reveal failed: ${friends.error}`);
  for (const link of friends.links) console.log(`   friend reveal: ${link}`);
  const after = await roomState(roomId);
  if (after.revealCount !== after.commitCount) {
    throw new Error(
      `expected ${after.commitCount} reveals, got ${after.revealCount}`
    );
  }
  return after;
}

async function revealExactlyOne(roomId: number) {
  const before = await roomState(roomId);
  const me = before.seats.find((seat) => seat.isYou);
  if (me && !me.won && me.committed) {
    const result = await A.arisanReveal(roomId);
    if (!result.ok) throw new Error(`single reveal failed: ${result.error}`);
    console.log(`   only reveal: ${result.link}`);
  } else {
    const result = await A.arisanFriendsReveal(roomId, 1);
    if (!result.ok || result.submitted !== 1) {
      throw new Error(`single friend reveal failed: ${result.error ?? "none"}`);
    }
    console.log(`   only reveal: ${result.links[0]}`);
  }
  const after = await roomState(roomId);
  if (after.revealCount !== 1 || after.commitCount !== 2) {
    throw new Error(
      `timeout setup expected commits=2 reveals=1, got ${after.commitCount}/${after.revealCount}`
    );
  }
  return after;
}

async function finalize(roomId: number, expectedRound: number) {
  const before = await roomState(roomId);
  await waitUntil(before.revealAt, `round ${expectedRound} reveal deadline`);
  const result = await A.arisanFinalize(roomId);
  if (!result.ok) throw new Error(`finalize r${expectedRound} failed: ${result.error}`);
  console.log(`   round ${expectedRound} winner: ${result.winnerLabel}`);
  console.log(`   finalize: ${result.link}`);
  return result.winner;
}

async function main() {
  console.log("== Arisan commit-reveal · Deliverable 2 Testnet proof ==");
  console.log("contract:", process.env.ARISAN_ROOMS_CONTRACT);
  if (!process.env.ARISAN_ROOMS_CONTRACT) {
    throw new Error("ARISAN_ROOMS_CONTRACT not set");
  }
  if (!process.env.FRIEND1_PUBLIC || !process.env.FRIEND2_PUBLIC) {
    throw new Error("FRIEND1/FRIEND2 keys not set in .env.local");
  }
  await fundSigners();

  console.log("\n[1/7] create and prefund a three-member room");
  const created = await A.arisanCreate({
    name: "Verify · Arisan Rooms",
    memberTarget: 3,
    share: { amount: "6.50", currency: "tl" },
    cadence: "Weekly",
  });
  if (!created.ok) throw new Error(`create failed: ${created.error}`);
  const roomId = created.id;
  console.log(`   room=${roomId} code=${created.code}`);
  console.log(`   create: ${created.link}`);
  const joined = await A.arisanFriendsJoin(roomId);
  if (!joined.ok || joined.joined !== 2) {
    throw new Error(`friend join failed: ${joined.error ?? joined.joined}`);
  }
  const started = await A.arisanStart(roomId);
  if (!started.ok) throw new Error(`start failed: ${started.error}`);
  console.log(`   start: ${started.link}`);

  console.log("\n[2/7] round 1 normal path — 3 commits");
  const round1Commit = await commitAll(roomId);
  await waitUntil(round1Commit.commitAt, "round 1 reveal window");

  console.log("\n[3/7] round 1 normal path — 3 reveals and finalize");
  await revealAll(roomId);
  const winners = [await finalize(roomId, 1)];

  console.log("\n[4/7] round 2 timeout path — 2 commits, 1 reveal");
  const round2Commit = await commitAll(roomId);
  await waitUntil(round2Commit.commitAt, "round 2 reveal window");
  await revealExactlyOne(roomId);
  winners.push(await finalize(roomId, 2));

  console.log("\n[5/7] round 3 liveness path — commit, no reveal");
  const round3Commit = await commitAll(roomId);
  await waitUntil(round3Commit.revealAt, "round 3 no-reveal timeout");
  winners.push(await finalize(roomId, 3));

  console.log("\n[6/7] verify final state and distinct winners");
  const final = await roomState(roomId);
  if (final.status !== "Done") throw new Error(`expected Done, got ${final.status}`);
  if (new Set(winners).size !== 3) throw new Error("winner repeated");
  if (final.seats.some((seat) => !seat.won)) throw new Error("a member never won");
  console.log(
    `   status=${final.status}, winners=${final.winners.map((winner) => winner.label).join(", ")}`
  );

  console.log("\n[7/7] verify deployed contract has zero residual balance");
  const balance = await A.arisanContractBalance();
  if (!balance.ready) throw new Error(`balance read failed: ${balance.error}`);
  if (balance.stroops !== "0") {
    throw new Error(`expected zero residual, got ${balance.stroops} stroops`);
  }
  console.log("   contract balance=0 stroops");
  console.log("\nPASS · normal, non-reveal timeout, fallback, and zero residual verified");
}

main().catch((error) => {
  console.error("FAIL:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
