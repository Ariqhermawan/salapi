import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Asset, Networks, StrKey } from "@stellar/stellar-sdk";
import { AuthSessionMissingError, isAuthSessionMissingError } from "@supabase/supabase-js";
import * as activity from "../lib/wallet-activity.ts";
import * as money from "../lib/money.ts";
import type { WalletActivityPageResult, WalletActivityResult } from "../lib/wallet-activity.ts";

const address = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7));
const other = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 8));
const contract = StrKey.encodeContract(Buffer.alloc(32, 9));
const hash = "a".repeat(64), createdAt = "2026-10-06T13:29:27Z";
const record = (overrides: Record<string, unknown> = {}) => ({ id: "100", paging_token: "100", transaction_successful: true, transaction_hash: hash,
  created_at: createdAt, type: "payment", asset_type: "native", from: address, to: other, amount: "1.0000001", ...overrides });
const sacRecord = (changes: unknown[] = [{ asset_type: "native", type: "transfer", from: address, to: other, amount: "446.1538462" }], overrides: Record<string, unknown> = {}) => record({ type: "invoke_host_function", asset_balance_changes: changes, ...overrides });
const code = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function isolated<T>(source: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const exports = {};
  runInNewContext(source, { exports, Error, URL, AbortSignal, TextDecoder, ...globals,
    require(name: string) { if (!(name in dependencies)) throw Error(`Forbidden activity dependency: ${name}`); return dependencies[name]; } });
  return exports as T;
}

test("native XLM normalization preserves exact stroops, including beyond Number precision", () => {
  assert.equal(activity.activityXlmToStroops("446.1538462"), "4461538462");
  assert.equal(activity.activityXlmToStroops("0.0000001"), "1");
  assert.equal(activity.activityXlmToStroops("9007199254.7409931"), "90071992547409931");
  assert.equal(activity.activityStroopsToXlm("4461538462"), "446.1538462");
  assert.equal(activity.activityStroopsToXlm("1"), "0.0000001");
  assert.equal(activity.activityStroopsToXlm("90071992547409931"), "9007199254.7409931");
  assert.equal(activity.activityStroopsToXlm("10000000"), "1");
});

test("malformed, negative, fractional-stroop, exponent, zero and numeric money values are rejected", () => {
  for (const raw of [null, undefined, {}, 1, -1, "0", "0.0000000", "-1", "+1", "1e4", " 1", "1 ", "01", ".1", "1.", "1.12345678", "9".repeat(33)]) assert.equal(activity.activityXlmToStroops(raw), null);
});

test("bounded uint64 pagination accepts only canonical numeric tokens", () => {
  for (const raw of ["1", "21706575735451649", "18446744073709551615"]) assert.equal(activity.isWalletActivityCursor(raw), true);
  for (const raw of [null, undefined, 1, {}, [], "0", "01", "-1", "18446744073709551616", "9".repeat(21), "100&limit=200", "https://evil.test", "now", " 1"]) assert.equal(activity.isWalletActivityCursor(raw), false);
});

test("classic payments normalize both directions and retain receipt identity", () => {
  const sent = activity.normalizeWalletActivity([record()], address)[0];
  assert.deepEqual(sent, { id: "100:payment", hash, createdAt, direction: "sent", amountStroops: "10000001", counterparty: other, kind: "payment", asset: activity.XLM_ACTIVITY_ASSET, fee: { status: "unavailable" } });
  const received = activity.normalizeWalletActivity([record()], other)[0];
  assert.equal(received.direction, "received"); assert.equal(received.counterparty, address); assert.equal(received.amountStroops, sent.amountStroops);
});

test("actual SAC-style native balance events, not classic-only payment fields, support sender and recipient", () => {
  for (const wallet of [address, other]) {
    const result = activity.normalizeWalletActivity([sacRecord()], wallet);
    assert.equal(result.length, 1); assert.equal(result[0].amountStroops, "4461538462"); assert.equal(result[0].kind, "soroban-transfer");
    assert.equal(result[0].direction, wallet === address ? "sent" : "received");
    assert.equal(result[0].counterparty, wallet === address ? other : address);
  }
});

