import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { arisanRoomPage } from "../lib/arisan-list.ts";

// Execute the actual action body without loading signing helpers, credentials,
// network clients or another owner's personal state into this isolated test.
const source = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
const tree = ts.createSourceFile("actions.ts", source, ts.ScriptTarget.Latest, true);
const action = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "arisanList");
assert.ok(action, "The real arisanList action must exist");
const actionSource = action.getText(tree);
type Row = { id: number; isMember: boolean; isHost: boolean; code: string | null };
type Page = { ready: true; total: number; mine: Row[]; nextCursor: number | null } | { ready: false; error?: string };
type Kind = "count" | "room" | "members";
type Read = { kind: Kind; id: number; resolve(): void; reject(): void };

const flush = async () => { for (let turn = 0; turn < 15; turn++) await Promise.resolve(); };
function harness(options: { count?: number; serial?: boolean; verified?: boolean; preview?: boolean; members?: number[] } = {}) {
  const count = options.count ?? 8;
  const reads: { kind: Kind; id: number }[] = [], pending: Read[] = [], roomIds: number[] = [];
  let active = 0, peak = 0, waves = 0, identity = 0, authorization = 0;
  const request = <T,>(kind: Kind, id: number, value: T): Promise<T> => {
    reads.push({ kind, id });
    if (kind === "room") roomIds.push(id);
    peak = Math.max(peak, ++active);
    return new Promise<T>((resolve, reject) => {
      pending.push({ kind, id, resolve: () => resolve(value), reject: () => reject(Error("Isolated provider failure")) });
    }).finally(() => { active--; });
  };
  const exports = {} as { arisanList(cursor?: unknown): Promise<Page> };
  // A serial reference uses exactly the same action and validation code, with
  // only its worker count changed to one. This is a scheduling benchmark, not
  // a production latency or RPC-provider performance claim.
  const selected = options.serial ? actionSource.replace("Math.min(4, page.ids.length)", "Math.min(1, page.ids.length)") : actionSource;
  const code = ts.transpileModule(selected, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, {
    exports, isLocalPreview: options.preview ?? false, arisanRoomsId: () => "isolated-contract",
    currentArisanPublicKey: async () => { identity++; return "isolated-owner"; },
    authenticatedArisanWallet: async () => { authorization++; return options.verified === false
      ? { ok: false } : { ok: true, publicKey: "isolated-owner" }; },
    readContract: (_id: string, method: string, args: number[] = []) => {
      if (method === "room_count") return request("count", 0, count);
      if (method === "get_members") return request("members", args[0],
        options.members === undefined || options.members.includes(args[0]) ? ["isolated-owner"] : []);
      throw Error(`Unexpected contract method ${method}`);
    },
    readArisanRoom: (_id: string, id: number) => request("room", id, {
      name: `Room ${id}`, host: "isolated-owner", code: "234567", shareStroops: 10_000_000n,
      memberTarget: 3, memberCount: 3, status: "Open", cadence: "Weekly", firstKocok: 1, round: 0,
    }),
    arisanRoomPage, sc: { u32: (value: number) => value },
    stroopsToPesos: (value: bigint) => Number(value) / 10_000_000 * 6.5, fmtPeso: String,
    setTimeout: (callback: () => void) => { callback(); return 1; },
    fetch: () => { throw Error("No network is authorized"); },
    getSigner: () => { throw Error("A display read must not obtain a signer"); },
    invokeAs: () => { throw Error("A display read must not submit a transaction"); },
    require: (name: string) => { throw Error(`Unexpected runtime dependency ${name}`); },
  });
  const complete = async (kind: Kind, id: number, fail = false) => {
    const index = pending.findIndex(read => read.kind === kind && read.id === id);
    assert.notEqual(index, -1, `Expected pending ${kind} ${id}`);
    const [read] = pending.splice(index, 1);
    if (fail) read.reject(); else read.resolve();
    await flush();
  };
  const drain = async <T,>(promise: Promise<T>) => {
    let settled = false;
    void promise.then(() => { settled = true; }, () => { settled = true; });
    for (let turn = 0; turn < 200; turn++) {
      await flush();
      if (settled && pending.length === 0) break;
      if (pending.length) {
        waves++;
        for (const read of pending.splice(0)) read.resolve();
      }
    }
    await flush();
    assert.equal(settled, true, "The bounded action must settle");
    assert.equal(pending.length, 0);
    return promise;
  };
  return { run: exports.arisanList, complete, drain, reads, pending, roomIds,
    stats: () => ({ active, peak, waves, reads: reads.length, identity, authorization }) };
}

