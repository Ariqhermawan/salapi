import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import ts from "typescript";

// Actual React components + private-read hook. Auth and HTTP are controlled
// fixtures, not proof of a real login, wallet balance or on-chain donation.
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const fixtureRequire = createRequire(join(process.cwd(), "package.json"));
const compile = (path: string) => ts.transpileModule(readFileSync(join(process.cwd(), path), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const productionModule = (pkg: string, name: string) => readFileSync(join(dirname(fixtureRequire.resolve(`${pkg}/package.json`)), "cjs", name), "utf8");
const sources = {
  react: productionModule("react", "react.production.js"),
  "react/jsx-runtime": productionModule("react", "react-jsx-runtime.production.js"),
  "react-dom": productionModule("react-dom", "react-dom.production.js"),
  "react-dom/client": productionModule("react-dom", "react-dom-client.production.js"),
  scheduler: productionModule("scheduler", "scheduler.production.js"),
  "@/lib/format-stroops": compile("lib/format-stroops.ts"),
  "@/lib/campaign-support": compile("lib/campaign-support.ts"),
  "@/lib/ui/useOwnedAccountRead": compile("lib/ui/useOwnedAccountRead.ts"),
  balance: compile("components/AvailableWalletBalance.tsx"),
  badge: compile("components/CampaignDonationBadge.tsx"),
};
const css = ["AvailableWalletBalance", "CampaignDonationBadge"].map(name => readFileSync(join(process.cwd(), `components/${name}.module.css`), "utf8")).join("\n");

async function mount(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px Arial;background:#f4f7fb;margin:0;padding:16px}main{max-width:430px;margin:auto}button{border:0;background:transparent}article{padding:12px;border:1px solid #ddd;border-radius:14px;background:white;margin:8px 0}${css}</style><main><h1>Before sending</h1><div id="fixture-root"></div></main>`);
  await page.addScriptTag({ content: `
    const f = window.fixture = {owner:'${owner}', reads:[], path:'/api/account/campaign-support?ids=1,2', amount:2000000000n};
    const auths = new Set();
    const cache = {};
    const modules = {${Object.entries(sources).map(([name, code]) => `${JSON.stringify(name)}:(module,exports,require)=>{${code}\n}`).join(",")}};
    const stubs = {
      '@/lib/supabase/env': {supabaseConfigured:()=>true},
      '@/lib/local-preview': {isLocalPreview:false},
      '@/components/I18nProvider': {useT:()=>({locale:'en'})},
      '@/lib/supabase/client': {createSupabaseBrowser:()=>({auth:{onAuthStateChange(cb){
        auths.add(cb);queueMicrotask(()=>cb('INITIAL_SESSION',f.owner?{user:{id:f.owner}}:null));
        return {data:{subscription:{unsubscribe(){auths.delete(cb)}}}};
      }}})},
      './AvailableWalletBalance.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>key})},
      './CampaignDonationBadge.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>key})},
    };
    function require(id){if(id in stubs)return stubs[id];if(cache[id])return cache[id].exports;
      if(!modules[id])throw Error('Unexpected fixture dependency: '+id);
      const module=cache[id]={exports:{}};modules[id](module,module.exports,require);return module.exports;}
    window.fetch=(url,options)=>new Promise(resolve=>f.reads.push({url,options,owner:f.owner,resolve:value=>resolve({ok:true,json:async()=>value})}));
    const React=require('react'), Balance=require('balance').default, Badge=require('badge').default;
    const valid=require('@/lib/campaign-support').validCampaignSupport;
    function App(){const state=require('@/lib/ui/useOwnedAccountRead').useOwnedAccountRead(f.path,valid);
      return React.createElement(React.Fragment,null,React.createElement(Balance,{amountStroops:f.amount}),
        React.createElement('article',null,'Campaign one ',React.createElement(Badge,{support:state.value?.contributions['1']})),
        React.createElement('article',null,'Campaign two ',React.createElement(Badge,{support:state.value?.contributions['2']})),
        React.createElement('output',{'data-testid':'support-state'},state.status));}
    const root=require('react-dom/client').createRoot(document.getElementById('fixture-root'));
    f.render=()=>require('react-dom').flushSync(()=>root.render(React.createElement(App)));
    f.auth=id=>{f.owner=id;for(const cb of auths)cb(id?'SIGNED_IN':'SIGNED_OUT',id?{user:{id}}:null)};
    f.render();
  ` });
  await expect.poll(() => page.evaluate(() => (window as unknown as { fixture: { reads: unknown[] } }).fixture.reads.length)).toBe(2);
}
async function answer(page: Page, index: number, value: object) {
  await page.evaluate(({ index, value }) => (window as unknown as { fixture: { reads: { resolve(value: object): void }[] } }).fixture.reads[index].resolve(value), { index, value });
}
const spending = (ownerId = owner) => ({ ok: true, ownerId, balance: { nativeStroops: "1001234567", reserveStroops: "10000000", liabilitiesStroops: "0", availableStroops: "991234567", checkedAt: "2026-10-08T00:00:00.000Z" } });
const support = (ownerId = owner) => ({ ok: true, ownerId, contributions: { "1": { status: "donated", amount: "100000000" }, "2": { status: "none", amount: "0" } } });
async function answerInitial(page: Page) {
  const urls = await page.evaluate(() => (window as unknown as { fixture: { reads: { url: string }[] } }).fixture.reads.map(read => read.url));
  for (let index = 0; index < urls.length; index++) await answer(page, index, urls[index].includes("spending") ? spending() : support());
}

for (const width of [375, 1280]) test(`available balance and confirmed donation marks remain compact at ${width}px`, async ({ page }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await mount(page, width); await answerInitial(page);
  const balance = page.getByTestId("available-wallet-balance");
  await expect(balance).toContainText("99.1234567 XLM");
  await expect(balance).toContainText("Leave room for network fees");
  await expect(balance.getByRole("alert")).toContainText("exceeds");
  await expect(page.getByTestId("campaign-donated-badge")).toHaveCount(1);
  await expect(page.locator("article").first()).toContainText("Already donated");
  await expect(page.locator("article").nth(1)).not.toContainText("Already donated");
  const button = await balance.getByRole("button", { name: "Refresh balance" }).boundingBox();
  expect(button!.width).toBeGreaterThanOrEqual(43.99); expect(button!.height).toBeGreaterThanOrEqual(43.99);
  for (const locator of [balance, page.locator("article").first()]) {
    const box = await locator.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  }
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`balance-and-donation-${width}.png`) });
});

