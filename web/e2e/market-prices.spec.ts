import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

const fixtureWallet = {
  address: "GAKZLTZFGSSM372XUKW2ZIJ5GSHVVIW5BYZIKIXRW2BW4MM6TUI5536Y",
  pesos: 65000,
  pesoLabel: "Isolated legacy nominal",
  nativeStroops: "100000000000",
};

function quote(now: number, price = 0.25, status: "fresh" | "stale" = "fresh", ageMs = 0) {
  const updatedAt = Math.floor((now - ageMs) / 1000);
  return {
    status,
    source: "CoinGecko",
    fetchedAt: Math.floor(now / 1000),
    assets: {
      xlm: { prices: { usd: price, php: price * 56, idr: price * 16000, vnd: price * 25000 }, updatedAt },
      usdc: { prices: { usd: 0.9998, php: 55.9888, idr: 15996.8, vnd: 24995 }, updatedAt },
    },
  };
}

async function setup(page: Page, priceBody: () => object) {
  const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
  const names = new Map(Object.entries(manifest.node as Record<string, { exportedName: string }>).map(([id, value]) => [id, value.exportedName]));
  expect([...names.values()]).toContain("walletState");
  const calls = { quotes: 0, walletFailuresVerified: 0, forbidden: [] as string[] };
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.addInitScript(() => localStorage.setItem("salapi_currency", "en"));
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === "/api/market-prices") {
      expect(request.method()).toBe("GET");
      calls.quotes++;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(priceBody()) });
    }
    if (!new Set(["POST", "PUT", "PATCH", "DELETE"]).has(request.method())) return route.continue();
    const name = names.get(request.headers()["next-action"]);
    if (name === "walletState") {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      const body = await response.text();
      const failure = '{"ok":false,"error":"Your wallet balance is unavailable."}';
      expect(body).toContain(failure);
      calls.walletFailuresVerified++;
      return route.fulfill({ response, body: body.replace(failure, JSON.stringify({ ...fixtureWallet, nativeStroops: fixtureWallet.nativeStroops })) });
    }
    if (name === "myHandle") return route.continue();
    calls.forbidden.push(name ?? `${request.method()} ${url.pathname}`);
    return route.fulfill({ status: 403, body: "Isolated market-price QA: mutation blocked" });
  });
  return { calls, errors };
}

async function openHome(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-testid="home-dashboard"]')).toBeVisible();
  const market = page.locator('[data-market-value]');
  if (await market.count() === 0) {
    await expect(page.getByText("Guest account", { exact: true })).toBeVisible();
    await page.unrouteAll({ behavior: "wait" });
    test.skip(true, "Market value is private and is not rendered for a guest wallet.");
  }
  await expect(market).toHaveCount(1);
  await expect(market.locator("[data-market-estimate]")).toHaveAttribute("role", "status");
  return market;
}

function localOnly(baseURL: string | undefined) {
  test.skip(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL!).hostname), "Read-only wallet fixtures never target a live deployment");
}

