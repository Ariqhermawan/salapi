import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as revampMoney from "../lib/i18n/revamp-money.ts";
import * as money from "../lib/money.ts";
import * as recipientReview from "../lib/recipient-review.ts";
import * as feePolicy from "../lib/arisan-funding-fees.ts";
import { CURRENCY, formatLocalAmount, pesoFromLocal } from "../lib/ui/currency.ts";
import { AuthSessionMissingError, isAuthSessionMissingError } from "@supabase/supabase-js";
import { arisanRoomPage } from "../lib/arisan-list.ts";
import { Keypair, StrKey } from "@stellar/stellar-sdk";

type Result = { ok: boolean; error?: string; hash?: string; pending?: boolean; value?: unknown };
type Signer = { publicKey: string; secret: string; demo: boolean };
type Row = { public_key: string; secret_cipher?: string };
type Read = { data: Row | null; error?: object | null };
const hash = "a".repeat(64);
const otherHash = "b".repeat(64);
const unresolvedKey = "salapi:testnet:unresolved-send:v1";
const arisanSender = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 35)).publicKey();
const reviewedArisan = { code: "234567", roomId: 1, memberTarget: 3, shareStroops: "10000000", depositStroops: "30000000", viewer: arisanSender };

function compile(path: string, jsx = false) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
  }).outputText;
}
function moduleFrom<T>(code: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const sandboxModule = { exports: {} as T };
  runInNewContext(code, { module: sandboxModule, exports: sandboxModule.exports, process: { env: {} }, Buffer, console,
    setTimeout: (fn: () => void) => { fn(); return 1; },
    fetch: () => { throw new Error("No external request is authorized"); },
    require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`Unstubbed dependency: ${name}`);
      return dependencies[name];
    }, ...globals });
  return sandboxModule.exports;
}
const walletCode = compile("../lib/server/userWallet.ts");
const stellarCode = compile("../lib/server/stellar.ts");
const actionsCode = compile("../app/actions.ts");
const sendCode = compile("../components/screens/SendScreen.tsx", true);

function walletSetup(options: { reads?: Read[]; readThrows?: Error; saveError?: boolean; configured?: boolean; admin?: boolean; signedIn?: boolean; user?: unknown; preview?: boolean; authError?: Error; authThrows?: boolean; clientThrows?: Error } = {}) {
  const reads = [...(options.reads ?? [{ data: { public_key: "saved-public", secret_cipher: "saved-secret" } }])];
  const calls = { reads: 0, mints: 0, upserts: 0, funding: 0, demo: 0, auth: 0, decrypts: 0, keyLoads: 0, readiness: [] as string[], columns: [] as string[], owners: [] as unknown[] };
  const keys: Record<string, string> = { "saved-secret": "saved-public", "new-secret": "new-public", "winner-secret": "winner-public" };
  const admin = { from: (table: string) => {
    assert.equal(table, "wallets");
    return {
      select: (columns: string) => {
        calls.columns.push(columns);
        return { eq: (column: string, owner: unknown) => {
          assert.equal(column, "user_id"); calls.owners.push(owner);
          return { maybeSingle: async () => {
            calls.reads++;
            if (options.readThrows) throw options.readThrows;
            return reads.shift() ?? { data: null };
          } };
        } };
      },
      upsert: async () => { calls.upserts++; return { error: options.saveError ? { message: "Isolated persistence failure" } : null }; },
    };
  } };
  const api = moduleFrom<{ getSigner(): Promise<Signer>; prepareAuthenticatedWallet(): Promise<Signer>; getAuthenticatedSigner(): Promise<Signer>; currentArisanPublicKey(): Promise<string | null> }>(walletCode, {
    "@stellar/stellar-sdk": { Keypair: {
      random: () => { calls.mints++; return { publicKey: () => "new-public", secret: () => "new-secret" }; },
      fromSecret: (secret: string) => { calls.keyLoads++; return { publicKey: () => keys[secret] ?? "mismatch-public" }; },
    } },
    "@supabase/supabase-js": { isAuthSessionMissingError },
    "@/lib/local-preview": { isLocalPreview: options.preview ?? false },
    "@/lib/server/stellar": { FRIENDBOT: "https://isolated.invalid", demoPublic: () => { calls.demo++; return "demo-public"; } },
    // Network semantics are exercised with the actual helper in readiness tests.
    // This existing identity suite treats saved/winner fixtures as active.
    "@/lib/server/walletReadiness": { ensureTestnetAccount: async (address: string) => {
      calls.readiness.push(address); if (address === "new-public") calls.funding++; return 1n;
    } },
    "@/lib/supabase/env": { supabaseConfigured: () => options.configured ?? true, supabaseAdminConfigured: () => options.admin ?? true },
    "@/lib/supabase/server": { createSupabaseServer: async () => {
      if (options.clientThrows) throw options.clientThrows;
      return { auth: { getUser: async () => {
      calls.auth++; if (options.authThrows) throw options.authError ?? new Error("Isolated authentication outage");
      return { data: { user: Object.hasOwn(options, "user") ? options.user : (options.signedIn ?? true) ? { id: "isolated-user" } : null }, error: options.authError ?? null };
    } } }; } },
    "@/lib/supabase/admin": { createSupabaseAdmin: () => admin },
    "@/lib/server/walletCrypto": { encryptSecret: (secret: string) => secret, decryptSecret: (cipher: string) => { calls.decrypts++; return cipher; } },
  }, { fetch: async () => { calls.funding++; return { ok: true }; } });
  return { api, calls };
}

