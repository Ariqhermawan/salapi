import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import * as money from "../lib/money.ts";
import { arisanRoomPage } from "../lib/arisan-list.ts";

const caller = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 31)).publicKey();
const other = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 32)).publicKey();
const friendOne = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 33)).publicKey();
const friendTwo = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 34)).publicKey();
const ownerId = "11111111-1111-4111-8111-111111111111";
const hash = "a".repeat(64);
const now = 1_800_000_000;
const diagnostics = "ISOLATED_PRIVATE_DIAGNOSTICS";
type Tx = { ok: boolean; error?: string; pending?: boolean; hash?: string; value?: unknown };
type Room = {
  host: string; name: string; code: string; member_target: number; share: bigint;
  cadence: unknown; first_kocok: number; join_deadline: number; status: unknown;
  member_count: number; round: number;
};
type Options = {
  preview?: boolean; configured?: boolean; adminConfigured?: boolean; user?: unknown;
  authError?: unknown; authThrows?: boolean; clientThrows?: boolean;
  publicKey?: unknown; walletMissing?: boolean; walletError?: unknown; walletThrows?: boolean;
  viewer?: string | null; room?: Partial<Room>; rooms?: Partial<Room>[];
  resolvedRoomId?: unknown; resolvedRoomIds?: unknown[]; members?: unknown;
  circleMembers?: unknown; phase?: string; committed?: boolean; won?: boolean;
  readThrows?: boolean; signerThrows?: boolean;
  signer?: { publicKey: string; secret: string; demo: boolean };
  result?: Tx; results?: Tx[];
};
type ActionApi = Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>;

function compile(path: string) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const authorizationCode = compile("../lib/server/arisanAuthorization.ts");
const actionsCode = compile("../app/actions.ts");
function load<T>(code: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const sandboxModule = { exports: {} as T };
  runInNewContext(code, {
    module: sandboxModule, exports: sandboxModule.exports, Buffer, console, process: { env: {} },
    fetch: () => { throw new Error("No external operation is authorized by this test."); },
    require(name: string) {
      if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
      return dependencies[name];
    }, ...globals,
  });
  return sandboxModule.exports;
}

