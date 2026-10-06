import { test, expect, type Page } from "@playwright/test";

// Rendered motion checks use intercepted action responses. They never submit a
// transfer, authenticate a real account, or claim a fixture is on-chain proof.
const hash = "b".repeat(64);

async function stubStatus(page: Page, result: object) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const calls = { status: 0, other: 0 };
  await page.addInitScript((savedHash) => {
    sessionStorage.setItem("salapi:testnet:unresolved-send:v1", savedHash);
  }, hash);
  await page.route("**/*", async route => {
    const request = route.request();
    if (request.method() !== "POST" || !request.headers()["next-action"]) return route.continue();
    // Intercept every Server Action, so even a regression cannot submit tokens.
    const checking = request.postData() === JSON.stringify([hash]);
    if (checking) { calls.status++; await gate; } else calls.other++;
    await route.fulfill({ status: 200, contentType: "text/x-component; charset=utf-8",
      body: `0:{"a":"$@1","f":"","b":"motion-fixture"}\n1:${JSON.stringify(checking ? result : null)}\n` });
  });
  return { calls, release };
}

test("read-only reconciliation shows animated waiting then confirmed success without a submission", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const stub = await stubStatus(page, { ok: true, link: `https://stellar.expert/explorer/testnet/tx/${hash}` });
  await page.goto("/send", { waitUntil: "domcontentloaded" });
  const main = page.locator("#app-content");
  await expect(main.getByRole("heading", { name: "Confirmation pending.", exact: true })).toBeVisible();
  await main.getByRole("button", { name: "Check submitted transaction", exact: true }).click();
  const wait = main.getByRole("status");
  await expect(wait).toContainText("Checking the original transaction…");
  await expect(wait).toContainText("No new transfer is being submitted.");
  await expect(main.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
  await expect(main.getByText("Testnet transfer confirmed", { exact: true })).toHaveCount(0);
  expect(await wait.evaluate(node => [...node.querySelectorAll("span")].some(element => getComputedStyle(element).animationName !== "none"))).toBe(true);
  stub.release();
  await expect(main.getByRole("status")).toContainText("Testnet transfer confirmed");
  await expect(main.getByRole("button", { name: "View Activity", exact: true })).toBeVisible();
  expect(stub.calls.status).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem("salapi:testnet:unresolved-send:v1"))).toBeNull();
  expect(errors).toEqual([]);
});

test("reduced motion retains status text, and an unknown outcome never shows successful animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const stub = await stubStatus(page, { ok: false, pending: true, hash, error: "Fixture outcome remains unknown" });
  await page.goto("/send", { waitUntil: "domcontentloaded" });
  const main = page.locator("#app-content");
  await main.getByRole("button", { name: "Check submitted transaction", exact: true }).click();
  const wait = main.getByRole("status");
  await expect(wait).toContainText("Checking the original transaction…");
  expect(await wait.evaluate(node => [...node.querySelectorAll("span, i")].every(element => getComputedStyle(element).animationName === "none"))).toBe(true);
  stub.release();
  await expect(main.getByRole("alert")).toContainText("Fixture outcome remains unknown");
  await expect(main.getByText("Testnet transfer confirmed", { exact: true })).toHaveCount(0);
  await expect(main.getByRole("button", { name: "Confirm Testnet transfer", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("salapi:testnet:unresolved-send:v1"))).toBe(hash);
  expect(stub.calls.status).toBe(1);
});
