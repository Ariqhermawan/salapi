import { test, expect, type Locator, type Page } from "@playwright/test";
import { LOCALE_COOKIE, type Locale } from "../lib/i18n/config";
import { homeCopy } from "../lib/i18n/revamp-home";
import { homeCatalogCopy } from "../lib/i18n/revamp-home-catalog";
import { circlesCopy } from "../lib/i18n/revamp-circles";

// Measure the app's own clipped scrollport, not just the desktop browser.
// Standard phone screens include quick actions and the footer. Short screens
// retain scrolling, rather than shrinking or clipping essential controls.
type Scrollport = {
  top: number; right: number; bottom: number; left: number;
  scrollTop: number; documentScrollTop: number; width: number; height: number;
};

async function appScrollport(page: Page): Promise<Scrollport> {
  return page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>(".sl-app-frame");
    const main = document.querySelector<HTMLElement>("#app-content.sl-main");
    const nav = document.querySelector<HTMLElement>(".sl-tabbar");
    if (!frame || !main || !nav) throw new Error("The actual app frame, main scrollport and bottom navigation must exist");
    const frameRect = frame.getBoundingClientRect(), mainRect = main.getBoundingClientRect();
    // The raised Send control projects above the navigation surface. Avoid
    // counting content under that control as a usable first-viewport CTA.
    const navigationRects = Array.from(nav.querySelectorAll("button, button span")).map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
    const navTop = Math.min(nav.getBoundingClientRect().top, ...navigationRects.map(rect => rect.top));
    return {
      top: Math.max(0, frameRect.top, mainRect.top),
      right: Math.min(innerWidth, frameRect.right, mainRect.right),
      bottom: Math.min(innerHeight, frameRect.bottom, mainRect.bottom, navTop),
      left: Math.max(0, frameRect.left, mainRect.left),
      scrollTop: main.scrollTop,
      documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
      width: main.clientWidth,
      height: main.clientHeight,
    };
  });
}

async function expectFullyInside(locator: Locator, bounds: Scrollport, label: string) {
  await expect(locator, `${label} must remain visible`).toBeVisible();
  const rect = await locator.boundingBox();
  expect(rect, `${label} must have a rendered box`).not.toBeNull();
  expect(rect!.y, `${label} must not be clipped above the main scrollport`).toBeGreaterThanOrEqual(bounds.top - 1);
  expect(rect!.y + rect!.height, `${label} must fit above the persistent navigation without vertical scrolling`).toBeLessThanOrEqual(bounds.bottom + 1);
  expect(rect!.x, `${label} must not overflow the app frame's left edge`).toBeGreaterThanOrEqual(bounds.left - 1);
  expect(rect!.x + rect!.width, `${label} must not overflow the app frame's right edge`).toBeLessThanOrEqual(bounds.right + 1);
}

async function expectTouchTarget(locator: Locator, label: string) {
  const rect = await locator.boundingBox();
  expect(rect, `${label} must have a rendered touch target`).not.toBeNull();
  expect(rect!.height, `${label} must retain a 44px touch target`).toBeGreaterThanOrEqual(43.5);
  expect(rect!.width, `${label} must retain a 44px touch target`).toBeGreaterThanOrEqual(43.5);
}

const viewportCases: { viewport: { width: number; height: number }; locale: Locale }[] = [
  ...[{ width: 390, height: 740 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 1440, height: 950 }, { width: 1280, height: 800 }].map(viewport => ({ viewport, locale: "en" as const })),
  ...(["tl", "id", "vi"] as const).map(locale => ({ viewport: { width: 390, height: 844 }, locale })),
];

