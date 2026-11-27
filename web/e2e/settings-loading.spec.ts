import { test, expect } from "@playwright/test";

test("You keeps a neutral identity while readonly account reads are pending", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let heldRequests = 0;
  await page.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    const photoRead = request.method() === "GET" && url.pathname === "/api/account/photo" && !url.search;
    if (photoRead || (request.method() === "POST" && request.headers()["next-action"])) {
      heldRequests++;
      await held;
    }
    await route.continue();
  });
  try {
    await page.goto("/settings", { waitUntil: "domcontentloaded", timeout: 45000 });
    const profile = page.locator('[data-profile-state="loading"]');
    await expect.poll(() => heldRequests).toBeGreaterThan(0);
    await expect(profile).toBeVisible();
    await expect(profile).toHaveAttribute("aria-busy", "true");
    await expect(page.getByText("Salapi user", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Claim", exact: true })).toHaveCount(0);
    release();
    // A fresh guest may see the generic identity after the lookup. If account
    // verification is unavailable, the page must keep the neutral recovery UI
    // and must not open the username-claim flow. No login or transaction here.
    await expect(page.locator('[data-profile-state="ready"]')).toBeVisible({ timeout: 45000 });
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Claim", exact: true })).toHaveCount(0);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});