function setup(options: Options = {}) {
  const calls = {
    auth: 0, walletReads: 0, columns: [] as string[], owners: [] as unknown[],
    signers: 0, guestSigners: 0, friendSecrets: 0, identityReads: 0,
    reads: [] as { method: string; args: unknown[] }[],
    sends: [] as { secret: string; contract: string; method: string; args: unknown[] }[],
  };
  const authorization = load<{ authenticatedArisanWallet(): Promise<{ ok: boolean; publicKey?: string; error?: string }> }>(authorizationCode, {
    "server-only": {}, "@stellar/stellar-sdk": { StrKey },
    "@/lib/local-preview": { isLocalPreview: options.preview ?? false },
    "@/lib/supabase/env": { supabaseConfigured: () => options.configured ?? true, supabaseAdminConfigured: () => options.adminConfigured ?? true },
    "@/lib/supabase/server": { createSupabaseServer: async () => {
      if (options.clientThrows) throw new Error(diagnostics);
      return { auth: { getUser: async () => {
        calls.auth++;
        if (options.authThrows) throw new Error(diagnostics);
        return { data: { user: Object.hasOwn(options, "user") ? options.user : {
          id: ownerId, is_anonymous: false, email: "private@example.invalid",
          user_metadata: { photo_url: "https://isolated.invalid/private-photo" },
        } }, error: options.authError ?? null };
      } } };
    } },
    "@/lib/supabase/admin": { createSupabaseAdmin: () => ({ from(table: string) {
      assert.equal(table, "wallets");
      return { select(columns: string) {
        calls.columns.push(columns); assert.equal(columns, "public_key");
        return { eq(column: string, owner: unknown) {
          assert.equal(column, "user_id"); calls.owners.push(owner);
          return { maybeSingle: async () => {
            calls.walletReads++;
            if (options.walletThrows) throw new Error(diagnostics);
            return { data: options.walletMissing ? null : {
              public_key: Object.hasOwn(options, "publicKey") ? options.publicKey : caller,
              secret_cipher: diagnostics, photo_url: "https://isolated.invalid/private-photo", user_id: ownerId,
            }, error: options.walletError ?? null };
          } };
        } };
      } };
    } }) },
  });
  const rooms = [...(options.rooms ?? [])];
  const roomIds = [...(options.resolvedRoomIds ?? [])];
  const results = [...(options.results ?? [])];
  const defaultRoom: Room = {
    host: caller, name: "Isolated room", code: "FAM234", member_target: 3, share: 10_000_000n,
    cadence: "Weekly", first_kocok: now + 720, join_deadline: now + 600,
    status: "Open", member_count: 1, round: 1,
  };
  const actions = load<ActionApi>(actionsCode, {
    "@stellar/stellar-sdk": { StrKey },
    "@/lib/server/arisanAuthorization": authorization,
    "@/lib/server/userWallet": {
      getSigner: async () => { calls.guestSigners++; throw new Error("Provisioning signer must not run."); },
      getAuthenticatedSigner: async () => {
        calls.signers++;
        if (options.signerThrows) throw new Error(diagnostics);
        return options.signer ?? { publicKey: caller, secret: "ISOLATED_OWN_KEY", demo: false };
      },
      currentArisanPublicKey: async () => { calls.identityReads++; return options.viewer === undefined ? caller : options.viewer; },
    },
    "@/lib/server/stellar": {
      CONTRACTS: { tokenXlmSac: "isolated-token", usernameRegistry: "isolated-registry" },
      arisanRoomsId: () => "isolated-arisan", paluwaganId: () => "isolated-paluwagan",
      FRIENDS: [friendOne, friendTwo].map((publicKey, index) => ({
        label: `Example ${index + 1}`, pub: () => publicKey,
        secret: () => { calls.friendSecrets++; return `ISOLATED_FRIEND_${index + 1}`; },
      })),
      sc: Object.fromEntries(["u32", "u64", "addr", "sym", "str", "i128", "bytes", "unitVariant"].map(name => [name, (value: unknown) => value])),
      readContract: async (_contract: string, method: string, args: unknown[] = []) => {
        calls.reads.push({ method, args });
        if (options.readThrows) throw new Error(diagnostics);
        if (method === "get_room") return { ...defaultRoom, ...options.room, ...(rooms.shift() ?? {}) };
        if (method === "room_by_code") return roomIds.length ? roomIds.shift() : options.resolvedRoomId ?? 1;
        if (method === "get_members") return options.members ?? [caller, friendOne, friendTwo];
        if (method === "members") return options.circleMembers ?? [caller, friendOne, friendTwo];
        if (method === "has_committed") return options.committed ?? false;
        if (method === "has_won") return options.won ?? false;
        if (method === "has_revealed" || method === "has_paid") return false;
        if (method === "locked_of") return 0n;
        if (method === "draw_phase") return options.phase ?? "Finalizable";
        if (method === "room_count") return 1;
        return 1;
      },
      invokeAs: async (secret: string, contract: string, method: string, args: unknown[]) => {
        calls.sends.push({ secret, contract, method, args });
        return results.shift() ?? options.result ?? { ok: false, pending: true, hash, error: diagnostics };
      },
      stroopsToPesos: (value: bigint) => Number(value) * 6.5 / 10_000_000,
      fmtPeso: (value: number) => String(value), txLink: (value: string) => `https://stellar.expert/explorer/testnet/tx/${value}`,
    },
    "@/lib/money": money, "@/lib/local-preview": { isLocalPreview: options.preview ?? false },
    "@/lib/arisan-list": { arisanRoomPage }, "./disaster-actions": {},
    "@/lib/recipient-review": {}, "@/lib/server/xlmDeposit": {}, "@/lib/server/walletActivity": {},
    "@/lib/server/arisanCommitment": { deriveArisanSecret: () => new Uint8Array(32), createArisanCommitment: () => new Uint8Array(32) },
  }, { Date: class extends Date { static now() { return now * 1000; } }, crypto: { getRandomValues: (value: Uint8Array) => value.fill(2) } });
  return { authorization, actions, calls };
}
const invitation = { code: "FAM234", roomId: 1, memberTarget: 3, shareStroops: "10000000", depositStroops: "30000000", viewer: caller };
const friendMethods = ["arisanFriendsJoin", "arisanFriendsCommit", "arisanFriendsReveal", "paluwaganFriendsPay"];

