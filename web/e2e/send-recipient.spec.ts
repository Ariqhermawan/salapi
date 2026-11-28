import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { QUOTE_FRESH_AGE_MS } from "../lib/market-prices";

// Actual /send rendering, isolated HTTP fixtures. All Server Actions are
// intercepted, including unexpected writes. Never confirm a real transfer.
const address = "GCGZVDFYMFKJFPDKMJDNZXU7ZFIPSOZ22367XHIQ32VOH56ELN5ISZND";
const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1cAAAAASUVORK5CYII=";
const receiptHash = "ab".repeat(32);
const explorer = `https://stellar.expert/explorer/testnet/tx/${receiptHash}`;
const intentId = "11111111-1111-4111-8111-111111111111";
const sender = "GAKZLTZFGSSM372XUKW2ZIJ5GSHVVIW5BYZIKIXRW2BW4MM6TUI5536Y";
function actionNames() {
  const manifestPath = process.env.E2E_SERVER_ACTION_MANIFEST ?? ".next/server/server-reference-manifest.json";
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return new Map(Object.entries(manifest.node as Record<string, { exportedName: string }>).map(([id, value]) => [id, value.exportedName]));
}

async function fixture(page: Page, options: {
  result?: object;
  slowLookup?: boolean;
  slowPhoto?: boolean;
  photo?: string | null;
  canonical?: string;
  changed?: boolean;
  usdPrice?: number | null;
  mockSuccess?: boolean;
} = {}) {
  let releaseLookup!: () => void, releasePhoto!: () => void;
  const lookupGate = new Promise<void>(resolve => { releaseLookup = resolve; });
  const photoGate = new Promise<void>(resolve => { releasePhoto = resolve; });
  const calls = { lookups: 0, photos: 0, writes: 0 };
  const quoteRequests: Array<number | null> = [];
  const submitted: unknown[][] = [];
  const preparations: unknown[][] = [];
  let preparedAmount = "";
  const names = actionNames();
  let usdPrice = options.usdPrice === undefined ? 0.125 : options.usdPrice;
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/market-prices") {
      quoteRequests.push(usdPrice);
      if (usdPrice === null) {
        return route.fulfill({ json: { status: "unavailable", source: "CoinGecko", reason: "provider-unavailable" } });
      }
      const updatedAt = Math.floor(Date.now() / 1000);
      return route.fulfill({ json: { status: "fresh", source: "CoinGecko", fetchedAt: updatedAt, assets: {
        xlm: { prices: { usd: usdPrice, php: usdPrice * 58, idr: usdPrice * 16000, vnd: usdPrice * 25500 }, updatedAt },
        usdc: { prices: { usd: 1, php: 58, idr: 16000, vnd: 25500 }, updatedAt },
      } } });
    }
    if (url.pathname === "/api/transfers/recipient-identity") {
      calls.photos++; if (options.slowPhoto) await photoGate;
      const username = url.searchParams.get("username");
      return route.fulfill({ json: options.changed ? { ok: false, code: "changed" }
        : { ok: true, username, address, handle: options.canonical ?? username, photoUrl: options.photo ?? null } });
    }
    if (request.method() !== "POST" || !request.headers()["next-action"]) return route.continue();
    const name = names.get(request.headers()["next-action"]);
    const args = JSON.parse(request.postData() ?? "[]");
    let result: unknown = null;
    if (name === "myHandle") result = "ariqhermawan";
    else if (name === "lookupRecipient") {
      calls.lookups++; if (options.slowLookup) await lookupGate;
      result = options.result ?? { ok: true, username: args[0], address };
    } else if (name === "prepareUsernameSend") {
      preparations.push(args); preparedAmount = args[1];
      result = { ok: true, intentId, sender, username: args[0], recipient: args[2], amountStroops: args[1],
        feeStroops: "100", expiresAt: "2099-01-01T00:00:00.000Z" };
    } else if (name === "confirmUsernameSend") {
      calls.writes++;
      submitted.push(args);
      result = options.mockSuccess && args.length === 1 && args[0] === intentId
        ? { ok: true, to: address, hash: receiptHash, link: explorer, amountStroops: preparedAmount }
        : { ok: false, error: "Financial writes are blocked in this fixture" };
    } else if (name === "cancelUsernameSend") result = { ok: true };
    else {
      calls.writes++;
      submitted.push(args);
      result = { ok: false, error: `Unexpected Server Action ${name ?? "unknown"}` };
    }
    return route.fulfill({ contentType: "text/x-component", body: `0:{"a":"$@1","f":"","i":false}\n1:${JSON.stringify(result)}\n` });
  });
  await page.goto("/send", { waitUntil: "domcontentloaded" });
  const main = page.locator("#app-content");
  await expect(main.getByRole("heading", { name: "Send by name.", exact: true })).toBeVisible();
  await expect(main.getByText("@ariqhermawan", { exact: true })).toBeVisible(); // hydration + own read
  await page.evaluate(() => document.fonts.ready); // assert layout after font metrics settle, not fallback-only
  await main.getByLabel("Amount · USD", { exact: true }).fill("5");
  return { main, calls, quoteRequests, submitted, preparations, releaseLookup, releasePhoto,
    setUsdPrice: (price: number) => { usdPrice = price; } };
}

