import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { isLocale } from "../lib/i18n/config.ts";
import type { CirclesSignupIdentity, CirclesSignupInput, CirclesSignupResult } from "../lib/circles/signup.ts";
import type { SignupIdentityState } from "../lib/ui/useCirclesSignupIdentity.ts";

const source = readFileSync(new URL("../lib/server/circlesSignup.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const ownerId = "00000000-0000-4000-8000-000000000001";
const verifiedUser = { id: ownerId, email: " Verified@example.invalid ", email_confirmed_at: "2026-10-07T00:00:00Z", is_anonymous: false, app_metadata: { provider: "google" } };
const request: CirclesSignupInput = { email: "guest@example.invalid", circleId: "tino-relief", locale: "en", pesoPledge: 580, anonymous: false, notifyOk: true, marketingOk: false };
function setup(options: { preview?: boolean; configured?: boolean; adminConfigured?: boolean; user?: unknown; authError?: unknown; authThrows?: unknown; clientThrows?: unknown; insertError?: unknown; insertThrows?: boolean } = {}) {
  const calls = { clients: 0, auth: 0, admin: 0, inserts: [] as Record<string, unknown>[], logs: 0 };
  const exports = {} as { resolveCirclesSignupIdentity(): Promise<CirclesSignupIdentity>; saveCirclesLaunchSubscription(input: unknown): Promise<CirclesSignupResult> };
  const missing = (error: unknown) => Boolean(error && typeof error === "object" && (error as { name?: string }).name === "AuthSessionMissingError");
  runInNewContext(code, { exports, console: { log() { calls.logs++; }, error() { calls.logs++; }, warn() { calls.logs++; } }, fetch() { throw Error("Network forbidden in isolated auth tests"); }, require(name: string) {
    if (name === "server-only") return {};
    if (name === "@supabase/supabase-js") return { isAuthSessionMissingError: missing };
    if (name === "@/lib/local-preview") return { isLocalPreview: options.preview ?? false };
    if (name === "@/lib/i18n/config") return { isLocale };
    if (name === "@/lib/supabase/env") return { supabaseConfigured: () => options.configured ?? true, supabaseAdminConfigured: () => options.adminConfigured ?? true };
    if (name === "@/lib/supabase/server") return { async createSupabaseServer() {
      calls.clients++; if (options.clientThrows) throw options.clientThrows;
      return { auth: { async getUser() { calls.auth++; if (options.authThrows) throw options.authThrows; return { data: { user: options.user ?? null }, error: options.authError ?? null }; } } };
    } };
    if (name === "@/lib/supabase/admin") return { createSupabaseAdmin() {
      calls.admin++;
      return { from(table: string) { assert.equal(table, "circles_waitlist"); return { async insert(row: Record<string, unknown>) {
        calls.inserts.push(row); if (options.insertThrows) throw Error("Private raw database detail guest@example.invalid");
        return { error: options.insertError ?? null };
      } }; } };
    } };
    throw Error(`Unexpected isolated auth dependency: ${name}`);
  } });
  return { api: exports, calls };
}

test("server getUser supplies the confirmed Google email and client spoofing never chooses the recipient", async () => {
  const { api, calls } = setup({ user: verifiedUser });
  const identity = await api.resolveCirclesSignupIdentity();
  assert.deepEqual(JSON.parse(JSON.stringify(identity)), { status: "verified", ownerId, email: "verified@example.invalid", source: "google" });
  const result = await api.saveCirclesLaunchSubscription({ ...request, expectedOwnerId: ownerId, email: "attacker@example.invalid" });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, kind: "launch-subscription", persisted: true });
  assert.equal(calls.auth, 2, "Submission must verify identity again, not reuse browser state");
  assert.equal(calls.inserts[0].email, "verified@example.invalid");
  assert.equal(calls.inserts[0].marketing_ok, false); assert.equal(calls.logs, 0);
  assert.deepEqual(Object.keys(calls.inserts[0]).sort(), ["anonymous", "circle_id", "email", "locale", "marketing_ok", "peso_pledge"]);
});

test("display identity reader performs only request-bound getUser, never admin, wallet or subscription writes", async () => {
  for (const options of [{}, { user: verifiedUser }, { authError: { name: "NetworkError" } }]) {
    const { api, calls } = setup(options);
    await api.resolveCirclesSignupIdentity();
    assert.equal(calls.auth, 1); assert.equal(calls.clients, 1);
    assert.equal(calls.admin, 0); assert.equal(calls.inserts.length, 0); assert.equal(calls.logs, 0);
  }
});

