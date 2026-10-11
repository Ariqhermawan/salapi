import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
type Route = { GET: (r: Request) => Promise<Response>; POST: (r: Request) => Promise<Response> };
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
function load(path: string, imports: Record<string, unknown> = {}, env: Record<string, string> = {}) {
  const exports: Record<string, unknown> = {};
  runInNewContext(compile(path), { exports, Buffer, Request, Response, TextDecoder, Uint8Array, URL, process: { env }, require: (name: string) => {
    if (name in imports) return imports[name]; throw Error(`Unexpected route dependency ${name}`);
  } }); return exports;
}
const http = load("../app/api/arisan/gatherings/http.ts") as typeof import("../app/api/arisan/gatherings/http.ts");
const request = (change: { url?: string; origin?: string; type?: string; body?: string } = {}) => new Request(change.url ?? "https://salapi.app/api/arisan/gatherings", { method: "POST", headers: { Origin: change.origin ?? "https://salapi.app", "Content-Type": change.type ?? "application/json" }, body: change.body ?? '{"kind":"scheduled","roomId":9}' });
test("cookie-authenticated mutations require exact origin, JSON and a clean query", async () => {
  assert.deepEqual(JSON.parse(JSON.stringify(await http.gatheringRequest(request()))), { kind: "scheduled", roomId: 9 });
  for (const change of [{ origin: "https://evil.test" }, { origin: "https://salapi.app.evil.test" }, { type: "text/plain" }, { url: "https://salapi.app/api/arisan/gatherings?csrf=bad" }, { body: "not json" }, { body: "a".repeat(8193) }]) await assert.rejects(http.gatheringRequest(request(change)));
  await assert.rejects(http.gatheringRequest(new Request("https://salapi.app/api/arisan/gatherings", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })));
});
test("UTF-8 decoding and streamed body size are bounded before backend authorization", async () => {
  const bad = new Request("https://salapi.app/api/arisan/gatherings", { method: "POST", headers: { Origin: "https://salapi.app", "Content-Type": "application/json" }, body: new Uint8Array([0xff, 0xfe]) });
  await assert.rejects(http.gatheringRequest(bad));
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4096)); controller.enqueue(new Uint8Array(4097)); controller.close(); } });
  const streamed = new Request("https://salapi.app/api/arisan/gatherings", { method: "POST", headers: { Origin: "https://salapi.app", "Content-Type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
  await assert.rejects(http.gatheringRequest(streamed));
});
test("every private response is non-cacheable and failure codes are not success claims", () => {
  for (const [code, status] of [["invalid", 400], ["unauthorized", 401], ["forbidden", 403], ["conflict", 409], ["unavailable", 503]] as const) {
    const response = http.gatheringResponse({ ok: false, code, error: "No saved delivery confirmed." }); assert.equal(response.status, status); assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.equal(response.headers.get("vary"), "Cookie");
  }
});
test("gathering GET rejects duplicate, unknown or malformed query parameters", async () => {
  let calls = 0;
  const route = load("../app/api/arisan/gatherings/route.ts", { "./http": http, "@/lib/server/arisanGatherings": { readArisanGathering: async () => { calls++; return { ok: true }; }, saveArisanGathering: async () => { calls++; return { ok: true }; } } }) as Route;
  for (const query of ["", "kind=upfront&roomId=9&wallet=foreign", "kind=upfront&kind=scheduled&roomId=9", "kind=upfront&roomId=9&roomId=10", "kind=upfront&roomId=-1", "kind=upfront&roomId=9e2"]) assert.equal((await route.GET(new Request(`https://salapi.app/api/arisan/gatherings?${query}`))).status, 400);
  assert.equal(calls, 0); assert.equal((await route.GET(new Request("https://salapi.app/api/arisan/gatherings?kind=upfront&roomId=9"))).status, 200); assert.equal(calls, 1);
  assert.equal((await route.POST(request({ origin: "https://evil.test" }))).status, 400); assert.equal(calls, 1);
});
function cron(secret: string | undefined, { reminderFails = false, maintenanceFails = false, discoveryFails = false, expiredUnknown = false } = {}) {
  let calls = 0;
  const route = load("../app/api/cron/arisan-reminders/route.ts", { "node:crypto": crypto,
    "@/lib/server/arisanGatherings": { dispatchArisanReminders: async () => { calls++; return { ok: true, processed: 1, enqueued: 3, failed: reminderFails ? 1 : 0 }; }, discoverArisanScheduledRooms: async () => { calls++; return { ok: !discoveryFails, discovered: 0, failed: discoveryFails ? 1 : 0 }; } },
    "@/lib/server/arisanScheduledKeepalive": { dispatchArisanScheduledKeepalive: async () => { calls++; return { ok: !expiredUnknown, checked: 1, confirmed: maintenanceFails || expiredUnknown ? 0 : 1, pending: expiredUnknown ? 1 : 0, failed: maintenanceFails || expiredUnknown ? 1 : 0 }; } },
  }, secret === undefined ? {} : { CRON_SECRET: secret }) as Route;
  return { route, calls: () => calls };
}
test("cron refuses missing or short configuration before any DB/RPC/signing worker", async () => {
  for (const secret of [undefined, "short", " "]) { const h = cron(secret); assert.equal((await h.route.GET(new Request("https://salapi.app/api/cron/arisan-reminders"))).status, 503); assert.equal(h.calls(), 0); }
});
test("cron constant-time exact Bearer and clean-query guard rejects unauthenticated requests", async () => {
  const secret = "x".repeat(48), h = cron(secret);
  for (const auth of ["", "Bearer wrong", `bearer ${secret}`, `Bearer ${"y".repeat(48)}`]) assert.equal((await h.route.GET(new Request("https://salapi.app/api/cron/arisan-reminders", { headers: { Authorization: auth } }))).status, 401);
  assert.equal((await h.route.GET(new Request("https://salapi.app/api/cron/arisan-reminders?force=true", { headers: { Authorization: `Bearer ${secret}` } }))).status, 401); assert.equal(h.calls(), 0);
});
test("trimmed configured cron secret dispatches both bounded workers and returns no-cache counts only", async () => {
  const secret = "x".repeat(48), h = cron(`${secret}\r\n`), response = await h.route.GET(new Request("https://salapi.app/api/cron/arisan-reminders", { headers: { Authorization: `Bearer ${secret}` } }));
  assert.equal(response.status, 200); assert.equal(h.calls(), 3); assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal((await response.json()).keepalive.confirmed, 1);
});
test("cron fails monitoring health if either reminder or maintenance has failed, even with ok=true", async () => {
  const secret = "x".repeat(48);
  for (const options of [{ reminderFails: true }, { maintenanceFails: true }, { discoveryFails: true }]) { const h = cron(secret, options); assert.equal((await h.route.GET(new Request("https://salapi.app/api/cron/arisan-reminders", { headers: { Authorization: `Bearer ${secret}` } }))).status, 503); }
});
test("expired acceptance-unknown maintenance remains pending but produces failing cron and workflow health", async () => {
  const secret = "x".repeat(48), h = cron(secret, { expiredUnknown: true });
  const response = await h.route.GET(new Request("https://salapi.app/api/cron/arisan-reminders", { headers: { Authorization: `Bearer ${secret}` } }));
  assert.equal(response.status, 503); const result = await response.json();
  assert.equal(result.keepalive.ok, false); assert.equal(result.keepalive.failed, 1); assert.equal(result.keepalive.pending, 1);
  const workflow = readFileSync(new URL("../../.github/workflows/arisan-reminders.yml", import.meta.url), "utf8");
  assert.match(workflow, /curl --fail/); assert.match(workflow, /\.keepalive\.ok == true and \.keepalive\.failed == 0/);
});
