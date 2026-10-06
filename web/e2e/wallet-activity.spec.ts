import { test, expect } from "@playwright/test";
import { collectCspViolations } from "./helpers";

// Read-only guest checks. Authenticated history / account-switch fixtures are
// component tests, not a claim of real-account transfer E2E verification.
for (const width of [320, 390, 1280]) {
  test(`Activity at ${width}px separates guest history from the public project archive`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const csp = collectCspViolations(page);
    const response = await page.goto("/activity", { waitUntil: "domcontentloaded", timeout: 45000 });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/activity$/);
    const main = page.locator("#app-content");
    await expect(main.getByRole("heading", { level: 1, name: "Activity", exact: true })).toBeVisible();
    await expect(main.locator('[data-personal-history-state="signed-out"]')).toBeVisible({ timeout: 20000 });
    await expect(main.getByRole("heading", { name: "Sign in to see your transfers.", exact: true })).toBeVisible();
    await expect(main.getByText("Your history is in the explorer.", { exact: true })).toHaveCount(0);
    await expect(main.locator('a[href*="stellar.expert/explorer/testnet/tx/"]')).toHaveCount(0);
    await expect(main.getByRole("button", { name: "Refresh activity", exact: true })).toHaveCount(0);
    expect(await main.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await main.getByRole("tab", { name: "Public proof", exact: true }).click();
    await expect(main.getByRole("tabpanel")).toContainText("Project receipts, not your transactions.");
    const archives = main.locator('a[href*="stellar.expert/explorer/testnet/tx/"]');
    await expect(archives).toHaveCount(10);
    for (const archive of await archives.all()) {
      await expect(archive).toHaveAttribute("href", /^https:\/\/stellar\.expert\/explorer\/testnet\/tx\/[a-f0-9]{64}$/);
      await expect(archive).toHaveAttribute("rel", "noopener noreferrer");
    }
    await main.getByRole("tab", { name: "My activity", exact: true }).click();
    await expect(main.locator('[data-personal-history-state="signed-out"]')).toBeVisible();
    await expect(main.locator('a[href*="stellar.expert/explorer/testnet/tx/"]')).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(csp).toEqual([]);
  });
}

test("Activity sign-in preserves the intended destination without inventing personal transfers", async ({ page }) => {
  await page.goto("/activity", { waitUntil: "domcontentloaded", timeout: 45000 });
  const main = page.locator("#app-content");
  await expect(main.locator('[data-personal-history-state="signed-out"]')).toBeVisible({ timeout: 20000 });
  const panel = main.getByRole("tabpanel");
  await panel.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/signin\?next=%2Factivity$/);
  const signin = page.locator("#app-content");
  // CI intentionally has no Supabase keys. Keep its honest unavailable state
  // valid, but require the OAuth button on configured Preview/production.
  if (new URL(page.url()).hostname === "localhost") {
    await expect(signin.getByRole("button", { name: "Explore demo", exact: true })).toBeVisible();
    await expect(signin.getByText(/Sandbox sign-in seam/)).toBeVisible();
  } else {
    await expect(signin.getByRole("button", { name: /Continue with Google/ })).toBeVisible();
  }
});
