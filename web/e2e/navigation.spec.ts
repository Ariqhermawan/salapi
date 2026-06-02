import { test, expect, type Page } from "@playwright/test";

// Back must return to where the user actually came from (history-aware),
// not a hardcoded Home. Regression guard for the useGoBack fix.
async function pathAfterBack(page: Page, parent: string, child: string): Promise<string> {
  await page.goto(parent, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(300);
  await page.goto(child, { waitUntil: "domcontentloaded", timeout: 45000 });
  const back = page.getByRole("button", { name: "Back" }).first();
  await back.waitFor({ state: "visible", timeout: 12000 });
  await page.waitForTimeout(500); // let hydration wire the handler
  await back.click();
  await page.waitForTimeout(1000);
  return new URL(page.url()).pathname;
}

test("back from a child returns to the real parent, not Home", async ({ page }) => {
  expect(await pathAfterBack(page, "/vaults", "/activity")).toBe("/vaults");
  expect(await pathAfterBack(page, "/send", "/receive")).toBe("/send");
  // entered from Home → back IS Home (Home was the real previous)
  expect(await pathAfterBack(page, "/", "/withdraw")).toBe("/");
});
