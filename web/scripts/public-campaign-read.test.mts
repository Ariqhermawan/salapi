// Public discovery performance and authority boundaries, no live providers.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import * as campaign from "../lib/campaign.ts";
import type * as Actions from "../app/campaign-actions.ts";
import type { StoredCircleTestnetMapping } from "../lib/circles/testnet.ts";

const contract = "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU";
const token = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const wallet = (value: number) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, value)).publicKey();
const now = 1_791_340_200n;
const raw = (id = 27n) => ({ id, title: `Actual QA campaign ${id}`, state: ["Funding"],
  config: { creator: wallet(1), beneficiary: wallet(2), token, creator_cut_bps: 0,
    funding_deadline: now + 600n, review_deadline: now + 1200n, approvers: [wallet(3), wallet(4), wallet(5)] },
  total: 123_456_789n, escrow: 123_456_789n, proof_hash: null, proof_url: "", approvals: [] });
const code = ts.transpileModule(readFileSync(new URL("../app/campaign-actions.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const associations = {} as { circleDiscoveryLinks: (campaigns: campaign.Campaign[], mappings: StoredCircleTestnetMapping[]) => Record<string, string> };
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/server/circlesTestnet.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: associations, require: (name: string) => name === "@/lib/server/stellar" ? { CONTRACTS: { tokenXlmSac: token } } : {} });

function harness(options: { preview?: boolean; contractId?: string | null; version?: unknown; token?: unknown; clock?: unknown;
  rows?: unknown; rpcGate?: Promise<void>; rpcError?: boolean; viewer?: string | null;
  mappings?: StoredCircleTestnetMapping[]; mappingError?: boolean; mappingGate?: Promise<void> } = {}) {
  const calls = { rpc: [] as { method: string; args: unknown[] }[], auth: 0, mapping: 0, financial: 0, active: 0, peak: 0 };
  const forbidden = (kind: "auth" | "financial") => () => { calls[kind]++; throw Error(`Forbidden ${kind} access`); };
  const exports = {} as typeof Actions;
  runInNewContext(code, { exports, Buffer, Uint8Array, TextEncoder, require(name: string) {
    if (name === "@stellar/stellar-sdk") return { StrKey, rpc: {}, scValToNative: forbidden("financial") };
    if (name === "@/lib/server/stellar") return { CONTRACTS: { tokenXlmSac: token }, RPC_URL: "https://fixture.invalid",
      donationCampaignId: () => options.contractId === undefined ? contract : options.contractId,
      invokeAs: forbidden("financial"), txLink: forbidden("financial"), sc: { u64: (value: bigint) => value, u32: (value: number) => value, addr: (value: string) => value },
      async readContract(id: string, method: string, args: unknown[] = []) {
        assert.equal(id, contract); calls.rpc.push({ method, args }); calls.active++; calls.peak = Math.max(calls.peak, calls.active);
        try {
          if (options.rpcGate) await options.rpcGate;
          if (options.rpcError) throw Error("Fixture provider unavailable");
          if (method === "version") return options.version === undefined ? 4 : options.version;
          if (method === "token") return options.token === undefined ? token : options.token;
          if (method === "clock") return options.clock === undefined ? now : options.clock;
          if (method === "campaign") return options.rows === undefined ? raw(args[0] as bigint) : (options.rows as unknown[])[0];
          if (method === "contribution") return { amount: 5_000_000n, refunded: false };
          assert.equal(method, "campaigns"); assert.equal(args[1], 10);
          return options.rows === undefined ? [raw()] : options.rows;
        } finally { calls.active--; }
      } };
    if (name === "@/lib/server/userWallet") return { currentWalletPublicKey: options.viewer === undefined ? forbidden("auth") : async () => { calls.auth++; return options.viewer; }, getAuthenticatedSigner: forbidden("financial") };
    if (name === "@/lib/server/circlesTestnet") return { ...associations, async readCircleDiscoveryMappings() {
      calls.mapping++; if (options.mappingGate) await options.mappingGate;
      if (options.mappingError) throw Error("Private catalog metadata failure");
      return options.mappings ?? [];
    } };
    if (name === "@/lib/campaign-money") return {};
    if (name === "@/lib/campaign") return campaign;
    if (name === "@/lib/local-preview") return { isLocalPreview: options.preview ?? false };
    throw Error(`Unexpected public discovery dependency ${name}`);
  } });
  return { ...exports, calls };
}

test("public discovery reads four RPCs with no viewer, contributions, auth, signer or invented balance", async () => {
  const h = harness(); const result = await h.publicCampaignState();
  assert.equal(result.ok, true); if (!result.ok) return;
  assert.equal(result.campaigns[0].total, "123456789");
  assert.equal(result.campaigns[0].id, "27");
  assert.equal("viewer" in result, false); assert.equal("contribution" in result.campaigns[0], false);
  assert.equal(h.calls.auth, 0); assert.equal(h.calls.financial, 0);
  assert.deepEqual(h.calls.rpc.map(call => call.method), ["version", "token", "clock", "campaigns"]);
  assert.deepEqual(Array.from(h.calls.rpc[3].args), [0n, 10]);
});

test("all four reads start together and no public data is published before their validation", async () => {
  let release!: () => void;
  const rpcGate = new Promise<void>(resolve => { release = resolve; });
  const h = harness({ rpcGate }); let settled = false;
  const pending = h.publicCampaignState().then(result => { settled = true; return result; });
  await Promise.resolve();
  assert.equal(h.calls.rpc.length, 4); assert.equal(h.calls.peak, 4); assert.equal(settled, false);
  release(); assert.equal((await pending).ok, true);
});

test("untrusted selectors fail before consuming provider, auth or financial access", async () => {
  for (const before of [null, {}, 1, "", "01", "-1", "1.0", " 1", "1e2", "18446744073709551616", "0?wallet=other"]) {
    const h = harness(); assert.equal((await h.publicCampaignState(before)).ok, false);
    assert.equal(h.calls.rpc.length, 0); assert.equal(h.calls.auth, 0); assert.equal(h.calls.financial, 0);
  }
  for (const options of [{ preview: true }, { contractId: null }, { contractId: "wrong-contract" }]) {
    const h = harness(options); assert.equal((await h.publicCampaignState()).ok, false); assert.equal(h.calls.rpc.length, 0);
  }
});

test("provider/deployment/time failures never become successful empty or fabricated discovery", async () => {
  for (const options of [{ version: 3 }, { token: contract }, { clock: "123" }, { clock: 0n }, { clock: 1n << 64n }, { rpcError: true }, { rows: null }]) {
    const h = harness(options); const result = await h.publicCampaignState();
    assert.equal(result.ok, false); assert.equal("campaigns" in result, false); assert.equal("viewer" in result, false);
    assert.equal(h.calls.auth, 0); assert.equal(h.calls.financial, 0);
  }
});

test("canonical descending pages remain lossless, bounded to ten, and bound to their cursor", async () => {
  const rows = Array.from({ length: 10 }, (_, index) => raw(BigInt(27 - index)));
  const first = harness({ rows }); const result = await first.publicCampaignState();
  assert.equal(result.ok, true); if (result.ok) assert.equal(result.campaigns.length, 10);
  const second = harness({ rows: [raw(17n)] }); assert.equal((await second.publicCampaignState("18")).ok, true);
  assert.deepEqual(Array.from(second.calls.rpc[3].args), [18n, 10]);
  for (const badRows of [[raw(18n)], [raw(17n), raw(17n)], [raw(15n), raw(16n)], Array(11).fill(raw(1n))]) {
    assert.equal((await harness({ rows: badRows }).publicCampaignState("18")).ok, false);
  }
  const empty = await harness({ rows: [] }).publicCampaignState(); assert.equal(empty.ok, true);
  if (empty.ok) assert.equal(empty.campaigns.length, 0);
});

test("public projection ignores extra/private fields and rejects malformed chain facts", async () => {
  const extra = { ...raw(), contribution: { amount: "999", refunded: true }, viewer: wallet(10), ownerId: "private",
    config: { ...raw().config, secret: "private" } };
  const result = await harness({ rows: [extra] }).publicCampaignState(); assert.equal(result.ok, true);
  assert.doesNotMatch(JSON.stringify(result), /private|contribution|ownerId|viewer|secret/);
  for (const changes of [{ id: 0n }, { title: "" }, { title: "x".repeat(121) }, { state: ["Unknown"] }, { total: -1n },
    { total: 1n << 127n }, { escrow: raw().total + 1n }, { approvals: [wallet(10)] }, { proof_hash: Buffer.alloc(31) },
    { proof_url: "javascript:evil()" }]) {
    assert.equal((await harness({ rows: [{ ...raw(), ...changes }] }).publicCampaignState()).ok, false);
  }
  for (const changes of [{ token: contract }, { creator: "invalid" }, { approvers: [wallet(3), wallet(3), wallet(5)] },
    { creator_cut_bps: 1001 }, { funding_deadline: now + 1201n }]) {
    assert.equal((await harness({ rows: [{ ...raw(), config: { ...raw().config, ...changes } }] }).publicCampaignState()).ok, false);
  }
});

test("public discovery is request scoped; repeat reads do not reuse another deployment or stale totals", async () => {
  const h = harness(); await h.publicCampaignState(); await h.publicCampaignState();
  assert.equal(h.calls.rpc.length, 8); assert.equal(h.calls.auth, 0);
});

test("native campaign state exposes a catalog link only after full config matching, with original title and contributions", async () => {
  const value = raw(7n); value.title = "QA Circles: tino-relief";
  const mapping: StoredCircleTestnetMapping = { circleId: "tino-relief", campaignId: "7", campaignTitle: value.title,
    creatorWallet: value.config.creator, beneficiaryWallet: value.config.beneficiary, approverWallets: value.config.approvers,
    creatorCutBps: value.config.creator_cut_bps, fundingDeadline: value.config.funding_deadline.toString(), reviewDeadline: value.config.review_deadline.toString() };
  for (const spoof of [false, true]) {
    const h = harness({ viewer: wallet(8), mappings: [mapping], rows: [{ ...value, config: { ...value.config, creator: spoof ? wallet(9) : value.config.creator } }] });
    const result = await h.campaignState("7"); assert.equal(result.ok, true); if (!result.ok) return;
    assert.deepEqual(structuredClone(result.circleLinks ?? {}), spoof ? {} : { "7": "tino-relief" });
    assert.equal(result.campaigns[0].title, value.title); assert.equal(result.campaigns[0].total, value.total.toString());
    assert.equal(result.campaigns[0].contribution.amount, "5000000");
    assert.equal(h.calls.mapping, 1); assert.equal(h.calls.rpc.length, 5); assert.equal(h.calls.financial, 0);
  }
});

test("native campaign metadata overlaps ledger and contribution reads and failures preserve campaign fallback", async () => {
  for (const mappingError of [false, true]) {
    let release!: () => void;
    const mappingGate = new Promise<void>(resolve => { release = resolve; });
    const h = harness({ viewer: wallet(8), mappingGate, mappingError });
    let settled = false;
    const pending = h.campaignState("7").then(result => { settled = true; return result; });
    for (let i = 0; i < 12; i++) await Promise.resolve();
    assert.equal(h.calls.mapping, 1); assert.ok(h.calls.rpc.some(call => call.method === "campaign"));
    assert.ok(h.calls.rpc.some(call => call.method === "contribution"), "Metadata must not block contribution reads");
    assert.equal(settled, false); release();
    const result = await pending; assert.equal(result.ok, true); if (!result.ok) return;
    assert.equal(result.campaigns[0].title, "Actual QA campaign 7"); assert.deepEqual(structuredClone(result.circleLinks ?? {}), {});
    assert.equal(h.calls.rpc.length, 5); assert.equal(h.calls.financial, 0); assert.doesNotMatch(JSON.stringify(result), /Private catalog/);
  }
});
