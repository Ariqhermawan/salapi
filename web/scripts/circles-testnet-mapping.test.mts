import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import ts from "typescript";
import type * as MappingModule from "../lib/circles/testnet.ts";
import type * as ServerModule from "../lib/server/circlesTestnet.ts";

const modules = new Map<string, Record<string, unknown>>();
function pureModule(path: string): Record<string, unknown> {
  const cached = modules.get(path);
  if (cached) return cached;
  const exports: Record<string, unknown> = {};
  modules.set(path, exports);
  runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, URL, TextEncoder, Uint8Array, require(name: string) {
    if (name === "@stellar/stellar-sdk") return { StrKey };
    if (name === "./seed") return pureModule("../lib/circles/seed.ts");
    if (name === "./organizers") return pureModule("../lib/circles/organizers.ts");
    if (name === "./types") return pureModule("../lib/circles/types.ts");
    throw new Error(`Unexpected pure dependency: ${name}`);
  } });
  return exports;
}
const mapping = pureModule("../lib/circles/testnet.ts") as typeof MappingModule;
const allSlugs = mapping.circleTestnetSlugs()!;
const creator = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const beneficiary = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();
const approvers = [3, 4, 5].map(seed => Keypair.fromRawEd25519Seed(Buffer.alloc(32, seed)).publicKey());
const contract = "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU";
const token = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const origin = "https://fixture.supabase.co";
const now = 1_791_340_200n;
function row(slug = "tino-relief", id = "1") {
  return { network: "testnet", contract_id: contract, circle_slug: slug, campaign_id: id,
    campaign_title: mapping.circleTestnetCampaignTitle(slug), creator_wallet: creator, beneficiary_wallet: beneficiary,
    token_id: token, approver_wallets: [...approvers], creator_cut_bps: 0,
    funding_deadline: (now + 600n).toString(), review_deadline: (now + 1200n).toString(),
    purpose: "fictional-circles-qa", archived_at: null };
}
function rawCampaign(value = row()) {
  return { id: BigInt(value.campaign_id), title: value.campaign_title,
    config: { creator: value.creator_wallet, beneficiary: value.beneficiary_wallet, token: value.token_id,
      approvers: [...value.approver_wallets], creator_cut_bps: value.creator_cut_bps,
      funding_deadline: BigInt(value.funding_deadline), review_deadline: BigInt(value.review_deadline) },
    state: ["Funding"], total: 123_456_789n, escrow: 123_456_789n, proof_hash: null as Uint8Array | null,
    proof_url: "", approvals: [] as string[] };
}
const compile = ts.transpileModule(readFileSync(new URL("../lib/server/circlesTestnet.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
type Options = {
  rows?: unknown; tableError?: unknown; configured?: boolean; preview?: boolean; url?: string;
  contractId?: string | null; version?: number; token?: string; clock?: unknown;
  raw?: (id: string) => unknown; failureId?: string; delay?: number; rpcGate?: Promise<void>;
};
function harness(options: Options = {}) {
  const rows = options.rows === undefined ? [row()] : options.rows;
  const calls = { table: 0, filters: [] as [string, string, unknown][], rpc: [] as string[], active: 0, peak: 0, clients: 0 };
  let configuredFetch: typeof fetch | undefined;
  let selectedSlugs: string[] = [];
  const query = {
    select(columns: string) { assert.ok(columns.includes("creator_wallet")); assert.ok(!/email|secret|cipher|user_id/.test(columns)); return query; },
    eq(key: string, value: unknown) { calls.filters.push(["eq", key, value]); return query; },
    is(key: string, value: unknown) { calls.filters.push(["is", key, value]); return query; },
    in(key: string, values: string[]) { assert.equal(key, "circle_slug"); selectedSlugs = Array.from(values); return query; },
    limit(value: number) { assert.equal(value, selectedSlugs.length + 1); return query; },
    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve({ data: rows, error: options.tableError ?? null }).then(resolve, reject);
    },
  };
  const exports = {} as typeof ServerModule;
  runInNewContext(compile, { exports, URL, TextEncoder, Uint8Array, setTimeout, clearTimeout, AbortSignal,
    fetch: async (_input: unknown, init: RequestInit) => { assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store"); return new Response("{}"); },
    require(name: string) {
      if (name === "server-only") return {};
      if (name === "@stellar/stellar-sdk") return { StrKey };
      if (name === "@supabase/supabase-js") return { createClient(url: string, key: string, config: { global: { fetch: typeof fetch }; auth: unknown }) {
        calls.clients++; assert.equal(url, origin); assert.equal(key, "fixture-service-key");
        assert.deepEqual(structuredClone(config.auth), { persistSession: false, autoRefreshToken: false });
        configuredFetch = config.global.fetch;
        return { from(table: string) { calls.table++; assert.equal(table, "circles_testnet_campaigns"); return query; } };
      } };
      if (name === "@/lib/supabase/env") return { SUPABASE_URL: options.url ?? origin,
        SUPABASE_SERVICE_ROLE: "fixture-service-key", supabaseAdminConfigured: () => options.configured ?? true };
      if (name === "@/lib/local-preview") return { isLocalPreview: options.preview ?? false };
      if (name === "@/lib/circles/testnet") return mapping;
      if (name === "@/lib/server/stellar") return { CONTRACTS: { tokenXlmSac: token },
        donationCampaignId: () => options.contractId === undefined ? contract : options.contractId,
        sc: { u64: (value: bigint) => value }, readContract: async (id: string, method: string, args: bigint[] = []) => {
          assert.equal(id, contract); calls.rpc.push(method);
          calls.active++; calls.peak = Math.max(calls.peak, calls.active);
          try {
            if (options.rpcGate) await options.rpcGate;
            if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));
            if (method === "version") return options.version ?? 4;
            if (method === "token") return options.token ?? token;
            if (method === "clock") return options.clock === undefined ? now : options.clock;
            assert.equal(method, "campaign"); const campaignId = args[0].toString();
            if (options.failureId === campaignId) throw new Error("Read unavailable");
            if (options.raw) return options.raw(campaignId);
            const selected = Array.isArray(rows) ? rows.find(value => value.campaign_id === campaignId) : undefined;
            return rawCampaign(selected ?? row());
          } finally { calls.active--; }
        } };
      throw new Error(`Unexpected server dependency, financial/auth access forbidden: ${name}`);
    },
  });
  return { ...exports, calls, mappingFetch: () => { assert.ok(configuredFetch); return configuredFetch; } };
}

test("only all 27 canonical active fictional causes are eligible, not history or arbitrary IDs", () => {
  assert.equal(allSlugs.length, 27); assert.equal(new Set(allSlugs).size, 27);
  for (const slug of allSlugs) {
    assert.equal(mapping.canonicalCircleTestnetSlug(slug), slug);
    assert.equal(mapping.circleTestnetCampaignTitle(slug), `QA Circles: ${slug}`);
  }
  for (const slug of [null, {}, "", "../tino-relief", "Tino-relief", " tino-relief", "cebu-boat-repairs", "unknown-circle"])
    assert.equal(mapping.canonicalCircleTestnetSlug(slug), null);
  for (const batch of [null, "tino-relief", [], ["tino-relief", "tino-relief"], ["unknown"], Array(28).fill("tino-relief")])
    assert.equal(mapping.circleTestnetSlugs(batch), null);
});

test("mapping validation binds the canonical QA title and every immutable deployment field", () => {
  const valid = mapping.validatedCircleTestnetMapping(row(), contract, token)!;
  assert.equal(valid.circleId, "tino-relief"); assert.equal(valid.campaignId, "1");
  for (const change of [
    { network: "mainnet" }, { contract_id: token }, { token_id: contract }, { purpose: "real-ngo" }, { archived_at: "2026-10-01" },
    { circle_slug: "cebu-boat-repairs" }, { campaign_id: "01" }, { campaign_id: "0" }, { campaign_id: "18446744073709551616" },
    { funding_deadline: "0" }, { funding_deadline: "1e6" }, { review_deadline: row().funding_deadline },
    { creator_wallet: "wallet" }, { beneficiary_wallet: contract }, { approver_wallets: [creator, creator, beneficiary] },
    { approver_wallets: approvers.slice(0, 2) }, { approver_wallets: [creator, beneficiary, "wallet"] },
    { creator_cut_bps: 1001 }, { creator_cut_bps: -1 }, { creator_cut_bps: 0.5 }, { campaign_title: "Real campaign title" },
  ]) assert.equal(mapping.validatedCircleTestnetMapping({ ...row(), ...change }, contract, token), null, JSON.stringify(change));
  assert.equal(mapping.validatedCircleTestnetMapping(row(), "invalid", token), null);
});

test("on-chain validation rejects IDs, asset, creator, beneficiary, approver order, cut and deadline drift", () => {
  const valid = mapping.validatedCircleTestnetMapping(row(), contract, token)!;
  const original = rawCampaign();
  const serialize = mapping.validatedCircleTestnetCampaign(original, valid, token)!;
  assert.equal(serialize.total, "123456789"); assert.equal("contribution" in serialize, false);
  for (const change of [{ id: 2n }, { title: "unrelated" }, { state: ["Wrong"] }, { total: -1n },
    { escrow: original.total + 1n }, { proof_hash: new Uint8Array(32) }, { proof_url: "https://example.com" },
    { approvals: [creator] }, { approvals: [approvers[0]] }, { total: 1n << 127n }])
    assert.equal(mapping.validatedCircleTestnetCampaign({ ...original, ...change }, valid, token), null);
  for (const change of [{ creator: beneficiary }, { beneficiary: creator }, { token: contract },
    { creator_cut_bps: 1 }, { funding_deadline: now }, { review_deadline: now },
    { approvers: [...approvers].reverse() }, { approvers: [creator, ...approvers.slice(1)] }])
    assert.equal(mapping.validatedCircleTestnetCampaign({ ...original, config: { ...original.config, ...change } }, valid, token), null);
});

test("proof serialization preserves actual hash and exact configured approvals but rejects unsafe URLs", () => {
  const valid = mapping.validatedCircleTestnetMapping(row(), contract, token)!;
  const raw = { ...rawCampaign(), state: ["PendingProof"], proof_hash: Buffer.alloc(32, 7),
    proof_url: "https://example.com/proof", approvals: approvers.slice(0, 2) };
  const result = mapping.validatedCircleTestnetCampaign(raw, valid, token)!;
  assert.equal(result.proofHash, "07".repeat(32)); assert.equal(result.approvals.length, 2);
  for (const url of ["javascript:alert(1)", "http://example.com/proof", "https://name:secret@example.com/proof", "https://example.com/" + "a".repeat(512)])
    assert.equal(mapping.validatedCircleTestnetCampaign({ ...raw, proof_url: url }, valid, token), null);
  assert.equal(mapping.validatedCircleTestnetCampaign({ ...raw, approvals: [approvers[0], approvers[0]] }, valid, token), null);
});

test("ready, exact funding deadline and terminal phases are honest, never prototype amount fallback", () => {
  const valid = mapping.validatedCircleTestnetMapping(row(), contract, token)!;
  const campaign = mapping.validatedCircleTestnetCampaign(rawCampaign(), valid, token)!;
  const ready = mapping.circleTestnetReady(valid, campaign, contract, now);
  assert.equal(ready.ok && ready.status, "ready"); assert.equal(ready.donationOpen, true);
  assert.equal(ready.qaLabel, "QA Testnet · fictional cause"); assert.equal("pesoRaised" in ready, false);
  const expired = mapping.circleTestnetReady(valid, campaign, contract, BigInt(valid.fundingDeadline));
  assert.equal(expired.ok && expired.status, "expired"); assert.equal(expired.donationOpen, false);
  for (const state of ["PendingProof", "Refundable", "Released", "Closed"] as const) {
    const closed = mapping.circleTestnetReady(valid, { ...campaign, state }, contract, now);
    assert.equal(closed.ok && closed.status, "closed"); assert.equal(closed.donationOpen, false);
  }
});

for (const [label, options, code] of [
  ["local preview", { preview: true }, "local_preview"], ["no admin", { configured: false }, "not_configured"],
  ["invalid contract", { contractId: null }, "not_configured"], ["HTTP Supabase", { url: "http://fixture.supabase.co" }, "not_configured"],
  ["Supabase URL credential", { url: "https://name:secret@fixture.supabase.co" }, "not_configured"],
  ["Supabase URL path", { url: `${origin}/path` }, "not_configured"],
  ["missing table", { tableError: { code: "42P01" } }, "not_configured"],
  ["table permission failure", { tableError: { code: "42501" } }, "unavailable"],
] as const) test(`${label} fails closed and makes no RPC or auth/financial access`, async () => {
  const h = harness(options); const result = await h.readCircleTestnetCampaign("tino-relief");
  assert.equal(!result.ok && result.code, code); assert.equal(result.campaign, null); assert.equal(result.mapping, null);
  assert.equal(h.calls.rpc.length, 0);
});

test("untrusted selector cannot choose a contract, recipient or consume any lookup", async () => {
  const h = harness();
  const result = await h.readCircleTestnetCampaign({ slug: "tino-relief", contract, beneficiary });
  assert.equal(!result.ok && result.code, "invalid_circle"); assert.equal(h.calls.table, 0); assert.equal(h.calls.rpc.length, 0);
  const batch = await h.readCirclesTestnetCampaigns(["tino-relief", "../1"]);
  assert.equal(batch.code, "invalid_circle"); assert.equal(h.calls.table, 0);
});

test("unmapped is distinct from setup failure and never returns illustrative counts", async () => {
  const h = harness({ rows: [] }); const result = await h.readCircleTestnetCampaign("tino-relief");
  assert.equal(!result.ok && result.code, "unmapped"); assert.equal(result.campaign, null); assert.equal(h.calls.rpc.length, 0);
});

for (const [label, options] of [
  ["wrong version", { version: 3 }], ["wrong deployment token", { token: contract }],
  ["malformed clock", { clock: "1791340200" }], ["zero clock", { clock: 0n }],
  ["mapping network drift", { rows: [{ ...row(), network: "mainnet" }] }],
  ["two active mappings", { rows: [row(), row("tino-relief", "2")] }],
  ["unexpected slug", { rows: [row("cats-recovery", "2")] }],
  ["chain config drift", { raw: () => ({ ...rawCampaign(), config: { ...rawCampaign().config, beneficiary: creator } }) }],
] as const) test(`${label} cannot enable a donation`, async () => {
  const h = harness(options); const result = await h.readCircleTestnetCampaign("tino-relief");
  assert.equal(!result.ok && result.code, "unavailable"); assert.equal(result.donationOpen, false); assert.equal(result.campaign, null);
});

test("single read verifies server-selected contract, no viewer secrets and no current-user contribution", async () => {
  const h = harness(); const result = await h.readCircleTestnetCampaign("tino-relief");
  assert.equal(result.ok, true); assert.equal(result.donationOpen, true);
  assert.equal(result.contractId, contract); assert.equal(result.campaign?.total, "123456789");
  assert.equal("contribution" in result.campaign!, false); assert.equal("ownerId" in result, false);
  assert.deepEqual(h.calls.filters, [["eq", "network", "testnet"], ["eq", "contract_id", contract], ["is", "archived_at", null]]);
  assert.deepEqual(h.calls.rpc, ["version", "token", "clock", "campaign"]);
});

test("single mapping starts all four public RPC reads together but publishes only after validation", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const h = harness({ rpcGate: gate });
  let settled = false;
  const pending = h.readCircleTestnetCampaign("tino-relief").then(value => { settled = true; return value; });
  for (let index = 0; index < 15; index++) await Promise.resolve();
  assert.deepEqual(h.calls.rpc, ["version", "token", "clock", "campaign"]);
  assert.equal(h.calls.peak, 4); assert.equal(settled, false);
  release(); const result = await pending; assert.equal(result.ok, true);
});

