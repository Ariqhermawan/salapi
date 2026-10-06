import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { walletSetupCopy } from "../lib/i18n/wallet-setup";
import { LOCALES, type Locale } from "../lib/i18n/config";

// Browser plugin not available. Use the existing Playwright candidate workflow.
// Local HTTP fixtures only: no actual login, saved wallet, Friendbot funding,
// provider calls or signed transfer. Run with --output outside the repository.
const address = "GAKZLTZFGSSM372XUKW2ZIJ5GSHVVIW5BYZIKIXRW2BW4MM6TUI5536Y";
type SetupResult = { ok: true; address: string } | { ok: false };

async function setupFixture(page: Page, locale: Locale = "en") {
  const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
  const actionNames = new Map(Object.entries(manifest.node as Record<string, { exportedName: string }>).map(([id, value]) => [id, value.exportedName]));
  expect([...actionNames.values()]).toContain("initializeWallet");
  const responses: ((value: SetupResult) => void)[] = [];
  const calls = { setup: 0, forbidden: [] as string[], reads: [] as string[] };
  let continuationReads = false;
  const appErrors: string[] = [];
  page.on("pageerror", error => appErrors.push(error.message));
  await page.addInitScript(value => localStorage.setItem("salapi_locale", value), locale);
  await page.route("**/*", async route => {
    const request = route.request();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) return route.continue();
    const name = actionNames.get(request.headers()["next-action"]);
    let value: unknown;
    if (request.method() === "POST" && name === "initializeWallet" && request.postData() === "[]") {
      calls.setup++;
      value = await new Promise<SetupResult>(resolve => responses.push(resolve));
    } else if (continuationReads && name === "myHandle") {
      calls.reads.push(name); value = null;
    } else if (continuationReads && name === "campaignState") {
      calls.reads.push(name); value = { ok: true, viewer: null, now: "1791244800", campaigns: [], contractId: null };
    } else {
      calls.forbidden.push(name ?? `${request.method()} ${request.url()}`);
      return route.fulfill({ status: 403, body: "Isolated wallet setup QA: real mutation blocked" });
    }
    await route.fulfill({ status: 200, contentType: "text/x-component; charset=utf-8", body: `0:{"a":"$@1","f":"","i":false}\n1:${JSON.stringify(value)}\n` });
  });
  return { calls, appErrors,
    allowContinuationReads() { continuationReads = true; },
    respond(value: SetupResult) { const release = responses.shift(); expect(release, "An explicit retry request must precede its fixture response").toBeDefined(); release!(value); },
  };
}
const copy = (key: Parameters<typeof walletSetupCopy>[1], locale: Locale = "en") => walletSetupCopy(locale, key);
async function openSetup(page: Page, next = "/send", locale: Locale = "en") {
  await page.goto(`/wallet/setup?next=${encodeURIComponent(next)}`, { waitUntil: "domcontentloaded" });
  const main = page.locator("#app-content");
  await expect(main.getByRole("heading", { name: copy("title", locale), exact: true })).toBeVisible();
  await expect(page).toHaveTitle("Wallet setup · Salapi");
  await expect(main).not.toBeEmpty();
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
  return main;
}
async function requireNonPreview(page: Page) {
  test.skip(await page.locator(".sl-preview-banner").count() > 0, "Retry/success fixture flow requires local preview disabled; preview deny is tested separately");
}

