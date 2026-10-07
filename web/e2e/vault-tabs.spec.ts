import { test, expect } from "@playwright/test";

// Read-only discovery checks. No join, deposit, donation or payout is submitted.
for (const width of [320, 390, 1280]) {
  test(`Vaults separates Arisan and Crowdfund without clipping at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/vaults", { waitUntil: "domcontentloaded", timeout: 45000 });
    const dashboard = page.getByTestId("vaults-dashboard");
    const tabs = dashboard.getByRole("tablist", { name: "Vault categories", exact: true });
    const arisan = tabs.getByRole("tab", { name: "Arisan", exact: true });
    const crowdfund = tabs.getByRole("tab", { name: "Crowdfund", exact: true });
    await expect(arisan).toHaveAttribute("aria-selected", "true");
    await expect(dashboard.locator("#vault-panel-arisan")).toBeVisible();
    await expect(dashboard.locator("#vault-panel-crowdfund")).toBeHidden();
    await expect(dashboard.getByRole("link", { name: "Create a room", exact: true })).toHaveAttribute("href", "/arisan/new");
    await expect(dashboard.getByRole("link", { name: "Join a room", exact: true })).toHaveAttribute("href", "/arisan/join");
    await expect(dashboard.getByRole("link", { name: /Original Paluwagan pool/ })).toBeVisible();
    await expect(dashboard.getByRole("link", { name: "Start a campaign", exact: true })).toHaveCount(0);
    for (const control of [arisan, crowdfund]) {
      const rect = await control.boundingBox();
      expect(rect).not.toBeNull(); expect(rect!.height).toBeGreaterThanOrEqual(44);
    }
    await crowdfund.click();
    await expect(crowdfund).toHaveAttribute("aria-selected", "true");
    await expect(dashboard.locator("#vault-panel-arisan")).toBeHidden();
    await expect(dashboard.locator("#vault-panel-crowdfund")).toBeVisible();
    await expect(dashboard.getByRole("link", { name: "Create a room", exact: true })).toHaveCount(0);
    await expect(dashboard.getByRole("link", { name: "Start a campaign", exact: true })).toHaveAttribute("href", "/campaigns?create=1");
    await expect(dashboard.getByRole("link", { name: /View pool and payout requests/ })).toHaveAttribute("href", "/transparency");
    const box = await dashboard.evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth }));
    expect(box.scroll).toBeLessThanOrEqual(box.width + 1);
    await arisan.click();
    await expect(arisan).toHaveAttribute("aria-selected", "true");
  });
}

test("Vault tabs support keyboard navigation, reload and Back to the selected category", async ({ page }) => {
  await page.goto("/vaults", { waitUntil: "domcontentloaded", timeout: 45000 });
  const arisan = page.getByRole("tab", { name: "Arisan", exact: true });
  const crowdfund = page.getByRole("tab", { name: "Crowdfund", exact: true });
  await arisan.press("ArrowRight");
  await expect(crowdfund).toBeFocused();
  await expect(crowdfund).toHaveAttribute("aria-selected", "true");
  await crowdfund.press("Home");
  await expect(arisan).toBeFocused();
  await arisan.press("End");
  await expect(crowdfund).toBeFocused();
  await page.reload();
  await expect(crowdfund).toHaveAttribute("aria-selected", "true");
  await page.getByRole("link", { name: /^Donation campaigns/ }).click();
  await expect(page).toHaveURL(/\/campaigns$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/vaults$/);
  await expect(crowdfund).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#vault-panel-crowdfund")).toBeVisible();
});
