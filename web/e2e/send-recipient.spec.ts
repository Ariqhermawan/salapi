import { test, expect, type Page } from "@playwright/test";

// Actual /send rendering, isolated HTTP fixtures. All Server Actions are
// intercepted, including unexpected writes. Never confirm a real transfer.
const address = "GCGZVDFYMFKJFPDKMJDNZXU7ZFIPSOZ22367XHIQ32VOH56ELN5ISZND";
const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1cAAAAASUVORK5CYII=";

async function fixture(page: Page, options: { result?: object; slowLookup?: boolean; slowPhoto?: boolean; photo?: string | null; canonical?: string; changed?: boolean } = {}) {
  let releaseLookup!: () => void, releasePhoto!: () => void;
  const lookupGate = new Promise<void>(resolve => { releaseLookup = resolve; });
  const photoGate = new Promise<void>(resolve => { releasePhoto = resolve; });
  const calls = { lookups: 0, photos: 0, writes: 0 };
  await page.route("**/*", async route => {
    const request = route.request();
    if (new URL(request.url()).pathname === "/api/transfers/recipient-identity") {
      calls.photos++; if (options.slowPhoto) await photoGate;
      const username = new URL(request.url()).searchParams.get("username");
      return route.fulfill({ json: options.changed ? { ok: false, code: "changed" }
        : { ok: true, username, address, handle: options.canonical ?? username, photoUrl: options.photo ?? null } });
    }
    if (request.method() !== "POST" || !request.headers()["next-action"]) return route.continue();
    const args = JSON.parse(request.postData() ?? "[]");
    let result: unknown = null;
    if (args.length === 0) result = "ariqhermawan";
    else if (args.length === 1 && typeof args[0] === "string") {
      calls.lookups++; if (options.slowLookup) await lookupGate;
      result = options.result ?? { ok: true, username: args[0], address };
    } else { calls.writes++; result = { ok: false, error: "Financial writes are blocked in this fixture" }; }
    return route.fulfill({ contentType: "text/x-component", body: `0:{"a":"$@1","f":"","i":false}\n1:${JSON.stringify(result)}\n` });
  });
  await page.goto("/send", { waitUntil: "domcontentloaded" });
  const main = page.locator("#app-content");
  await expect(main.getByRole("heading", { name: "Send by name.", exact: true })).toBeVisible();
  await expect(main.getByText("@ariqhermawan", { exact: true })).toBeVisible(); // hydration + own read
  await page.evaluate(() => document.fonts.ready); // assert layout after font metrics settle, not fallback-only
  await main.getByLabel("Amount · USD", { exact: true }).fill("5");
  return { main, calls, releaseLookup, releasePhoto };
}

for (const width of [390, 1280]) test(`review shows a permitted account photo and exact destination at ${width}px without waiting for photos`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 844 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const f = await fixture(page, { photo, slowPhoto: true });
  await f.main.getByLabel("Recipient @username", { exact: true }).fill("@IMAM");
  await f.main.getByRole("button", { name: "Review transfer", exact: true }).click();
  const review = f.main.getByRole("article", { name: "Transfer review details" });
  await expect(review).toContainText("@imam"); await expect(review).toContainText(address);
  expect((await review.getByText("@ariqhermawan", { exact: true }).boundingBox())!.height).toBeLessThan(20);
  await expect(review).toContainText("Username registered on Stellar Testnet");
  await expect(f.main.getByRole("button", { name: "Confirm Testnet transfer", exact: true })).toBeEnabled();
  f.releasePhoto();
  await expect(review.getByRole("img", { name: "@imam", exact: true })).toBeVisible();
  await expect(review.getByRole("img", { name: "@imam", exact: true })).toHaveAttribute("src", photo);
  await expect(review).toContainText("could still be the wrong person");
  const bounds = await review.boundingBox(); const confirm = await f.main.getByRole("button", { name: "Confirm Testnet transfer", exact: true }).boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  expect(confirm!.y + confirm!.height).toBeLessThanOrEqual(744); // above bottom navigation, no confirmation scroll
  await page.screenshot({ path: testInfo.outputPath(`recipient-review-${width}.png`), fullPage: false });
  expect(errors).toEqual([]); expect(f.calls).toEqual({ lookups: 1, photos: 1, writes: 0 });
});

