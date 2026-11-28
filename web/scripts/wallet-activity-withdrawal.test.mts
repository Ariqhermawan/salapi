import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { StrKey } from "@stellar/stellar-sdk";
import type { WalletActivityItem } from "../lib/wallet-activity.ts";

const address = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7));
const recipient = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 8));
const ownerId = "123e4567-e89b-42d3-a456-426614174000";
const hash = "a".repeat(64);
const base = (overrides: Partial<WalletActivityItem> = {}): WalletActivityItem => ({
  id: "100:payment", hash, createdAt: "2026-10-06T13:29:22Z", direction: "sent", amountStroops: "10000000",
  counterparty: recipient, kind: "payment", asset: { code: "XLM", issuer: null, contractId: null, decimals: 7, network: "testnet" },
  fee: { status: "unavailable" }, ...overrides,
});
const compiled = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function loadTags(options: { rows?: unknown[]; writeError?: unknown; readError?: unknown } = {}) {
  const calls: { table?: string; upsert?: unknown; onConflict?: string; filters: Array<[string, string, unknown]> } = { filters: [] };
  const query = {
    upsert(value: unknown, config: { onConflict?: string }) {
      calls.upsert = value; calls.onConflict = config.onConflict;
      return Promise.resolve({ error: options.writeError ?? null });
    },
    select(columns: string) { assert.equal(columns, "transaction_hash"); return this; },
    eq(column: string, value: string) { calls.filters.push(["eq", column, value]); return this; },
    in(column: string, values: string[]) {
      calls.filters.push(["in", column, values]);
      return Promise.resolve({ data: options.rows ?? [], error: options.readError ?? null });
    },
  };
  const exports = {};
  runInNewContext(compiled("../lib/server/walletActivityWithdrawal.ts"), {
    exports, Error, Promise, Set, Array, RegExp,
    require(name: string) {
      if (name === "server-only") return {};
      if (name === "@/lib/supabase/admin") return { createSupabaseAdmin: () => ({ from(table: string) { calls.table = table; return query; } }) };
      throw Error(`Unexpected withdrawal-label dependency: ${name}`);
    },
  });
  return { api: exports as {
    recordWalletWithdrawalLabel(input: { ownerId: string; walletAddress: string; hash: string }): Promise<boolean>;
    attachConfirmedWalletWithdrawals(ownerId: string, walletAddress: string, items: WalletActivityItem[]): Promise<WalletActivityItem[]>;
  }, calls };
}

test("only a valid owner, wallet and returned withdrawal hash can be stored as a wallet withdrawal", async () => {
  const fixture = loadTags();
  assert.equal(await fixture.api.recordWalletWithdrawalLabel({ ownerId, walletAddress: address, hash: hash.toUpperCase() }), true);
  assert.equal(fixture.calls.table, "wallet_activity_withdrawals");
  assert.deepEqual(plain(fixture.calls.upsert), { owner_id: ownerId, wallet_address: address, transaction_hash: hash });
  assert.equal(fixture.calls.onConflict, "owner_id,wallet_address,transaction_hash");
  const savedPayload = fixture.calls.upsert;
  assert.equal(await fixture.api.recordWalletWithdrawalLabel({ ownerId: "not-an-owner", walletAddress: address, hash }), false);
  assert.equal(await fixture.api.recordWalletWithdrawalLabel({ ownerId, walletAddress: recipient, hash: "bad-hash" }), false);
  assert.equal(fixture.calls.upsert, savedPayload);

  const unavailable = loadTags({ writeError: Error("migration not installed") });
  assert.equal(await unavailable.api.recordWalletWithdrawalLabel({ ownerId, walletAddress: address, hash }), false);
});

test("only the tagged owner's outgoing native-XLM payment is classified as a withdrawal", async () => {
  const fixture = loadTags({ rows: [{ transaction_hash: hash.toUpperCase() }, { transaction_hash: "not-a-hash" }] });
  const sent = base();
  const received = base({ id: "100:received", direction: "received" });
  const token = base({ id: "100:usdc", asset: { code: "USDC", issuer: "issuer", contractId: "sac", decimals: 7, network: "testnet" } });
  const alreadyContextual = base({ id: "101:donation", context: { type: "campaign-donation", contractId: "contract", referenceId: "7", title: null } });
  const tagged = await fixture.api.attachConfirmedWalletWithdrawals(ownerId, address, [sent, received, token, alreadyContextual]);
  assert.deepEqual(plain(tagged[0].context), { type: "wallet-withdrawal", referenceId: null, title: null });
  assert.equal(tagged[1].context, undefined);
  assert.equal(tagged[2].context, undefined);
  assert.deepEqual(tagged[3].context, alreadyContextual.context);
  assert.deepEqual(plain(fixture.calls.filters), [
    ["eq", "owner_id", ownerId], ["eq", "wallet_address", address], ["in", "transaction_hash", [hash]],
  ]);

  const unavailable = loadTags({ readError: Error("offline") });
  assert.deepEqual(await unavailable.api.attachConfirmedWalletWithdrawals(ownerId, address, [sent]), [sent]);
});

