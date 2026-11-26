import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import ts from "typescript";

const id = "11111111-1111-4111-8111-111111111111";
const owner = "00000000-0000-4000-8000-000000000001";
const wallet = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const otherOwner = "00000000-0000-4000-8000-000000000002";
const otherWallet = "GOTHER-DIFFERENT-WALLET";

function compile(file: string) {
  return ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function setup() {
  let now = Date.UTC(2026, 10, 23, 12);
  let identity = { ok: true as const, ownerId: owner, address: wallet };
  const rows = new Map<string, Record<string, unknown>>();
  let nextId = 1;
  class TestDate extends Date {
    constructor(value?: string | number) { super(value === undefined ? now : value); }
    static now() { return now; }
  }
  const admin = {
    from(table: string) {
      assert.equal(table, "wallet_confirmation_intents");
      return {
        insert(values: Record<string, unknown>) {
          const rowId = `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;
          const normalized = { ...values, expires_at: new Date(String(values.expires_at)).toISOString().replace(".000Z", "+00:00") };
          rows.set(rowId, { id: rowId, ...normalized, consumed_at: null });
          return { select: () => ({ single: async () => ({ data: { id: rowId }, error: null }) }) };
        },
        update(values: Record<string, unknown>) {
          const filters = new Map<string, { op: string; value: unknown }>();
          const query = {
            eq(column: string, value: unknown) { filters.set(column, { op: "eq", value }); return query; },
            is(column: string, value: unknown) { filters.set(column, { op: "is", value }); return query; },
            gt(column: string, value: unknown) { filters.set(column, { op: "gt", value }); return query; },
            select() { return query; },
            async maybeSingle() {
              const row = rows.get(String(filters.get("id")?.value));
              const matches = row && [...filters].every(([column, filter]) => {
                if (filter.op === "eq") return row[column] === filter.value;
                if (filter.op === "is") return row[column] === filter.value;
                if (filter.op === "gt") return String(row[column]) > String(filter.value);
                return false;
              });
              if (!matches) return { data: null, error: null };
              Object.assign(row, values);
              return { data: { ...row }, error: null };
            },
          };
          return query;
        },
      };
    },
  };
  const intentCode = compile("../lib/confirmation-intent.ts");
  const serviceCode = compile("../lib/server/confirmationIntent.ts");
  function load(code: string, dependencies: Record<string, unknown>) {
    const target = { exports: {} as Record<string, (...args: unknown[]) => unknown> };
    runInNewContext(code, { module: target, exports: target.exports, Date: TestDate, JSON, Error,
      require(name: string) {
        if (name in dependencies) return dependencies[name];
        throw new Error(`Unexpected dependency: ${name}`);
      },
    });
    return target.exports;
  }
  const primitives = load(intentCode, { "node:crypto": { createHash } }) as {
    confirmationIntentDigest(value: unknown): string;
    validConfirmationIntentId(value: unknown): boolean;
  };
  const service = load(serviceCode, {
    "server-only": {},
    "@/lib/supabase/admin": { createSupabaseAdmin: () => admin },
    "@/lib/server/accountWallet": { readAccountWallet: async () => identity },
    "@/lib/confirmation-intent": { ...primitives, CONFIRMATION_INTENT_TTL_SECONDS: 120 },
  }) as Record<string, (...args: unknown[]) => Promise<unknown>>;
  return {
    service, primitives, rows,
    setIdentity(value: typeof identity) { identity = value; },
    advance(ms: number) { now += ms; },
  };
}

test("intent digest is canonical and binds owner, wallet, action, payload, XDR and fee", () => {
  const { primitives } = setup();
  const base = { action: "username_send", ownerId: owner, walletAddress: wallet,
    payload: { username: "jamamam", amountStroops: "100", recipient: "Grecipient" },
    transactionXdr: "unsigned-xdr", feeStroops: "100", expiresAt: "2026-11-23T12:02:00.000Z" };
  const reordered = { ...base, payload: { recipient: "Grecipient", amountStroops: "100", username: "jamamam" } };
  assert.equal(primitives.confirmationIntentDigest(base), primitives.confirmationIntentDigest(reordered));
  for (const changed of [
    { ...base, action: "campaign_donate" }, { ...base, ownerId: otherOwner },
    { ...base, walletAddress: otherWallet }, { ...base, payload: { ...base.payload, amountStroops: "101" } },
    { ...base, transactionXdr: "different-xdr" }, { ...base, feeStroops: "101" },
    { ...base, expiresAt: "2026-11-24T12:02:00.000Z" },
  ]) assert.notEqual(primitives.confirmationIntentDigest(base), primitives.confirmationIntentDigest(changed));
  assert.equal(primitives.validConfirmationIntentId(id), true);
  for (const invalid of ["", "not-a-uuid", "11111111-1111-0111-8111-111111111111", null, 1])
    assert.equal(primitives.validConfirmationIntentId(invalid), false);
});

test("intent consumption binds the current user, action, expiry and single use", async () => {
  const env = setup();
  const created = await env.service.createConfirmationIntent({ action: "username_send", payload: { amount: "100" },
    transactionXdr: "unsigned-xdr", feeStroops: "100" }) as { id: string };

  env.setIdentity({ ok: true, ownerId: otherOwner, address: otherWallet });
  await assert.rejects(env.service.consumeConfirmationIntent(created.id, "username_send"), /expired or was already used/);
  env.setIdentity({ ok: true, ownerId: owner, address: wallet });
  await assert.rejects(env.service.consumeConfirmationIntent(created.id, "campaign_donate"), /expired or was already used/);

  const consumed = await env.service.consumeConfirmationIntent(created.id, "username_send") as { transactionXdr: string };
  assert.equal(consumed.transactionXdr, "unsigned-xdr");
  await assert.rejects(env.service.consumeConfirmationIntent(created.id, "username_send"), /expired or was already used/);
});

test("expired and cancelled intents cannot be consumed", async () => {
  const env = setup();
  const expired = await env.service.createConfirmationIntent({ action: "username_send", payload: { amount: "100" },
    transactionXdr: "expired-xdr", feeStroops: "100" }) as { id: string };
  env.advance(120_001);
  await assert.rejects(env.service.consumeConfirmationIntent(expired.id, "username_send"), /expired or was already used/);

  const live = await env.service.createConfirmationIntent({ action: "campaign_donate", payload: { amount: "100" },
    transactionXdr: "cancelled-xdr", feeStroops: "100" }) as { id: string };
  assert.equal(await env.service.cancelConfirmationIntent(live.id, "campaign_donate"), true);
  await assert.rejects(env.service.consumeConfirmationIntent(live.id, "campaign_donate"), /expired or was already used/);
});

test("tampered persisted intent is consumed but rejected before any caller can sign it", async () => {
  const env = setup();
  const created = await env.service.createConfirmationIntent({ action: "username_send", payload: { amount: "100" },
    transactionXdr: "unsigned-xdr", feeStroops: "100" }) as { id: string };
  const row = env.rows.get(created.id)!;
  row.payload = { amount: "999" };
  await assert.rejects(env.service.consumeConfirmationIntent(created.id, "username_send"), /saved confirmation changed/);

  const extended = setup();
  const second = await extended.service.createConfirmationIntent({ action: "username_send", payload: { amount: "100" },
    transactionXdr: "unsigned-xdr", feeStroops: "100" }) as { id: string };
  extended.rows.get(second.id)!.expires_at = "2099-01-01T00:00:00+00:00";
  await assert.rejects(extended.service.consumeConfirmationIntent(second.id, "username_send"), /saved confirmation changed/);
});
