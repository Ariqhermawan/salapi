import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as revampMoney from "../lib/i18n/revamp-money.ts";
import * as money from "../lib/money.ts";
import { CURRENCY, formatLocal, formatLocalAmount, pesoFromLocal } from "../lib/ui/currency.ts";
import { PREVIEW_WALLET } from "../lib/local-preview.ts";
import type { Locale } from "../lib/i18n/config.ts";
import type { SavingsPreviewGoal, SavingsPreviewReview, SavingsPreviewState } from "../lib/savings-preview.ts";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
type Api = { SAVINGS_PREVIEW_KEY: string; readSavingsPreview(): Result<SavingsPreviewState>; savingsPreviewAmount(input: money.MoneyInput): bigint | null; reviewSavingsPreview(state: SavingsPreviewState, input: object): Result<SavingsPreviewReview>; confirmSavingsPreview(review: SavingsPreviewReview): Result<{ state: SavingsPreviewState; duplicate: boolean }> };
type Element = { type: string; props: Record<string, unknown> };
const compile = (path: string, jsx = false) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) } }).outputText;
const helperCode = compile("../lib/savings-preview.ts");
const screenCode = compile("../components/screens/SavingsScreen.tsx", true);
function nodes(value: unknown): Element[] { if (Array.isArray(value)) return value.flatMap(nodes); if (!value || typeof value !== "object" || !("props" in value)) return []; const node = value as Element; return [node, ...nodes(node.props.children)]; }
function text(value: unknown): string { if (typeof value === "string" || typeof value === "number") return String(value); if (Array.isArray(value)) return value.map(text).join(""); return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : ""; }

