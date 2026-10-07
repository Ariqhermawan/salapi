import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as sdk from "@stellar/stellar-sdk";
import * as photo from "../lib/account-photo.ts";
import { XLM_ACTIVITY_ASSET, activityUsdcEquivalent, USDC_ACTIVITY_ASSET } from "../lib/wallet-activity.ts";
import type { WalletActivityIdentity, WalletActivityItem } from "../lib/wallet-activity.ts";
import type { MarketPriceResult } from "../lib/market-prices.ts";

const wallet = (index: number) => sdk.StrKey.encodeEd25519PublicKey(Buffer.alloc(32, index));
const address = wallet(7), other = wallet(8), unrelated = wallet(9);
const uid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const googleUrl = "https://lh3.googleusercontent.com/a/fixture=s96-c";
const user = (id = uid(1), consent: unknown = false, metadata = {}) => ({ id, email: "nonimaharani@fixture.invalid",
  user_metadata: { salapi_receipt_photo_consent: consent, username: "nonimaharani", ...metadata },
  identities: [{ provider: "google", identity_data: { avatar_url: googleUrl } }] });
const item = (counterparty = other): WalletActivityItem => ({ id: "1:payment", hash: "a".repeat(64), createdAt: "2026-10-07T00:00:00Z",
  amountStroops: "10000000", direction: "received", asset: XLM_ACTIVITY_ASSET, counterparty, kind: "payment", fee: { status: "unavailable" } });
const source = readFileSync(new URL("../lib/server/walletActivityIdentity.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness(options: { rows?: { public_key: string; user_id: string }[]; users?: Record<string, ReturnType<typeof user>>;
  handles?: Record<string, string>; resolves?: Record<string, string>; dbError?: boolean; authError?: boolean; authThrows?: boolean; signUrl?: string; signError?: boolean; deadline?: boolean } = {}) {
  const calls = { columns: [] as string[], targets: [] as string[][], limit: 0, auth: [] as string[], sign: [] as string[],
    registry: [] as { method: string; argument: unknown }[], active: 0, maxActive: 0 };
  let now = Date.now();
  const users = options.users ?? { [uid(1)]: user() };
  const rows = options.rows ?? [{ public_key: other, user_id: uid(1) }];
  const handles = options.handles ?? { [other]: "verified_handle" };
  const resolves = options.resolves ?? Object.fromEntries(Object.entries(handles).map(([wallet, handle]) => [handle, wallet]));
  const query = {
    select(columns: string) { assert.equal(columns, "public_key,user_id"); calls.columns.push(columns); return query; },
    in(column: string, addresses: string[]) { assert.equal(column, "public_key"); calls.targets.push(Array.from(addresses)); return query; },
    limit(limit: number) { calls.limit = limit; return query; },
    async abortSignal(signal: AbortSignal) { assert.ok(signal instanceof AbortSignal); return { data: rows, error: options.dbError ? {} : null }; },
  };
  const admin = {
    from(table: string) { assert.equal(table, "wallets"); return query; },
    auth: { admin: { async getUserById(id: string) {
      assert.ok(rows.some(row => row.user_id === id && calls.targets[0].includes(row.public_key)), "Only confirmed mapped participants may be read");
      calls.auth.push(id);
      if (options.authThrows) throw Error("Fixture unavailable");
      if (options.deadline) now += 4001;
      return { data: { user: users[id] ?? null }, error: options.authError ? {} : null };
    } } },
    storage: { from(bucket: string) { assert.equal(bucket, photo.ACCOUNT_AVATAR_BUCKET); return {
      async createSignedUrl(path: string, seconds: number) {
        assert.equal(seconds, 300); calls.sign.push(path);
        return { data: { signedUrl: options.signUrl ?? `https://project.supabase.co/storage/v1/object/sign/account-avatars/${path}?token=fixture` }, error: options.signError ? {} : null };
      },
    }; } },
  };
  class ReadOnlyRpc {
    constructor(url: string, configuration: { timeout: number }) { assert.equal(url, "https://soroban-testnet.stellar.org"); assert.ok(configuration.timeout > 0 && configuration.timeout <= 4000); }
    async simulateTransaction(transaction: sdk.Transaction) {
      assert.equal(transaction.signatures.length, 0, "Identity reads must never sign");
      const invoke = (transaction.operations[0] as sdk.Operation.InvokeHostFunction).func.invokeContract();
      const method = invoke.functionName().toString(), argument = sdk.scValToNative(invoke.args()[0]);
      assert.ok(method === "username_of" || method === "resolve");
      calls.registry.push({ method, argument }); calls.active++; calls.maxActive = Math.max(calls.maxActive, calls.active);
      await Promise.resolve(); calls.active--;
      return { result: { retval: sdk.nativeToScVal(method === "username_of" ? handles[argument] ?? "" : resolves[argument] ?? "") } };
    }
  }
  const exports = {} as { readActivityIdentities(viewer: string, items: WalletActivityItem[], donationPhotoOwners?: ReadonlyMap<string, string>): Promise<WalletActivityIdentity[]> };
  runInNewContext(compiled, { exports, URL, AbortSignal, setTimeout, clearTimeout, Date: class extends Date { static now() { return now; } },
    require(dependency: string) {
      if (dependency === "server-only") return {};
      if (dependency === "@stellar/stellar-sdk") return { ...sdk, rpc: { Server: ReadOnlyRpc, Api: { isSimulationSuccess: (value: { result?: unknown }) => !!value.result } } };
      if (dependency === "@/lib/supabase/admin") return { createSupabaseAdmin: () => admin };
      if (dependency === "@/lib/supabase/env") return { SUPABASE_URL: "https://project.supabase.co" };
      if (dependency === "@/lib/account-photo") return photo;
      if (dependency === "./stellar") return { RPC_URL: "https://soroban-testnet.stellar.org", CONTRACTS: { usernameRegistry: "CDDINUQXTF6SHZN2ZJ36IT7P4YOJ3OZN3H6LTYHVCQ35YYO7YTAWM4G3" } };
      throw Error(`Forbidden identity dependency ${dependency}`);
    },
  });
  return { ...exports, calls };
}

