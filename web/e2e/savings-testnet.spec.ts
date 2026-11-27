import { test, expect } from "@playwright/test";

for (const width of [375, 390, 1280]) test(`Smart Savings shows its Testnet status at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

  await page.goto("/savings", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle("Smart Savings · Salapi");
  const main = page.locator("#app-content");
  await expect(main).toContainText(/The Smart Savings Testnet contract is not configured|Experimental Testnet savings/);
  expect(errors).toEqual([]);
});
