import { test, expect } from "@playwright/test";
import { collectCspViolations } from "./helpers";

// Read-only checks for the prototype payment choices. Hosted checkout and
// bank payout are intentionally disconnected on the production app.
test("top-up providers remain visible and disabled until checkout is connected", async ({ page }) => {
  const csp = collectCspViolations(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  await page.goto("/topup?method=provider&cur=idr", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tab", { name: "IDR", exact: true })).toHaveAttribute("aria-selected", "true");
  for (const name of [/QRIS/, /Virtual account/, /Debit or credit card/]) {
    const method = page.getByRole("button", { name });
    await expect(method).toBeVisible();
    await expect(method).toBeDisabled();
    await expect(method).toContainText("Coming soon");
  }
  await expect(page.getByText("Payment provider not connected yet", { exact: true }).first()).toBeVisible();

  await page.goto("/topup?method=provider&cur=php", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tab", { name: "PHP", exact: true })).toHaveAttribute("aria-selected", "true");
  const gcash = page.getByRole("button", { name: /GCash/ });
  await expect(gcash).toBeVisible();
  await expect(gcash).toBeDisabled();
  await expect(gcash).toContainText("Coming soon");
  await expect(page.locator('input[type="password"],input[type="email"],input[type="file"]')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(csp).toEqual([]);
});

test("bank withdrawal discovery does not collect bank details or claim payout support", async ({ page }) => {
  const csp = collectCspViolations(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  for (const currency of ["idr", "php"]) {
    await page.goto(`/withdraw?cur=${currency}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Bank payout is not connected", exact: true })).toBeVisible();
    await expect(page.getByText("No bank details are collected or stored here.", { exact: false })).toBeVisible();
    await expect(page.locator('input[type="password"],input[type="email"],input[type="file"]')).toHaveCount(0);
  }

  expect(errors).toEqual([]);
  expect(csp).toEqual([]);
});
