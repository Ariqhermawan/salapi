import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { Keypair } from "@stellar/stellar-sdk";
import { homeCatalogCopy } from "../lib/i18n/revamp-home-catalog";
import { homeCopy } from "../lib/i18n/revamp-home";
import { circlesCopy } from "../lib/i18n/revamp-circles";
import type { Locale } from "../lib/i18n/config";
import type { CircleTestnetCampaignResult } from "../lib/circles/testnet";
import { expectHomeControlReachable } from "./helpers/home-catalog";

// Repository automated browser QA, localhost only. Not native Android or
// live-user transaction proof. Main's actual API verification is separate.
// Quotes and native balances below are clearly isolated UI test doubles. The
// actual walletState failure is verified first; no login, funding or transfer.
const fixtureWallet = { address: "GAKZLTZFGSSM372XUKW2ZIJ5GSHVVIW5BYZIKIXRW2BW4MM6TUI5536Y", pesos: 65000, pesoLabel: "Isolated legacy nominal", nativeStroops: "100000000000" };

function linkedFundingFixture(): Extract<CircleTestnetCampaignResult, { ok: true }> {
  // Public read-only UI fixture, not a provisioned campaign or a donation.
  const wallets = [1, 2, 3, 4, 5].map(value => Keypair.fromRawEd25519Seed(Buffer.alloc(32, value)).publicKey());
  const mapping = { campaignId: "100", creatorWallet: wallets[0], beneficiaryWallet: wallets[1],
    approverWallets: wallets.slice(2), creatorCutBps: 0, fundingDeadline: "1793000000", reviewDeadline: "1794000000" };
  return { ok: true, available: true, network: "testnet", circleId: "tino-relief", contractId: "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU",
    qaLabel: "QA Testnet · fictional cause", donationOpen: true, status: "ready", mapping, now: "1791000000",
    campaign: { id: "100", title: "QA Circles: tino-relief", state: "Funding", total: "1000000000", escrow: "1000000000", proofHash: null, proofUrl: "", approvals: [],
      config: { creator: mapping.creatorWallet, beneficiary: mapping.beneficiaryWallet, approvers: mapping.approverWallets, creator_cut_bps: 0,
        funding_deadline: mapping.fundingDeadline, review_deadline: mapping.reviewDeadline, token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC" } } };
}

function publicDiscoveryFixture() {
  const linked = linkedFundingFixture();
  // A linked QA ledger card is represented by its story, while an unrelated
  // D4 campaign remains in the unified carousel. Display fixtures only.
  const standalone = { ...linked.campaign, id: "99", title: "Isolated standalone Testnet campaign" };
  return { ok: true, contractId: linked.contractId, now: linked.now,
    campaigns: [linked.campaign, standalone], circleLinks: { "100": "tino-relief" } };
}

const fixtureCatalogCount = 28;

function quote(now: number, price = .25, status: "fresh" | "stale" = "fresh", ageMs = 0) {
  const updatedAt = Math.floor((now - ageMs) / 1000);
  return { status, source: "CoinGecko", fetchedAt: Math.floor(now / 1000), assets: {
    xlm: { prices: { usd: price, php: price * 56, idr: price * 16000, vnd: price * 25000 }, updatedAt },
    usdc: { prices: { usd: .9998, php: 55.9888, idr: 15996.8, vnd: 24995 }, updatedAt },
  } };
}

async function setup(page: Page, priceBody: () => object, currency = "en", locale: Locale = "en", linkedFunding = false, nativeStroops = fixtureWallet.nativeStroops) {
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
    if (request.method() === "GET" && url.pathname === "/api/public/campaigns"
      && url.searchParams.size === 1 && url.searchParams.get("before") === "0") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(publicDiscoveryFixture()) });
    }
    if (linkedFunding && request.method() === "GET" && url.pathname === "/api/public/circles-testnet"
      && url.searchParams.size === 1 && url.searchParams.get("circleId") === "tino-relief") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(linkedFundingFixture()) });
    }
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) return route.continue();
    const name = names.get(request.headers()["next-action"]);
    if (name === "readCircleTestnetCampaign" && linkedFunding) {
      return route.fulfill({ status: 200, contentType: "text/x-component; charset=utf-8",
        body: `0:{"a":"$@1","f":"","i":false}\n1:${JSON.stringify(linkedFundingFixture())}\n` });
    }
    if (name === "walletState") {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      const body = await response.text();
      const failure = '{"ok":false,"error":"Your wallet balance is unavailable."}';
      expect(body).toContain(failure);
      calls.walletFailuresVerified++;
      return route.fulfill({ response, body: body.replace(failure, JSON.stringify({ ...fixtureWallet, nativeStroops })) });
    }
    // These existing read-only actions retain their actual response, including
    // myHandle:null. No identity is invented or account switched by these tests.
    if (name === "myHandle" || name === "campaignState" || name === "readCircleTestnetCampaign") return route.continue();
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
  // Wallet loading has its own status. Select the market estimate explicitly
  // while retaining its accessibility contract, rather than racing both.
  await expect(market.locator("[data-market-estimate]")).toHaveAttribute("role", "status");
  return market;
}

