import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as stellarSdk from "@stellar/stellar-sdk";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { AuthSessionMissingError, isAuthSessionMissingError } from "@supabase/supabase-js";
import * as money from "../lib/money.ts";

// Deterministic isolated fixtures only. No request below may use the network.
const saved = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1));
const generated = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2));
const winner = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3));
type Signer = { publicKey: string; secret: string; demo: boolean };
type Row = { public_key: string; secret_cipher: string };
type WalletApi = { getSigner(): Promise<Signer>; prepareAuthenticatedWallet(): Promise<Signer>; getAuthenticatedSigner(): Promise<Signer> };
type ReadinessApi = { ensureTestnetAccount(address: string): Promise<bigint>; getTestnetNativeBalance(address: string): Promise<bigint> };
type FixtureResponse = Response | Error | "hang";

function compile(path: string) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
function load<T>(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const sandboxModule = { exports: {} as T };
  runInNewContext(compile(path), { module: sandboxModule, exports: sandboxModule.exports, Buffer, console,
    process: { env: {} }, AbortController, setTimeout, clearTimeout,
    fetch: () => { throw new Error("External requests are prohibited in readiness tests"); },
    require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`Unstubbed dependency: ${name}`);
      return dependencies[name];
    }, ...globals });
  return sandboxModule.exports;
}
function account(address = saved.publicKey(), balance = "100.0000000") {
  return new Response(JSON.stringify({ account_id: address, balances: [{ asset_type: "native", balance }] }), { status: 200 });
}
function http(status: number) { return new Response("{}", { status }); }

function network(responses: FixtureResponse[], abortImmediately = false) {
  const queue = [...responses];
  const calls: { url: string; options: RequestInit }[] = [];
  const deadlines: number[] = [];
  let clears = 0;
  const readiness = load<ReadinessApi>("../lib/server/walletReadiness.ts", {
    "@stellar/stellar-sdk": { StrKey }, "@/lib/money": money,
  }, {
    fetch: async (url: string, options: RequestInit) => {
      calls.push({ url, options });
      assert.ok(options.signal); assert.equal(options.cache, "no-store"); assert.equal(options.redirect, "error");
      assert.ok(url.startsWith("https://horizon-testnet.stellar.org/accounts/") || url.startsWith("https://friendbot.stellar.org/?addr="));
      assert.ok(queue.length, `Unexpected request ${url}`);
      const result = queue.shift()!;
      if (result instanceof Error) throw result;
      if (result === "hang") return new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener("abort", () => reject(new Error("Isolated timeout")), { once: true });
      });
      return result;
    },
    setTimeout: (callback: () => void, ms: number) => {
      deadlines.push(ms);
      if (abortImmediately) { queueMicrotask(callback); return 1; }
      return setTimeout(callback, ms);
    },
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => { clears++; clearTimeout(timer); },
  });
  return { readiness, calls, deadlines, get clears() { return clears; }, get remaining() { return queue.length; } };
}

test("existing Testnet accounts, including actual zero/low balance, never call Friendbot", async () => {
  for (const balance of ["0.0000000", "0.0000001", "100.0000000"]) {
    const fixture = network([account(saved.publicKey(), balance)]);
    assert.equal(await fixture.readiness.ensureTestnetAccount(saved.publicKey()), money.nativeBalanceToStroops(balance));
    assert.equal(fixture.calls.length, 1); assert.equal(fixture.clears, 1); assert.deepEqual(fixture.deadlines, [4000]);
  }
});

test("only explicit Horizon404 permits funding, then readiness is confirmed on the same address", async () => {
  const fixture = network([http(404), http(200), account()]);
  assert.equal(await fixture.readiness.ensureTestnetAccount(saved.publicKey()), 1_000_000_000n);
  assert.deepEqual(fixture.calls.map(call => call.url), [
    `https://horizon-testnet.stellar.org/accounts/${saved.publicKey()}`,
    `https://friendbot.stellar.org/?addr=${saved.publicKey()}`,
    `https://horizon-testnet.stellar.org/accounts/${saved.publicKey()}`,
  ]);
  assert.equal(fixture.remaining, 0); assert.equal(fixture.clears, 3); assert.deepEqual(fixture.deadlines, [4000, 4000, 4000]);
});

