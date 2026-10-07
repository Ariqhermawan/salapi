import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { CirclesSignupIdentity } from "../lib/circles/signup.ts";

const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const identity = { status: "verified", ownerId: "00000000-0000-4000-8000-000000000001", email: "qa@example.invalid", source: "google" };
const clone = (value: unknown) => JSON.parse(JSON.stringify(value));

function server(value: unknown, throws = false) {
  let reads = 0;
  const api = {} as { GET(request: Request): Promise<Response>; POST?: unknown; dynamic: string };
  runInNewContext(compile("../app/api/account/circles-identity/route.ts"), {
    exports: api, URL, Response,
    require(name: string) {
      assert.equal(name, "@/lib/server/circlesSignup");
      return { async resolveCirclesSignupIdentity() { reads++; if (throws) throw Error("private internal account details"); return value; } };
    },
  });
  return { api, get: (query = "") => api.GET(new Request(`https://fixture.invalid/api/account/circles-identity${query}`)), get reads() { return reads; } };
}

test("Circles identity GET is owner-bound, request-scoped, private/no-store and projects only the existing display contract", async () => {
  const h = server({ ...identity, accessToken: "never-return", wallet: "never-return" });
  assert.equal(h.api.dynamic, "force-dynamic");
  assert.equal(h.api.POST, undefined, "No mutation endpoint is added");
  for (let count = 1; count <= 2; count++) {
    const response = await h.get();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(response.headers.get("Vary"), "Cookie");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
    assert.deepEqual(await response.json(), identity);
    assert.equal(h.reads, count, "Every request verifies its own owner, without shared caching");
  }
});

for (const status of ["guest", "unverified", "unavailable"]) test(`Circles identity GET preserves ${status} without extra private data`, async () => {
  const h = server({ status, email: "private@example.invalid", ownerId: "private" });
  assert.deepEqual(await (await h.get()).json(), { status });
});

for (const query of ["?ownerId=other", "?email=other%40example.invalid", "?wallet=other", "?ownerId=one&ownerId=two", "?unused="])
  test(`identity selectors are rejected before auth lookup: ${query}`, async () => {
    const h = server(identity);
    const response = await h.get(query);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await response.json(), { status: "unavailable" });
    assert.equal(h.reads, 0);
  });

test("identity GET exceptions fail closed without raw error details", async () => {
  const h = server(identity, true);
  const response = await h.get();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Vary"), "Cookie");
  assert.deepEqual(await response.json(), { status: "unavailable" });
});

function client(value: unknown, options: { ok?: boolean; failJson?: boolean; failNetwork?: boolean } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const timeouts: number[] = [];
  const api = {} as { readCirclesSignupIdentityClient(): Promise<CirclesSignupIdentity> };
  runInNewContext(compile("../lib/ui/circles-identity-read.ts"), {
    exports: api, AbortSignal: { timeout(ms: number) { timeouts.push(ms); return AbortSignal.timeout(ms); } },
    async fetch(url: string, init: RequestInit) {
      calls.push({ url, init });
      if (options.failNetwork) throw Error("isolated network failure");
      return { ok: options.ok ?? true, async json() { if (options.failJson) throw Error("isolated invalid JSON"); return value; } };
    },
    require(name: string) { throw Error(`Unexpected display dependency: ${name}`); },
    localStorage: { getItem() { throw Error("No private identity cache allowed"); }, setItem() { throw Error("No private identity cache allowed"); } },
  });
  return { api, calls, timeouts };
}

test("identity display transport uses exact same-origin GET without Server Action, cache or redirects", async () => {
  const h = client({ ...identity, wallet: "discard", token: "discard" });
  assert.deepEqual(clone(await h.api.readCirclesSignupIdentityClient()), identity);
  assert.deepEqual(clone(h.calls.map(({ url, init: { signal, ...init } }) => {
    assert.ok(signal instanceof AbortSignal);
    assert.equal(signal.aborted, false);
    return { url, init };
  })), [{ url: "/api/account/circles-identity", init: {
    method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { Accept: "application/json" },
  } }]);
  assert.deepEqual(h.timeouts, [20_000]);
});

for (const status of ["guest", "unavailable", "unverified"]) test(`client preserves ${status} without inventing a verified account`, async () => {
  const h = client({ status, email: "private@example.invalid" });
  assert.deepEqual(clone(await h.api.readCirclesSignupIdentityClient()), { status });
});

test("malformed identity payloads never become a verified email or guest fallback", async () => {
  for (const value of [null, [], "verified", {}, { status: "loading" }, { ...identity, ownerId: "" },
    { ...identity, ownerId: 7 }, { ...identity, ownerId: "x".repeat(121) }, { ...identity, email: "not-an-email" },
    { ...identity, email: "a".repeat(201) + "@example.invalid" }, { ...identity, source: "user_metadata" }]) {
    const h = client(value);
    await assert.rejects(h.api.readCirclesSignupIdentityClient(), /Account identity is unavailable/);
    assert.equal(h.calls.length, 1);
  }
});

test("identity HTTP, JSON and network failures remain unavailable for existing hook race handling", async () => {
  for (const options of [{ ok: false }, { failJson: true }, { failNetwork: true }]) {
    const h = client(identity, options);
    await assert.rejects(h.api.readCirclesSignupIdentityClient());
    assert.equal(h.calls.length, 1);
  }
});
