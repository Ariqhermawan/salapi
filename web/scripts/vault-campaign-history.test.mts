import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { StrKey } from "@stellar/stellar-sdk";
import type { VaultCampaignHistory } from "../lib/server/vaultCampaignHistory.ts";
import type { Campaign } from "../lib/campaign.ts";
import type { StoredCircleTestnetMapping } from "../lib/circles/testnet.ts";

const contractId = "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU";
const token = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const ownerId = "00000000-0000-4000-8000-000000000001";
const otherOwner = "00000000-0000-4000-8000-000000000002";
const wallet = (n: number) => StrKey.encodeEd25519PublicKey(Buffer.alloc(32, n));
const viewer = wallet(7), now = 1_791_340_200n;
const raw = (id: bigint) => ({ id, title: `QA campaign ${id}`, state: ["Funding"],
  config: { creator: wallet(1), beneficiary: wallet(2), token, creator_cut_bps: 300,
    funding_deadline: now + 600n, review_deadline: now + 1200n, approvers: [wallet(3), wallet(4), wallet(5)] },
  total: 5_010_000_000n, escrow: 5_010_000_000n, proof_hash: null, proof_url: "", approvals: [] });
const source = readFileSync(new URL("../lib/server/vaultCampaignHistory.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const associations = {} as { circleDiscoveryLinks(campaigns: Campaign[], mappings: StoredCircleTestnetMapping[]): Record<string, string> };
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/server/circlesTestnet.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: associations, require: (name: string) => name === "@/lib/server/stellar" ? { CONTRACTS: { tokenXlmSac: token } } : {} });
type Options = {
  total?: number; preview?: boolean; owner?: unknown; configuredContract?: string | null;
  version?: unknown; asset?: unknown; clock?: unknown; donations?: number[]; refunded?: number[];
  row?: (value: ReturnType<typeof raw>) => unknown; page?: (cursor: bigint, generated: unknown[]) => unknown;
  contribution?: (id: bigint) => unknown; rejectPage?: bigint; rejectContribution?: bigint;
  expireAfterPage?: bigint; hangContribution?: bigint;
  mappings?: StoredCircleTestnetMapping[]; mappingError?: boolean; hangMapping?: boolean; mappingGate?: Promise<void>;
};
function harness(options: Options = {}) {
  const calls = { owner: 0, mapping: 0, rpc: [] as { method: string; args: unknown[] }[], peak: 0, active: 0 };
  let milliseconds = 0, pendingRead = false;
  const late: ((error: Error) => void)[] = [];
  const exports = {} as { readVaultCampaignHistory(before?: unknown, expectedOwnerId?: unknown): Promise<VaultCampaignHistory>; isPlainObject(value: unknown): boolean };
  // Keep the check in the source realm; structuredClone normalizes prototypes
  // and would falsely accept an object that React Server Actions reject.
  runInNewContext(`${code}\nexports.isPlainObject = value => Object.getPrototypeOf(value) === Object.prototype;`, { exports, Buffer, Uint8Array, TextEncoder, URL,
    Date: { now: () => milliseconds },
    setTimeout: (callback: () => void, delay: number) => pendingRead ? setTimeout(callback, 0) : setTimeout(callback, delay), clearTimeout,
    fetch: () => { throw Error("No network is authorized in history fixtures"); },
    require(name: string) {
      if (name === "server-only") return {};
      if (name === "@stellar/stellar-sdk") return { StrKey };
      if (name === "@/lib/local-preview") return { isLocalPreview: options.preview ?? false };
      if (name === "./accountWallet") return { async readAccountWallet() { calls.owner++; return options.owner === undefined ? { ok: true, ownerId, address: viewer } : options.owner; } };
      if (name === "./circlesTestnet") return { ...associations, async readCircleDiscoveryMappings() {
        calls.mapping++;
        if (options.mappingGate) await options.mappingGate;
        if (options.mappingError) throw Error("Private metadata failure");
        if (options.hangMapping) { pendingRead = true; return await new Promise((_, reject) => late.push(reject)); }
        return options.mappings ?? [];
      } };
      if (name === "./stellar") return { CONTRACTS: { tokenXlmSac: token },
        donationCampaignId: () => options.configuredContract === undefined ? contractId : options.configuredContract,
        sc: { u64: (value: bigint) => value, u32: (value: number) => value, addr: (value: string) => value },
        async readContract(contract: string, method: string, args: unknown[] = []) {
          assert.equal(contract, contractId); calls.rpc.push({ method, args });
          if (method === "version") return options.version === undefined ? 4 : options.version;
          if (method === "token") return options.asset === undefined ? token : options.asset;
          if (method === "clock") return options.clock === undefined ? now : options.clock;
          if (method === "campaigns") {
            assert.equal(args[1], 20);
            const cursor = args[0] as bigint;
            if (cursor === options.rejectPage) throw Error("Private provider failure must not escape");
            const top = cursor === 0n ? (options.total ?? 31) : Number(cursor) - 1;
            const rows = Array.from({ length: Math.min(20, Math.max(0, top)) }, (_, i) => {
              const value = raw(BigInt(top - i)); return options.row ? options.row(value) : value;
            });
            if (cursor === options.expireAfterPage) milliseconds = 12_001;
            return options.page ? options.page(cursor, rows) : rows;
          }
          assert.equal(method, "contribution");
          const id = args[0] as bigint;
          const resolvedViewer = (options.owner as { address?: string } | undefined)?.address ?? viewer;
          assert.equal(args[1], resolvedViewer);
          if (id === options.rejectContribution) throw Error("Private contribution outage");
          calls.active++; calls.peak = Math.max(calls.peak, calls.active);
          try {
            if (id === options.hangContribution) { pendingRead = true; return await new Promise((_, reject) => late.push(reject)); }
            await Promise.resolve();
            return options.contribution ? options.contribution(id)
              : { amount: (options.donations ?? [24, 11, 8]).includes(Number(id)) ? 1_000_000_000n : 0n, refunded: (options.refunded ?? []).includes(Number(id)) };
          } finally { calls.active--; }
        } };
      throw Error(`Forbidden history dependency ${name}`);
    },
  });
  return { ...exports, calls, late };
}
function ok(result: VaultCampaignHistory) {
  if (!result.ok) assert.fail(result.error); return result;
}
const ids = (result: VaultCampaignHistory) => ok(result).campaigns.map(campaign => campaign.id);

