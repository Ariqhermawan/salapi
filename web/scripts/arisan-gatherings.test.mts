import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as sdk from "@stellar/stellar-sdk";
import * as crypto from "node:crypto";
import * as domain from "../lib/arisan-gatherings.ts";
const wallet = (n: number) => sdk.StrKey.encodeEd25519PublicKey(Buffer.alloc(32, n));
const contract = (n: number) => sdk.StrKey.encodeContract(Buffer.alloc(32, n));
const host = wallet(1), member = wallet(2), third = wallet(3), outsider = wallet(4);
const contracts = { upfront: contract(1), installments: contract(2), scheduled: contract(3) };
const uid = "56a63f43-998c-45a0-b674-69b0f3686321";
const now = Date.parse("2026-10-11T12:00:00.000Z");
const input = () => ({ kind: "upfront" as const, roomId: 9, expectedRevision: 0, mutationId: uid,
  mode: "in_person" as const, venueName: "Community hall", address: "Cebu", mapsUrl: "https://www.google.com/maps?q=Cebu", onlineUrl: "", startsAt: "2026-10-14T12:00:00.000Z", timeZone: "Asia/Manila" });
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
type DbResult = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null };
type Options = { preview?: boolean; auth?: boolean; viewer?: string; configured?: boolean; raw?: unknown; members?: unknown; funding?: unknown;
  scheduled?: string; scheduledOnly?: unknown; installments?: string; readFails?: boolean; dbFails?: boolean; rpcResult?: DbResult; rpcOverrides?: Record<string, DbResult | undefined>; tableResults?: Record<string, DbResult>; rawAfter?: unknown; phase?: string; count?: number };
function server(options: Options = {}) {
  const calls = { auth: 0, simulations: [] as { method: string; roomId: number; contractId: string }[], db: [] as { table: string; method: string; args: unknown[] }[], rpcs: [] as { name: string; args: Record<string, unknown> }[] };
  class ReadRpc {
    constructor(_url: string, config: { timeout: number }) { assert.equal(config.timeout, 4000); }
    async simulateTransaction(transaction: sdk.Transaction) {
      assert.equal(transaction.source, wallet(0)); assert.equal(transaction.signatures.length, 0, "Social reads never sign or borrow demo custody");
      const op = (transaction.operations[0] as sdk.Operation.InvokeHostFunction).func.invokeContract(), method = op.functionName().toString();
      assert.ok(["get_room", "get_members", "funding_state", "kocok_at", "reveal_at", "draw_phase", "room_count", "scheduled_only"].includes(method));
      calls.simulations.push({ method, roomId: op.args().length === 0 ? 0 : sdk.scValToNative(op.args()[0]), contractId: sdk.Address.fromScAddress(op.contractAddress()).toString() });
      if (options.readFails) throw Error("RPC failed");
      const value = method === "scheduled_only" ? Object.hasOwn(options, "scheduledOnly") ? options.scheduledOnly : true : method === "room_count" ? options.count ?? 3 : method === "get_room" ? calls.simulations.filter(call => call.method === "get_room").length > 1 && Object.hasOwn(options, "rawAfter") ? options.rawAfter : Object.hasOwn(options, "raw") ? options.raw : { host, name: "Community circle", member_target: 3, member_count: 3, status: ["Open"], round: 0, join_deadline: BigInt(now / 1000 + 86400) }
        : method === "get_members" ? options.members ?? [host, member, third]
        : method === "funding_state" ? options.funding ?? { mode: ["Installments"], fully_funded_count: 3, deadline: BigInt(now / 1000 + 86400) }
        : method === "draw_phase" ? [options.phase ?? "Commit"] : method === "kocok_at" ? BigInt(now / 1000 + 600) : BigInt(now / 1000 + 1200);
      return { result: { retval: sdk.nativeToScVal(value) } };
    }
  }
  const db = { from(table: string) {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "is", "order", "limit", "maybeSingle", "update"]) builder[method] = (...args: unknown[]) => { calls.db.push({ table, method, args }); return builder; };
    builder.then = (resolve: (value: DbResult) => void) => resolve(options.dbFails ? { error: { code: "503" } } : options.tableResults?.[table] ?? { data: table === "arisan_gatherings" ? null : [], error: null, count: 0 });
    return builder;
  }, async rpc(name: string, args: Record<string, unknown>) {
    calls.rpcs.push({ name, args });
    if (options.dbFails) return { error: { code: "503" } };
    return options.rpcResult ?? options.rpcOverrides?.[name] ?? (name === "arisan_gathering_save" ? { data: { gathering: { id: uid, revision: 1, ...input() }, notifiedMembers: 3 }, error: null }
      : name === "arisan_gathering_rsvp" ? { data: true, error: null }
      : name === "arisan_gathering_due_reminders" ? { data: [], error: null }
      : name === "arisan_scheduled_discovery_cursor" ? { data: 0, error: null }
      : name === "arisan_scheduled_discovery_advance" ? { data: true, error: null } : { data: 3, error: null });
  } };
  const exports = {} as typeof import("../lib/server/arisanGatherings.ts");
  class ClockDate extends Date { static now() { return now; } }
  runInNewContext(compile("../lib/server/arisanGatherings.ts"), { exports, Buffer, Date: ClockDate, setTimeout, clearTimeout,
    process: { env: { ARISAN_INSTALLMENTS_CONTRACT: options.installments ?? contracts.installments, ARISAN_SCHEDULED_CONTRACT: options.scheduled ?? contracts.scheduled } },
    require(name: string) {
      if (name === "server-only") return {};
      if (name === "node:crypto") return crypto;
      if (name === "@stellar/stellar-sdk") return { ...sdk, rpc: { Server: ReadRpc, Api: { isSimulationSuccess: (value: { result?: unknown }) => !!value.result } } };
      if (name === "@/lib/local-preview") return { isLocalPreview: options.preview ?? false };
      if (name === "@/lib/supabase/admin") return { createSupabaseAdmin: () => db };
      if (name === "@/lib/supabase/env") return { supabaseAdminConfigured: () => options.configured ?? true };
      if (name === "./arisanAuthorization") return { async authenticatedArisanWallet() { calls.auth++; return options.auth === false ? { ok: false } : { ok: true, publicKey: options.viewer ?? host }; } };
      if (name === "./stellar") return { arisanRoomsId: () => contracts.upfront, RPC_URL: "https://soroban-testnet.stellar.org", sc: { u32: (v: number) => sdk.nativeToScVal(v, { type: "u32" }) } };
      if (name === "@/lib/arisan-gatherings") return { ...domain, validateArisanGatheringSave: (value: unknown) => domain.validateArisanGatheringSave(value, now) };
      throw Error(`Unexpected social dependency: ${name}`);
    },
  });
  return { ...exports, calls };
}

