import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import ts from "typescript";

// Real Activity component, refresh transport and ledger watcher. Auth, ledger
// signals and confirmed pages are isolated fixtures, not actual transactions.
const owner = "00000000-0000-4000-8000-000000000001";
const wallet = "GDWYDMY2WDL4MCKMYQ6CWZJP526K6YHLRK3EG6IF2IJTX3EHZU3RRB72";
const recipient = "GCBKRBBNTQ2YA7U7SOC2NTZCCACFIIQCLKKO2FJYL5WJP5QVYH6UNDHL";
const require = createRequire(join(process.cwd(), "package.json"));
const compile = (path: string) => ts.transpileModule(readFileSync(join(process.cwd(), path), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const pkg = (name: string, file: string) => readFileSync(join(dirname(require.resolve(`${name}/package.json`)), "cjs", file), "utf8");
const sources = {
  react: pkg("react", "react.production.js"), "react/jsx-runtime": pkg("react", "react-jsx-runtime.production.js"),
  "react-dom": pkg("react-dom", "react-dom.production.js"), "react-dom/client": pkg("react-dom", "react-dom-client.production.js"), scheduler: pkg("scheduler", "scheduler.production.js"),
  "@/lib/wallet-activity": compile("lib/wallet-activity.ts"),
  "@/lib/ui/wallet-activity-read": compile("lib/ui/wallet-activity-read.ts"),
  "@/lib/ui/watchWalletActivity": compile("lib/ui/watchWalletActivity.ts"),
  "@/lib/i18n/revamp-money": compile("lib/i18n/revamp-money.ts"),
  "@/lib/i18n/wallet-activity": compile("lib/i18n/wallet-activity.ts"),
  screen: compile("components/screens/ActivityScreen.tsx"),
};
const css = readFileSync(join(process.cwd(), "components/screens/ActivityRevamp.module.css"), "utf8");
async function mount(page: Page, width = 390, stream = true) {
  await page.setViewportSize({ width, height: 844 });
  await page.clock.install();
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><title>Activity live update QA</title><style>body{font:16px Arial;background:#f4f7fb;margin:0}*{box-sizing:border-box}button{font:inherit;cursor:pointer}#app-content{height:844px;overflow:auto;max-width:660px;margin:auto}${css}</style><main id="app-content"><div id="fixture-root"></div></main>`);
  await page.addScriptTag({ content: `
    const f=window.fixture={owner:'${owner}',streams:[],reads:[],hold:false,pending:[],items:[],online:true,visibility:'visible'};
    const auths=new Set(),cache={},modules={${Object.entries(sources).map(([id, code]) => `${JSON.stringify(id)}:(module,exports,require)=>{${code}\n}`).join(",")}};
    function require(id){if(id in stubs)return stubs[id];if(cache[id])return cache[id].exports;if(!modules[id])throw Error('Unexpected dependency '+id);const m=cache[id]={exports:{}};modules[id](m,m.exports,require);return m.exports;}
    const React=()=>require('react');
    const stubs={
      'next/link':{__esModule:true,default:p=>React().createElement('a',p,p.children)},
      '@/components/AccountAvatar':{__esModule:true,default:p=>React().createElement('span',{'aria-label':p.alt},p.name.slice(0,1))},
      '@/components/MarketPricesProvider':{useMarketPrices:()=>({prices:{status:'unavailable',source:'CoinGecko'}})},
      '@/components/I18nProvider':{useT:()=>({currency:'en',locale:'en'})},
      '@/lib/ui/useGoBack':{useGoBack:()=>()=>{}},
      '@/lib/ui/currency':{formatLocal:String},
      '@/lib/local-preview':{isLocalPreview:false,PREVIEW_WALLET:{}},
      '@/lib/local-preview-history':{listPreviewTransfers:()=>{throw Error('No preview records')}},
      '@/lib/supabase/env':{supabaseConfigured:()=>true},
      '@/lib/supabase/client':{createSupabaseBrowser:()=>({auth:{getUser:async()=>({data:{user:f.owner?{id:f.owner}:null}}),onAuthStateChange(cb){auths.add(cb);return {data:{subscription:{unsubscribe:()=>auths.delete(cb)}}}}}})},
      '@/components/ui/kit':{Ico:new Proxy({},{get:()=>()=>null}),T:{action:'#4666e5'},IconButton:p=>React().createElement('button',{'aria-label':p.ariaLabel,onClick:p.onClick},p.children),PoweredByStellar:()=>React().createElement('p',null,'Powered by Stellar')},
      './ActivityRevamp.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>key})},
    };
    f.item=(id,amount='10000000')=>({id:id+':payment',hash:'a'.repeat(64),createdAt:'2026-10-08T09:00:00Z',direction:'received',amountStroops:amount,counterparty:'${recipient}',kind:'payment',asset:require('@/lib/wallet-activity').XLM_ACTIVITY_ASSET,fee:{status:'unavailable'}});
    f.items=Array.from({length:12},(_,i)=>f.item(String(200-i)));
    window.fetch=(url,options)=>{if(!String(url).startsWith('/api/account/activity')||options.method==='POST')throw Error('Unexpected write');f.reads.push({url,owner:f.owner});const value={ok:true,ownerId:f.owner,address:'${wallet}',items:[...f.items],nextCursor:null};return f.hold?new Promise(resolve=>f.pending.push(()=>resolve({ok:true,json:async()=>value}))):Promise.resolve({ok:true,json:async()=>value});};
    window.EventSource=${stream ? `class{constructor(url){this.url=url;this.closed=false;f.streams.push(this)}close(){this.closed=true}}` : "undefined"};
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>f.visibility});
    Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>f.online});
    f.incoming=()=>{f.items=[f.item('300','70000000'),...f.items];for(const s of f.streams)if(!s.closed)s.onmessage?.()};
    f.auth=id=>{f.owner=id;for(const cb of auths)cb(id?'SIGNED_IN':'SIGNED_OUT',id?{user:{id}}:null)};
    require('react-dom/client').createRoot(document.getElementById('fixture-root')).render(React().createElement(require('screen').default));
  ` });
  await expect(page.getByRole("heading", { name: "Your Testnet transfers" })).toBeVisible();
  await page.clock.runFor(250);
  await expect(page.locator("[data-activity-auto-update]")).toHaveText("Updates automatically while this page is open.");
}
async function incoming(page: Page) {
  await page.evaluate(() => (window as unknown as { fixture: { incoming(): void } }).fixture.incoming());
  await page.clock.runFor(250);
}
for (const width of [375, 1280]) test(`incoming transfer appears while standby without refresh or scroll reset at ${width}px`, async ({ page }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await mount(page, width);
  const first = page.locator("[data-activity-native-amount]").first(); await expect(first).toHaveText("+1");
  await page.getByRole("button", { name: /Received XLM/ }).nth(2).click();
  await expect(page.locator("#activity-receipt-198\\:payment")).toBeVisible();
  await page.locator("#app-content").evaluate(e => { e.scrollTop = 240; });
  await incoming(page); await expect(first).toHaveText("+7");
  await expect(page.locator("[data-activity-native-amount]")).toHaveCount(13);
  await expect(page.locator("#activity-receipt-198\\:payment")).toHaveCount(1);
  expect(await page.locator("#app-content").evaluate(e => e.scrollTop)).toBeGreaterThanOrEqual(200);
  expect(await page.locator("#app-content").evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  await page.locator("#app-content").evaluate(e => { e.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath(`activity-live-${width}.png`) }); expect(errors).toEqual([]);
});
test("periodic fallback catches an incoming transfer without a functioning ledger stream", async ({ page }) => {
  await mount(page, 390, false); await incoming(page);
  await expect(page.locator("[data-activity-native-amount]").first()).toHaveText("+1");
  await page.clock.fastForward(15_000); await page.clock.runFor(250);
  await expect(page.locator("[data-activity-native-amount]").first()).toHaveText("+7");
});
test("hidden/public-proof pages stop reads, foreground resumes and logout rejects a late private response", async ({ page }) => {
  await mount(page);
  await page.getByRole("tab", { name: "Public proof", exact: true }).click();
  const reads = await page.evaluate(() => (window as unknown as { fixture: { reads: unknown[] } }).fixture.reads.length);
  await page.clock.fastForward(30_000);
  expect(await page.evaluate(() => (window as unknown as { fixture: { reads: unknown[] } }).fixture.reads.length)).toBe(reads);
  await page.getByRole("tab", { name: "My activity", exact: true }).click(); await page.clock.runFor(250);
  await page.evaluate(() => { const f=(window as unknown as {fixture:{visibility:string}}).fixture;f.visibility='hidden';document.dispatchEvent(new Event('visibilitychange')); });
  await incoming(page); await page.clock.fastForward(30_000);
  await expect(page.locator("[data-activity-native-amount]").first()).toHaveText("+1");
  await page.evaluate(() => { const f=(window as unknown as {fixture:{visibility:string}}).fixture;f.visibility='visible';document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(250); await expect(page.locator("[data-activity-native-amount]").first()).toHaveText("+7");
  await page.evaluate(() => { (window as unknown as {fixture:{hold:boolean}}).fixture.hold=true; });
  await page.getByRole("button", { name: "Refresh activity", exact: true }).click();
  await expect(page.locator("[data-activity-native-amount]").first()).toHaveText("+7");
  await page.evaluate(() => { const f=(window as unknown as {fixture:{auth(id:null):void;pending:(()=>void)[]}}).fixture;f.auth(null);for(const reply of f.pending)reply(); });
  await expect(page.getByRole("heading", { name: "Sign in to see your transfers." })).toBeVisible();
  await expect(page.locator("[data-activity-native-amount]")).toHaveCount(0);
});
