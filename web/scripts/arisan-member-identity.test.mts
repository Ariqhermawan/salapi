import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as sdk from "@stellar/stellar-sdk";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as domain from "../lib/arisan-member-identity.ts";
import type { ArisanMemberIdentityResult, ArisanRoomKind } from "../lib/arisan-member-identity.ts";

const wallet = (index: number) => sdk.StrKey.encodeEd25519PublicKey(Buffer.alloc(32, index));
const member = wallet(1), other = wallet(2), foreign = wallet(3);
const legacy = sdk.StrKey.encodeContract(Buffer.alloc(32, 4));
const installments = sdk.StrKey.encodeContract(Buffer.alloc(32, 5));
const photo = "https://lh3.googleusercontent.com/a/fixture=s96-c";
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const helperSource = compile("../lib/server/arisanMemberIdentity.ts");

function server(options: { preview?: boolean; legacy?: string; installments?: string; rawRoom?: unknown; rawMembers?: unknown;
  owner?: { ok: true; publicKey: string } | { ok: false }; authThrows?: boolean; readFails?: boolean } = {}) {
  const calls = { auth: 0, projections: [] as { addresses: string[]; photos: boolean }[], simulations: [] as { method: string; id: number; contract: string }[] };
  class ReadOnlyRpc {
    constructor(url: string, configuration: { timeout: number }) {
      assert.equal(url, "https://soroban-testnet.stellar.org"); assert.equal(configuration.timeout, 4000);
    }
    async simulateTransaction(transaction: sdk.Transaction) {
      assert.equal(transaction.signatures.length, 0, "Room display must never sign");
      assert.equal(transaction.source, wallet(0), "The simulation source is not an account's managed signer");
      const invocation = (transaction.operations[0] as sdk.Operation.InvokeHostFunction).func.invokeContract();
      const method = invocation.functionName().toString();
      assert.ok(method === "get_room" || method === "get_members", "Only authoritative readonly membership methods are allowed");
      calls.simulations.push({ method, id: sdk.scValToNative(invocation.args()[0]), contract: sdk.Address.fromScAddress(invocation.contractAddress()).toString() });
      if (options.readFails) throw Error("RPC unavailable");
      const value = method === "get_room" ? options.rawRoom ?? { member_target: 3, member_count: 2 } : options.rawMembers ?? [member, other];
      return { result: { retval: sdk.nativeToScVal(value) } };
    }
  }
  const exports = {} as { readArisanMemberIdentities: (kind: ArisanRoomKind, roomId: number) => Promise<ArisanMemberIdentityResult> };
  runInNewContext(helperSource, { exports, Buffer, setTimeout, clearTimeout,
    process: { env: { ARISAN_INSTALLMENTS_CONTRACT: options.installments ?? installments } },
    require(name: string) {
      if (name === "server-only") return {};
      if (name === "@stellar/stellar-sdk") return { ...sdk, rpc: { Server: ReadOnlyRpc, Api: { isSimulationSuccess: (value: { result?: unknown }) => !!value.result } } };
      if (name === "@/lib/local-preview") return { isLocalPreview: options.preview ?? false };
      if (name === "./stellar") return { RPC_URL: "https://soroban-testnet.stellar.org", arisanRoomsId: () => options.legacy ?? legacy, sc: { u32: (id: number) => sdk.nativeToScVal(id, { type: "u32" }) } };
      if (name === "./arisanAuthorization") return { async authenticatedArisanWallet() {
        calls.auth++; if (options.authThrows) throw Error("Authentication unavailable");
        return options.owner ?? { ok: true, publicKey: member };
      } };
      if (name === "./walletActivityIdentity") return { async readArisanWalletIdentities(addresses: string[], photos: boolean) {
        calls.projections.push({ addresses: Array.from(addresses), photos });
        return addresses.map(address => ({ address, handle: address === member ? "ariqhermawan" : "nonimaharani", photoUrl: photos ? photo : null }));
      } };
      throw Error(`Forbidden room identity dependency ${name}`);
    },
  });
  return { ...exports, calls };
}

