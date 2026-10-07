import { test, expect } from "@playwright/test";

// A production-shaped local build with candidate CID and feature flag unset.
// This proves disabled UI, not chain custody or authenticated Gmail E2E.
test("an unconfigured installment candidate cannot offer join, create or deposit", async ({ page, baseURL }) => {
  test.skip(process.env.E2E_ARISAN_UNCONFIGURED !== "1", "Needs a separate production-shaped local build with no candidate CID");
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const externalWrites: string[] = [];
  await page.route("**/*", route => {
    const request = route.request();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())
      && !["localhost", "127.0.0.1"].includes(new URL(request.url()).hostname)) {
      externalWrites.push(request.url());
      return route.fulfill({ status: 403, body: "External writes prohibited in local QA" });
    }
    return route.continue();
  });
  await page.goto("/arisan/funding");
  await expect(page.getByRole("alert").filter({ hasText: "Installment Arisan is unavailable" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Try as member", exact: true })).toHaveCount(0);
  await page.getByLabel("Room name", { exact: true }).fill("Unconfigured QA");
  await page.getByLabel("Invite code", { exact: true }).fill("FAM234");
  await expect(page.getByRole("button", { name: "Review invitation", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Review room terms", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Confirm room without deposit", exact: true })).toHaveCount(0);
  await page.goto("/arisan/funding/1");
  await expect(page.getByRole("alert").filter({ hasText: "Installment Arisan is unavailable" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Verify this circle first.", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review contribution", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start fully funded arisan", exact: true })).toHaveCount(0);
  expect(externalWrites).toEqual([]);
});
