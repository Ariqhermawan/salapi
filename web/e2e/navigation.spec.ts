import { test, expect, type Page } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/config";

const homeSelector = '[data-testid="home-dashboard"], [data-testid="prototype-home"]';

async function ready(page: Page) {
  await expect.poll(() => page.evaluate(() => Boolean(window.history.state?.__salapiNavigation)), { timeout: 20000 }).toBe(true);
}

async function home(page: Page, path = "/") {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 45000 });
  await ready(page);
  await expect(page.locator(homeSelector)).toHaveCount(1, { timeout: 20000 });
}

async function back(page: Page) {
  const button = page.locator("#app-content").getByRole("button", { name: /^Back(?: to .+)?$/ }).first();
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
}

test.beforeEach(async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: LOCALE_COOKIE, value: "en", url: new URL(baseURL ?? "http://localhost:4747").origin }]);
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("Home cause detail Back returns to the actual Home entry", async ({ page }) => {
  const route = "/?entry=prototype-home-back";
  await home(page, route);
  const firstCause = page.locator(`${homeSelector} section[aria-labelledby="prototype-home-causes"] a[href^="/cause/"]`).first();
  await firstCause.click();
  await expect(page).toHaveURL(/\/cause\/[^/]+$/);
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeVisible();
  await back(page);
  await expect(page).toHaveURL(new URL(route, page.url()).href);
  await expect(page.locator(homeSelector)).toHaveCount(1);
});

test("Home See all opens Testnet discovery and example browsing stays separate", async ({ page }) => {
  await home(page);
  await page.locator(`${homeSelector} section[aria-labelledby="prototype-home-causes"]`).getByRole("link", { name: "See all", exact: true }).click();
  await expect(page).toHaveURL(/\/campaigns\?mode=testnet$/);
  await expect(page.getByRole("link", { name: "Testnet campaigns", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Causes", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Browse examples", exact: true }).click();
  await expect(page).toHaveURL(/\/campaigns\?mode=examples$/);
  await expect(page.getByRole("heading", { name: "A cause can bring us closer.", exact: true })).toBeVisible();
});

test("Main tabs navigate to Home, Arisan, Cause creation, Activity and You", async ({ page }) => {
  await home(page);
  const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
  await nav.getByRole("button", { name: "Arisan", exact: true }).click();
  await expect(page).toHaveURL(/\/vaults$/);
  const createRoom = page.getByRole("link", { name: "Create a room", exact: true }).or(page.getByRole("button", { name: "Create a room", exact: true }));
  await expect(createRoom).toBeVisible();
  await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("button", { name: "Cause", exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByText("Create cause", { exact: true })).toBeVisible();
  await home(page);
  await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("button", { name: "You", exact: true }).click();
  await expect(page).toHaveURL(/\/you$/);
  await expect(page.getByRole("heading", { name: "You", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("button", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(homeSelector)).toHaveCount(1);
});

test("Arisan create flow returns to its room list", async ({ page }) => {
  await page.goto("/vaults", { waitUntil: "domcontentloaded", timeout: 45000 });
  await ready(page);
  const create = page.getByRole("link", { name: "Create a room", exact: true }).or(page.getByRole("button", { name: "Create a room", exact: true }));
  await create.click();
  await expect(page).toHaveURL(/\/arisan\/new$/);
  await expect(page.getByRole("heading", { name: /Create|New room/i })).toBeVisible();
  await back(page);
  await expect(page).toHaveURL(/\/vaults$/);
  const join = page.getByRole("link", { name: "Join with a code", exact: true }).or(page.getByRole("button", { name: "Join with a code", exact: true }));
  await expect(join).toBeVisible();
});

test("Circles detail and organizer routes keep their actual parent on Back", async ({ page }) => {
  await page.goto("/circles/tino-relief?tab=updates&entry=detail-query", { waitUntil: "domcontentloaded", timeout: 45000 });
  await ready(page);
  await expect(page.locator("#circle-tab-updates")).toHaveAttribute("aria-selected", "true");
  await page.getByRole("link", { name: /^View example organizer profile:/ }).click();
  await expect(page).toHaveURL(/\/circles\/tino-relief\/organizer$/);
  await back(page);
  await expect(page).toHaveURL(/\/circles\/tino-relief\?tab=updates&entry=detail-query$/);
  await expect(page.locator("#circle-tab-updates")).toHaveAttribute("aria-selected", "true");
});

test("A direct cause detail falls back to the Circles index without trusted history", async ({ page }) => {
  await page.goto("/circles/tino-relief", { waitUntil: "domcontentloaded", timeout: 45000 });
  await expect(page.locator("h1#circle-title")).toBeVisible();
  await back(page);
  await expect(page).toHaveURL(/\/circles$/);
  await expect(page.getByRole("heading", { name: "A cause can bring us closer.", exact: true })).toBeVisible();
});

test("App Back does not traverse an untrusted external predecessor", async ({ page }) => {
  await page.goto("about:blank#qa-other-origin");
  await page.goto("/circles/tino-relief/organizer", { waitUntil: "domcontentloaded", timeout: 45000 });
  await back(page);
  await expect(page).toHaveURL(/\/circles\/tino-relief$/);
  await page.goBack();
  await expect(page).toHaveURL("about:blank#qa-other-origin");
});
