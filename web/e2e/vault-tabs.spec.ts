import { test, expect } from "@playwright/test";

test("Arisan empty state follows the prototype and keeps create/join actions available", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/vaults", { waitUntil: "domcontentloaded", timeout: 45000 });

  const main = page.locator("#app-content");
  const empty = main.getByTestId("arisan-empty");
  await expect(main.getByRole("heading", { name: "Arisan", exact: true })).toBeVisible();
  await expect(empty.getByRole("heading", { name: "No rooms yet", exact: true })).toBeVisible();
  await expect(empty.getByText("Start a room or join one with a code.", { exact: true })).toBeVisible();
  await expect(empty.locator('img[alt=""]')).toBeVisible();

  const actions = empty.getByRole("navigation", { name: "Create or join an Arisan room", exact: true });
  await expect(actions.getByRole("link", { name: "Create a room", exact: true })).toHaveAttribute("href", "/arisan/new");
  await expect(actions.getByRole("link", { name: "Join with a code", exact: true })).toHaveAttribute("href", "/arisan/join");
  await expect(main.getByRole("tablist")).toHaveCount(0);
  await expect(main.getByRole("link", { name: /scheduled room/i })).toHaveCount(0);
  await expect(main.getByText("Powered by", { exact: true })).toBeVisible();
  await expect(main.getByRole("img", { name: "Stellar", exact: true })).toBeVisible();

  const geometry = await main.evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
});