for (const width of [320, 375, 390]) test(`a long recipient username keeps the single review confirmation above navigation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 812 });
  const f = await fixture(page, { photo });
  await f.main.getByLabel("Recipient @username", { exact: true }).fill("nonimaharani");
  await f.main.getByRole("button", { name: "Review transfer", exact: true }).click();
  const dock = f.main.getByTestId("transfer-review-actions");
  const confirm = dock.getByRole("button", { name: "Confirm Testnet transfer", exact: true });
  await expect(confirm).toBeVisible(); await expect(confirm).toBeEnabled();
  await expect(f.main.getByRole("button", { name: "Confirm Testnet transfer", exact: true })).toHaveCount(1);
  const navigation = await page.locator(".sl-tabbar").boundingBox();
  const rect = await confirm.boundingBox();
  expect(rect!.y).toBeGreaterThanOrEqual(0); expect(rect!.y + rect!.height).toBeLessThan(navigation!.y - 16);
  expect(await f.main.evaluate(el => el.scrollTop)).toBe(0);
  expect(f.calls.writes).toBe(0);
});

test("invalid characters are preserved and cannot silently become a registered recipient", async ({ page }) => {
  const f = await fixture(page);
  const input = f.main.getByLabel("Recipient @username", { exact: true }); await input.fill("i-mam");
  await expect(input).toHaveValue("i-mam"); await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(f.main.getByRole("alert")).toContainText("3–32 letters");
  await expect(f.main.getByRole("button", { name: "Review transfer", exact: true })).toBeDisabled();
  expect(f.calls.lookups).toBe(0); expect(f.calls.writes).toBe(0);
});

for (const code of ["not_found", "unavailable"]) test(`${code} has distinct recovery copy and cannot advance to confirmation`, async ({ page }) => {
  const f = await fixture(page, { result: { ok: false, code, error: "Fixture failure" } });
  await f.main.getByLabel("Recipient @username", { exact: true }).fill("imma");
  await f.main.getByRole("button", { name: "Review transfer", exact: true }).click();
  await expect(f.main.getByRole("alert")).toContainText(code === "not_found" ? "@imma is not registered. Check the spelling" : "This does not mean it is unregistered");
  await expect(f.main.getByRole("button", { name: "Confirm Testnet transfer", exact: true })).toHaveCount(0);
  expect(f.calls.writes).toBe(0);
});

test("editing while lookup is pending discards the old recipient instead of reviewing a stale destination", async ({ page }) => {
  const f = await fixture(page, { slowLookup: true });
  const input = f.main.getByLabel("Recipient @username", { exact: true }); await input.fill("imam");
  await f.main.getByRole("button", { name: "Review transfer", exact: true }).click();
  await expect.poll(() => f.calls.lookups).toBe(1); await input.fill("nonimaharani"); f.releaseLookup();
  await expect(f.main.getByRole("button", { name: "Review transfer", exact: true })).toBeEnabled();
  await expect(f.main.getByRole("button", { name: "Confirm Testnet transfer", exact: true })).toHaveCount(0);
  await expect(input).toHaveValue("nonimaharani"); expect(f.calls.photos).toBe(0); expect(f.calls.writes).toBe(0);
});

test("missing photo uses initials and an old registered alias clearly shows the current verified username", async ({ page }) => {
  const f = await fixture(page, { canonical: "imam_current" });
  await f.main.getByLabel("Recipient @username", { exact: true }).fill("imam_old");
  await f.main.getByRole("button", { name: "Review transfer", exact: true }).click();
  const review = f.main.getByRole("article", { name: "Transfer review details" });
  await expect(review).toContainText("@imam_current"); await expect(review).toContainText("Via alias @imam_old");
  await expect(review.getByRole("img", { name: "@imam_current", exact: true })).toHaveCount(0);
  expect(f.calls.writes).toBe(0);
});

test("a rebound optional identity invalidates the review before any transfer can be submitted", async ({ page }) => {
  const f = await fixture(page, { changed: true });
  await f.main.getByLabel("Recipient @username", { exact: true }).fill("imam");
  await f.main.getByRole("button", { name: "Review transfer", exact: true }).click();
  await expect(f.main.getByRole("alert")).toContainText("recipient changed");
  await expect(f.main.getByRole("button", { name: "Confirm Testnet transfer", exact: true })).toHaveCount(0);
  expect(f.calls.writes).toBe(0);
});