for (const { viewport, locale } of viewportCases) {
  test.describe(`${locale} ${viewport.width}x${viewport.height} app-frame geometry`, () => {
    test.use({ viewport, isMobile: viewport.width < 1024, hasTouch: viewport.width < 1024 });
  test(`Home wallet and full example card fit the real first viewport at ${viewport.width}x${viewport.height}`, async ({ page, context, baseURL }) => {
    const c = circlesCopy(locale);
    await context.addCookies([{ name: LOCALE_COOKIE, value: locale, url: new URL(baseURL ?? "http://localhost:4747").origin }]);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
    const catalog = page.getByTestId("home-circles-catalog");
    await expect(catalog).toHaveAttribute("data-catalog-ready", "true");
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await page.evaluate(async () => { await document.fonts.ready; });
    const firstCard = catalog.locator("article[data-example-cause]").first();
    const firstCauseTitle = await firstCard.getByRole("heading", { level: 2 }).innerText();
    // The card now also has a decorative organizer portrait. Wait for the
    // actual campaign cover through its named cause link, not an arbitrary img.
    const cover = firstCard.locator(":scope > a").and(firstCard.getByRole("link", {
      name: homeCatalogCopy(locale, "View example cause: {title}", { title: firstCauseTitle }), exact: true,
    })).getByRole("img");
    await expect(cover).toHaveCount(1);
    await expect.poll(() => cover.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);

    const bounds = await appScrollport(page);
    expect(bounds.width).toBeGreaterThan(0); expect(bounds.height).toBeGreaterThan(0);
    expect(bounds.scrollTop, "The app must start at its actual main scrollTop=0").toBe(0);
    expect(bounds.documentScrollTop, "Document scrolling must not mask app-frame clipping").toBe(0);
    await expect(catalog.locator("article[data-example-cause]")).toHaveCount(27);
    const wallet = page.getByRole("region", { name: homeCopy(locale, "Your Testnet wallet"), exact: true });
    const category = catalog.locator("#home-cause-category");
    const nativeQa = await catalog.getByText(homeCatalogCopy(locale, "Fictional causes · Testnet XLM only."), { exact: true }).count() > 0;
    const pledge = firstCard.getByRole("link", { name: c("View campaign"), exact: true });
    const tools = catalog.locator("summary").filter({ hasText: homeCatalogCopy(locale, "Campaign tools") });
    const previous = catalog.getByRole("button", { name: homeCatalogCopy(locale, "Previous example cause"), exact: true });
    const next = catalog.getByRole("button", { name: homeCatalogCopy(locale, "Next example cause"), exact: true });

    if (nativeQa) {
      if (process.env.E2E_EXPECT_UNFUNDED_WALLET === "1") {
        // CI deliberately creates, but does not fund, a disposable signer.
        // This expectation is forbidden on deployed targets, where the test
        // still requires the actual native XLM balance to be displayed.
        expect(new URL(baseURL ?? "http://localhost:4747").hostname).toMatch(/^(localhost|127\.0\.0\.1|\[::1\])$/);
        await expect(wallet.getByRole("button", {
          name: `${homeCopy(locale, "Your wallet balance is unavailable.")} ${homeCopy(locale, "Retry")}`, exact: true,
        })).toBeVisible({ timeout: 30000 });
        await expect(wallet.locator("[data-native-balance]")).toHaveCount(0);
        test.info().annotations.push({ type: "wallet-fixture", description: "Unfunded disposable CI signer: unavailable/retry UI, not live balance proof." });
      } else {
        await expect(wallet.locator("[data-native-balance]")).toBeVisible({ timeout: 30000 });
      }
      await expect(catalog.getByText(homeCatalogCopy(locale, "Checking other Testnet campaigns"), { exact: true })).toHaveCount(0, { timeout: 30000 });
      const fundingLoading = { en: "Checking Testnet funding", tl: "Sinusuri ang Testnet funding", id: "Memeriksa pendanaan Testnet", vi: "Đang kiểm tra đóng góp Testnet" }[locale];
      await expect(firstCard.getByText(fundingLoading, { exact: true })).toHaveCount(0, { timeout: 30000 });
    }
    const settledBounds = await appScrollport(page);

    await expectFullyInside(wallet, bounds, "Testnet wallet and its actions");
    const walletCaption = wallet.locator("p");
    await expectFullyInside(walletCaption, bounds, "Persistent no-real-money wallet caption");
    const captionText = await walletCaption.textContent();
    expect([homeCopy(locale, "Testnet · no real money"), homeCopy(locale, "test XLM · no real money")].some(copy => captionText?.includes(copy)), "Locale-specific Testnet/no-real-money framing must stay visible").toBe(true);
    await expectFullyInside(catalog.getByText(homeCatalogCopy(locale, nativeQa
      ? "Fictional causes · Testnet XLM only."
      : "Fictional causes · no payment."), { exact: true }), bounds, "Persistent fictional/Testnet framing");
    await expectFullyInside(firstCard.getByTestId("home-campaign-organizer"), bounds, "Organizer identity and photo");
    await expect(firstCard.getByText(homeCatalogCopy(locale, "Example rating"), { exact: true })).toHaveCount(0);
    await expectFullyInside(pledge, bounds, "Preview pledge CTA");
    await expectFullyInside(tools, bounds, "Campaign tools disclosure");
    await expectFullyInside(previous, bounds, "Previous example footer control");
    await expectFullyInside(next, bounds, "Next example footer control");
    for (const [control, label] of [[category, "Category"], [pledge, "Preview pledge"], [tools, "Campaign tools"], [previous, "Previous example"], [next, "Next example"]] as const) await expectTouchTarget(control, label);
    for (const label of ["Top up", "Withdraw"]) await expectTouchTarget(wallet.getByRole("link", { name: homeCopy(locale, label), exact: true }), label);

    if (viewport.width < 1024 && viewport.height >= 812) {
      const quick = page.getByRole("region", { name: homeCopy(locale, "QUICK ACTIONS"), exact: true });
      await expect(quick.getByRole("link")).toHaveCount(4);
      for (const action of await quick.getByRole("link").all()) {
        await expectFullyInside(action, settledBounds, "Quick action");
        await expectTouchTarget(action, "Quick action");
      }
      await expectFullyInside(page.getByRole("link", { name: homeCopy(locale, "How Salapi works"), exact: true }), settledBounds, "Stellar/footer documentation");
      const size = await page.locator("#app-content").evaluate(node => ({ height: node.clientHeight, scroll: node.scrollHeight }));
      expect(size.scroll, "Closed default dashboard must fit without scrolling on standard phone screens").toBeLessThanOrEqual(size.height + 1);
    }

    // These controls must remain usable without Playwright silently scrolling
    // the main panel down to reach them. Category updates must also not move it.
    await category.selectOption("animals");
    await expect(catalog.locator("article[data-example-cause]")).toHaveCount(3);
    expect((await appScrollport(page)).scrollTop).toBe(0);
    await next.click();
    await expect(catalog.getByLabel(homeCatalogCopy(locale, "{current} of {count} example causes", { current: 2, count: 3 }), { exact: true })).toHaveText("02 / 03");
    expect((await appScrollport(page)).scrollTop).toBe(0);
    await previous.click();
    await expect(catalog.getByLabel(homeCatalogCopy(locale, "{current} of {count} example causes", { current: 1, count: 3 }), { exact: true })).toHaveText("01 / 03");
    expect((await appScrollport(page)).scrollTop).toBe(0);
    await expectFullyInside(tools, await appScrollport(page), "Filtered campaign tools footer");
    await expect(catalog.locator("details")).toHaveCount(1);
    await expect(catalog.locator("details")).not.toHaveAttribute("open", "");
    await tools.click();
    await expect(catalog.getByRole("link", { name: c("Sketch your own cause"), exact: true })).toBeVisible();
    await expect(catalog.getByRole("link", { name: homeCatalogCopy(locale, "D4 Testnet campaigns"), exact: true })).toBeVisible();
  });
  });
}
