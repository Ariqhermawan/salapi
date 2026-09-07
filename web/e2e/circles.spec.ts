import { test, expect } from "@playwright/test";

// The Circles funnel + back chain (regression guard for the reported bug):
// Home "Donate" must open the circle DETAIL first, and backing out of the flow
// entered from Home must return to Home — not strand the user in /circles.

test("Home Donate opens the circle detail, not the pledge", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
  const donate = page.getByRole("button", { name: /donate/i }).first();
  await donate.waitFor({ state: "visible", timeout: 12000 });
  await expect(async () => {
    if (new URL(page.url()).pathname === "/") await donate.click();
    await expect(page).toHaveURL(/\/circles\/tino-relief$/, { timeout: 1500 });
  }).toPass({ timeout: 12000 });
});

test("back chain entered from Home: pledge -> detail -> Home", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(300);
  await page.goto("/circles/tino-relief", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(300);
  await page.goto("/circles/tino-relief/donate", { waitUntil: "domcontentloaded", timeout: 45000 });

  const back = page.getByRole("button", { name: "Back" }).first();
  await back.waitFor({ state: "visible", timeout: 12000 });
  await page.waitForTimeout(500);
  await back.click();
  await page.waitForTimeout(1000);
  expect(new URL(page.url()).pathname).toBe("/circles/tino-relief");

  const back2 = page.getByRole("button", { name: "Back" }).first();
  await back2.waitFor({ state: "visible", timeout: 12000 });
  await back2.click();
  await page.waitForTimeout(1000);
  expect(new URL(page.url()).pathname).toBe("/");
});