test("SAC events preserve per-event identities and support public contract counterparties", () => {
  const changes = [{ asset_type: "native", type: "transfer", from: address, to: contract, amount: "10.0000000" },
    { asset_type: "native", type: "transfer", from: other, to: address, amount: "0.5000000" }];
  const result = activity.normalizeWalletActivity([sacRecord(changes), sacRecord(changes)], address);
  assert.equal(result.length, 2); assert.equal(result[0].counterparty, contract); assert.equal(result[1].direction, "received");
  assert.deepEqual(result.map(item => item.id), ["100:sac-0", "100:sac-1"]);
});

test("failed, non-native, unrelated, self and nontransfer records never become successful wallet payments", () => {
  assert.deepEqual(activity.normalizeWalletActivity([record({ transaction_successful: false }), record({ asset_type: "credit_alphanum4" }),
    record({ from: other, to: contract }), record({ to: address }), sacRecord([{ asset_type: "native", type: "mint", to: address, amount: "500" }]),
    sacRecord([{ asset_type: "credit_alphanum4", type: "transfer", from: address, to: other, amount: "500" }]),
    record({ type: "manage_data", source_account: address }), sacRecord([])], address), []);
});

test("history never guesses a transfer from source-account or missing SAC events", () => {
  assert.deepEqual(activity.normalizeWalletActivity([sacRecord([], { source_account: address, amount: "500", to: other })], address), []);
  assert.throws(() => activity.normalizeWalletActivity([sacRecord([], { asset_balance_changes: undefined })], address), /Missing Stellar/);
  assert.throws(() => activity.normalizeWalletActivity([sacRecord([{ asset_type: "native", type: "transfer", from: address, to: other, amount: "invalid" }])], address), /Invalid native/);
});

test("native account creation funding and path source/destination values are distinct", () => {
  assert.equal(activity.normalizeWalletActivity([record({ type: "create_account", funder: other, account: address, starting_balance: "10000.0000000" })], address)[0].amountStroops, "100000000000");
  const path = record({ type: "path_payment_strict_send", source_asset_type: "native", source_amount: "10.0000000", amount: "9.5000000" });
  assert.equal(activity.normalizeWalletActivity([path], address)[0].amountStroops, "100000000");
  assert.equal(activity.normalizeWalletActivity([path], other)[0].amountStroops, "95000000");
});

test("malformed provider receipts are errors, not an apparently empty wallet", () => {
  for (const change of [{ id: "not-a-number" }, { transaction_hash: "not-a-hash" }, { created_at: "bad-date" }, { transaction_successful: undefined }, { amount: "1.00000001" }])
    assert.throws(() => activity.normalizeWalletActivity([record(change)], address));
  assert.throws(() => activity.normalizeWalletActivity([null], address));
  assert.throws(() => activity.normalizeWalletActivity(Array.from({ length: 31 }, () => record()), address));
});

type Options = { preview?: boolean; configured?: boolean; adminConfigured?: boolean; authResult?: unknown; authThrow?: unknown;
  clientThrow?: unknown; dbResult?: unknown; dbThrow?: unknown; fetchThrow?: unknown; response?: Response; records?: unknown[]; feeReceipts?: Record<string, unknown> };
