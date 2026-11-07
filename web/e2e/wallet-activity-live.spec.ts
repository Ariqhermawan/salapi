import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import ts from "typescript";

// Real Activity component, refresh transport and ledger watcher. Auth, ledger
// signals and confirmed pages are isolated fixtures, not actual transactions.
const owner = "00000000-0000-4000-8000-000000000001";
const wallet = "GDWYDMY2WDL4MCKMYQ6CWZJP526K6YHLRK3EG6IF2IJTX3EHZU3RRB72";
const counterparty = "GCBKRBBNTQ2YA7U7SOC2NTZCCACFIIQCLKKO2FJYL5WJP5QVYH6UNDHL";
const coverPath = "/circles/generated/tino-relief.png";
const campaignTitle = "Tino survivors, Cebu - rebuild a fishing barangay";
const explorerReceipt = `https://stellar.expert/explorer/testnet/tx/${"a".repeat(64)}`;
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
  "@/lib/i18n/circles-content": compile("lib/i18n/circles-content.ts"),
  "@/lib/vault-campaign-cover": compile("lib/vault-campaign-cover.ts"),
  "./circles/seed": compile("lib/circles/seed.ts"),
  "./organizers": compile("lib/circles/organizers.ts"),
  "./ActivityReceiptSheet": compile("components/screens/ActivityReceiptSheet.tsx"),
  screen: compile("components/screens/ActivityScreen.tsx"),
};
const readCss = (name: string) => readFileSync(join(process.cwd(), `components/screens/${name}.module.css`), "utf8");
const css = `${readCss("ActivityRevamp")}\n${readCss("ActivityReceiptSheet").replace(/\.([a-zA-Z][\w-]*)/g, ".receiptSheet-$1")}`;
async function mount(page: Page, width = 390, stream = true, withQuote = false) {
  await page.setViewportSize({ width, height: 844 });
  await page.clock.install();
  await page.route(`https://activity-fixture.test${coverPath}`, route => route.fulfill({
    path: join(process.cwd(), "public", coverPath),
  }));
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><base href="https://activity-fixture.test/"><title>Activity live update QA</title><style>body{font:16px Arial;background:#f4f7fb;margin:0}*{box-sizing:border-box}button{font:inherit;cursor:pointer}#app-content{height:844px;overflow:auto;max-width:660px;margin:auto}${css}</style><main id="app-content"><div id="fixture-root"></div></main>`);
  await page.addScriptTag({ content: `
    const f=window.fixture={owner:'${owner}',streams:[],reads:[],hold:false,pending:[],items:[],online:true,visibility:'visible',clipboard:null};
    const quoteTime=Math.floor(Date.now()/1000);
    const priceSnapshot=${withQuote}
      ? {status:'fresh',source:'CoinGecko',fetchedAt:quoteTime,assets:{xlm:{prices:{usd:0.2},updatedAt:quoteTime},usdc:{prices:{usd:1},updatedAt:quoteTime}}}
      : {status:'unavailable',source:'CoinGecko'};
    const auths=new Set(),cache={},modules={${Object.entries(sources).map(([id, code]) => `${JSON.stringify(id)}:(module,exports,require)=>{${code}\n}`).join(",")}};
    function require(id){if(id in stubs)return stubs[id];if(cache[id])return cache[id].exports;if(!modules[id])throw Error('Unexpected dependency '+id);const m=cache[id]={exports:{}};modules[id](m,m.exports,require);return m.exports;}
    const React=()=>require('react');
    const stubs={
      'next/link':{__esModule:true,default:p=>React().createElement('a',p,p.children)},
      'next/image':{__esModule:true,default:({fill,unoptimized,style,...p})=>React().createElement('img',{...p,style:fill?{position:'absolute',inset:0,width:'100%',height:'100%',...style}:style})},
      '@/components/AccountAvatar':{__esModule:true,default:p=>React().createElement('span',{'aria-label':p.alt},p.name.slice(0,1))},
      '@/components/MarketPricesProvider':{useMarketPrices:()=>({prices:priceSnapshot})},
      '@/components/I18nProvider':{useT:()=>({currency:'en',locale:'en'})},
      '@/lib/ui/useGoBack':{useGoBack:()=>()=>{}},
      '@/lib/ui/currency':{formatLocal:String},
      '@/lib/local-preview':{isLocalPreview:false,PREVIEW_WALLET:{}},
      '@/lib/local-preview-history':{listPreviewTransfers:()=>{throw Error('No preview records')}},
      '@/lib/supabase/env':{supabaseConfigured:()=>true},
      '@/lib/supabase/client':{createSupabaseBrowser:()=>({auth:{getUser:async()=>({data:{user:f.owner?{id:f.owner}:null}}),onAuthStateChange(cb){auths.add(cb);return {data:{subscription:{unsubscribe:()=>auths.delete(cb)}}}}}})},
      '@/components/ui/kit':{Ico:new Proxy({},{get:()=>()=>null}),T:{action:'#4666e5'},IconButton:p=>React().createElement('button',{'aria-label':p.ariaLabel,onClick:p.onClick},p.children),PoweredByStellar:()=>React().createElement('p',null,'Powered by Stellar')},
      '@/components/ui/icons':{Ico:new Proxy({},{get:()=>()=>null})},
      './ActivityRevamp.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>key})},
      './ActivityReceiptSheet.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>'receiptSheet-'+key})},
    };
    f.item=(id,amount='10000000')=>({id:id+':payment',hash:'a'.repeat(64),createdAt:'2026-10-08T09:00:00Z',direction:'received',amountStroops:amount,counterparty:'${counterparty}',kind:'payment',asset:require('@/lib/wallet-activity').XLM_ACTIVITY_ASSET,fee:{status:'unavailable'}});
    f.items=Array.from({length:12},(_,i)=>f.item(String(200-i)));
    f.items[2].fee={status:'available',amountStroops:'321',payer:'${wallet}',paidByWallet:true,transactionHash:'a'.repeat(64),feeBump:false};
    const campaign={type:'campaign-donation',contractId:'C'+'A'.repeat(55),referenceId:'9',title:${JSON.stringify(campaignTitle)}};
    f.items[3]={...f.items[3],direction:'sent',kind:'soroban-transfer',counterparty:campaign.contractId,context:{...campaign,circleId:'tino-relief'}};
    f.items[4]={...f.items[4],direction:'sent',kind:'soroban-transfer',counterparty:campaign.contractId,context:{...campaign,referenceId:'10'}};
    f.identities=[{address:'${wallet}',handle:'wallet_handle',photoUrl:null},{address:'${counterparty}',handle:'counterparty_handle',photoUrl:null}];
    window.fetch=(url,options)=>{if(!String(url).startsWith('/api/account/activity')||(options.method&&options.method!=='GET'))throw Error('Unexpected write');f.reads.push({url,owner:f.owner});const value={ok:true,ownerId:f.owner,address:'${wallet}',items:[...f.items],identities:[...f.identities],nextCursor:null};return f.hold?new Promise(resolve=>f.pending.push(()=>resolve({ok:true,json:async()=>value}))):Promise.resolve({ok:true,json:async()=>value});};
    window.EventSource=${stream ? `class{constructor(url){this.url=url;this.closed=false;f.streams.push(this)}close(){this.closed=true}}` : "undefined"};
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>f.visibility});
    Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>f.online});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{f.clipboard=value;}}});
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
for (const width of [375, 1280]) test(`compact Activity and open receipt survive a background transfer at ${width}px`, async ({ page }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await mount(page, width, true, true);
  const first = page.locator("[data-activity-native-amount]").first(); await expect(first).toHaveText("+1");
  const estimate = page.locator('[data-activity-equivalent="fresh"]').first();
  await expect(estimate).toHaveText("≈ 0.20 USDC · Market estimate");
  const primary = await first.boundingBox();
  const secondary = await estimate.boundingBox();
  expect(primary && secondary && primary.y < secondary.y && primary.height > secondary.height).toBe(true);

  const campaigns = page.locator('[data-activity-purpose="campaign-donation"]');
  const linked = campaigns.first();
  await expect(linked).toContainText(campaignTitle);
  await expect(linked.locator("[data-activity-native-amount]")).toHaveText("−1");
  await expect(linked.locator('[data-activity-equivalent="fresh"]')).toHaveText("≈ 0.20 USDC · Market estimate");
  const cover = linked.locator(`img[src="${coverPath}"]`);
  await expect(cover).toBeVisible();
  await expect.poll(() => cover.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(campaigns.nth(1)).toContainText(campaignTitle);
  await expect(campaigns.nth(1).locator(`img[src="${coverPath}"]`)).toHaveCount(0);

  const trigger = page.locator('[data-activity-receipt-trigger="198:payment"]');
  await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  await expect(trigger).toContainText("@counterparty_handle");
  await page.locator("#app-content").evaluate(e => { e.scrollTop = 120; });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Transaction details" });
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-controls", "activity-receipt-198:payment");
  await expect(dialog).toHaveAttribute("id", "activity-receipt-198:payment");
  const bounds = (await dialog.boundingBox())!;
  const verticalAnchor = width < 641 ? bounds.y + bounds.height : bounds.y + bounds.height / 2;
  expect(verticalAnchor).toBeCloseTo(width < 641 ? 844 : 422, 0);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
  const close = dialog.getByRole("button", { name: "Close transaction details" });
  await expect(close).toBeFocused();
  await expect(dialog.getByText("Amount received", { exact: true })).toBeVisible();
  await expect(dialog).not.toContainText("Arisan / Paluwagan");
  await expect(dialog.locator("[data-activity-receipt-amount]")).toHaveText("+1 XLM");
  await expect(dialog.locator('[data-activity-receipt-estimate="fresh"]')).toHaveText("≈ 0.20 USDC · Market estimate");
  await expect(dialog).toContainText("@counterparty_handle");
  await expect(dialog).toContainText("@wallet_handle");
  await expect(dialog).toContainText("0.0000321 XLM");
  const stellarLink = dialog.getByRole("link", { name: "View transaction on Stellar ↗" });
  await expect(stellarLink).toBeVisible();
  await expect(stellarLink).toHaveAttribute("href", explorerReceipt);
  await page.screenshot({ path: testInfo.outputPath(`transfer-receipt-${width}.png`) });
  const details = dialog.locator("[data-activity-on-chain-details]");
  await expect(details).toBeVisible();
  await expect(details.locator("summary")).toContainText("On-chain details");
  await expect(dialog.locator("[data-activity-receipt-hash]")).toHaveText("aaaaaaaa…aaaaaaaa");
  const fullHash = details.getByText("a".repeat(64), { exact: true });
  await expect(fullHash).toBeHidden();
  await dialog.getByRole("button", { name: "Copy transaction hash" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Transaction hash copied");
  expect(await page.evaluate(() => (window as unknown as { fixture: { clipboard: string } }).fixture.clipboard)).toBe("a".repeat(64));
  await details.locator("summary").click();
  await expect(fullHash).toBeVisible();
  await expect(details.getByText("10000000", { exact: true })).toBeVisible();
  await expect(details.getByText(counterparty, { exact: true })).toBeVisible();
  await expect(stellarLink).toBeVisible();
  const scrollPosition = await page.locator("#app-content").evaluate(e => e.scrollTop);
  await incoming(page); await expect(first).toHaveText("+7");
  await expect(page.locator("[data-activity-native-amount]")).toHaveCount(13);
  await expect(dialog).toBeVisible();
  await expect(details).toHaveAttribute("open", "");
  await expect(dialog).toContainText("@counterparty_handle");
  expect(await page.locator("#app-content").evaluate(e => e.scrollTop)).toBeGreaterThanOrEqual(scrollPosition);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  const campaignTrigger = linked.getByRole("button");
  await campaignTrigger.click();
  await expect(dialog.locator("[data-activity-receipt-amount]")).toHaveText("−1 XLM");
  await expect(dialog.locator('[data-activity-receipt-estimate="fresh"]')).toHaveText("≈ 0.20 USDC · Market estimate");
  await expect(dialog.locator(`img[src="${coverPath}"]`)).toBeVisible();
  await expect(dialog.getByRole("link", { name: "View campaign", exact: true })).toHaveAttribute("href", "/circles/tino-relief");
  await page.screenshot({ path: testInfo.outputPath(`donation-receipt-${width}.png`) });
  await close.click();
  await expect(dialog).toBeHidden();
  await expect(campaignTrigger).toBeFocused();
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
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("From @counterparty_handle", { exact: true })).toHaveCount(0);
});
