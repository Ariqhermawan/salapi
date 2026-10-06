import { test, expect } from "@playwright/test";

// The giving flows stay distinct: local Home uses fictional Circles fixtures;
// non-preview Home still opens D4 campaign terms. Explicit D4 links keep mode.
// These are read-only navigation checks, never a payment/chain acceptance test.

test("Home campaign link preserves the displayed local or D4 flow before any submission", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
  // Closed/released D4 campaigns are correctly read-only "View campaign"
  // cards. Their presence must not require inventing an open donation window.
  const campaignLink = page.getByLabel("Campaign carousel").getByRole("link", { name: /^(?:Donate(?: · local demo)?|View campaign)$/ }).first();
  await campaignLink.waitFor({ state: "visible", timeout: 12000 });
  if ((await campaignLink.textContent())?.includes("local demo")) {
    await expect(campaignLink).toHaveAttribute("href", /^\/circles\/[a-z0-9-]+\/donate$/);
    await campaignLink.click();
    await expect(page).toHaveURL(/\/circles\/[a-z0-9-]+\/donate$/);
    await expect(page.getByRole("button", { name: "Review local donation", exact: true })).toBeVisible();
    await expect(page.getByText("Where your pledge would go", { exact: true })).toBeVisible();
  } else {
    await expect(campaignLink).toHaveAttribute("href", /^\/campaigns\?id=\d+$/);
    await campaignLink.click();
    await expect(page).toHaveURL(/\/campaigns\?id=\d+$/);
    await expect(page.getByRole("heading", { name: "Give with clarity.", exact: true })).toBeVisible();
  }
});

test("Home exposes example discovery and keeps D4 as a distinct route", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
  const catalog = page.getByRole("link", { name: "Browse all example causes", exact: true });
  if (await catalog.count()) {
    await expect(page.getByRole("link", { name: /^D4 Testnet campaigns/ })).toHaveAttribute("href", "/campaigns?mode=testnet");
    await expect(catalog).toHaveAttribute("href", "/campaigns");
    await expect(page.locator("#home-cause-category option")).toHaveCount(10);
    await catalog.click();
    await expect(page).toHaveURL(/\/campaigns$/);
  } else {
    const circles = page.getByRole("link", { name: "Explore Circles example causes", exact: true });
    await expect(circles).toHaveAttribute("href", "/circles");
    await circles.click();
    await expect(page).toHaveURL(/\/circles$/);
  }
  await expect(page.getByRole("heading", { name: "A cause can bring us closer.", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Explore this concept/ }).first().click();
  await expect(page).toHaveURL(/\/circles\/[a-z0-9-]+$/);
  await expect(page.getByRole("link", { name: "Preview a pledge", exact: true })).toBeVisible();
});

test("explicit examples and testnet mode switches retain separate catalogs and direct D4 IDs", async ({ page }) => {
  await page.goto("/campaigns?mode=examples", { waitUntil: "domcontentloaded", timeout: 45000 });
  await expect(page.getByRole("link", { name: "Browse examples", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: /Explore this concept/ })).toHaveCount(27);
  await expect(page.getByRole("group", { name: "Example cause categories", exact: true }).getByRole("button")).toHaveCount(10);
  await expect(page.getByRole("link", { name: "Testnet campaigns", exact: true })).toHaveAttribute("href", "/campaigns?mode=testnet");
  await page.getByRole("link", { name: "Testnet campaigns", exact: true }).click();
  await expect(page).toHaveURL(/\/campaigns\?mode=testnet$/);
  await expect(page.getByRole("link", { name: "Testnet campaigns", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Give with clarity.", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Explore this concept/ })).toHaveCount(0);
});

test("Vaults preserves discovery of Circles and the original Paluwagan pool", async ({ page }) => {
  await page.goto("/vaults", { waitUntil: "domcontentloaded", timeout: 45000 });
  await expect(page.getByRole("link", { name: /Salapi Circles · prototype/ })).toHaveAttribute("href", "/circles");
  await expect(page.getByRole("link", { name: /Original Paluwagan pool/ })).toHaveAttribute("href", "/paluwagan");
});

test("donor Back retains history while the Circles breadcrumb always opens the catalog", async ({ page }) => {
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

  const back2 = page.getByRole("button", { name: "Circles", exact: true });
  await back2.waitFor({ state: "visible", timeout: 12000 });
  await back2.click();
  await page.waitForTimeout(1000);
  expect(new URL(page.url()).pathname).toBe("/circles");
});

test("Circles breadcrumb does not return a visitor to organizer tools", async ({ page }) => {
  await page.goto("/circles/cats-recovery/manage", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.getByRole("link", { name: "Example cause", exact: true }).click();
  await expect(page).toHaveURL(/\/circles\/cats-recovery$/);
  await page.getByRole("button", { name: "Circles", exact: true }).click();
  await expect(page).toHaveURL(/\/circles$/);
  await expect(page.getByRole("heading", { name: "A cause can bring us closer.", exact: true })).toBeVisible();
});