test("withdrawal action saves a label for confirmed or pending hashes, but not a failed submission", async () => {
  const source = compiled("../app/withdraw-actions.ts");
  const intent = { id: "intent", action: "wallet_withdrawal", ownerId, walletAddress: address, transactionXdr: "xdr", feeStroops: "100", expiresAt: "2026-11-28T00:00:00.000Z",
    payload: { network: "Testnet", sender: address, recipient, amountStroops: "10000000", memoType: "none", memo: "" } };
  async function invoke(submission: unknown) {
    const calls: unknown[] = [];
    const exports = {};
    runInNewContext(source, {
      exports, Error, Buffer, BigInt, Promise, RegExp,
      require(name: string) {
        if (name === "@stellar/stellar-sdk") return { StrKey };
        if (name === "@/lib/local-preview") return { isLocalPreview: false };
        if (name === "@/lib/money") return { xlmToStroopsExact: () => 10_000_000n };
        if (name === "@/lib/server/stellar") return {
          STELLAR_BASE_FEE_STROOPS: "100", prepareNativePaymentAs() { throw Error("unexpected prepare"); },
          async submitPreparedNativePaymentAs(...args: unknown[]) { calls.push(["submit", ...args]); return submission; }, txLink: (value: string) => `https://stellar.expert/explorer/testnet/tx/${value}`,
        };
        if (name === "@/lib/server/userWallet") return { async getAuthenticatedSigner(id: string) { calls.push(["signer", id]); return { demo: false, publicKey: address, secret: "test-secret" }; } };
        if (name === "@/lib/server/walletReadiness") return { WalletAccountMissingError: class WalletAccountMissingError extends Error {}, getTestnetNativeBalance() { throw Error("unexpected balance read"); } };
        if (name === "@/lib/server/confirmationIntent") return { async consumeConfirmationIntent(id: string, action: string) { calls.push(["consume", id, action]); return intent; }, createConfirmationIntent() { throw Error("unexpected create"); }, cancelConfirmationIntent() { throw Error("unexpected cancel"); }, getConfirmationWallet() { throw Error("unexpected wallet"); } };
        if (name === "@/lib/server/walletActivityWithdrawal") return { async recordWalletWithdrawalLabel(input: unknown) { calls.push(["label", input]); return true; } };
        throw Error(`Unexpected withdrawal-action dependency: ${name}`);
      },
    });
    return { api: exports as { confirmWalletWithdrawal(id: string): Promise<Record<string, unknown>> }, calls };
  }

  const confirmed = await invoke({ ok: true, hash });
  assert.deepEqual(plain(await confirmed.api.confirmWalletWithdrawal("intent")), { ok: true, hash, link: `https://stellar.expert/explorer/testnet/tx/${hash}`, activityLabelSaved: true });
  assert.deepEqual(plain(confirmed.calls.filter(call => Array.isArray(call) && call[0] === "label")), [["label", { ownerId, walletAddress: address, hash }]]);

  const uncertain = await invoke({ ok: false, pending: true, hash });
  const pending = plain(await uncertain.api.confirmWalletWithdrawal("intent"));
  assert.equal(pending.ok, false); assert.equal(pending.pending, true); assert.equal(pending.activityLabelSaved, true);
  assert.deepEqual(plain(uncertain.calls.filter(call => Array.isArray(call) && call[0] === "label")), [["label", { ownerId, walletAddress: address, hash }]]);

  for (const submission of [{ ok: false, hash }]) {
    const notConfirmed = await invoke(submission);
    const result = await notConfirmed.api.confirmWalletWithdrawal("intent");
    assert.equal(result.ok, false);
    assert.equal(notConfirmed.calls.some(call => Array.isArray(call) && call[0] === "label"), false);
  }
});
