import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { AuthSessionMissingError, isAuthSessionMissingError } from "@supabase/supabase-js";

const source = readFileSync(new URL("../app/account-actions.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

type Result = { ok: true; handle: string | null } | { ok: false };
type Options = {
  preview?: boolean;
  configured?: boolean;
  adminConfigured?: boolean;
  authResult?: unknown;
  authThrow?: unknown;
  clientThrow?: unknown;
  adminThrow?: unknown;
  dbResult?: unknown;
  dbThrow?: unknown;
  contractValue?: unknown;
  contractThrow?: unknown;
  addressThrow?: unknown;
};
type ReadQuery = {
  select: (columns: string) => ReadQuery;
  eq: (column: string, value: unknown) => ReadQuery;
  maybeSingle: () => Promise<unknown>;
};

// Execute the complete actual Server Action, not a copied handler. Only the
// request's verified auth response, read-only wallet query and contract lookup
// are stubbed. No cookies, credentials, provider APIs or network are accessed.
function setup(options: Options = {}) {
  const calls = {
    server: 0, auth: 0, admin: 0,
    tables: [] as string[], columns: [] as string[],
    filters: [] as { column: string; value: unknown }[],
    addresses: [] as string[], contracts: [] as { id: string; method: string; args: unknown[] }[],
    forbidden: [] as string[],
  };
  function forbid(label: string): never {
    calls.forbidden.push(label);
    throw new Error(`Forbidden dependency: ${label}`);
  }
  function guarded<T extends object>(value: T, label: string): T {
    return new Proxy(value, {
      get(target, property, receiver) {
        if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
        return forbid(`${label}.${String(property)}`);
      },
    });
  }
  const query: ReadQuery = guarded({
    select(columns: string) { calls.columns.push(columns); return query; },
    eq(column: string, value: unknown) { calls.filters.push({ column, value }); return query; },
    async maybeSingle() {
      if ("dbThrow" in options) throw options.dbThrow;
      return "dbResult" in options ? options.dbResult : { data: { public_key: "wallet-user-a" }, error: null };
    },
  }, "wallet query");
  const dependencies: Record<string, unknown> = {
    "@supabase/supabase-js": guarded({ isAuthSessionMissingError }, "Supabase export"),
    "@/lib/local-preview": { isLocalPreview: options.preview ?? false, PREVIEW_WALLET: { handle: "preview_user" } },
    "@/lib/supabase/env": {
      supabaseConfigured: () => options.configured ?? true,
      supabaseAdminConfigured: () => options.adminConfigured ?? true,
    },
    "@/lib/supabase/server": {
      async createSupabaseServer() {
        calls.server++;
        if ("clientThrow" in options) throw options.clientThrow;
        return { auth: guarded({
          async getUser() {
            calls.auth++;
            if ("authThrow" in options) throw options.authThrow;
            return "authResult" in options ? options.authResult : { data: { user: { id: "user-a" } }, error: null };
          },
        }, "auth") };
      },
    },
    "@/lib/supabase/admin": {
      createSupabaseAdmin() {
        calls.admin++;
        if ("adminThrow" in options) throw options.adminThrow;
        return guarded({ from(table: string) { calls.tables.push(table); return query; } }, "admin");
      },
    },
    "@/lib/server/stellar": guarded({
      CONTRACTS: { usernameRegistry: "test-username-registry" },
      sc: guarded({ addr(address: string) {
        calls.addresses.push(address);
        if ("addressThrow" in options) throw options.addressThrow;
        return { ownerAddress: address };
      } }, "sc"),
      async readContract(id: string, method: string, args: unknown[]) {
        calls.contracts.push({ id, method, args });
        if ("contractThrow" in options) throw options.contractThrow;
        return "contractValue" in options ? options.contractValue : "owner_a";
      },
    }, "stellar"),
  };
  const actionModule = { exports: {} as { settingsHandle?: () => Promise<Result> } };
  runInNewContext(compiled, {
    module: actionModule, exports: actionModule.exports, Error,
    require(name: string) { return dependencies[name] ?? forbid(name); },
  });
  assert.equal(typeof actionModule.exports.settingsHandle, "function");
  const action = actionModule.exports.settingsHandle!;
  async function invoke() {
    const result = { ...await action() };
    assert.deepEqual(calls.forbidden, [], "Never access signing, funding, writes or unexpected dependencies");
    assert.ok(calls.tables.every(table => table === "wallets"));
    assert.ok(calls.columns.every(columns => columns === "public_key"), "Never select secret custody columns");
    assert.ok(calls.filters.every(filter => filter.column === "user_id"));
    return result;
  }
  return { invoke, calls };
}

function assertNoWalletLookup(screen: ReturnType<typeof setup>) {
  assert.equal(screen.calls.admin, 0);
  assert.deepEqual(screen.calls.tables, []);
  assert.deepEqual(screen.calls.contracts, []);
}

test("preview returns its fixture without touching auth, custody or RPC", async () => {
  const screen = setup({ preview: true, clientThrow: new Error("Auth must not run") });
  assert.deepEqual(await screen.invoke(), { ok: true, handle: "preview_user" });
  assert.equal(screen.calls.server, 0);
  assert.equal(screen.calls.auth, 0);
  assertNoWalletLookup(screen);
});

test("unconfigured auth returns no handle without resolving a demo wallet", async () => {
  const screen = setup({ configured: false });
  assert.deepEqual(await screen.invoke(), { ok: true, handle: null });
  assert.equal(screen.calls.server, 0);
  assertNoWalletLookup(screen);
});

test("confirmed missing sessions, returned or thrown by getUser, are guest results", async () => {
  for (const options of [
    { authResult: { data: { user: null }, error: new AuthSessionMissingError() } },
    { authThrow: new AuthSessionMissingError() },
    { authResult: { data: { user: null }, error: null } },
  ]) {
    const screen = setup(options);
    assert.deepEqual(await screen.invoke(), { ok: true, handle: null });
    assert.equal(screen.calls.auth, 1);
    assertNoWalletLookup(screen);
  }
});

test("auth outages are errors, including errors resembling a missing-session message", async () => {
  for (const options of [
    { authResult: { data: { user: null }, error: new Error("Auth unavailable") } },
    { authThrow: new Error("Auth unavailable") },
    { authThrow: new Error("Auth session missing!") },
    { authResult: { data: { user: null }, error: { name: "AuthSessionMissingError" } } },
    { authResult: { data: { user: { id: "user-a" } }, error: new AuthSessionMissingError() } },
  ]) {
    const screen = setup(options);
    assert.deepEqual(await screen.invoke(), { ok: false });
    assertNoWalletLookup(screen);
  }
});

test("client setup errors are not evidence of a guest, even with a session-missing class", async () => {
  for (const clientThrow of [new Error("Client unavailable"), new AuthSessionMissingError()]) {
    const screen = setup({ clientThrow });
    assert.deepEqual(await screen.invoke(), { ok: false });
    assert.equal(screen.calls.auth, 0);
    assertNoWalletLookup(screen);
  }
});

test("malformed verified-user responses never produce a ready guest result", async () => {
  for (const authResult of [undefined, null, {}, { data: null, error: null },
    { data: {}, error: null }, { data: { user: {} }, error: null },
    ...["", " ", 12, null].map(id => ({ data: { user: { id } }, error: null })),
  ]) {
    const screen = setup({ authResult });
    assert.deepEqual(await screen.invoke(), { ok: false });
    assertNoWalletLookup(screen);
  }
});

test("each verified user resolves only their stored public key, never caller-selected identity", async () => {
  for (const suffix of ["a", "b"]) {
    const screen = setup({
      authResult: { data: { user: { id: `user-${suffix}` } }, error: null },
      dbResult: { data: { public_key: `wallet-user-${suffix}` }, error: null },
      contractValue: `owner_${suffix}`,
    });
    assert.deepEqual(await screen.invoke(), { ok: true, handle: `owner_${suffix}` });
    assert.equal(screen.calls.auth, 1);
    assert.deepEqual(screen.calls.tables, ["wallets"]);
    assert.deepEqual(screen.calls.columns, ["public_key"]);
    assert.deepEqual(screen.calls.filters, [{ column: "user_id", value: `user-${suffix}` }]);
    assert.deepEqual(screen.calls.addresses, [`wallet-user-${suffix}`]);
    assert.deepEqual(JSON.parse(JSON.stringify(screen.calls.contracts)), [{
      id: "test-username-registry", method: "username_of", args: [{ ownerAddress: `wallet-user-${suffix}` }],
    }]);
  }
});

test("a confirmed absent wallet returns no handle without provisioning or RPC", async () => {
  const screen = setup({ dbResult: { data: null, error: null } });
  assert.deepEqual(await screen.invoke(), { ok: true, handle: null });
  assert.deepEqual(screen.calls.columns, ["public_key"]);
  assert.deepEqual(screen.calls.contracts, []);
});

test("custody configuration, factory, query errors and malformed rows fail closed", async () => {
  for (const options of [
    { adminConfigured: false }, { adminThrow: new Error("Custody client unavailable") },
    { dbThrow: new Error("Database unreachable") },
    { dbResult: { data: null, error: { code: "database_unavailable" } } },
    { dbResult: { data: { public_key: "wallet-user-a" }, error: { code: "read_failed" } } },
    ...[undefined, {}, { data: undefined, error: null },
      ...[{}, { public_key: "" }, { public_key: null }, { public_key: 12 }]
        .map(data => ({ data, error: null }))].map(dbResult => ({ dbResult })),
  ]) {
    const screen = setup(options);
    assert.deepEqual(await screen.invoke(), { ok: false });
    assert.deepEqual(screen.calls.contracts, []);
  }
});

test("invalid stored address encoding does not become a missing username", async () => {
  const screen = setup({ addressThrow: new Error("Invalid address") });
  assert.deepEqual(await screen.invoke(), { ok: false });
  assert.deepEqual(screen.calls.contracts, []);
});

test("only the registry's explicit NotFound contract error permits Claim", async () => {
  const registry = readFileSync(new URL("../../contracts/username-registry/src/lib.rs", import.meta.url), "utf8");
  assert.match(registry, /NotFound\s*=\s*3/);
  assert.match(registry, /pub fn username_of\([^)]*\)\s*->\s*Result<String, Error>/);
  const missing = setup({ contractThrow: new Error("HostError: Error(Contract, #3)") });
  assert.deepEqual(await missing.invoke(), { ok: true, handle: null });
  for (const contractThrow of [new Error("RPC unavailable"), new Error("Error(Contract, #13)"),
    new Error("Error(Contract, #1)"), new Error("not found #3"), "Error(Contract, #3)", null,
  ]) {
    assert.deepEqual(await setup({ contractThrow }).invoke(), { ok: false });
  }
});

test("missing or malformed RPC return values are errors, not absent usernames", async () => {
  for (const contractValue of [undefined, null, "", 42, {}, [], false]) {
    assert.deepEqual(await setup({ contractValue }).invoke(), { ok: false });
  }
});

test("display preserves existing nonempty registry strings without imposing a new claim policy", async () => {
  for (const contractValue of ["Existing.Handle", "ab", "pemilik_akun", "NgườiDùng"]) {
    assert.deepEqual(await setup({ contractValue }).invoke(), { ok: true, handle: contractValue });
  }
});
