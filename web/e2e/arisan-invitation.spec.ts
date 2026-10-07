import { test, expect } from "@playwright/test";

// Explicit local preview only. These are browser interactions and storage,
// never Google login, live membership or on-chain funding acceptance tests.
test.beforeEach(async ({ page, baseURL }) => {
  test.skip(process.env.E2E_ARISAN_PREVIEW !== "1", "Requires a separately started NEXT_PUBLIC_LOCAL_PREVIEW=1 server");
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  await page.route("**/*", async route => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(route.request().method()))
      return route.fulfill({ status: 403, body: "No server writes allowed in local preview QA" });
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
});

async function review(page: import("@playwright/test").Page) {
  await page.goto("/arisan/join", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/arisan\/join$/);
  await expect(page).toHaveTitle(/Salapi/);
  await expect(page.getByText("Use FAM234 to try the local join flow. Example data only.", { exact: true })).toBeVisible();
  const input = page.locator('input[placeholder="FAM234"]');
  await expect(input).toBeEnabled();
  await input.fill("FAM234");
  await page.getByRole("button", { name: "Review invitation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Know the terms first.", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join local example", exact: true })).toBeEnabled();
  await expect(page.getByText(/Application error:|Runtime Error|Build Error/)).toHaveCount(0);
}

for (const width of [320, 390, 1280]) test(`invitation review discloses exact XLM and fits ${width}px`, async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
  await review(page);
  const terms = page.locator("dl");
  await expect(terms).toContainText("Share per round");
  await expect(terms).toContainText("38.4615385 Testnet XLM");
  await expect(terms).toContainText("192.3076925 Testnet XLM");
  await expect(terms).toContainText("604800 seconds between rounds (local example)");
  await expect(page.getByText(/Illustrative display only: share/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await terms.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`invitation-${width}.png`), fullPage: true });
  expect(errors).toEqual([]);
});

test("back invalidates accepted invite, invalid code cannot join, and confirmed preview membership is not host permission", async ({ page }) => {
  const financialRequests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) financialRequests.push(request.url()); });
  await review(page);
  await page.getByRole("button", { name: "Back to arisan rooms", exact: true }).click();
  await expect(page.locator('input[placeholder="FAM234"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Join local example", exact: true })).toHaveCount(0);
  await page.locator('input[placeholder="FAM234"]').fill("BAD234");
  await page.getByRole("button", { name: "Review invitation", exact: true }).click();
  await expect(page.getByText("This local example uses invite code FAM234.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join local example", exact: true })).toHaveCount(0);
  await page.locator('input[placeholder="FAM234"]').fill("FAM234");
  await page.getByRole("button", { name: "Review invitation", exact: true }).click();
  await page.getByRole("button", { name: "Join local example", exact: true }).click();
  await expect(page).toHaveURL(/\/arisan\/1$/);
  await expect(page.getByText("Example data · no transactions", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("salapi.preview.arisan-joined"))).toBe("1");
  await expect(page.locator("details").filter({ hasText: "Local example controls" })).toHaveCount(0);
  const rules = page.locator("details").filter({ hasText: "How this room works" });
  await rules.locator("summary").click();
  await expect(rules).toContainText("192.3076925 Testnet XLM");
  await page.reload();
  await expect(page.getByText("Example data · no transactions", { exact: true })).toBeVisible();
  await expect(page.locator("details").filter({ hasText: "Local example controls" })).toHaveCount(0);
  expect(financialRequests).toEqual([]);
  expect(errors).toEqual([]);
});
