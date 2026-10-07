import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { StrKey } from "@stellar/stellar-sdk";
import { canonicalDonorCampaignId, campaignDonorCursor } from "../lib/campaign-donor.ts";

const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const circleHelpers = {} as { canonicalCircleTestnetSlug(input: unknown): string | null };
runInNewContext(compile("../lib/circles/testnet.ts"), { exports: circleHelpers, require(name: string) {
  if (name === "@stellar/stellar-sdk") return { StrKey };
  if (name === "./seed") return { SEED_CIRCLES: [{ id: "tino-relief" }, { id: "cats-recovery" }] };
  throw new Error(`Unexpected circle validator dependency ${name}`);
} });
const { canonicalCircleTestnetSlug } = circleHelpers;
type Read = (...args: unknown[]) => Promise<unknown>;
function route(path: string, dependencies: Record<string, unknown>) {
  const exports = {} as { GET(request: Request): Promise<Response> };
  runInNewContext(compile(path), { exports, URL, Response,
    require(name: string) { if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`); return dependencies[name]; },
  });
  return exports.GET;
}
function setup(kind: "campaigns" | "circles" | "donors" | "photo", value: unknown = { ok: true }) {
  const calls: unknown[][] = [];
  const read: Read = async (...args) => { calls.push(args); return value; };
  const api = kind === "campaigns" ? route("../app/api/public/campaigns/route.ts", { "@/app/campaign-actions": { publicCampaignState: read } })
    : kind === "circles" ? route("../app/api/public/circles-testnet/route.ts", {
      "@/lib/server/circlesTestnet": { readCircleTestnetCampaign: read }, "@/lib/circles/testnet": { canonicalCircleTestnetSlug } })
    : kind === "donors" ? route("../app/api/public/campaign-donors/route.ts", {
      "@/lib/server/campaignDonors": { readCampaignDonors: read }, "@/lib/campaign-donor": { canonicalDonorCampaignId, campaignDonorCursor } })
    : route("../app/api/account/photo/route.ts", { "@/lib/server/accountPhoto": { readAccountPhoto: read } });
  return { calls, get: (query = "") => api(new Request(`https://fixture.invalid/api/${kind}${query}`)) };
}

test("public discovery uses one bounded page and cannot select a viewer", async () => {
  const h = setup("campaigns", { ok: true, campaigns: [], now: "1", contractId: "fixed" });
  const response = await h.get("?before=20");
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(h.calls, [["20"]]); assert.deepEqual(await response.json(), { ok: true, campaigns: [], now: "1", contractId: "fixed" });
});
for (const query of ["?before=01", "?before=-1", "?before=18446744073709551616", "?before=0&before=1", "?viewer=private", "?contractId=foreign"]) {
  test(`discovery rejects selectors before network: ${query}`, async () => {
    const h = setup("campaigns"); assert.equal((await h.get(query)).status, 400); assert.equal(h.calls.length, 0);
  });
}
test("circle GET accepts only the fixed fictional catalog slug", async () => {
  const h = setup("circles"); const response = await h.get("?circleId=tino-relief");
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store"); assert.deepEqual(h.calls, [["tino-relief"]]);
});
for (const query of ["", "?circleId=made-up", "?circleId=tino-relief&circleId=cats-recovery", "?circleId=tino-relief&wallet=private", "?circleId=tino-relief&contractId=foreign"]) {
  test(`circle GET rejects unreviewed selectors: ${query}`, async () => {
    const h = setup("circles"); assert.equal((await h.get(query)).status, 400); assert.equal(h.calls.length, 0);
  });
}
test("donor GET reuses public consent-filtered reader with bound campaign/cursor", async () => {
  const value = { ok: true, campaignId: "6", entries: [{ anonymous: true, donor: null, hash: null, link: null }], nextCursor: null };
  const h = setup("donors", value); const response = await h.get("?campaignId=6&before=9");
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(h.calls, [["6", "9"]]); assert.deepEqual(await response.json(), value);
});
for (const query of ["?campaignId=0", "?campaignId=06", "?campaignId=6&before=-1", "?campaignId=6&before=0", "?campaignId=6&before=9223372036854775808", "?campaignId=6&ownerId=private", "?campaignId=6&campaignId=7"]) {
  test(`donor GET rejects query escape: ${query}`, async () => {
    const h = setup("donors"); assert.equal((await h.get(query)).status, 400); assert.equal(h.calls.length, 0);
  });
}
test("account photo GET never selects an owner and is private/no-store", async () => {
  const h = setup("photo", { ok: false, code: "unauthenticated" }); const response = await h.get();
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Vary"), "Cookie"); assert.deepEqual(h.calls, [[]]);
  assert.deepEqual(await response.json(), { ok: false, code: "unauthenticated" });
  const rejected = setup("photo"); assert.equal((await rejected.get("?ownerId=other")).status, 400); assert.equal(rejected.calls.length, 0);
});
test("GET reader exceptions fail closed without leaked internals", async () => {
  const get = route("../app/api/account/photo/route.ts", { "@/lib/server/accountPhoto": {
    readAccountPhoto: async () => { throw new Error("secret internal failure"); },
  } });
  const response = await get(new Request("https://fixture.invalid/api/account/photo"));
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { ok: false, code: "unavailable" });
});
test("public reads use fresh same-origin GETs, no action or cache fallback", async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  const exports = {} as { readPublicCampaigns(before?: string): Promise<unknown>; readPublicCircleTestnet(id: string): Promise<unknown>; readPublicCampaignDonors(id: string, before?: string): Promise<unknown> };
  runInNewContext(compile("../lib/ui/public-read.ts"), { exports, AbortSignal, encodeURIComponent,
    fetch: async (url: string, options: RequestInit) => { calls.push({ url, options }); return Response.json({ ok: true }); },
    require: () => { throw new Error("No runtime SDK, auth or mutation dependency allowed"); },
  });
  await Promise.all([exports.readPublicCampaigns("10"), exports.readPublicCircleTestnet("tino-relief"), exports.readPublicCampaignDonors("6", "9")]);
  assert.deepEqual(calls.map(call => call.url), ["/api/public/campaigns?before=10", "/api/public/circles-testnet?circleId=tino-relief", "/api/public/campaign-donors?campaignId=6&before=9"]);
  for (const { options } of calls) {
    assert.equal(options.method, "GET"); assert.equal(options.credentials, "same-origin"); assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error"); assert.ok(options.signal instanceof AbortSignal); assert.equal(options.body, undefined);
  }
});