test("receipt identity is reverse+forward registry verified, never inferred from email or editable nicknames", async () => {
  const h = harness(); const result = await h.readActivityIdentities(address, [item()]);
  assert.equal(result.find(identity => identity.address === other)?.handle, "verified_handle");
  assert.equal(result.find(identity => identity.address === other)?.photoUrl, null);
  assert.doesNotMatch(JSON.stringify(result), /nonimaharani|email|user_metadata|identities|user_id/);
  assert.deepEqual(h.calls.registry.filter(call => call.argument === "verified_handle"), [{ method: "resolve", argument: "verified_handle" }]);
  assert.deepEqual(h.calls.sign, []);
});

test("consent must be boolean true; absent, false, string true and numeric flags expose no photo or signed Storage URL", async () => {
  for (const consent of [undefined, false, "true", 1]) {
    const h = harness({ users: { [uid(1)]: user(uid(1), consent, { salapi_avatar_path: `${uid(1)}/${uid(10)}.jpg` }) } });
    const result = await h.readActivityIdentities(address, [item()]);
    assert.ok(result.every(identity => identity.photoUrl === null)); assert.deepEqual(h.calls.sign, []);
  }
});

test("consented verified Google account returns only the allowlisted actual photo and public identity", async () => {
  const h = harness({ users: { [uid(1)]: user(uid(1), true) } });
  const result = await h.readActivityIdentities(address, [item()]);
  assert.equal(result.find(identity => identity.address === other)?.photoUrl, googleUrl);
  assert.deepEqual(h.calls.auth, [uid(1)]); assert.deepEqual(h.calls.sign, []);
  assert.deepEqual(Object.keys(result[1]).sort(), ["address", "handle", "photoUrl"]);
});