test("an existing canonical wallet is identity-checked without minting or funding", async () => {
  const { api, calls } = walletSetup();
  assert.equal((await api.getSigner()).publicKey, "saved-public");
  assert.equal(calls.mints, 0); assert.equal(calls.funding, 0); assert.equal(calls.upserts, 0);
  assert.deepEqual(calls.readiness, ["saved-public"]);
});
test("auth response errors or outages cannot downgrade signing to the shared demo wallet", async () => {
  for (const options of [{ authThrows: true }, { authError: new Error("Isolated unavailable auth"), signedIn: false }]) {
    const { api, calls } = walletSetup(options);
    await assert.rejects(api.getSigner(), /Authentication is unavailable/);
    assert.equal(calls.demo, 0); assert.equal(calls.reads, 0); assert.equal(calls.mints, 0); assert.equal(calls.funding, 0);
  }
});
test("known anonymous sessions and unconfigured auth preserve intentional shared-demo signing", async () => {
  for (const options of [{ authError: new AuthSessionMissingError(), signedIn: false }, { authError: new AuthSessionMissingError(), authThrows: true }, { signedIn: false }, { configured: false }]) {
    const { api, calls } = walletSetup(options);
    assert.equal((await api.getSigner()).demo, true); assert.equal(calls.demo, 1); assert.equal(calls.reads, 0); assert.equal(calls.mints, 0);
  }
});
test("signed-in users cannot fall back to shared demo when wallet custody is unconfigured", async () => {
  const { api, calls } = walletSetup({ admin: false });
  await assert.rejects(api.getSigner(), /Wallet service is unavailable/); assert.equal(calls.demo, 0); assert.equal(calls.mints, 0);
});
test("wallet read errors fail before mint, persistence or faucet access", async () => {
  const { api, calls } = walletSetup({ reads: [{ data: null, error: { message: "Isolated read failure" } }] });
  await assert.rejects(api.getSigner(), /could not be loaded/);
  assert.equal(calls.mints, 0); assert.equal(calls.upserts, 0); assert.equal(calls.funding, 0);
});
test("wallet upsert errors never return or fund an orphan signer", async () => {
  const { api, calls } = walletSetup({ reads: [{ data: null }], saveError: true });
  await assert.rejects(api.getSigner(), /could not be saved/);
  assert.equal(calls.reads, 1); assert.equal(calls.mints, 1); assert.equal(calls.upserts, 1); assert.equal(calls.funding, 0);
});
test("missing or failed canonical rereads cannot return a transient new key", async () => {
  for (const reread of [{ data: null }, { data: null, error: { message: "Isolated reread failure" } }]) {
    const { api, calls } = walletSetup({ reads: [{ data: null }, reread] });
    await assert.rejects(api.getSigner(), /could not be confirmed/);
    assert.equal(calls.reads, 2); assert.equal(calls.funding, 0);
  }
});
test("canonical key mismatches fail closed both on load and after first-use persistence", async () => {
  const mismatch = { data: { public_key: "someone-else", secret_cipher: "saved-secret" } };
  for (const reads of [[mismatch], [{ data: null }, mismatch]]) {
    const { api, calls } = walletSetup({ reads });
    await assert.rejects(api.getSigner(), /identity mismatch/); assert.equal(calls.funding, 0);
  }
});
test("first-use race losers return the canonical winner without funding discarded keys", async () => {
  const { api, calls } = walletSetup({ reads: [{ data: null }, { data: { public_key: "winner-public", secret_cipher: "winner-secret" } }] });
  assert.equal((await api.getSigner()).publicKey, "winner-public"); assert.equal(calls.funding, 0);
  assert.deepEqual(calls.readiness, ["winner-public"]);
});
test("a first-use winner is funded only after its canonical persisted identity is confirmed", async () => {
  const { api, calls } = walletSetup({ reads: [{ data: null }, { data: { public_key: "new-public", secret_cipher: "new-secret" } }] });
  assert.equal((await api.getSigner()).publicKey, "new-public"); assert.equal(calls.reads, 2); assert.equal(calls.funding, 1);
});
test("Arisan readonly demo fallback exists for unconfigured auth, never signed-in missing wallets", async () => {
  const demo = walletSetup({ configured: false, admin: false });
  assert.equal(await demo.api.currentArisanPublicKey(), "demo-public"); assert.equal(demo.calls.auth, 0);
  for (const options of [{ reads: [{ data: null }] }, { admin: false }, { preview: true }]) {
    const current = walletSetup(options);
    assert.equal(await current.api.currentArisanPublicKey(), null);
    assert.equal(current.calls.demo, 0); assert.equal(current.calls.mints, 0); assert.equal(current.calls.funding, 0);
  }
});

test("Arisan guests use the shared public identity only after confirmed missing sessions", async () => {
  for (const options of [
    { signedIn: false, admin: false },
    { signedIn: false, authError: new AuthSessionMissingError() },
    { authThrows: true, authError: new AuthSessionMissingError() },
  ]) {
    const { api, calls } = walletSetup(options);
    assert.equal(await api.currentArisanPublicKey(), "demo-public");
    assert.equal(calls.auth, 1); assert.equal(calls.demo, 1); assert.equal(calls.reads, 0);
    assert.equal(calls.mints, 0); assert.equal(calls.upserts, 0); assert.equal(calls.decrypts, 0); assert.equal(calls.keyLoads, 0); assert.equal(calls.funding, 0);
  }
});