function setup(options: { preview?: boolean; server?: boolean; mode?: "get" | "set" | "drop"; data?: Map<string, string>; currency?: Locale } = {}) {
  const data = options.data ?? new Map<string, string>(); let mode = options.mode; let currency = options.currency ?? "en"; let id = 0;
  const calls = { server: 0, network: 0, legacyStorage: 0, writes: 0 };
  const storage = { getItem(key: string) { if (mode === "get") throw new Error("Storage read denied"); return data.get(key) ?? null; }, setItem(key: string, raw: string) { calls.writes++; if (mode === "set") throw new Error("Storage write denied"); if (mode !== "drop") data.set(key, raw); }, removeItem(key: string) { if (mode === "set") throw new Error("Storage removal denied"); data.delete(key); } };
  const preview = { isLocalPreview: options.preview ?? true, PREVIEW_WALLET };
  const globals = { window: options.server ? undefined : {}, sessionStorage: storage, crypto: { randomUUID: () => `00000000-0000-0000-0000-${String(++id).padStart(12,"0")}` } };
  const helper = { exports: {} as Api };
  runInNewContext(helperCode, { ...globals, module: helper, exports: helper.exports, require: (name: string) => { if (name === "./money") return money; if (name === "./local-preview") return preview; throw new Error(`Unexpected ${name}`); } });
  function mount() {
    const state: unknown[] = []; let cursor = 0; let initial = true; const timers: (() => void)[] = [];
    const component = { exports: {} as { default(): Element } };
    const jsx = (type: unknown, props: Record<string, unknown>): Element => typeof type === "function" ? type(props) : { type: String(type), props };
    const forbidden = () => { calls.server++; throw new Error("Unexpected live action"); };
    runInNewContext(screenCode, { ...globals, module: component, exports: component.exports, fetch: () => { calls.network++; throw new Error("Unexpected network"); }, setTimeout: (fn: () => void) => { timers.push(fn); return 1; }, clearTimeout: () => {},
      require(name: string) {
        if (name === "@/lib/i18n/revamp-money") return revampMoney;
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
        if (name === "react") return { useState(value: unknown) { const index = cursor++; if (!(index in state)) state[index] = typeof value === "function" ? value() : value; return [state[index], (next: unknown) => { state[index] = typeof next === "function" ? next(state[index]) : next; }]; }, useRef(value: unknown) { const index = cursor++; if (!(index in state)) state[index] = { current: value }; return state[index]; }, useEffect(fn: () => void) { if (initial) fn(); }, useTransition: () => [false, forbidden] };
        if (name === "next/image") return { default: "Image" };
        if (name === "next/navigation") return { useRouter: () => ({ push: () => {} }) };
        if (name === "@/lib/ui/useGoBack") return { useGoBack: () => () => {} };
        if (name === "@/components/I18nProvider") return { useT: () => ({ currency, t: (key: string) => key }) };
        if (name === "@/components/ui/kit") return { T: {}, Ico: new Proxy({}, { get: () => () => null }), AppBar: "AppBar", IconButton: "IconButton", Card: "Card", Btn: "Btn", Chip: "Chip", Money: "Money", Progress: "Progress", PoweredByStellar: "PoweredByStellar" };
        if (name === "@/components/ui/SuccessMotion") return { default: (props: Record<string, unknown>) => jsx("SuccessMotion", { ...props, children: [props.title, props.children] }) };
        if (name === "@/lib/local-preview") return preview;
        if (name === "@/lib/savings-preview") return helper.exports;
        if (name === "@/lib/ui/currency") return { CURRENCY, formatLocal, formatLocalAmount, pesoFromLocal };
        if (name === "@/lib/ui/useUnresolvedSubmission") return { useUnresolvedSubmission: forbidden };
        if (name === "@/app/actions") return new Proxy({}, { get: () => forbidden });
        if (name === "@/lib/savings") return new Proxy({}, { get: () => () => { calls.legacyStorage++; throw new Error("Unexpected live goal storage"); } });
        return {};
      },
    });
    const render = () => { cursor = 0; const next = component.exports.default(); initial = false; return next; }; let tree = render(); while (timers.length) timers.shift()!(); tree = render();
    const find = (predicate: (node: Element) => boolean) => { const node = nodes(tree).find(predicate); assert.ok(node, `Missing control: ${text(tree)}`); return node; };
    return { get tree() { return tree; }, render() { tree = render(); }, button(label: string) { return find(node => ["Btn", "button"].includes(node.type) && text(node) === label); },
      click(label: string) { const node = this.button(label); (node.props.onClick as () => void)(); tree = render(); },
      change(label: string, value: string) { const node = find(node => node.type === "input" && node.props["aria-label"] === label); (node.props.onChange as (event: unknown) => void)({ target: { value } }); tree = render(); },
    };
  }
  return { api: helper.exports, data, calls, mount, mode(next?: typeof mode) { mode = next; }, currency(next: Locale) { currency = next; } };
}
function current(env: ReturnType<typeof setup>) { const result = env.api.readSavingsPreview(); if (!result.ok) throw new Error(result.error); return result.value; }
function review(env: ReturnType<typeof setup>, input: object) { const result = env.api.reviewSavingsPreview(current(env), input); if (!result.ok) throw new Error(result.error); return result.value; }
function confirm(env: ReturnType<typeof setup>, value: SavingsPreviewReview) { const result = env.api.confirmSavingsPreview(value); if (!result.ok) throw new Error(result.error); return result.value; }
function create(env: ReturnType<typeof setup>, mode: SavingsPreviewGoal["mode"] = "disciplined") { const value = review(env, { kind: "create", name: "Rainy day", mode, money: { amount: "10", currency: "en" } }); confirm(env,value); return value.goalId; }
function noExternal(env: ReturnType<typeof setup>) { assert.equal(env.calls.server, 0); assert.equal(env.calls.network, 0); assert.equal(env.calls.legacyStorage, 0); }