test("personal history includes donations beyond the newest ten and twenty campaign windows", async () => {
  const h = harness(), result = ok(await h.readVaultCampaignHistory());
  assert.deepEqual(Array.from(ids(result)), ["24", "11", "8"]);
  assert.equal(result.complete, true); assert.equal(result.nextCursor, null);
  assert.equal(result.ownerId, ownerId); assert.equal(result.viewer, viewer); assert.equal(result.contractId, contractId);
  assert.equal(result.now, now.toString()); assert.equal(h.calls.owner, 1);
  assert.deepEqual(h.calls.rpc.filter(call => call.method === "campaigns").map(call => Array.from(call.args)), [[0n, 20], [12n, 20]]);
  assert.equal(h.calls.rpc.filter(call => call.method === "contribution").length, 31); assert.ok(h.calls.peak <= 4);
});

test("an unrelated newest page cannot hide the current wallet's older donations", async () => {
  const result = ok(await harness({ donations: [3, 1] }).readVaultCampaignHistory());
  assert.deepEqual(Array.from(ids(result)), ["3", "1"]); assert.equal(result.complete, true);
});

test("creator, beneficiary, approver and positive refunded donor associations are preserved once each", async () => {
  const h = harness({ total: 5, donations: [2], refunded: [2], row(value) {
    if (value.id === 5n) value.config.creator = viewer;
    if (value.id === 4n) value.config.beneficiary = viewer;
    if (value.id === 3n) value.config.approvers[0] = viewer;
    if (value.id === 2n) { value.config.creator = viewer; value.state = ["Refundable"]; }
    return value;
  } });
  const result = ok(await h.readVaultCampaignHistory());
  assert.deepEqual(Array.from(ids(result)), ["5", "4", "3", "2"]);
  assert.equal(result.campaigns.at(-1)?.contribution.refunded, true);
  assert.equal(result.campaigns.at(-1)?.contribution.amount, "1000000000");
});