async function homeUsableBounds(page: Page) {
  return page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>(".sl-app-frame");
    const main = document.querySelector<HTMLElement>("#app-content");
    const nav = document.querySelector<HTMLElement>(".sl-tabbar");
    if (!frame || !main || !nav) throw new Error("Home must render its actual app frame, main scrollport and persistent navigation");
    const frameRect = frame.getBoundingClientRect(), mainRect = main.getBoundingClientRect();
    const navControls = [...nav.querySelectorAll("button, button span")].map(control => control.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
    return {
      top: Math.max(0, frameRect.top, mainRect.top),
      bottom: Math.min(innerHeight, frameRect.bottom, mainRect.bottom, nav.getBoundingClientRect().top, ...navControls.map(rect => rect.top)),
      left: Math.max(0, frameRect.left, mainRect.left),
      right: Math.min(innerWidth, frameRect.right, mainRect.right),
    };
  });
}

async function expectHomeFirstScreenBox(page: Page, control: Locator, label: string, touchTarget = false) {
  await expect(control, `${label} must stay rendered`).toBeVisible();
  const rect = await control.boundingBox(), bounds = await homeUsableBounds(page);
  expect(rect, `${label} must have a rendered box`).not.toBeNull();
  expect(rect!.y, `${label} must not clip above the app scrollport`).toBeGreaterThanOrEqual(bounds.top - 1);
  expect(rect!.y + rect!.height, `${label} must clear the raised Send control without scrolling`).toBeLessThanOrEqual(bounds.bottom + 1);
  expect(rect!.x, `${label} must stay inside the left app edge`).toBeGreaterThanOrEqual(bounds.left - 1);
  expect(rect!.x + rect!.width, `${label} must stay inside the right app edge`).toBeLessThanOrEqual(bounds.right + 1);
  expect(await control.evaluate(element => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  }), `${label} must not be covered at its center`).toBe(true);
  if (touchTarget) {
    expect(rect!.height, `${label} must keep its 44px touch target`).toBeGreaterThanOrEqual(43.5);
    expect(rect!.width, `${label} must keep its 44px touch target`).toBeGreaterThanOrEqual(43.5);
  }
}

async function expectFundingPhotoDominance(card: Locator) {
  const hero = card.getByTestId("home-campaign-hero"), photo = hero.locator(":scope > a"), title = hero.getByRole("heading", { level: 2 });
  const [cardBox, heroBox, photoBox, titleBox] = await Promise.all([card.boundingBox(), hero.boundingBox(), photo.boundingBox(), title.boundingBox()]);
  expect(cardBox && heroBox && photoBox && titleBox, "Card, full-width campaign photo and complete title must have rendered boxes").toBeTruthy();
  expect(heroBox!.width, "Campaign hero must remain full width, not a thumbnail").toBeGreaterThanOrEqual(cardBox!.width - 2);
  expect(photoBox!.width, "Campaign photo must span its hero").toBeGreaterThanOrEqual(heroBox!.width - 2);
  expect(photoBox!.height, "Campaign photo must retain a legible scene").toBeGreaterThanOrEqual(96);
  expect(photoBox!.width * photoBox!.height, "Campaign photo must remain at least 2.5 times as prominent as its full title").toBeGreaterThanOrEqual(titleBox!.width * titleBox!.height * 2.5);
  expect(titleBox!.y, "Title must stay inside the photographic stage").toBeGreaterThanOrEqual(photoBox!.y - 1);
  expect(titleBox!.y + titleBox!.height, "The full title must stay inside the photographic stage").toBeLessThanOrEqual(photoBox!.y + photoBox!.height + 1);
  expect(Math.abs(titleBox!.x + titleBox!.width / 2 - heroBox!.x - heroBox!.width / 2), "Title must be geometrically centered").toBeLessThanOrEqual(1);
  const text = await title.evaluate(element => ({ height: element.clientHeight, contentHeight: element.scrollHeight, clamp: getComputedStyle(element).webkitLineClamp, align: getComputedStyle(element).textAlign }));
  expect(text.contentHeight, "The complete localized campaign title must not be cropped").toBeLessThanOrEqual(text.height + 1);
  expect(["none", "", "0"], "Title clamping must not manufacture a fit").toContain(text.clamp);
  expect(text.align).toBe("center");
}