const serverCode = code("../lib/server/walletActivity.ts");
function setup(options: Options = {}) {
  const verifiedOwner = (options.authResult as { data?: { user?: { id?: string } } } | undefined)?.data?.user?.id ?? "authenticated-a";
  const calls = { auth: 0, admin: 0, tables: [] as string[], columns: [] as string[], filters: [] as unknown[], network: [] as { url: URL; init: RequestInit }[], forbidden: [] as string[] };
  const forbid = (name: string): never => { calls.forbidden.push(name); throw Error(`Forbidden ${name}`); };
  const guard = <T extends object>(value: T, label: string): T => new Proxy(value, { get(target, property, receiver) {
    return Reflect.has(target, property) ? Reflect.get(target, property, receiver) : forbid(`${label}.${String(property)}`);
  } });
  const query = guard({ select(columns: string) { calls.columns.push(columns); return query; }, eq(column: string, value: unknown) { calls.filters.push({ column, value }); return query; },
    async maybeSingle() { if ("dbThrow" in options) throw options.dbThrow; return "dbResult" in options ? options.dbResult : { data: { public_key: address }, error: null }; } }, "query");
  const api = isolated<{ currentWalletActivity(cursor?: unknown): Promise<WalletActivityResult>; readWalletActivityPage(address: string, cursor?: string | null): Promise<WalletActivityPageResult> }>(serverCode, {
    "server-only": {}, "@stellar/stellar-sdk": { StrKey }, "@supabase/supabase-js": { isAuthSessionMissingError }, "../wallet-activity": activity,
    "./walletActivityIdentity": { readActivityIdentities: async () => [] },
    "./walletActivityContext": { attachActivityContexts: (items: unknown) => items, readActivityContextTitles: async (items: unknown) => items },
    "@/lib/local-preview": { isLocalPreview: options.preview ?? false },
    "@/lib/supabase/env": { supabaseConfigured: () => options.configured ?? true, supabaseAdminConfigured: () => options.adminConfigured ?? true },
    "@/lib/supabase/server": { async createSupabaseServer() { if ("clientThrow" in options) throw options.clientThrow;
      return { auth: guard({ async getUser() { calls.auth++; if ("authThrow" in options) throw options.authThrow; return "authResult" in options ? options.authResult : { data: { user: { id: "authenticated-a" } }, error: null }; } }, "auth") }; } },
    "@/lib/supabase/admin": { createSupabaseAdmin() { calls.admin++; return guard({ from(table: string) { calls.tables.push(table); return query; } }, "admin"); } },
  }, { fetch: async (url: URL, init: RequestInit) => { calls.network.push({ url, init }); if ("fetchThrow" in options) throw options.fetchThrow;
    if (url.pathname.startsWith("/transactions/")) {
      const receipt = options.feeReceipts?.[url.pathname.split("/").at(-1)!];
      if (receipt instanceof Error) throw receipt;
      return receipt === undefined ? new Response("{}", { status: 404 }) : new Response(JSON.stringify(receipt), { status: 200 });
    }
    return options.response ?? new Response(JSON.stringify({ _embedded: { records: options.records ?? [sacRecord()] } }), { status: 200 }); } });
  async function invoke(cursor?: unknown) {
    const result = await api.currentWalletActivity(cursor);
    assert.deepEqual(calls.forbidden, []);
    assert.ok(calls.columns.every(column => column === "public_key")); assert.ok(calls.tables.every(table => table === "wallets"));
    assert.ok(calls.filters.every(filter => JSON.stringify(filter) === JSON.stringify({ column: "user_id", value: verifiedOwner })));
    return result;
  }
  return { api, invoke, calls };
}

test("actual current-wallet function authorizes verified getUser identity and selects public_key only", async () => {
  const screen = setup(); const result = await screen.invoke(); assert.equal(result.ok, true); assert.equal(result.address, address); assert.equal(result.ownerId, "authenticated-a");
  assert.equal(screen.calls.auth, 1); assert.equal(screen.calls.admin, 1); assert.equal(screen.calls.network.length, 1);
  const { url, init } = screen.calls.network[0];
  assert.equal(url.origin, "https://horizon-testnet.stellar.org"); assert.equal(url.pathname, `/accounts/${address}/payments`);
  assert.equal(url.searchParams.get("limit"), "30"); assert.equal(url.searchParams.get("include_failed"), "false"); assert.equal(url.searchParams.get("order"), "desc");
  assert.equal(url.searchParams.get("join"), "transactions");
  assert.equal(init.method, "GET"); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store"); assert.ok(init.signal);
  assert.deepEqual({ ...init.headers }, { Accept: "application/json" });
});