test("Arisan auth outages and non-session errors never borrow the guest identity", async () => {
  for (const options of [
    { authThrows: true },
    { signedIn: false, authError: new Error("Isolated auth unavailable") },
    { authError: new Error("Isolated invalid token") },
    { authError: new AuthSessionMissingError() },
  ]) {
    const { api, calls } = walletSetup(options);
    assert.equal(await api.currentArisanPublicKey(), null);
    assert.equal(calls.auth, 1); assert.equal(calls.demo, 0); assert.equal(calls.reads, 0);
    assert.equal(calls.mints, 0); assert.equal(calls.upserts, 0); assert.equal(calls.decrypts, 0); assert.equal(calls.funding, 0);
  }
});

test("signed-in Arisan identity reads only the authenticated owner's canonical public column", async () => {
  const { api, calls } = walletSetup({ reads: [{ data: { public_key: "isolated-canonical-public" } }] });
  assert.equal(await api.currentArisanPublicKey(), "isolated-canonical-public");
  assert.equal(calls.auth, 1); assert.equal(calls.reads, 1);
  assert.deepEqual(calls.columns, ["public_key"]); assert.deepEqual(calls.owners, ["isolated-user"]);
  assert.equal(calls.demo, 0); assert.equal(calls.mints, 0); assert.equal(calls.upserts, 0); assert.equal(calls.decrypts, 0); assert.equal(calls.keyLoads, 0); assert.equal(calls.funding, 0);
});

test("signed-in Arisan wallet failures, including session-shaped DB errors, cannot fall back", async () => {
  for (const options of [
    { reads: [{ data: null }] },
    { reads: [{ data: { public_key: "isolated-stale-public" }, error: { message: "Isolated DB failure" } }] },
    { reads: [{ data: { public_key: "" } }] },
    { readThrows: new Error("Isolated DB unavailable") },
    { readThrows: new AuthSessionMissingError() },
    { admin: false },
  ]) {
    const { api, calls } = walletSetup(options);
    assert.equal(await api.currentArisanPublicKey(), null);
    assert.equal(calls.auth, 1); assert.equal(calls.demo, 0); assert.equal(calls.mints, 0);
    assert.equal(calls.upserts, 0); assert.equal(calls.decrypts, 0); assert.equal(calls.keyLoads, 0); assert.equal(calls.funding, 0);
  }
});

test("preview and malformed auth payloads cannot resolve or provision an Arisan identity", async () => {
  for (const options of [{ preview: true, configured: false }, { user: undefined }, { user: {} }, { user: { id: "" } }, { user: { id: 123 } }, { clientThrows: new AuthSessionMissingError() }]) {
    const { api, calls } = walletSetup(options);
    assert.equal(await api.currentArisanPublicKey(), null);
    assert.equal(calls.demo, 0); assert.equal(calls.reads, 0); assert.equal(calls.mints, 0); assert.equal(calls.upserts, 0); assert.equal(calls.decrypts, 0); assert.equal(calls.funding, 0);
    assert.equal(calls.auth, options.preview || options.clientThrows ? 0 : 1);
  }
});

function stellarSetup(options: { status?: "SUCCESS" | "FAILED" | "NOT_FOUND"; sendError?: boolean; pollError?: boolean; prepareError?: boolean; rejected?: boolean; preview?: boolean } = {}) {
  const calls = { builds: 0, signs: 0, sends: 0, reads: 0 };
  class Server {
    async getAccount() { return {}; }
    async prepareTransaction(value: unknown) { if (options.prepareError) throw new Error("Isolated prepare failure"); return value; }
    async sendTransaction() { calls.sends++; if (options.sendError) throw new Error("Isolated lost submission response"); return { hash, status: options.rejected ? "ERROR" : "PENDING", errorResult: "Isolated rejection" }; }
    async getTransaction() {
      calls.reads++; if (options.pollError) throw new Error("Isolated read failure");
      return { status: options.status ?? "NOT_FOUND", resultXdr: { toXDR: () => "isolated-result" }, returnValue: 7 };
    }
  }
  const signed = () => ({ fee: "100", sign: () => { calls.signs++; }, hash: () => Buffer.from(hash, "hex") });
  class Builder {
    constructor() { calls.builds++; }
    addOperation() { return this; } setTimeout() { return this; } build() { return signed(); }
    static buildFeeBumpTransaction() { return signed(); }
  }
  class Contract { call() { return {}; } }
  const api = moduleFrom<{ invoke(...args: unknown[]): Promise<Result>; invokeAs(...args: unknown[]): Promise<Result>; invokeSponsored(...args: unknown[]): Promise<Result>; submittedTransactionStatus(value: unknown): Promise<Result> }>(stellarCode, {
    "@stellar/stellar-sdk": { rpc: { Server }, Keypair: { fromSecret: () => ({ publicKey: () => "isolated-public" }) },
      Contract, TransactionBuilder: Builder, Networks: { TESTNET: "isolated-network" }, BASE_FEE: "100", scValToNative: (value: unknown) => value },
    "@/lib/money": money, "@/lib/local-preview": { isLocalPreview: options.preview ?? false },
    "@/lib/arisan-funding-fees": feePolicy,
    "@/lib/server/walletReadiness": { getTestnetNativeBalance: async () => { throw Error("Unexpected balance access in isolated submission tests"); } },
  }, { process: { env: { SALAPI_DEMO_SECRET: "isolated-demo-secret", SALAPI_SPONSOR_SECRET: "isolated-sponsor-secret" } } });
  return { api, calls };
}
const submitMethods = ["invoke", "invokeAs", "invokeSponsored"] as const;
function argsFor(method: typeof submitMethods[number]) { return method === "invoke" ? ["isolated-contract", "transfer"] : ["isolated-secret", "isolated-contract", "transfer"]; }