test("Horizon outages, rejection and malformed successes never authorize funding or fabricate zero", async () => {
  const broken = [http(503), http(429), http(401), new Error("Isolated lost response"), new Response("not-json"),
    new Response("{}"), account(winner.publicKey()),
    new Response(JSON.stringify({ account_id: saved.publicKey(), balances: [] })),
    new Response(JSON.stringify({ account_id: saved.publicKey(), balances: [{ asset_type: "native", balance: "1.0000000" }, { asset_type: "native", balance: "2.0000000" }] })),
  ];
  for (const response of broken) {
    const fixture = network([response]);
    await assert.rejects(fixture.readiness.ensureTestnetAccount(saved.publicKey()), /unavailable/);
    assert.equal(fixture.calls.length, 1); assert.equal(fixture.clears, 1);
  }
});

test("native balance rejects non-decimal, negative, rounded extra precision and overflowing amounts", async () => {
  for (const balance of ["-1.0000000", "1e3", "NaN", "1.00000001", "01.0000000", " 1.0", "922337203685.4775808"]) {
    const fixture = network([account(saved.publicKey(), balance)]);
    await assert.rejects(fixture.readiness.getTestnetNativeBalance(saved.publicKey()), /unavailable/);
    assert.equal(fixture.calls.length, 1);
  }
  const fixture = network([account(saved.publicKey(), "922337203685.4775807")]);
  assert.equal(await fixture.readiness.getTestnetNativeBalance(saved.publicKey()), 9_223_372_036_854_775_807n);
});

test("read-only balance404 is a missing-account error, distinct from provider outage, and never funds", async () => {
  const fixture = network([http(404)]);
  await assert.rejects(fixture.readiness.getTestnetNativeBalance(saved.publicKey()), { name: "WalletAccountMissingError" });
  assert.equal(fixture.calls.length, 1);
});

test("stellar native-balance wrapper preserves true zero and propagates missing/outage instead of false zero", async () => {
  for (const [response, error] of [[account(saved.publicKey(), "0.0000000"), null], [http(404), /not yet active/], [http(503), /unavailable/]] as const) {
    const fixture = network([response]);
    const stellar = load<{ getNativeBalance(address: string): Promise<bigint> }>("../lib/server/stellar.ts", {
      "@stellar/stellar-sdk": stellarSdk, "@/lib/money": money, "@/lib/local-preview": { isLocalPreview: false },
      "@/lib/server/walletReadiness": fixture.readiness,
    });
    if (error) await assert.rejects(stellar.getNativeBalance(saved.publicKey()), error);
    else assert.equal(await stellar.getNativeBalance(saved.publicKey()), 0n);
    assert.equal(fixture.calls.length, 1);
  }
});

test("faucet HTTP rejection or lost result is accepted only after canonical-account verification", async () => {
  for (const result of [http(400), http(429), http(503), new Error("Isolated ambiguous faucet response")]) {
    const fixture = network([http(404), result, account()]);
    assert.equal(await fixture.readiness.ensureTestnetAccount(saved.publicKey()), 1_000_000_000n);
    assert.equal(fixture.calls.length, 3);
  }
});

test("faucet success alone never claims ready, rejected/unconfirmed funding is actionable", async () => {
  for (const result of [http(200), http(400), http(429), new Error("Isolated faucet timeout")]) {
    const fixture = network([http(404), result, http(404)]);
    await assert.rejects(fixture.readiness.ensureTestnetAccount(saved.publicKey()), /funding.*not.*confirmed|funding could not be confirmed/);
    assert.equal(fixture.calls.length, 3);
  }
  const fixture = network([http(404), http(200), http(503)]);
  await assert.rejects(fixture.readiness.ensureTestnetAccount(saved.publicKey()), /balance is unavailable/);
});

test("invalid or caller-shaped addresses fail before network access", async () => {
  for (const value of ["", "not-an-address", `${saved.publicKey()}?addr=another`, "https://attacker.invalid/", winner.publicKey().slice(0, -1)]) {
    const fixture = network([]);
    await assert.rejects(fixture.readiness.ensureTestnetAccount(value), /address is invalid/);
    assert.equal(fixture.calls.length, 0);
  }
});

test("network timeout is bounded and cannot be interpreted as missing/zero", async () => {
  const fixture = network(["hang"], true);
  await assert.rejects(fixture.readiness.ensureTestnetAccount(saved.publicKey()), /unavailable/);
  assert.deepEqual(fixture.deadlines, [4000]); assert.equal(fixture.calls.length, 1); assert.equal(fixture.clears, 1);
});