test("strict Arisan authorization exposes only canonical public identity and queries only its verified owner", async () => {
  const { authorization, calls } = setup();
  const result = await authorization.authenticatedArisanWallet();
  assert.equal(result.ok, true); assert.equal(result.publicKey, caller);
  assert.deepEqual(Object.keys(result).sort(), ["ok", "publicKey"]);
  assert.deepEqual(calls.columns, ["public_key"]); assert.deepEqual(calls.owners, [ownerId]);
  assert.equal(calls.signers, 0); assert.equal(calls.guestSigners, 0);
  assert.doesNotMatch(JSON.stringify(result), /private@example|private-photo|secret_cipher|user_id|ISOLATED_PRIVATE/);
});

test("guest, anonymous, malformed and error-with-user sessions never query a saved wallet", async () => {
  for (const options of [
    { configured: false }, { user: null }, { user: undefined }, { user: {} },
    { user: { id: "not-a-uuid", is_anonymous: false } },
    { user: { id: ownerId } }, { user: { id: ownerId, is_anonymous: "false" } },
    { user: { id: ownerId, is_anonymous: true } },
    { authError: { message: diagnostics } }, { authThrows: true }, { clientThrows: true },
  ]) {
    const { authorization, calls } = setup(options);
    const result = await authorization.authenticatedArisanWallet();
    assert.equal(result.ok, false); assert.equal(calls.walletReads, 0);
    assert.equal(calls.signers, 0); assert.equal(calls.guestSigners, 0);
    assert.doesNotMatch(JSON.stringify(result), /ISOLATED_PRIVATE|private@example|private-photo|11111111/);
  }
});

test("missing, invalid and failed canonical public wallet reads fail closed without custody access", async () => {
  for (const options of [
    { adminConfigured: false }, { walletMissing: true }, { publicKey: "bad-address" },
    { walletError: { message: diagnostics } }, { walletThrows: true },
  ]) {
    const { authorization, calls } = setup(options);
    const result = await authorization.authenticatedArisanWallet();
    assert.equal(result.ok, false); assert.equal(calls.signers, 0); assert.equal(calls.guestSigners, 0);
    assert.doesNotMatch(JSON.stringify(result), /ISOLATED_PRIVATE|secret_cipher/);
  }
});

test("all public configured-friend endpoints reject guest and ambiguous authentication before RPC or friend key access", async () => {
  for (const method of friendMethods) for (const options of [{ user: null }, { authError: { message: diagnostics } }, { walletMissing: true }]) {
    const { actions, calls } = setup(options);
    const result = await actions[method](1);
    assert.equal(result.ok, false, method); assert.equal(calls.reads.length, 0, method);
    assert.equal(calls.friendSecrets, 0, method); assert.equal(calls.sends.length, 0, method); assert.equal(calls.signers, 0, method);
  }
});

test("Arisan friends require exact authenticated host and Paluwagan sibling requires current membership", async () => {
  for (const method of friendMethods) {
    const { actions, calls } = setup({ room: { host: other }, circleMembers: [other] });
    const result = await actions[method](1);
    assert.equal(result.ok, false, method); assert.equal(calls.friendSecrets, 0, method); assert.equal(calls.sends.length, 0, method);
  }
});

