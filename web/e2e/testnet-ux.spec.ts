import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// Read-only candidate browser coverage. This is not authenticated Gmail,
// Supabase persistence or a Testnet payment acceptance test.
const allowedReads = new Set(["readCirclesSignupIdentity", "accountPhoto", "accountDetails"]);
test.beforeEach(async ({ page, baseURL }) => {
  test.skip(!["localhost", "127.0.0.1"].includes(new URL(baseURL!).hostname), "Candidate screenshots and action allowlist only run locally");
  const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
  const names = new Map(Object.entries(manifest.node as Record<string, { exportedName: string }>).map(([id, value]) => [id, value.exportedName]));
  await page.route("**/*", async route => {
    const request = route.request();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && !allowedReads.has(names.get(request.headers()["next-action"]) ?? ""))
      return route.fulfill({ status: 403, body: "Read-only candidate QA: mutation blocked" });
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const width of [320, 390, 1280]) test(`public proof separates mock photos, missing receipts and approvals at ${width}px`, async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
  await page.goto("/circles/tino-relief", { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Public proof", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Public proof", exact: true });
  await expect(panel.getByRole("heading", { name: "Trace the evidence, step by step", exact: true })).toBeVisible();
  await expect(panel.getByText("No on-chain campaign linked", { exact: true })).toBeVisible();
  await expect(panel.getByText("Not verified", { exact: true })).toBeVisible();
  const pipeline = panel.getByRole("list", { name: "Evidence and approval pipeline", exact: true });
  await expect(pipeline.locator("li")).toHaveCount(4);
  await expect(panel.locator("figure")).toHaveCount(3);
  await expect(panel.getByText("AI illustration · not proof", { exact: true })).toHaveCount(3);
  await expect(panel.getByRole("link", { name: /^D4 donation campaigns/ })).toHaveAttribute("href", "/campaigns?mode=testnet");
  await expect(panel.getByRole("link", { name: /^D3 Disaster Vault public proof/ })).toHaveAttribute("href", "/transparency");
  const mock = panel.locator("details").first();
  await expect(mock).not.toHaveAttribute("open");
  await mock.locator("summary").click();
  await expect(mock).toHaveAttribute("open");
  await expect(mock.getByText("No real receipt or transaction exists for this note.", { exact: true })).toBeVisible();
  await mock.locator("summary").click();
  await panel.getByRole("heading", { name: "Trace the evidence, step by step", exact: true }).scrollIntoViewIfNeeded();
  await page.evaluate(async () => { await document.fonts.ready; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await panel.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`proof-${width}.png`) });
  expect(errors).toEqual([]);
});

test("guest account details does not fabricate an identity or expose an upload", async ({ page }) => {
  await page.goto("/settings/account", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Account details", exact: true })).toBeVisible();
  await expect(page.getByText("Sign in to see and edit your account.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/signin");
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(page.getByText("Separate demo flow. This does not verify your account or enable real-money payments.", { exact: true })).toBeVisible();
});

test("launch signup is opt-in and never masquerades as a donation", async ({ page }) => {
  await page.goto("/circles/tino-relief/donate", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Continue to optional signup", exact: true }).click();
  const subscribe = page.getByRole("button", { name: "Request launch notification", exact: true });
  await expect(subscribe).toBeDisabled();
  const checkboxes = page.getByRole("checkbox");
  for (const box of await checkboxes.all()) await expect(box).not.toBeChecked();
  await expect(page.getByText("No payment. No guaranteed launch date. This amount is not a committed donation.", { exact: true })).toBeVisible();
  await expect(page.getByText("Testnet donor", { exact: true })).toHaveCount(0);
});