function walletFixture(options: { initial?: Row | null; raceWinner?: Row; responses?: FixtureResponse[];
  user?: unknown; authError?: Error; authThrows?: Error; clientThrows?: Error;
  configured?: boolean; adminConfigured?: boolean; preview?: boolean; readError?: boolean; saveError?: boolean } = {}) {
  let row = options.initial === undefined ? { public_key: saved.publicKey(), secret_cipher: `cipher:${saved.secret()}` } : options.initial;
  const net = network(options.responses ?? [account(row?.public_key ?? generated.publicKey())]);
  const calls = { mints: 0, upserts: 0, decrypts: 0, reads: 0, demos: 0, auth: 0, encrypted: 0,
    submittedRows: [] as Row[], owners: [] as unknown[] };
  const api = load<WalletApi>("../lib/server/userWallet.ts", {
    "@stellar/stellar-sdk": { Keypair: { fromSecret: (secret: string) => Keypair.fromSecret(secret), random: () => { calls.mints++; return calls.mints === 1 ? generated : winner; } } },
    "@supabase/supabase-js": { isAuthSessionMissingError },
    "@/lib/local-preview": { isLocalPreview: options.preview ?? false },
    "@/lib/server/stellar": { demoPublic: () => { calls.demos++; return "isolated-demo"; } },
    "@/lib/server/walletReadiness": net.readiness,
    "@/lib/supabase/env": { supabaseConfigured: () => options.configured ?? true, supabaseAdminConfigured: () => options.adminConfigured ?? true },
    "@/lib/supabase/server": { createSupabaseServer: async () => {
      if (options.clientThrows) throw options.clientThrows;
      return { auth: { getUser: async () => {
        calls.auth++; if (options.authThrows) throw options.authThrows;
        return { data: { user: Object.hasOwn(options, "user") ? options.user : { id: "verified-owner" } }, error: options.authError ?? null };
      } } };
    } },
    "@/lib/supabase/admin": { createSupabaseAdmin: () => ({ from: (table: string) => {
      assert.equal(table, "wallets");
      return { select: () => ({ eq: (column: string, owner: unknown) => {
        assert.equal(column, "user_id"); calls.owners.push(owner);
        return { maybeSingle: async () => { calls.reads++; return { data: row, error: options.readError ? { message: "Isolated DB error" } : null }; } };
      } }), upsert: async (value: Row & { user_id: string }, settings: { onConflict: string; ignoreDuplicates: boolean }) => {
        calls.upserts++; assert.equal(value.user_id, "verified-owner"); assert.equal(settings.onConflict, "user_id"); assert.equal(settings.ignoreDuplicates, true);
        calls.submittedRows.push({ public_key: value.public_key, secret_cipher: value.secret_cipher });
        if (!options.saveError) row ??= options.raceWinner ?? { ...value };
        return { error: options.saveError ? { message: "Isolated failed save" } : null };
      } };
    } }) },
    "@/lib/server/walletCrypto": { encryptSecret: (secret: string) => { calls.encrypted++; return `cipher:${secret}`; },
      decryptSecret: (cipher: string) => { calls.decrypts++; assert.ok(cipher.startsWith("cipher:")); return cipher.slice(7); } },
  });
  return { api, calls, net, get row() { return row; } };
}

test("strict readiness rejects guest, unconfigured, malformed and unavailable auth before custody/network", async () => {
  for (const options of [{ user: null }, { user: null, authError: new AuthSessionMissingError() },
    { configured: false }, { user: undefined }, { user: {} }, { user: { id: "" } }, { user: { id: 123 } },
    { authError: new Error("Isolated auth unavailable") }, { authThrows: new Error("Isolated auth unavailable") },
    { authThrows: new AuthSessionMissingError() }, { clientThrows: new AuthSessionMissingError() }, { preview: true }]) {
    const fixture = walletFixture(options);
    await assert.rejects(fixture.api.prepareAuthenticatedWallet());
    assert.equal(fixture.calls.demos, 0); assert.equal(fixture.calls.reads, 0); assert.equal(fixture.calls.mints, 0);
    assert.equal(fixture.calls.upserts, 0); assert.equal(fixture.net.calls.length, 0);
  }
});

test("existing canonical identities/ciphers survive readiness and zero balance without mint or funding", async () => {
  const fixture = walletFixture({ responses: [account(saved.publicKey(), "0.0000000")] });
  const before = { ...fixture.row! };
  const signer = await fixture.api.prepareAuthenticatedWallet();
  assert.equal(signer.publicKey, saved.publicKey()); assert.equal(signer.secret, saved.secret()); assert.equal(signer.demo, false);
  assert.deepEqual(fixture.row, before); assert.deepEqual(fixture.calls.owners, ["verified-owner"]);
  assert.equal(fixture.calls.mints, 0); assert.equal(fixture.calls.upserts, 0); assert.equal(fixture.calls.encrypted, 0); assert.equal(fixture.net.calls.length, 1);
});

