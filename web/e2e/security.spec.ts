import { test, expect } from "@playwright/test";

// The baseline security headers + the Content-Security-Policy must be present
// on the document response.
test("security headers + CSP present on /", async ({ request, baseURL }) => {
  const resp = await request.get(baseURL! + "/");
  const h = resp.headers();
  expect(h["x-frame-options"]).toBe("SAMEORIGIN");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["strict-transport-security"]).toContain("max-age=");

  const csp = h["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).toContain("frame-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("connect-src 'self' https://*.supabase.co");
});

test("landing embeds the live Salapi app and keeps navigation interactive", async ({ page, request, baseURL }) => {
  const landing = await request.get(`${baseURL!}/landing`);
  const landingHeaders = landing.headers();
  const landingCsp = landingHeaders["content-security-policy"] ?? "";
  expect(landingCsp).toContain("frame-ancestors 'none'");
  expect(landingCsp).toContain("frame-src 'self'");

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/landing", { waitUntil: "domcontentloaded" });
  const app = page.frameLocator('iframe[title="Interactive Salapi app preview"]');
  await expect(app.locator(".sl-app-frame")).toBeVisible({ timeout: 20000 });
  const navigation = app.getByRole("navigation", { name: "Main navigation", exact: true });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: "Arisan", exact: true }).click();
  await expect(app.getByRole("heading", { name: "Arisan", exact: true })).toBeVisible({ timeout: 20000 });
});

test("mobile landing keeps the live handset visible and interactive", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/landing", { waitUntil: "domcontentloaded" });
  const iframe = page.locator('iframe[title="Interactive Salapi app preview"]');
  await expect(iframe).toHaveCSS("display", "block");
  await iframe.scrollIntoViewIfNeeded();
  const app = page.frameLocator('iframe[title="Interactive Salapi app preview"]');
  await expect(app.locator(".sl-app-frame")).toBeVisible({ timeout: 20000 });
  await expect(app.locator("html")).toHaveAttribute("data-theme", "light");
  await app.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("button", { name: "Arisan", exact: true }).click();
  await expect(app.getByRole("heading", { name: "Arisan", exact: true })).toBeVisible({ timeout: 20000 });
});