test("four twenty-row pages bound each request and an exact cursor resumes without missing or duplicating history", async () => {
  const h = harness({ total: 105, donations: [101, 50, 2, 1] });
  const first = ok(await h.readVaultCampaignHistory());
  assert.deepEqual(Array.from(ids(first)), ["101", "50"]); assert.equal(first.complete, false); assert.equal(first.nextCursor, "26");
  assert.equal(h.calls.rpc.filter(call => call.method === "campaigns").length, 4);
  assert.equal(h.calls.rpc.filter(call => call.method === "contribution").length, 80);
  const second = ok(await h.readVaultCampaignHistory(first.nextCursor, ownerId));
  assert.deepEqual(Array.from(ids(second)), ["2", "1"]); assert.equal(second.complete, true); assert.equal(second.nextCursor, null);
  assert.equal(h.calls.owner, 2); assert.ok(h.calls.peak <= 4);
});

test("a later provider or contribution failure preserves whole verified pages and leaves a resumable cursor", async () => {
  for (const options of [{ rejectPage: 12n }, { rejectContribution: 11n }]) {
    const result = ok(await harness(options).readVaultCampaignHistory());
    assert.deepEqual(Array.from(ids(result)), ["24"]); assert.equal(result.complete, false); assert.equal(result.nextCursor, "12");
    assert.doesNotMatch(JSON.stringify(result), /Private|outage/);
  }
  const retry = ok(await harness().readVaultCampaignHistory("12", ownerId));
  assert.deepEqual(Array.from(ids(retry)), ["11", "8"]); assert.equal(retry.complete, true);
});

test("initial provider failure is resumable from zero, never a complete empty history", async () => {
  for (const options of [{ rejectPage: 0n }, { rejectContribution: 31n }]) {
    const result = ok(await harness(options).readVaultCampaignHistory());
    assert.equal(result.campaigns.length, 0); assert.equal(result.complete, false); assert.equal(result.nextCursor, "0");
  }
});

test("deadline expiry stops further RPCs and keeps the last whole page rather than guessing absent donations", async () => {
  const h = harness({ expireAfterPage: 12n }), result = ok(await h.readVaultCampaignHistory());
  assert.deepEqual(Array.from(ids(result)), ["24"]); assert.equal(result.nextCursor, "12"); assert.equal(result.complete, false);
  assert.equal(h.calls.rpc.filter(call => call.method === "contribution").length, 20);
});

test("pending provider promises cannot move a timeout cursor, and their late rejection is observed", async () => {
  const h = harness({ hangContribution: 11n }), result = ok(await h.readVaultCampaignHistory());
  assert.deepEqual(Array.from(ids(result)), ["24"]); assert.equal(result.nextCursor, "12"); assert.equal(result.complete, false);
  assert.equal(h.late.length, 1);
  h.late[0](Error("Late isolated rejection"));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(Array.from(ids(result)), ["24"]); assert.equal(result.nextCursor, "12");
});

test("empty deployment and a last-ID-one page are the only verified completion states", async () => {
  const empty = ok(await harness({ total: 0 }).readVaultCampaignHistory());
  assert.equal(empty.complete, true); assert.equal(empty.nextCursor, null); assert.equal(empty.campaigns.length, 0);
  for (const total of [1, 20, 21, 40, 80]) assert.equal(ok(await harness({ total }).readVaultCampaignHistory()).complete, true);
  const eightyOne = ok(await harness({ total: 81 }).readVaultCampaignHistory());
  assert.equal(eightyOne.complete, false); assert.equal(eightyOne.nextCursor, "2");
});