test("parallel single read cannot enable donations when deployment validation fails", async () => {
  const h = harness({ version: 3, delay: 1 });
  const result = await h.readCircleTestnetCampaign("tino-relief");
  assert.equal(h.calls.peak, 4); assert.equal(result.ok, false); assert.equal(result.donationOpen, false);
  assert.equal(result.mapping, null); assert.equal(result.campaign, null);
});

test("batch reads 27 QA causes with one DB query, one deployment check and bounded parallel RPC", async () => {
  const rows = allSlugs.map((slug, index) => row(slug, String(index + 1)));
  const h = harness({ rows, delay: 2 }); const batch = await h.readCirclesTestnetCampaigns();
  assert.equal(batch.ok, true); assert.equal(Object.keys(batch.campaigns).length, 27);
  assert.ok(Object.values(batch.campaigns).every(result => result.ok && result.donationOpen));
  assert.equal(h.calls.table, 1); assert.equal(h.calls.rpc.filter(method => method === "version").length, 1);
  assert.equal(h.calls.rpc.filter(method => method === "token").length, 1);
  assert.equal(h.calls.rpc.filter(method => method === "clock").length, 1);
  assert.equal(h.calls.rpc.filter(method => method === "campaign").length, 27);
  assert.equal(h.calls.peak, 4);
});

