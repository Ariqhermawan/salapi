import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { AccountPhotoResult } from "../lib/account-photo.ts";

const ownerId = "00000000-0000-4000-8000-000000000001";
const profile = { ownerId, email: "fixture@example.invalid", photoUrl: "https://lh3.googleusercontent.com/a/fixture",
  googlePhotoUrl: "https://lh3.googleusercontent.com/a/fixture", source: "google" };
const code = ts.transpileModule(readFileSync(new URL("../lib/ui/account-photo-read.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness(response: Response | Error) {
  const calls: { url: string; options: RequestInit }[] = [];
  const exports = {} as { readAccountPhotoClient(): Promise<AccountPhotoResult> };
  runInNewContext(code, { exports, fetch: async (url: string, options: RequestInit) => {
    calls.push({ url, options }); if (response instanceof Error) throw response; return response.clone();
  }, require(name: string) { throw Error(`Unexpected transport dependency ${name}`); } });
  return { calls, read: exports.readAccountPhotoClient };
}
const json = (value: unknown) => Response.json(value);

test("photo transport uses only a fixed same-origin private GET with cookies and no cache", async () => {
  const h = harness(json({ ok: true, profile })), result = await h.read();
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, profile });
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].url, "/api/account/photo");
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].options)), {
    method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { Accept: "application/json" },
  });
  assert.equal(h.calls[0].options.body, undefined);
});

test("photo transport performs fresh reads without a private in-memory result cache or deduplication", async () => {
  const h = harness(json({ ok: false, code: "unauthenticated" }));
  await Promise.all([h.read(), h.read()]); assert.equal(h.calls.length, 2);
  await h.read(); assert.equal(h.calls.length, 3);
});

for (const source of ["google", "custom", "initials"]) test(`photo transport preserves the server's ${source} profile and warning without accepting extra fields`, async () => {
  const supplied = { ...profile, source, photoUrl: source === "initials" ? null : profile.photoUrl,
    warning: "storage_unavailable", privateCredential: "must-not-be-forwarded" };
  const h = harness(json({ ok: true, profile: supplied, token: "must-not-be-forwarded" })), result = await h.read();
  assert.equal(result.ok, true); if (!result.ok) return;
  assert.equal(result.profile.ownerId, ownerId); assert.equal(result.profile.source, source);
  assert.equal(result.profile.warning, "storage_unavailable");
  assert.equal("privateCredential" in result.profile, false); assert.equal("token" in result, false);
});

for (const code of ["unauthenticated", "unavailable", "account_changed", "storage_unavailable"]) test(`photo transport preserves the honest ${code} fault`, async () => {
  const h = harness(json({ ok: false, code, email: "not-a-profile" })), result = await h.read();
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: false, code });
});

for (const response of [new Response("private provider diagnostic", { status: 401 }), new Response("private provider diagnostic", { status: 500 }),
  new Response("not json"), new Error("isolated network unavailable")]) test(`photo transport cannot interpret HTTP, parsing or network failure as a successful profile ${String(response instanceof Error ? "network" : response.status)}`, async () => {
  const h = harness(response); await assert.rejects(h.read()); assert.equal(h.calls.length, 1);
});

for (const bad of [null, [], "profile", { ok: false, code: "unknown-code" }, { ok: true }, { ok: "true", profile },
  { ok: true, profile: { ...profile, ownerId: "not-owner" } }, { ok: true, profile: { ...profile, email: null } },
  { ok: true, profile: { ...profile, photoUrl: 42 } }, { ok: true, profile: { ...profile, googlePhotoUrl: {} } },
  { ok: true, profile: { ...profile, source: "unknown" } }, { ok: true, profile: { ...profile, source: ["google"] } },
  { ok: true, profile: { ...profile, warning: "unknown" } }]) {
  test(`malformed photo result fails closed ${JSON.stringify(bad)}`, async () => {
    const h = harness(json(bad)); await assert.rejects(h.read(), /Account photo is unavailable/);
  });
}