test("room identity derives only validated on-chain members, for the correct deployment, through unsigned reads", async () => {
  for (const [kind, contract] of [["upfront", legacy], ["installments", installments]] as const) {
    const h = server(); const result = await h.readArisanMemberIdentities(kind, 9);
    assert.equal(result.ok, true); if (!result.ok) continue;
    assert.equal(result.kind, kind); assert.equal(result.roomId, 9);
    assert.deepEqual(h.calls.projections, [{ addresses: [member, other], photos: true }]);
    assert.deepEqual(h.calls.simulations, [{ method: "get_room", id: 9, contract }, { method: "get_members", id: 9, contract }]);
    assert.doesNotMatch(JSON.stringify(result), /email|user_metadata|user_id|secret|ownerId/);
  }
});

test("guest, anonymous/auth-failed, and nonmember views retain public handles but cannot request participant photos", async () => {
  for (const options of [{ owner: { ok: false as const } }, { authThrows: true }, { owner: { ok: true as const, publicKey: foreign } }]) {
    const h = server(options); const result = await h.readArisanMemberIdentities("upfront", 9);
    assert.equal(result.ok, true); if (!result.ok) continue;
    assert.equal(h.calls.projections[0].photos, false);
    assert.equal(result.identities[0].handle, "ariqhermawan");
    assert.ok(result.identities.every(identity => identity.photoUrl === null));
  }
});

test("local preview, invalid room/type and misconfigured deployment cannot read accounts or the network", async () => {
  const cases = [
    { options: { preview: true }, kind: "upfront", id: 9 },
    { options: { legacy: "not-a-contract" }, kind: "upfront", id: 9 },
    { options: { installments: legacy }, kind: "installments", id: 9 },
    { options: { installments: "not-a-contract" }, kind: "installments", id: 9 },
    ...[0, -1, 1.5, Number.NaN, 0x1_0000_0000, "9", { roomId: 9, wallets: [foreign] }].map(id => ({ options: {}, kind: "upfront", id })),
    { options: {}, kind: "caller-wallets", id: 9 },
  ];
  for (const { options, kind, id } of cases) {
    const h = server(options); const result = await h.readArisanMemberIdentities(kind as ArisanRoomKind, id as number);
    assert.equal(result.ok, false); assert.equal(h.calls.auth, 0);
    assert.deepEqual(h.calls.simulations, []); assert.deepEqual(h.calls.projections, []);
  }
});

test("malformed, duplicate, oversized and mismatched contract membership never reaches private profile projection", async () => {
  const cases = [
    { rawRoom: "not-a-room" }, { rawRoom: {} }, { rawMembers: "not-members" },
    { rawRoom: { member_target: 2, member_count: 2 } },
    { rawRoom: { member_target: 3, member_count: 4 }, rawMembers: [member, other, foreign, wallet(8)] },
    { rawRoom: { member_target: 3, member_count: 1 } },
    { rawRoom: { member_target: 21, member_count: 21 }, rawMembers: Array.from({ length: 21 }, (_, i) => wallet(i + 20)) },
    { rawMembers: [member, member] }, { rawMembers: [member, "not-a-wallet"] }, { readFails: true },
  ];
  for (const options of cases) {
    const h = server(options); assert.equal((await h.readArisanMemberIdentities("upfront", 9)).ok, false);
    assert.deepEqual(h.calls.projections, []);
  }
  const twenty = Array.from({ length: 20 }, (_, i) => wallet(i + 20));
  const h = server({ rawRoom: { member_target: 20n, member_count: 20n }, rawMembers: twenty, owner: { ok: true, publicKey: twenty[0] } });
  assert.equal((await h.readArisanMemberIdentities("installments", 3)).ok, true);
  assert.deepEqual(h.calls.projections[0], { addresses: twenty, photos: true });
});

