import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { StrKey } from "@stellar/stellar-sdk";
import { AuthSessionMissingError, isAuthSessionMissingError } from "@supabase/supabase-js";
import * as money from "../lib/money.ts";
import { formatStroops } from "../lib/format-stroops.ts";
import * as support from "../lib/campaign-support.ts";
import type { AvailableBalance } from "../lib/available-balance.ts";

const ownerId = "00000000-0000-4000-8000-000000000001";
const address = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7));
function load<T>(path: string, dependencies: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const exports = {} as T;
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  runInNewContext(code, { exports, Date, URL, BigInt, AbortSignal, setTimeout, clearTimeout,
    require(name: string) { if (name === "server-only") return {}; assert.ok(name in dependencies, `Unexpected ${name}`); return dependencies[name]; }, ...extra });
  return exports;
}
const balanceModule = load<{ availableBalanceFromHorizon(a: unknown, l: unknown, w: string): AvailableBalance | null }>("../lib/available-balance.ts", { "./money": money });
const account = (extra = {}) => ({ account_id: address, subentry_count: 0, num_sponsoring: 0, num_sponsored: 0,
  balances: [{ asset_type: "native", balance: "100.1234567", selling_liabilities: "0.0000000" }], ...extra });
const ledger = { base_reserve_in_stroops: 5_000_000 };
test("available XLM subtracts the live ledger reserve, with exact seven-decimal integers", () => {
  const result = balanceModule.availableBalanceFromHorizon(account(), ledger, address)!;
  assert.equal(result.nativeStroops, "1001234567"); assert.equal(result.reserveStroops, "10000000"); assert.equal(result.availableStroops, "991234567");
});
test("sponsorship and selling liabilities reduce available balance separately", () => {
  const a = account({ subentry_count: 3, num_sponsoring: 2, num_sponsored: 1,
    balances: [{ asset_type: "native", balance: "10.0000000", selling_liabilities: "2.1234567" }] });
  const result = balanceModule.availableBalanceFromHorizon(a, ledger, address)!;
  assert.equal(result.reserveStroops, "30000000"); assert.equal(result.liabilitiesStroops, "21234567"); assert.equal(result.availableStroops, "48765433");
});
test("fully sponsored and low accounts clamp to zero without inventing usable money", () => {
  assert.equal(balanceModule.availableBalanceFromHorizon(account({ num_sponsored: 2 }), ledger, address)?.reserveStroops, "0");
  assert.equal(balanceModule.availableBalanceFromHorizon(account({ balances: [{ asset_type: "native", balance: "0.1", selling_liabilities: "0" }] }), ledger, address)?.availableStroops, "0");
});
for (const invalid of [null, account({ account_id: "other" }), account({ subentry_count: -1 }), account({ num_sponsored: 3 }),
  account({ balances: [] }), account({ balances: [{ asset_type: "native", balance: "1e3", selling_liabilities: "0" }] }),
  account({ balances: [{ asset_type: "native", balance: "10", selling_liabilities: "" }] }), account({ num_sponsoring: 1.5 })]) {
  test(`malformed Horizon account cannot become a usable balance: ${JSON.stringify(invalid)}`, () => assert.equal(balanceModule.availableBalanceFromHorizon(invalid, ledger, address), null));
}
test("invalid ledger reserve fails closed instead of assuming today's 0.5 XLM", () => {
  for (const l of [null, {}, { base_reserve_in_stroops: "5000000" }, { base_reserve_in_stroops: 0 }]) assert.equal(balanceModule.availableBalanceFromHorizon(account(), l, address), null);
});

function ownerHarness(options: { user?: { id: string; is_anonymous?: boolean } | null; authError?: unknown; authThrows?: boolean; row?: unknown; dbError?: unknown } = {}) {
  const calls = { db: 0, columns: "", owner: "" };
  const query = { select(c: string) { calls.columns = c; return query; }, eq(c: string, id: string) { assert.equal(c, "user_id"); calls.owner = id; return query; }, abortSignal() { return query; }, async maybeSingle() { return { data: options.row === undefined ? { public_key: address } : options.row, error: options.dbError }; } };
  const api = load<{ readAccountWallet(): Promise<Record<string, unknown>> }>("../lib/server/accountWallet.ts", {
    "@supabase/supabase-js": { isAuthSessionMissingError }, "@stellar/stellar-sdk": { StrKey },
    "@/lib/local-preview": { isLocalPreview: false }, "@/lib/supabase/env": { supabaseConfigured: () => true, supabaseAdminConfigured: () => true },
    "@/lib/supabase/server": { createSupabaseServer: async () => ({ auth: { async getUser() { if (options.authThrows) throw Error("Unavailable"); return { data: { user: options.user === undefined ? { id: ownerId, is_anonymous: false } : options.user }, error: options.authError }; } } }) },
    "@/lib/supabase/admin": { createSupabaseAdmin: () => ({ from(table: string) { assert.equal(table, "wallets"); calls.db++; return query; } }) },
  });
  return { ...api, calls };
}
test("spending/support owner read selects only public key and never decrypts, creates or funds a wallet", async () => {
  const h = ownerHarness(), r = await h.readAccountWallet();
  assert.equal(r.ok, true); assert.equal(r.ownerId, ownerId); assert.equal(r.address, address); assert.equal(h.calls.columns, "public_key"); assert.equal(h.calls.owner, ownerId);
});
for (const options of [{ user: null }, { user: null, authError: new AuthSessionMissingError() }, { authError: {} }, { authThrows: true }, { user: { id: ownerId, is_anonymous: true } }, { user: { id: "invalid", is_anonymous: false } }]) {
  test(`unverified auth cannot access private wallet data: ${JSON.stringify(options)}`, async () => { const h = ownerHarness(options); assert.equal((await h.readAccountWallet()).ok, false); assert.equal(h.calls.db, 0); });
}
test("missing wallet and DB outage stay distinct from an available zero wallet", async () => {
  assert.equal((await ownerHarness({ row: null }).readAccountWallet()).code, "no_wallet");
  assert.equal((await ownerHarness({ dbError: {} }).readAccountWallet()).code, "unavailable");
});