test("non-preview and server contexts deny all local savings reads and writes", () => {
  for (const options of [{ preview: false }, { server: true }]) { const env = setup(options); assert.equal(env.api.readSavingsPreview().ok,false); assert.equal(env.api.confirmSavingsPreview({} as SavingsPreviewReview).ok,false); assert.equal(env.calls.writes,0); }
});
test("every currency uses the shared exact units and rejects unsupported decimal precision/oversize", () => {
  const env = setup();
  for (const currency of ["en","tl","id","vi"] as const) {
    const amount = currency === "en" || currency === "tl" ? "10.25" : "10000";
    assert.equal(env.api.savingsPreviewAmount({amount,currency}),money.moneyInputToStroops({amount,currency}));
    for (const invalid of ["0","-1","1e4","Infinity","1"+"0".repeat(308),"1.001",...(currency === "id" || currency === "vi" ? ["1.5"] : [])]) assert.equal(env.api.savingsPreviewAmount({amount:invalid,currency}),null);
  }
});
test("review is read-only; confirmation persists integer units and reload reconstructs the exact goal", () => {
  const env = setup(); const value=review(env,{kind:"create",name:"Emergency",mode:"flexible",money:{amount:"10.25",currency:"en"}}); assert.equal(env.calls.writes,0); confirm(env,value);
  const restored=setup({data:env.data}); assert.equal(current(restored).goals[0].target,money.moneyInputToStroops({amount:"10.25",currency:"en"})!.toString()); assert.equal(current(restored).goals[0].saved,"0"); assert.deepEqual(Object.keys(JSON.parse(env.data.get(env.api.SAVINGS_PREVIEW_KEY)!)).sort(),["confirmed","goals","revision","version","wallet"]); noExternal(env);
});
test("duplicate confirmation is idempotent; stale reviews cannot overwrite newer local deposits", () => {
  const env=setup(); const id=create(env); const first=review(env,{kind:"deposit",goalId:id,money:{amount:"1",currency:"en"}}); const stale=review(env,{kind:"deposit",goalId:id,money:{amount:"2",currency:"en"}}); const saved=confirm(env,first); assert.equal(confirm(env,first).duplicate,true); assert.equal(env.api.confirmSavingsPreview(stale).ok,false); assert.equal(current(env).goals[0].saved,saved.state.goals[0].saved);
});
test("disciplined target blocks early/partial withdrawals and releases the full reached tally only", () => {
  const env=setup(); const id=create(env); const add=(amount:string)=>confirm(env,review(env,{kind:"deposit",goalId:id,money:{amount,currency:"en"}})); add("5"); assert.equal(env.api.reviewSavingsPreview(current(env),{kind:"withdraw",goalId:id}).ok,false); add("5"); const release=review(env,{kind:"withdraw",goalId:id}); assert.equal(release.amount,current(env).goals[0].saved); assert.equal(env.api.confirmSavingsPreview({...release,amount:"1"}).ok,false); confirm(env,release); assert.equal(current(env).goals[0].saved,"0");
});
test("flexible withdrawal conserves exact units and cannot exceed saved tally", () => {
  const env=setup(); const id=create(env,"flexible"); confirm(env,review(env,{kind:"deposit",goalId:id,money:{amount:"10.25",currency:"en"}})); const before=BigInt(current(env).goals[0].saved); const release=review(env,{kind:"withdraw",goalId:id,money:{amount:"2.15",currency:"en"}}); confirm(env,release); assert.equal(BigInt(current(env).goals[0].saved),before-BigInt(release.amount)); assert.equal(env.api.reviewSavingsPreview(current(env),{kind:"withdraw",goalId:id,money:{amount:"100",currency:"en"}}).ok,false);
});
test("malformed/wrong-wallet session state is not silently cleared or overwritten", () => {
  const env=setup(); for(const raw of ["{","null",JSON.stringify({version:2}),JSON.stringify({version:1,wallet:"other",revision:0,goals:[],confirmed:[]})]) { env.data.set(env.api.SAVINGS_PREVIEW_KEY,raw); assert.equal(env.api.readSavingsPreview().ok,false); assert.equal(env.api.confirmSavingsPreview({} as SavingsPreviewReview).ok,false); assert.equal(env.data.get(env.api.SAVINGS_PREVIEW_KEY),raw); }
});
test("malformed/null reviews and noncanonical stored units fail closed without a write",()=>{
  const env=setup(); create(env); const before=env.data.get(env.api.SAVINGS_PREVIEW_KEY)!;
  for(const invalid of [null,undefined,{}, {id:"x",kind:"withdraw"}, {id:"0".repeat(36),goalId:"0".repeat(36),revision:1,kind:"deposit",amount:"01"}, {id:"0".repeat(36),goalId:"0".repeat(36),revision:1,kind:"delete",amount:"1"}]) assert.equal(env.api.confirmSavingsPreview(invalid as SavingsPreviewReview).ok,false);
  assert.equal(env.data.get(env.api.SAVINGS_PREVIEW_KEY),before);
  const state=JSON.parse(before); for(const value of ["00","01","-1",null,"1e3","9".repeat(18)]) { state.goals[0].saved=value; const raw=JSON.stringify(state); env.data.set(env.api.SAVINGS_PREVIEW_KEY,raw); assert.equal(env.api.readSavingsPreview().ok,false); assert.equal(env.data.get(env.api.SAVINGS_PREVIEW_KEY),raw); }
});
for(const mode of ["get","set","drop"] as const) test(`actual UI ${mode}: denied persistence cannot show saved success or overwrite prior goals`,()=>{
  const env=setup(); const ui=env.mount(); ui.change("Local goal name","Emergency"); ui.change("Local goal target","10"); ui.click("Review local goal"); assert.equal(env.calls.writes,0); env.mode(mode); ui.click("Confirm local savings demo"); assert.ok(nodes(ui.tree).some(node=>node.props.role==="alert")); assert.ok(!nodes(ui.tree).some(node=>node.type==="SuccessMotion")); assert.equal(env.data.size,0); noExternal(env);
});
test("actual UI create/deposit/review/cancel/confirm/reload preserves one local goal and has no live boundaries",()=>{
  const env=setup(); const ui=env.mount(); ui.change("Local goal name","Emergency"); ui.change("Local goal target","10"); ui.click("Review local goal"); ui.click("Edit before confirming"); assert.equal(env.data.size,0); ui.click("Review local goal"); const duplicate=ui.button("Confirm local savings demo").props.onClick as ()=>void; ui.click("Confirm local savings demo"); duplicate(); ui.render(); assert.equal(current(env).goals.length,1); assert.equal(current(env).revision,1); ui.change("Local savings deposit","5"); ui.click("Review deposit demo"); ui.click("Confirm local savings demo"); assert.equal(ui.button("Review withdrawal demo").props.disabled,true); const reloaded=env.mount(); assert.match(text(reloaded.tree),/Emergency/); reloaded.change("Local savings deposit","5"); reloaded.click("Review deposit demo"); reloaded.click("Confirm local savings demo"); assert.equal(reloaded.button("Review withdrawal demo").props.disabled,false); reloaded.click("Review withdrawal demo"); reloaded.click("Confirm local savings demo"); assert.equal(current(env).goals[0].saved,"0"); assert.match(text(reloaded.tree),/No wallet balance changed and no money moved/); noExternal(env);
});
test("actual flexible flow rejects overdraft and displays checked partial withdrawal with unchanged wallet",()=>{
  const env=setup(); const ui=env.mount(); ui.change("Local goal name","Flexible fund"); ui.change("Local goal target","20"); ui.click("FlexibleWithdraw any positive demo amount up to the saved amount."); ui.click("Review local goal"); ui.click("Confirm local savings demo"); ui.change("Local savings deposit","10"); ui.click("Review deposit demo"); ui.click("Confirm local savings demo"); ui.change("Local savings withdrawal","20"); assert.equal(ui.button("Review withdrawal demo").props.disabled,true); ui.click("Review withdrawal demo"); assert.ok(nodes(ui.tree).some(node=>node.props.role==="alert")); ui.change("Local savings withdrawal","2"); ui.click("Review withdrawal demo"); ui.click("Confirm local savings demo"); assert.equal(current(env).goals[0].saved,(money.moneyInputToStroops({amount:"10",currency:"en"})!-money.moneyInputToStroops({amount:"2",currency:"en"})!).toString()); noExternal(env);
});
test("actual UI rejects malformed/oversized input even if disabled review is invoked",()=>{
  const env=setup(); const ui=env.mount(); ui.change("Local goal name","Invalid"); for(const value of ["1"+"0".repeat(308),"-2","5e2","1.001","0"]) { ui.change("Local goal target",value); assert.equal(ui.button("Review local goal").props.disabled,true); ui.click("Review local goal"); assert.ok(nodes(ui.tree).some(node=>node.props.role==="alert")); assert.equal(env.data.size,0); } noExternal(env);
});
test("actual UI blocked initial read offers recovery without clearing corrupt or private session data",()=>{
  const env=setup({mode:"get"}); const ui=env.mount(); assert.match(text(ui.tree),/Your session could not load/); assert.ok(nodes(ui.tree).some(node=>node.props.role==="alert")); assert.equal(env.calls.writes,0); env.mode(); ui.click("Retry reading local savings"); assert.ok(nodes(ui.tree).some(node=>node.type==="input"&&node.props["aria-label"]==="Local goal name")); noExternal(env);
});
test("failed confirmation invalidates retained handlers and requires a fresh session load and review",()=>{
  const env=setup(); const ui=env.mount(); ui.change("Local goal name","Safe retry"); ui.change("Local goal target","10"); ui.click("Review local goal"); const retained=ui.button("Confirm local savings demo").props.onClick as ()=>void;
  env.mode("set"); ui.click("Confirm local savings demo"); const writes=env.calls.writes; env.mode(); retained(); ui.render(); assert.equal(env.calls.writes,writes); assert.match(text(ui.tree),/Your session could not load/);
  ui.click("Retry reading local savings"); ui.click("Review local goal"); ui.click("Confirm local savings demo"); assert.equal(current(env).goals.length,1); assert.equal(current(env).revision,1); noExternal(env);
});
test("explicit cancel and subsequent state reload invalidate a retained old confirm handler",()=>{
  const env=setup(); const ui=env.mount(); ui.change("Local goal name","Cancelled"); ui.change("Local goal target","10"); ui.click("Review local goal"); const retained=ui.button("Confirm local savings demo").props.onClick as ()=>void;
  ui.click("Edit before confirming"); retained(); ui.render(); assert.equal(env.data.size,0); assert.equal(env.calls.writes,0);
  ui.click("Review local goal"); const failedHandler=ui.button("Confirm local savings demo").props.onClick as ()=>void; env.mode("get"); ui.click("Confirm local savings demo"); env.mode(); ui.click("Retry reading local savings"); failedHandler(); ui.render(); assert.equal(env.data.size,0); assert.equal(env.calls.writes,0); noExternal(env);
});
test("an existing goal's denied save keeps its exact prior snapshot and no successful release claim",()=>{
  const env=setup(); const id=create(env,"flexible"); confirm(env,review(env,{kind:"deposit",goalId:id,money:{amount:"10",currency:"en"}})); const prior=env.data.get(env.api.SAVINGS_PREVIEW_KEY)!; const release=review(env,{kind:"withdraw",goalId:id,money:{amount:"2",currency:"en"}});
  for(const denied of ["set","drop"] as const) { env.mode(denied); assert.equal(env.api.confirmSavingsPreview(release).ok,false); assert.equal(env.data.get(env.api.SAVINGS_PREVIEW_KEY),prior); } noExternal(env);
});
test("switching display currency during review changes only the illustrative display, not stored exact units",()=>{
  const env=setup(); const ui=env.mount(); ui.change("Local goal name","Currency"); ui.change("Local goal target","10.25"); ui.click("Review local goal"); env.currency("id"); ui.render(); ui.click("Confirm local savings demo"); assert.equal(current(env).goals[0].target,money.moneyInputToStroops({amount:"10.25",currency:"en"})!.toString()); noExternal(env);
});
test("Home and Vaults mark savings coming soon while retaining isolated development code",()=>{
  const home=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
  assert.match(home,/title: "Smart Savings".*coming: true/); assert.match(home,/tile\.coming && <span[^>]+>\{copy\("Coming soon"\)\}<\/span>/);
  const vaults=readFileSync(new URL("../components/screens/VaultsScreen.tsx",import.meta.url),"utf8"); assert.doesNotMatch(vaults,/<Link href="\/savings"/); assert.match(vaults,/vault-savings-coming-soon/);
  const savings=readFileSync(new URL("../components/screens/SavingsScreen.tsx",import.meta.url),"utf8"); assert.match(savings,/return isLocalPreview \? <PreviewSavingsScreen \/> : <LiveSavingsScreen \/>/); assert.match(savings,/useUnresolvedSubmission\("savings:experimental"\)/); assert.match(savings,/submission\.run\(\(\) => smartSavingsDeposit/);
});
