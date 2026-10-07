import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import * as helpers from "../lib/campaign-updates.ts";

const ownerId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const updateId = "33333333-3333-4333-8333-333333333333";
const outboxId = "44444444-4444-4444-8444-444444444444";
const lease = "55555555-5555-4555-8555-555555555555";
const providerId = "66666666-6666-4666-8666-666666666666";
const subscriptionId = "77777777-7777-4777-8777-777777777777";
const wallet = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 51)).publicKey();
const otherWallet = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 52)).publicKey();
const contract = "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU";
const token = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const diagnostics = "PRIVATE_DB_PROVIDER_DIAGNOSTICS recipient@example.invalid";
const user = { id: ownerId, is_anonymous: false, email: " Owner@Example.invalid ", email_confirmed_at: "2026-10-07T00:00:00Z" };
const recipient = { id: otherId, is_anonymous: false, email: "recipient@example.invalid", email_confirmed_at: "2026-10-07T00:00:00Z" };
const publish = { campaignId: "7", expectedOwnerId: ownerId, idempotencyKey: updateId, title: "QA delivery update", body: "QA testing only. No real-world delivery is claimed.", publicAcknowledged: true };
const dispatch = { campaignId: "7", expectedOwnerId: ownerId, updateId };
const subscription = { campaignId: "7", expectedOwnerId: ownerId, subscribed: true, notifyOk: true };
const outbox = { id: outboxId, lease_token: lease, user_id: otherId, recipient_email: recipient.email,
  subscription_id: subscriptionId, subject: "[QA Testnet] QA delivery update", email_text: "Immutable QA content", sender: "Salapi QA <qa@example.invalid>", first_attempt_at: new Date().toISOString() };