test("server verified email works with omitted or malformed client email; confirmed non-Google email is labelled account", async () => {
  for (const email of [undefined, 7, { trim: "invalid" }]) {
    const { api, calls } = setup({ user: { ...verifiedUser, app_metadata: { provider: "email" }, user_metadata: { provider: "google", email_verified: true } } });
    assert.equal((await api.resolveCirclesSignupIdentity()).status, "verified");
    const identity = await api.resolveCirclesSignupIdentity(); assert.equal(identity.status === "verified" && identity.source, "account");
    assert.equal((await api.saveCirclesLaunchSubscription({ ...request, email })).ok, true);
    assert.equal(calls.inserts[0].email, "verified@example.invalid");
  }
});

test("confirmed guests retain the valid manual-email path with explicit consent and no donor fields", async () => {
  for (const options of [{}, { authError: { name: "AuthSessionMissingError" } }, { authThrows: { name: "AuthSessionMissingError" } }]) {
    const { api, calls } = setup(options);
    assert.equal((await api.resolveCirclesSignupIdentity()).status, "guest");
    assert.equal((await api.saveCirclesLaunchSubscription(request)).ok, true);
    assert.equal(calls.inserts[0].email, "guest@example.invalid"); assert.equal(calls.logs, 0);
    assert.ok(!Object.keys(calls.inserts[0]).some(key => /transaction|hash|badge|donor|wallet/i.test(key)));
  }
});

test("false, omitted and forged truthy launch consent never writes or even reads auth", async () => {
  for (const notifyOk of [false, undefined, "true", 1, {}]) {
    const { api, calls } = setup({ user: verifiedUser });
    const result = await api.saveCirclesLaunchSubscription({ ...request, notifyOk });
    assert.equal(result.ok, false); assert.equal(calls.auth, 0); assert.equal(calls.inserts.length, 0); assert.equal(calls.admin, 0);
  }
});

test("optional marketing is true only for an explicit true boolean, never for omitted or truthy data", async () => {
  for (const marketingOk of [undefined, false, "true", 1, {}, true]) {
    const { api, calls } = setup();
    assert.equal((await api.saveCirclesLaunchSubscription({ ...request, marketingOk })).ok, true);
    assert.equal(calls.inserts[0].marketing_ok, marketingOk === true);
  }
});

test("auth outages, invalid users and unconfirmed accounts fail closed without guest downgrade", async () => {
  for (const options of [
    { configured: false }, { clientThrows: { name: "AuthSessionMissingError" } },
    { authError: { name: "NetworkError", message: "private account" } }, { authThrows: Error("unreachable") },
    { user: { ...verifiedUser, id: "" } }, { user: { ...verifiedUser, is_anonymous: true } },
    { user: { ...verifiedUser, email_confirmed_at: null, user_metadata: { email_verified: true, provider: "google" } } },
    { user: { ...verifiedUser, email_confirmed_at: "invalid" } }, { user: { ...verifiedUser, email: "invalid" } },
    { user: verifiedUser, authError: { name: "AuthSessionMissingError" } },
  ]) {
    const { api, calls } = setup(options);
    assert.ok(["unavailable", "unverified"].includes((await api.resolveCirclesSignupIdentity()).status));
    assert.equal((await api.saveCirclesLaunchSubscription(request)).ok, false);
    assert.equal(calls.inserts.length, 0); assert.equal(calls.admin, 0); assert.equal(calls.logs, 0);
  }
});

test("changed or signed-out account cannot silently subscribe another account after a verified review", async () => {
  for (const options of [{}, { user: { ...verifiedUser, id: "different-owner" } }]) {
    const { api, calls } = setup(options);
    const result = await api.saveCirclesLaunchSubscription({ ...request, expectedOwnerId: ownerId });
    assert.equal(result.ok, false); assert.match(!result.ok ? result.error : "", /account changed/);
    assert.equal(calls.inserts.length, 0);
  }
});

test("local preview, absent storage and failed database insertion never report saved and never log private details", async () => {
  for (const options of [{ preview: true }, { adminConfigured: false }, { insertError: { message: "duplicate guest@example.invalid" } }, { insertThrows: true }]) {
    const { api, calls } = setup(options);
    const result = await api.saveCirclesLaunchSubscription(request);
    assert.equal(result.ok, false); assert.doesNotMatch(!result.ok ? result.error : "", /guest@example.invalid|duplicate|Private/);
    assert.equal(calls.logs, 0);
    if (options.preview || options.adminConfigured === false) { assert.equal(calls.auth, 0); assert.equal(calls.admin, 0); }
  }
});