test.describe("wallet setup recovery, isolated localhost UI", () => {
  test.beforeEach(({ baseURL }) => test.skip(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL!).hostname), "Wallet setup fixtures must never target live deployments"));

  test("GET renders a meaningful setup screen without provisioning or funding", async ({ page }) => {
    const stub = await setupFixture(page), main = await openSetup(page, "/campaigns?create=1");
    await expect(main.getByRole("link", { name: copy("signin"), exact: true })).toHaveAttribute("href", "/signin?next=%2Fcampaigns%3Fcreate%3D1");
    await expect(main.getByRole("button", { name: copy("continue"), exact: true })).toHaveCount(0);
    expect(stub.calls.setup).toBe(0); expect(stub.calls.forbidden).toEqual([]); expect(stub.appErrors).toEqual([]);
    if (await page.locator(".sl-preview-banner").count()) {
      await expect(main.getByRole("button", { name: copy("retry"), exact: true })).toBeDisabled();
      await expect(main).toContainText(copy("preview"));
    } else await expect(main.getByRole("button", { name: copy("retry"), exact: true })).toBeEnabled();
  });

  for (const next of ["/send", "/campaigns?create=1"]) test(`one explicit retry waits for confirmation, then Continue preserves${next}`, async ({ page }, testInfo) => {
    const stub = await setupFixture(page), main = await openSetup(page, next); await requireNonPreview(page);
    const retry = main.getByRole("button", { name: copy("retry"), exact: true });
    await retry.evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
    await expect.poll(() => stub.calls.setup).toBe(1);
    await expect(retry).toBeDisabled(); await expect(main.locator('section[aria-busy="true"]')).toBeVisible();
    await expect(main.getByRole("status")).toContainText(copy("waiting")); await expect(main.getByRole("status")).toContainText(copy("checking"));
    await expect(main.getByText(copy("ready"), { exact: true })).toHaveCount(0);
    await expect(main.getByRole("button", { name: copy("continue"), exact: true })).toHaveCount(0);
    stub.respond({ ok: true, address });
    await expect(main.getByRole("status")).toContainText(copy("ready")); await expect(main.getByRole("status")).toContainText(address);
    await expect(main.getByRole("status")).toHaveCSS("opacity", "1");
    await expect(retry).toHaveCount(0); await expect(main.getByRole("link", { name: copy("signin"), exact: true })).toHaveCount(0);
    expect(await main.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`wallet-setup-ready-${next.startsWith("/send") ? "send" : "campaigns"}.png`), fullPage: false });
    stub.allowContinuationReads(); await main.getByRole("button", { name: copy("continue"), exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(next);
    expect(stub.calls.setup).toBe(1); expect(stub.calls.forbidden).toEqual([]); expect(stub.appErrors).toEqual([]);
  });

  test("failed setup keeps retry/sign-in, never claims ready, and a second confirmed retry recovers", async ({ page }) => {
    const stub = await setupFixture(page), main = await openSetup(page); await requireNonPreview(page);
    const retry = main.getByRole("button", { name: copy("retry"), exact: true });
    await retry.click(); await expect.poll(() => stub.calls.setup).toBe(1); stub.respond({ ok: false });
    await expect(main.getByRole("alert")).toContainText(copy("unavailable")); await expect(retry).toBeEnabled();
    await expect(main.getByText(copy("ready"), { exact: true })).toHaveCount(0); await expect(main.getByRole("button", { name: copy("continue"), exact: true })).toHaveCount(0);
    await expect(main.getByRole("link", { name: copy("signin"), exact: true })).toHaveAttribute("href", "/signin?next=%2Fsend");
    await retry.click(); await expect.poll(() => stub.calls.setup).toBe(2); stub.respond({ ok: true, address });
    await expect(main.getByRole("status")).toContainText(copy("ready")); expect(stub.calls.forbidden).toEqual([]); expect(stub.appErrors).toEqual([]);
  });

  test("reduced motion preserves waiting/success status without animated geometry", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const stub = await setupFixture(page), main = await openSetup(page); await requireNonPreview(page);
    await main.getByRole("button", { name: copy("retry"), exact: true }).click(); await expect.poll(() => stub.calls.setup).toBe(1);
    const waiting = main.getByRole("status"); await expect(waiting).toContainText(copy("waiting"));
    expect(await waiting.evaluate(element => [...element.querySelectorAll("span,svg,circle,path,i")].every(node => getComputedStyle(node).animationName === "none"))).toBe(true);
    stub.respond({ ok: true, address }); const ready = main.getByRole("status"); await expect(ready).toContainText(copy("ready"));
    expect(await ready.evaluate(element => [element, ...element.querySelectorAll("span,svg,circle,path,i")].every(node => getComputedStyle(node).animationName === "none"))).toBe(true);
    expect(stub.calls.forbidden).toEqual([]); expect(stub.appErrors).toEqual([]);
  });

  for (const locale of LOCALES) test(`${locale}: retry failure/success remains localized and mobile-safe`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const stub = await setupFixture(page, locale), main = await openSetup(page, "/campaigns?create=1", locale); await requireNonPreview(page);
    const retry = main.getByRole("button", { name: copy("retry", locale), exact: true });
    await retry.click(); await expect.poll(() => stub.calls.setup).toBe(1); await expect(main.getByRole("status")).toContainText(copy("waiting", locale));
    stub.respond({ ok: false }); await expect(main.getByRole("alert")).toContainText(copy("unavailable", locale));
    if (locale === "id") await page.screenshot({ path: testInfo.outputPath("wallet-setup-failed-id-320.png"), fullPage: false });
    await retry.click(); await expect.poll(() => stub.calls.setup).toBe(2); stub.respond({ ok: true, address });
    await expect(main.getByRole("status")).toContainText(copy("ready", locale)); await expect(main.getByRole("button", { name: copy("continue", locale), exact: true })).toBeVisible();
    await expect(main).toContainText(copy("testnet", locale)); expect(await main.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(stub.calls.forbidden).toEqual([]); expect(stub.appErrors).toEqual([]);
  });

  test.describe("desktop wallet setup evidence", () => {
    test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });
    test("1280×800 explicit retry confirms the fixture wallet before showing Continue", async ({ page }, testInfo) => {
      const stub = await setupFixture(page), main = await openSetup(page, "/campaigns?create=1"); await requireNonPreview(page);
      const retry = main.getByRole("button", { name: copy("retry"), exact: true });
      await retry.click(); await expect.poll(() => stub.calls.setup).toBe(1);
      await expect(retry).toBeDisabled(); await expect(main.getByRole("status")).toContainText(copy("waiting"));
      await expect(main.getByRole("button", { name: copy("continue"), exact: true })).toHaveCount(0);
      stub.respond({ ok: true, address });
      const ready = main.getByRole("status"); await expect(ready).toContainText(copy("ready")); await expect(ready).toContainText(address);
      await expect(ready).toHaveCSS("opacity", "1");
      await expect(main.getByRole("button", { name: copy("continue"), exact: true })).toBeEnabled();
      expect(await main.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("wallet-setup-ready-desktop-1280.png"), fullPage: false });
      expect(stub.calls.setup).toBe(1); expect(stub.calls.forbidden).toEqual([]); expect(stub.appErrors).toEqual([]);
    });
  });

  test("initializeWallet rejects a guest direct HTTP request without mocked auth or provisioning", async ({ request, baseURL }) => {
    const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
    const id = Object.entries(manifest.node as Record<string, { exportedName: string }>).find(([, value]) => value.exportedName === "initializeWallet")?.[0];
    expect(id).toBeTruthy();
    // A fresh Playwright request context has no Supabase session. The real
    // strict-auth action must refuse before any wallet/Friendbot write.
    const response = await request.post("/wallet/setup", { headers: { "Next-Action": id!, "Content-Type": "application/json", Origin: baseURL! }, data: "[]" });
    expect(response.ok()).toBeTruthy(); const body = await response.text();
    expect(body).toContain('"ok":false'); expect(body).not.toContain('"address":');
  });

  test("unsafe/self-target next paths sanitize sign-in destination without side-effecting GET", async ({ page }) => {
    const stub = await setupFixture(page);
    for (const next of ["https://evil.invalid", "//evil.invalid", "/%5Cevil.invalid", "/wallet/setup#again", "/wallet/setup/", "/x/../wallet/setup?next=/send", "/%77allet/setup"]) {
      const main = await openSetup(page, next);
      await expect(main.getByRole("link", { name: copy("signin"), exact: true })).toHaveAttribute("href", "/signin?next=%2F");
      expect(stub.calls.setup).toBe(0); expect(stub.calls.forbidden).toEqual([]);
    }
    expect(stub.appErrors).toEqual([]);
  });
});