const code = ts.transpileModule(readFileSync(new URL("../lib/server/campaignUpdates.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
type Options = {
  user?: unknown; authError?: unknown; authThrows?: boolean; configured?: boolean; adminConfigured?: boolean; preview?: boolean;
  wallet?: unknown; walletError?: unknown; mapping?: boolean; rawValid?: boolean; version?: unknown; token?: unknown;
  dbError?: unknown; subscribeSaved?: unknown; unsubscribeSaved?: unknown; published?: unknown; finishSaved?: unknown;
  provider?: boolean; providerStatus?: number; providerBody?: unknown; providerThrows?: boolean; recipient?: unknown; recipientError?: unknown; finishThrows?: boolean;
  consent?: boolean; claims?: Record<string, unknown>[]; updateOwned?: boolean; publicRows?: Record<string, unknown>[];
};
type Api = {
  readCampaignUpdateSubscription(input: unknown): Promise<Record<string, unknown>>;
  setCampaignUpdateSubscription(input: unknown): Promise<Record<string, unknown>>;
  readPublicCampaignUpdates(input: unknown): Promise<Record<string, unknown>>;
  publishCampaignUpdate(input: unknown): Promise<Record<string, unknown>>;
  dispatchCampaignUpdateEmails(input: unknown): Promise<Record<string, unknown>>;
};
function setup(options: Options = {}) {
  const calls = { auth: 0, walletReads: 0, reads: [] as string[], columns: [] as { table: string; columns: string }[],
    rpc: [] as { name: string; input: Record<string, unknown> }[], requests: [] as { url: string; headers: Record<string, string>; body: string }[], logs: 0 };
  const db = {
    from(table: string) {
      let columns = "", filters: Record<string, unknown> = {};
      const result = () => {
        if (table === "wallets") { calls.walletReads++; return { data: { public_key: options.wallet ?? wallet }, error: options.walletError ?? null }; }
        if (table === "circles_testnet_campaigns") return { data: options.mapping === false ? null : { approved: true }, error: options.dbError ?? null };
        if (table === "campaign_update_subscriptions") return { data: { user_id: otherId, email: recipient.email, active: options.consent ?? true, notify_ok: true, revoked_at: null }, error: options.dbError ?? null };
        if (table === "campaign_updates") return columns === "id,creator_wallet,published_by"
          ? { data: options.updateOwned === false ? null : { id: updateId, creator_wallet: wallet, published_by: ownerId }, error: options.dbError ?? null }
          : { data: options.publicRows ?? [{ id: updateId, campaign_id: "7", title: publish.title, body: publish.body, published_at: "2026-10-07T00:00:00Z", email: diagnostics, recipient_email: diagnostics, published_by: ownerId }], error: options.dbError ?? null };
        if (table === "campaign_update_outbox") return { data: [], count: 0, error: options.dbError ?? null };
        throw new Error(`Unexpected table ${table} ${JSON.stringify(filters)}`);
      };
      const query = {
        select(value: string) { columns = value; calls.columns.push({ table, columns }); return query; },
        eq(key: string, value: unknown) { filters[key] = value; return query; },
        match(value: Record<string, unknown>) { filters = { ...filters, ...value }; return query; },
        is(key: string, value: unknown) { filters[key] = value; return query; },
        order() { return query; }, limit() { return query; }, in() { return query; },
        async maybeSingle() { return result(); },
        then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); },
      };
      return query;
    },
    async rpc(name: string, input: Record<string, unknown>) {
      calls.rpc.push({ name, input });
      if (name === "campaign_updates_finish" && options.finishThrows) throw new Error(diagnostics);
      const data = name === "campaign_updates_subscribe" ? options.subscribeSaved ?? true
        : name === "campaign_updates_unsubscribe" ? options.unsubscribeSaved ?? true
        : name === "campaign_updates_publish" ? options.published ?? updateId
        : name === "campaign_updates_claim" ? options.claims ?? [{ ...outbox }]
        : name === "campaign_updates_finish" ? options.finishSaved ?? true : null;
      return { data, error: options.dbError ?? null };
    },
    auth: { admin: { async getUserById(id: unknown) { assert.equal(id, otherId); return { data: { user: Object.hasOwn(options, "recipient") ? options.recipient : recipient }, error: options.recipientError ?? null }; } } },
  };
  const exports = {} as Api;
  runInNewContext(code, {
    exports, URL, AbortSignal, setTimeout, clearTimeout, Date, process: { env: options.provider ? { RESEND_API_KEY: "synthetic_test_key", CAMPAIGN_UPDATES_FROM: "Salapi QA <qa@example.invalid>" } : {} },
    console: { log() { calls.logs++; }, error() { calls.logs++; }, warn() { calls.logs++; } },
    async fetch(url: string, init: { headers: Record<string, string>; body: string }) {
      assert.equal(url, "https://api.resend.com/emails");
      calls.requests.push({ url, headers: init.headers, body: init.body });
      if (options.providerThrows) throw new Error(diagnostics);
      const status = options.providerStatus ?? 200;
      return { ok: status >= 200 && status < 300, status, headers: { get: () => "120" }, async json() { return options.providerBody ?? { id: providerId }; } };
    },
    require(name: string) {
      if (name === "server-only") return {};
      if (name === "@stellar/stellar-sdk") return { StrKey };
      if (name === "@supabase/supabase-js") return { createClient() { return db; } };
      if (name === "@/lib/supabase/env") return { SUPABASE_URL: "https://isolated-supabase.invalid", SUPABASE_SERVICE_ROLE: "synthetic_service_key", supabaseConfigured: () => options.configured ?? true, supabaseAdminConfigured: () => options.adminConfigured ?? true };
      if (name === "@/lib/supabase/server") return { async createSupabaseServer() { return { auth: { async getUser() { calls.auth++; if (options.authThrows) throw new Error(diagnostics); return { data: { user: Object.hasOwn(options, "user") ? options.user : user }, error: options.authError ?? null }; } } }; } };
      if (name === "@/lib/local-preview") return { isLocalPreview: options.preview ?? false };
      if (name === "@/lib/server/stellar") return { CONTRACTS: { tokenXlmSac: token }, donationCampaignId: () => contract, sc: { u64: (id: bigint) => id }, async readContract(_id: string, method: string) { calls.reads.push(method); return method === "version" ? options.version ?? 4 : method === "token" ? options.token ?? token : { creator: wallet }; } };
      if (name === "@/lib/circles/testnet") return { validatedCircleTestnetMapping(row: unknown) { return row ? { campaignId: "7", creatorWallet: wallet } : null; }, validatedCircleTestnetCampaign() { return options.rawValid === false ? null : { valid: true }; } };
      if (name === "@/lib/campaign-updates") return helpers;
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return { api: exports, calls };
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

test("subscription takes server-verified email and canonical wallet, never client override", async () => {
  const { api, calls } = setup();
  const result = await api.setCampaignUpdateSubscription({ ...subscription, email: "attacker@example.invalid", wallet: otherWallet, contractId: "attacker", network: "mainnet" });
  assert.deepEqual(plain(result), { ok: true, subscribed: true, providerConfigured: false });
  const rpc = calls.rpc[0];
  assert.equal(rpc.name, "campaign_updates_subscribe"); assert.equal(rpc.input.p_email, "owner@example.invalid");
  assert.equal(rpc.input.p_wallet, wallet); assert.equal(rpc.input.p_contract, contract); assert.equal(rpc.input.p_network, "testnet");
  assert.equal(calls.requests.length, 0); assert.equal(calls.logs, 0);
});
test("opt-in requires literal consent and owner binding before writing", async () => {
  for (const notifyOk of [undefined, false, "true", 1, {}]) {
    const { api, calls } = setup();
    assert.equal((await api.setCampaignUpdateSubscription({ ...subscription, notifyOk })).ok, false);
    assert.equal(calls.auth, 0); assert.equal(calls.rpc.length, 0);
  }
  const { api, calls } = setup();
  assert.equal((await api.setCampaignUpdateSubscription({ ...subscription, expectedOwnerId: otherId })).ok, false);
  assert.equal(calls.rpc.length, 0);
});
test("guest, anonymous, malformed, unconfirmed, and auth error with user are denied before wallet access", async () => {
  for (const options of [{ user: null }, { user: { ...user, is_anonymous: true } }, { user: { ...user, is_anonymous: undefined } },
    { user: { ...user, id: "malformed" } }, { user: { ...user, email_confirmed_at: null } },
    { user: { ...user, email: "malformed" } }, { authError: { message: diagnostics } }, { authThrows: true },
    { configured: false }, { preview: true }]) {
    const { api, calls } = setup(options);
    assert.equal((await api.setCampaignUpdateSubscription(subscription)).ok, false);
    assert.equal((await api.publishCampaignUpdate(publish)).ok, false);
    assert.equal(calls.walletReads, 0); assert.equal(calls.rpc.length, 0); assert.equal(calls.requests.length, 0); assert.equal(calls.logs, 0);
  }
});
test("QA mapping, exact D4 config, version and native asset are mandatory", async () => {
  for (const options of [{ mapping: false }, { rawValid: false }, { version: 3 }, { token: "wrong-token" }]) {
    const { api, calls } = setup(options);
    assert.equal((await api.setCampaignUpdateSubscription(subscription)).ok, false);
    assert.equal((await api.publishCampaignUpdate(publish)).ok, false);
    assert.equal((await api.readPublicCampaignUpdates("7")).ok, false);
    assert.equal(calls.rpc.length, 0); assert.equal(calls.requests.length, 0);
  }
});
test("wallet failures block subscription and creator controls, never provision/sign", async () => {
  for (const options of [{ wallet: "invalid" }, { walletError: { message: diagnostics } }, { adminConfigured: false }]) {
    const { api, calls } = setup(options);
    assert.equal((await api.setCampaignUpdateSubscription(subscription)).ok, false);
    assert.equal((await api.publishCampaignUpdate(publish)).ok, false);
    assert.equal(calls.rpc.length, 0); assert.equal(calls.requests.length, 0);
  }
});
test("owner can unsubscribe without email confirmation, wallet or live mapping", async () => {
  const { api, calls } = setup({ user: { ...user, email_confirmed_at: null }, wallet: "invalid", mapping: false, rawValid: false });
  assert.deepEqual(plain(await api.setCampaignUpdateSubscription({ ...subscription, subscribed: false, notifyOk: false })), { ok: true, subscribed: false, providerConfigured: false });
  assert.equal(calls.rpc[0].name, "campaign_updates_unsubscribe"); assert.equal(calls.rpc[0].input.p_user, ownerId);
  assert.equal(calls.walletReads, 0); assert.equal(calls.reads.length, 0); assert.equal(calls.requests.length, 0);
});
test("read subscription exposes only current owner's verified email, and provider absence is honest", async () => {
  const { api, calls } = setup();
  const result = await api.readCampaignUpdateSubscription("7");
  assert.equal(result.ok, true); assert.equal(result.email, "owner@example.invalid"); assert.equal(result.ownerId, ownerId);
  assert.equal(result.providerConfigured, false); assert.equal(calls.requests.length, 0);
});
test("public updates serialize only public text, not private DB recipient/UID fields", async () => {
  const { api, calls } = setup({ user: null });
  const result = await api.readPublicCampaignUpdates("7");
  assert.equal(result.ok, true); const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /recipient@example|PRIVATE|published_by|11111111/);
  const rows = result.updates as Record<string, unknown>[];
  assert.equal(rows[0].verifiedProof, false); assert.equal(rows[0].label, "QA Testnet organizer update");
  assert.deepEqual(Object.keys(rows[0]).sort(), ["body", "campaignId", "id", "label", "publishedAt", "title", "verifiedProof"]);
  assert.equal(calls.auth, 0); assert.equal(calls.walletReads, 0); assert.equal(calls.requests.length, 0);
});
test("publishing is current on-chain creator only with public acknowledgement and stable request ID", async () => {
  const { api, calls } = setup();
  const result = await api.publishCampaignUpdate(publish);
  assert.deepEqual(plain(result), { ok: true, updateId, published: true, emailStatus: "queued", providerConfigured: false });
  assert.equal(calls.rpc[0].name, "campaign_updates_publish"); assert.equal(calls.rpc[0].input.p_update, updateId);
  assert.match(String(calls.rpc[0].input.p_email_text), /QA exercise/); assert.equal(calls.requests.length, 0);
  for (const variant of [{ ...publish, publicAcknowledged: "true" }, { ...publish, idempotencyKey: "bad" }, { ...publish, expectedOwnerId: otherId }]) {
    assert.equal((await api.publishCampaignUpdate(variant)).ok, false);
  }
  const other = setup({ wallet: otherWallet }); assert.equal((await other.api.publishCampaignUpdate(publish)).ok, false);
  assert.equal(other.calls.rpc.length, 0);
});
test("database failures never claim persisted opt-in/publication or expose diagnostics", async () => {
  for (const options of [{ dbError: { message: diagnostics } }, { subscribeSaved: false, unsubscribeSaved: false, published: null }]) {
    const { api, calls } = setup(options);
    const result = await api.setCampaignUpdateSubscription(subscription);
    assert.equal(result.ok, false); assert.doesNotMatch(JSON.stringify(result), /PRIVATE|recipient@example/);
    assert.equal(calls.logs, 0); assert.equal(calls.requests.length, 0);
  }
});
test("dispatch cannot send without provider config and does not consume outbox leases", async () => {
  const { api, calls } = setup();
  const result = await api.dispatchCampaignUpdateEmails(dispatch);
  assert.equal(result.ok, false); assert.equal(result.unavailable, true); assert.match(String(result.error), /not configured/);
  assert.equal(calls.rpc.length, 0); assert.equal(calls.requests.length, 0);
});
test("provider acceptance is recorded with deterministic key, private single recipient and immutable payload", async () => {
  const { api, calls } = setup({ provider: true });
  const result = await api.dispatchCampaignUpdateEmails(dispatch);
  assert.equal(result.ok, true); assert.equal(result.accepted, 1); assert.equal(result.deliveryVerified, false);
  assert.equal(calls.rpc[0].input.p_limit, 5);
  assert.equal(calls.requests[0].headers["Idempotency-Key"], `campaign-update/${outboxId}`);
  assert.deepEqual(JSON.parse(calls.requests[0].body), { from: outbox.sender, to: [recipient.email], subject: outbox.subject, text: outbox.email_text });
  const finished = calls.rpc.find(row => row.name === "campaign_updates_finish")!;
  assert.equal(finished.input.p_status, "accepted"); assert.equal(finished.input.p_provider_id, providerId); assert.equal(finished.input.p_lease, lease);
  assert.doesNotMatch(JSON.stringify(result), /recipient@example|synthetic_test_key|provider_id/); assert.equal(calls.logs, 0);
});
test("uncertain timeout, 5xx, 429 and malformed success use unknown, not false success", async () => {
  for (const options of [{ providerThrows: true }, { providerStatus: 503 }, { providerStatus: 429 }, { providerBody: { secret: diagnostics } }, { providerStatus: 408 }]) {
    const { api, calls } = setup({ provider: true, ...options });
    const result = await api.dispatchCampaignUpdateEmails(dispatch);
    assert.equal(result.ok, true); assert.equal(result.accepted, 0); assert.equal(result.unknown, 1);
    assert.equal(calls.rpc.at(-1)!.input.p_status, "unknown"); assert.ok(calls.rpc.at(-1)!.input.p_retry_after);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE|recipient@example/); assert.equal(calls.logs, 0);
  }
});
test("provider 4xx rejection is not claimed accepted, and failed finish remains unknown", async () => {
  const rejected = setup({ provider: true, providerStatus: 422 });
  const result = await rejected.api.dispatchCampaignUpdateEmails(dispatch);
  assert.equal(result.rejected, 1); assert.equal(result.accepted, 0); assert.equal(rejected.calls.rpc.at(-1)!.input.p_retry_after, null);
  const uncertain = setup({ provider: true, finishSaved: false });
  const uncertainResult = await uncertain.api.dispatchCampaignUpdateEmails(dispatch);
  assert.equal(uncertainResult.accepted, 0); assert.equal(uncertainResult.unknown, 1);
  const failure = setup({ provider: true, finishThrows: true });
  const failureResult = await failure.api.dispatchCampaignUpdateEmails(dispatch);
  assert.equal(failureResult.ok, false); assert.match(String(failureResult.error), /Some requests may have been accepted/);
  assert.doesNotMatch(String(failureResult.error), /No email was sent|PRIVATE|recipient@example/);
});
test("unsubscribe, changed or unconfirmed recipient identity prevents sending", async () => {
  for (const options of [{ consent: false }, { recipient: null }, { recipient: { ...recipient, email: "changed@example.invalid" } },
    { recipient: { ...recipient, is_anonymous: true } }, { recipient: { ...recipient, email_confirmed_at: null } }]) {
    const { api, calls } = setup({ provider: true, ...options });
    const result = await api.dispatchCampaignUpdateEmails(dispatch);
    assert.equal(result.cancelled, 1); assert.equal(calls.requests.length, 0); assert.equal(calls.rpc.at(-1)!.input.p_status, "cancelled");
  }
  const unavailable = setup({ provider: true, recipientError: { message: diagnostics } });
  const result = await unavailable.api.dispatchCampaignUpdateEmails(dispatch);
  assert.equal(result.unknown, 1); assert.equal(unavailable.calls.requests.length, 0);
});
test("wrong creator or wrong update owner cannot dispatch", async () => {
  for (const options of [{ wallet: otherWallet }, { updateOwned: false }]) {
    const { api, calls } = setup({ provider: true, ...options });
    assert.equal((await api.dispatchCampaignUpdateEmails(dispatch)).ok, false); assert.equal(calls.rpc.length, 0); assert.equal(calls.requests.length, 0);
  }
});
test("expired uncertain or malformed/oversized batch fails closed with no provider send", async () => {
  for (const claims of [[{ ...outbox, first_attempt_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }],
    [{ ...outbox, id: "malformed" }], [{ ...outbox, recipient_email: "malformed" }], Array.from({ length: 6 }, () => ({ ...outbox }))]) {
    const { api, calls } = setup({ provider: true, claims });
    const result = await api.dispatchCampaignUpdateEmails(dispatch);
    assert.ok(result.ok === false || result.unknown === 1); assert.equal(calls.requests.length, 0);
  }
});
test("normal retry has the exact same provider idempotency key and JSON body", async () => {
  const first = setup({ provider: true, providerThrows: true }); await first.api.dispatchCampaignUpdateEmails(dispatch);
  const retry = setup({ provider: true }); await retry.api.dispatchCampaignUpdateEmails(dispatch);
  assert.equal(first.calls.requests[0].body, retry.calls.requests[0].body);
  assert.equal(first.calls.requests[0].headers["Idempotency-Key"], retry.calls.requests[0].headers["Idempotency-Key"]);
});
test("email helper enforces canonical u64 campaign IDs, private text, bounded payload, and retry retention", () => {
  for (const id of ["0", "07", "-1", "1x", "18446744073709551616", 7, undefined]) assert.throws(() => helpers.campaignUpdateId(id));
  assert.equal(helpers.campaignUpdateId("18446744073709551615"), "18446744073709551615");
  for (const value of ["", "x\u0000y", "x".repeat(121), "subject\nheader"]) assert.throws(() => helpers.campaignUpdateText(value, 120));
  assert.equal(helpers.campaignUpdateEmail(" Abc@Example.invalid "), "abc@example.invalid");
  assert.equal(helpers.campaignUpdateEmail("bad\r\n@example.invalid"), null);
  assert.throws(() => helpers.campaignEmailIdempotencyKey("bad"));
  const now = Date.now();
  assert.equal(helpers.campaignEmailRetryAllowed(null, now), true);
  assert.equal(helpers.campaignEmailRetryAllowed(new Date(now - helpers.CAMPAIGN_EMAIL_RETRY_WINDOW_MS + 1).toISOString(), now), true);
  assert.equal(helpers.campaignEmailRetryAllowed(new Date(now - helpers.CAMPAIGN_EMAIL_RETRY_WINDOW_MS).toISOString(), now), false);
  assert.equal(helpers.campaignEmailRetryAllowed(new Date(now + 1).toISOString(), now), false);
  assert.equal(helpers.campaignEmailRetryAllowed("invalid", now), false);
});
test("SQL recipe keeps private service-only RLS tables and atomic lease/idempotency boundaries", () => {
  const sql = readFileSync(new URL("../supabase/campaign_updates.sql", import.meta.url), "utf8");
  for (const table of ["campaign_update_subscriptions", "campaign_updates", "campaign_update_outbox"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /revoke all on public\.campaign_update_subscriptions, public\.campaign_updates, public\.campaign_update_outbox from public, anon, authenticated/);
  assert.match(sql, /as restrictive for all to anon, authenticated using \(false\) with check \(false\)/);
  assert.equal((sql.match(/language plpgsql security invoker set search_path = ''/g) ?? []).length, 5);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(sql, /for update of o skip locked/); assert.match(sql, /lease_token = p_lease/);
  assert.match(sql, /interval '23 hours'/); assert.match(sql, /status = 'needs_review'/);
  assert.match(sql, /unique \(update_id, subscription_id\)/); assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /existing\.title = p_title and existing\.body = p_body/);
  assert.match(sql, /sender = coalesce\(o\.sender,p_sender\)/);
  assert.doesNotMatch(sql, /create table.*circles_waitlist|update.*circles_waitlist/i);
});