test("preview and invalid room IDs stop every Arisan entry point before authentication, signer and RPC", async () => {
  for (const method of ["arisanFriendsJoin", "arisanFriendsCommit", "arisanFriendsReveal", "arisanRoomState", "arisanLeave", "arisanStart", "arisanCancel", "arisanCommit", "arisanReveal", "arisanFinalize", "arisanPostpone"]) {
    for (const roomId of [0, -1, 0.5, NaN, Infinity, 0x1_0000_0000, "1", null, {}]) {
      const { actions, calls } = setup(); await actions[method](roomId, 60);
      assert.equal(calls.auth, 0, method); assert.equal(calls.reads.length, 0, method); assert.equal(calls.signers, 0, method); assert.equal(calls.friendSecrets, 0, method);
    }
    const { actions, calls } = setup({ preview: true }); await actions[method](1, 60);
    assert.equal(calls.auth, 0, method); assert.equal(calls.reads.length, 0, method); assert.equal(calls.signers, 0, method);
  }
  for (const [method, args] of [["arisanList", []], ["arisanContractBalance", []], ["arisanResolveCode", ["FAM234"]], ["arisanJoin", [invitation]], ["paluwaganFriendsPay", []]] as [string, unknown[]][]) {
    const { actions, calls } = setup({ preview: true }); await actions[method](...args);
    assert.equal(calls.auth, 0, method); assert.equal(calls.reads.length, 0, method); assert.equal(calls.friendSecrets, 0, method);
  }
});

test("authorized friend batches stop at first pending envelope and preserve its hash without secrets", async () => {
  for (const method of friendMethods) {
    const { actions, calls } = setup({ committed: method === "arisanFriendsReveal" });
    const result = await actions[method](1);
    assert.equal(result.pending, true, method); assert.equal(result.hash, hash, method);
    assert.equal(calls.sends.length, 1, method); assert.equal(calls.friendSecrets, 1, method); assert.equal(calls.signers, 0, method);
    assert.doesNotMatch(JSON.stringify(result), /ISOLATED_PRIVATE|ISOLATED_FRIEND|secret_cipher/);
  }
});

test("authorized reveal limit remains capped and winner/nonmember friends are skipped", async () => {
  const capped = setup({ committed: true, result: { ok: true, hash, value: null } });
  assert.equal((await capped.actions.arisanFriendsReveal(1, 999)).submitted, 2); assert.equal(capped.calls.sends.length, 2);
  const one = setup({ committed: true, result: { ok: true, hash, value: null } });
  assert.equal((await one.actions.arisanFriendsReveal(1, 1)).submitted, 1); assert.equal(one.calls.sends.length, 1);
  for (const options of [{ won: true }, { members: [caller] }]) {
    const skipped = setup(options); assert.equal((await skipped.actions.arisanFriendsCommit(1)).submitted, 0);
    assert.equal(skipped.calls.friendSecrets, 0); assert.equal(skipped.calls.sends.length, 0);
  }
});

test("code resolution trims/lowercases only valid codes and never silently strips separators or ambiguous characters", async () => {
  const valid = setup(); const result = await valid.actions.arisanResolveCode("  fam234  ");
  assert.equal(result.ok, true); assert.equal(result.code, "FAM234"); assert.equal(valid.calls.reads[0].args[0], "FAM234");
  for (const value of ["FAM-234", "FAM 234", "FAM_234", "FAMO34", "FAMI34", "FAM034", "FAM134", "FAM234/", null, 234567]) {
    const { actions, calls } = setup(); assert.equal((await actions.arisanResolveCode(value)).ok, false);
    assert.equal(calls.reads.length, 0);
  }
});