test("invalid selectors fail before auth or provider reads, and expectedOwner is only a consistency guard", async () => {
  for (const before of [null, {}, 1, "", "01", "-1", "1.0", " 1", "1e2", "18446744073709551616", "0?wallet=other"]) {
    const h = harness(); assert.equal((await h.readVaultCampaignHistory(before)).ok, false);
    assert.equal(h.calls.owner, 0); assert.equal(h.calls.rpc.length, 0);
  }
  for (const expected of [null, {}, 1, "", "other"]) {
    const h = harness(); assert.equal((await h.readVaultCampaignHistory("0", expected)).ok, false); assert.equal(h.calls.owner, 0);
  }
  const mismatch = harness(); assert.equal((await mismatch.readVaultCampaignHistory("0", otherOwner)).ok, false);
  assert.equal(mismatch.calls.owner, 1); assert.equal(mismatch.calls.rpc.length, 0);
});

test("preview, missing/unverified wallet and invalid deployments cannot provision or invent a personal history", async () => {
  const preview = harness({ preview: true }); assert.equal((await preview.readVaultCampaignHistory()).ok, false); assert.equal(preview.calls.owner, 0);
  for (const owner of [{ ok: false, code: "guest" }, { ok: false, code: "unavailable" }, { ok: false, code: "no_wallet", ownerId },
    { ok: true, ownerId: "invalid", address: viewer }, { ok: true, ownerId, address: "bad" },
    { ok: true, ownerId, address: StrKey.encodeContract(Buffer.alloc(32, 9)) }]) {
    const h = harness({ owner }); assert.equal((await h.readVaultCampaignHistory()).ok, false); assert.equal(h.calls.rpc.length, 0);
  }
  for (const options of [{ configuredContract: null }, { configuredContract: "bad" }, { version: 3 }, { asset: contractId }, { clock: "123" }, { clock: 0n }, { clock: 1n << 64n }]) {
    const h = harness(options); assert.equal((await h.readVaultCampaignHistory()).ok, false);
    assert.equal(h.calls.rpc.some(call => call.method === "campaigns" || call.method === "contribution"), false);
  }
});

test("malformed initial chain facts fail closed, while later malformed pages keep earlier history incomplete", async () => {
  const badRows = [(value: ReturnType<typeof raw>) => ({ ...value, id: 0n }), (value: ReturnType<typeof raw>) => ({ ...value, title: "" }),
    (value: ReturnType<typeof raw>) => ({ ...value, state: ["Unknown"] }), (value: ReturnType<typeof raw>) => ({ ...value, total: -1n }),
    (value: ReturnType<typeof raw>) => ({ ...value, escrow: value.total + 1n }), (value: ReturnType<typeof raw>) => ({ ...value, proof_hash: Buffer.alloc(31) }),
    (value: ReturnType<typeof raw>) => ({ ...value, title: "x".repeat(121) }),
    (value: ReturnType<typeof raw>) => ({ ...value, proof_url: "x".repeat(513) }),
    (value: ReturnType<typeof raw>) => ({ ...value, proof_url: "é".repeat(257) }),
    (value: ReturnType<typeof raw>) => ({ ...value, config: { ...value.config, creator: "bad" } }),
    (value: ReturnType<typeof raw>) => ({ ...value, config: { ...value.config, creator: contractId } }),
    (value: ReturnType<typeof raw>) => ({ ...value, config: { ...value.config, beneficiary: contractId } }),
    (value: ReturnType<typeof raw>) => ({ ...value, config: { ...value.config, creator_cut_bps: 1001 } }),
    (value: ReturnType<typeof raw>) => ({ ...value, config: { ...value.config, approvers: [wallet(3), wallet(3), wallet(5)] } })];
  for (const row of badRows) assert.equal((await harness({ row }).readVaultCampaignHistory()).ok, false);
  for (const contribution of [{ amount: "10", refunded: false }, { amount: -1n, refunded: false }, { amount: 1n << 127n, refunded: false }, { amount: 1n, refunded: "no" }])
    assert.equal((await harness({ contribution: () => contribution }).readVaultCampaignHistory()).ok, false);
  const later = ok(await harness({ row: value => value.id === 11n ? { ...value, state: ["Unknown"] } : value }).readVaultCampaignHistory());
  assert.deepEqual(Array.from(ids(later)), ["24"]); assert.equal(later.complete, false); assert.equal(later.nextCursor, "12");
});