test("all three signing paths retain their envelope hash on timeout without claiming failure or success", async () => {
  for (const method of submitMethods) {
    const { api, calls } = stellarSetup(); const result = await api[method](...argsFor(method));
    assert.equal(result.ok, false); assert.equal(result.pending, true); assert.equal(result.hash, hash);
    assert.match(result.error!, /Do not resubmit/); assert.equal(calls.sends, 1); assert.equal(calls.reads, 31);
  }
});
test("submission-response and polling failures preserve known signed identity", async () => {
  for (const options of [{ sendError: true }, { pollError: true }]) {
    const { api, calls } = stellarSetup(options); const result = await api.invokeAs(...argsFor("invokeAs"));
    assert.equal(result.pending, true); assert.equal(result.hash, hash); assert.equal(calls.sends, 1);
  }
});
test("pre-submit rejection, network rejection and confirmed failure are not mislabeled unknown", async () => {
  for (const options of [{ prepareError: true }, { rejected: true }, { status: "FAILED" as const }]) {
    const { api } = stellarSetup(options); const result = await api.invokeAs(...argsFor("invokeAs"));
    assert.equal(result.ok, false); assert.notEqual(result.pending, true);
  }
});
test("readonly reconciliation resolves SUCCESS/FAILED, retains UNKNOWN, and never submits", async () => {
  for (const status of ["SUCCESS", "FAILED", "NOT_FOUND"] as const) {
    const { api, calls } = stellarSetup({ status }); const result = await api.submittedTransactionStatus(hash);
    assert.equal(result.ok, status === "SUCCESS"); assert.equal(result.pending === true, status === "NOT_FOUND");
    assert.equal(result.hash, hash); assert.equal(calls.reads, 1); assert.equal(calls.sends, 0); assert.equal(calls.signs, 0); assert.equal(calls.builds, 0);
  }
});
test("reconciliation rejects malformed hashes and cannot poll real RPC in local preview", async () => {
  const invalid = stellarSetup();
  for (const value of ["", "x".repeat(64), "A".repeat(64), "a".repeat(63), null, 7]) assert.equal((await invalid.api.submittedTransactionStatus(value)).ok, false);
  assert.equal(invalid.calls.reads, 0);
  const local = stellarSetup({ preview: true }); assert.equal((await local.api.submittedTransactionStatus(hash)).ok, false); assert.equal(local.calls.reads, 0);
});