test("malformed public inputs are rejected without real SDK, network, auth or database access", async () => {
  for (const input of [null, 0, "invalid", {}, { ...request, circleId: "https://invalid.test" }, { ...request, locale: "xx" },
    { ...request, pesoPledge: Infinity }, { ...request, pesoPledge: -1 }, { ...request, pesoPledge: 10_000_001 }, { ...request, anonymous: "false" }]) {
    const { api, calls } = setup();
    assert.equal((await api.saveCirclesLaunchSubscription(input)).ok, false); assert.equal(calls.auth, 0); assert.equal(calls.inserts.length, 0);
  }
  for (const email of [undefined, null, {}, 3, "not-email", " ", "a".repeat(201) + "@example.invalid"]) {
    const { api, calls } = setup(); assert.equal((await api.saveCirclesLaunchSubscription({ ...request, email })).ok, false);
    assert.equal(calls.inserts.length, 0);
  }
});

const hookCode = ts.transpileModule(readFileSync(new URL("../lib/ui/useCirclesSignupIdentity.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function hookSetup(preview = false, configured = true) {
  const states: unknown[] = []; let cursor = 0;
  const effectState: { deps: unknown[]; cleanup?: () => void }[] = [];
  const effects: (() => void)[] = [];
  const requests: { resolve(value: CirclesSignupIdentity): void; reject(error: Error): void }[] = [];
  let authCallback: ((event: string, session: { user: { id: string } } | null) => void) | undefined;
  let inCallback = false, resets = 0, unsubscribed = 0;
  const focus = new Map<string, () => void>();
  const exports = {} as { useCirclesSignupIdentity(reset: () => void): { identity: SignupIdentityState; refresh(): void; captureOwnerRevision(): number; isCurrentOwner(revision: number): boolean } };
  runInNewContext(hookCode, { exports, queueMicrotask, window: { addEventListener(event: string, fn: () => void) { focus.set(event, fn); }, removeEventListener(event: string) { focus.delete(event); } }, fetch() { throw Error("Network forbidden in isolated hook test"); }, require(name: string) {
    if (name === "@/lib/local-preview") return { isLocalPreview: preview };
    if (name === "@/lib/supabase/env") return { supabaseConfigured: () => configured };
    if (name === "@/lib/supabase/client") return { createSupabaseBrowser() { return { auth: { onAuthStateChange(callback: typeof authCallback) { authCallback = callback; return { data: { subscription: { unsubscribe() { unsubscribed++; } } } }; } } }; } };
    if (name === "@/lib/ui/circles-identity-read") return { readCirclesSignupIdentityClient() { assert.equal(inCallback, false, "Never await or invoke a read request in the Auth SDK callback"); return new Promise<CirclesSignupIdentity>((resolve, reject) => requests.push({ resolve, reject })); } };
    if (name === "react") return {
      useState(initial: unknown) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; },
      useRef(initial: unknown) { const index = cursor++; if (!(index in states)) states[index] = { current: initial }; return states[index]; },
      useCallback(callback: unknown, deps: unknown[]) { const index = cursor++; const previous = states[index] as { deps: unknown[]; callback: unknown } | undefined; if (!previous || deps.some((value, i) => value !== previous.deps[i])) states[index] = { deps, callback }; return (states[index] as { callback: unknown }).callback; },
      useEffect(callback: () => (() => void) | undefined, deps: unknown[]) {
        const index = cursor++; const previous = effectState[index];
        if (!previous || deps.some((value, i) => value !== previous.deps[i])) effects.push(() => {
          previous?.cleanup?.(); effectState[index] = { deps, cleanup: callback() };
        });
      },
    };
    throw Error(`Unexpected isolated hook dependency: ${name}`);
  } });
  function render() { cursor = 0; const state = exports.useCirclesSignupIdentity(() => { resets++; }); while (effects.length) effects.shift()!(); return state; }
  return { requests, render, get resets() { return resets; }, get unsubscribed() { return unsubscribed; },
    emit(event: string, owner: string | null) { assert.ok(authCallback); inCallback = true; authCallback(event, owner ? { user: { id: owner } } : null); inCallback = false; },
    // Drain cross-realm promise assimilation and the Auth microtask callback,
    // not a timed sleep or simulated readiness flag.
    async settle() { await new Promise<void>(resolve => setImmediate(resolve)); return render(); }, dispose() { effectState.forEach(effect => effect?.cleanup?.()); } };
}

test("local preview identity never makes an auth action request, including explicit refresh", () => {
  const hook = hookSetup(true); const state = hook.render();
  assert.equal(state.identity.status, "guest"); state.refresh();
  assert.equal(hook.render().identity.status, "guest"); assert.equal(hook.requests.length, 0);
});

test("live identity starts loading, resolves the read-only account and retries without trusting an earlier email", async () => {
  const hook = hookSetup(); const first = hook.render(); assert.equal(first.identity.status, "loading");
  assert.equal(hook.requests.length, 0, "Wait for INITIAL_SESSION before an unbound server response");
  hook.emit("INITIAL_SESSION", ownerId); await hook.settle();
  assert.equal(hook.requests.length, 1);
  hook.requests[0].resolve({ status: "verified", ownerId, email: "verified@example.invalid", source: "google" });
  const loaded = await hook.settle(); assert.equal(loaded.identity.status, "verified");
  loaded.refresh(); assert.equal(hook.render().identity.status, "loading"); assert.equal(hook.requests.length, 2);
  hook.requests[1].resolve({ status: "guest" }); assert.equal((await hook.settle()).identity.status, "unavailable", "Server guest cannot match a browser account owner");
});

test("stale and rejected identity reads cannot overwrite the current account or downgrade an outage to guest", async () => {
  const hook = hookSetup(); hook.render(); hook.emit("INITIAL_SESSION", ownerId); await hook.settle(); const first = hook.render(); first.refresh(); hook.render();
  assert.equal(hook.requests.length, 2);
  hook.requests[0].resolve({ status: "verified", ownerId, email: "old@example.invalid", source: "google" });
  assert.equal((await hook.settle()).identity.status, "loading");
  hook.requests[1].reject(Error("isolated unavailable service")); const failed = await hook.settle();
  assert.equal(failed.identity.status, "unavailable");
  failed.refresh(); hook.render(); hook.dispose();
  hook.requests[2].resolve({ status: "guest" }); assert.equal((await hook.settle()).identity.status, "loading");
  assert.equal(hook.unsubscribed, 1);
});

test("Auth owner changes hide prior email and invalidate consent and in-flight signup correlation synchronously", async () => {
  const hook = hookSetup(); hook.render(); hook.emit("INITIAL_SESSION", ownerId); await hook.settle();
  hook.requests[0].resolve({ status: "verified", ownerId, email: "a@example.invalid", source: "google" });
  const ready = await hook.settle(); const reviewedRevision = ready.captureOwnerRevision();
  assert.equal(ready.identity.status, "verified"); assert.equal(ready.isCurrentOwner(reviewedRevision), true);
  hook.emit("SIGNED_IN", "owner-b");
  const changed = hook.render(); assert.equal(changed.identity.status, "loading"); assert.equal(hook.resets, 1);
  assert.equal(changed.isCurrentOwner(reviewedRevision), false);
  await hook.settle(); hook.requests[1].resolve({ status: "verified", ownerId: "owner-b", email: "b@example.invalid", source: "google" });
  assert.equal((await hook.settle()).identity.status, "verified");
  hook.emit("SIGNED_OUT", null); assert.equal(hook.render().identity.status, "loading"); assert.equal(hook.resets, 2);
  await hook.settle(); hook.requests[2].resolve({ status: "guest" }); assert.equal((await hook.settle()).identity.status, "guest");
});

test("same-owner refresh keeps consent while mismatched server owner never exposes email, and missing configuration remains unavailable", async () => {
  const hook = hookSetup(); hook.render(); hook.emit("INITIAL_SESSION", ownerId); await hook.settle();
  hook.requests[0].resolve({ status: "verified", ownerId: "other-owner", email: "private@example.invalid", source: "google" });
  const failed = await hook.settle(); assert.equal(failed.identity.status, "unavailable");
  hook.emit("TOKEN_REFRESHED", ownerId); await hook.settle(); assert.equal(hook.resets, 0);
  hook.requests[1].resolve({ status: "verified", ownerId, email: "a@example.invalid", source: "google" });
  assert.equal((await hook.settle()).identity.status, "verified");
  const absent = hookSetup(false, false); assert.equal(absent.render().identity.status, "unavailable"); assert.equal(absent.requests.length, 0);
});

test("an in-flight identity GET from the previous owner cannot leak email after owner switch or signout", async () => {
  const hook = hookSetup(); hook.render(); hook.emit("INITIAL_SESSION", ownerId); await hook.settle();
  hook.emit("SIGNED_IN", "owner-b"); await hook.settle();
  hook.requests[0].resolve({ status: "verified", ownerId, email: "old-private@example.invalid", source: "google" });
  const pending = await hook.settle();
  assert.equal(pending.identity.status, "loading");
  assert.doesNotMatch(JSON.stringify(pending.identity), /old-private/);
  hook.emit("SIGNED_OUT", null); await hook.settle();
  hook.requests[1].resolve({ status: "verified", ownerId: "owner-b", email: "other-private@example.invalid", source: "google" });
  assert.equal((await hook.settle()).identity.status, "loading");
  hook.requests[2].resolve({ status: "guest" });
  assert.deepEqual(JSON.parse(JSON.stringify((await hook.settle()).identity)), { status: "guest" });
  hook.dispose();
});
