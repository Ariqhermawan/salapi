import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Run the actual display action with isolated public-read dependencies. Signing,
// provisioning, network and transactions are forbidden by this fixture.
const source = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
const tree = ts.createSourceFile("actions.ts", source, ts.ScriptTarget.Latest, true);
const action = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "arisanRoomState");
assert.ok(action, "The real arisanRoomState action must exist");
const code = ts.transpileModule(action.getText(tree), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

type Seat = { addr: string; fundedStroops: string | null; won: boolean; committed: boolean; revealed: boolean; isYou: boolean };
type State = { ready: true; seats: Seat[]; code: string | null; isMember: boolean; isHost: boolean; canFinalize: boolean }
  | { ready: false; error?: string };
type Options = {
  status?: "Open" | "Active" | "Done" | "Dissolved";
  locked?: unknown[];
  verified?: boolean;
  preview?: boolean;
  gate?: boolean;
};
const members = ["isolated-host", "isolated-member-a", "isolated-member-b"];
const maxI128 = (1n << 127n) - 1n;
const flush = async () => { for (let turn = 0; turn < 40; turn++) await Promise.resolve(); };

function harness(options: Options = {}) {
  const reads: { method: string; args: unknown[] }[] = [];
  const gates: (() => void)[] = [];
  let identity = 0, authorization = 0;
  const exports = {} as { arisanRoomState(roomId: number): Promise<State> };
  const forbidden = () => { throw Error("No signing, network or transaction is authorized"); };
  runInNewContext(code, {
    exports, isLocalPreview: options.preview ?? false,
    validArisanRoomId: (id: unknown) => typeof id === "number" && Number.isInteger(id) && id > 0 && id <= 0xffff_ffff,
    arisanRoomsId: () => "isolated-contract",
    currentArisanPublicKey: async () => { identity++; return members[0]; },
    authenticatedArisanWallet: async () => { authorization++; return options.verified === false
      ? { ok: false } : { ok: true, publicKey: members[0] }; },
    readArisanRoom: async () => ({
      host: members[0], name: "Isolated deposit room", code: "234567", shareStroops: 10_000_000n,
      memberTarget: 3, memberCount: 3, status: options.status ?? "Open", cadence: "Weekly",
      firstKocok: 1_800_000_000, joinDeadline: 1_799_999_900, round: options.status === "Done" ? 4 : 1,
    }),
    readContract: async (contractId: string, method: string, args: unknown[] = []) => {
      assert.equal(contractId, "isolated-contract");
      assert.equal(args[0], 7);
      reads.push({ method, args });
      if (method === "get_members") return members;
      if (options.gate && ["has_won", "has_committed", "has_revealed", "locked_of"].includes(method))
        await new Promise<void>(resolve => gates.push(resolve));
      if (method === "locked_of") {
        const value = (options.locked ?? [30_000_000n, 30_000_000n, 30_000_000n])[members.indexOf(args[1] as string)];
        if (value instanceof Error) throw value;
        return value;
      }
      if (method === "has_won") return options.status === "Done";
      if (method === "has_committed" || method === "has_revealed") return false;
      if (method === "draw_phase") return "Finalizable";
      if (["kocok_at", "reveal_at"].includes(method)) return 1_800_000_000;
      if (["commit_count", "reveal_count"].includes(method)) return 0;
      if (method === "winner_of") return members[Number(args[1]) - 1];
      throw Error(`Unexpected public read ${method}`);
    },
    sc: { u32: (value: number) => value, addr: (value: string) => value },
    arisanNormalizeDrawPhase: (value: unknown) => value,
    arisanLabelOf: (addr: string, viewer: string | null) => addr === viewer ? "You" : addr,
    ARISAN_CADENCE_SECS: { Weekly: 60 }, stroopsToPesos: (value: bigint) => Number(value) / 10_000_000 * 6.5,
    fmtPeso: String, fetch: forbidden, getSigner: forbidden, getAuthenticatedSigner: forbidden,
    invokeAs: forbidden, require: forbidden,
  });
  return { run: exports.arisanRoomState, reads, gates, counts: () => ({ identity, authorization }) };
}

test("room seats expose exact historical i128 deposits, including legitimate zero and maximum, in member order", async () => {
  const h = harness({ locked: [90_071_992_547_409_931n, 0n, maxI128] });
  const result = await h.run(7);
  assert.equal(result.ready, true); if (!result.ready) assert.fail("Expected public room state");
  assert.deepEqual(Array.from(result.seats, seat => [seat.addr, seat.fundedStroops]), [
    [members[0], "90071992547409931"], [members[1], "0"], [members[2], maxI128.toString()],
  ]);
  assert.equal(h.reads.filter(read => read.method === "locked_of").length, 3);
  assert.equal(result.isMember, true); assert.equal(result.code, "234567");
});

test("one failed deposit read is unknown, never zero, and does not hide the other room seats", async () => {
  const h = harness({ locked: [30_000_000n, new Error("Isolated private provider diagnostics"), 0n] });
  const result = await h.run(7);
  assert.equal(result.ready, true); if (!result.ready) assert.fail("A deposit read failure must not hide a readable room");
  assert.deepEqual(Array.from(result.seats, seat => seat.fundedStroops), ["30000000", null, "0"]);
  assert.doesNotMatch(JSON.stringify(result), /private provider diagnostics/);
});

test("negative, overflowing, lossy and malformed values are unknown rather than invented deposit amounts", async () => {
  for (const value of [-1n, maxI128 + 1n, 0, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity,
    "30000000", "", null, undefined, {}, true]) {
    const result = await harness({ locked: [value, 30_000_000n, 0n] }).run(7);
    assert.equal(result.ready, true); if (!result.ready) assert.fail("Expected public room state");
    assert.equal(result.seats[0].fundedStroops, null, `Invalid ${String(value)} must be unknown`);
    assert.equal(result.seats[1].fundedStroops, "30000000");
  }
});

test("deposit reads start alongside won and commit/reveal reads, not as a second per-seat waterfall", async () => {
  const h = harness({ status: "Active", gate: true });
  const pending = h.run(7);
  await flush();
  assert.equal(h.gates.length, 12, "All four independent public reads per seat should have started");
  assert.deepEqual(h.reads.filter(read => read.method === "locked_of").map(read => read.args[1]), members);
  for (const release of h.gates.splice(0)) release();
  const result = await pending;
  assert.equal(result.ready, true); if (!result.ready) assert.fail("Expected readable active room");
  assert.equal(result.canFinalize, true);
});

test("Done values remain historical while zero and retained Dissolved values are reported without status-based fabrication", async () => {
  for (const [status, locked] of [
    ["Done", [30_000_000n, 30_000_000n, 30_000_000n]],
    ["Dissolved", [0n, 0n, 0n]],
    ["Dissolved", [30_000_000n, 30_000_000n, 30_000_000n]],
  ] as const) {
    const result = await harness({ status, locked: [...locked] }).run(7);
    assert.equal(result.ready, true); if (!result.ready) assert.fail("Expected closed room history");
    assert.deepEqual(Array.from(result.seats, seat => seat.fundedStroops), locked.map(String));
    assert.equal(result.canFinalize, false);
  }
});

test("new public deposit fields never grant unverified membership, code visibility, signing or preview network access", async () => {
  const h = harness({ status: "Active", verified: false }), result = await h.run(7);
  assert.equal(result.ready, true); if (!result.ready) assert.fail("Public state remains readable");
  assert.equal(result.code, null); assert.equal(result.isMember, false); assert.equal(result.isHost, false);
  assert.equal(result.canFinalize, false); assert.ok(result.seats.every(seat => !seat.isYou));
  assert.ok(result.seats.every(seat => seat.fundedStroops === "30000000"));
  const preview = harness({ preview: true });
  assert.equal((await preview.run(7)).ready, false);
  assert.equal(preview.reads.length, 0); assert.deepEqual(preview.counts(), { identity: 0, authorization: 0 });
});