test("one unavailable campaign does not invent a fallback or erase other verified mappings", async () => {
  const h = harness({ rows: [row(), row("cats-recovery", "2")], failureId: "2" });
  const batch = await h.readCirclesTestnetCampaigns(["tino-relief", "cats-recovery", "barangay-library"]);
  assert.equal(batch.campaigns["tino-relief"].ok, true);
  assert.equal(!batch.campaigns["cats-recovery"].ok && batch.campaigns["cats-recovery"].code, "unavailable");
  assert.equal(!batch.campaigns["barangay-library"].ok && batch.campaigns["barangay-library"].code, "unmapped");
});

test("reads are request scoped, never shared cross-account or stale deployment cache", async () => {
  const h = harness(); await h.readCircleTestnetCampaign("tino-relief"); await h.readCircleTestnetCampaign("tino-relief");
  assert.equal(h.calls.table, 2); assert.equal(h.calls.clients, 2); assert.equal(h.calls.rpc.filter(method => method === "campaign").length, 2);
});

test("Home discovery validates all mappings in one bounded read without ledger fanout", async () => {
  const rows = allSlugs.map((slug, index) => row(slug, String(index + 1)));
  const h = harness({ rows });
  const mappings = await h.readCircleDiscoveryMappings();
  assert.equal(mappings.length, 27); assert.equal(h.calls.table, 1);
  assert.deepEqual(h.calls.rpc, []); assert.equal(h.calls.clients, 1);
  assert.deepEqual(h.calls.filters, [["eq", "network", "testnet"], ["eq", "contract_id", contract], ["is", "archived_at", null]]);
});