test("private custom photo must be owned by the mapped user and signed by configured Supabase origin", async () => {
  const path = `${uid(1)}/${uid(10)}.jpg`;
  const h = harness({ users: { [uid(1)]: user(uid(1), true, { salapi_avatar_path: path }) } });
  const result = await h.readActivityIdentities(address, [item()]);
  assert.match(result[1].photoUrl!, /project\.supabase\.co\/storage\/v1\/object\/sign\/account-avatars/);
  assert.deepEqual(h.calls.sign, [path]);
  const foreign = harness({ users: { [uid(1)]: user(uid(1), true, { salapi_avatar_path: `${uid(2)}/${uid(10)}.jpg` }) } });
  await foreign.readActivityIdentities(address, [item()]); assert.deepEqual(foreign.calls.sign, []);
  for (const signUrl of ["https://evil.invalid/photo.jpg", `https://project.supabase.co/storage/v1/object/sign/account-avatars/${uid(2)}/${uid(10)}.jpg`, "javascript:alert(1)"]) {
    const bad = harness({ users: { [uid(1)]: user(uid(1), true, { salapi_avatar_path: path }) }, signUrl });
    assert.equal((await bad.readActivityIdentities(address, [item()]))[1].photoUrl, googleUrl);
  }
});

test("persisted donor photo consent shows Google photo independently of private receipt preference", async () => {
  const h = harness();
  const identities = await h.readActivityIdentities(address, [item()], new Map([[other, uid(1)]]));
  assert.equal(identities[1].photoUrl, googleUrl);
  assert.doesNotMatch(JSON.stringify(identities), /email|user_metadata|user_id|nonimaharani/);
});

test("donor photo grants bind the exact account owner and cannot fall back to receipt consent", async () => {
  for (const grants of [new Map<string, string>(), new Map([[other, uid(2)]]), new Map([[unrelated, uid(1)]])]) {
    const h = harness({ users: { [uid(1)]: user(uid(1), true) } });
    const identities = await h.readActivityIdentities(address, [item()], grants);
    assert.ok(identities.every(identity => identity.photoUrl === null));
    assert.deepEqual(h.calls.sign, []);
    assert.ok(!h.calls.targets[0].includes(unrelated));
  }
});