function actionsSetup(options: { result?: Result; preview?: boolean; reveal?: boolean; viewer?: string | null; viewerResolver?: () => Promise<string | null>; members?: string[]; roomByCode?: number } = {}) {
  const calls = { signers: 0, sends: 0, status: 0 };
  const dependencies = {
    "@stellar/stellar-sdk": { StrKey },
    "@/lib/server/arisanAuthorization": { authenticatedArisanWallet: async () => ({ ok: true, publicKey: arisanSender }) },
    "@/lib/server/stellar": { CONTRACTS: { usernameRegistry: "registry", tokenXlmSac: "token" },
      FRIENDS: ["one", "two"].map(name => ({ label: name, pub: () => `friend-${name}`, secret: () => `isolated-${name}` })),
      paluwaganId: () => "isolated-paluwagan", smartSavingsId: () => "isolated-savings", arisanRoomsId: () => "isolated-arisan",
      sc: Object.fromEntries(["str", "addr", "i128", "u32", "u64", "sym", "unitVariant", "bytes"].map(name => [name, (v: unknown) => v])),
      readContract: async (_id: string, method: string) => {
        if (method === "resolve") return "recipient-public";
        if (method === "get_room") return { host: arisanSender, name: "Isolated room", code: "234567", member_target: 3, share: 10000000n, cadence: "Weekly", first_kocok: Math.floor(Date.now() / 1000) + 720, join_deadline: Math.floor(Date.now() / 1000) + 600, status: "Open", member_count: 1, round: 0 };
        if (method === "get_members") return options.members ?? ["sender-public", arisanSender, "friend-one", "friend-two"];
        if (method === "members") return options.members ?? [arisanSender, "friend-one", "friend-two"];
        if (method === "recipient_of") return arisanSender;
        if (method === "has_committed") return options.reveal ?? false;
        if (["has_paid", "has_won", "has_revealed"].includes(method)) return false;
        if (method === "locked_of") return 0n;
        if (method === "room_by_code") return options.roomByCode ?? null;
        return 1;
      }, stroopsToPesos: (value: bigint) => Number(value) * 6.5 / 10000000, fmtPeso: (value: number) => String(value),
      txLink: (v: string) => `https://stellar.expert/explorer/testnet/tx/${v}`,
      invokeAs: async () => { calls.sends++; return options.result ?? { ok: false, pending: true, hash, error: "Isolated unknown" }; },
      submittedTransactionStatus: async () => { calls.status++; return options.result ?? { ok: false, pending: true, hash, error: "Isolated unknown" }; } },
    "@/lib/server/userWallet": {
      getSigner: async () => { calls.signers++; return { publicKey: "sender-public", secret: "isolated-secret", demo: false }; },
      getAuthenticatedSigner: async () => { calls.signers++; return { publicKey: arisanSender, secret: "isolated-authenticated-secret", demo: false }; },
      currentArisanPublicKey: options.viewerResolver ?? (async () => options.viewer === undefined ? "sender-public" : options.viewer),
    },
    "@/lib/money": money, "./disaster-actions": {}, "@/lib/supabase/env": {}, "@/lib/supabase/admin": {},
    "@/lib/local-preview": { isLocalPreview: options.preview ?? false }, "@/lib/arisan-list": { arisanRoomPage },
    "@/lib/recipient-review": { recipientReviewError: (resolved: string, expected?: string) => expected !== undefined && resolved !== expected ? "Recipient changed" : null },
    "@/lib/server/arisanCommitment": { deriveArisanSecret: () => new Uint8Array(32), createArisanCommitment: () => new Uint8Array(32) },
    "@/lib/server/xlmDeposit": {},
    "@/lib/server/walletActivity": { currentWalletActivity: async () => { throw Error("Unexpected activity access in isolated submission tests"); } },
  };
  const api = moduleFrom<Record<string, (...args: unknown[]) => Promise<Result>>>(actionsCode, dependencies, { crypto: { getRandomValues: (value: Uint8Array) => value.fill(2) } });
  return { api, calls };
}
test("Send action preserves pending/hash and rejects recipient rebinding before any signer or transfer", async () => {
  const { api, calls } = actionsSetup();
  const changed = await api.sendByUsername("jamamam", { amount: "100", currency: "tl" }, "different-public");
  assert.equal(changed.ok, false); assert.equal(calls.signers, 0); assert.equal(calls.sends, 0);
  const pending = await api.sendByUsername("jamamam", { amount: "100", currency: "tl" }, "recipient-public");
  assert.equal(pending.pending, true); assert.equal(pending.hash, hash); assert.equal(calls.sends, 1);
  await api.checkSubmittedTransfer(hash); assert.equal(calls.signers, 1); assert.equal(calls.sends, 1); assert.equal(calls.status, 1);
});
test("Savings, Paluwagan and Arisan wrappers preserve pending hashes without announcing success", async () => {
  for (const [method, args] of [
    ["smartSavingsDeposit", [{ amount: "100", currency: "tl" }]], ["smartSavingsOpen", [{ amount: "100", currency: "tl" }]],
    ["smartSavingsWithdraw", []], ["paluwaganPayMine", []], ["paluwaganCollect", []],
    ["arisanCreate", [{ name: "Isolated", memberTarget: 3, share: { amount: "100", currency: "tl" }, cadence: "Weekly" }]],
    ["arisanJoin", [reviewedArisan]], ["arisanLeave", [1]], ["arisanStart", [1]], ["arisanCancel", [1]], ["arisanCommit", [1]], ["arisanReveal", [1]], ["arisanFinalize", [1]], ["arisanPostpone", [1, 60]],
    ["registerUsername", ["jamamam"]], ["renameUsername", ["jamamam"]],
  ] as [string, unknown[]][]) {
    const { api, calls } = actionsSetup(method === "arisanJoin" ? { roomByCode: 1 } : {}); const result = await api[method](...args);
    assert.equal(result.ok, false, method); assert.equal(result.pending, true, method); assert.equal(result.hash, hash, method); assert.equal(calls.sends, 1, method);
  }
});
test("Arisan list retains matching readonly identity and never obtains a signer to discover rooms", async () => {
  for (const [viewer, expected] of [[arisanSender, 1], [null, 0]] as const) {
    const { api, calls } = actionsSetup({ viewer });
    const result = await api.arisanList() as unknown as { ready: boolean; mine: unknown[] };
    assert.equal(result.ready, true); assert.equal(result.mine.length, expected); assert.equal(calls.signers, 0); assert.equal(calls.sends, 0);
  }
});

test("real Arisan discovery cannot claim personal memberships for guests or auth-outage demo views", async () => {
  for (const [authError, expected] of [[new AuthSessionMissingError(), 0], [new Error("Isolated auth outage"), 0]] as const) {
    const identity = walletSetup({ signedIn: false, authError });
    const { api, calls } = actionsSetup({ viewerResolver: identity.api.currentArisanPublicKey, members: ["demo-public"] });
    const result = await api.arisanList() as unknown as { ready: boolean; mine: unknown[] };
    assert.equal(result.ready, true); assert.equal(result.mine.length, expected);
    assert.equal(calls.signers, 0); assert.equal(calls.sends, 0); assert.equal(identity.calls.auth, 1);
    assert.equal(identity.calls.reads, 0); assert.equal(identity.calls.mints, 0); assert.equal(identity.calls.upserts, 0);
    assert.equal(identity.calls.decrypts, 0); assert.equal(identity.calls.keyLoads, 0); assert.equal(identity.calls.funding, 0);
  }
});
test("room reads use the actual readonly wallet resolver without minting, custody decryption or funding", async () => {
  for (const options of [
    { reads: [{ data: { public_key: "sender-public" } }] },
    { signedIn: false, authError: new AuthSessionMissingError() },
    { signedIn: false, authError: new Error("Isolated auth outage") },
    { reads: [{ data: null }] },
  ]) {
    const identity = walletSetup(options);
    const { api, calls } = actionsSetup({ viewerResolver: identity.api.currentArisanPublicKey, members: ["sender-public", "demo-public"] });
    const room = await api.arisanRoomState(1) as unknown as { ready: boolean; viewer: string | null; code: string | null; canFinalize: boolean };
    assert.equal(room.ready, true); assert.equal(calls.signers, 0); assert.equal(calls.sends, 0);
    assert.equal(identity.calls.mints, 0); assert.equal(identity.calls.upserts, 0); assert.equal(identity.calls.funding, 0);
    assert.equal(identity.calls.decrypts, 0); assert.equal(identity.calls.keyLoads, 0);
    assert.ok(identity.calls.columns.every(column => column === "public_key"));
    if (room.viewer === null) assert.equal(room.code, null);
    assert.equal(room.canFinalize, false);
  }
});

