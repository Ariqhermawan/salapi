import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as sdk from "@stellar/stellar-sdk";
import { AuthSessionMissingError, isAuthSessionMissingError } from "@supabase/supabase-js";
import * as donor from "../lib/campaign-donor.ts";
import { XLM_ACTIVITY_ASSET } from "../lib/wallet-activity.ts";

const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const pair = sdk.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 51));
const wallet = pair.publicKey();
const otherPair = sdk.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 52));
const otherWallet = otherPair.publicKey();
const contract = "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU";
const wrongContract = sdk.StrKey.encodeContract(Buffer.alloc(32, 23));
const token = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const origin = "https://fixture.supabase.co";
const compiled = ts.transpileModule(readFileSync(new URL("../lib/server/campaignDonors.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

type FixtureOptions = { method?: string; contract?: string; campaign?: bigint; source?: string; sourceNetwork?: string;
  donorWallet?: string; amount?: bigint; args?: sdk.xdr.ScVal[]; extraOperation?: boolean; operationSource?: string;
  eventContract?: string; eventCampaign?: bigint; eventWallet?: string; eventAmount?: bigint; eventName?: string;
  eventType?: sdk.xdr.ContractEventType; eventCount?: number; diagnosticOnly?: boolean; metaVersion?: number;
  feeBump?: boolean; status?: "SUCCESS" | "NOT_FOUND" | "FAILED"; createdAt?: unknown; wrongResult?: boolean };
function fixture(options: FixtureOptions = {}) {
  const c = options.contract ?? contract, campaign = options.campaign ?? 1n, address = options.donorWallet ?? wallet, amount = options.amount ?? 10_000_001n;
  let operation = new sdk.Contract(c).call(options.method ?? "donate", ...(options.args ?? [
    sdk.nativeToScVal(campaign, { type: "u64" }), new sdk.Address(address).toScVal(), sdk.nativeToScVal(amount, { type: "i128" }),
  ]));
  if (options.operationSource) operation = sdk.Operation.invokeHostFunction({ func: operation.body().invokeHostFunctionOp().hostFunction(), source: options.operationSource });
  const builder = new sdk.TransactionBuilder(new sdk.Account(options.source ?? wallet, "1"), { fee: "100", networkPassphrase: options.sourceNetwork ?? sdk.Networks.TESTNET }).addOperation(operation);
  if (options.extraOperation) builder.addOperation(new sdk.Contract(c).call("clock"));
  const inner = builder.setTimeout(30).build(); inner.sign(pair);
  const outer = options.feeBump ? sdk.TransactionBuilder.buildFeeBumpTransaction(otherPair, "200", inner, sdk.Networks.TESTNET) : inner;
  if (options.feeBump) outer.sign(otherPair);
  const event = new sdk.xdr.ContractEvent({ ext: new sdk.xdr.ExtensionPoint(0), contractId: sdk.StrKey.decodeContract(options.eventContract ?? c) as unknown as sdk.xdr.Hash,
    type: options.eventType ?? sdk.xdr.ContractEventType.contract(), body: new sdk.xdr.ContractEventBody(0, new sdk.xdr.ContractEventV0({
      topics: [sdk.nativeToScVal(options.eventName ?? "donated", { type: "symbol" }), sdk.nativeToScVal(options.eventCampaign ?? campaign, { type: "u64" }), new sdk.Address(options.eventWallet ?? address).toScVal()],
      data: sdk.nativeToScVal(options.eventAmount ?? amount, { type: "i128" }),
    })) });
  const events = Array.from({ length: options.eventCount ?? 1 }, () => event);
  const diagnostic = options.diagnosticOnly ? events.map(value => new sdk.xdr.DiagnosticEvent({ inSuccessfulContractCall: true, event: value })) : [];
  const committed = options.diagnosticOnly ? [] : events;
  const result = options.wrongResult ? sdk.xdr.TransactionResultResult.txFailed([]) : sdk.xdr.TransactionResultResult.txSuccess([
    sdk.xdr.OperationResult.opInner(sdk.xdr.OperationResultTr.invokeHostFunction(sdk.xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(Buffer.alloc(32)))),
  ]);
  const outerResult = options.feeBump ? sdk.xdr.TransactionResultResult.txFeeBumpInnerSuccess(new sdk.xdr.InnerTransactionResultPair({
    transactionHash: inner.hash(), result: new sdk.xdr.InnerTransactionResult({ feeCharged: sdk.xdr.Int64.fromString("100"),
      result: sdk.xdr.InnerTransactionResultResult.txSuccess(result.results()), ext: new sdk.xdr.InnerTransactionResultExt(0) }),
  })) : result;
  const meta = options.metaVersion === 4 ? new sdk.xdr.TransactionMeta(4, new sdk.xdr.TransactionMetaV4({
    ext: new sdk.xdr.ExtensionPoint(0), txChangesBefore: [], txChangesAfter: [], sorobanMeta: null, events: [], diagnosticEvents: diagnostic,
    operations: [new sdk.xdr.OperationMetaV2({ ext: new sdk.xdr.ExtensionPoint(0), changes: [], events: committed })],
  })) : new sdk.xdr.TransactionMeta(3, new sdk.xdr.TransactionMetaV3({ ext: new sdk.xdr.ExtensionPoint(0), txChangesBefore: [], operations: [], txChangesAfter: [],
    sorobanMeta: new sdk.xdr.SorobanTransactionMeta({ ext: new sdk.xdr.SorobanTransactionMetaExt(0), events: committed, returnValue: sdk.xdr.ScVal.scvVoid(), diagnosticEvents: diagnostic }),
  }));
  const hash = outer.hash().toString("hex");
  const response = { status: options.status ?? "SUCCESS", txHash: hash, latestLedger: 100, latestLedgerCloseTime: 1_791_333_600,
    oldestLedger: 1, oldestLedgerCloseTime: 1_791_330_000, ledger: 99, createdAt: Object.hasOwn(options, "createdAt") ? options.createdAt : 1_791_333_600,
    applicationOrder: 1, feeBump: options.feeBump ?? false, envelopeXdr: outer.toEnvelope(), resultMetaXdr: meta,
    resultXdr: new sdk.xdr.TransactionResult({ feeCharged: sdk.xdr.Int64.fromString("100"), result: outerResult, ext: new sdk.xdr.TransactionResultExt(0) }),
    events: { transactionEventsXdr: [], contractEventsXdr: [events] },
  } as sdk.rpc.Api.GetTransactionResponse;
  return { hash, response };
}

function defaultRow(receipt = fixture()) { return { id: 1, network: "testnet", contract_id: contract, campaign_id: "1", transaction_hash: receipt.hash,
  donor_wallet: wallet, owner_id: owner, amount_stroops: "10000001", ledger: 99, created_at: "2026-10-06T02:00:00.000Z",
  anonymous: false, public_profile_ok: false, comment: "Thank you" }; }
type Options = { preview?: boolean; configured?: boolean; url?: string; contractId?: string | null; owner?: unknown; anonymousAuth?: unknown;
  authError?: unknown; authThrows?: unknown; factoryThrows?: boolean; wallet?: unknown; walletError?: unknown; status?: FixtureOptions;
  network?: string; version?: number; token?: string; rpcThrows?: boolean; current?: unknown; rowError?: unknown;
  rows?: unknown[]; insertError?: unknown; saveThrowsAfterPersist?: boolean; corruptSaved?: boolean; raceRow?: unknown; identityThrows?: boolean };
function harness(options: Options = {}) {
  const receipt = fixture(options.status);
  let stored: unknown = options.current ?? null;
  const calls = { auth: 0, wallet: 0, receiptReads: 0, inserts: [] as Record<string, unknown>[], rpc: 0, network: 0,
    deployment: [] as string[], profiles: [] as { viewer: string; items: unknown[]; photoOwners: [string, string][] }[], columns: [] as string[], filters: [] as [string, unknown][], cursors: [] as string[] };
  const admin = {
    from(table: string) {
      let inserted: Record<string, unknown> | null = null;
      let limit = 0, before = "";
      const query = {
        select(columns: string) { calls.columns.push(columns); if (table === "wallets") assert.equal(columns, "public_key", "No custody secrets"); else assert.equal(table, "campaign_donors"); return query; },
        eq(key: string, value: unknown) { calls.filters.push([key, value]); return query; },
        abortSignal(signal: AbortSignal) { assert.ok(signal); return query; },
        order(key: string, options: unknown) { assert.equal(key, "id"); assert.deepEqual(structuredClone(options), { ascending: false }); return query; },
        limit(count: number) { assert.ok(count === 11 || count === 250); limit = count; return query; },
        lt(key: string, value: string) { assert.equal(key, "id"); calls.cursors.push(value); before = value; return query; },
        insert(value: Record<string, unknown>) { inserted = structuredClone(value); calls.inserts.push(inserted); return query; },
        async maybeSingle() {
          if (table === "wallets") { calls.wallet++; return { data: options.wallet === null ? null : { public_key: options.wallet ?? wallet }, error: options.walletError ?? null }; }
          calls.receiptReads++; return { data: stored, error: options.rowError ?? null };
        },
        async single() {
          assert.ok(inserted);
          if (options.raceRow) { stored = options.raceRow; return { data: null, error: { code: "23505" } }; }
          if (options.insertError) return { data: null, error: options.insertError };
          stored = { ...inserted, id: 1 };
          if (options.saveThrowsAfterPersist) throw Error("Save response interrupted");
          return { data: options.corruptSaved ? { ...(stored as object), amount_stroops: "900000000" } : stored, error: null };
        },
        then(resolve: (value: unknown) => unknown) {
          const rows = options.rows ?? [];
          const data = limit === 250 ? rows.filter(row => !before || BigInt((row as { id: number }).id) < BigInt(before)).slice(0, limit) : rows;
          return Promise.resolve({ data, error: options.rowError ?? null }).then(resolve);
        },
      };
      return query;
    },
  };
  const exports = {} as {
    verifyCampaignDonationReceipt: typeof import("../lib/server/campaignDonors.ts").verifyCampaignDonationReceipt;
    recordCampaignDonor(inputId: unknown, input: unknown): Promise<donor.CampaignDonorRecordResult>;
    readCampaignDonors(inputId: unknown, before?: unknown): Promise<donor.CampaignDonorFeedResult>;
    readCampaignDonorSummary(inputId: unknown, total: unknown): Promise<donor.CampaignDonorSummaryResult>;
  };
  runInNewContext(compiled, { exports, Buffer, URL, TextEncoder, AbortSignal, Date, setTimeout, clearTimeout, fetch: () => { throw Error("No real network"); },
    require(name: string) {
      if (name === "server-only") return {};
      if (name === "@stellar/stellar-sdk") return { ...sdk, rpc: { ...sdk.rpc, Server: class {
        async getNetwork() { calls.network++; return { passphrase: options.network ?? sdk.Networks.TESTNET }; }
        async getTransaction(hash: string) { assert.equal(hash, receipt.hash); calls.rpc++; if (options.rpcThrows) throw Error("RPC unavailable"); return receipt.response; }
      } } };
      if (name === "@supabase/supabase-js") return { isAuthSessionMissingError, createClient(url: string, secret: string, config: unknown) { assert.equal(url, origin); assert.equal(secret, "fixture-service-key"); assert.ok(config); return admin; } };
      if (name === "@/lib/supabase/server") return { createSupabaseServer: async () => { if (options.factoryThrows) throw Error("Factory unavailable"); return { auth: { getUser: async () => {
        calls.auth++; if (options.authThrows) throw options.authThrows;
        return { data: { user: options.owner === null ? null : { id: options.owner ?? owner, is_anonymous: options.anonymousAuth ?? false } }, error: options.authError ?? null };
      } } }; } };
      if (name === "@/lib/supabase/env") return { SUPABASE_URL: options.url ?? origin, SUPABASE_SERVICE_ROLE: "fixture-service-key", supabaseConfigured: () => options.configured ?? true, supabaseAdminConfigured: () => options.configured ?? true };
      if (name === "@/lib/local-preview") return { isLocalPreview: options.preview ?? false };
      if (name === "@/lib/server/stellar") return { CONTRACTS: { tokenXlmSac: token }, RPC_URL: "https://rpc.fixture.invalid", donationCampaignId: () => options.contractId === undefined ? contract : options.contractId,
        txLink: (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`, readContract: async (_contract: string, method: string) => { calls.deployment.push(method); return method === "version" ? options.version ?? 4 : options.token ?? token; } };
      if (name === "@/lib/server/walletActivityIdentity") return { readActivityIdentities: async (viewer: string, items: unknown[], photoOwners: ReadonlyMap<string, string>) => {
        calls.profiles.push({ viewer, items: structuredClone(items), photoOwners: structuredClone(Array.from(photoOwners)) }); if (options.identityThrows) throw Error("Optional identity unavailable");
        return [{ address: wallet, handle: "confirmed_handle", photoUrl: "https://lh3.googleusercontent.com/fixture-photo" }];
      } };
      if (name === "@/lib/wallet-activity") return { XLM_ACTIVITY_ASSET };
      if (name === "@/lib/campaign-donor") return donor;
      throw Error(`Unexpected import ${name}`);
    },
  });
  return { ...exports, calls, receipt, saved: () => stored };
}
function input(h = harness(), values: Partial<donor.CampaignDonorInput> = {}): donor.CampaignDonorInput {
  return { hash: h.receipt.hash, expectedOwnerId: owner, comment: "Thank you", anonymous: false, publicProfileOk: false, ...values };
}

test("pure donor input accepts explicit public opt-in and refuses client financial proof fields", () => {
  const valid = input(); assert.deepEqual(donor.parseCampaignDonorInput(valid), valid);
  for (const key of ["amount", "wallet", "contractId", "status", "user_id", "email"]) assert.equal(donor.parseCampaignDonorInput({ ...valid, [key]: "forged" }), null);
  assert.equal(donor.parseCampaignDonorInput({ ...valid, anonymous: true, publicProfileOk: true }), null);
  assert.equal(donor.parseCampaignDonorInput({ ...valid, publicProfileOk: undefined }), null);
});
test("strict bounded campaign, hash, cursor and plain-text comment validation", () => {
  for (const value of ["", "0", "01", "-1", "18446744073709551616", "1?or=all", 1]) assert.equal(donor.canonicalDonorCampaignId(value), null);
  assert.equal(donor.canonicalDonorCampaignId("18446744073709551615"), "18446744073709551615");
  for (const value of ["", "0", "01", "9223372036854775808", "https://evil.invalid", 1]) assert.equal(donor.campaignDonorCursor(value), false);
  for (const value of ["a".repeat(63), "A".repeat(64), "0".repeat(64), "a".repeat(65)]) assert.equal(donor.campaignDonorHash(value), false);
  assert.equal(donor.campaignDonorComment("  Hello\nworld  "), "Hello\nworld");
  assert.equal(donor.campaignDonorComment("x".repeat(501)), null); assert.equal(donor.campaignDonorComment("あ".repeat(167)), null);
  assert.equal(donor.campaignDonorComment("name\u202Efake"), null); assert.equal(donor.campaignDonorComment("x\u0000y"), null);
});
test("real SDK envelope and committed D4 event provide exact per-transaction amount", () => {
  const h = harness(); const value = h.verifyCampaignDonationReceipt(h.receipt.response, h.receipt.hash, contract, "1", wallet);
  assert.ok(value); assert.equal(value.amountStroops, "10000001"); assert.equal(value.ledger, 99);
});
test("actual RPC epoch-seconds string shape verifies with metadata v4 and fee-bump envelopes", () => {
  for (const options of [{ metaVersion: 4 }, { metaVersion: 4, feeBump: true }]) {
    const h = harness({ status: { ...options, createdAt: "1791346527" } });
    const value = h.verifyCampaignDonationReceipt(h.receipt.response, h.receipt.hash, contract, "1", wallet, 1_791_346_527_000);
    assert.ok(value); assert.equal(value.createdAt, "2026-10-07T04:15:27.000Z"); assert.equal(value.amountStroops, "10000001");
  }
});
test("receipt timestamp normalization rejects malformed, noncanonical and unsafe values", () => {
  for (const createdAt of ["", "0", "01791346527", " 1791346527", "1791346527 ", "+1791346527", "-1791346527",
    "1791346527.0", "1.791346527e9", "0x6ac5c25f", "1791346527x", "9007199254740992", "9".repeat(100),
    0, -1, 1_791_346_527.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER, null, undefined, true, {}]) {
    const h = harness({ status: { createdAt } });
    assert.equal(h.verifyCampaignDonationReceipt(h.receipt.response, h.receipt.hash, contract, "1", wallet, 1_791_346_527_000), null);
  }
});
test("numeric and string receipt timestamps retain the exact five-minute future guard", () => {
  for (const createdAt of [1_791_346_827, "1791346827", 1_791_346_828, "1791346828"]) {
    const h = harness({ status: { createdAt } });
    const value = h.verifyCampaignDonationReceipt(h.receipt.response, h.receipt.hash, contract, "1", wallet, 1_791_346_527_000);
    assert.equal(value !== null, Number(createdAt) === 1_791_346_827);
  }
});
test("SDK timestamp strings persist normalized receipt metadata and retry only the existing record", async () => {
  const h = harness({ status: { metaVersion: 4, createdAt: "1791346527" } });
  const first = await h.recordCampaignDonor("1", input(h)); assert.ok(first.ok); assert.equal(first.status, "recorded");
  assert.equal(h.calls.inserts[0].created_at, "2026-10-07T04:15:27.000Z");
  const second = await h.recordCampaignDonor("1", input(h)); assert.ok(second.ok); assert.equal(second.status, "already_recorded");
  assert.equal(h.calls.inserts.length, 1); assert.equal(h.calls.rpc, 1);
});
for (const [name, options] of Object.entries({
  "different contract": { contract: wrongContract }, "different method": { method: "refund" }, "different campaign": { campaign: 2n },
  "different donor": { donorWallet: otherWallet }, "different transaction source": { source: otherWallet }, "different operation source": { operationSource: otherWallet },
  "mainnet hash": { sourceNetwork: sdk.Networks.PUBLIC }, "multiple operations": { extraOperation: true }, "zero amount": { amount: 0n }, "negative amount": { amount: -1n },
  "mismatched event amount": { eventAmount: 500_000_000n }, "mismatched event donor": { eventWallet: otherWallet }, "mismatched event campaign": { eventCampaign: 2n },
  "mismatched event contract": { eventContract: wrongContract }, "wrong event": { eventName: "refund" }, "no event": { eventCount: 0 },
  "duplicate event": { eventCount: 2 }, "diagnostic event only": { diagnosticOnly: true }, "too many events": { eventCount: 257 },
  "future receipt": { createdAt: 9_999_999_999 }, "inconsistent result": { wrongResult: true },
} satisfies Record<string, FixtureOptions>)) test(`receipt verification rejects ${name}`, () => {
  const h = harness({ status: options }); assert.equal(h.verifyCampaignDonationReceipt(h.receipt.response, h.receipt.hash, contract, "1", wallet), null);
});
test("committed metadata v4 and sponsored fee-bump receipts are supported", () => {
  for (const options of [{ metaVersion: 4 }, { feeBump: true }, { metaVersion: 4, feeBump: true }]) {
    const h = harness({ status: options }); assert.ok(h.verifyCampaignDonationReceipt(h.receipt.response, h.receipt.hash, contract, "1", wallet));
  }
});
test("client supplied hash must match both RPC identity and Testnet SDK envelope", () => {
  const h = harness(); assert.equal(h.verifyCampaignDonationReceipt(h.receipt.response, "a".repeat(64), contract, "1", wallet), null);
  const changed = { ...h.receipt.response, txHash: "b".repeat(64) }; assert.equal(h.verifyCampaignDonationReceipt(changed, h.receipt.hash, contract, "1", wallet), null);
});
test("verified owner records one actual receipt without accepting client amount or secret access", async () => {
  const h = harness(); const result = await h.recordCampaignDonor("1", input(h)); assert.ok(result.ok); assert.equal(result.status, "recorded");
  assert.equal(h.calls.inserts.length, 1); assert.equal(h.calls.inserts[0].amount_stroops, "10000001"); assert.equal(h.calls.inserts[0].donor_wallet, wallet);
  assert.equal(h.calls.rpc, 1); assert.equal(h.calls.network, 1); assert.equal(h.calls.profiles.length, 0);
});
for (const [name, options, code] of [
  ["guest", { owner: null }, "unauthenticated"], ["anonymous Auth", { anonymousAuth: true }, "unauthenticated"],
  ["unverified anonymous flag", { anonymousAuth: "false" }, "unauthenticated"], ["bad UID", { owner: "not-a-uuid" }, "unauthenticated"],
  ["auth error with user", { authError: Error("Auth unavailable") }, "unavailable"], ["auth throw", { authThrows: Error("Auth unavailable") }, "unavailable"],
  ["missing session", { owner: null, authError: new AuthSessionMissingError() }, "unauthenticated"], ["auth factory throw", { factoryThrows: true }, "unavailable"],
  ["missing saved wallet", { wallet: null }, "no_wallet"], ["bad wallet", { wallet: "not-a-wallet" }, "unavailable"], ["wallet read failure", { walletError: {} }, "unavailable"],
  ["local preview", { preview: true }, "local_preview"], ["unconfigured", { configured: false }, "not_configured"], ["invalid deployment", { contractId: null }, "not_configured"],
] as [string, Options, donor.CampaignDonorCode][]) test(`metadata action blocks ${name} before RPC or insert`, async () => {
  const h = harness(options); const result = await h.recordCampaignDonor("1", input(h)); assert.ok(!result.ok); assert.equal(result.code, code);
  assert.equal(h.calls.rpc, 0); assert.equal(h.calls.inserts.length, 0);
});
test("reviewed owner cannot be substituted after account switch", async () => {
  const h = harness({ owner: other }); const result = await h.recordCampaignDonor("1", input(h)); assert.ok(!result.ok); assert.equal(result.code, "account_changed"); assert.equal(h.calls.rpc, 0);
});
test("metadata anonymous records require explicit false public profile consent", async () => {
  const h = harness(); const result = await h.recordCampaignDonor("1", input(h, { anonymous: true })); assert.ok(result.ok);
  assert.equal(h.calls.inserts[0].anonymous, true); assert.equal(h.calls.inserts[0].public_profile_ok, false);
});
for (const [name, options, code] of [
  ["pending or expired RPC receipt", { status: { status: "NOT_FOUND" } }, "confirmation_unavailable"], ["failed transaction", { status: { status: "FAILED" } }, "failed_receipt"],
  ["RPC unavailable", { rpcThrows: true }, "confirmation_unavailable"], ["wrong network", { network: sdk.Networks.PUBLIC }, "receipt_mismatch"],
  ["wrong contract version", { version: 3 }, "confirmation_unavailable"], ["wrong token", { token: wrongContract }, "confirmation_unavailable"],
  ["forged amount event", { status: { eventAmount: 99n } }, "receipt_mismatch"],
] as [string, Options, donor.CampaignDonorCode][]) test(`never persists ${name} as confirmed`, async () => {
  const h = harness(options); const result = await h.recordCampaignDonor("1", input(h)); assert.ok(!result.ok); assert.equal(result.code, code); assert.equal(result.donationConfirmed, false); assert.equal(h.calls.inserts.length, 0);
});
test("immutable duplicate reconciles same owner without RPC or comment/visibility overwrite", async () => {
  const row = defaultRow(); const h = harness({ current: row, rpcThrows: true });
  const result = await h.recordCampaignDonor("1", input(h, { comment: "Changed", anonymous: true })); assert.ok(result.ok); assert.equal(result.status, "already_recorded");
  assert.equal(h.calls.rpc, 0); assert.equal(h.calls.inserts.length, 0); assert.equal((h.saved() as typeof row).comment, "Thank you");
});
for (const [name, row] of [ ["other donor", { ...defaultRow(), owner_id: other }], ["other wallet", { ...defaultRow(), donor_wallet: otherWallet }],
  ["other campaign", { ...defaultRow(), campaign_id: "2" }], ["wrong amount format", { ...defaultRow(), amount_stroops: "1.0" }],
] as [string, ReturnType<typeof defaultRow>][]) test(`no hash replay or metadata reassignment for ${name}`, async () => {
  const h = harness({ current: row }); const result = await h.recordCampaignDonor("1", input(h)); assert.ok(!result.ok); assert.equal(result.code, "receipt_mismatch"); assert.equal(h.calls.inserts.length, 0);
});
test("atomic unique race can only reconcile a canonical owner receipt", async () => {
  const h = harness({ raceRow: defaultRow() }); const result = await h.recordCampaignDonor("1", input(h)); assert.ok(result.ok); assert.equal(result.status, "already_recorded");
  const foreign = harness({ raceRow: { ...defaultRow(), owner_id: other } }); const denied = await foreign.recordCampaignDonor("1", input(foreign)); assert.ok(!denied.ok); assert.equal(denied.code, "receipt_mismatch");
});
test("lost DB save response is metadata-only retry and reuses immutable receipt", async () => {
  const h = harness({ saveThrowsAfterPersist: true }); const first = await h.recordCampaignDonor("1", input(h)); assert.ok(!first.ok);
  assert.equal(first.code, "metadata_unavailable"); assert.equal(first.donationConfirmed, true); assert.equal(first.retryMetadataOnly, true);
  const second = await h.recordCampaignDonor("1", input(h)); assert.ok(second.ok); assert.equal(second.status, "already_recorded"); assert.equal(h.calls.inserts.length, 1); assert.equal(h.calls.rpc, 1);
});
for (const options of [{ rowError: { code: "PGRST205" } }, { insertError: { code: "42P01" } }]) test("missing SQL setup is explicit after independently confirmed donation", async () => {
  const h = harness(options); const result = await h.recordCampaignDonor("1", input(h)); assert.ok(!result.ok); assert.equal(result.code, "not_configured"); assert.equal(result.donationConfirmed, true); assert.equal(result.retryMetadataOnly, true);
});
test("generic DB failure and corrupted persisted response cannot become successful metadata", async () => {
  for (const options of [{ insertError: { code: "500" } }, { corruptSaved: true }]) {
    const h = harness(options); const result = await h.recordCampaignDonor("1", input(h)); assert.ok(!result.ok); assert.equal(result.code, "metadata_unavailable"); assert.equal(result.donationConfirmed, true);
  }
});
test("anonymous public projection excludes all identity and linked hash fields", async () => {
  const row = { ...defaultRow(), anonymous: true, public_profile_ok: false };
  const h = harness({ rows: [row] }); const result = await h.readCampaignDonors("1"); assert.ok(result.ok); const item = result.entries[0];
  assert.equal(item.badge, "confirmed_testnet"); assert.equal(item.amountStroops, "10000001"); assert.equal(item.donor, null); assert.equal(item.hash, null); assert.equal(item.link, null);
  const serialized = JSON.stringify(result); for (const secret of [wallet, row.transaction_hash, owner, "secret_cipher", "email"]) assert.ok(!serialized.includes(secret));
  assert.match(result.anonymityNotice, /transactions remain public/); assert.equal(h.calls.profiles.length, 0); assert.equal(h.calls.auth, 0);
});
test("private receipt consent alone never publishes donor handle or photo", async () => {
  const h = harness({ rows: [defaultRow()] }); const result = await h.readCampaignDonors("1"); assert.ok(result.ok);
  assert.equal(result.entries[0].donor?.address, wallet); assert.equal(result.entries[0].donor?.handle, null); assert.equal(result.entries[0].donor?.photoUrl, null); assert.equal(h.calls.profiles.length, 0);
});
test("optional identity failure never hides a confirmed financial donation", async () => {
  const h = harness({ rows: [{ ...defaultRow(), public_profile_ok: true }], identityThrows: true }); const result = await h.readCampaignDonors("1"); assert.ok(result.ok);
  assert.equal(result.entries[0].donor?.address, wallet); assert.equal(result.entries[0].donor?.handle, null); assert.equal(result.entries[0].badge, "confirmed_testnet");
});
test("explicit public-profile opt-in only enriches confirmed nonanonymous participants", async () => {
  const h = harness({ rows: [{ ...defaultRow(), id: 2, public_profile_ok: true }, { ...defaultRow(), id: 1, donor_wallet: otherWallet, anonymous: true }] });
  const result = await h.readCampaignDonors("1"); assert.ok(result.ok); assert.equal(result.entries[0].donor?.handle, "confirmed_handle");
  assert.equal(result.entries[1].donor, null); assert.equal(h.calls.profiles.length, 1); assert.ok(!JSON.stringify(h.calls.profiles).includes(otherWallet));
  assert.deepEqual(h.calls.profiles[0].photoOwners, [[wallet, owner]]);
  assert.match(result.entries[0].donor!.photoUrl!, /googleusercontent/);
});

test("missing or conflicting persisted donor owners cannot grant account-photo access", async () => {
  for (const rows of [[{ ...defaultRow(), public_profile_ok: true, owner_id: null }],
    [{ ...defaultRow(), id: 2, public_profile_ok: true }, { ...defaultRow(), id: 1, public_profile_ok: true, owner_id: other }]]) {
    const h = harness({ rows }); const result = await h.readCampaignDonors("1"); assert.ok(result.ok);
    assert.deepEqual(h.calls.profiles[0].photoOwners, []);
  }
});
test("feed is scoped and bounded by a validated data cursor", async () => {
  const rows = Array.from({ length: 11 }, (_, index) => ({ ...defaultRow(), id: 20 - index, transaction_hash: (20 - index).toString(16).padStart(64, "0") }));
  const h = harness({ rows }); const result = await h.readCampaignDonors("1", "21"); assert.ok(result.ok); assert.equal(result.entries.length, 10); assert.equal(result.nextCursor, "11");
  assert.deepEqual(h.calls.cursors, ["21"]); assert.ok(h.calls.filters.some(([key, value]) => key === "contract_id" && value === contract));
  const denied = await h.readCampaignDonors("1", "21?or=true"); assert.ok(!denied.ok); assert.equal(denied.code, "invalid_cursor");
});
for (const [name, rows] of [
  ["wrong scope", [{ ...defaultRow(), campaign_id: "2" }]], ["unsafe numeric identity", [{ ...defaultRow(), id: Number.MAX_SAFE_INTEGER + 1 }]],
  ["duplicate cursor", [defaultRow(), defaultRow()]], ["ascending rows", [{ ...defaultRow(), id: 1 }, { ...defaultRow(), id: 2 }]],
  ["too many rows", Array.from({ length: 12 }, (_, i) => ({ ...defaultRow(), id: 20 - i }))],
  ["conflicting privacy flags", [{ ...defaultRow(), anonymous: true, public_profile_ok: true }]],
] as [string, unknown[]][]) test(`public feed rejects ${name}`, async () => {
  const h = harness({ rows }); const result = await h.readCampaignDonors("1"); assert.ok(!result.ok); assert.equal(result.code, "unavailable"); assert.equal(h.calls.profiles.length, 0);
});
test("feed fails explicitly when schema is missing", async () => {
  const h = harness({ rowError: { code: "PGRST205" } }); const result = await h.readCampaignDonors("1"); assert.ok(!result.ok); assert.equal(result.code, "not_configured");
});
test("schema recipe denies client reads, no public view, immutable unique receipt", () => {
  const sql = readFileSync(new URL("../supabase/campaign_donors.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/i); assert.match(sql, /revoke all on public\.campaign_donors from public, anon, authenticated, service_role;/i);
  assert.match(sql, /revoke all on sequence public\.campaign_donors_id_seq from public, anon, authenticated, service_role;/i);
  assert.match(sql, /unique \(network, contract_id, transaction_hash\)/i); assert.match(sql, /grant select, insert on public\.campaign_donors to service_role/i);
  assert.match(sql, /revoke update, delete on public\.campaign_donors from service_role/i); assert.doesNotMatch(sql, /create (?:or replace )?(?:view|function)/i);
  assert.match(sql, /public_profile_ok boolean not null default false/i);
});

test("summary scans beyond the feed page and counts one account across repeated and anonymous confirmed receipts", async () => {
  const rows = Array.from({ length: 251 }, (_, index) => ({ ...defaultRow(), id: 251 - index,
    transaction_hash: (251 - index).toString(16).padStart(64, "0"), anonymous: index % 2 === 0 }));
  const h = harness({ rows }); const result = await h.readCampaignDonorSummary("1", String(251n * 10_000_001n));
  assert.ok(result.ok); assert.equal(result.count, 1); assert.equal(result.basis, "accounts"); assert.equal(result.coverage, "complete");
  assert.deepEqual(h.calls.cursors, ["2"]); assert.equal(h.calls.auth, 0); assert.equal(h.calls.profiles.length, 0); assert.equal(h.calls.rpc, 0);
  for (const secret of [wallet, owner, rows[0].transaction_hash, "comment", "email", "photo"]) assert.ok(!JSON.stringify(result).includes(secret));
  const queries = h.calls.columns.length;
  assert.deepEqual(await h.readCampaignDonorSummary("1", String(251n * 10_000_001n)), result); assert.equal(h.calls.columns.length, queries, "Same total uses bounded count-only cache");
});

test("summary includes anonymous accounts and merges ownerless historical wallet rows safely", async () => {
  const rows = [{ ...defaultRow(), id: 4, transaction_hash: "4".padStart(64, "0"), owner_id: null },
    { ...defaultRow(), id: 3, transaction_hash: "3".padStart(64, "0"), anonymous: true },
    { ...defaultRow(), id: 2, transaction_hash: "2".padStart(64, "0"), owner_id: other, donor_wallet: otherWallet, anonymous: true },
    { ...defaultRow(), id: 1, transaction_hash: "1".padStart(64, "0") }];
  const result = await harness({ rows }).readCampaignDonorSummary("1", String(4n * 10_000_001n));
  assert.ok(result.ok); assert.equal(result.count, 2); assert.equal(result.basis, "accounts"); assert.equal(result.coverage, "complete");
  const fallback = await harness({ rows: [{ ...defaultRow(), owner_id: null }] }).readCampaignDonorSummary("1", "10000001");
  assert.ok(fallback.ok); assert.equal(fallback.count, 1); assert.equal(fallback.basis, "wallets");
});

test("metadata coverage is exact only when all recorded amounts reconcile with confirmed cumulative total", async () => {
  const empty = await harness().readCampaignDonorSummary("1", "0"); assert.ok(empty.ok); assert.equal(empty.count, 0); assert.equal(empty.coverage, "complete");
  const missing = await harness().readCampaignDonorSummary("1", "10000001"); assert.ok(missing.ok); assert.equal(missing.count, 0); assert.equal(missing.coverage, "recorded");
  const partial = await harness({ rows: [defaultRow()] }).readCampaignDonorSummary("1", "20000002"); assert.ok(partial.ok); assert.equal(partial.count, 1); assert.equal(partial.coverage, "recorded");
  const ahead = await harness({ rows: [defaultRow()] }).readCampaignDonorSummary("1", "0"); assert.ok(!ahead.ok); assert.equal(ahead.code, "unavailable");
});

test("incomplete bounded scans and corrupt donor records never become an exact public count", async () => {
  const rows = Array.from({ length: 5000 }, (_, index) => ({ ...defaultRow(), id: 5000 - index, transaction_hash: (5000 - index).toString(16).padStart(64, "0") }));
  const result = await harness({ rows }).readCampaignDonorSummary("1", String(5000n * 10_000_001n)); assert.ok(!result.ok); assert.equal(result.code, "unavailable");
  for (const rows of [[{ ...defaultRow(), campaign_id: "2" }], [{ ...defaultRow(), amount_stroops: "01" }],
    [{ ...defaultRow(), id: 2 }, defaultRow()]]) {
    const result = await harness({ rows }).readCampaignDonorSummary("1", "20000002"); assert.ok(!result.ok); assert.equal(result.code, "unavailable");
  }
  const missing = await harness({ rowError: { code: "PGRST205" } }).readCampaignDonorSummary("1", "0"); assert.ok(!missing.ok); assert.equal(missing.code, "not_configured");
});
