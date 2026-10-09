import { test, expect, type Locator, type Page } from "@playwright/test";
import { LOCALE_COOKIE, type Locale } from "../lib/i18n/config";
import { homeCopy } from "../lib/i18n/revamp-home";
import { homeCatalogCopy } from "../lib/i18n/revamp-home-catalog";
import { circlesCopy } from "../lib/i18n/revamp-circles";
import { chooseHomeCauseCategory } from "./helpers/home-catalog";

// Measure the app's own clipped scrollport, not just the desktop browser.
// The closed Home dashboard must show wallet, first campaign, quick actions
// and footer in its initial viewport. Never scroll content to pass this check.
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
  expect(rect!.y + rect!.height, `${label} must fit above the persistent navigation`).toBeLessThanOrEqual(bounds.bottom + 1);
  expect(rect!.x, `${label} must not overflow the app frame's left edge`).toBeGreaterThanOrEqual(bounds.left - 1);
  expect(rect!.x + rect!.width, `${label} must not overflow the app frame's right edge`).toBeLessThanOrEqual(bounds.right + 1);
  expect(await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  }), `${label} must not be covered at its center`).toBe(true);
}

async function expectTouchTarget(locator: Locator, label: string) {
  const rect = await locator.boundingBox();
  expect(rect, `${label} must have a rendered touch target`).not.toBeNull();
  expect(rect!.height, `${label} must retain a 44px touch target`).toBeGreaterThanOrEqual(43.5);
  expect(rect!.width, `${label} must retain a 44px touch target`).toBeGreaterThanOrEqual(43.5);
}

async function expectUnclippedCampaignTitle(card: Locator) {
  const heading = card.getByRole("heading", { level: 2 });
  await expect(heading).toBeVisible();
  const content = await heading.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      visibleHeight: element.clientHeight,
      contentHeight: element.scrollHeight,
      lineClamp: style.webkitLineClamp,
      textAlign: style.textAlign,
    };
  });
  expect(content.contentHeight, "The full campaign title must not be vertically cropped").toBeLessThanOrEqual(content.visibleHeight + 1);
  expect(["none", "", "0"], "The title must not use line clamping to achieve first-screen fit").toContain(content.lineClamp);
  expect(content.textAlign, "The campaign title must retain centered formatting").toBe("center");
}

