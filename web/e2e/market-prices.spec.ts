import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { circlesCopy } from "../lib/i18n/revamp-circles";
import { homeCatalogCopy } from "../lib/i18n/revamp-home-catalog";
import type { Locale } from "../lib/i18n/config";

// Repository automated browser QA, localhost only. Not native Android or
// live-user transaction proof. Main's actual API verification is separate.
// Quotes and native balances below are clearly isolated UI test doubles. The
// actual walletState failure is verified first; no login, funding or transfer.
const output = "C:/Users/Lenovo/AppData/Local/Temp/salapi-coingecko-20261007-qa";
const fixtureWallet = { address: "GAKZLTZFGSSM372XUKW2ZIJ5GSHVVIW5BYZIKIXRW2BW4MM6TUI5536Y", pesos: 65000, pesoLabel: "Isolated legacy nominal", nativeStroops: "100000000000" };

function quote(now: number, price = .25, status: "fresh" | "stale" = "fresh", ageMs = 0) {
  const updatedAt = Math.floor((now - ageMs) / 1000);
  return { status, source: "CoinGecko", fetchedAt: Math.floor(now / 1000), assets: {
    xlm: { prices: { usd: price, php: price * 56, idr: price * 16000, vnd: price * 25000 }, updatedAt },
    usdc: { prices: { usd: .9998, php: 55.9888, idr: 15996.8, vnd: 24995 }, updatedAt },
  } };
}

async function setup(page: Page, priceBody: () => object, currency = "en", locale: Locale = "en") {
  const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
  const names = new Map(Object.entries(manifest.node as Record<string, { exportedName: string }>).map(([id, value]) => [id, value.exportedName]));
  expect([...names.values()]).toContain("walletState");
  const calls = { quotes: 0, walletFailuresVerified: 0, forbidden: [] as string[] };
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.addInitScript(selected => {
    localStorage.setItem("salapi_locale", selected.locale);
    localStorage.setItem("salapi_currency", selected.currency);
  }, { currency, locale });
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === "/api/market-prices") {
      expect(request.method()).toBe("GET"); calls.quotes++;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(priceBody()) });
    }
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) return route.continue();
    const name = names.get(request.headers()["next-action"]);
    if (name === "walletState") {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      const body = await response.text();
      const failure = '{"ok":false,"error":"Your wallet balance is unavailable."}';
      expect(body).toContain(failure);
      calls.walletFailuresVerified++;
      return route.fulfill({ response, body: body.replace(failure, JSON.stringify(fixtureWallet)) });
    }
    // These existing read-only actions retain their actual response, including
    // myHandle:null. No identity is invented or account switched by these tests.
    if (name === "myHandle" || name === "campaignState") return route.continue();
    calls.forbidden.push(name ?? `${request.method()} ${url.pathname}`);
    return route.fulfill({ status: 403, body: "Isolated market-price QA: mutation blocked" });
  });
  return { calls, errors };
}

async function openHome(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle(/Salapi/);
  await expect(page.locator("#app-content")).not.toBeEmpty();
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
  const market = page.locator('[data-market-value]');
  await expect(market).toHaveCount(1);
  return market;
}