test("account swap and logout discard both private balance and donation badges, even after late responses", async ({ page }) => {
  await mount(page); await answerInitial(page);
  await expect(page.getByTestId("campaign-donated-badge")).toBeVisible();
  await page.evaluate(other => (window as unknown as { fixture: { auth(id: string | null): void } }).fixture.auth(other), other);
  await expect(page.getByTestId("campaign-donated-badge")).toHaveCount(0);
  await expect(page.getByTestId("available-wallet-balance")).not.toContainText("99.1234567");
  await expect.poll(() => page.evaluate(() => (window as unknown as { fixture: { reads: unknown[] } }).fixture.reads.length)).toBe(4);
  await page.evaluate(() => (window as unknown as { fixture: { auth(id: string | null): void } }).fixture.auth(null));
  await answer(page, 2, spending(other)); await answer(page, 3, support(other));
  await expect(page.getByTestId("campaign-donated-badge")).toHaveCount(0);
  await expect(page.getByTestId("available-wallet-balance")).toHaveCount(0);
  await expect(page.getByTestId("support-state")).toHaveText("guest");
});

test("cookie owner mismatch and a changed catalog query cannot carry a previous user's donation mark", async ({ page }) => {
  await mount(page);
  const urls = await page.evaluate(() => (window as unknown as { fixture: { reads: { url: string }[] } }).fixture.reads.map(read => read.url));
  for (let index = 0; index < urls.length; index++) await answer(page, index, urls[index].includes("spending") ? spending(other) : support(other));
  await expect(page.getByTestId("support-state")).toHaveText("unavailable");
  await expect(page.getByTestId("campaign-donated-badge")).toHaveCount(0);
  await page.evaluate(() => { const f = (window as unknown as { fixture: { path: string; render(): void } }).fixture; f.path = null as unknown as string; f.render(); });
  await expect(page.getByTestId("support-state")).toHaveText("guest");
  await page.evaluate(() => { const f = (window as unknown as { fixture: { path: string; render(): void } }).fixture; f.path = "/api/account/campaign-support?ids=2"; f.render(); });
  await expect(page.getByTestId("support-state")).toHaveText("loading");
  await expect(page.getByTestId("campaign-donated-badge")).toHaveCount(0);
});
