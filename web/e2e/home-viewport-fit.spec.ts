import { test, expect, type Locator, type Page } from "@playwright/test";
import { LOCALE_COOKIE, type Locale } from "../lib/i18n/config";
import { homeCopy } from "../lib/i18n/revamp-home";
import { homeCatalogCopy } from "../lib/i18n/revamp-home-catalog";
import { circlesCopy } from "../lib/i18n/revamp-circles";

// Measure the app's own clipped scrollport, not just the desktop browser.
// D4/quick actions may still continue below this compact first screen.
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
  ...[{ width: 390, height: 740 }, { width: 390, height: 844 }, { width: 1440, height: 950 }, { width: 1280, height: 800 }].map(viewport => ({ viewport, locale: "en" as const })),
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
    await expect.poll(() => firstCard.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);

    const bounds = await appScrollport(page);
    expect(bounds.width).toBeGreaterThan(0); expect(bounds.height).toBeGreaterThan(0);
    expect(bounds.scrollTop, "The app must start at its actual main scrollTop=0").toBe(0);
    expect(bounds.documentScrollTop, "Document scrolling must not mask app-frame clipping").toBe(0);
    await expect(catalog.locator("article[data-example-cause]")).toHaveCount(27);
    const wallet = page.getByRole("region", { name: homeCopy(locale, "Your Testnet wallet"), exact: true });
    const category = catalog.locator("#home-cause-category");
    const pledge = firstCard.getByRole("link", { name: c("Preview a pledge"), exact: true });
    const create = catalog.getByRole("link", { name: c("Sketch your own cause"), exact: true });
    const previous = catalog.getByRole("button", { name: homeCatalogCopy(locale, "Previous example cause"), exact: true });
    const next = catalog.getByRole("button", { name: homeCatalogCopy(locale, "Next example cause"), exact: true });

    await expectFullyInside(wallet, bounds, "Testnet wallet and its actions");
    const walletCaption = wallet.locator("p");
    await expectFullyInside(walletCaption, bounds, "Persistent no-real-money wallet caption");
    const captionText = await walletCaption.textContent();
    expect([homeCopy(locale, "Native Testnet XLM · indicative value · no real money"), homeCopy(locale, "test XLM · no real money")].some(copy => captionText?.includes(copy)), "Locale-specific Testnet/no-real-money framing must stay visible").toBe(true);
    await expectFullyInside(catalog.getByText(homeCatalogCopy(locale, "Fictional causes · AI photos · example ratings · no payment."), { exact: true }), bounds, "Persistent example/AI/no-payment framing");
    await expectFullyInside(firstCard.locator('a[href$="/organizer"]'), bounds, "Clickable example organizer");
    await expectFullyInside(firstCard.getByText(homeCatalogCopy(locale, "Example rating"), { exact: true }), bounds, "Example rating label");
    await expectFullyInside(pledge, bounds, "Preview pledge CTA");
    await expectFullyInside(create, bounds, "Example creation footer");
    await expectFullyInside(previous, bounds, "Previous example footer control");
    await expectFullyInside(next, bounds, "Next example footer control");
    for (const [control, label] of [[category, "Category"], [pledge, "Preview pledge"], [create, "Sketch cause"], [previous, "Previous example"], [next, "Next example"]] as const) await expectTouchTarget(control, label);
    for (const label of ["Top up", "Withdraw"]) await expectTouchTarget(wallet.getByRole("link", { name: homeCopy(locale, label), exact: true }), label);

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
    await expectFullyInside(create, await appScrollport(page), "Filtered example creation footer");
  });
  });
}
