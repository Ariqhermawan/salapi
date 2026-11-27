import { test, expect } from "@playwright/test";

for (const width of [375, 390, 1280]) test(`Smart Savings is reachable from Vaults at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

  await page.goto("/vaults", { waitUntil: "domcontentloaded" });
  const savingsLink = page.getByRole("link", { name: "Open Testnet savings", exact: true });
  await expect(savingsLink).toBeVisible();
  await expect(savingsLink).toHaveAttribute("href", "/savings");
  await savingsLink.click();

  await expect(page).toHaveURL(/\/savings$/);
  await expect(page).toHaveTitle("Smart Savings · Salapi");
  const main = page.locator("#app-content");
  await expect(main.locator("h1, h2, [role=heading]").first()).toBeVisible();
  await expect(main).toContainText(/Experimental Testnet savings|wallet|goal/i);
  expect(errors).toEqual([]);
});