test("new authenticated wallet is persisted before funding and uses canonical identity", async () => {
  const fixture = walletFixture({ initial: null, responses: [http(404), http(200), account(generated.publicKey())] });
  const result = await fixture.api.prepareAuthenticatedWallet();
  assert.equal(result.publicKey, generated.publicKey()); assert.equal(fixture.row!.public_key, result.publicKey);
  assert.equal(fixture.calls.mints, 1); assert.equal(fixture.calls.upserts, 1); assert.equal(fixture.calls.reads, 2);
  assert.ok(fixture.net.calls.every(call => call.url.includes(generated.publicKey())));
});

test("first-use race loser verifies/funds only persisted winner, never discarded key", async () => {
  const fixture = walletFixture({ initial: null, raceWinner: { public_key: winner.publicKey(), secret_cipher: `cipher:${winner.secret()}` },
    responses: [http(404), http(400), account(winner.publicKey())] });
  assert.equal((await fixture.api.prepareAuthenticatedWallet()).publicKey, winner.publicKey());
  assert.ok(fixture.net.calls.every(call => call.url.includes(winner.publicKey())));
  assert.equal(fixture.row!.public_key, winner.publicKey()); assert.equal(fixture.calls.mints, 1);
});

test("parallel first-use requests resolve one canonical wallet, not their two generated keypairs", async () => {
  const fixture = walletFixture({ initial: null, responses: [account(generated.publicKey()), account(generated.publicKey())] });
  const results = await Promise.all([fixture.api.prepareAuthenticatedWallet(), fixture.api.prepareAuthenticatedWallet()]);
  assert.equal(fixture.calls.mints, 2); assert.equal(fixture.calls.upserts, 2);
  assert.equal(results[0].publicKey, generated.publicKey()); assert.equal(results[1].publicKey, generated.publicKey());
  assert.equal(fixture.row!.public_key, generated.publicKey());
  assert.ok(fixture.net.calls.every(call => call.url.includes(generated.publicKey())));
});

test("failed funding retry preserves exact saved key/cipher and does not mint or replace it", async () => {
  const fixture = walletFixture({ initial: null, responses: [http(404), http(503), http(404), http(404), http(200), account(generated.publicKey())] });
  await assert.rejects(fixture.api.prepareAuthenticatedWallet(), /funding/);
  const preserved = { ...fixture.row! };
  assert.equal((await fixture.api.prepareAuthenticatedWallet()).publicKey, preserved.public_key);
  assert.deepEqual(fixture.row, preserved); assert.equal(fixture.calls.upserts, 1); assert.equal(fixture.calls.mints, 1);
  assert.equal(fixture.calls.encrypted, 1); assert.ok(fixture.net.calls.every(call => call.url.includes(preserved.public_key)));
});

test("signed-in getSigner verifies readiness, no false wallet success on Horizon failure", async () => {
  const fixture = walletFixture({ responses: [http(503)] });
  await assert.rejects(fixture.api.getSigner(), /unavailable/);
  assert.equal(fixture.calls.demos, 0); assert.equal(fixture.calls.mints, 0); assert.equal(fixture.calls.upserts, 0);
});

test("D3 authenticated signer remains read-only and never triggers readiness/funding/provisioning", async () => {
  const fixture = walletFixture({ responses: [] });
  assert.equal((await fixture.api.getAuthenticatedSigner()).publicKey, saved.publicKey());
  assert.equal(fixture.net.calls.length, 0); assert.equal(fixture.calls.mints, 0); assert.equal(fixture.calls.upserts, 0);
  const missing = walletFixture({ initial: null, responses: [] });
  await assert.rejects(missing.api.getAuthenticatedSigner(), /unavailable/);
  assert.equal(missing.net.calls.length, 0); assert.equal(missing.calls.mints, 0);
});

test("custody read/save/key mismatches stop before network readiness", async () => {
  for (const options of [{ readError: true }, { initial: null, saveError: true }, { adminConfigured: false },
    { initial: { public_key: winner.publicKey(), secret_cipher: `cipher:${saved.secret()}` } },
    { initial: { public_key: saved.publicKey(), secret_cipher: "invalid-cipher" } }]) {
    const fixture = walletFixture({ ...options, responses: [] });
    await assert.rejects(fixture.api.prepareAuthenticatedWallet());
    assert.equal(fixture.net.calls.length, 0); assert.equal(fixture.calls.demos, 0);
  }
});

