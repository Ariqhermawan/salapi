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
  "/circles/tino-relief/organizer",
  "/circles/supported",
  "/campaigns",
  "/receive",
  "/transparency",
  "/paluwagan",
  "/arisan",
  "/savings",
  "/topup",
  "/withdraw",
  "/docs",
  "/privacy",
  "/terms",
];

for (const route of ROUTES) {
  test(`renders ${route} with no CSP violations`, async ({ page }) => {
    const csp = collectCspViolations(page);
    const resp = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 45000 });
    expect(resp?.status(), `HTTP status for ${route}`).toBeLessThan(400);
    if (route === "/docs") {
      await expect(page.getByRole("heading", { name: /Rules you can read\.\s*Proof you can check\./ })).toBeVisible({ timeout: 12000 });
      await expect(page.getByText("Public evidence")).toBeVisible({ timeout: 12000 });
    } else if (route === "/privacy" || route === "/terms") {
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 12000 });
    } else {
      // Global BottomNav renders on every app route → shell mounted.
      await expect(page.getByText("Vaults").first()).toBeVisible({ timeout: 12000 });
    }
    await page.waitForTimeout(600);
    expect(csp, `CSP violations on ${route}:\n${csp.join("\n")}`).toHaveLength(0);
  });
}