test("personal badge reads confirmed D4 contributions for the server owner's wallet with bounded concurrency", async () => {
  let active = 0, max = 0;
  const targets: string[] = [];
  const api = load<{ readCampaignSupport(ids: unknown): Promise<support.CampaignSupportResult> }>("../lib/server/campaignSupport.ts", {
    "./accountWallet": { readAccountWallet: async () => ({ ok: true, ownerId, address }) },
    "@/lib/campaign-support": support, "@/lib/circles/testnet": { circleTestnetSlugs: () => null }, "./circlesTestnet": { readCircleDiscoveryMappings: async () => [] },
    "./stellar": { CONTRACTS: { tokenXlmSac: "native" }, donationCampaignId: () => "d4", sc: { u64: (v: bigint) => v, addr: (v: string) => v },
      async readContract(_c: string, method: string, args: unknown[]) {
        if (method === "version") return 4; if (method === "token") return "native";
        assert.equal(method, "contribution"); assert.equal(args[1], address); targets.push(String(args[0])); active++; max = Math.max(max, active); await Promise.resolve(); active--;
        if (args[0] === 4n) throw Error("Provider outage");
        return { amount: args[0] === 3n ? 0n : 100n, refunded: args[0] === 2n };
      } },
  });
  const result = await api.readCampaignSupport("1,2,3,4,5,6");
  assert.equal(result.ownerId, ownerId); assert.ok(max <= 4); assert.equal(targets.length, 6);
  assert.equal(result.contributions["1"].status, "donated"); assert.equal(result.contributions["2"].status, "refunded");
  assert.equal(result.contributions["3"].status, "none"); assert.equal(result.contributions["4"].status, "unavailable");
});
for (const input of [null, "", "0", "1,1", "01", "-1", "1e2", "18446744073709551616", Array.from({ length: 41 }, (_, i) => i + 1).join(",")]) {
  test(`personal support rejects malformed/unbounded campaign IDs: ${String(input)}`, () => assert.equal(support.campaignSupportIds(input), null));
}
test("badge validation cannot label zero/pending/malformed results as donated", () => {
  for (const c of [{ amount: "0", status: "donated" }, { amount: "1", status: "pending" }, { amount: "1e3", status: "donated" }])
    assert.equal(support.validCampaignSupport({ ok: true, ownerId, contributions: { "1": c } }), false);
});
test("actual badge is visible only for confirmed donations/refunds, in all four locales", () => {
  for (const locale of ["en", "id", "tl", "vi"]) {
    const component = load<{ default: React.FC<{ support?: support.CampaignSupport }> }>("../components/CampaignDonationBadge.tsx", {
      "react/jsx-runtime": jsx, "@/components/I18nProvider": { useT: () => ({ locale }) }, "./CampaignDonationBadge.module.css": { default: {} },
    }).default;
    for (const status of ["donated", "refunded", "none", "unavailable"] as const) {
      const html = renderToStaticMarkup(React.createElement(component, { support: { amount: "100", status } }));
      assert.equal(html.includes('data-testid="campaign-donated-badge"'), status === "donated" || status === "refunded");
    }
  }
});
test("actual balance component shows exact XLM, reserve and over-limit warning, never a fake fiat available amount", () => {
  const balance = balanceModule.availableBalanceFromHorizon(account(), ledger, address)!;
  const component = load<{ default: React.FC<{ amountStroops: bigint }> }>("../components/AvailableWalletBalance.tsx", {
    "react/jsx-runtime": jsx, "@/components/I18nProvider": { useT: () => ({ locale: "id" }) },
    "@/lib/ui/useOwnedAccountRead": { useOwnedAccountRead: () => ({ status: "ready", value: { ok: true, ownerId, balance } }) },
    "@/lib/format-stroops": { formatStroops }, "@/lib/local-preview": { isLocalPreview: false }, "./AvailableWalletBalance.module.css": { default: {} },
  }).default;
  const html = renderToStaticMarkup(React.createElement(component, { amountStroops: 1_000_000_000n }));
  assert.match(html, /Saldo tersedia/); assert.match(html, /99.1234567/); assert.match(html, /Cadangan jaringan/); assert.match(html, /melebihi XLM/); assert.doesNotMatch(html, /USD|\$/);
});
test("private display routes are cookie-scoped, no-store, and expose no user selector", () => {
  for (const path of ["spending", "campaign-support"]) {
    const code = readFileSync(new URL(`../app/api/account/${path}/route.ts`, import.meta.url), "utf8");
    assert.match(code, /private, no-store/); assert.match(code, /Vary: "Cookie"/); assert.doesNotMatch(code, /query.get\("(?:owner|address|wallet|user)/);
  }
});