test("four room jobs start together, membership stays in its job, and out-of-order replies preserve newest-first output", async () => {
  const h = harness(), result = h.run();
  await flush(); await h.complete("count", 0);
  assert.deepEqual(h.roomIds, [8, 7, 6, 5]);
  assert.equal(h.stats().peak, 4);
  await h.complete("room", 5);
  assert.deepEqual(h.roomIds, [8, 7, 6, 5], "A job still awaiting membership must retain its worker slot");
  await h.complete("members", 5);
  assert.deepEqual(h.roomIds, [8, 7, 6, 5, 4]);
  const page = await h.drain(result);
  assert.equal(page.ready, true); if (!page.ready) assert.fail("Expected a verified page");
  assert.deepEqual(Array.from(page.mine, room => room.id), [8, 7, 6, 5, 4, 3, 2, 1]);
  assert.equal(page.nextCursor, null); assert.equal(h.stats().peak, 4);
  assert.ok(page.mine.every(room => room.isMember && room.isHost && room.code === "234567"));
});

test("a failed job stops new scheduling, fails the whole page and never returns a partial cursor", async () => {
  for (const failedRead of ["room", "members"] as const) {
    const h = harness(), result = h.run();
    await flush(); await h.complete("count", 0);
    if (failedRead === "members") await h.complete("room", 8);
    await h.complete(failedRead, 8, true);
    const page = await result;
    assert.equal(page.ready, false); assert.equal("mine" in page, false); assert.equal("nextCursor" in page, false);
    if (!page.ready) assert.match(page.error!, /page was not advanced/);
    await h.drain(result); // Already-started reads settle, but cannot enqueue another room.
    assert.deepEqual(h.roomIds, [8, 7, 6, 5]);
    assert.equal(h.stats().active, 0); assert.equal(h.stats().peak, 4);
  }
});

test("unverified account ownership cannot become member or host through concurrent reads", async () => {
  const h = harness({ verified: false }), page = await h.drain(h.run());
  assert.equal(page.ready, true); if (!page.ready) assert.fail("Public reads should remain readable");
  assert.equal(page.mine.length, 0); assert.equal(h.stats().identity, 1); assert.equal(h.stats().authorization, 1);
});

test("small and empty pages use only the required workers, and a cursor remains bounded and disjoint", async () => {
  for (const count of [0, 1, 2, 3]) {
    const h = harness({ count }), page = await h.drain(h.run());
    assert.equal(page.ready, true); if (!page.ready) assert.fail("Expected a readable page");
    assert.equal(page.mine.length, count); assert.ok(h.stats().peak <= Math.max(1, count));
  }
  const h = harness({ count: 173, members: [72, 51] }), page = await h.drain(h.run(73));
  assert.equal(page.ready, true); if (!page.ready) assert.fail("Expected an older page");
  assert.deepEqual(Array.from(page.mine, room => room.id), [72, 51]);
  assert.equal(page.nextCursor, 23); assert.deepEqual(h.roomIds, Array.from({ length: 50 }, (_, index) => 73 - index));
  assert.equal(new Set(h.roomIds).size, 50); assert.equal(h.stats().peak, 4);
});

test("preview and invalid cursors never start identity, authorization or provider work", async () => {
  const preview = harness({ preview: true }); assert.equal((await preview.run()).ready, false);
  assert.deepEqual(preview.stats(), { active: 0, peak: 0, waves: 0, reads: 0, identity: 0, authorization: 0 });
  for (const cursor of [0, -1, 1.5, "3", null, Number.MAX_SAFE_INTEGER + 1]) {
    const h = harness(); assert.equal((await h.run(cursor)).ready, false);
    assert.equal(h.stats().reads, 0); assert.equal(h.stats().identity, 0); assert.equal(h.stats().authorization, 0);
  }
});

test("synthetic equal-latency scheduling benchmark retains 101 reads but reduces 101 serial waves to 27 bounded waves", async t => {
  const serial = harness({ count: 50, serial: true }), bounded = harness({ count: 50 });
  const before = await serial.drain(serial.run()), after = await bounded.drain(bounded.run());
  assert.deepEqual(JSON.parse(JSON.stringify(after)), JSON.parse(JSON.stringify(before)));
  assert.equal(serial.stats().reads, 101); assert.equal(bounded.stats().reads, 101);
  assert.equal(serial.stats().peak, 1); assert.equal(bounded.stats().peak, 4);
  assert.equal(serial.stats().waves, 101); assert.equal(bounded.stats().waves, 27);
  t.diagnostic("Synthetic scheduler only, not production timing: 50 rooms, 101 RPC reads; serial 101 waves/peak 1, bounded 27 waves/peak 4.");
});