test("legacy Paluwagan read preserves confirmed guest and saved-owner identities without signer or funding", async () => {
  const cases: [Parameters<typeof walletSetup>[0], string][] = [
    [{ reads: [{ data: { public_key: "sender-public" } }] }, "sender-public"],
    [{ signedIn: false, authError: new AuthSessionMissingError() }, "demo-public"],
    [{ configured: false }, "demo-public"],
  ];
  for (const [options, expected] of cases) {
    const identity = walletSetup(options);
    const { api, calls } = actionsSetup({ viewerResolver: identity.api.currentArisanPublicKey, members: ["sender-public", "demo-public", arisanSender] });
    const result = await api.paluwaganState() as unknown as { ready: boolean; seats: { addr: string; label: string }[] };
    assert.equal(result.ready, true);
    assert.equal(result.seats.find(seat => seat.addr === expected)?.label, "Ikaw (You)");
    assert.equal(calls.signers, 0); assert.equal(calls.sends, 0);
    assert.equal(identity.calls.mints, 0); assert.equal(identity.calls.upserts, 0); assert.equal(identity.calls.funding, 0);
    assert.equal(identity.calls.decrypts, 0); assert.equal(identity.calls.keyLoads, 0);
    assert.deepEqual(identity.calls.readiness, []);
    assert.ok(identity.calls.columns.every(column => column === "public_key"));
  }
});

test("legacy Paluwagan read fails closed for missing owner wallet and auth errors without provisioning", async () => {
  for (const options of [
    { reads: [{ data: null }] },
    { admin: false },
    { reads: [{ data: null, error: { message: "Isolated wallet read error" } }] },
    { signedIn: false, authError: new Error("Isolated auth outage") },
    { authThrows: true },
    { clientThrows: new AuthSessionMissingError() },
  ]) {
    const identity = walletSetup(options);
    const { api, calls } = actionsSetup({ viewerResolver: identity.api.currentArisanPublicKey });
    const result = await api.paluwaganState() as unknown as { ready: boolean; error: string };
    assert.equal(result.ready, false); assert.match(result.error, /wallet identity is unavailable/);
    assert.equal(calls.signers, 0); assert.equal(calls.sends, 0); assert.equal(identity.calls.demo, 0);
    assert.equal(identity.calls.mints, 0); assert.equal(identity.calls.upserts, 0); assert.equal(identity.calls.funding, 0);
    assert.equal(identity.calls.decrypts, 0); assert.equal(identity.calls.keyLoads, 0);
    assert.deepEqual(identity.calls.readiness, []);
  }
});
test("friend batches stop at the first unresolved envelope and preserve that hash", async () => {
  for (const method of ["paluwaganFriendsPay", "arisanFriendsJoin", "arisanFriendsCommit", "arisanFriendsReveal"]) {
    const { api, calls } = actionsSetup({ reveal: method === "arisanFriendsReveal" }); const result = await api[method](1);
    assert.equal(result.pending, true, method); assert.equal(result.hash, hash, method); assert.equal(calls.sends, 1, `${method} must not submit friend two`);
  }
});

type Element = { type: string; props: Record<string, unknown> };
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element; return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : "";
}
function sendSetup(options: { storage?: Map<string, string>; unavailable?: boolean; transfer?: Result | "throw" | Promise<Result>; status?: Result | "throw" | Promise<Result>; preview?: boolean } = {}) {
  const storage = options.storage ?? new Map<string, string>(); const preview = options.preview ?? false;
  const calls = { transfers: 0, statuses: 0, writes: 0, localRecords: 0 }; const state: unknown[] = []; const effects: (() => void)[] = []; const transitions: Promise<unknown>[] = []; let cursor = 0;
  const jsx = (type: string, props: Record<string, unknown>) => ({ type, props });
  const component = moduleFrom<{ default(props: { initialTo: string }): Element }>(sendCode, {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react": {
      useState: (initial: unknown) => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (value: unknown) => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
      useRef: (initial: unknown) => { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; },
      useEffect: (effect: () => void) => { const i = cursor++; if (!(i in state)) { state[i] = true; effects.push(effect); } },
      useTransition: () => [false, (callback: () => Promise<unknown>) => { transitions.push(callback()); }],
    },
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/components/I18nProvider": { useT: () => ({ currency: "tl", t: (v: string) => v }) },
    "@/lib/i18n/revamp-money": revampMoney,
    "@/lib/recipient-review": recipientReview,
    "@/components/AccountAvatar": { default: "AccountAvatar" },
    "@/components/useAccountPhoto": { useAccountPhoto: () => ({ profile: null }) },
    "@/components/ui/kit": { ...Object.fromEntries(["AppBar", "IconButton", "Btn", "Avatar", "PoweredByStellar"].map(v => [v, v])), T: {}, Ico: new Proxy({}, { get: () => () => null }) },
    "@/components/ui/SuccessMotion": { default: "SuccessMotion" }, "./SendRevamp.module.css": { default: {} },
    "@/components/ui/TransferMotion": { default: "TransferMotion" },
    "@/lib/ui/useGoBack": { useGoBack: () => () => {} }, "@/lib/ui/currency": { CURRENCY, formatLocalAmount, pesoFromLocal }, "@/lib/money": money,
    "@/lib/local-preview": { isLocalPreview: preview, PREVIEW_WALLET: { handle: "ariqhermawan", address: "preview-public" } },
    "@/lib/local-preview-history": { recordPreviewTransfer: () => { calls.localRecords++; return {}; } },
    "@/app/actions": { myHandle: async () => "sender", registerUsername: async () => { throw Error("Unexpected registration"); },
      lookupRecipient: async (username: string) => ({ ok: true, username, address: "recipient-public" }),
      sendByUsername: async () => { calls.transfers++; if (options.transfer === "throw") throw Error("Isolated lost action response"); return options.transfer ?? { ok: false, pending: true, hash, error: "Isolated unknown" }; },
      checkSubmittedTransfer: async (value: string) => { calls.statuses++; assert.equal(value, hash); if (options.status === "throw") throw Error("Isolated read error"); return options.status ?? { ok: false, pending: true, hash, error: "Still unknown" }; },
    },
  }, { window: {}, sessionStorage: {
    getItem: (key: string) => { if (options.unavailable) throw Error("Isolated storage error"); return storage.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (options.unavailable) throw Error("Isolated storage error"); calls.writes++; storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  } });
  function render() { cursor = 0; return component.default({ initialTo: "jamamam" }); }
  let tree = render(); for (const effect of effects.splice(0)) effect(); tree = render();
  async function settle() { while (transitions.length) await Promise.all(transitions.splice(0)); await Promise.resolve(); tree = render(); }
  function button(label: string) { return nodes(tree).find(n => n.type === "Btn" && text(n) === label); }
  return { calls, storage, get tree() { return tree; }, button, settle,
    begin(handler: () => void) { handler(); tree = render(); },
    async invoke(handler: () => void) { handler(); await settle(); },
    async click(label: string) { const current = button(label); assert.ok(current, `Missing button ${label}`); (current.props.onClick as () => void)(); await settle(); },
    amount(value: string) { const input = nodes(tree).find(n => n.props.id === "send-amount"); assert.ok(input); (input.props.onChange as (event: unknown) => void)({ target: { value } }); tree = render(); },
  };
}

