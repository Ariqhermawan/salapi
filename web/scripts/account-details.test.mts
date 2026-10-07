import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { AuthSessionMissingError, isAuthSessionMissingError } from "@supabase/supabase-js";
import { StrKey } from "@stellar/stellar-sdk";
import { RECEIPT_PHOTO_CONSENT, type AccountDetailsResult, type ReceiptPhotoResult } from "../lib/account-details.ts";

const ownerId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const publicKey = "GCUBT6T7SMQKJE5L2TJLUQQPSBBU5GVHALGLWWECEJUIV2YFFCSXGHY7";
const user = (metadata: Record<string, unknown> = {}) => ({ id: ownerId, email: " fixture@example.invalid ", user_metadata: metadata });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const source = compile("../lib/server/accountDetails.ts");
type Options = {
  preview?: boolean; configured?: boolean; adminConfigured?: boolean; currentUser?: unknown;
  authError?: unknown; authThrows?: unknown; factoryThrows?: unknown; malformedAuthData?: boolean;
  wallet?: unknown; walletError?: unknown; walletThrows?: boolean; handle?: unknown; handleThrows?: unknown;
  updateError?: unknown; updateThrows?: boolean; updatedUser?: unknown;
};

// Execute the real server helper with only Auth, saved-wallet SQL and public
// username RPC replaced. Any provisioning, signing or network access fails.
function setup(options: Options = {}) {
  const currentUser = options.currentUser === undefined ? user() : options.currentUser;
  const calls = { factories: 0, auth: 0, admin: 0, tables: [] as string[], selections: [] as string[],
    filters: [] as [string, unknown][], handles: [] as unknown[][], updates: [] as Record<string, unknown>[], logs: 0 };
  const api = {} as {
    readAccountDetails(expectedOwner: unknown): Promise<AccountDetailsResult>;
    saveReceiptPhotoConsent(expectedOwner: unknown, enabled: unknown): Promise<ReceiptPhotoResult>;
  };
  runInNewContext(source, { exports: api, Error,
    fetch() { throw Error("External network forbidden in isolated account tests"); },
    console: { log() { calls.logs++; }, warn() { calls.logs++; }, error() { calls.logs++; } },
    require(name: string) {
      if (name === "server-only") return {};
      if (name === "@supabase/supabase-js") return { isAuthSessionMissingError };
      if (name === "@stellar/stellar-sdk") return { StrKey };
      if (name === "@/lib/account-details") return { RECEIPT_PHOTO_CONSENT };
      if (name === "@/lib/local-preview") return { isLocalPreview: options.preview ?? false };
      if (name === "@/lib/supabase/env") return {
        supabaseConfigured: () => options.configured ?? true, supabaseAdminConfigured: () => options.adminConfigured ?? true,
      };
      if (name === "@/lib/supabase/server") return { async createSupabaseServer() {
        calls.factories++;
        if (options.factoryThrows) throw options.factoryThrows;
        return { auth: {
          async getUser() {
            calls.auth++;
            if (options.authThrows) throw options.authThrows;
            return { data: options.malformedAuthData ? undefined : { user: currentUser }, error: options.authError ?? null };
          },
          async updateUser(input: Record<string, unknown>) {
            calls.updates.push(clone(input));
            if (options.updateThrows) throw Error("Private upstream details must never escape");
            const data = input.data as Record<string, unknown>;
            const updatedUser = options.updatedUser === undefined
              ? { ...(currentUser as ReturnType<typeof user>), user_metadata: { ...(currentUser as ReturnType<typeof user>).user_metadata, ...data } }
              : options.updatedUser;
            return { data: { user: updatedUser }, error: options.updateError ?? null };
          },
        } };
      } };
      if (name === "@/lib/supabase/admin") return { createSupabaseAdmin() {
        calls.admin++;
        return { from(table: string) {
          calls.tables.push(table);
          return { select(columns: string) {
            calls.selections.push(columns);
            return { eq(column: string, value: unknown) {
              calls.filters.push([column, value]);
              return { async maybeSingle() {
                if (options.walletThrows) throw Error("Private database failure");
                return { data: options.wallet === undefined ? { public_key: publicKey } : options.wallet, error: options.walletError ?? null };
              } };
            } };
          } };
        } };
      } };
      if (name === "@/lib/server/stellar") return {
        CONTRACTS: { usernameRegistry: "readonly-registry" }, sc: { addr: (address: string) => address },
        async readContract(...args: unknown[]) {
          calls.handles.push(clone(args));
          if (options.handleThrows) throw options.handleThrows;
          return options.handle === undefined ? "fixture_user" : options.handle;
        },
      };
      throw Error(`Unexpected account-details dependency ${name}`);
    },
  });
  return { api, calls };
}

