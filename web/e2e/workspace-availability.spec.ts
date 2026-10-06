import { expect, test } from "@playwright/test";

test.describe("disabled user campaign workspace", () => {
  test.skip(process.env.E2E_WORKSPACE_DISABLED !== "1", "Opt in for a deployment with the workspace flag disabled");

  test("ordinary navigation never advertises disabled campaign publication", async ({ page }) => {
    for (const route of ["/", "/circles", "/circles/create", "/circles/supported"]) {
      await page.goto(route);
      await expect(page.locator("#app-content")).toBeVisible();
      await expect(page.locator('a[href="/circles/workspace"], a[href="/circles/workspace/create"]')).toHaveCount(0);
    }
  });

  test("direct publication remains unavailable without presenting an upload form", async ({ page }) => {
    await page.goto("/circles/workspace/create");
    const unavailable = page.getByRole("status");
    await expect(unavailable.getByRole("heading", { name: "Publication unavailable" })).toBeVisible();
    await expect(unavailable.getByText(/Workspace pengguna belum diaktifkan/)).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Publish to|Terbitkan/ })).toHaveCount(0);
  });
});