test("unknown Send persists only a hash, blocks retained confirm handlers, and survives remount", async () => {
  const screen = sendSetup(); screen.amount("100"); await screen.click("Review transfer");
  const confirm = screen.button("Confirm Testnet transfer")!.props.onClick as () => void;
  await screen.invoke(confirm); assert.equal(screen.calls.transfers, 1); assert.equal(screen.storage.get(unresolvedKey), hash);
  assert.equal(screen.button("Confirm Testnet transfer"), undefined); assert.equal(screen.button("Edit transfer"), undefined);
  await screen.invoke(confirm); assert.equal(screen.calls.transfers, 1);
  const restored = sendSetup({ storage: screen.storage }); assert.ok(restored.button("Check submitted transaction"));
  assert.equal(restored.button("Review transfer"), undefined); assert.equal(restored.calls.transfers, 0);
});
test("status checks never transfer and unknown or unavailable results keep Send locked", async () => {
  for (const status of [undefined, "throw" as const]) {
    const screen = sendSetup({ storage: new Map([[unresolvedKey, hash]]), status });
    await screen.click("Check submitted transaction"); assert.equal(screen.calls.transfers, 0); assert.equal(screen.calls.statuses, 1);
    assert.equal(screen.storage.get(unresolvedKey), hash); assert.ok(screen.button("Check submitted transaction"));
    assert.equal(screen.button("Review transfer"), undefined);
  }
});
test("confirmed success removes the lock and shows generic receipt without trusting stored amount or recipient", async () => {
  const screen = sendSetup({ storage: new Map([[unresolvedKey, hash]]), status: { ok: true, hash, link: `https://stellar.expert/explorer/testnet/tx/${hash}` } as Result });
  await screen.click("Check submitted transaction"); assert.equal(screen.storage.has(unresolvedKey), false); assert.equal(screen.calls.transfers, 0);
  assert.ok(screen.button("Send again")); assert.match(text(screen.tree), /No new transfer was submitted by this check/);
  assert.doesNotMatch(text(screen.tree), /To@jamamam/);
});
test("confirmed failure clears the lock and unlocks amount entry instead of showing success", async () => {
  const screen = sendSetup({ storage: new Map([[unresolvedKey, hash]]), status: { ok: false, error: "Confirmed Testnet failure" } });
  await screen.click("Check submitted transaction"); assert.equal(screen.storage.has(unresolvedKey), false); assert.ok(screen.button("Review transfer"));
  assert.equal(nodes(screen.tree).some(n => n.type === "SuccessMotion"), false); assert.equal(screen.calls.transfers, 0);
});
test("lost action response leaves a session marker with no fabricated hash or retry control", async () => {
  const screen = sendSetup({ transfer: "throw" }); screen.amount("100"); await screen.click("Review transfer"); await screen.click("Confirm Testnet transfer");
  assert.equal(screen.storage.get(unresolvedKey), "unknown"); assert.equal(screen.button("Confirm Testnet transfer"), undefined); assert.equal(screen.button("Check submitted transaction"), undefined);
  const restored = sendSetup({ storage: screen.storage }); assert.equal(restored.button("Review transfer"), undefined); assert.equal(restored.calls.transfers, 0);
});
test("Send fails before submission when session retention is unavailable", async () => {
  const screen = sendSetup({ unavailable: true }); screen.amount("100"); await screen.click("Review transfer"); await screen.click("Confirm Testnet transfer");
  assert.equal(screen.calls.transfers, 0); assert.match(text(screen.tree), /Sending is blocked/);
});
test("definitive Send failures clear the marker and remain retryable without saved-success claims", async () => {
  const screen = sendSetup({ transfer: { ok: false, error: "Definitive rejection" } }); screen.amount("100"); await screen.click("Review transfer"); await screen.click("Confirm Testnet transfer");
  assert.equal(screen.storage.has(unresolvedKey), false); assert.ok(screen.button("Confirm Testnet transfer")); assert.equal(nodes(screen.tree).some(n => n.type === "SuccessMotion"), false);
});
test("local preview ignores real unresolved markers and performs no status lookup or marker write", async () => {
  const screen = sendSetup({ preview: true, storage: new Map([[unresolvedKey, otherHash]]) }); screen.amount("100"); await screen.click("Review transfer"); await screen.click("Confirm local demo");
  assert.equal(screen.calls.transfers, 0); assert.equal(screen.calls.statuses, 0); assert.equal(screen.calls.writes, 0); assert.equal(screen.calls.localRecords, 1); assert.equal(screen.storage.get(unresolvedKey), otherHash);
});

