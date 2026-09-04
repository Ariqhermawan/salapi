import { test, expect } from "@playwright/test";
import { collectCspViolations } from "./helpers";

// Every launch-critical route must render the app shell and produce NO CSP
// violations (proves the Content-Security-Policy doesn't break a real asset).
const ROUTES = [
  "/",
  "/vaults",
  "/send",
  "/activity",
  "/settings",
  "/circles",
  "/circles/tino-relief",
  "/circles/tino-relief/donate",
  "/receive",
  "/transparency",
  "/paluwagan",
  "/savings",
  "/topup",
  "/withdraw",
  "/docs",
];

for (const route of ROUTES) {
  test(`renders ${route} with no CSP violations`, async ({ page }) => {
    const csp = collectCspViolations(page);
    const resp = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 45000 });
    expect(resp?.status(), `HTTP status for ${route}`).toBeLessThan(400);
    if (route === "/docs") {
      await expect(page.getByRole("heading", { name: "Trustless community money pools on Stellar." })).toBeVisible({ timeout: 12000 });
      await expect(page.getByText("Public evidence")).toBeVisible({ timeout: 12000 });
    } else {
      // Global BottomNav renders on every app route → shell mounted.
      await expect(page.getByText("Vaults").first()).toBeVisible({ timeout: 12000 });
    }
    await page.waitForTimeout(600);
    expect(csp, `CSP violations on ${route}:\n${csp.join("\n")}`).toHaveLength(0);
  });
}