test("display names require exact wallet and valid registry handle, while wallet remains fully accessible", () => {
  assert.equal(domain.arisanMemberName(member, { address: member, handle: "ariqhermawan", photoUrl: null }), "@ariqhermawan");
  assert.equal(domain.arisanMemberName(member, { address: other, handle: "ariqhermawan", photoUrl: null }), "Wallet user");
  for (const handle of ["@ariq", "a", "<script>", "ARIQ", "a".repeat(33), "ariq@example.com"]) assert.equal(domain.arisanMemberName(member, { address: member, handle, photoUrl: null }), "Wallet user");
  assert.equal(domain.arisanMemberName(member), "Wallet user");
  assert.equal(domain.arisanMemberAddress(member), `${member.slice(0, 6)}...${member.slice(-6)}`);
  const exports = {} as { ArisanMemberIdentity(props: Record<string, unknown>): React.ReactElement };
  runInNewContext(compile("../components/ArisanMemberIdentity.tsx"), { exports, require(name: string) {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "@/lib/arisan-member-identity") return domain;
    if (name === "@/components/ui/kit") return { Avatar: () => null };
    if (name.endsWith(".module.css")) return { __esModule: true, default: { name: "name", address: "address" } };
    throw Error(`Unexpected member UI dependency ${name}`);
  } });
  const html = renderToStaticMarkup(exports.ArisanMemberIdentity({ address: member, identity: { address: member, handle: "ariqhermawan", photoUrl: photo }, children: React.createElement("span", null, "You") }));
  assert.match(html, /@ariqhermawan/); assert.match(html, /You/);
  assert.ok(html.includes(`title="${member}"`)); assert.ok(html.includes(`aria-label="Wallet address ${member}"`));
  assert.ok(html.includes(domain.arisanMemberAddress(member))); assert.doesNotMatch(html, /email|secret/);
});

test("avatar uses only the exact projected member photo and falls back after a failed image load", () => {
  let failedUrl: string | null = null;
  const exports = {} as { ArisanMemberAvatar(props: Record<string, unknown>): React.ReactElement<Record<string, unknown>> };
  runInNewContext(compile("../components/ArisanMemberIdentity.tsx"), { exports, require(name: string) {
    if (name === "react") return { useState: () => [failedUrl, (value: string) => { failedUrl = value; }] };
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "@/lib/arisan-member-identity") return domain;
    if (name === "@/components/ui/kit") return { Avatar: "Avatar" };
    if (name.endsWith(".module.css")) return { __esModule: true, default: {} };
    throw Error(`Unexpected avatar dependency ${name}`);
  } });
  const props = { address: member, identity: { address: member, handle: "ariqhermawan", photoUrl: photo }, size: 30 };
  const image = exports.ArisanMemberAvatar(props); assert.equal(image.type, "img"); assert.equal(image.props.src, photo);
  (image.props.onError as () => void)(); const fallback = exports.ArisanMemberAvatar(props);
  assert.equal(fallback.type, "Avatar"); assert.equal(fallback.props.name, "ariqhermawan");
  const wrongWallet = exports.ArisanMemberAvatar({ ...props, identity: { ...props.identity, address: other } });
  assert.equal(wrongWallet.type, "Avatar"); assert.equal(wrongWallet.props.name, "Wallet user");
});

type Effect = { callback: () => void | (() => void); deps: readonly unknown[]; cleanup?: () => void };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); }