test("join rejects legacy strings and malformed snapshots before auth, RPC or signer resolution", async () => {
  for (const value of ["FAM234", null, {}, [], { ...invitation, code: "fam234" },
    { ...invitation, roomId: "1" }, { ...invitation, memberTarget: 3.5 },
    { ...invitation, shareStroops: "010000000" }, { ...invitation, depositStroops: "30000001" },
    { ...invitation, shareStroops: "1e7" }, { ...invitation, viewer: null },
    { ...invitation, viewer: caller.slice(0, -1) + (caller.endsWith("A") ? "B" : "A") }]) {
    const { actions, calls } = setup(); assert.equal((await actions.arisanJoin(value)).ok, false);
    assert.equal(calls.auth, 0); assert.equal(calls.reads.length, 0); assert.equal(calls.signers, 0); assert.equal(calls.sends.length, 0);
  }
});

test("join rejects forged viewer and each changed room or deposit term before loading a signing key", async () => {
  for (const [options, reviewed] of [
    [{}, { ...invitation, viewer: other }], [{ resolvedRoomId: 2 }, invitation],
    [{ room: { code: "NEW234" } }, invitation], [{ room: { member_target: 4 } }, invitation],
    [{ room: { share: 10_000_001n } }, invitation], [{}, { ...invitation, shareStroops: "10000001", depositStroops: "30000003" }],
    [{ room: { status: "Active" } }, invitation], [{ room: { member_count: 3 } }, invitation],
    [{ room: { status: {} } }, invitation], [{ room: { status: "Unknown" } }, invitation],
    [{ room: { join_deadline: now - 1 } }, invitation], [{ room: { join_deadline: now } }, invitation],
  ] as [Options, typeof invitation][]) {
    const { actions, calls } = setup(options); assert.equal((await actions.arisanJoin(reviewed)).ok, false);
    assert.equal(calls.signers, 0); assert.equal(calls.sends.length, 0);
  }
});

test("join rechecks mapping, exact terms, room capacity and deadline after signer resolution", async () => {
  for (const options of [
    { resolvedRoomIds: [1, 2] }, { rooms: [{}, { code: "NEW234" }] },
    { rooms: [{}, { share: 10_000_001n }] }, { rooms: [{}, { member_count: 3 }] },
    { rooms: [{}, { status: "Active" }] }, { rooms: [{}, { join_deadline: now - 1 }] },
    { rooms: [{}, { join_deadline: now }] },
  ]) {
    const { actions, calls } = setup(options); assert.equal((await actions.arisanJoin(invitation)).ok, false);
    assert.equal(calls.signers, 1); assert.equal(calls.sends.length, 0);
  }
});

test("a valid join sends only the reviewed room/code and authenticated saved signer, preserving pending identity", async () => {
  const { actions, calls } = setup(); const result = await actions.arisanJoin(invitation);
  assert.equal(result.ok, false); assert.equal(result.pending, true); assert.equal(result.hash, hash);
  assert.equal(calls.guestSigners, 0); assert.equal(calls.signers, 1); assert.equal(calls.sends.length, 1);
  assert.equal(calls.sends[0].secret, "ISOLATED_OWN_KEY"); assert.equal(calls.sends[0].method, "join_room");
  assert.deepEqual(Array.from(calls.sends[0].args), [1, "FAM234", caller]);
  assert.doesNotMatch(JSON.stringify(result), /ISOLATED_OWN|ISOLATED_PRIVATE|private-photo|private@example/);
});

