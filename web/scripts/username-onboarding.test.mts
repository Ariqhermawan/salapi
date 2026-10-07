import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { isAuthSessionMissingError, AuthSessionMissingError } from "@supabase/supabase-js";
import { StrKey } from "@stellar/stellar-sdk";
import { normalizedUsername, usernameGateExempt, OWNER_PATTERN, USERNAME_PATTERN, type UsernameStatus, type UsernameSaveResult } from "../lib/username-onboarding.ts";

const ownerId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const address = "GCUBT6T7SMQKJE5L2TJLUQQPSBBU5GVHALGLWWECEJUIV2YFFCSXGHY7";
const otherAddress = "GAKZLTZFGSSM372XUKW2ZIJ5GSHVVIW5BYZIKIXRW2BW4MM6TUI5536Y";
const notFound = () => Error("Error(Contract, #3)");
const source = ts.transpileModule(readFileSync(new URL("../lib/server/usernameOnboarding.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const copy = (value: unknown) => JSON.parse(JSON.stringify(value));
type Options = { preview?: boolean; configured?: boolean; admin?: boolean; user?: unknown; authError?: unknown; authThrows?: unknown;
  wallet?: unknown; walletError?: unknown; handles?: unknown[]; signer?: unknown; signerThrows?: boolean; result?: unknown; invokeThrows?: boolean };
function setup(o: Options = {}) {
  const calls = { auth: 0, reads: 0, signers: 0, invokes: [] as unknown[][], queries: [] as unknown[][] };
  const handles = o.handles ?? [notFound()];
  const api = {} as { readUsernameStatus(owner: unknown): Promise<UsernameStatus>; saveOnboardingUsername(owner: unknown, value: unknown): Promise<UsernameSaveResult> };
  runInNewContext(source, { exports: api, Error, require(name: string) {
    if (name === "server-only") return {};
    if (name === "@supabase/supabase-js") return { isAuthSessionMissingError };
    if (name === "@stellar/stellar-sdk") return { StrKey };
    if (name === "@/lib/username-onboarding") return { OWNER_PATTERN, USERNAME_PATTERN, normalizedUsername };
    if (name === "@/lib/local-preview") return { isLocalPreview: o.preview ?? false };
    if (name === "@/lib/supabase/env") return { supabaseConfigured: () => o.configured ?? true, supabaseAdminConfigured: () => o.admin ?? true };
    if (name === "@/lib/supabase/server") return { async createSupabaseServer() { return { auth: { async getUser() {
      calls.auth++; if (o.authThrows) throw o.authThrows;
      return { data: { user: o.user === undefined ? { id: ownerId, is_anonymous: false, user_metadata: { username: "spoofed" } } : o.user }, error: o.authError ?? null };
    } } }; } };
    if (name === "@/lib/supabase/admin") return { createSupabaseAdmin() { return { from(table: string) { return { select(columns: string) { return { eq(column: string, value: string) {
      calls.queries.push([table, columns, column, value]); return { async maybeSingle() { return { data: o.wallet === undefined ? { public_key: address } : o.wallet, error: o.walletError ?? null }; } };
    } }; } }; } }; } };
    if (name === "@/lib/server/userWallet") return { async getAuthenticatedSigner() {
      calls.signers++; if (o.signerThrows) throw Error("Private custody details");
      return o.signer ?? { publicKey: address, secret: "fixture-secret-not-a-key", demo: false };
    } };
    if (name === "@/lib/server/stellar") return { CONTRACTS: { usernameRegistry: "registry" }, sc: { addr: (x: string) => x, str: (x: string) => x },
      async readContract() { const value = handles[Math.min(calls.reads++, handles.length - 1)]; if (value instanceof Error) throw value; return value; },
      async invokeAs(...args: unknown[]) { calls.invokes.push(args); if (o.invokeThrows) throw Error("Private transport error"); return o.result ?? { ok: true, hash: "a".repeat(64) }; },
    };
    throw Error(`Unexpected dependency ${name}`);
  } });
  return { api, calls };
}

test("valid usernames normalize case and one @, invalid symbols are not silently removed", () => {
  assert.equal(normalizedUsername(" @Ariq_123 "), "ariq_123");
  for (const value of [null, 17, "ab", "a-bc", "a bc", "@@abc", "a".repeat(33), "éabc"]) assert.equal(normalizedUsername(value), null);
});
test("recovery/legal exclusions are exact and do not exclude financial deep links", () => {
  for (const route of ["/signin", "/privacy", "/terms", "/wallet/setup", "/auth/callback", "/offline"]) assert.equal(usernameGateExempt(route), true);
  for (const route of ["/", "/send", "/arisan/9", "/circles/tino-relief/donate", "/signin-not", "/privacy-settings"]) assert.equal(usernameGateExempt(route), false);
});
test("username missing is established only by registry NotFound, never editable metadata", async () => {
  const h = setup(); assert.deepEqual(copy(await h.api.readUsernameStatus(ownerId)), { status: "required", ownerId, address });
  assert.deepEqual(h.calls.queries, [["wallets", "public_key", "user_id", ownerId]]);
  assert.equal(h.calls.signers, 0); assert.equal(h.calls.invokes.length, 0);
});
test("existing registered owner is ready without signing or registering again", async () => {
  const h = setup({ handles: ["real_username"] });
  assert.deepEqual(copy(await h.api.saveOnboardingUsername(ownerId, "new_username")), { ok: true, ownerId, handle: "real_username" });
  assert.equal(h.calls.signers, 0); assert.equal(h.calls.invokes.length, 0);
});
for (const [options, status] of [
  [{ user: null }, "guest"], [{ user: { id: ownerId, is_anonymous: true } }, "guest"],
  [{ user: null, authError: new AuthSessionMissingError() }, "guest"], [{ authThrows: new AuthSessionMissingError() }, "guest"],
  [{ authError: Error("outage") }, "unavailable"], [{ user: null, authError: Error("outage") }, "unavailable"],
  [{ authThrows: Error("outage") }, "unavailable"], [{ user: { id: ownerId } }, "unavailable"],
  [{ user: { id: otherId, is_anonymous: false } }, "account_changed"], [{ admin: false }, "unavailable"],
  [{ walletError: Error("outage") }, "unavailable"], [{ wallet: null }, "wallet_missing"],
  [{ wallet: { public_key: "bad-wallet" } }, "unavailable"], [{ handles: [Error("RPC outage")] }, "unavailable"],
  [{ handles: [Error("Error(Contract, #1)")] }, "unavailable"], [{ handles: [null] }, "unavailable"],
  [{ handles: ["bad-name"] }, "unavailable"], [{ configured: false }, "unavailable"], [{ preview: true }, "unavailable"],
] as [Options, string][]) test(`fails closed without signing: ${JSON.stringify(options)} => ${status}`, async () => {
  const h = setup(options); assert.equal((await h.api.readUsernameStatus(ownerId)).status, status);
  assert.equal((await h.api.saveOnboardingUsername(ownerId, "fixture_user")).ok, false);
  assert.equal(h.calls.signers, 0); assert.equal(h.calls.invokes.length, 0);
});
for (const owner of [null, "", "not-an-owner", otherId]) test(`claim cannot target another or malformed owner: ${owner}`, async () => {
  const h = setup(); assert.equal((await h.api.saveOnboardingUsername(owner, "fixture_user")).ok, false);
  assert.equal(h.calls.invokes.length, 0);
});
test("invalid claim never reaches auth or wallet", async () => {
  const h = setup(); assert.equal((await h.api.saveOnboardingUsername(ownerId, "bad name")).ok, false); assert.equal(h.calls.auth, 0);
});
for (const options of [{ signerThrows: true }, { signer: { publicKey: otherAddress, secret: "fixture", demo: false } }, { signer: { publicKey: address, secret: "fixture", demo: true } }])
  test(`unverified or mismatched signer cannot claim: ${JSON.stringify(options)}`, async () => {
    const h = setup(options); assert.equal((await h.api.saveOnboardingUsername(ownerId, "fixture_user")).ok, false); assert.equal(h.calls.invokes.length, 0);
  });
test("claim invokes existing registry once and confirms its canonical result", async () => {
  const h = setup({ handles: [notFound(), "fixture_user"] });
  assert.deepEqual(copy(await h.api.saveOnboardingUsername(ownerId, "Fixture_User")), { ok: true, ownerId, handle: "fixture_user" });
  assert.equal(h.calls.invokes.length, 1); assert.deepEqual(copy(h.calls.invokes[0].slice(1)), ["registry", "register", [address, "fixture_user"]]);
});
test("successful transport alone does not complete onboarding without a confirmed registry name", async () => {
  const h = setup(); const result = await h.api.saveOnboardingUsername(ownerId, "fixture_user");
  assert.deepEqual(copy(result), { ok: false, code: "pending", hash: "a".repeat(64) }); assert.doesNotMatch(JSON.stringify(result), /fixture-secret/);
});
test("concurrent registration confirms existing username and never renames it", async () => {
  const h = setup({ handles: [notFound(), "concurrent_name"], result: { ok: false, error: "Error(Contract, #2)" } });
  assert.deepEqual(copy(await h.api.saveOnboardingUsername(ownerId, "other_name")), { ok: true, ownerId, handle: "concurrent_name" });
  assert.equal(h.calls.invokes.length, 1); assert.equal(h.calls.invokes[0][2], "register");
});
for (const [options, code] of [
  [{ result: { ok: false, error: "Error(Contract, #1)" } }, "taken"],
  [{ result: { ok: false, error: "Private upstream detail" } }, "failed"],
  [{ result: { ok: false, pending: true, hash: "b".repeat(64), error: "Private pending detail" } }, "pending"],
  [{ invokeThrows: true }, "pending"],
] as [Options, string][]) test(`registration outcome is sanitized: ${code}`, async () => {
  const h = setup(options); const result = await h.api.saveOnboardingUsername(ownerId, "fixture_user");
  assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, code);
  assert.doesNotMatch(JSON.stringify(result), /Private|fixture-secret/);
});
test("onboarding is mounted globally and its GET transport is private/no-store", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/account/username-onboarding/route.ts", import.meta.url), "utf8");
  assert.match(layout, /<Suspense fallback=\{null\}><UsernameOnboarding/);
  assert.match(route, /private, no-store/); assert.match(route, /X-Salapi-Owner/);
  assert.doesNotMatch(route, /getSigner|invokeAs|initializeWallet|prepareAuthenticatedWallet/);
});
