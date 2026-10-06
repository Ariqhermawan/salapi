import { test, expect } from "@playwright/test";
import { collectCspViolations } from "./helpers";

// Read-only candidate checks. No hosted checkout, funding or payout is invoked.
test("GCash and QRIS remain discoverable but disconnected outside local preview", async ({ page }) => {
  const csp = collectCspViolations(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/topup", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Deposit XLM", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "GCash / QRIS", exact: true }).click();
  await expect(page.getByText("Providers not connected", { exact: true })).toBeVisible();
  await expect(page.locator('[data-payment-channel="gcash"]')).toBeDisabled();
  await expect(page.locator('[data-payment-channel="qris"]')).toBeDisabled();
  await expect(page.getByText(/No provider request, checkout, ledger credit/)).toBeVisible();
  await expect(page.locator('input[type="password"],input[type="email"],input[type="file"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Deposit XLM", exact: true }).click();
  await expect(page.getByRole("button", { name: "Deposit XLM", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
  expect(csp).toEqual([]);
});

test("withdraw discovery distinguishes GCash and bank payout from merchant QRIS", async ({ page }) => {
  const csp = collectCspViolations(page);
  await page.goto("/withdraw", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-payment-channel="gcash"]')).toBeDisabled();
  await expect(page.locator('[data-payment-channel="qris"]')).toBeDisabled();
  await expect(page.locator('[data-payment-channel="bank-wallet"]')).toBeDisabled();
  await expect(page.getByText(/QRIS TUNTAS/)).toBeVisible();
  await expect(page.locator('input[type="password"],input[type="email"],input[type="file"]')).toHaveCount(0);
  expect(csp).toEqual([]);
});