test("account reads authenticate with getUser and select only the current owner's public wallet", async () => {
  const h = setup(); const result = await h.api.readAccountDetails(ownerId);
  assert.deepEqual(clone(result), { ok: true, account: {
    ownerId, email: "fixture@example.invalid", address: publicKey, handle: "fixture_user", receiptPhotoConsent: false, identityUnavailable: false,
  } });
  assert.equal(h.calls.auth, 1);
  assert.deepEqual(h.calls.tables, ["wallets"]); assert.deepEqual(h.calls.selections, ["public_key"]);
  assert.deepEqual(h.calls.filters, [["user_id", ownerId]]);
  assert.deepEqual(h.calls.handles, [["readonly-registry", "username_of", [publicKey]]]);
  assert.deepEqual(h.calls.updates, []); assert.equal(h.calls.logs, 0);
});

for (const consent of [undefined, null, false, "true", 1, {}, true]) {
  test(`receipt photo consent is false unless metadata is the literal true boolean: ${JSON.stringify(consent)}`, async () => {
    const h = setup({ currentUser: user({ [RECEIPT_PHOTO_CONSENT]: consent, role: "admin" }) });
    const result = await h.api.readAccountDetails(ownerId); assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.account.receiptPhotoConsent, consent === true);
    assert.deepEqual(h.calls.updates, []);
  });
}

for (const expected of [undefined, null, 1, {}, "", "../../owner", "not-a-uuid", `${ownerId}suffix`]) {
  test(`invalid owner never reaches authentication, SQL or mutation: ${JSON.stringify(expected)}`, async () => {
    const h = setup();
    assert.deepEqual(clone(await h.api.readAccountDetails(expected)), { ok: false, code: "invalid_input" });
    assert.deepEqual(clone(await h.api.saveReceiptPhotoConsent(expected, true)), { ok: false, code: "invalid_input" });
    assert.equal(h.calls.auth, 0); assert.equal(h.calls.factories, 0); assert.equal(h.calls.admin, 0); assert.equal(h.calls.updates.length, 0);
  });
}

for (const options of [{ preview: true }, { configured: false }]) {
  test(`preview or unconfigured auth cannot read or alter an account: ${JSON.stringify(options)}`, async () => {
    const h = setup(options);
    for (const result of [await h.api.readAccountDetails(ownerId), await h.api.saveReceiptPhotoConsent(ownerId, true)])
      assert.deepEqual(clone(result), { ok: false, code: "unavailable" });
    assert.equal(h.calls.factories, 0); assert.equal(h.calls.admin, 0); assert.equal(h.calls.updates.length, 0);
  });
}

for (const [options, code] of [
  [{ currentUser: null }, "unauthenticated"],
  [{ currentUser: null, authError: new AuthSessionMissingError() }, "unauthenticated"],
  [{ authThrows: new AuthSessionMissingError() }, "unauthenticated"],
  [{ factoryThrows: new AuthSessionMissingError() }, "unauthenticated"],
  [{ authError: Error("Private Auth outage") }, "unavailable"],
  [{ currentUser: null, authError: Error("Auth outage is not a guest") }, "unavailable"],
  [{ authError: new AuthSessionMissingError() }, "unavailable"],
  [{ authThrows: Error("Private Auth outage") }, "unavailable"],
  [{ factoryThrows: Error("Private client failure") }, "unavailable"],
  [{ malformedAuthData: true }, "unavailable"],
  [{ currentUser: {} }, "unavailable"],
  [{ currentUser: { id: 17 } }, "unavailable"],
  [{ currentUser: { ...user(), id: otherId } }, "account_changed"],
] as [Options, string][]) {
  test(`unverified identity fails closed (${code}): ${Object.keys(options).join(",")}`, async () => {
    const h = setup(options);
    assert.deepEqual(clone(await h.api.readAccountDetails(ownerId)), { ok: false, code });
    assert.deepEqual(clone(await h.api.saveReceiptPhotoConsent(ownerId, true)), { ok: false, code });
    assert.equal(h.calls.admin, 0); assert.equal(h.calls.handles.length, 0); assert.equal(h.calls.updates.length, 0); assert.equal(h.calls.logs, 0);
  });
}

test("a missing saved wallet remains absent and never provisions a keypair or invokes username RPC", async () => {
  const h = setup({ wallet: null }); const result = await h.api.readAccountDetails(ownerId); assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.account.address, null); assert.equal(result.account.handle, null); assert.equal(result.account.identityUnavailable, false);
  }
  assert.equal(h.calls.handles.length, 0); assert.equal(h.calls.updates.length, 0);
});

