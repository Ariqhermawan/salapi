import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import * as money from "../lib/money.ts";

const ownerId = "11111111-1111-4111-8111-111111111111";
const publicKey = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 41)).publicKey();
const verified = { id: ownerId, is_anonymous: false };
type Reply = { data: { user: unknown }; error: unknown };
const valid: Reply = { data: { user: verified }, error: null };
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const walletCode = compile("../lib/server/userWallet.ts");
const authorizationCode = compile("../lib/server/arisanAuthorization.ts");
const actionCode = compile("../app/actions.ts");
function load<T>(code: string, dependencies: Record<string, unknown>): T {
  const container = { exports: {} as T };
  runInNewContext(code, { module: container, exports: container.exports, Buffer, process: { env: {} }, console,
    fetch: () => { throw Error("No network allowed"); },
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected import ${name}`); return dependencies[name]; },
  });
  return container.exports;
}
function setup(replies: Reply[]) {
  const sequence = [...replies];
  const calls = { auth: 0, publicReads: 0, custodyReads: 0, decrypts: 0, invokes: 0 };
  const forbid = () => { throw Error("No provisioning/funding/demo access allowed"); };
  const shared = {
    "server-only": {},
    "@stellar/stellar-sdk": { StrKey, Keypair: { random: forbid, fromSecret: () => ({ publicKey: () => publicKey }) } },
    "@supabase/supabase-js": { isAuthSessionMissingError },
    "@/lib/local-preview": { isLocalPreview: false },
    "@/lib/supabase/env": { supabaseConfigured: () => true, supabaseAdminConfigured: () => true },
    "@/lib/supabase/server": { createSupabaseServer: async () => ({ auth: { getUser: async () => {
      calls.auth++; const reply = sequence.shift(); assert.ok(reply, "Unexpected extra auth lookup"); return reply;
    } } }) },
    "@/lib/supabase/admin": { createSupabaseAdmin: () => ({ from: (table: string) => {
      assert.equal(table, "wallets");
      return { select: (columns: string) => ({ eq: (column: string, owner: string) => {
        assert.equal(column, "user_id"); assert.equal(owner, ownerId);
        return { maybeSingle: async () => {
          if (columns === "public_key") { calls.publicReads++; return { data: { public_key: publicKey }, error: null }; }
          assert.equal(columns, "public_key, secret_cipher"); calls.custodyReads++;
          return { data: { public_key: publicKey, secret_cipher: "isolated-cipher" }, error: null };
        } };
      } }) };
    } }) },
    "@/lib/server/walletReadiness": { ensureTestnetAccount: forbid },
    "@/lib/server/walletCrypto": { encryptSecret: forbid, decryptSecret: () => { calls.decrypts++; return "isolated-secret"; } },
    "@/lib/server/stellar": { demoPublic: forbid },
  };
  const wallet = load<{ getAuthenticatedSigner(): Promise<{ demo: boolean; publicKey: string }> }>(walletCode, shared);
  const authorization = load(authorizationCode, shared);
  const actions = load<{ arisanLeave(id: number): Promise<{ ok: boolean; pending?: boolean; hash?: string }> }>(actionCode, {
    "@stellar/stellar-sdk": { StrKey },
    "@/lib/server/userWallet": wallet, "@/lib/server/arisanAuthorization": authorization,
    "@/lib/server/stellar": { arisanRoomsId: () => "isolated-room",
      sc: { u32: (value: unknown) => value, addr: (value: unknown) => value },
      invokeAs: async () => { calls.invokes++; return { ok: false, pending: true, hash: "a".repeat(64), error: "Pending" }; },
      txLink: (hash: string) => `https://isolated.invalid/${hash}`,
    },
    "@/lib/money": money, "./disaster-actions": {}, "@/lib/local-preview": { isLocalPreview: false },
    "@/lib/arisan-list": {}, "@/lib/recipient-review": {}, "@/lib/server/xlmDeposit": {},
    "@/lib/server/walletActivity": {}, "@/lib/server/arisanCommitment": {},
  });
  return { calls, wallet, actions };
}
const unsafe: Reply[] = [
  { data: { user: verified }, error: Error("Auth unavailable") },
  { data: { user: { ...verified, is_anonymous: true } }, error: null },
  { data: { user: { id: ownerId } }, error: null },
  { data: { user: { ...verified, id: "not-an-owner-id" } }, error: null },
  { data: { user: null }, error: null },
];
for (let index = 0; index < unsafe.length; index++) {
  test(`actual privileged signer rejects unsafe auth ${index} before custody`, async () => {
    const { wallet, calls } = setup([unsafe[index]]);
    await assert.rejects(wallet.getAuthenticatedSigner());
    assert.equal(calls.custodyReads, 0); assert.equal(calls.decrypts, 0); assert.equal(calls.invokes, 0);
  });
  test(`actual Arisan action rejects second auth read ${index} even after valid first auth`, async () => {
    const { actions, calls } = setup([valid, unsafe[index]]);
    assert.equal((await actions.arisanLeave(1)).ok, false);
    assert.equal(calls.auth, 2); assert.equal(calls.publicReads, 1);
    assert.equal(calls.custodyReads, 0); assert.equal(calls.decrypts, 0); assert.equal(calls.invokes, 0);
  });
}
test("verified nonanonymous actual signer remains read-only until the intentional action", async () => {
  const direct = setup([valid]);
  const signer = await direct.wallet.getAuthenticatedSigner();
  assert.equal(signer.demo, false); assert.equal(signer.publicKey, publicKey); assert.equal(direct.calls.invokes, 0);
  const action = setup([valid, valid]);
  const result = await action.actions.arisanLeave(1);
  assert.equal(result.ok, false); assert.equal(result.pending, true); assert.equal(result.hash, "a".repeat(64));
  assert.equal(action.calls.auth, 2); assert.equal(action.calls.custodyReads, 1);
  assert.equal(action.calls.decrypts, 1); assert.equal(action.calls.invokes, 1);
});