test("guest and confirmed missing auth sessions never query custody, demo accounts or Horizon", async () => {
  for (const options of [{ configured: false }, { authResult: { data: { user: null }, error: null } },
    { authResult: { data: { user: null }, error: new AuthSessionMissingError() } }, { authThrow: new AuthSessionMissingError() }]) {
    const screen = setup(options); const result = await screen.invoke(); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, "unauthenticated");
    assert.equal(screen.calls.admin, 0); assert.equal(screen.calls.network.length, 0);
  }
});

test("auth outage, malformed user and nonmissing auth failures fail closed without custody reads", async () => {
  for (const options of [{ clientThrow: Error("offline") }, { clientThrow: new AuthSessionMissingError() }, { authThrow: Error("offline") }, { authResult: { data: { user: {} }, error: null } },
    { authResult: { data: { user: null }, error: Error("offline") } }, { authResult: { data: { user: { id: "authenticated-a" } }, error: new AuthSessionMissingError() } }]) {
    const screen = setup(options); const result = await screen.invoke(); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, "unavailable");
    assert.equal(result.ownerId, null); assert.equal(screen.calls.admin, 0); assert.equal(screen.calls.network.length, 0);
  }
});

test("local preview and invalid action cursors stop before auth, providers or writes", async () => {
  for (const raw of ["https://evil.test", { address: other }, 1, [], "100&limit=200", ""]) {
    const screen = setup(); const result = await screen.invoke(raw); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, "invalid-cursor");
    assert.equal(screen.calls.auth, 0); assert.equal(screen.calls.admin, 0); assert.equal(screen.calls.network.length, 0);
  }
  const preview = setup({ preview: true }); const result = await preview.invoke(); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, "local-preview");
  assert.equal(preview.calls.auth, 0); assert.equal(preview.calls.network.length, 0);
});

test("signed-in no-wallet is a successful no-wallet state, never a created or funded wallet", async () => {
  const screen = setup({ dbResult: { data: null, error: null } }); const result = await screen.invoke();
  assert.equal(result.ok, true); assert.equal(result.ownerId, "authenticated-a"); assert.equal(result.address, null); if (result.ok) { assert.equal(result.items.length, 0); assert.equal(result.nextCursor, null); }
  assert.equal(screen.calls.network.length, 0);
});

test("custody read failures never appear as successful empty histories or shared demo identities", async () => {
  for (const options of [{ adminConfigured: false }, { dbThrow: Error("offline") }, { dbResult: { data: null, error: Error("offline") } }]) {
    const screen = setup(options); const result = await screen.invoke(); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, "unavailable");
    assert.equal(result.ownerId, "authenticated-a"); assert.equal(result.address, null); assert.equal(screen.calls.network.length, 0);
  }
});

test("checksum-invalid or secret-like saved wallet identities cannot become query targets", async () => {
  for (const raw of [undefined, "G".repeat(56), StrKey.encodeEd25519SecretSeed(Buffer.alloc(32, 11)), `${address} `, address.toLowerCase(), contract]) {
    const screen = setup({ dbResult: { data: { public_key: raw }, error: null } }); const result = await screen.invoke(); assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "invalid-wallet"); assert.equal(result.ownerId, "authenticated-a"); assert.equal(result.address, null); assert.equal(screen.calls.network.length, 0);
  }
});

test("provider HTTP errors, outages, missing response body, malformed JSON and huge bodies are errors", async () => {
  for (const options of [{ fetchThrow: Error("timeout") }, { response: new Response("{}", { status: 404 }) }, { response: new Response("{}", { status: 429 }) },
    { response: new Response(null, { status: 200 }) }, { response: new Response("not-json") }, { response: new Response(" ".repeat(512_001)) },
    { response: new Response(JSON.stringify({ _embedded: { records: "wrong" } })) }]) {
    const screen = setup(options); const result = await screen.invoke(); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, "unavailable");
    assert.equal(result.ownerId, "authenticated-a"); assert.equal(result.address, address);
  }
});