test("consenting donor uses their custom account photo first and Google when Storage is unavailable", async () => {
  const path = `${uid(1)}/${uid(10)}.jpg`;
  for (const signError of [false, true]) {
    const h = harness({ users: { [uid(1)]: user(uid(1), false, { salapi_avatar_path: path }) }, signError });
    const identities = await h.readActivityIdentities(address, [item()], new Map([[other, uid(1)]]));
    if (signError) assert.equal(identities[1].photoUrl, googleUrl);
    else assert.match(identities[1].photoUrl!, /\/storage\/v1\/object\/sign\/account-avatars\//);
    assert.deepEqual(h.calls.sign, [path]);
  }
});

test("stale reverse mapping, malformed handles and arbitrary provider photo URLs fail closed", async () => {
  for (const handle of ["verified_handle", "@fake", "<script>", "x"]) {
    const current = user(uid(1), true); current.identities[0].identity_data.avatar_url = "https://googleusercontent.com.evil.invalid/a";
    const h = harness({ handles: { [other]: handle }, resolves: { [handle]: unrelated }, users: { [uid(1)]: current } });
    const identities = await h.readActivityIdentities(address, [item()]);
    assert.equal(identities[1].handle, null); assert.equal(identities[1].photoUrl, null);
  }
});

test("unrelated, duplicate and malformed custody mappings cannot grant private-photo reads", async () => {
  for (const rows of [[{ public_key: unrelated, user_id: uid(1) }], [{ public_key: other, user_id: "not-a-user-id" }],
    [{ public_key: other, user_id: uid(1) }, { public_key: other, user_id: uid(2) }]]) {
    const h = harness({ rows, users: { [uid(1)]: user(uid(1), true), [uid(2)]: user(uid(2), true) } });
    const identities = await h.readActivityIdentities(address, [item()]);
    assert.ok(identities.every(identity => identity.photoUrl === null)); assert.deepEqual(h.calls.auth, []); assert.deepEqual(h.calls.sign, []);
  }
  const mismatch = harness({ users: { [uid(1)]: user(uid(2), true) } });
  assert.ok((await mismatch.readActivityIdentities(address, [item()])).every(identity => identity.photoUrl === null));
});

test("identity reads are deduplicated, bounded to twelve confirmed participants and three registry workers", async () => {
  const items = Array.from({ length: 24 }, (_, index) => item(wallet(index + 20)));
  items[0].fee = { status: "available", payer: other, amountStroops: "100", paidByWallet: false, transactionHash: "a".repeat(64), feeBump: false };
  const h = harness(); const identities = await h.readActivityIdentities(address, [...items, ...items]);
  assert.equal(identities.length, 12); assert.equal(identities[0].address, address);
  assert.equal(new Set(h.calls.targets[0]).size, 12); assert.equal(h.calls.limit, 13); assert.ok(h.calls.maxActive <= 3);
  assert.ok(h.calls.registry.length <= 24); assert.ok(h.calls.auth.length <= 12);
});

test("invalid viewer, DB/Auth outage and shared deadline preserve safe wallet fallbacks without private leakage", async () => {
  const invalid = harness(); assert.deepEqual(Array.from(await invalid.readActivityIdentities("secret-or-unknown", [item()])), []); assert.deepEqual(invalid.calls.columns, []);
  for (const options of [{ dbError: true }, { authError: true }, { authThrows: true }, { deadline: true }]) {
    const h = harness(options); const identities = await h.readActivityIdentities(address, [item()]);
    assert.ok(identities.every(identity => identity.photoUrl === null)); assert.deepEqual(h.calls.sign, []);
  }
});

const quote = (seconds = 0, status: "fresh" | "stale" = "fresh"): MarketPriceResult => {
  const updatedAt = Math.floor(Date.now() / 1000) - seconds;
  return { status, source: "CoinGecko", fetchedAt: updatedAt, assets: {
    xlm: { prices: { usd: .2, php: 12, idr: 3000, vnd: 5000 }, updatedAt }, usdc: { prices: { usd: .98, php: 58, idr: 15000, vnd: 25000 }, updatedAt },
  } };
};

test("USDC equivalent uses both market quotes and stays separate from exact transferred XLM units", () => {
  const amount = "4461538462", result = activityUsdcEquivalent(amount, XLM_ACTIVITY_ASSET, quote());
  assert.ok(result); assert.ok(Math.abs(result.amount - 446.1538462 * .2 / .98) < 1e-10); assert.equal(result.status, "fresh");
  assert.equal(activityUsdcEquivalent(amount, USDC_ACTIVITY_ASSET, quote()), null);
  const tiny = activityUsdcEquivalent("1", XLM_ACTIVITY_ASSET, quote()); assert.ok(tiny && tiny.amount > 0);
});

test("expired, malformed and missing prices never become fabricated zero USDC equivalents", () => {
  for (const prices of [quote(301), { status: "unavailable", source: "CoinGecko", reason: "provider-unavailable" } as const]) assert.equal(activityUsdcEquivalent("10000000", XLM_ACTIVITY_ASSET, prices), null);
  const malformed = quote(); if (malformed.status !== "unavailable") malformed.assets.usdc.prices.usd = 0;
  assert.equal(activityUsdcEquivalent("10000000", XLM_ACTIVITY_ASSET, malformed), null);
  for (const amount of ["-1", "1.1", "NaN", "1e8", "01"]) assert.equal(activityUsdcEquivalent(amount, XLM_ACTIVITY_ASSET, quote()), null);
  assert.equal(activityUsdcEquivalent("10000000", XLM_ACTIVITY_ASSET, quote(150))?.status, "stale");
  assert.equal(activityUsdcEquivalent("10000000", XLM_ACTIVITY_ASSET, quote(0, "stale"))?.status, "stale");
});