test("contract-valid whitespace, contract addresses and unsafe proof URLs cannot hide unrelated personal history", async () => {
  const mutations = [(value: ReturnType<typeof raw>) => ({ ...value, title: "   " }),
    (value: ReturnType<typeof raw>) => ({ ...value, config: { ...value.config,
      creator: StrKey.encodeContract(Buffer.alloc(32, 11)), beneficiary: StrKey.encodeContract(Buffer.alloc(32, 12)),
      approvers: [StrKey.encodeContract(Buffer.alloc(32, 13)), wallet(4), wallet(5)] } }),
    ...["http://example.test/proof", "ipfs://bafy-example", "javascript:alert(1)", "not a URL", "https://user:password@example.test/proof"]
      .map(proof_url => (value: ReturnType<typeof raw>) => ({ ...value, state: ["PendingProof"], proof_hash: Buffer.alloc(32, 1), proof_url }))];
  for (const mutation of mutations) {
    const h = harness({ total: 25, donations: [24, 1], row: value => value.id === 25n ? mutation(value) : value });
    const result = ok(await h.readVaultCampaignHistory());
    assert.deepEqual(Array.from(ids(result)), ["24", "1"]); assert.equal(result.complete, true); assert.equal(result.nextCursor, null);
    assert.equal(h.calls.rpc.filter(call => call.method === "contribution").length, 25);
  }
});

test("contract-valid personal records preserve raw title and public addresses but never expose unsafe proof hrefs", async () => {
  const creator = StrKey.encodeContract(Buffer.alloc(32, 11)), beneficiary = StrKey.encodeContract(Buffer.alloc(32, 12));
  const approver = StrKey.encodeContract(Buffer.alloc(32, 13));
  for (const proof_url of ["http://example.test/proof", "ipfs://bafy-example", "javascript:alert(1)", "not a URL", "https://user:password@example.test/proof",
    `https://example.test/${"é".repeat(150)}`]) {
    const h = harness({ total: 1, donations: [1], row: value => ({ ...value, title: "   ", state: ["PendingProof"],
      config: { ...value.config, creator, beneficiary, approvers: [approver, viewer, wallet(5)] },
      approvals: [approver], proof_hash: Buffer.alloc(32, 1), proof_url }) });
    const result = ok(await h.readVaultCampaignHistory()), record = result.campaigns[0];
    assert.equal(result.complete, true); assert.equal(record.title, "   ");
    assert.equal(record.config.creator, creator); assert.equal(record.config.beneficiary, beneficiary);
    assert.deepEqual(Array.from(record.config.approvers), [approver, viewer, wallet(5)]);
    assert.deepEqual(Array.from(record.approvals), [approver]); assert.equal(record.proofHash, "01".repeat(32));
    assert.equal(record.proofUrl, ""); assert.equal(record.contribution.amount, "1000000000");
    assert.doesNotMatch(JSON.stringify(result), /javascript:|http:\/\/|ipfs:\/\/|password/);
  }
});