type WalletState = { address: string; pesos: number; pesoLabel: string } | { ok: false; error: string };
function walletStateFixture(options: { wallet?: ReturnType<typeof walletFixture>; preview?: boolean;
  signerError?: Error; balanceError?: Error; formatError?: Error; balance?: bigint } = {}) {
  const previewWallet = { address: "isolated-preview", pesos: 500, pesoLabel: "₱500", handle: "preview" };
  const calls = { signers: 0, balances: 0, submissions: 0, db: 0 };
  function prohibited() { calls.submissions++; throw new Error("No unrelated action, signer transaction or DB write is authorized"); }
  const api = load<{ walletState(): Promise<WalletState> }>("../app/actions.ts", {
    "@/lib/server/stellar": {
      getNativeBalance: async (address: string) => {
        calls.balances++; if (options.balanceError) throw options.balanceError;
        return options.wallet ? options.wallet.net.readiness.getTestnetNativeBalance(address) : options.balance ?? 1_000_000_000n;
      },
      stroopsToPesos: (amount: bigint) => Number(amount) / 10_000_000 * 6.5,
      fmtPeso: (amount: number) => { if (options.formatError) throw options.formatError; return `₱${amount}`; },
      invokeAs: prohibited, readContract: prohibited,
    },
    "@/lib/server/userWallet": { getSigner: async () => {
      calls.signers++; if (options.signerError) throw options.signerError;
      return options.wallet ? options.wallet.api.getSigner() : { publicKey: saved.publicKey(), secret: "isolated-secret-not-public", demo: false };
    } },
    "@/lib/money": money, "./disaster-actions": {}, "@/lib/supabase/env": {},
    "@/lib/supabase/admin": { createSupabaseAdmin: () => { calls.db++; throw new Error("Unexpected DB access"); } },
    "@/lib/local-preview": { isLocalPreview: options.preview ?? false, PREVIEW_WALLET: previewWallet },
    "@/lib/arisan-list": {}, "@/lib/recipient-review": {}, "@/lib/server/xlmDeposit": {},
    "@/lib/server/walletActivity": {}, "@/lib/server/arisanCommitment": {},
  });
  return { api, calls, previewWallet };
}

test("actual walletState action keeps preview shape and performs no signer, balance or submission work", async () => {
  const fixture = walletStateFixture({ preview: true });
  assert.equal(await fixture.api.walletState(), fixture.previewWallet);
  assert.deepEqual(fixture.calls, { signers: 0, balances: 0, submissions: 0, db: 0 });
});

test("actual walletState action preserves canonical successful zero balance and old success shape", async () => {
  const wallet = walletFixture({ responses: [account(saved.publicKey(), "0.0000000"), account(saved.publicKey(), "0.0000000")] });
  const fixture = walletStateFixture({ wallet });
  const result = await fixture.api.walletState();
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { address: saved.publicKey(), pesos: 0, pesoLabel: "₱0" });
  assert.equal(fixture.calls.signers, 1); assert.equal(fixture.calls.balances, 1); assert.equal(fixture.calls.submissions, 0);
  assert.equal(wallet.calls.mints, 0); assert.equal(wallet.calls.upserts, 0);
});

test("actual walletState action returns expected fault envelope without rejecting, exposing diagnostics or fake zero", async () => {
  for (const options of [{ signerError: new Error("private secret and custody/provider detail") },
    { balanceError: new Error("private provider credential") }, { formatError: new Error("private formatting diagnostic") }]) {
    const fixture = walletStateFixture(options);
    const result = await fixture.api.walletState();
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: false, error: "Your wallet balance is unavailable." });
    assert.equal("address" in result, false); assert.equal("pesos" in result, false); assert.equal("secret" in result, false);
    assert.equal(fixture.calls.submissions, 0); assert.equal(fixture.calls.db, 0);
    if (options.signerError) assert.equal(fixture.calls.balances, 0);
  }
});

test("actual walletState readiness failure is a structured retry state, never a successful balance", async () => {
  for (const responses of [[http(503)], [http(404), http(429), http(404)]]) {
    const wallet = walletFixture({ responses });
    const fixture = walletStateFixture({ wallet });
    const result = await fixture.api.walletState();
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: false, error: "Your wallet balance is unavailable." });
    assert.equal(fixture.calls.balances, 0); assert.equal(fixture.calls.submissions, 0);
    assert.equal(wallet.calls.mints, 0); assert.equal(wallet.calls.upserts, 0);
  }
});
