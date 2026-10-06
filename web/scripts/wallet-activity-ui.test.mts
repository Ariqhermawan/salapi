import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as copy from "../lib/i18n/revamp-money.ts";
import { activityCopy } from "../lib/i18n/wallet-activity.ts";
import { XLM_ACTIVITY_ASSET, USDC_ACTIVITY_ASSET } from "../lib/wallet-activity.ts";
import { PREVIEW_WALLET } from "../lib/local-preview.ts";
import { formatLocal } from "../lib/ui/currency.ts";
import type { WalletActivityResult, WalletActivityItem } from "../lib/wallet-activity.ts";

const source = readFileSync(new URL("../components/screens/ActivityScreen.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const address = "GDWYDMY2WDL4MCKMYQ6CWZJP526K6YHLRK3EG6IF2IJTX3EHZU3RRB72";
const counterparty = "GCBKRBBNTQ2YA7U7SOC2NTZCCACFIIQCLKKO2FJYL5WJP5QVYH6UNDHL";
type Element = { type: unknown; props: Record<string, unknown> };
type Effect = () => void | (() => void);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : "";
}
const item = (id = "101:sac-0", direction: "sent" | "received" = "received", amount = "4461538462"): WalletActivityItem => ({
  id, hash: "a".repeat(64), createdAt: "2026-10-06T13:29:22Z", direction, amountStroops: amount, counterparty, kind: "soroban-transfer", asset: XLM_ACTIVITY_ASSET, fee: { status: "unavailable" },
});
const pageResult = (items: WalletActivityItem[] = [], nextCursor: string | null = null, wallet: string | null = address, ownerId = "owner-a"): WalletActivityResult => ({ ok: true, ownerId, address: wallet, items, nextCursor });

// These tests execute the actual component, effect/refresh handlers, and JSX.
// Auth and actions are isolated fixtures, never live authenticated E2E proof.
function mount(options: { preview?: boolean; configured?: boolean; locale?: "en" | "id" } = {}) {
  const preview = options.preview ?? false;
  const slots: unknown[] = [];
  const effects: { index: number; callback: Effect; dependencies: unknown[] | undefined }[] = [];
  const cleanups = new Map<number, () => void>();
  const timers = new Map<number, () => void>();
  const authRequests: ReturnType<typeof deferred<{ data: { user: { id: string } | null }; error?: { name: string } }>>[] = [];
  const historyRequests: { cursor: string | null; deferred: ReturnType<typeof deferred<WalletActivityResult>> }[] = [];
  let cursor = 0, timerId = 0, mutations = 0, subscriptions = 0;
  let authListener: ((event: string, session: { user: { id: string } } | null) => void) | null = null;
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const exports = {} as { default(): Element };
  const icons = new Proxy({}, { get: () => () => null });
  const forbidden = () => { throw Error("Unexpected mutation or network boundary"); };
  runInNewContext(compiled, { exports, Intl, Promise, document: { getElementById: () => ({ focus() {} }) },
    setTimeout(callback: () => void) { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout(id: number) { timers.delete(id); },
    require(dependency: string) {
      if (dependency === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (dependency === "react") return {
        useState(initial: unknown) {
          const index = cursor++;
          if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
          return [slots[index], (next: unknown) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; mutations++; }];
        },
        useRef(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
        useCallback(callback: unknown, dependencies: unknown[]) {
          const index = cursor++, prior = slots[index] as { callback: unknown; dependencies: unknown[] } | undefined;
          if (!prior || dependencies.some((value, i) => !Object.is(value, prior.dependencies[i]))) slots[index] = { callback, dependencies };
          return (slots[index] as { callback: unknown }).callback;
        },
        useEffect(callback: Effect, dependencies: unknown[] | undefined) {
          const index = cursor++, previous = slots[index] as unknown[] | undefined;
          if (!previous || !dependencies || dependencies.length !== previous.length || dependencies.some((value, i) => !Object.is(value, previous[i]))) {
            slots[index] = dependencies;
            effects.push({ index, callback, dependencies });
          }
        },
      };
      if (dependency === "next/link") return { default: "Link" };
      if (dependency === "@/app/actions") return { walletActivity(nextCursor: string | null = null) { const next = deferred<WalletActivityResult>(); historyRequests.push({ cursor: nextCursor, deferred: next }); return next.promise; }, sendByUsername: forbidden };
      if (dependency === "@/lib/supabase/env") return { supabaseConfigured: () => options.configured ?? true };
      if (dependency === "@/lib/supabase/client") return { createSupabaseBrowser: () => ({ auth: {
        getUser() { const next = deferred<{ data: { user: { id: string } | null }; error?: { name: string } }>(); authRequests.push(next); return next.promise; },
        onAuthStateChange(callback: typeof authListener) { subscriptions++; authListener = callback; return { data: { subscription: { unsubscribe() { subscriptions--; authListener = null; } } } }; },
        signOut: forbidden,
      } }) };
      if (dependency === "@/components/ui/kit") return { Ico: icons, T: {}, IconButton: "IconButton", PoweredByStellar: "PoweredByStellar" };
      if (dependency === "@/lib/ui/useGoBack") return { useGoBack: () => () => {} };
      if (dependency === "@/components/I18nProvider") return { useT: () => ({ currency: "en", locale: options.locale ?? "en" }) };
      if (dependency === "@/lib/i18n/revamp-money") return copy;
      if (dependency === "@/lib/i18n/wallet-activity") return { activityCopy };
      if (dependency === "@/lib/ui/currency") return { formatLocal };
      if (dependency === "@/lib/local-preview") return { isLocalPreview: preview, PREVIEW_WALLET };
      if (dependency === "@/lib/local-preview-history") return { listPreviewTransfers: () => [] };
      if (dependency.endsWith(".module.css")) return { default: new Proxy({}, { get: (_, key) => key }) };
      throw Error(`Unexpected dependency: ${dependency}`);
    },
  });
  let tree: Element;
  function render() { cursor = 0; tree = exports.default(); return tree; }
  function runEffects() {
    for (const { index, callback } of effects.splice(0)) {
      cleanups.get(index)?.();
      const cleanup = callback();
      if (cleanup) cleanups.set(index, cleanup); else cleanups.delete(index);
    }
  }
  async function flush() {
    for (let step = 0; step < 5; step++) {
      runEffects();
      for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
      await Promise.resolve();
      render();
    }
    return tree;
  }
  function click(label: string) {
    const node = nodes(tree).find((node) => typeof node.props.onClick === "function" && (text(node.props.children) === label || node.props["aria-label"] === label));
    assert.ok(node, `Missing actionable label: ${label}`);
    assert.notEqual(node.props.disabled, true, `Disabled button: ${label}`);
    (node.props.onClick as () => void)();
    render();
  }
  function emitAuth(id: string | null) { assert.ok(authListener); authListener(id ? "SIGNED_IN" : "SIGNED_OUT", id ? { user: { id } } : null); render(); }
  function unmount() { for (const cleanup of cleanups.values()) cleanup(); cleanups.clear(); }
  render(); runEffects();
  return { get tree() { return tree; }, get mutations() { return mutations; }, get subscriptions() { return subscriptions; }, authRequests, historyRequests, render, flush, click, emitAuth, unmount };
}
function state(tree: Element) { return nodes(tree).find((node) => node.props["data-personal-history-state"])?.props["data-personal-history-state"]; }

test("initial authenticated lookup has an accessible loading state, not fake empty history", () => {
  const h = mount();
  assert.equal(state(h.tree), "loading");
  assert.ok(nodes(h.tree).some((node) => node.props.role === "status" && text(node).includes("Loading your Testnet activity")));
  assert.doesNotMatch(text(h.tree), /Your history is in the explorer|No confirmed XLM transfers yet/);
  assert.equal(h.historyRequests.length, 0);
  h.unmount();
});
test("a signed-out viewer sees sign-in without any personal-history lookup", async () => {
  const h = mount();
  h.authRequests[0].resolve({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
  await h.flush();
  assert.equal(state(h.tree), "signed-out");
  assert.ok(nodes(h.tree).some((node) => node.props.href === "/signin?next=%2Factivity"));
  assert.equal(h.historyRequests.length, 0);
  h.unmount();
});
test("network auth failure is not silently treated as an empty account", async () => {
  const h = mount();
  h.authRequests[0].reject(Error("Fixture Auth offline"));
  await h.flush();
  assert.equal(state(h.tree), "auth-error");
  assert.ok(text(h.tree).includes("Your account could not be checked"));
  assert.equal(h.historyRequests.length, 0);
  h.click("Try again"); await h.flush();
  assert.equal(state(h.tree), "loading");
  assert.equal(h.authRequests.length, 2);
  assert.equal(h.subscriptions, 1);
  h.unmount();
});
test("a verified account without a wallet has a separate setup state", async () => {
  const h = mount();
  h.emitAuth("owner-a"); await h.flush();
  h.historyRequests[0].deferred.resolve(pageResult([], null, null)); await h.flush();
  assert.equal(state(h.tree), "no-wallet");
  assert.ok(text(h.tree).includes("No saved wallet yet."));
  assert.ok(nodes(h.tree).some((node) => node.props.href === "/settings"));
  assert.doesNotMatch(text(h.tree), /No confirmed XLM transfers yet/);
  h.unmount();
});
test("native incoming and outgoing receipts use exact units and never invented historical fiat", async () => {
  const h = mount(); h.emitAuth("owner-a"); await h.flush();
  h.historyRequests[0].deferred.resolve(pageResult([item(), item("100:payment", "sent", "1")])); await h.flush();
  assert.equal(state(h.tree), "ready");
  assert.match(text(h.tree), /Received XLM.*\+446\.1538462/);
  assert.match(text(h.tree), /Sent XLM.*−0\.0000001/);
  assert.doesNotMatch(text(h.tree), /\$50|PHP|Rp|₱/);
  const receipt = nodes(h.tree).find((node) => node.props["aria-controls"] === "activity-receipt-101:sac-0")!;
  (receipt.props.onClick as () => void)(); h.render();
  assert.ok(text(h.tree).includes("4461538462 units"));
  assert.ok(nodes(h.tree).some((node) => node.props.href === `https://stellar.expert/explorer/testnet/tx/${"a".repeat(64)}` && node.props.rel === "noopener noreferrer"));
  assert.ok(text(h.tree).includes(counterparty));
  h.unmount();
});
test("empty confirmed history and unavailable history are distinct, with retry", async () => {
  const h = mount(); h.emitAuth("owner-a"); await h.flush();
  h.historyRequests[0].deferred.resolve({ ok: false, ownerId: "owner-a", address, code: "unavailable", error: "Unsafe fixture detail" }); await h.flush();
  assert.equal(state(h.tree), "error");
  assert.doesNotMatch(text(h.tree), /No confirmed XLM transfers yet|Unsafe fixture detail/);
  h.click("Try again"); await h.flush();
  assert.equal(h.historyRequests.length, 2);
  h.historyRequests[1].deferred.resolve(pageResult()); await h.flush();
  assert.equal(state(h.tree), "empty");
  assert.match(text(h.tree), /No confirmed XLM or verified USDC transfers yet/);
  h.unmount();
});
test("pagination requests are single-flight and duplicate operation rows are deduplicated", async () => {
  const h = mount(); h.emitAuth("owner-a"); await h.flush();
  h.historyRequests[0].deferred.resolve(pageResult([item()], "101")); await h.flush();
  h.click("Load earlier transfers");
  const more = nodes(h.tree).find((node) => text(node) === "Loading more activity…")!;
  assert.equal(more.props.disabled, true);
  (more.props.onClick as () => void)(); await h.flush();
  assert.equal(h.historyRequests.length, 2);
  assert.equal(h.historyRequests[1].cursor, "101");
  h.historyRequests[1].deferred.resolve(pageResult([item(), item("90:payment", "sent", "10000000")])); await h.flush();
  assert.equal(nodes(h.tree).filter((node) => node.props["aria-controls"] === "activity-receipt-101:sac-0").length, 1);
  assert.equal(nodes(h.tree).filter((node) => node.props["aria-controls"] === "activity-receipt-90:payment").length, 1);
  h.unmount();
});
test("sign-out immediately hides an old account's rows and late action responses cannot restore them", async () => {
  const h = mount(); h.emitAuth("owner-a"); await h.flush();
  h.historyRequests[0].deferred.resolve(pageResult([item()])); await h.flush();
  h.click("Refresh activity"); await h.flush();
  h.emitAuth(null);
  assert.equal(state(h.tree), "signed-out");
  assert.doesNotMatch(text(h.tree), /446\.1538462/);
  h.historyRequests[1].deferred.resolve(pageResult([item()])); await h.flush();
  assert.equal(state(h.tree), "signed-out");
  assert.doesNotMatch(text(h.tree), /446\.1538462/);
  h.unmount();
});
test("account switch drops out-of-order data even when old action finishes last", async () => {
  const h = mount(); h.emitAuth("owner-a"); await h.flush();
  h.emitAuth("owner-b"); await h.flush();
  assert.equal(h.historyRequests.length, 2);
  h.historyRequests[1].deferred.resolve(pageResult([item("201:payment", "sent", "50000000")], null, address, "owner-b")); await h.flush();
  h.historyRequests[0].deferred.resolve(pageResult([item()])); await h.flush();
  assert.match(text(h.tree), /−5/);
  assert.doesNotMatch(text(h.tree), /446\.1538462/);
  h.unmount();
});
test("late initial Auth lookup cannot overwrite a newer signed-in account", async () => {
  const h = mount(); h.emitAuth("owner-b"); await h.flush();
  h.authRequests[0].resolve({ data: { user: { id: "owner-a" } } }); await h.flush();
  assert.equal(h.historyRequests.length, 1);
  h.historyRequests[0].deferred.resolve(pageResult([item()], null, address, "owner-b")); await h.flush();
  assert.equal(state(h.tree), "ready");
  h.unmount();
});
test("a server owner change before the browser Auth event cannot expose the other user's wallet or history", async () => {
  const h = mount(); h.emitAuth("owner-a"); await h.flush();
  h.historyRequests[0].deferred.resolve(pageResult([item()], null, address, "owner-b")); await h.flush();
  assert.equal(state(h.tree), "auth-error");
  assert.doesNotMatch(text(h.tree), /446\.1538462|GDWYDM|Received XLM/);
  assert.equal(nodes(h.tree).filter((node) => String(node.props.href ?? "").includes("/account/")).length, 0);
  h.emitAuth("owner-b"); await h.flush();
  h.historyRequests[1].deferred.resolve(pageResult([item()], null, address, "owner-b")); await h.flush();
  assert.equal(state(h.tree), "ready");
  assert.match(text(h.tree), /\+446\.1538462/);
  h.unmount();
});
test("a mismatched server error cannot leak another owner's wallet address", async () => {
  const h = mount(); h.emitAuth("owner-a"); await h.flush();
  h.historyRequests[0].deferred.resolve({ ok: false, ownerId: "owner-b", address, code: "unavailable", error: "Fixture other account" }); await h.flush();
  assert.equal(state(h.tree), "auth-error");
  assert.equal(nodes(h.tree).filter((node) => String(node.props.href ?? "").includes("/account/")).length, 0);
  h.unmount();
});
test("unmount unsubscribes and does not mutate state after a late action", async () => {
  const h = mount(); h.emitAuth("owner-a"); await h.flush();
  h.unmount(); const before = h.mutations;
  h.historyRequests[0].deferred.resolve(pageResult([item()]));
  for (let step = 0; step < 5; step++) await Promise.resolve();
  assert.equal(h.mutations, before);
  assert.equal(h.subscriptions, 0);
});
test("non-native page with a cursor is not misrepresented as empty all-time history", async () => {
  const h = mount(); h.emitAuth("owner-a"); await h.flush();
  h.historyRequests[0].deferred.resolve(pageResult([], "101")); await h.flush();
  assert.match(text(h.tree), /No XLM or verified USDC transfers on this page/);
  assert.doesNotMatch(text(h.tree), /No confirmed XLM transfers yet/);
  assert.ok(nodes(h.tree).some((node) => text(node) === "Load earlier transfers"));
  h.unmount();
});
test("public archive is not mixed into an authenticated wallet's empty history", async () => {
  const h = mount(); h.emitAuth("owner-a"); await h.flush();
  h.historyRequests[0].deferred.resolve(pageResult()); await h.flush();
  assert.equal(nodes(h.tree).filter((node) => String(node.props.href ?? "").includes("/tx/")).length, 0);
  h.click("Public proof");
  assert.match(text(h.tree), /Project receipts, not your transactions/);
  assert.equal(nodes(h.tree).filter((node) => String(node.props.href ?? "").includes("/tx/")).length, 10);
  h.unmount();
});
test("local preview uses only local receipts without Auth or live actions", async () => {
  const h = mount({ preview: true }); await h.flush();
  assert.match(text(h.tree), /No recorded transfers yet/);
  assert.equal(h.authRequests.length, 0);
  assert.equal(h.historyRequests.length, 0);
  assert.equal(h.subscriptions, 0);
  h.unmount();
});
test("Indonesian incoming history and error states are localized independently of display currency", async () => {
  const h = mount({ locale: "id" }); h.emitAuth("owner-a"); await h.flush();
  h.historyRequests[0].deferred.resolve(pageResult([item()])); await h.flush();
  assert.match(text(h.tree), /Menerima XLM.*\+446\.1538462/);
  assert.match(text(h.tree), /Hanya XLM dan USDC Testnet dari Circle/);
  h.unmount();
});

test("mixed-asset history labels actual USDC without relabeling the previous XLM movement", async () => {
  const h = mount(); h.emitAuth("owner-a"); await h.flush();
  const usdc = { ...item("99:payment", "sent", "500000001"), asset: USDC_ACTIVITY_ASSET };
  h.historyRequests[0].deferred.resolve(pageResult([item(), usdc])); await h.flush();
  assert.match(text(h.tree), /Received XLM.*\+446\.1538462/);
  assert.match(text(h.tree), /Sent USDC.*−50\.0000001.*Testnet USDC/);
  assert.doesNotMatch(text(h.tree), /\$50|50 Testnet XLM/);
  const receipt = nodes(h.tree).find(node => node.props["aria-controls"] === "activity-receipt-99:payment")!;
  (receipt.props.onClick as () => void)(); h.render();
  assert.ok(text(h.tree).includes(USDC_ACTIVITY_ASSET.issuer!));
  assert.ok(text(h.tree).includes(USDC_ACTIVITY_ASSET.contractId!));
  assert.match(text(h.tree), /50\.0000001 Testnet USDC/);
  h.unmount();
});

test("network fee is separately stated in XLM with its actual payer, not deducted from token amount", async () => {
  const h = mount(); h.emitAuth("owner-a"); await h.flush();
  const receipt = { ...item("99:payment", "sent", "500000000"), asset: USDC_ACTIVITY_ASSET,
    fee: { status: "available" as const, amountStroops: "321", payer: counterparty, paidByWallet: false, transactionHash: "b".repeat(64), feeBump: true } };
  h.historyRequests[0].deferred.resolve(pageResult([receipt])); await h.flush();
  assert.match(text(h.tree), /Sent USDC.*−50.*Testnet USDC/);
  assert.match(text(h.tree), /Network fee: 0\.0000321 XLM.*Paid by another wallet/);
  const button = nodes(h.tree).find(node => node.props["aria-controls"] === "activity-receipt-99:payment")!;
  (button.props.onClick as () => void)(); h.render();
  assert.match(text(h.tree), /Fee payer.*GCBKRBB/);
  assert.match(text(h.tree), /total fee for the transaction, not a fee per movement/);
  assert.match(text(h.tree), /Fee-bump transaction/);
  assert.ok(nodes(h.tree).some(node => node.props.href === `https://stellar.expert/explorer/testnet/tx/${"b".repeat(64)}` && text(node) === "View network fee receipt"));
  assert.doesNotMatch(text(h.tree), /Paid by your wallet/);
  h.unmount();
});

test("unknown fees are never displayed as zero or incorrectly assigned to an incoming receiver", async () => {
  const h = mount({ locale: "id" }); h.emitAuth("owner-a"); await h.flush();
  h.historyRequests[0].deferred.resolve(pageResult([item()])); await h.flush();
  assert.match(text(h.tree), /Biaya jaringan belum tersedia/);
  const button = nodes(h.tree).find(node => node.props["aria-controls"] === "activity-receipt-101:sac-0")!;
  (button.props.onClick as () => void)(); h.render();
  assert.match(text(h.tree), /Tidak diasumsikan biaya nol atau siapa pembayarnya/);
  assert.doesNotMatch(text(h.tree), /Biaya jaringan: 0 XLM|Dibayar wallet kamu/);
  h.unmount();
});