test.describe("CoinGecko wallet estimates, isolated browser QA", () => {
  test.beforeEach(({ baseURL }) => localOnly(baseURL));

  test("fresh native balance estimate shows its source and refreshes without sending a transaction", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 740 });
    let price = 0.25;
    const fixture = await setup(page, () => quote(Date.now(), price));
    const market = await openHome(page);
    await expect(market).toHaveAttribute("data-market-value", "fresh");
    await expect(market.locator("[data-market-estimate]")).toHaveText("≈ $2,500.00 USD");
    await expect(market.locator("[data-native-balance]")).toHaveText("10000 XLM");
    const source = market.getByRole("link", { name: "CoinGecko", exact: true });
    await expect(source).toHaveAttribute("href", "https://www.coingecko.com");
    await expect(source.getByRole("img", { name: "CoinGecko", exact: true })).toBeVisible();
    await expect(market).toHaveAttribute("data-market-layout", "dashboard");
    const home = page.getByTestId("home-dashboard");
    const actions = home.getByRole("navigation", { name: "Wallet actions", exact: true });
    for (const label of ["Top up", "Withdraw", "Send", "Receive"]) await expect(actions.getByRole("link", { name: label, exact: true })).toBeVisible();
    await market.getByRole("button", { name: "Refresh prices", exact: true }).click();
    price = 0.3;
    await expect(market.locator("[data-market-estimate]")).toHaveText("≈ $3,000.00 USD");
    expect(fixture.calls.quotes).toBe(2);
    expect(fixture.calls.walletFailuresVerified).toBe(1);
    expect(fixture.calls.forbidden).toEqual([]);
    expect(fixture.errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("market-mobile-manual-refresh.png"), fullPage: false });
  });

  test("automatic quote refresh updates the estimate without rereading the wallet", async ({ page }) => {
    let now = Date.now(), price = 0.25;
    await page.clock.install({ time: new Date(now) });
    const fixture = await setup(page, () => quote(now, price));
    const market = await openHome(page);
    await expect(market.locator("[data-market-estimate]")).toHaveText("≈ $2,500.00 USD");
    now += 61_000;
    price = 0.4;
    await page.clock.fastForward(61_000);
    await expect(market.locator("[data-market-estimate]")).toHaveText("≈ $4,000.00 USD");
    expect(fixture.calls.quotes).toBe(2);
    expect(fixture.calls.walletFailuresVerified).toBe(1);
    expect(fixture.calls.forbidden).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });

  test("stale prices expire to unavailable instead of showing zero or a stale estimate", async ({ page }) => {
    let now = Date.now();
    let body: object = quote(now, 0.25, "stale", 121_000);
    await page.clock.install({ time: new Date(now) });
    const fixture = await setup(page, () => body);
    const market = await openHome(page);
    await expect(market).toHaveAttribute("data-market-value", "stale");
    await expect(market.locator("[data-market-estimate]")).toHaveText("≈ $2,500.00 USD");
    await expect(market.locator("summary")).toContainText("Last known price");
    now += 181_000;
    body = { status: "unavailable", source: "CoinGecko", reason: "provider-unavailable" };
    await page.clock.fastForward(181_000);
    await expect(market).toHaveAttribute("data-market-value", "unavailable");
    await expect(market.locator("[data-market-estimate]")).toHaveText("USD · Market price unavailable");
    await expect(market.locator("[data-market-estimate]")).not.toContainText("$0");
    await expect(market.locator("[data-native-balance]")).toHaveText("10000 XLM");
    expect(fixture.calls.forbidden).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });

  test("unavailable market data never falls back to a fixed balance valuation", async ({ page }) => {
    const fixture = await setup(page, () => ({ status: "unavailable", source: "CoinGecko", reason: "not-configured" }));
    const market = await openHome(page);
    await expect(market).toHaveAttribute("data-market-value", "unavailable");
    await expect(market.locator("[data-market-estimate]")).toHaveText("USD · Market price unavailable");
    await expect(market.locator("[data-market-estimate]")).not.toContainText("$1,120");
    await expect(market.locator("[data-market-estimate]")).not.toContainText("$0");
    expect(fixture.calls.forbidden).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });

  for (const viewport of [{ width: 390, height: 740 }, { width: 1280, height: 800 }, { width: 1440, height: 950 }]) {
    test(`wallet and cause layout has no horizontal overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const fixture = await setup(page, () => quote(Date.now()));
      const market = await openHome(page);
      const geometry = await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>(".sl-app-frame")!;
        const main = document.querySelector<HTMLElement>("#app-content")!;
        return { frameWidth: frame.getBoundingClientRect().width, mainWidth: main.clientWidth, mainContent: main.scrollWidth,
          documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
      });
      expect(geometry.frameWidth).toBeGreaterThan(0);
      expect(geometry.mainContent).toBeLessThanOrEqual(geometry.mainWidth + 1);
      expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
      const causes = page.locator('#prototype-home-causes').locator("..");
      await expect(causes.locator('a[href^="/cause/"]')).toHaveCount(8);
      await expect(causes.getByRole("link", { name: "See all", exact: true })).toHaveAttribute("href", "/campaigns?mode=testnet");
      expect(fixture.calls.forbidden).toEqual([]);
      expect(fixture.errors).toEqual([]);
      await expect(market.locator("[data-native-balance]")).toBeVisible();
    });
  }
});