test.describe("CoinGecko wallet estimates, isolated candidate browser QA", () => {
  test.beforeEach(({ baseURL }) => test.skip(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL!).hostname), "Local price/wallet fixtures never target live deployments"));

  test("fresh native balance estimate, expandable references and manual price change", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    let price = .25;
    const fixture = await setup(page, () => quote(Date.now(), price));
    const market = await openHome(page);
    await expect(market).toHaveAttribute("data-market-value", "fresh");
    await expect(market.getByRole("status")).toHaveText("≈ $2,500.00");
    const attribution = market.getByRole("link", { name: "CoinGecko", exact: true });
    await expect(attribution).toBeVisible(); await expect(attribution).toHaveAttribute("href", "https://www.coingecko.com");
    await expect(market.getByText("Price data by", { exact: false })).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; });
    const catalog = page.getByTestId("home-circles-catalog");
    const footer = catalog.getByRole("link", { name: "Sketch your own cause", exact: true });
    const usableBottom = await page.evaluate(() => {
      const nav = document.querySelector<HTMLElement>(".sl-tabbar")!, main = document.querySelector<HTMLElement>("#app-content")!;
      const controls = [...nav.querySelectorAll("button,button span")].map(node => node.getBoundingClientRect()).filter(rect => rect.height > 0 && rect.width > 0);
      return Math.min(innerHeight, main.getBoundingClientRect().bottom, nav.getBoundingClientRect().top, ...controls.map(rect => rect.top));
    });
    const footerRect = await footer.boundingBox(); expect(footerRect).not.toBeNull();
    expect(footerRect!.y + footerRect!.height).toBeLessThanOrEqual(usableBottom + 1);
    expect(await page.locator("#app-content").evaluate(node => node.scrollTop)).toBe(0);
    mkdirSync(output, { recursive: true });
    await page.screenshot({ path: join(output, "market-mobile-fresh-fit.png"), fullPage: false });
    const summary = market.getByLabel("CoinGecko prices", { exact: true });
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    await summary.click();
    await expect(market.getByText("10000 Native Testnet XLM", { exact: true })).toBeVisible();
    await expect(market).toContainText("XLM $0.25 · USDC $0.9998");
    await expect(market.getByText("USDC price reference only. This wallet holds Testnet XLM, not USDC.", { exact: true })).toBeVisible();
    await expect(market.getByText("Testnet tokens have no monetary value.", { exact: true })).toBeVisible();
    const timestamp = await market.locator("time").getAttribute("datetime"); expect(timestamp).toMatch(/T/);
    price = .3;
    await market.getByRole("button", { name: "Refresh prices", exact: true }).click();
    await expect(market.getByRole("status")).toHaveText("≈ $3,000.00");
    await expect(market).toContainText("XLM $0.30 · USDC $0.9998");
    expect(fixture.calls.quotes).toBe(2); expect(fixture.calls.walletFailuresVerified).toBe(1);
    expect(fixture.calls.forbidden).toEqual([]); expect(fixture.errors).toEqual([]);
    mkdirSync(output, { recursive: true });
    await page.screenshot({ path: join(output, "market-mobile-manual-refresh.png"), fullPage: false });
  });

  test("automatic 60-second price movement updates without refetching the native balance", async ({ page }) => {
    let now = Date.now(), price = .25;
    await page.clock.install({ time: new Date(now) });
    const fixture = await setup(page, () => quote(now, price));
    const market = await openHome(page);
    await expect(market.getByRole("status")).toHaveText("≈ $2,500.00");
    now += 61_000; price = .4;
    await page.clock.fastForward(61_000);
    await expect(market.getByRole("status")).toHaveText("≈ $4,000.00");
    expect(fixture.calls.quotes).toBe(2); expect(fixture.calls.walletFailuresVerified).toBe(1);
    expect(fixture.calls.forbidden).toEqual([]); expect(fixture.errors).toEqual([]);
  });

  test("stale last price is explicit, expired quotes disappear and unavailable never becomes zero", async ({ page }) => {
    let now = Date.now(), body: object = quote(now, .25, "stale", 121_000);
    await page.clock.install({ time: new Date(now) });
    const fixture = await setup(page, () => body);
    const market = await openHome(page);
    await expect(market).toHaveAttribute("data-market-value", "stale");
    await expect(market.getByRole("status")).toHaveText("≈ $2,500.00");
    await expect(market.locator("summary")).toContainText("Last known price");
    await market.locator("summary").click();
    body = { status: "unavailable", source: "CoinGecko", reason: "provider-unavailable" };
    await market.getByRole("button", { name: "Refresh prices", exact: true }).click();
    await expect(market).toHaveAttribute("data-market-value", "stale");
    // Continue only the read-only quote failure. Age, not provider recovery,
    // must remove the last known quote once its 5-minute lifetime has passed.
    now += 181_000; await page.clock.fastForward(181_000);
    await expect(market).toHaveAttribute("data-market-value", "unavailable");
    await expect(market.getByRole("status")).toHaveText("Market price unavailable");
    await expect(market.getByRole("status")).not.toContainText("$0");
    await expect(market.getByText("10000 Native Testnet XLM", { exact: true })).toBeVisible();
    expect(fixture.calls.forbidden).toEqual([]); expect(fixture.errors).toEqual([]);
    mkdirSync(output, { recursive: true });
    await page.screenshot({ path: join(output, "market-unavailable-expired.png"), fullPage: false });
  });

  test("missing configuration is truthful and does not fall back to old fixed valuation", async ({ page }) => {
    const fixture = await setup(page, () => ({ status: "unavailable", source: "CoinGecko", reason: "not-configured" }));
    const market = await openHome(page);
    await expect(market).toHaveAttribute("data-market-value", "unavailable");
    await expect(market.getByRole("status")).toHaveText("Market price unavailable");
    await expect(market.getByRole("status")).not.toContainText("$1,120");
    await expect(market.getByRole("status")).not.toContainText("$0");
    expect(fixture.calls.forbidden).toEqual([]); expect(fixture.errors).toEqual([]);
  });

  const fitCases: { state: "fresh" | "stale" | "unavailable"; locale: Locale; viewport: { width: number; height: number } }[] = [
    ...(["fresh", "stale", "unavailable"] as const).map(state => ({ state, locale: state === "unavailable" ? "id" as const : "en" as const, viewport: { width: 1280, height: 800 } })),
    ...(["tl", "id", "vi"] as const).map(locale => ({ state: "fresh" as const, locale, viewport: { width: 390, height: 844 } })),
  ];
  for (const { state, locale, viewport } of fitCases) test.describe(`${locale} ${viewport.width}x${viewport.height} ${state} market-state fit`, () => {
    test.use({ viewport, isMobile: viewport.width < 1024, hasTouch: viewport.width < 1024 });
    test(`full Home footer fits at ${viewport.width}x${viewport.height} with ${state} price status`, async ({ page }) => {
      // The production app frame is shorter than its desktop browser viewport.
      // Include the longer localized unavailable copy, not only short USD text.
      const body = () => state === "unavailable"
        ? { status: "unavailable", source: "CoinGecko", reason: "provider-unavailable" }
        : quote(Date.now(), .25, state, state === "stale" ? 121_000 : 0);
      const fixture = await setup(page, body, "en", locale);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const market = await openHome(page);
      await expect(market).toHaveAttribute("data-market-value", state);
      await expect(market.getByRole("status")).toHaveText(state === "unavailable" ? "Harga pasar tidak tersedia" : "≈ $2,500.00");
      await expect(market.getByRole("link", { name: "CoinGecko", exact: true })).toBeVisible();
      const catalog = page.getByTestId("home-circles-catalog");
      await expect(catalog).toHaveAttribute("data-catalog-ready", "true");
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await page.evaluate(async () => { await document.fonts.ready; });
      const geometry = await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>(".sl-app-frame")!, main = document.querySelector<HTMLElement>("#app-content")!, nav = document.querySelector<HTMLElement>(".sl-tabbar")!;
        const controls = [...nav.querySelectorAll("button,button span")].map(node => node.getBoundingClientRect()).filter(rect => rect.height > 0 && rect.width > 0);
        return { bottom: Math.min(innerHeight, frame.getBoundingClientRect().bottom, main.getBoundingClientRect().bottom, nav.getBoundingClientRect().top, ...controls.map(rect => rect.top)), scrollTop: main.scrollTop, documentScrollTop: document.scrollingElement?.scrollTop ?? 0 };
      });
      const c = circlesCopy(locale);
      const footerControls = [
        catalog.getByRole("link", { name: c("Sketch your own cause"), exact: true }),
        catalog.getByRole("button", { name: homeCatalogCopy(locale, "Previous example cause"), exact: true }),
        catalog.getByRole("button", { name: homeCatalogCopy(locale, "Next example cause"), exact: true }),
      ];
      mkdirSync(output, { recursive: true });
      await page.screenshot({ path: join(output, viewport.width === 1280 ? `market-desktop-${state}-home-fit.png` : `market-mobile-${locale}-${state}-home-fit.png`), fullPage: false });
      expect(geometry.scrollTop).toBe(0); expect(geometry.documentScrollTop).toBe(0);
      for (const control of footerControls) {
        await expect(control).toBeVisible();
        const rect = await control.boundingBox(); expect(rect).not.toBeNull();
        expect(rect!.y + rect!.height, `${state} footer must fit above the raised Send control`).toBeLessThanOrEqual(geometry.bottom + 1);
        expect(rect!.height).toBeGreaterThanOrEqual(43.5); expect(rect!.width).toBeGreaterThanOrEqual(43.5);
      }
      await footerControls[2].click();
      await expect(catalog.getByLabel(homeCatalogCopy(locale, "{current} of {count} example causes", { current: 2, count: 27 }), { exact: true })).toHaveText("02 / 27");
      expect(await page.locator("#app-content").evaluate(node => node.scrollTop)).toBe(0);
      expect(fixture.calls.forbidden).toEqual([]); expect(fixture.errors).toEqual([]);
    });
  });

  test("Withdraw separates market estimate from fixed demo limit without submitting a withdrawal", async ({ page }) => {
    const fixture = await setup(page, () => quote(Date.now()));
    await page.goto("/withdraw", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/withdraw$/); await expect(page).toHaveTitle(/Salapi/);
    const main = page.locator("#app-content"), market = main.locator('[data-market-value]');
    await expect(main).not.toBeEmpty(); await expect(page.locator("nextjs-portal")).toHaveCount(0);
    await expect(market.getByRole("status")).toHaveText("≈ $2,500.00");
    await expect(market.getByRole("link", { name: "CoinGecko", exact: true })).toBeVisible();
    await expect(main.getByText(/^Fixed demo form limit/)).toBeVisible();
    await expect(main).toContainText("$1,120.69");
    await expect(main).toContainText("not the CoinGecko market estimate");
    await main.getByRole("button", { name: "Max", exact: true }).click();
    await expect(main.locator("#withdraw-amount")).toHaveValue("1120.68");
    expect(fixture.calls.walletFailuresVerified).toBe(1); expect(fixture.calls.forbidden).toEqual([]); expect(fixture.errors).toEqual([]);
    mkdirSync(output, { recursive: true });
    await page.screenshot({ path: join(output, "market-withdraw-demo-limit.png"), fullPage: false });
  });

  for (const width of [320, 390, 1280]) test(`independent IDR display currency and expanded details have no overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
    const fixture = await setup(page, () => quote(Date.now()), "id");
    const market = await openHome(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(market.getByRole("status")).toHaveText("≈ Rp 40.000.000");
    await market.getByLabel("CoinGecko prices", { exact: true }).click();
    await expect(market.getByText("Testnet tokens have no monetary value.", { exact: true })).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; });
    const geometry = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>("#app-content")!, value = document.querySelector<HTMLElement>("[data-market-value]")!;
      const rect = value.getBoundingClientRect(), frame = document.querySelector<HTMLElement>(".sl-app-frame")!.getBoundingClientRect();
      return { mainWidth: main.clientWidth, mainOverflow: main.scrollWidth, valueWidth: value.clientWidth, valueOverflow: value.scrollWidth, left: rect.left, right: rect.right, frameLeft: frame.left, frameRight: frame.right };
    });
    expect(geometry.mainOverflow).toBeLessThanOrEqual(geometry.mainWidth + 1);
    expect(geometry.valueOverflow).toBeLessThanOrEqual(geometry.valueWidth + 1);
    expect(geometry.left).toBeGreaterThanOrEqual(geometry.frameLeft); expect(geometry.right).toBeLessThanOrEqual(geometry.frameRight);
    expect(fixture.calls.forbidden).toEqual([]); expect(fixture.errors).toEqual([]);
    if (width !== 320) { mkdirSync(output, { recursive: true }); await page.screenshot({ path: join(output, `market-idr-${width}.png`), fullPage: false }); }
  });
});