test("noncontiguous, repeated, escaped, oversized and short nonterminal pages never advance the cursor", async () => {
  for (const page of [(_cursor: bigint, rows: unknown[]) => [rows[0], rows[0], ...rows.slice(2)],
    (_cursor: bigint, rows: unknown[]) => [...rows].reverse(), (_cursor: bigint, rows: unknown[]) => rows.slice(0, 10),
    (_cursor: bigint, rows: unknown[]) => [...rows, raw(1n)], () => null])
    assert.equal((await harness({ page }).readVaultCampaignHistory()).ok, false);
  for (const page of [(cursor: bigint, rows: unknown[]) => cursor === 12n ? [raw(12n), ...rows.slice(1)] : rows,
    (cursor: bigint, rows: unknown[]) => cursor === 12n ? [] : rows]) {
    const result = ok(await harness({ page }).readVaultCampaignHistory());
    assert.deepEqual(Array.from(ids(result)), ["24"]); assert.equal(result.complete, false); assert.equal(result.nextCursor, "12");
  }
});

test("public projection strips injected private fields and serializes stroops losslessly", async () => {
  const result = ok(await harness({ total: 1, donations: [1], row: value => ({ ...value, ownerId: "secret", contribution: { amount: "999" },
    config: { ...value.config, secret: "secret" }, proof_url: "https://example.test/proof", proof_hash: Buffer.alloc(32, 1) }),
    contribution: () => ({ amount: 1_234_567_890_123_456_789n, refunded: false }) }).readVaultCampaignHistory());
  assert.equal(result.campaigns[0].contribution.amount, "1234567890123456789");
  assert.equal(result.campaigns[0].proofHash, "01".repeat(32)); assert.equal(result.campaigns[0].proofUrl, "https://example.test/proof");
  assert.doesNotMatch(JSON.stringify(result), /secret|999/);
});

test("catalog display links require the full reviewed configuration and preserve the original financial record", async () => {
  const value = raw(1n); value.title = "QA Circles: tino-relief";
  const mapping: StoredCircleTestnetMapping = { circleId: "tino-relief", campaignId: "1", campaignTitle: value.title,
    creatorWallet: value.config.creator, beneficiaryWallet: value.config.beneficiary, approverWallets: value.config.approvers,
    creatorCutBps: value.config.creator_cut_bps, fundingDeadline: value.config.funding_deadline.toString(), reviewDeadline: value.config.review_deadline.toString() };
  for (const spoof of [false, true]) {
    const h = harness({ total: 1, donations: [1], mappings: [mapping], row: row => ({ ...row, title: value.title,
      config: { ...row.config, creator: spoof ? wallet(9) : value.config.creator } }) });
    const result = ok(await h.readVaultCampaignHistory());
    assert.deepEqual(structuredClone(result.circleLinks), spoof ? {} : { "1": "tino-relief" });
    assert.equal(result.campaigns[0].title, value.title);
    assert.equal(result.campaigns[0].total, value.total.toString());
    assert.equal(result.campaigns[0].contribution.amount, "1000000000");
    assert.equal(h.calls.mapping, 1); assert.equal(h.calls.rpc.length, 5);
  }
});

test("missing, failed or timed-out mapping metadata never discards verified history", async () => {
  for (const options of [{}, { mappingError: true }, { hangMapping: true }]) {
    const h = harness({ ...options, total: 1, donations: [1] });
    const result = ok(await h.readVaultCampaignHistory());
    assert.deepEqual(Array.from(ids(result)), ["1"]); assert.equal(result.complete, true); assert.equal(result.nextCursor, null);
    assert.deepEqual(structuredClone(result.circleLinks), {}); assert.equal(h.calls.mapping, 1);
    assert.equal(h.calls.rpc.length, 5); assert.doesNotMatch(JSON.stringify(result), /Private metadata/);
    if (options.hangMapping) {
      assert.equal(h.late.length, 1); h.late[0](Error("Late optional metadata rejection"));
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.deepEqual(structuredClone(result.circleLinks), {});
    }
  }
});

