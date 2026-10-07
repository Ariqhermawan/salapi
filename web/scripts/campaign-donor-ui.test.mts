import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { activityStroopsToXlm } from "../lib/wallet-activity.ts";
import type { CampaignDonorEntry, CampaignDonorFeedResult } from "../lib/campaign-donor.ts";
import type { Locale } from "../lib/i18n/config.ts";

const wallet = "GDWYDMY2WDL4MCKMYQ6CWZJP526K6YHLRK3EG6IF2IJTX3EHZU3RRB72";
const hash = "a".repeat(64);
const entry = (id = "10", anonymous = false): CampaignDonorEntry => ({ id, network: "testnet", campaignId: "1", createdAt: "2026-10-06T02:00:00Z",
  amountStroops: "10000001", asset: "XLM", badge: "confirmed_testnet", anonymous, comment: "A kind comment <script>never executes</script>",
  donor: anonymous ? null : { address: wallet, handle: "confirmed_user", photoUrl: null }, hash: anonymous ? null : hash,
  link: anonymous ? null : `https://stellar.expert/explorer/testnet/tx/${hash}` });
const response = (entries: CampaignDonorEntry[] = [entry()], nextCursor: string | null = null): CampaignDonorFeedResult => ({ ok: true,
  campaignId: "1", entries, nextCursor, anonymityNotice: "Display anonymity is not chain privacy." });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
async function flush() { for (let n = 0; n < 12; n++) await Promise.resolve(); }
type Effect = { callback: () => void | (() => void); deps: readonly unknown[]; cleanup?: () => void };
type FeedProps = { campaignId: string; refreshKey?: string | number };
const compiled = ts.transpileModule(readFileSync(new URL("../components/CampaignDonorActivity.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
// Executes the real component's hooks, handlers and JSX with isolated server
// actions. This is not browser/Gmail/Supabase E2E evidence.
function setup(locale: Locale = "en") {
  const cells: unknown[] = [], effects = new Map<number, Effect>(), waiting = new Map<number, Effect>();
  const calls: { id: string; cursor: string | undefined; result: ReturnType<typeof deferred<CampaignDonorFeedResult>> }[] = [];
  let index = 0, props: FeedProps = { campaignId: "1" };
  const exports = {} as { default: (props: FeedProps) => React.ReactElement };
  runInNewContext(compiled, { exports, Date, Set, JSON,
    require(name: string) {
      if (name === "react") return {
        useId: () => "fixture-donor-title",
        useState(initial: unknown) { const position = index++; if (!(position in cells)) cells[position] = initial; return [cells[position], (value: unknown) => { cells[position] = typeof value === "function" ? value(cells[position]) : value; }]; },
        useRef(initial: unknown) { const position = index++; return cells[position] ?? (cells[position] = { current: initial }); },
        useEffect(callback: Effect["callback"], deps: readonly unknown[]) { const position = index++, previous = effects.get(position); if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) waiting.set(position, { callback, deps }); },
      };
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "next/image") return { __esModule: true, default: (props: { src: string; alt: string; width: number; height: number }) => React.createElement("img", props) };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale }) };
      if (name === "@/lib/wallet-activity") return { activityStroopsToXlm };
      if (name === "@/app/campaign-donor-actions") return { campaignDonorActivity(id: string, cursor?: string) { const result = deferred<CampaignDonorFeedResult>(); calls.push({ id, cursor, result }); return result.promise; } };
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
      throw Error(`Unexpected import ${name}`);
    },
  });
  function render(next = props) {
    props = next; index = 0; const tree = exports.default(props);
    for (const [position, effect] of waiting) { effects.get(position)?.cleanup?.(); effects.set(position, { ...effect, cleanup: effect.callback() || undefined }); }
    waiting.clear(); return tree;
  }
  function nodes(value: unknown): React.ReactElement<Record<string, unknown>>[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!React.isValidElement<Record<string, unknown>>(value)) return [];
    return [value, ...nodes(value.props.children)];
  }
  function click(text: string) {
    const button = nodes(render()).find(item => item.type === "button" && (item.props.children === text || item.props["aria-label"] === text));
    assert.ok(button, `Button ${text} must be rendered`); return (button.props.onClick as () => unknown)();
  }
  return { render, calls, nodes, click, html: () => renderToStaticMarkup(render()), cleanup() { for (const effect of effects.values()) effect.cleanup?.(); } };
}
async function ready(h: ReturnType<typeof setup>, value = response()) { h.render(); h.calls.at(-1)!.result.resolve(value); await flush(); h.render(); }