test("strict gathering validation canonicalizes UTC and accepts each independent deployment kind", () => {
  for (const kind of ["upfront", "installments", "scheduled"]) {
    const result = domain.validateArisanGatheringSave({ ...input(), kind, startsAt: "2026-10-14T12:00:00Z" }, now);
    assert.equal(result.ok, true); if (result.ok) assert.equal(result.value.startsAt, input().startsAt);
  }
  assert.equal(domain.validateArisanGatheringSave({ ...input(), startsAt: null, timeZone: null }, now).ok, true);
  assert.equal(domain.validateArisanGatheringSave({ ...input(), startsAt: "2026-10-14T12:00:00.123Z" }, now).ok, true);
  assert.equal(domain.arisanRoomHref({ kind: "scheduled", roomId: 9 }), "/arisan/scheduled/9");
});
for (const [name, change] of Object.entries({ callerRecipients: { members: [outsider] }, callerContract: { contractId: contracts.upfront }, callerWallet: { viewer: outsider },
  invalidKind: { kind: "foreign" }, invalidId: { roomId: 0 }, tooLargeId: { roomId: 2 ** 32 }, nonIntegerId: { roomId: 1.5 }, noRevision: { expectedRevision: -1 },
  badMutation: { mutationId: "bad" }, html: { venueName: "<script>" }, controls: { address: "address\r\nlocation" }, longAddress: { address: "a".repeat(501) },
  pastTime: { startsAt: "2026-10-11T12:00:00.000Z" }, invalidCalendarDate: { startsAt: "2026-02-30T12:00:00.000Z" }, offsetTime: { startsAt: "2026-10-14T12:00:00+08:00" },
  missingZone: { timeZone: null }, invalidZone: { timeZone: "Random/Timezone" }, ambiguousZone: { timeZone: "PST" }, unscheduledWithZone: { startsAt: null },
  distantTime: { startsAt: "2028-10-14T12:00:00.000Z" }, onlinePhysical: { mode: "online" }, physicalOnline: { onlineUrl: "https://meet.google.com/abc-defg-hij" },
})) test(`invalid meeting input: ${name}`, () => { assert.equal(domain.validateArisanGatheringSave({ ...input(), ...change }, now).ok, false); });