test("history Server Action projects both mapped and empty catalog links into plain own-key objects", async () => {
  const value = raw(1n); value.title = "QA Circles: tino-relief";
  const mapping: StoredCircleTestnetMapping = { circleId: "tino-relief", campaignId: "1", campaignTitle: value.title,
    creatorWallet: value.config.creator, beneficiaryWallet: value.config.beneficiary, approverWallets: value.config.approvers,
    creatorCutBps: value.config.creator_cut_bps, fundingDeadline: value.config.funding_deadline.toString(), reviewDeadline: value.config.review_deadline.toString() };
  for (const mappings of [[mapping], []]) {
    const h = harness({ total: 1, donations: [1], mappings, row: row => ({ ...row, title: value.title }) });
    const result = ok(await h.readVaultCampaignHistory());
    assert.equal(Object.getPrototypeOf(associations.circleDiscoveryLinks(result.campaigns, mappings)), null);
    assert.equal(h.isPlainObject(result.circleLinks), true);
    assert.deepEqual(Reflect.ownKeys(result.circleLinks!), mappings.length ? ["1"] : []);
    assert.equal(Object.hasOwn(result.circleLinks!, "1"), mappings.length > 0);
    assert.equal(Object.hasOwn(result.circleLinks!, "__proto__"), false); assert.equal(Object.hasOwn(result.circleLinks!, "constructor"), false);
    if (mappings.length) {
      assert.equal(result.circleLinks?.["1"], "tino-relief"); assert.equal(Object.getOwnPropertyDescriptor(result.circleLinks, "1")?.enumerable, true);
    }
    assert.equal(result.ownerId, ownerId); assert.equal(result.viewer, viewer); assert.equal(result.complete, true);
    assert.equal(result.campaigns[0].total, value.total.toString()); assert.equal(result.campaigns[0].contribution.amount, "1000000000");
    assert.equal(h.calls.mapping, 1); assert.equal(h.calls.owner, 1); assert.equal(h.calls.rpc.length, 5);
  }
});

test("one optional mapping read overlaps the existing deployment and contribution read wave", async () => {
  let release!: () => void;
  const mappingGate = new Promise<void>(resolve => { release = resolve; });
  const h = harness({ total: 1, donations: [1], mappingGate });
  let settled = false;
  const pending = h.readVaultCampaignHistory().then(result => { settled = true; return result; });
  for (let i = 0; i < 25; i++) await Promise.resolve();
  assert.equal(h.calls.mapping, 1); assert.equal(h.calls.rpc.length, 5); assert.equal(settled, false);
  release(); const result = ok(await pending);
  assert.deepEqual(Array.from(ids(result)), ["1"]); assert.equal(result.complete, true);
});

test("different authenticated viewers and repeated requests never share personalized contribution data", async () => {
  const first = harness({ total: 1, donations: [1] }), second = harness({ total: 1, donations: [], owner: { ok: true, ownerId: otherOwner, address: wallet(8) } });
  const [a, b] = await Promise.all([first.readVaultCampaignHistory(), second.readVaultCampaignHistory()]);
  assert.deepEqual(Array.from(ids(a)), ["1"]); assert.equal(ok(b).campaigns.length, 0);
  assert.equal(ok(a).ownerId, ownerId); assert.equal(ok(b).ownerId, otherOwner);
  await first.readVaultCampaignHistory(); assert.equal(first.calls.owner, 2);
});

test("the history helper has no financial, provisioning, secret, cache or external caller-wallet dependency", () => {
  assert.match(source, /import "server-only"/); assert.match(source, /readAccountWallet/);
  assert.doesNotMatch(source, /getSigner|invokeAs|prepareAuthenticatedWallet|walletCrypto|secret_cipher|createSupabaseAdmin|unstable_cache|"use cache"/);
});
