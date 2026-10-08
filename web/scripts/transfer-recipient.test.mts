import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { StrKey } from "@stellar/stellar-sdk";
import * as recipientReview from "../lib/recipient-review.ts";

const address = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7));
const own = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 8));
const compile = (source: string) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const actionSource = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("actions.ts", actionSource, ts.ScriptTarget.Latest);
const lookupSource = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "lookupRecipient")!.getText(parsed);

function lookup(options: { resolved?: unknown; error?: Error; own?: string; walletGate?: Promise<void> } = {}) {
  let reads = 0;
  const exports = {} as { lookupRecipient(name: string): Promise<{ ok: boolean; code?: string; address?: string }> };
  runInNewContext(compile(lookupSource), { exports, Error, StrKey, ...recipientReview, isLocalPreview: false,
    CONTRACTS: { usernameRegistry: "registry" }, sc: { str: (value: string) => value },
    readContract: async (_id: string, method: string) => { assert.equal(method, "resolve"); reads++; if (options.error) throw options.error; return Object.hasOwn(options, "resolved") ? options.resolved : address; },
    currentWalletPublicKey: async () => { if (options.walletGate) await options.walletGate; return options.own ?? own; },
  });
  return { ...exports, reads: () => reads };
}
test("lookup rejects invalid input before any registry read and never guesses a recipient", async () => {
  const h = lookup();
  for (const name of ["i-mam", "im", "@@imam", "a".repeat(33)]) assert.equal((await h.lookupRecipient(name)).code, "invalid");
  assert.equal(h.reads(), 0);
  assert.equal((await h.lookupRecipient(" @IMAM ")).address, address);
});
test("lookup distinguishes absent, provider failure, malformed address and self", async () => {
  assert.equal((await lookup({ error: new Error("Error(Contract, #3)") }).lookupRecipient("imam")).code, "not_found");
  for (const error of [new Error("Error(Contract, #1)"), new Error("Timeout")])
    assert.equal((await lookup({ error }).lookupRecipient("imam")).code, "unavailable");
  for (const resolved of [null, 123, "G".repeat(56)]) assert.equal((await lookup({ resolved }).lookupRecipient("imam")).code, "unavailable");
  assert.equal((await lookup({ own: address }).lookupRecipient("imam")).code, "self");
});
test("independent wallet and registry review reads run concurrently", async () => {
  let release!: () => void;
  const h = lookup({ walletGate: new Promise<void>(resolve => { release = resolve; }) });
  const pending = h.lookupRecipient("imam"); await Promise.resolve(); assert.equal(h.reads(), 1);
  release(); assert.equal((await pending).ok, true);
});

const identityCode = compile(readFileSync(new URL("../lib/server/transferRecipientIdentity.ts", import.meta.url), "utf8"));
function identity(options: { user?: unknown; authError?: object; resolved?: string; readThrows?: boolean } = {}) {
  const calls = { auth: 0, registry: 0, photos: 0 };
  const exports = {} as { readTransferRecipientIdentity(username: string, address: string): Promise<{ ok: boolean; code?: string; photoUrl?: string }> };
  runInNewContext(identityCode, { exports, require(id: string) {
    if (id === "server-only") return {};
    if (id === "@stellar/stellar-sdk") return { StrKey };
    if (id === "@/lib/local-preview") return { isLocalPreview: false };
    if (id === "@/lib/recipient-review") return recipientReview;
    if (id === "@/lib/supabase/server") return { createSupabaseServer: async () => ({ auth: { getUser: async () => {
      calls.auth++; return { data: { user: Object.hasOwn(options, "user") ? options.user : { id: "fixture-owner", is_anonymous: false } }, error: options.authError ?? null };
    } } }) };
    if (id === "./stellar") return { CONTRACTS: { usernameRegistry: "registry" }, sc: { str: (v: string) => v }, readContract: async () => {
      calls.registry++; if (options.readThrows) throw Error("Sensitive provider diagnostics"); return options.resolved ?? address;
    } };
    if (id === "./walletActivityIdentity") return { readTransferWalletIdentity: async (target: string) => {
      calls.photos++; assert.equal(target, address); return { address, handle: "imam_current", photoUrl: "permitted-fixture-photo" };
    } };
    throw Error(`Forbidden review dependency ${id}`);
  } });
  return { ...exports, calls };
}
test("review identity authenticates per request and binds the exact recipient before reading any private photo", async () => {
  const h = identity(); assert.equal((await h.readTransferRecipientIdentity("imam", address)).ok, true);
  assert.deepEqual(h.calls, { auth: 1, registry: 1, photos: 1 });
  for (const user of [null, { is_anonymous: true }, { id: "fixture" }]) {
    const invalid = identity({ user }); assert.equal((await invalid.readTransferRecipientIdentity("imam", address)).ok, false);
    assert.deepEqual(invalid.calls, { auth: 1, registry: 0, photos: 0 });
  }
  const rebound = identity({ resolved: own }); assert.equal((await rebound.readTransferRecipientIdentity("imam", address)).code, "changed");
  assert.equal(rebound.calls.photos, 0);
});
test("malformed/unavailable identity reads expose no photo, email or provider diagnostics", async () => {
  const invalid = identity(); assert.equal((await invalid.readTransferRecipientIdentity("i-mam", address)).ok, false);
  assert.equal((await invalid.readTransferRecipientIdentity("imam", "bad")).ok, false); assert.equal(invalid.calls.auth, 0);
  const failed = identity({ readThrows: true }); const result = await failed.readTransferRecipientIdentity("imam", address);
  assert.equal(result.ok, false); assert.equal(failed.calls.photos, 0); assert.doesNotMatch(JSON.stringify(result), /Sensitive|photoUrl|email/);
});
