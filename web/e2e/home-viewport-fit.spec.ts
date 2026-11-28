import { test, expect, type Page } from "@playwright/test";

const homeLocator = (page: Page) => page.locator('[data-testid="home-dashboard"], [data-testid="prototype-home"]');
const viewports = [
  { width: 320, height: 740 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1280, height: 800 },
  { width: 1440, height: 950 },
];

for (const viewport of viewports) {
  test(`prototype Home keeps the phone UI and controls usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
    const home = homeLocator(page);
    await expect(home).toHaveCount(1, { timeout: 20000 });
    const frame = page.locator(".sl-app-frame");
    const main = page.locator("#app-content");
    const navigation = page.getByRole("navigation", { name: "Main navigation", exact: true });
    await expect(frame).toBeVisible();
    await expect(main).toBeVisible();
    await expect(navigation).toBeVisible();

    const geometry = await page.evaluate(() => {
      const frame = document.querySelector<HTMLElement>(".sl-app-frame")!;
      const main = document.querySelector<HTMLElement>("#app-content")!;
      const nav = document.querySelector<HTMLElement>('[aria-label="Main navigation"]')!;
      return {
        frameWidth: frame.getBoundingClientRect().width,
        frameLeft: frame.getBoundingClientRect().left,
        frameRight: frame.getBoundingClientRect().right,
        mainWidth: main.clientWidth,
        mainContentWidth: main.scrollWidth,
        docWidth: document.documentElement.scrollWidth,
        navTop: nav.getBoundingClientRect().top,
        frameBottom: frame.getBoundingClientRect().bottom,
      };
    });
    expect(geometry.frameWidth).toBeGreaterThan(0);
    expect(geometry.frameLeft).toBeGreaterThanOrEqual(-1);
    expect(geometry.frameRight).toBeLessThanOrEqual(viewport.width + 1);
    expect(geometry.mainContentWidth).toBeLessThanOrEqual(geometry.mainWidth + 1);
    expect(geometry.docWidth).toBeLessThanOrEqual(viewport.width + 1);
    expect(geometry.navTop).toBeLessThan(geometry.frameBottom);

    const actions = home.getByRole("navigation", { name: "Wallet actions", exact: true });
    for (const label of ["Top up", "Withdraw", "Send", "Receive"]) {
      const link = actions.getByRole("link", { name: label, exact: true });
      await expect(link).toBeVisible();
      const bounds = await link.boundingBox();
      expect(bounds?.width).toBeGreaterThanOrEqual(36);
      expect(bounds?.height).toBeGreaterThanOrEqual(36);
    }

    const causes = home.locator('section[aria-labelledby="prototype-home-causes"]');
    const cards = causes.locator('a[href^="/cause/"]');
    await expect(cards).toHaveCount(8);
    await expect(causes.getByRole("link", { name: "See all", exact: true })).toHaveAttribute("href", "/causes");
    const photo = cards.first().locator("img").first();
    await expect.poll(() => photo.evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
    const controls = navigation.getByRole("button");
    await expect(controls).toHaveCount(5);
  });
}

test("A fresh visit uses the prototype's dark theme and matching browser chrome", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#171717");
});

test("Settings keeps the dark-mode switch in Preferences and persists the selection", async ({ page }) => {
  await page.goto("/you", { waitUntil: "domcontentloaded", timeout: 45000 });
  const preferences = page.getByRole("region", { name: "Preferences", exact: true });
  const theme = preferences.getByRole("switch", { name: "Dark mode", exact: true });
  await expect(theme).toBeVisible();
  const currentTheme = await page.locator("html").getAttribute("data-theme");
  await expect(theme).toHaveAttribute("aria-checked", currentTheme === "dark" ? "true" : "false");
  const initial = await theme.getAttribute("aria-checked");
  await theme.click();
  await expect(theme).toHaveAttribute("aria-checked", initial === "true" ? "false" : "true");
  const expected = initial === "true" ? "light" : "dark";
  await expect(page.locator("html")).toHaveAttribute("data-theme", expected);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", expected === "dark" ? "#171717" : "#f7f7f7");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", expected);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", expected === "dark" ? "#171717" : "#f7f7f7");
});