test("Maps and online URLs use HTTPS exact-host allowlists, never arbitrary redirects or lookalikes", () => {
  for (const url of ["https://maps.app.goo.gl/AbCd123", "https://goo.gl/maps/Ab123", "https://google.com/maps/place/Cebu", "https://maps.google.com/?q=Cebu"]) assert.equal(domain.validArisanMapsUrl(url), true, url);
  for (const url of ["http://google.com/maps", "https://google.com.evil.test/maps", "https://evil.test/?q=google.com/maps", "https://www.google.com/url?q=https://evil.test", "https://u:p@google.com/maps", "https://google.com:8443/maps", "javascript:alert(1)", "https://goo.gl/anything"]) assert.equal(domain.validArisanMapsUrl(url), false, url);
  for (const url of ["https://meet.google.com/abc-defg-hij", "https://us02web.zoom.us/j/123", "https://teams.microsoft.com/l/meetup-join/123"]) assert.equal(domain.validArisanOnlineUrl(url), true);
  for (const url of ["https://zoom.us.evil.test", "https://u:p@meet.google.com/abc", "http://meet.google.com/abc", "https://localhost/meet", "https://evil.test/"]) assert.equal(domain.validArisanOnlineUrl(url), false);
});

test("unsigned chain reads select the right deployment and derive all recipients, not caller lists", async () => {
  for (const kind of ["upfront", "installments", "scheduled"] as const) {
    const h = server(); const result = await h.saveArisanGathering({ ...input(), kind });
    assert.equal(result.ok, true);
    const save = h.calls.rpcs.find(c => c.name === "arisan_gathering_save")!;
    assert.equal(save.args.p_contract, contracts[kind]); assert.deepEqual(Array.from(save.args.p_members as string[]), [host, member, third]);
    assert.equal(save.args.p_host, host); assert.equal(save.args.p_expected_revision, 0); assert.equal(save.args.p_mutation_id, uid);
    assert.match(String(save.args.p_request_hash), /^[a-f0-9]{64}$/);
    assert.ok(h.calls.simulations.every(call => call.contractId === contracts[kind] && call.roomId === (call.method === "scheduled_only" ? 0 : 9)));
    assert.equal(h.calls.simulations.some(call => call.method === "funding_state"), kind !== "upfront");
  }
});
test("no auth/demo/unavailable storage and malformed saves cannot access room data or write inbox", async () => {
  for (const option of [{ preview: true }, { configured: false }, { auth: false }]) {
    const h = server(option); assert.equal((await h.saveArisanGathering(input())).ok, false); assert.deepEqual(h.calls.simulations, []); assert.deepEqual(h.calls.rpcs, []);
    assert.equal((await h.readArisanGatheringInbox()).ok, false); assert.deepEqual(h.calls.db, []);
  }
  const h = server(); assert.equal((await h.saveArisanGathering({ ...input(), members: [outsider] })).ok, false); assert.equal(h.calls.auth, 0);
});
test("nonmembers cannot read meetings; members who are not host cannot edit or enqueue", async () => {
  const nonmember = server({ viewer: outsider }); assert.equal((await nonmember.readArisanGathering(input())).ok, false); assert.deepEqual(nonmember.calls.db, []);
  const memberOnly = server({ viewer: member }); const read = await memberOnly.readArisanGathering(input()); assert.equal(read.ok, true); if (read.ok) { assert.equal(read.canEdit, false); assert.equal(read.contractId, contracts.upfront); }
  assert.equal((await memberOnly.saveArisanGathering(input())).ok, false); assert.deepEqual(memberOnly.calls.rpcs, []);
});
test("invalid, duplicate, mismatched and oversized chain rosters fail closed before DB access", async () => {
  for (const option of [{ raw: null }, { raw: {} }, { members: [host, host, third] }, { members: [host, member] }, { members: [host, member, "bogus"] }, { readFails: true },
    { raw: { host, name: "Test", member_target: 21, member_count: 3 } }, { funding: { mode: ["LegacyFull"], fully_funded_count: 3, deadline: now / 1000 + 86400 } }]) {
    const h = server(option); assert.equal((await h.saveArisanGathering({ ...input(), kind: "scheduled" })).ok, false); assert.deepEqual(h.calls.rpcs, []); assert.deepEqual(h.calls.db, []);
  }
});
test("isolated scheduled contract collision cannot fall back to old deployments", async () => {
  for (const scheduled of [contracts.upfront, contracts.installments, "not-a-contract"]) {
    const h = server({ scheduled }); assert.equal((await h.saveArisanGathering({ ...input(), kind: "scheduled" })).ok, false); assert.deepEqual(h.calls.simulations, []); assert.deepEqual(h.calls.rpcs, []);
  }
});
test("scheduled coordination and discovery require strict true capability before persisting anything", async () => {
  for (const scheduledOnly of [false, null, "true", 1]) {
    const h = server({ scheduledOnly });
    assert.equal((await h.watchArisanGathering({ kind: "scheduled", roomId: 9 })).ok, false);
    assert.equal((await h.discoverArisanScheduledRooms()).ok, false);
    assert.deepEqual(h.calls.rpcs, []); assert.deepEqual(h.calls.db, []);
  }
});
test("historical names are bounded display-only labels without changing financial or roster facts", async () => {
  for (const kind of ["upfront", "installments"] as const) {
    for (const [source, expected] of [["  Old\n<circle>  ", "Oldcircle"], [" \n<>\u0085 ", "Arisan room #9"], ["a".repeat(160), "a".repeat(120)], ["😀".repeat(160), "😀".repeat(120)]]) {
      const raw = { host, name: source, member_target: 3, member_count: 3, status: ["Open"], round: 0, join_deadline: BigInt(now / 1000 + 86400) };
      const h = server({ raw }); const room = await h.readArisanNotificationRoom({ kind, roomId: 9 });
      assert.equal(room.name, expected); assert.equal(room.host, host); assert.equal(room.memberTarget, 3); assert.equal(room.fullyFundedCount, 3);
      assert.equal(room.fundingDeadline, now / 1000 + 86400); assert.deepEqual(Array.from(room.members), [host, member, third]);
      assert.equal(h.calls.simulations.some(c => c.method === "scheduled_only"), false);
      assert.equal((await h.watchArisanGathering({ kind, roomId: 9 })).ok, true);
      assert.equal((h.calls.rpcs[0].args.p_snapshot as { name: string }).name, expected);
    }
  }
});
test("scheduled names match the isolated contract UTF-8 boundary and legacy normalization never masks header races", async () => {
  const raw = { host, name: "Community circle", member_target: 3, member_count: 3, status: ["Open"], round: 0, join_deadline: BigInt(now / 1000 + 86400) };
  for (const name of ["", " ", " leading", "trailing ", "\u2000leading", "trailing\u3000", "a".repeat(121), "😀".repeat(31), "<circle>", "line\nname", "control\u0085name"]) {
    const h = server({ raw: { ...raw, name } });
    assert.equal((await h.watchArisanGathering({ kind: "scheduled", roomId: 9 })).ok, false); assert.deepEqual(h.calls.rpcs, []);
  }
  // Rust Unicode White_Space differs from JavaScript trim at U+FEFF. A
  // chain-valid BOM is not a reason to poison sequential room discovery.
  for (const name of ["😀".repeat(30), "\uFEFFCommunity", "\uFEFF"]) {
    const valid = server({ raw: { ...raw, name } });
    assert.equal((await valid.watchArisanGathering({ kind: "scheduled", roomId: 9 })).ok, true);
  }
  const changed = server({ raw: { ...raw, name: "<Old>" }, rawAfter: { ...raw, name: "Old" } });
  assert.equal((await changed.watchArisanGathering({ kind: "upfront", roomId: 9 })).ok, false); assert.deepEqual(changed.calls.rpcs, []);
});
test("database save conflicts and errors never claim a persisted notification", async () => {
  for (const code of ["40001", "22023", "503"]) {
    const h = server({ rpcResult: { error: { code } } }); const result = await h.saveArisanGathering(input()); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, code === "503" ? "unavailable" : "conflict");
    assert.equal(h.calls.rpcs.length, 1);
  }
});
test("global inbox and mark-read always filter the verified owner's wallet", async () => {
  const h = server(); const result = await h.readArisanGatheringInbox(); assert.equal(result.ok, true);
  assert.equal(h.calls.db.filter(c => c.method === "eq" && c.args[0] === "wallet").length, 2);
  assert.ok(h.calls.db.filter(c => c.method === "eq" && c.args[0] === "wallet").every(c => c.args[1] === host));
  assert.equal((await h.markArisanGatheringNotificationsRead({ ids: [uid] })).ok, true);
  assert.ok(h.calls.db.some(c => c.method === "is" && c.args[0] === "read_at" && c.args[1] === null));
  const bad = server(); for (const value of [{ ids: [uid], wallet: outsider }, { ids: [] }, { ids: [uid, uid] }, { ids: ["bad"] }]) assert.equal((await bad.markArisanGatheringNotificationsRead(value)).ok, false);
  assert.equal(bad.calls.auth, 0);
});
test("RSVP uses canonical wallet and current gathering revision, not caller identity", async () => {
  const h = server({ tableResults: { arisan_gatherings: { data: { id: uid, revision: 3 }, error: null } } });
  const result = await h.rsvpArisanGathering({ kind: "upfront", roomId: 9, revision: 3, response: "yes" }); assert.equal(result.ok, true);
  assert.equal(h.calls.rpcs[0].args.p_wallet, host); assert.equal(h.calls.rpcs[0].args.p_revision, 3);
  const outsiderH = server({ viewer: outsider }); assert.equal((await outsiderH.rsvpArisanGathering({ kind: "upfront", roomId: 9, revision: 3, response: "yes" })).ok, false); assert.deepEqual(outsiderH.calls.db, []);
  assert.equal((await h.rsvpArisanGathering({ kind: "upfront", roomId: 9, revision: 2, response: "yes" })).ok, false);
});
test("state notifications use stable room/round/deadline event keys and never claim financial receipt", async () => {
  const h = server(), room = await h.readArisanNotificationRoom({ kind: "upfront", roomId: 9 });
  assert.deepEqual(Array.from(h.arisanRoomNotificationEvents(room, now), e => e.type), ["funding_complete"]);
  assert.deepEqual(Array.from(h.arisanRoomNotificationEvents({ ...room, status: "Active", drawPhase: "Commit", round: 1, commitAt: now / 1000 + 300, revealAt: now / 1000 + 600 }, now), e => e.key), ["started", `commit_deadline_hour_before:1:${now / 1000 + 300}`]);
  const later = h.arisanRoomNotificationEvents({ ...room, status: "Active", drawPhase: "Reveal", round: 2, commitAt: now / 1000 - 1, revealAt: now / 1000 + 600 }, now);
  assert.equal(later[0].key, "round:2"); assert.equal(later[1].type, "reveal_deadline_hour_before");
  for (const status of ["Done", "Dissolved"] as const) { const events = h.arisanRoomNotificationEvents({ ...room, status }, now); assert.equal(events.length, 1); assert.equal(events[0].key, status === "Done" ? "completed" : "cancelled"); }
  const incomplete = { ...room, fullyFundedCount: 1 };
  assert.equal(h.arisanRoomNotificationEvents(incomplete, now)[0].type, "funding_deadline_day_before");
  assert.equal(h.arisanRoomNotificationEvents({ ...incomplete, fundingDeadline: now / 1000 + 600 }, now).length, 1, "Do not enqueue day+hour at once for a late registration");
  assert.equal(h.arisanRoomNotificationEvents({ ...incomplete, fundingDeadline: now / 1000 }, now).length, 0, "Never remind to submit an overdue deposit");
});
test("post-confirmation watcher failure stays separate from money confirmation", async () => {
  const h = server(); assert.equal((await h.syncArisanRoomNotifications("upfront", 9)).ok, true);
  assert.equal(h.calls.rpcs[0].name, "arisan_room_watch_sync"); assert.deepEqual(Array.from(h.calls.rpcs[0].args.p_members as string[]), [host, member, third]);
  const failed = server({ dbFails: true }); assert.equal((await failed.syncArisanRoomNotifications("upfront", 9)).ok, false);
});
test("explicit watcher registration requires membership and accepts no caller recipient or contract", async () => {
  const h = server({ viewer: member }); assert.equal((await h.watchArisanGathering({ kind: "scheduled", roomId: 9 })).ok, true);
  assert.equal(h.calls.rpcs[0].name, "arisan_room_watch_sync");
  assert.deepEqual(Array.from(h.calls.rpcs[0].args.p_members as string[]), [host, member, third]);
  const outside = server({ viewer: outsider }); assert.equal((await outside.watchArisanGathering({ kind: "upfront", roomId: 9 })).ok, false); assert.equal(outside.calls.rpcs.length, 0);
  const bad = server(); assert.equal((await bad.watchArisanGathering({ kind: "upfront", roomId: 9, contractId: contracts.upfront })).ok, false); assert.equal(bad.calls.auth, 0);
});
test("coordination rejects a room that starts or changes round during its simulations", async () => {
  const h = server({ rawAfter: { host, name: "Community circle", member_target: 3, member_count: 3, status: ["Active"], round: 1, join_deadline: BigInt(now / 1000 + 86400) } });
  assert.equal((await h.watchArisanGathering({ kind: "upfront", roomId: 9 })).ok, false); assert.equal(h.calls.rpcs.length, 0);
});
test("authoritative Finalizable phase suppresses clock-inferred commit reminders", async () => {
  const h = server({ raw: { host, name: "Community circle", member_target: 3, member_count: 3, status: ["Active"], round: 1, join_deadline: BigInt(now / 1000 + 86400) }, phase: "Finalizable" });
  const room = await h.readArisanNotificationRoom({ kind: "scheduled", roomId: 9 }); assert.equal(room.drawPhase, "Finalizable");
  assert.deepEqual(Array.from(h.arisanRoomNotificationEvents(room, now), event => event.type), ["started"]);
});
test("scheduled discovery reads unsigned fresh count and at most two new rooms, advancing only after watch persistence", async () => {
  const h = server(); const result = await h.discoverArisanScheduledRooms(); assert.equal(result.ok, true); assert.equal(result.discovered, 2);
  assert.ok(h.calls.simulations.every(call => call.contractId === contracts.scheduled));
  assert.deepEqual(h.calls.simulations.filter(call => call.method === "get_members").map(call => call.roomId), [1, 2]);
  assert.deepEqual(h.calls.rpcs.filter(call => call.name === "arisan_scheduled_discovery_advance").map(call => [call.args.p_expected, call.args.p_next]), [[0, 1], [1, 2]]);
  const names = h.calls.rpcs.map(call => call.name); assert.ok(names.indexOf("arisan_room_watch_sync") < names.indexOf("arisan_scheduled_discovery_advance"));
});
test("failed roster/watch or reset count retains discovery cursor without silently skipping IDs", async () => {
  for (const options of [{ members: [host, member] }, { rpcOverrides: { arisan_room_watch_sync: { error: { code: "503" } } } }, { rpcOverrides: { arisan_scheduled_discovery_cursor: { data: 5, error: null } } }]) {
    const h = server(options); const result = await h.discoverArisanScheduledRooms(); assert.equal(result.ok, false); assert.equal(result.discovered, 0);
    assert.equal(h.calls.rpcs.some(call => call.name === "arisan_scheduled_discovery_advance"), false);
  }
});
test("migration protects every private table and RPC, with revision locks and exact-once inbox keys", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261011113650_arisan_gatherings_member_inbox.sql", import.meta.url), "utf8");
  const tables = [...sql.matchAll(/create table public\.([a-z_]+)/g)].map(m => m[1]); assert.equal(tables.length, 6);
  for (const name of tables) assert.ok(sql.includes(`alter table public.${name} enable row level security`));
  assert.doesNotMatch(sql, /security definer|create policy|grant .* to authenticated|grant .* to anon/i);
  assert.match(sql, /from public,anon,authenticated/); assert.match(sql, /to service_role/);
  assert.match(sql, /unique \(network,contract_id,room_kind,room_id,wallet,event_key\)/);
  assert.match(sql, /pg_advisory_xact_lock/); assert.match(sql, /g\.revision<>j\.revision/); assert.match(sql, /for update/);
  assert.match(sql, /g\.revision<>p_revision/); assert.match(sql, /prior\.request_hash <> p_request_hash/);
});