test("an in-flight transfer animates waiting, blocks a duplicate, and shows success only after confirmation", async () => {
  let confirm!: (result: Result) => void;
  const response = new Promise<Result>(resolve => { confirm = resolve; });
  const screen = sendSetup({ transfer: response }); screen.amount("100"); await screen.click("Review transfer");
  const submit = screen.button("Confirm Testnet transfer")!.props.onClick as () => void;
  screen.begin(submit);
  const wait = nodes(screen.tree).find(n => n.type === "TransferMotion");
  assert.ok(wait); assert.equal(wait.props.title, "Waiting for network confirmation");
  assert.equal(nodes(screen.tree).some(n => n.type === "SuccessMotion"), false);
  assert.equal(screen.storage.get(unresolvedKey), "unknown");
  assert.equal(screen.button("Confirm Testnet transfer"), undefined);
  screen.begin(submit); assert.equal(screen.calls.transfers, 1);
  confirm({ ok: true, link: `https://stellar.expert/explorer/testnet/tx/${hash}`, to: "recipient-public" } as Result);
  await screen.settle();
  assert.equal(nodes(screen.tree).some(n => n.type === "TransferMotion"), false);
  const success = nodes(screen.tree).find(n => n.type === "SuccessMotion");
  assert.ok(success); assert.equal(success.props.variant, "transfer");
  assert.equal(screen.storage.has(unresolvedKey), false);
  assert.ok(screen.button("View Activity")); assert.equal(screen.calls.transfers, 1);
});

test("a pending result or lost response stops waiting without ever showing a successful animation", async () => {
  for (const outcome of [{ ok: false, pending: true, hash, error: "Still checking" }, "throw" as const]) {
    let complete!: (result: Result) => void;
    const response = new Promise<Result>(resolve => { complete = resolve; });
    const screen = sendSetup({ transfer: outcome === "throw" ? outcome : response });
    screen.amount("100"); await screen.click("Review transfer");
    const submit = screen.button("Confirm Testnet transfer")!.props.onClick as () => void;
    screen.begin(submit);
    if (outcome !== "throw") complete(outcome);
    await screen.settle();
    assert.equal(nodes(screen.tree).some(n => n.type === "TransferMotion" || n.type === "SuccessMotion"), false);
    assert.equal(screen.button("Confirm Testnet transfer"), undefined);
    assert.equal(screen.storage.get(unresolvedKey), outcome === "throw" ? "unknown" : hash);
    screen.begin(submit); assert.equal(screen.calls.transfers, 1);
  }
});

test("status reconciliation animates a read-only check, not a new transfer", async () => {
  let complete!: (result: Result) => void;
  const response = new Promise<Result>(resolve => { complete = resolve; });
  const screen = sendSetup({ storage: new Map([[unresolvedKey, hash]]), status: response });
  const check = screen.button("Check submitted transaction")!.props.onClick as () => void;
  screen.begin(check);
  assert.equal(nodes(screen.tree).find(n => n.type === "TransferMotion")?.props.title, "Checking the original transaction…");
  assert.equal(nodes(screen.tree).some(n => n.type === "SuccessMotion"), false);
  screen.begin(check); assert.equal(screen.calls.statuses, 1); assert.equal(screen.calls.transfers, 0);
  complete({ ok: true, link: `https://stellar.expert/explorer/testnet/tx/${hash}` } as Result);
  await screen.settle();
  assert.equal(nodes(screen.tree).some(n => n.type === "SuccessMotion"), true);
  assert.ok(screen.button("View Activity")); assert.equal(screen.calls.transfers, 0);
});

test("transfer motion remains semantic and honors reduced motion without hiding confirmation", () => {
  const pendingSource = readFileSync(new URL("../components/ui/TransferMotion.tsx", import.meta.url), "utf8");
  const pendingCss = readFileSync(new URL("../components/ui/TransferMotion.module.css", import.meta.url), "utf8");
  const successSource = readFileSync(new URL("../components/ui/SuccessMotion.tsx", import.meta.url), "utf8");
  const successCss = readFileSync(new URL("../components/ui/SuccessMotion.module.css", import.meta.url), "utf8");
  assert.match(pendingSource, /role="status" aria-live="polite"/);
  assert.match(pendingCss, /prefers-reduced-motion:reduce/); assert.match(successCss, /prefers-reduced-motion:reduce/);
  assert.match(successSource, /role="status"/); assert.match(successCss, /stroke-dashoffset:0/);
  assert.doesNotMatch(pendingSource + successSource, /setTimeout|setInterval/);
  assert.match(successSource, /span className={styles.markWrap}/);
});
