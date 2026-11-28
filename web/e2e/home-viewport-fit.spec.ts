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

test("Home stays in light mode when the saved cookie and system preference request dark", async ({ page }) => {
  await page.context().clearCookies();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f7f7f7");
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "light");
  await page.context().addCookies([{ name: "salapi-theme", value: "dark", url: page.url() }]);
  await page.evaluate(() => localStorage.setItem("salapi-theme", "dark"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f7f7f7");
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "light");
});

for (const viewport of [
  { width: 320, height: 740 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`You/Preferences stays light without a dark-mode control at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/you", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.context().addCookies([{ name: "salapi-theme", value: "dark", url: new URL(page.url()).origin }]);
    await page.evaluate(() => localStorage.setItem("salapi-theme", "dark"));
    await page.reload({ waitUntil: "domcontentloaded" });
    const preferences = page.getByRole("region", { name: "Preferences", exact: true });
    await expect(preferences).toBeVisible();
    await expect(preferences.getByRole("switch", { name: "Dark mode", exact: true })).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f7f7f7");
    await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "light");
    const geometry = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      frame: document.querySelector(".sl-app-frame")!.getBoundingClientRect().toJSON(),
    }));
    expect(geometry.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(geometry.frame.left).toBeGreaterThanOrEqual(-1);
    expect(geometry.frame.right).toBeLessThanOrEqual(viewport.width + 1);
  });
}

test("Home's dark theme styling gives normal secondary copy 4.5:1 contrast", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
  const contrast = await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
    const rgb = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (color: string) => {
      const [r, g, b] = rgb(color).map(channel => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (foreground: string, background: string) => {
      const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (light + 0.05) / (dark + 0.05);
    };
    const backgroundFor = (element: Element) => {
      const chain: Element[] = [];
      for (let node: Element | null = element; node; node = node.parentElement) chain.unshift(node);
      let background = [23, 23, 23];
      for (const node of chain) {
        const color = getComputedStyle(node).backgroundColor;
        const [r, g, b] = rgb(color);
        const alpha = color.startsWith("rgba") ? Number(color.match(/,\s*([\d.]+)\s*\)$/)?.[1] ?? 1) : 1;
        background = [r, g, b].map((channel, index) => channel * alpha + background[index] * (1 - alpha));
      }
      return `rgb(${background.map(Math.round).join(", ")})`;
    };
    const elements = [
      document.querySelector('a[href="/causes"]'),
      document.querySelector('[data-testid="home-example-label"]'),
      document.querySelector('section[aria-label="Sample donation activity"] > span:first-child'),
      document.querySelector('section[aria-label="Recent confirmed donations"] > span:first-child'),
      document.querySelector('section[aria-label="More from Salapi"] button[data-coming-soon] > span:last-child'),
    ].filter((element): element is Element => Boolean(element));
    return elements.filter(element => element.getClientRects().length).map(element => {
      const style = getComputedStyle(element);
      const background = backgroundFor(element);
      return { text: element.textContent?.trim(), contrast: ratio(style.color, background), color: style.color, background };
    });
  });
  expect(contrast.some(item => item.text === "See all")).toBe(true);
  expect(contrast.some(item => item.text === "Coming soon")).toBe(true);
  for (const item of contrast) expect(item.contrast, `${item.text}: ${item.color} on ${item.background}`).toBeGreaterThanOrEqual(4.5);
});
