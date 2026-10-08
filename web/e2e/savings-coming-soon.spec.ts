import { test, expect } from "@playwright/test";

for (const width of [375, 390, 1280]) test(`Savings is coming soon at ${width}px without opening a savings flow`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/Salapi/);
  const home = page.getByTestId("home-dashboard");
  const savings = home.getByTestId("smart-savings-coming-soon");
  await expect(savings).toBeDisabled();
  await expect(savings).toContainText("Coming soon");
  await expect(home.locator('a[href="/savings"]')).toHaveCount(0);
  await page.evaluate(async () => { await document.fonts.ready; });
  await savings.scrollIntoViewIfNeeded();
  // Both visible labels must fit on one line, including the Linux CI fonts.
  // Wrapping here would grow the whole quick-action row and push the footer down.
  for (const label of [savings.locator("strong"), savings.locator(":scope > div > span")]) {
    const geometry = await label.evaluate(node => {
      const labelRect = node.getBoundingClientRect();
      const cardRect = node.closest("button")!.getBoundingClientRect();
      return { left: labelRect.left, right: labelRect.right, height: labelRect.height,
        cardLeft: cardRect.left, cardRight: cardRect.right, lineHeight: parseFloat(getComputedStyle(node).lineHeight) };
    });
    expect(geometry.height).toBeLessThanOrEqual(geometry.lineHeight + 5);
    expect(geometry.left).toBeGreaterThanOrEqual(geometry.cardLeft);
    expect(geometry.right).toBeLessThanOrEqual(geometry.cardRight);
  }
  const tiles = home.locator('section[aria-label="QUICK ACTIONS"]');
  await expect(tiles.getByRole("link")).toHaveCount(3);
  await tiles.screenshot({ path: testInfo.outputPath(`savings-coming-soon-${width}.png`) });
  // An ordinary neighboring tile still navigates, rather than disabling the row.
  await tiles.getByRole("link", { name: /Arisan/ }).click();
  await expect(page).toHaveURL(/\/arisan$/);
  await expect(page.locator("#app-content").getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/vaults", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("vault-savings-coming-soon")).toContainText("Coming soon");
  await expect(page.locator('#app-content a[href="/savings"]')).toHaveCount(0);
  await page.goto("/savings", { waitUntil: "domcontentloaded" });
  const main = page.locator("#app-content");
  await expect(page).toHaveTitle("Smart Savings · Salapi");
  await expect(main.getByRole("heading", { name: "Smart Savings", exact: true })).toBeVisible();
  await expect(main.getByText("Coming soon", { exact: true })).toBeVisible();
  await expect(main.locator("input, form")).toHaveCount(0);
  await expect(main.getByRole("button", { name: /deposit|withdraw|confirm|open.*goal/i })).toHaveCount(0);
  await main.getByRole("link", { name: "Back to Vaults", exact: true }).click();
  await expect(page).toHaveURL(/\/vaults$/);
  expect(errors).toEqual([]);
});