test("provider paging is cursor-based, strict descending and does not follow untrusted next links", async () => {
  const records = Array.from({ length: 30 }, (_, index) => record({ id: String(100 - index), paging_token: String(100 - index) }));
  const screen = setup({ records }); const result = await screen.invoke("101"); assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.nextCursor, "71");
  assert.equal(screen.calls.network[0].url.searchParams.get("cursor"), "101"); assert.equal(screen.calls.network.length, 1);
  for (const rows of [[record({ paging_token: "https://evil.test" })], [record(), record()], [record({ paging_token: "102" })]]) {
    const broken = setup({ records: rows }); assert.equal((await broken.invoke("101")).ok, false);
  }
});

test("confirmed empty Horizon page is distinct from provider failure", async () => {
  const result = await setup({ records: [] }).invoke(); assert.equal(result.ok, true);
  if (result.ok) { assert.equal(result.address, address); assert.equal(result.items.length, 0); assert.equal(result.nextCursor, null); }
});

test("native-empty pages can still have more pages without inventing history", async () => {
  const records = Array.from({ length: 30 }, (_, index) => record({ id: String(100 - index), paging_token: String(100 - index), asset_type: "credit_alphanum4" }));
  const result = await setup({ records }).invoke(); assert.equal(result.ok, true); if (result.ok) { assert.equal(result.items.length, 0); assert.equal(result.nextCursor, "71"); }
});

test("exported Server Action accepts only the cursor and delegates to the current request identity", async () => {
  const calls: unknown[] = [];
  const forbidden = new Proxy({}, { get() { return () => { throw Error("Forbidden action dependency"); }; } });
  const result: WalletActivityResult = { ok: true, ownerId: "authenticated-a", address, items: [], nextCursor: null };
  const api = isolated<{ walletActivity(cursor?: unknown, extraWallet?: string): Promise<WalletActivityResult> }>(code("../app/actions.ts"), {
    "@/lib/server/walletActivity": { async currentWalletActivity(cursor: unknown) { calls.push(cursor); return result; } },
    "@/lib/server/stellar": forbidden, "@/lib/money": money, "@/lib/server/userWallet": forbidden,
    "./disaster-actions": forbidden, "@/lib/supabase/env": forbidden, "@/lib/supabase/admin": forbidden,
    "@/lib/local-preview": { isLocalPreview: false }, "@/lib/arisan-list": forbidden, "@/lib/recipient-review": forbidden,
    "@/lib/server/xlmDeposit": forbidden, "@/lib/server/arisanCommitment": forbidden,
    "@stellar/stellar-sdk": { StrKey }, "@/lib/server/arisanAuthorization": forbidden,
  });
  assert.equal(await api.walletActivity(undefined, other), result); assert.equal(await api.walletActivity("99", other), result);
  assert.deepEqual(calls, [null, "99"]);
});

test("direct unauthenticated exported Server Action reaches actual authorization and denies custody/Horizon", async () => {
  for (const options of [{ configured: false }, { authResult: { data: { user: null }, error: null } }, { authThrow: new AuthSessionMissingError() }]) {
    const backend = setup(options);
    const forbidden = new Proxy({}, { get() { return () => { throw Error("Forbidden action dependency"); }; } });
    const api = isolated<{ walletActivity(cursor?: string): Promise<WalletActivityResult> }>(code("../app/actions.ts"), {
      "@/lib/server/walletActivity": backend.api, "@/lib/server/stellar": forbidden, "@/lib/money": money, "@/lib/server/userWallet": forbidden,
      "./disaster-actions": forbidden, "@/lib/supabase/env": forbidden, "@/lib/supabase/admin": forbidden,
      "@/lib/local-preview": { isLocalPreview: false }, "@/lib/arisan-list": forbidden, "@/lib/recipient-review": forbidden,
      "@/lib/server/xlmDeposit": forbidden, "@/lib/server/arisanCommitment": forbidden,
      "@stellar/stellar-sdk": { StrKey }, "@/lib/server/arisanAuthorization": forbidden,
    });
    const result = await api.walletActivity("99"); assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "unauthenticated");
    assert.equal(result.ownerId, null); assert.equal(result.address, null); assert.equal(backend.calls.admin, 0); assert.equal(backend.calls.network.length, 0); assert.deepEqual(backend.calls.forbidden, []);
  }
});