test("a refreshed USD quote keeps reviewed XLM and its receipt exact", async ({ page }) => {
  const f = await fixture(page, { mockSuccess: true });
  await f.main.getByLabel("Amount · USD", { exact: true }).fill("50");
  await f.main.getByLabel("Recipient @username", { exact: true }).fill("imam");
  await f.main.getByRole("button", { name: "Review transfer", exact: true }).click();
  const review = f.main.getByRole("article", { name: "Transfer review details" });
  await expect(review).toContainText(/400\.0000000\s*Testnet XLM/);
  await expect(review).toContainText("USD estimate");

  f.setUsdPrice(0.25);
  const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/market-prices");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await refreshed;
  expect(f.quoteRequests).toEqual([0.125, 0.25]);
  await expect(review).toContainText(/400\.0000000\s*Testnet XLM/);
  await f.main.getByRole("button", { name: "Confirm Testnet transfer", exact: true }).click();

  expect(f.preparations).toEqual([["imam", "4000000000", address]]);
  expect(f.submitted).toEqual([[intentId]]);
  const receipt = f.main.getByRole("article", { name: "Transfer receipt details" });
  await expect(receipt).toContainText(/400\.0000000\s*Testnet XLM/);
  await expect(receipt).toContainText("USD estimate at review");
  await expect(receipt).toContainText("$50.00");
  await expect(f.main.locator(`a[href="${explorer}"]`)).toBeVisible();
});

test("an expired reviewed USD quote returns to the amount form before sending", async ({ page }) => {
  await page.clock.install({ time: new Date() });
  const f = await fixture(page);
  await f.main.getByLabel("Recipient @username", { exact: true }).fill("imam");
  await f.main.getByRole("button", { name: "Review transfer", exact: true }).click();
  const confirm = f.main.getByRole("button", { name: "Confirm Testnet transfer", exact: true });
  await expect(confirm).toBeEnabled();

  await page.clock.setSystemTime(Date.now() + QUOTE_FRESH_AGE_MS + 1_000);
  expect(f.quoteRequests).toEqual([0.125]);
  await confirm.click();

  await expect(f.main.getByRole("alert")).toContainText("The CoinGecko quote expired. Review the updated XLM amount before sending.");
  await expect(confirm).toHaveCount(0);
  await expect(f.main.getByLabel("Amount · USD", { exact: true })).toHaveValue("5");
  expect(f.submitted).toEqual([]);
});

test("an unavailable market rate prevents USD review without a demo fallback", async ({ page }) => {
  const f = await fixture(page, { usdPrice: null });
  await f.main.getByLabel("Amount · USD", { exact: true }).fill("50");
  await f.main.getByLabel("Recipient @username", { exact: true }).fill("imam");
  await expect.poll(() => f.quoteRequests).toEqual([null]);
  await expect(f.main.getByRole("button", { name: "Review transfer", exact: true })).toBeDisabled();
  await expect(f.main).toContainText("A fresh CoinGecko quote is unavailable. Refresh before reviewing a USD amount.");
  await expect(f.main).toContainText("Or switch to XLM and enter an exact amount.");
  await expect(f.main.getByRole("button", { name: "Enter XLM", exact: true })).toBeEnabled();
  await expect(f.main.getByRole("article", { name: "Transfer review details" })).toHaveCount(0);
  await expect(f.main).not.toContainText("446.1538462");
  expect(f.calls.lookups).toBe(0);
  expect(f.submitted).toEqual([]);
});

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
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(node => node.matches(":modal"))).toBe(true);
  const bounds = await dialog.boundingBox(); const frame = await page.locator(".sl-app-frame").boundingBox();
  const confirm = await dialog.getByRole("button", { name: "Confirm Testnet transfer", exact: true }).boundingBox();
  const navigationLocator = page.locator(".sl-tabbar");
  const navigation = await navigationLocator.isVisible() ? await navigationLocator.boundingBox() : null;
  expect(bounds!.x).toBeGreaterThanOrEqual(frame!.x);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(frame!.x + frame!.width);
  expect(Math.abs(bounds!.y + bounds!.height - (frame!.y + frame!.height))).toBeLessThanOrEqual(1);
  expect(confirm!.y).toBeGreaterThanOrEqual(bounds!.y);
  expect(confirm!.y + confirm!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
  if (navigation) expect(bounds!.y + bounds!.height).toBeGreaterThanOrEqual(navigation.y); // modal overlay safely covers tab navigation when present
  expect(await dialog.getByTestId("transfer-review-actions").evaluate(node => {
    const button = node.querySelector("button"); if (!button) return false;
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return !!hit && button.contains(hit);
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`recipient-review-${width}.png`), fullPage: false });
  expect(errors).toEqual([]); expect(f.calls).toEqual({ lookups: 1, photos: 1, writes: 0 });
});

for (const width of [320, 375, 390]) test(`a long recipient username keeps one reachable confirmation in the review sheet at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 812 });
  const f = await fixture(page, { photo });
  await f.main.getByLabel("Recipient @username", { exact: true }).fill("nonimaharani");
  await f.main.getByRole("button", { name: "Review transfer", exact: true }).click();
  const dock = f.main.getByTestId("transfer-review-actions");
  const confirm = dock.getByRole("button", { name: "Confirm Testnet transfer", exact: true });
  await expect(confirm).toBeVisible(); await expect(confirm).toBeEnabled();
  await expect(f.main.getByRole("button", { name: "Confirm Testnet transfer", exact: true })).toHaveCount(1);
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(node => node.matches(":modal"))).toBe(true);
  const sheetBounds = await dialog.boundingBox(); const rect = await confirm.boundingBox();
  expect(rect!.y).toBeGreaterThanOrEqual(sheetBounds!.y);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(sheetBounds!.y + sheetBounds!.height);
  expect(await dock.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
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