test("own-wallet Arisan mutations fail closed for guests, missing custody and signer identity changes", async () => {
  const mutations: [string, unknown[]][] = [
    ["arisanCreate", [{ name: "Isolated", memberTarget: 3, share: { amount: "100", currency: "tl" }, cadence: "Weekly" }]],
    ["arisanJoin", [invitation]], ["arisanLeave", [1]], ["arisanStart", [1]], ["arisanCancel", [1]],
    ["arisanCommit", [1]], ["arisanReveal", [1]], ["arisanFinalize", [1]], ["arisanPostpone", [1, 60]],
  ];
  for (const [method, args] of mutations) for (const options of [
    { user: null }, { walletMissing: true }, { authError: { message: diagnostics } }, { signerThrows: true },
    { signer: { publicKey: caller, secret: "ISOLATED_DEMO", demo: true } },
    { signer: { publicKey: other, secret: "ISOLATED_OTHER", demo: false } },
  ]) {
    const { actions, calls } = setup(options); const result = await actions[method](...args);
    assert.equal(result.ok, false, method); assert.equal(calls.sends.length, 0, method); assert.equal(calls.guestSigners, 0, method);
    assert.doesNotMatch(JSON.stringify(result), /ISOLATED_PRIVATE|ISOLATED_DEMO|ISOLATED_OTHER|private-photo|private@example/);
  }
});

test("room reads use only the saved public identity and expose code/finalization only to members", async () => {
  for (const [viewer, member] of [[caller, true], [other, false], [null, false]] as const) {
    const { actions, calls } = setup({ viewer, room: { status: "Active" } });
    const room = await actions.arisanRoomState(1);
    assert.equal(room.ready, true); assert.equal(room.viewer, viewer); assert.equal(room.isMember, member);
    assert.equal(room.viewerIdentity, viewer === caller ? "personal" : "unverified");
    assert.equal(room.code, member ? "FAM234" : null); assert.equal(room.canFinalize, member);
    assert.equal(room.shareStroops, "10000000"); assert.equal(room.depositStroops, "30000000");
    assert.equal(room.canUseDemoFriends, viewer === caller);
    assert.equal(calls.signers, 0); assert.equal(calls.guestSigners, 0); assert.equal(calls.auth, 1); assert.equal(calls.walletReads, 1);
    assert.equal(calls.friendSecrets, 0); assert.equal(calls.sends.length, 0); assert.equal(calls.identityReads, 1);
    assert.doesNotMatch(JSON.stringify(room), /secret_cipher|private@example|private-photo|user_id|11111111/);
  }
});

test("unavailable RPC or custody diagnostics never become public room or action errors", async () => {
  for (const [method, args] of [["arisanRoomState", [1]], ["arisanJoin", [invitation]], ["arisanFriendsJoin", [1]], ["arisanFriendsCommit", [1]], ["arisanFriendsReveal", [1]], ["paluwaganFriendsPay", []]] as [string, unknown[]][]) {
    const { actions, calls } = setup({ readThrows: true }); const result = await actions[method](...args);
    assert.doesNotMatch(JSON.stringify(result), /ISOLATED_PRIVATE/); assert.equal(calls.sends.length, 0); assert.equal(calls.friendSecrets, 0);
  }
});

test("public demo-controls flag remains false for confirmed guests, malformed sessions and auth outages", async () => {
  for (const options of [{ user: null }, { user: { id: ownerId, is_anonymous: true } },
    { authError: { message: diagnostics } }, { walletMissing: true }, { publicKey: other }]) {
    const { actions, calls } = setup(options); const room = await actions.arisanRoomState(1);
    assert.equal(room.ready, true); assert.equal(room.canUseDemoFriends, false);
    assert.equal(room.viewerIdentity, "unverified");
    assert.equal(room.isHost, false); assert.equal(room.isMember, false);
    assert.equal(room.code, null); assert.equal(room.canFinalize, false);
    assert.ok((room.seats as { isYou: boolean; label: string }[]).every(seat => !seat.isYou && seat.label !== "You"));
    assert.equal(calls.signers, 0); assert.equal(calls.guestSigners, 0); assert.equal(calls.friendSecrets, 0);
    assert.equal(calls.sends.length, 0);
    assert.doesNotMatch(JSON.stringify(room), /ISOLATED_PRIVATE|private@example|private-photo|11111111/);
  }
});