test("cookie-switch race binds returned history to server-verified owner B, never caller-requested owner A", async () => {
  const backend = setup({ authResult: { data: { user: { id: "authenticated-b" } }, error: null }, dbResult: { data: { public_key: other }, error: null } });
  const forbidden = new Proxy({}, { get() { return () => { throw Error("Forbidden action dependency"); }; } });
  const api = isolated<{ walletActivity(cursor?: string | null, callerOwner?: string): Promise<WalletActivityResult> }>(code("../app/actions.ts"), {
    "@/lib/server/walletActivity": backend.api, "@/lib/server/stellar": forbidden, "@/lib/money": money, "@/lib/server/userWallet": forbidden,
    "./disaster-actions": forbidden, "@/lib/supabase/env": forbidden, "@/lib/supabase/admin": forbidden,
    "@/lib/local-preview": { isLocalPreview: false }, "@/lib/arisan-list": forbidden, "@/lib/recipient-review": forbidden,
    "@/lib/server/xlmDeposit": forbidden, "@/lib/server/arisanCommitment": forbidden,
    "@stellar/stellar-sdk": { StrKey }, "@/lib/server/arisanAuthorization": forbidden,
  });
  const result = await api.walletActivity(null, "authenticated-a");
  assert.equal(result.ok, true); assert.equal(result.ownerId, "authenticated-b"); assert.equal(result.address, other);
  assert.deepEqual(backend.calls.filters.map(filter => ({ ...filter as object })), [{ column: "user_id", value: "authenticated-b" }]);
  assert.equal(backend.calls.network[0].url.pathname, `/accounts/${other}/payments`);
  if (result.ok) assert.equal(result.items[0].direction, "received");
});

test("verified owner binding survives no-wallet and signed-in provider or custody failures", async () => {
  for (const options of [{ dbResult: { data: null, error: null } }, { dbResult: { data: null, error: Error("offline") } }, { fetchThrow: Error("offline") }]) {
    const screen = setup({ ...options, authResult: { data: { user: { id: "authenticated-b" } }, error: null } });
    const result = await screen.invoke(); assert.equal(result.ownerId, "authenticated-b");
    assert.notEqual(result.ownerId, "authenticated-a");
  }
});

test("public provider reader has no session owner and performs no auth or custody lookup", async () => {
  const screen = setup({ configured: false }); const result = await screen.api.readWalletActivityPage(address);
  assert.equal(result.ok, true); assert.equal("ownerId" in result, false);
  assert.equal(screen.calls.auth, 0); assert.equal(screen.calls.admin, 0); assert.equal(screen.calls.network.length, 1);
});