for (const options of [{ adminConfigured: false }, { walletError: Error("Private DB error") }, { walletThrows: true },
  { wallet: {} }, { wallet: { public_key: "not-an-address" } }, { wallet: { public_key: 17 } }]) {
  test(`wallet lookup failure preserves verified email and reports unavailable identity: ${Object.keys(options).join(",")}`, async () => {
    const h = setup(options); const result = await h.api.readAccountDetails(ownerId); assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.account.ownerId, ownerId); assert.equal(result.account.email, "fixture@example.invalid");
      assert.equal(result.account.address, null); assert.equal(result.account.identityUnavailable, true);
    }
    assert.equal(h.calls.handles.length, 0); assert.equal(h.calls.updates.length, 0); assert.equal(h.calls.logs, 0);
  });
}

test("known username NotFound is not an identity outage, other RPC errors do not erase the wallet", async () => {
  for (const [error, unavailable] of [[Error("Error(Contract, #3)"), false], [Error("Private RPC outage"), true]] as const) {
    const h = setup({ handleThrows: error }); const result = await h.api.readAccountDetails(ownerId); assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.account.address, publicKey); assert.equal(result.account.handle, null); assert.equal(result.account.identityUnavailable, unavailable);
    }
  }
  for (const handle of [null, "", "<script>", "UPPERCASE", "a".repeat(33), {}]) {
    const h = setup({ handle }); const result = await h.api.readAccountDetails(ownerId); assert.equal(result.ok, true);
    if (result.ok) { assert.equal(result.account.handle, null); assert.equal(result.account.identityUnavailable, true); assert.equal(result.account.address, publicKey); }
  }
});

for (const enabled of [undefined, null, "true", 1, {}, []]) {
  test(`non-boolean consent never authenticates or writes: ${JSON.stringify(enabled)}`, async () => {
    const h = setup(); assert.deepEqual(clone(await h.api.saveReceiptPhotoConsent(ownerId, enabled)), { ok: false, code: "invalid_input" });
    assert.equal(h.calls.auth, 0); assert.equal(h.calls.updates.length, 0);
  });
}

for (const enabled of [true, false]) {
  test(`confirmed consent ${enabled} updates only the privacy key through the authenticated session`, async () => {
    const h = setup({ currentUser: user({ role: "user", avatar_url: "private-existing-value", [RECEIPT_PHOTO_CONSENT]: !enabled }) });
    assert.deepEqual(clone(await h.api.saveReceiptPhotoConsent(ownerId, enabled)), { ok: true, ownerId, enabled });
    assert.equal(h.calls.auth, 1); assert.equal(h.calls.admin, 0);
    assert.deepEqual(h.calls.updates, [{ data: { [RECEIPT_PHOTO_CONSENT]: enabled } }]); assert.equal(h.calls.logs, 0);
  });
}

for (const options of [{ updateError: Error("Private Auth failure") }, { updateThrows: true }, { updatedUser: null },
  { updatedUser: { ...user(), id: otherId, user_metadata: { [RECEIPT_PHOTO_CONSENT]: true } } },
  { updatedUser: user() }, { updatedUser: user({ [RECEIPT_PHOTO_CONSENT]: "true" }) },
  { updatedUser: user({ [RECEIPT_PHOTO_CONSENT]: false }) }]) {
  test(`an unconfirmed write never announces success or exposes upstream details: ${Object.keys(options).join(",")}`, async () => {
    const h = setup(options); assert.deepEqual(clone(await h.api.saveReceiptPhotoConsent(ownerId, true)), { ok: false, code: "save_failed" });
    assert.equal(h.calls.updates.length, 1); assert.equal(h.calls.admin, 0); assert.equal(h.calls.logs, 0);
  });
}

test("public server-action wrappers execute the guarded helpers without adding arbitrary update fields", async () => {
  const h = setup(); const api = {} as { accountDetails(owner: unknown): Promise<AccountDetailsResult>; setReceiptPhotoConsent(owner: unknown, enabled: unknown): Promise<ReceiptPhotoResult> };
  runInNewContext(compile("../app/account-details-actions.ts"), { exports: api, require(name: string) {
    assert.equal(name, "@/lib/server/accountDetails"); return h.api;
  } });
  assert.equal((await api.accountDetails(ownerId)).ok, true);
  assert.deepEqual(clone(await api.setReceiptPhotoConsent(otherId, true)), { ok: false, code: "account_changed" });
  assert.equal(h.calls.updates.length, 0);
  assert.deepEqual(clone(await api.setReceiptPhotoConsent(ownerId, true)), { ok: true, ownerId, enabled: true });
  assert.deepEqual(h.calls.updates, [{ data: { [RECEIPT_PHOTO_CONSENT]: true } }]);
});
