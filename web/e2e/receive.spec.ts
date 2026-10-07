import { test, expect } from "@playwright/test";

// Browser plugin not available. Playwright checks the real guest surface only;
// owner-specific username/address sharing is isolated component-test evidence.
for (const width of [320, 390, 1280]) {
  test(`Receive guest at ${width}px requests personal sign-in without a demo destination`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    // No fixture auth, credentials, server action or Testnet mutation is used.
    await page.route("**/*", async route => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(route.request().method()))
        return route.fulfill({ status: 403, body: "Read-only Receive guest QA" });
      return route.continue();
    });
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
    const response = await page.goto("/receive", { waitUntil: "domcontentloaded", timeout: 45000 });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/receive$/);
    expect(await page.title()).toMatch(/Salapi/i);
    const main = page.locator("#app-content");
    await expect(main.locator("header").getByText("Receive", { exact: true })).toBeVisible();
    await expect(main.getByText("Sign in to receive Testnet XLM in your personal wallet.", { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(main.getByText("Receive code unavailable", { exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: "Share", exact: true })).toBeDisabled();
    await expect(main.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/signin?next=%2Freceive");
    await expect(main.locator('a[href*="salapi.app/G"]')).toHaveCount(0);
    await expect(main.getByText(/G[A-Z2-7]{55}/)).toHaveCount(0);
    await expect(main.getByText("Loading receive code…", { exact: true })).toHaveCount(0);
    await expect(page.locator("nextjs-portal")).toHaveCount(0);
    expect(await main.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.screenshot({ path: testInfo.outputPath(`guest-${width}.png`) });
    await main.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/signin\?next=%2Freceive$/);
    await expect(page.locator("#app-content").getByText("Welcome to Salapi.", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