test("initial donor loading is neutral and never renders sample donations or empty totals", () => {
  const h = setup(); const html = h.html(); assert.match(html, /Loading confirmed donor records/); assert.doesNotMatch(html, /No confirmed app donor|confirmed_user|View receipt/); assert.equal(h.calls.length, 1);
});
test("real component renders exact XLM, safe username/address and confirmed badge", async () => {
  const h = setup(); await ready(h); const html = h.html(); assert.match(html, /@confirmed_user/); assert.match(html, /1\.0000001/); assert.match(html, /Confirmed Testnet/);
  assert.ok(html.includes(wallet)); assert.ok(html.includes(`href="https://stellar.expert/explorer/testnet/tx/${hash}"`)); assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /&lt;script&gt;never executes&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>/);
});
test("anonymous component presentation discards even contradictory response identities", async () => {
  const h = setup(); const malicious = { ...entry(), anonymous: true }; await ready(h, response([malicious]));
  const html = h.html(); assert.match(html, /Anonymous/); for (const privateField of [wallet, hash, "confirmed_user", "View receipt"]) assert.ok(!html.includes(privateField));
});
test("empty app log explains incomplete history instead of claiming no donations", async () => {
  const h = setup(); await ready(h, response([])); const html = h.html(); assert.match(html, /No confirmed app donor records yet/); assert.match(html, /does not mean the campaign received no funds/);
});
test("schema/setup error is not rendered as empty ledger and retry uses same campaign", async () => {
  const h = setup(); await ready(h, { ok: false, campaignId: "1", code: "not_configured" }); assert.match(h.html(), /Donor log setup is pending/);
  assert.doesNotMatch(h.html(), /No confirmed app donor records yet/); h.click("Try again"); h.render(); assert.equal(h.calls.length, 2); assert.equal(h.calls[1].id, "1");
  h.calls[1].result.resolve(response()); await flush(); assert.match(h.html(), /confirmed_user/);
});
test("load older uses lossless cursor, merges without duplicates and cannot double-submit", async () => {
  const h = setup(); await ready(h, response([entry("10")], "10"));
  const button = h.nodes(h.render()).find(node => node.type === "button" && node.props.children === "Load older records"); assert.ok(button);
  const click = button.props.onClick as () => unknown;
  click(); click(); assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].cursor, "10"); h.calls[1].result.resolve(response([entry("10"), entry("9", true)], null)); await flush();
  const html = h.html(); assert.match(html, /2 records shown/); assert.equal((html.match(/@confirmed_user/g) ?? []).length, 1); assert.doesNotMatch(html, /Load older records/);
});
test("older-page failure preserves confirmed records and retries cursor only", async () => {
  const h = setup(); await ready(h, response([entry("10")], "10")); const pending = h.click("Load older records"); h.calls[1].result.reject(Error("Network failure")); await pending; await flush();
  assert.match(h.html(), /@confirmed_user/); assert.match(h.html(), /temporarily unavailable/); const retry = h.click("Try again"); assert.equal(h.calls[2].cursor, "10");
  h.calls[2].result.resolve(response([entry("9", true)])); await retry; await flush(); assert.match(h.html(), /2 records shown/);
});
test("campaign change suppresses old entries immediately and ignores late response", async () => {
  const h = setup(); h.render(); const old = h.calls[0]; h.render({ campaignId: "2" }); const newer = h.calls[1];
  newer.result.resolve({ ...response([], null), campaignId: "2" }); await flush(); old.result.resolve(response()); await flush(); assert.doesNotMatch(h.html(), /confirmed_user/);
  assert.match(h.html(), /No confirmed app donor records yet/);
});
test("unmount and refresh races cannot restore stale donors", async () => {
  const h = setup(); h.render(); const old = h.calls[0]; h.render({ campaignId: "1", refreshKey: 2 });
  h.calls[1].result.resolve(response([entry("20", true)])); await flush(); old.result.resolve(response()); await flush(); assert.doesNotMatch(h.html(), /confirmed_user/);
  h.cleanup(); h.calls[1].result.resolve(response()); await flush(); assert.doesNotMatch(h.html(), /confirmed_user/);
});
test("wrong campaign response cannot populate donor feed", async () => {
  const h = setup(); await ready(h, { ...response(), campaignId: "2" }); assert.match(h.html(), /temporarily unavailable/); assert.doesNotMatch(h.html(), /confirmed_user/);
});
test("native anonymous disclosure is present in all four locales", async () => {
  for (const locale of ["en", "id", "tl", "vi"] as const) {
    const h = setup(locale); await ready(h, response([entry("10", true)])); const html = h.html(); assert.match(html, /<details class="privacy"><summary>/);
    assert.match(html, /Stellar/); assert.doesNotMatch(html, /confirmed_user/);
  }
});
test("UI has bounded pages and selectable wrapping addresses", () => {
  const source = readFileSync(new URL("../components/CampaignDonorActivity.tsx", import.meta.url), "utf8"), css = readFileSync(new URL("../components/CampaignDonorActivity.module.css", import.meta.url), "utf8");
  assert.match(source, /MAX_VISIBLE = 50/); assert.match(source, /slice\(0, MAX_VISIBLE\)/); assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /max-width: 370px/); assert.match(source, /scope === requestedScope/);
});