test("Testnet USDC is a verified Circle issuer plus its network-derived SAC, not a USDC code alias", () => {
  assert.equal(StrKey.isValidEd25519PublicKey(activity.USDC_TESTNET_ISSUER), true);
  assert.equal(new Asset("USDC", activity.USDC_TESTNET_ISSUER).contractId(Networks.TESTNET), activity.USDC_TESTNET_SAC);
  const usdc = record({ id: "99", asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: activity.USDC_TESTNET_ISSUER, amount: "50.0000001" });
  const spoof = record({ id: "98", asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: other });
  const mainnet = record({ id: "97", asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" });
  const result = activity.normalizeWalletActivity([record(), usdc, spoof, mainnet], address);
  assert.deepEqual(result.map(item => [item.asset.code, item.amountStroops]), [["XLM", "10000001"], ["USDC", "500000001"]]);
  const incoming = activity.normalizeWalletActivity([usdc], other)[0];
  assert.equal(incoming.direction, "received"); assert.equal(incoming.asset.issuer, activity.USDC_TESTNET_ISSUER);
});

test("SAC USDC identity is issuer-bound or the verified contract, never a contradictory event", () => {
  const transfer = { type: "transfer", from: address, to: other, amount: "2.0000001" };
  const result = activity.normalizeWalletActivity([sacRecord([
    { ...transfer, asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: activity.USDC_TESTNET_ISSUER },
    { ...transfer, contract_id: activity.USDC_TESTNET_SAC },
    { ...transfer, asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: other, contract_id: activity.USDC_TESTNET_SAC },
    { ...transfer, asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: activity.USDC_TESTNET_ISSUER, contract_id: contract },
    { ...transfer, asset_type: "credit_alphanum4", asset_code: "USDC" },
  ])], address);
  assert.equal(result.length, 2); assert.ok(result.every(item => item.asset.code === "USDC" && item.amountStroops === "20000001"));
});

const transaction = (overrides: Record<string, unknown> = {}) => ({ hash, successful: true, fee_charged: "12345", fee_account: address, source_account: other, resource_fee: "99999", ...overrides });

test("actual fees are transaction-wide in XLM, independent of sender/receiver and token amount", () => {
  const joined = record({ transaction: transaction() });
  const sent = activity.normalizeWalletActivity([joined], address)[0];
  const received = activity.normalizeWalletActivity([joined], other)[0];
  assert.deepEqual(sent.fee, { status: "available", amountStroops: "12345", payer: address, paidByWallet: true, transactionHash: hash, feeBump: false });
  assert.equal(received.fee.status, "available"); if (received.fee.status === "available") assert.equal(received.fee.paidByWallet, false);
  assert.equal(sent.amountStroops, "10000001"); assert.equal(received.amountStroops, "10000001");
  const receiverPays = activity.normalizeWalletActivity([record({ transaction: transaction({ fee_account: other }) })], other)[0];
  assert.equal(receiverPays.fee.status, "available"); if (receiverPays.fee.status === "available") assert.equal(receiverPays.fee.paidByWallet, true);
});

test("self payments do not invent transfers; a real self swap retains both distinct asset movements and one fee", () => {
  assert.deepEqual(activity.normalizeWalletActivity([record({ to: address, transaction: transaction() })], address), []);
  const result = activity.normalizeWalletActivity([record({ type: "path_payment_strict_send", to: address,
    source_asset_type: "native", source_amount: "10.0000000", asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: activity.USDC_TESTNET_ISSUER, amount: "1.0000000", transaction: transaction() })], address);
  assert.deepEqual(result.map(item => [item.direction, item.asset.code, item.amountStroops]), [["sent", "XLM", "100000000"], ["received", "USDC", "10000000"]]);
  const fees = new Map(result.filter(item => item.fee.status === "available").map(item => [item.hash, item.fee]));
  assert.equal(fees.size, 1); assert.deepEqual(result[0].fee, result[1].fee);
});

test("inner zero fee is unavailable until an outer fee-bump receipt is read, never inner+outer+resource sum", () => {
  const outer = "b".repeat(64);
  assert.deepEqual(activity.normalizeWalletActivityFee(transaction({ fee_charged: "0", fee_bump_transaction: { hash: outer } }), hash, address), { status: "unavailable" });
  const result = activity.normalizeWalletActivityFee(transaction({ hash: outer, fee_account: other, fee_charged: "321", inner_transaction: { hash, fee_charged: "999" }, resource_fee: "888" }), hash, address);
  assert.deepEqual(result, { status: "available", amountStroops: "321", payer: other, paidByWallet: false, transactionHash: outer, feeBump: true });
});

test("missing, malformed, unrelated or unconfirmed fee receipts stay explicitly unavailable", () => {
  for (const raw of [undefined, {}, transaction({ fee_account: undefined }), transaction({ fee_account: contract }), transaction({ successful: false }),
    transaction({ hash: "c".repeat(64) }), transaction({ fee_charged: "1.5" }), transaction({ fee_charged: "-1" }), transaction({ fee_charged: Number.MAX_SAFE_INTEGER + 1 }),
    transaction({ fee_bump_transaction: { hash: "malformed" } }), transaction({ inner_transaction: { hash: "malformed" } })])
    assert.deepEqual(activity.normalizeWalletActivityFee(raw, hash, address), { status: "unavailable" });
});

test("joined fee reads avoid N+1 requests and missing fees never erase confirmed asset movements", async () => {
  const joined = setup({ records: [record({ transaction: transaction() })] });
  const result = await joined.invoke(); assert.equal(result.ok, true); if (result.ok) assert.equal(result.items[0].fee.status, "available");
  assert.equal(joined.calls.network.length, 1);
  const missing = await setup({ records: [record({ transaction: transaction({ fee_account: "G".repeat(56) }) })] }).invoke();
  assert.equal(missing.ok, true); if (missing.ok) { assert.equal(missing.items.length, 1); assert.equal(missing.items[0].fee.status, "unavailable"); }
});

test("outer fee-bump lookup is fixed-host, read-only and deduplicated across SAC movements", async () => {
  const outer = "b".repeat(64);
  const joined = sacRecord([{ asset_type: "native", type: "transfer", from: address, to: other, amount: "1" }, { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: activity.USDC_TESTNET_ISSUER, type: "transfer", from: other, to: address, amount: "2" }],
    { transaction: transaction({ fee_charged: "0", fee_bump_transaction: { hash: outer } }) });
  const screen = setup({ records: [joined], feeReceipts: { [outer]: transaction({ hash: outer, fee_account: other, fee_charged: "321", inner_transaction: { hash } }) } });
  const result = await screen.invoke(); assert.equal(result.ok, true);
  if (result.ok) { assert.equal(result.items.length, 2); assert.ok(result.items.every(item => item.fee.status === "available" && item.fee.amountStroops === "321" && !item.fee.paidByWallet)); }
  assert.equal(screen.calls.network.length, 2);
  assert.equal(screen.calls.network[1].url.href, `https://horizon-testnet.stellar.org/transactions/${outer}`);
  assert.equal(screen.calls.network[1].init.method, "GET"); assert.equal(screen.calls.network[1].init.redirect, "error");
  const unavailable = await setup({ records: [joined], feeReceipts: { [outer]: Error("Isolated fee outage") } }).invoke();
  assert.equal(unavailable.ok, true); if (unavailable.ok) assert.ok(unavailable.items.every(item => item.fee.status === "unavailable"));
});

test("fee-bump reads have a strict page request budget and never follow transaction links", async () => {
  const records = Array.from({ length: 12 }, (_, index) => record({ id: String(100 - index), paging_token: String(100 - index), transaction_hash: String(index + 1).padStart(64, "a"),
    transaction: transaction({ hash: String(index + 1).padStart(64, "a"), fee_charged: "0", fee_bump_transaction: { hash: String(index + 1).padStart(64, "b") }, _links: { self: { href: "https://evil.test" } } }) }));
  const screen = setup({ records }); const result = await screen.invoke(); assert.equal(result.ok, true);
  assert.equal(screen.calls.network.length, 9); assert.ok(screen.calls.network.every(call => call.url.origin === "https://horizon-testnet.stellar.org"));
  if (result.ok) assert.ok(result.items.every(item => item.fee.status === "unavailable"));
});