async function expectNaturalHomeFit(page: Page) {
  const dimensions = await page.locator("#app-content").evaluate(element => ({
    availableWidth: element.clientWidth,
    contentWidth: element.scrollWidth,
    availableHeight: element.clientHeight,
    contentHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(dimensions.contentWidth, "Home must fit horizontally without cropping").toBeLessThanOrEqual(dimensions.availableWidth + 1);
  expect(dimensions.contentHeight, "The closed Home must fit without vertical scrolling").toBeLessThanOrEqual(dimensions.availableHeight + 1);
  expect(dimensions.scrollTop, "Fit must not be achieved by scrolling the app").toBe(0);
  expect(["hidden", "clip"], "The real main scrollport must remain scrollable when content needs more room").not.toContain(dimensions.overflowY);
  const carousel = await page.getByTestId("home-circles-catalog").locator("article[data-active-card=true]").evaluate(element => {
    const strip = element.parentElement!;
    return { availableHeight: strip.clientHeight, contentHeight: strip.scrollHeight, scrollTop: strip.scrollTop };
  });
  expect(carousel.contentHeight, "Campaign height must not become a hidden second vertical scrollport inside the horizontal carousel").toBeLessThanOrEqual(carousel.availableHeight + 1);
  expect(carousel.scrollTop, "The selected campaign must not require its own vertical scrolling").toBe(0);
  const footer = page.getByTestId("home-dashboard").locator(":scope > footer");
  await expectFullyInside(footer, await appScrollport(page), "Stellar and documentation footer");
}

const viewportCases: { viewport: { width: number; height: number }; locale: Locale }[] = [
  ...[{ width: 390, height: 740 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 1440, height: 950 }, { width: 1280, height: 800 }].map(viewport => ({ viewport, locale: "en" as const })),
  ...(["tl", "id", "vi"] as const).map(locale => ({ viewport: { width: 390, height: 844 }, locale })),
];

for (const { viewport, locale } of viewportCases) {
  test.describe(`${locale} ${viewport.width}x${viewport.height} app-frame geometry`, () => {
    test.use({ viewport, isMobile: viewport.width < 1024, hasTouch: viewport.width < 1024 });
  test(`Home wallet, first campaign, quick actions and footer fit without scrolling at ${viewport.width}x${viewport.height}`, async ({ page, context, baseURL }) => {
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
    const nativeQa = await catalog.getByText(homeCatalogCopy(locale, "Fictional causes · Testnet XLM only. No real money."), { exact: true }).count() > 0;
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
    await expectFullyInside(wallet, bounds, "Testnet wallet and its actions");
    const walletCaption = wallet.locator("[data-wallet-testnet]");
    await expectFullyInside(walletCaption, bounds, "Persistent no-real-money wallet caption");
    const captionText = await walletCaption.textContent();
    expect([homeCopy(locale, "Testnet · no real money"), homeCopy(locale, "test XLM · no real money")].some(copy => captionText?.includes(copy)), "Locale-specific Testnet/no-real-money framing must stay visible").toBe(true);
    await expectFullyInside(catalog.getByText(homeCatalogCopy(locale, nativeQa
      ? "Fictional causes · Testnet XLM only. No real money."
      : "Fictional causes · no payment."), { exact: true }), bounds, "Persistent fictional/Testnet framing");
    await expectFullyInside(firstCard, bounds, "First campaign card");
    await expectFullyInside(firstCard.getByTestId("home-campaign-organizer"), bounds, "Organizer identity and photo");
    await expect(firstCard.getByText(homeCatalogCopy(locale, "Example rating"), { exact: true })).toHaveCount(1);
    await expect(firstCard.getByTestId("organizer-trust-summary")).toHaveAttribute("data-kyc-status", "unverified");
    expect(await firstCard.getByRole("heading", { level: 2 }).evaluate(element => getComputedStyle(element).textAlign), "Campaign heading must use centered formatting").toBe("center");
    await expectUnclippedCampaignTitle(firstCard);
    await expectFullyInside(category, bounds, "Category picker");
    await expectFullyInside(pledge, bounds, "Campaign CTA");
    await expectFullyInside(tools, bounds, "Campaign tools disclosure");
    await expectFullyInside(previous, bounds, "Previous example footer control");
    await expectFullyInside(next, bounds, "Next example footer control");
    for (const [control, label] of [[category, "Category"], [pledge, "Preview pledge"], [tools, "Campaign tools"], [previous, "Previous example"], [next, "Next example"]] as const) await expectTouchTarget(control, label);
    for (const label of ["Top up", "Withdraw"]) {
      const action = wallet.getByRole("link", { name: homeCopy(locale, label), exact: true });
      await expectFullyInside(action, bounds, `Wallet ${label} action`);
      await expectTouchTarget(action, label);
    }
    for (const label of ["Your account", "Help and learning", "Receive by QR"]) {
      const action = wallet.getByRole("link", { name: homeCopy(locale, label), exact: true });
      await expectFullyInside(action, bounds, label);
      await expectTouchTarget(action, label);
    }

    const quick = page.getByRole("region", { name: homeCopy(locale, "QUICK ACTIONS"), exact: true });
    await expectFullyInside(quick, bounds, "Quick actions section");
    await expect(quick.getByRole("link")).toHaveCount(3);
    const savings = quick.getByTestId("smart-savings-coming-soon");
    await expect(savings).toBeDisabled();
    await expect(savings).toContainText(homeCopy(locale, "Coming soon"));
    await expect(quick.locator('a[href="/savings"]')).toHaveCount(0);
    // Keep measuring all four cards, including the unavailable placeholder.
    const tiles = quick.locator("a, button");
    await expect(tiles).toHaveCount(4);
    for (const action of await tiles.all()) {
      await expectFullyInside(action, bounds, "Quick action");
      await expectTouchTarget(action, "Quick action");
    }
    const footer = page.getByTestId("home-dashboard").locator(":scope > footer");
    await expectFullyInside(footer, bounds, "Stellar and documentation footer");
    await expectFullyInside(page.getByRole("link", { name: homeCopy(locale, "How Salapi works"), exact: true }), bounds, "Stellar/footer documentation");
    await expectTouchTarget(page.getByRole("link", { name: homeCopy(locale, "How Salapi works"), exact: true }), "Stellar/footer documentation");

    const width = await page.locator("#app-content").evaluate(node => ({ available: node.clientWidth, content: node.scrollWidth, height: node.clientHeight, scrollHeight: node.scrollHeight, scrollTop: node.scrollTop }));
    expect(width.content, "Home content must not overflow its horizontal app frame").toBeLessThanOrEqual(width.available + 1);
    expect(width.scrollHeight, "Closed Home must fit its actual app scrollport without vertical scrolling").toBeLessThanOrEqual(width.height + 1);
    expect(width.scrollTop, "Initial geometry checks must not scroll the app to make controls visible").toBe(0);

    await chooseHomeCauseCategory(catalog, "animals", locale);
    await expect(catalog.locator("article[data-example-cause]")).toHaveCount(3);
    expect((await appScrollport(page)).scrollTop, "Category selection must preserve initial Home scroll position").toBe(0);
    await expectFullyInside(next, await appScrollport(page), "Filtered next campaign control");
    await next.click();
    await expect(catalog.getByLabel(homeCatalogCopy(locale, "{current} of {count} example causes", { current: 2, count: 3 }), { exact: true })).toHaveText("02 / 03");
    expect((await appScrollport(page)).scrollTop, "A carousel change must not scroll the Home route").toBe(0);
    await expectFullyInside(previous, await appScrollport(page), "Filtered previous campaign control");
    await previous.click();
    await expect(catalog.getByLabel(homeCatalogCopy(locale, "{current} of {count} example causes", { current: 1, count: 3 }), { exact: true })).toHaveText("01 / 03");
    expect((await appScrollport(page)).scrollTop).toBe(0);
    await expectFullyInside(tools, await appScrollport(page), "Filtered campaign tools footer");
    await expect(catalog.locator("details")).toHaveCount(2);
    await expect(tools.locator("..")).not.toHaveAttribute("open", "");
    await tools.click();
    await expect(catalog.getByRole("link", { name: c("Sketch your own cause"), exact: true })).toBeVisible();
    await expect(catalog.getByRole("link", { name: homeCatalogCopy(locale, "D4 Testnet campaigns"), exact: true })).toBeVisible();
  });
  });
}

test.describe("Crowdfunding uses the available Home height", () => {
  test.use({ viewport: { width: 390, height: 812 }, isMobile: true, hasTouch: true });

  test("a taller phone gives campaign content more room without sacrificing first-screen controls", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: LOCALE_COOKIE, value: "en", url: new URL(baseURL ?? "http://localhost:4747").origin }]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
    const catalog = page.getByTestId("home-circles-catalog");
    await expect(catalog).toHaveAttribute("data-catalog-ready", "true");
    await page.evaluate(async () => { await document.fonts.ready; });
    const active = catalog.locator("article[data-active-card=true]");
    const cover = active.locator(":scope > a");
    await expect.poll(() => cover.getByRole("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    const nativeQa = await catalog.getByText(homeCatalogCopy("en", "Fictional causes · Testnet XLM only. No real money."), { exact: true }).count() > 0;
    // The local-only 30px preview banner makes 740px shorter than the native
    // production app. Compare preview at812px so its existing compact
    // geometry fits, without misclassifying that banner as a new regression.
    // Native812px already crosses the comfortable-height query, so keep its
    // actual compact state at740px for the typography/cover comparison.
    const compactHeight = nativeQa ? 740 : 812;
    await page.setViewportSize({ width: 390, height: compactHeight });
    if (nativeQa) {
      await expect(catalog.getByText(homeCatalogCopy("en", "Checking other Testnet campaigns"), { exact: true })).toHaveCount(0, { timeout: 30000 });
      await expect(active.getByText("Checking Testnet funding", { exact: true })).toHaveCount(0, { timeout: 30000 });
    }
    const compact = {
      cardHeight: (await active.boundingBox())!.height,
      coverHeight: (await cover.boundingBox())!.height,
      titleSize: await active.getByRole("heading", { level: 2 }).evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize)),
    };
    await expectUnclippedCampaignTitle(active);
    await expectNaturalHomeFit(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => (await active.boundingBox())!.height, "Taller screens must spend spare height on campaign content").toBeGreaterThanOrEqual(compact.cardHeight + 20);
    await expect.poll(async () => (await cover.boundingBox())!.height, "The campaign cover must become legible rather than remaining a tiny thumbnail").toBeGreaterThanOrEqual(compact.coverHeight + 16);
    await expect.poll(() => active.getByRole("heading", { level: 2 }).evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize)), "The title must use the taller screen's space").toBeGreaterThanOrEqual(compact.titleSize + 1);
    await expectUnclippedCampaignTitle(active);
    await expectNaturalHomeFit(page);
    const bounds = await appScrollport(page);
    for (const control of [catalog.locator("#home-cause-category"), active.getByRole("link", { name: circlesCopy("en")("View campaign"), exact: true }), catalog.getByRole("button", { name: homeCatalogCopy("en", "Previous example cause"), exact: true }), catalog.getByRole("button", { name: homeCatalogCopy("en", "Next example cause"), exact: true })]) {
      await expectFullyInside(control, bounds, "Expanded campaign control");
      await expectTouchTarget(control, "Expanded campaign control");
    }

    // Return to a short viewport in the same mounted app. A one-time media
    // decision or stale resize measurement must not leave the expanded card
    // pushing navigation below the first screen.
    await page.setViewportSize({ width: 390, height: compactHeight });
    await expect.poll(async () => (await active.boundingBox())!.height).toBeLessThanOrEqual(compact.cardHeight + 1);
    await expectUnclippedCampaignTitle(active);
    await expectNaturalHomeFit(page);
  });

  test("every illustrative cause retains its full title and controls in the expanded phone layout", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: LOCALE_COOKIE, value: "en", url: new URL(baseURL ?? "http://localhost:4747").origin }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
    const catalog = page.getByTestId("home-circles-catalog");
    await expect(catalog).toHaveAttribute("data-catalog-ready", "true");
    // Full native funding reads are already covered by the first-campaign
    // viewport matrix. This long-title layout sweep deliberately uses local
    // illustrative data, not 27 fresh network/ledger queries.
    test.skip(await catalog.getByText(homeCatalogCopy("en", "Fictional causes · no payment."), { exact: true }).count() === 0, "The all-cause geometry sweep requires local illustrative preview data.");
    await page.evaluate(async () => { await document.fonts.ready; });
    const count = await catalog.locator("article[data-example-cause]").count();
    expect(count).toBe(27);
    const next = catalog.getByRole("button", { name: homeCatalogCopy("en", "Next example cause"), exact: true });
    for (let index = 0; index < count; index++) {
      const card = catalog.locator("article[data-active-card=true]");
      await expect(card).toHaveCount(1);
      await expectUnclippedCampaignTitle(card);
      const bounds = await appScrollport(page);
      await expectFullyInside(card, bounds, `Campaign ${index + 1}`);
      await expectFullyInside(card.getByRole("link", { name: circlesCopy("en")("View campaign"), exact: true }), bounds, `Campaign ${index + 1} CTA`);
      await expectNaturalHomeFit(page);
      await next.click();
      const selected = (index + 1) % count + 1;
      await expect(catalog.getByLabel(homeCatalogCopy("en", "{current} of {count} example causes", { current: selected, count }), { exact: true })).toHaveText(`${String(selected).padStart(2, "0")} / ${String(count).padStart(2, "0")}`);
    }
  });
});