function hook(preview = false) {
  const cells: unknown[] = [], effects = new Map<number, Effect>(), scheduled = new Map<number, Effect>();
  const timers = new Map<number, () => void>();
  const calls: { kind: ArisanRoomKind; id: number; response: ReturnType<typeof deferred<ArisanMemberIdentityResult>> }[] = [];
  let cursor = 0, timerId = 0;
  const document = { visibilityState: "visible" };
  const exports = {} as { useArisanMemberIdentities(kind: ArisanRoomKind, roomId: number | undefined, members: readonly string[], viewer: string | null): Map<string, domain.ArisanMemberIdentity> };
  runInNewContext(compile("../lib/ui/useArisanMemberIdentities.ts"), { exports, document,
    setInterval(callback: () => void, delay: number) { assert.equal(delay, 240_000); const id = ++timerId; timers.set(id, callback); return id; },
    clearInterval(id: number) { timers.delete(id); },
    require(name: string) {
      if (name === "react") return {
        useState(initial: unknown) { const i = cursor++; if (!(i in cells)) cells[i] = initial; return [cells[i], (value: unknown) => { cells[i] = value; }]; },
        useEffect(callback: Effect["callback"], deps: readonly unknown[]) { const i = cursor++, old = effects.get(i); if (!old || deps.some((value, at) => !Object.is(value, old.deps[at]))) scheduled.set(i, { callback, deps }); },
      };
      if (name === "@/lib/local-preview") return { isLocalPreview: preview };
      if (name === "@/app/arisan-member-actions") return { arisanMemberIdentities(kind: ArisanRoomKind, id: number) { const response = deferred<ArisanMemberIdentityResult>(); calls.push({ kind, id, response }); return response.promise; } };
      throw Error(`Unexpected identity hook dependency ${name}`);
    },
  });
  return { calls, document, timers, render(id: number | undefined = 9, members: string[] = [member, other], viewer: string | null = member, kind: ArisanRoomKind = "upfront") {
    cursor = 0; const result = exports.useArisanMemberIdentities(kind, id, members, viewer);
    for (const [i, effect] of scheduled) { effects.get(i)?.cleanup?.(); effects.set(i, { ...effect, cleanup: effect.callback() || undefined }); }
    scheduled.clear(); return result;
  }, unmount() { for (const effect of effects.values()) effect.cleanup?.(); } };
}
const response = (roomId = 9, kind: ArisanRoomKind = "upfront"): ArisanMemberIdentityResult => ({ ok: true, roomId, kind,
  identities: [{ address: member, handle: "ariqhermawan", photoUrl: photo }, { address: other, handle: "nonimaharani", photoUrl: null }] });

test("identity read is optional, not repeated by financial polling/countdowns, and refreshes photos only while visible", async () => {
  const h = hook(); assert.equal(h.render().size, 0); assert.equal(h.calls.length, 1);
  h.calls[0].response.resolve(response()); await flush(); assert.equal(h.render().get(member)?.handle, "ariqhermawan");
  for (let i = 0; i < 20; i++) h.render(9, [member, other]);
  assert.equal(h.calls.length, 1, "New financial DTO objects do not refetch identity");
  h.document.visibilityState = "hidden"; for (const timer of h.timers.values()) timer(); assert.equal(h.calls.length, 1);
  h.document.visibilityState = "visible"; for (const timer of h.timers.values()) timer(); assert.equal(h.calls.length, 2);
  h.unmount(); assert.equal(h.timers.size, 0);
});

test("room, viewer and membership changes hide stale identities immediately and reject late previous results", async () => {
  const h = hook(); h.render(); h.calls[0].response.resolve(response()); await flush(); assert.equal(h.render().size, 2);
  assert.equal(h.render(10).size, 0); assert.equal(h.calls.length, 2);
  assert.equal(h.render(10, [member, other], foreign).size, 0); assert.equal(h.calls.length, 3);
  h.calls[1].response.resolve(response(10)); await flush(); assert.equal(h.render(10, [member, other], foreign).size, 0);
  h.calls[2].response.resolve(response(10)); await flush(); assert.equal(h.render(10, [member, other], foreign).size, 2);
  assert.equal(h.render(10, [other], foreign).size, 0); assert.equal(h.calls.length, 4);
  h.calls[3].response.resolve(response(10)); await flush(); const remaining = h.render(10, [other], foreign);
  assert.equal(remaining.size, 1); assert.equal(remaining.has(member), false);
  h.unmount();
});

test("identity failures, mismatched room results, preview and invalid client bounds cannot block financial UI or invent names", async () => {
  for (const result of [{ ok: false } as const, response(11), response(9, "installments")]) {
    const h = hook(); h.render(); h.calls[0].response.resolve(result); await flush(); assert.equal(h.render().size, 0); h.unmount();
  }
  const preview = hook(true); assert.equal(preview.render().size, 0); assert.equal(preview.calls.length, 0);
  for (const [id, members] of [[undefined, []], [9, []], [9, Array.from({ length: 21 }, (_, i) => wallet(i + 20))]] as const) {
    const h = hook(); assert.equal(h.render(id, [...members]).size, 0); assert.equal(h.calls.length, 0);
  }
});