test.describe("CoinGecko wallet estimates, isolated candidate browser QA", () => {
  test.beforeEach(({ baseURL }) => test.skip(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL!).hostname), "Local price/wallet fixtures never target live deployments"));

  test("fresh native balance estimate, expandable references and manual price change", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 740 });
    let price = .25;
    const fixture = await setup(page, () => quote(Date.now(), price));
    const market = await openHome(page);
    await expect(market).toHaveAttribute("data-market-value", "fresh");
    await expect(market.locator("[data-market-estimate]")).toHaveText("≈ $2,500.00 USD");
    await expect(market.locator("[data-native-balance]")).toBeVisible();
    await expect(market.locator("[data-native-balance]")).toHaveText("10000 XLM");
    const attribution = market.getByRole("link", { name: "CoinGecko", exact: true });
    await expect(attribution).toBeVisible(); await expect(attribution).toHaveAttribute("href", "https://www.coingecko.com");
    await expect(market.locator('[data-price-attribution="coingecko"]').getByText("Powered by", { exact: true })).toBeVisible();
    await expect(attribution.getByRole("img", { name: "CoinGecko", exact: true })).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; });
    const catalog = page.getByTestId("home-circles-catalog");
    await expect(catalog.locator("article[data-example-cause]")).toHaveCount(27);
    await expect(catalog.locator("article[data-standalone-campaign]")).toHaveCount(1);
    const footer = catalog.locator("summary").filter({ hasText: "Campaign tools" });
    expect(await page.locator("#app-content").evaluate(node => node.scrollTop)).toBe(0);
    await expectHomeControlReachable(page, footer, "Fresh-price campaign footer");
    await page.screenshot({ path: testInfo.outputPath("market-mobile-fresh-footer.png"), fullPage: false });
    const summary = market.getByLabel("CoinGecko prices", { exact: true });
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(market).toHaveAttribute("data-market-layout", "dashboard");
    const walletActions = page.getByRole("navigation", { name: "Wallet actions", exact: true });
    const actionRect = (await walletActions.boundingBox())!;
    for (const amount of [market.locator("[data-market-estimate]"), market.locator("[data-native-balance]")]) {
      const rect = (await amount.boundingBox())!;
      expect(rect.x + rect.width, "Amounts must not overlap the wallet action column").toBeLessThanOrEqual(actionRect.x + 1);
    }
    const attributionRect = (await attribution.boundingBox())!, summaryRect = (await summary.boundingBox())!;
    expect(attributionRect.y + attributionRect.height, "Source and disclosure share one compact row").toBeLessThanOrEqual(summaryRect.y + summaryRect.height + 1);
    expect(attributionRect.x + attributionRect.width, "Source cannot overlap the price-details control").toBeLessThanOrEqual(summaryRect.x + 1);
    await summary.click();
    await expect(market.locator("[data-native-balance]")).toHaveText("10000 XLM");
    await expect(market).toContainText("XLM $0.25 · USDC $0.9998");
    await expect(market.getByText("USDC price reference only. This wallet holds Testnet XLM, not USDC.", { exact: true })).toBeVisible();
    await expect(market.getByText("Testnet tokens have no monetary value.", { exact: true })).toBeVisible();
    const timestamp = await market.locator("time").getAttribute("datetime"); expect(timestamp).toMatch(/T/);
    expect(await market.locator("summary").innerText()).not.toMatch(/\d{2}:\d{2}/);
    price = .3;
    await market.getByRole("button", { name: "Refresh prices", exact: true }).click();
    await expect(market.locator("[data-market-estimate]")).toHaveText("≈ $3,000.00 USD");
    await expect(market).toContainText("XLM $0.30 · USDC $0.9998");
    expect(fixture.calls.quotes).toBe(2); expect(fixture.calls.walletFailuresVerified).toBe(1);
    expect(fixture.calls.forbidden).toEqual([]); expect(fixture.errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("market-mobile-manual-refresh.png"), fullPage: false });
  });

  test("automatic 60-second price movement updates without refetching the native balance", async ({ page }) => {
    let now = Date.now(), price = .25;
    await page.clock.install({ time: new Date(now) });
    const fixture = await setup(page, () => quote(now, price));
    const market = await openHome(page);
    await expect(market.locator("[data-market-estimate]")).toHaveText("≈ $2,500.00 USD");
    now += 61_000; price = .4;
    await page.clock.fastForward(61_000);
    await expect(market.locator("[data-market-estimate]")).toHaveText("≈ $4,000.00 USD");
    expect(fixture.calls.quotes).toBe(2); expect(fixture.calls.walletFailuresVerified).toBe(1);
    expect(fixture.calls.forbidden).toEqual([]); expect(fixture.errors).toEqual([]);
  });

  for (const viewport of [{ width: 390, height: 740 }, { width: 1280, height: 800 }, { width: 1280, height: 821 }, { width: 1280, height: 901 }]) test(`linked campaign USD estimate and controls stay reachable above Send at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const fixture = await setup(page, () => quote(Date.now(), .25, "stale", 121_000), "en", "en", true);
    const market = await openHome(page);
    await expect(market.locator("[data-native-balance]")).toHaveText("10000 XLM");
    const catalog = page.getByTestId("home-circles-catalog");
    await expect(catalog.locator("article[data-example-cause]")).toHaveCount(27);
    await expect(catalog.locator("article[data-standalone-campaign]")).toHaveCount(1);
    const funding = catalog.locator("article[data-example-cause]").first().locator('[data-funding-kind="testnet"]');
    await expect(funding).toHaveCount(1);
    await expect(funding).toContainText("100 XLM");
    await expect(funding).toContainText("≈ $25.00 USD");
    await expect(funding).not.toContainText("USDC");
    await expect(funding).toContainText("Last known price");
    await expect(funding).toContainText("Example goal: $4,310.34 USD");
    await expect(funding.locator("progress")).toHaveAttribute("aria-valuetext", "0.58%");
    await page.evaluate(async () => { await document.fonts.ready; });
    const footer = catalog.locator("summary").filter({ hasText: "Campaign tools" });
    await expectHomeControlReachable(page, footer, "Linked campaign footer");
    const rect = await footer.boundingBox(); expect(rect).not.toBeNull();
    expect(rect!.height).toBeGreaterThanOrEqual(43.5);
    expect(fixture.calls.forbidden).toEqual([]); expect(fixture.errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`market-linked-home-${viewport.width}.png`), fullPage: false });
  });

  test("stale last price is explicit, expired quotes disappear and unavailable never becomes zero", async ({ page }, testInfo) => {
    let now = Date.now(), body: object = quote(now, .25, "stale", 121_000);
    await page.clock.install({ time: new Date(now) });
    const fixture = await setup(page, () => body);
    const market = await openHome(page);
    await expect(market).toHaveAttribute("data-market-value", "stale");
    await expect(market.locator("[data-market-estimate]")).toHaveText("≈ $2,500.00 USD");
    await expect(market.locator("summary")).toContainText("Last known price");
    await market.locator("summary").click();
    body = { status: "unavailable", source: "CoinGecko", reason: "provider-unavailable" };
    await market.getByRole("button", { name: "Refresh prices", exact: true }).click();
    await expect(market).toHaveAttribute("data-market-value", "stale");
    // Continue only the read-only quote failure. Age, not provider recovery,
    // must remove the last known quote once its 5-minute lifetime has passed.
    now += 181_000; await page.clock.fastForward(181_000);
    await expect(market).toHaveAttribute("data-market-value", "unavailable");
    await expect(market.locator("[data-market-estimate]")).toHaveText("USD · Market price unavailable");
    await expect(market.locator("[data-market-estimate]")).not.toContainText("$0");
    await expect(market.locator("[data-native-balance]")).toBeVisible();
    await expect(market.locator("[data-native-balance]")).toHaveText("10000 XLM");
    expect(fixture.calls.forbidden).toEqual([]); expect(fixture.errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("market-unavailable-expired.png"), fullPage: false });
  });

  test("missing configuration is truthful and does not fall back to old fixed valuation", async ({ page }) => {
    const fixture = await setup(page, () => ({ status: "unavailable", source: "CoinGecko", reason: "not-configured" }));
    const market = await openHome(page);
    await expect(market).toHaveAttribute("data-market-value", "unavailable");
    await expect(market.locator("[data-market-estimate]")).toHaveText("USD · Market price unavailable");
    await expect(market.locator("[data-market-estimate]")).not.toContainText("$1,120");
    await expect(market.locator("[data-market-estimate]")).not.toContainText("$0");
    expect(fixture.calls.forbidden).toEqual([]); expect(fixture.errors).toEqual([]);
  });

  const fitCases: { state: "fresh" | "stale" | "unavailable"; locale: Locale; viewport: { width: number; height: number } }[] = [
    ...(["fresh", "stale", "unavailable"] as const).map(state => ({ state, locale: state === "unavailable" ? "id" as const : "en" as const, viewport: { width: 1280, height: 800 } })),
    ...(["tl", "id", "vi"] as const).map(locale => ({ state: "fresh" as const, locale, viewport: { width: 390, height: 844 } })),
  ];
  for (const { state, locale, viewport } of fitCases) test.describe(`${locale} ${viewport.width}x${viewport.height} ${state} market-state fit`, () => {
    test.use({ viewport, isMobile: viewport.width < 1024, hasTouch: viewport.width < 1024 });
    test(`Home footer remains reachable at ${viewport.width}x${viewport.height} with ${state} price status`, async ({ page }, testInfo) => {
      // The production app frame is shorter than its desktop browser viewport.
      // Include the longer localized unavailable copy, not only short USD text.
      const body = () => state === "unavailable"
        ? { status: "unavailable", source: "CoinGecko", reason: "provider-unavailable" }
        : quote(Date.now(), .25, state, state === "stale" ? 121_000 : 0);
      const fixture = await setup(page, body, "en", locale);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const market = await openHome(page);
      await expect(market).toHaveAttribute("data-market-value", state);
      await expect(market.locator("[data-market-estimate]")).toHaveText(state === "unavailable" ? "USD · Harga pasar tidak tersedia" : "≈ $2,500.00 USD");
      await expect(market.getByRole("link", { name: "CoinGecko", exact: true })).toBeVisible();
      const catalog = page.getByTestId("home-circles-catalog");
      await expect(catalog).toHaveAttribute("data-catalog-ready", "true");
      await expect(catalog.locator("article[data-example-cause]")).toHaveCount(27);
      await expect(catalog.locator("article[data-standalone-campaign]")).toHaveCount(1);
      await expect(catalog.locator('[data-standalone-campaign="99"]')).toContainText("Isolated standalone Testnet campaign");
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await page.evaluate(async () => { await document.fonts.ready; });
      const footerControls = [
        catalog.locator("summary").filter({ hasText: homeCatalogCopy(locale, "Campaign tools") }),
        catalog.getByRole("button", { name: homeCatalogCopy(locale, "Previous example cause"), exact: true }),
        catalog.getByRole("button", { name: homeCatalogCopy(locale, "Next example cause"), exact: true }),
      ];
      expect(await page.locator("#app-content").evaluate(node => node.scrollTop)).toBe(0);
      for (const [index, control] of footerControls.entries()) {
        await expectHomeControlReachable(page, control, `${state} campaign footer control ${index + 1}`);
        const rect = await control.boundingBox(); expect(rect).not.toBeNull();
        expect(rect!.height).toBeGreaterThanOrEqual(43.5); expect(rect!.width).toBeGreaterThanOrEqual(43.5);
      }
      await page.screenshot({ path: testInfo.outputPath(viewport.width === 1280 ? `market-desktop-${state}-home-footer.png` : `market-mobile-${locale}-${state}-home-footer.png`), fullPage: false });
      await footerControls[2].click();
      await expect(catalog.getByLabel(homeCatalogCopy(locale, "{current} of {count} example causes", { current: 2, count: fixtureCatalogCount }), { exact: true })).toHaveText("02 / 28");
      await expectHomeControlReachable(page, footerControls[2], "Next campaign after slide change");
      expect(fixture.calls.forbidden).toEqual([]); expect(fixture.errors).toEqual([]);
    });
  });

  const budgetCases: { state: "fresh" | "stale" | "unavailable"; locale: "en" | "tl"; viewport: { width: number; height: number } }[] = [
    ...[{ width: 390, height: 844 }, { width: 1440, height: 950 }].flatMap(viewport => (["fresh", "stale", "unavailable"] as const).map(state => ({ state, locale: "en" as const, viewport }))),
    ...(["fresh", "stale", "unavailable"] as const).map(state => ({ state, locale: "tl" as const, viewport: { width: 390, height: 844 } })),
  ];
  for (const { state, locale, viewport } of budgetCases) test.describe(`${locale} ${viewport.width}x${viewport.height} ${state} settled Home budget`, () => {
    test.use({ viewport, isMobile: viewport.width < 1024, hasTouch: viewport.width < 1024 });
    test("settled linked funding preserves the photo, full title and usable Home footer", async ({ page }) => {
      const body = () => state === "unavailable"
        ? { status: "unavailable", source: "CoinGecko", reason: "provider-unavailable" }
        : quote(Date.now(), .25, state, state === "stale" ? 121_000 : 0);
      // Realistic native precision exercises wrapping that a round 10000 XLM
      // display can miss. It remains an isolated UI fixture, never a live read.
      const fixture = await setup(page, body, "en", locale, true, "157268986112");
      await page.emulateMedia({ reducedMotion: "reduce" });
      const market = await openHome(page);
      await expect(market).toHaveAttribute("data-market-value", state);
      await expect(market.locator("[data-native-balance]")).toHaveText("15726.8986112 XLM");
      const catalog = page.getByTestId("home-circles-catalog");
      await expect(catalog).toHaveAttribute("data-catalog-ready", "true");
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(catalog.locator("article[data-example-cause]")).toHaveCount(27);
      await expect(catalog.locator("article[data-standalone-campaign]")).toHaveCount(1);
      const card = catalog.locator('article[data-example-cause="tino-relief"][data-active-card=true]');
      const funding = card.locator('[data-funding-kind="testnet"]');
      await expect(funding).toHaveAttribute("data-market-status", state);
      await expect(funding.locator("[data-confirmed-stroops]")).toHaveText("100 XLM · Testnet");
      if (state === "unavailable") {
        await expect(market.locator("[data-market-estimate]")).not.toContainText("$0");
        await expect(funding.getByText(locale === "en" ? "USD estimate unavailable" : "Hindi available ang USD estimate", { exact: true })).toBeVisible();
        await expect(funding.locator("progress")).toHaveCount(0);
        await expect(funding).not.toContainText("≈ $0");
      } else {
        await expect(market.locator("[data-market-estimate]")).toHaveText("≈ $3,931.72 USD");
        await expect(funding).toContainText("≈ $25.00 USD");
        await expect(funding.locator("progress")).toHaveAttribute("aria-valuetext", "0.58%");
        if (state === "stale") await expect(funding.getByText(locale === "en" ? "Last known price" : "Huling alam na presyo", { exact: true })).toBeVisible();
      }
      await page.evaluate(async () => { await document.fonts.ready; });
      await expect.poll(() => card.getByTestId("home-campaign-hero").locator(":scope > a").getByRole("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      await expectFundingPhotoDominance(card);
      const main = page.locator("#app-content");
      const dimensions = await main.evaluate(element => ({ width: element.clientWidth, contentWidth: element.scrollWidth, height: element.clientHeight, contentHeight: element.scrollHeight, top: element.scrollTop, overflow: getComputedStyle(element).overflowY }));
      expect(dimensions.contentWidth, "Home must never overflow horizontally").toBeLessThanOrEqual(dimensions.width + 1);
      expect(dimensions.top, "Budget measurements must begin before any app scrolling").toBe(0);
      expect(["hidden", "clip"], "Long localized content must retain natural main scrolling").not.toContain(dimensions.overflow);
      const carousel = await card.evaluate(element => ({ height: element.clientHeight, contentHeight: element.scrollHeight, stripHeight: element.parentElement!.clientHeight, stripContentHeight: element.parentElement!.scrollHeight, stripTop: element.parentElement!.scrollTop }));
      expect(carousel.contentHeight, "The card must not crop its content").toBeLessThanOrEqual(carousel.height + 1);
      expect(carousel.stripContentHeight, "The carousel must not become a second vertical scrollport").toBeLessThanOrEqual(carousel.stripHeight + 1);
      expect(carousel.stripTop).toBe(0);
      const footer = page.getByTestId("home-dashboard").locator(":scope > footer");
      const controls = [
        card.getByRole("link", { name: circlesCopy(locale)("View campaign"), exact: true }),
        catalog.locator("#home-cause-category"),
        catalog.getByRole("button", { name: homeCatalogCopy(locale, "Previous example cause"), exact: true }),
        catalog.getByRole("button", { name: homeCatalogCopy(locale, "Next example cause"), exact: true }),
      ];
      // EN comfortable frames must fit with no scroll intervention. The longer
      // TL title may grow naturally, but may never shrink to a clipped thumbnail.
      if (locale === "en") {
        expect(dimensions.contentHeight, "Settled funding, including stale/unavailable copy, must fit the comfortable Home scrollport").toBeLessThanOrEqual(dimensions.height + 1);
        await expectHomeFirstScreenBox(page, page.getByRole("region", { name: homeCopy(locale, "Your Testnet wallet"), exact: true }), "Wallet and actions");
        await expectHomeFirstScreenBox(page, card, "Complete campaign card");
        await expectHomeFirstScreenBox(page, page.getByRole("region", { name: homeCopy(locale, "QUICK ACTIONS"), exact: true }), "Quick actions");
        await expectHomeFirstScreenBox(page, footer, "Stellar and documentation footer");
        for (const control of controls) await expectHomeFirstScreenBox(page, control, "Home control", true);
        expect(await main.evaluate(element => element.scrollTop), "No scroll helper may manufacture first-screen fit").toBe(0);
      }
      await page.screenshot({ path: join(tmpdir(), "salapi-home-responsive-20261011", `home-budget-${locale}-${viewport.width}x${viewport.height}-${state}.png`), fullPage: false });
      if (locale === "tl") {
        for (const control of controls) await expectHomeControlReachable(page, control, "Localized Home control");
        await expectHomeControlReachable(page, footer, "Localized Stellar and documentation footer");
        for (const control of controls) {
          const rect = await control.boundingBox();
          expect(rect).not.toBeNull();
          expect(rect!.height).toBeGreaterThanOrEqual(43.5); expect(rect!.width).toBeGreaterThanOrEqual(43.5);
        }
      }
      expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0), "Only the app main may scroll").toBe(0);
      expect(fixture.calls.walletFailuresVerified).toBe(1);
      expect(fixture.calls.forbidden).toEqual([]); expect(fixture.errors).toEqual([]);
    });
  });

  test("Withdraw separates market estimate from fixed demo limit without submitting a withdrawal", async ({ page }, testInfo) => {
    const fixture = await setup(page, () => quote(Date.now()));
    await page.goto("/withdraw", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/withdraw$/); await expect(page).toHaveTitle(/Salapi/);
    const main = page.locator("#app-content"), market = main.locator('[data-market-value]');
    await expect(main).not.toBeEmpty(); await expect(page.locator("nextjs-portal")).toHaveCount(0);
    await expect(market.locator("[data-market-estimate]")).toHaveText("≈ $2,500.00");
    await expect(market.getByRole("link", { name: "CoinGecko", exact: true })).toBeVisible();
    await expect(main.getByText(/^Fixed demo form limit/)).toBeVisible();
    await expect(main).toContainText("$1,120.69");
    await expect(main).toContainText("not the CoinGecko market estimate");
    await main.getByRole("button", { name: "Max", exact: true }).click();
    await expect(main.locator("#withdraw-amount")).toHaveValue("1120.68");
    expect(fixture.calls.walletFailuresVerified).toBe(1); expect(fixture.calls.forbidden).toEqual([]); expect(fixture.errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("market-withdraw-demo-limit.png"), fullPage: false });
  });

  for (const width of [320, 390, 1280]) test(`Home keeps its USD reference while Withdraw honors independent IDR currency, without overflow at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
    const fixture = await setup(page, () => quote(Date.now()), "id");
    const market = await openHome(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    // Home is explicitly a USD reference. The saved currency still applies to
    // non-dashboard values; changing it must not silently switch UI language.
    await expect(market.locator("[data-market-estimate]")).toHaveText("≈ $2,500.00 USD");
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
    if (width !== 320) await page.screenshot({ path: testInfo.outputPath(`market-usd-with-idr-preference-${width}.png`), fullPage: false });
    await page.goto("/withdraw", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/withdraw$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("#app-content [data-market-estimate]")).toHaveText("≈ Rp 40.000.000");
    expect(fixture.calls.forbidden).toEqual([]); expect(fixture.errors).toEqual([]);
  });
});
