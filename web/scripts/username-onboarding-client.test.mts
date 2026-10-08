import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { normalizedUsername, OWNER_PATTERN, type UsernameStatus } from "../lib/username-onboarding.ts";

const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const address = "GCUBT6T7SMQKJE5L2TJLUQQPSBBU5GVHALGLWWECEJUIV2YFFCSXGHY7";
const ready = (ownerId = owner): UsernameStatus => ({ status: "ready", ownerId, address, handle: "fixture_user" });
const source = ts.transpileModule(readFileSync(new URL("../lib/username-onboarding-client.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

type Reader = { setOwner(owner: string | null): void; read(owner: string, refresh?: boolean): Promise<UsernameStatus> };
function setup() {
  let now = 1000;
  const calls: { owner: string; signal: AbortSignal; resolve(value: unknown, ok?: boolean): void; reject(error: Error): void }[] = [];
  const request = (url: string, options: RequestInit) => new Promise((resolve, reject) => {
    assert.equal(url, "/api/account/username-onboarding");
    assert.equal(options.cache, "no-store"); assert.equal(options.credentials, "same-origin");
    calls.push({ owner: (options.headers as Record<string, string>)["X-Salapi-Owner"], signal: options.signal!,
      resolve(value, ok = true) { resolve({ ok, async json() { return value; } }); }, reject,
    });
  });
  const api = {} as { createUsernameOnboardingReader(request: unknown, now: () => number): Reader };
  runInNewContext(source, { exports: api, AbortController, AbortSignal, Date, require(name: string) {
    assert.equal(name, "./username-onboarding"); return { normalizedUsername, OWNER_PATTERN };
  } });
  const reader = api.createUsernameOnboardingReader(request, () => now);
  reader.setOwner(owner);
  return { reader, calls, tick(ms: number) { now += ms; } };
}

test("layout remounts share one pending owner read, then reuse a bounded verified result", async () => {
  const h = setup(); const first = h.reader.read(owner); h.reader.setOwner(owner);
  assert.equal(h.reader.read(owner), first); assert.equal(h.calls.length, 1);
  h.calls[0].resolve(ready()); await first;
  for (let n = 0; n < 5; n++) assert.equal((await h.reader.read(owner)).status, "ready");
  assert.equal(h.calls.length, 1);
  h.tick(5 * 60 * 1000); const expired = h.reader.read(owner); assert.equal(h.calls.length, 2);
  h.calls[1].resolve(ready()); await expired;
});

test("signout aborts the old read and an old response cannot mark the next account ready", async () => {
  const h = setup(); const old = h.reader.read(owner);
  h.reader.setOwner(null); assert.equal(h.calls[0].signal.aborted, true);
  h.reader.setOwner(other); const next = h.reader.read(other);
  h.calls[0].resolve(ready()); assert.equal((await old).status, "account_changed");
  h.calls[1].resolve({ status: "required", ownerId: other, address });
  assert.equal((await next).status, "required");
  const fresh = h.reader.read(other); assert.equal(h.calls.length, 3);
  h.calls[2].resolve(ready(other)); await fresh;
});

test("a verified cache is cleared on owner switch and on signout, even for the same returning owner", async () => {
  const h = setup(); const first = h.reader.read(owner); h.calls[0].resolve(ready()); await first;
  h.reader.setOwner(other); h.reader.setOwner(owner); const switched = h.reader.read(owner);
  assert.equal(h.calls.length, 2); h.calls[1].resolve(ready()); await switched;
  h.reader.setOwner(null); h.reader.setOwner(owner); const signedIn = h.reader.read(owner);
  assert.equal(h.calls.length, 3); h.calls[2].resolve(ready()); await signedIn;
});

test("explicit recovery bypasses a positive cache and never negatively caches missing usernames", async () => {
  const h = setup(); const first = h.reader.read(owner); h.calls[0].resolve(ready()); await first;
  const retry = h.reader.read(owner, true); assert.equal(h.calls.length, 2);
  h.calls[1].resolve({ status: "required", ownerId: owner, address }); await retry;
  const next = h.reader.read(owner); assert.equal(h.calls.length, 3); h.calls[2].resolve(ready()); await next;
});

for (const [value, ok] of [[ready(other), true], [ready(), false], [null, true],
  [{ ...ready(), handle: "invalid-name" }, true], [{ ...ready(), address: "invalid-wallet" }, true]] as const)
  test(`invalid or mismatched results cannot populate the presentation cache: ${JSON.stringify(value)} / ${ok}`, async () => {
    const h = setup(); const first = h.reader.read(owner); h.calls[0].resolve(value, ok); await first;
    const fresh = h.reader.read(owner); assert.equal(h.calls.length, 2); h.calls[1].resolve(ready()); await fresh;
  });

test("transport errors release the pending request so a safe read can be retried", async () => {
  const h = setup(); const first = h.reader.read(owner); h.calls[0].reject(Error("offline")); await assert.rejects(first);
  const retry = h.reader.read(owner); assert.equal(h.calls.length, 2); h.calls[1].resolve(ready()); await retry;
});

test("a read cannot silently activate another or malformed owner", async () => {
  const h = setup(); assert.equal((await h.reader.read(other)).status, "account_changed");
  assert.equal((await h.reader.read("invalid")).status, "account_changed"); assert.equal(h.calls.length, 0);
});

test("presentation hints use memory only, never persistent storage or user metadata", () => {
  assert.doesNotMatch(source, /localStorage|sessionStorage|user_metadata|app_metadata|access_token|refresh_token/);
});