test("discovery metadata fails open for visibility, never hides campaigns on invalid mappings", async () => {
  for (const options of [{ preview: true }, { configured: false }, { rows: null }, { rows: [row(), row()] },
    { rows: [row(), row("cats-recovery")] }, { tableError: { code: "internal" } },
    { rows: [{ ...row(), beneficiary_wallet: creator }] }]) {
    const h = harness(options);
    assert.deepEqual(structuredClone(await h.readCircleDiscoveryMappings()), []);
    assert.deepEqual(h.calls.rpc, []);
  }
});

test("carousel dedup requires full validated immutable D4 mapping, not matching title or ID", () => {
  const h = harness(); const stored = mapping.validatedCircleTestnetMapping(row(), contract, token)!;
  const campaign = mapping.validatedCircleTestnetCampaign(rawCampaign(), stored, token)!;
  assert.deepEqual(structuredClone(h.circleDiscoveryLinks([campaign], [stored])), { "1": "tino-relief" });
  const variants = [
    { ...campaign, id: "2" }, { ...campaign, title: "Someone else's cause" },
    ...Object.entries({ creator: beneficiary, beneficiary: creator, token: contract, creator_cut_bps: 1,
      funding_deadline: "1", review_deadline: "2", approvers: [...approvers].reverse() })
      .map(([field, value]) => ({ ...campaign, config: { ...campaign.config, [field]: value } })),
  ];
  for (const variant of variants) assert.deepEqual(structuredClone(h.circleDiscoveryLinks([variant], [stored])), {});
  assert.deepEqual(structuredClone(h.circleDiscoveryLinks([campaign], [])), {});
});

test("admin fetch cannot leak service credential via untrusted URL or redirect", async () => {
  const h = harness(); await h.readCircleTestnetCampaign("tino-relief");
  const safeFetch = h.mappingFetch();
  await assert.rejects(safeFetch("https://evil.invalid/rest/v1/circles_testnet_campaigns"), /Unexpected mapping origin/);
  await assert.rejects(safeFetch("https://name:secret@fixture.supabase.co/rest/v1/table"), /Unexpected mapping origin/);
  await safeFetch(`${origin}/rest/v1/circles_testnet_campaigns`);
});

test("SQL recipe covers all 27 canonical causes, denies clients and app writes, preserves immutable history", () => {
  const sql = readFileSync(new URL("../supabase/circles_testnet_campaigns.sql", import.meta.url), "utf8");
  for (const slug of allSlugs) assert.ok(sql.includes(`'${slug}'`), slug);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /from public, anon, authenticated, service_role/);
  assert.match(sql, /grant select on public\.circles_testnet_campaigns to service_role/);
  assert.match(sql, /as restrictive\s+for all to anon, authenticated using \(false\) with check \(false\)/);
  assert.match(sql, /primary key \(network, contract_id, campaign_id\)/);
  assert.match(sql, /where archived_at is null/); assert.match(sql, /before update or delete/);
  assert.match(sql, /old\.archived_at is not null or new\.archived_at is null/);
  assert.match(sql, /security invoker set search_path = ''/); assert.doesNotMatch(sql, /security definer/i);
  assert.doesNotMatch(sql, /insert into public\.circles_testnet_campaigns/i);
  assert.doesNotMatch(sql, /grant (?:all|insert|update|delete)/i);
});
