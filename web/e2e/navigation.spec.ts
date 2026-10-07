import { test, expect, type Page } from "@playwright/test";
import { LOCALE_COOKIE } from "../lib/i18n/config";
import { getCircle } from "../lib/circles/seed";

const browserHealth = new WeakMap<Page, { errors: string[]; console: string[] }>();
const donationEntry = /^(Preview a pledge|Donate Testnet XLM)$/;

// Exercise real visitor links and header controls. Never sign in, save a draft,
// submit a signup, or authorize a financial transaction. Compare full routes so
// lost mode/tab queries cannot pass as a correct return to the same pathname.
async function expectRoute(page: Page, route: string) {
  await expect(page).toHaveURL(new URL(route, page.url()).href, { timeout: 20000 });
  await renderedRoute(page);
}

// App Router updates the URL before its new screen has necessarily committed.
// Wait for a route-specific body before using a shared header Back control.
async function renderedRoute(page: Page) {
  const { pathname, searchParams } = new URL(page.url());
  const main = page.locator("#app-content");
  const heading = (name: string) => main.getByRole("heading", { name, exact: true, level: 1 });
  const visible = (locator: ReturnType<typeof heading>) => expect(locator).toBeVisible({ timeout: 20000 });
  if (pathname === "/") {
    await expect(page.getByTestId("home-circles-catalog")).toHaveAttribute("data-catalog-ready", "true", { timeout: 20000 });
  } else if (pathname === "/circles" || (pathname === "/campaigns" && searchParams.get("mode") === "examples")) {
    await visible(heading("A cause can bring us closer."));
    await visible(main.getByRole("group", { name: "Example cause categories", exact: true }));
  } else if (pathname === "/campaigns") {
    await expect(page.getByTestId("home-circles-catalog")).toHaveCount(0, { timeout: 20000 });
    await visible(heading("Give with clarity."));
  } else if (pathname === "/circles/create") {
    await visible(main.locator("#circle-draft-title"));
  } else if (/^\/circles\/[^/]+\/organizer$/.test(pathname)) {
    await visible(main.locator("h1#organizer-name"));
  } else if (/^\/circles\/[^/]+\/donate$/.test(pathname)) {
    await visible(main.getByRole("heading", { name: /^(Donate|Test a donation)$/, exact: true, level: 1 }));
  } else if (/^\/circles\/[^/]+\/manage$/.test(pathname)) {
    await visible(heading("Care for the cause."));
  } else if (/^\/circles\/[^/]+$/.test(pathname)) {
    const circle = getCircle(pathname.split("/")[2]);
    expect(circle, "Known example cause route").toBeDefined();
    await visible(heading(circle!.title));
    await visible(main.getByRole("tablist", { name: "Circle prototype details", exact: true }));
  } else if (pathname === "/learn/fund") {
    await visible(heading("Give with clarity."));
    await visible(main.getByText("Choose a cause and read its terms before giving.", { exact: true }));
  } else if (pathname === "/settings/language") {
    await visible(main.getByRole("button", { name: /^English/ }));
  } else if (pathname === "/receive") {
    await visible(main.locator("header").getByText("Receive", { exact: true }));
    await visible(main.getByText("Sign in to receive Testnet XLM in your personal wallet.", { exact: true }));
    await expect(main.getByRole("button", { name: "Share", exact: true })).toBeDisabled();
  } else {
    const titles: Record<string, string> = { "/vaults": "Vaults", "/learn": "Clear rules. Confident steps.", "/settings": "You", "/activity": "Activity", "/send": "Send by name.", "/withdraw": "Plan your cash out." };
    expect(titles[pathname], "Route has a rendered-screen readiness assertion").toBeDefined();
    await visible(heading(titles[pathname]));
  }
}

async function appReady(page: Page) {
  // Wait for the shared client tracker, not a fixed sleep or an SSR-visible
  // header. Otherwise a pre-hydration click could be silently discarded.
  await expect.poll(() => page.evaluate(() => Boolean(window.history.state?.__salapiNavigation)), { timeout: 20000 }).toBe(true);
}

async function home(page: Page, route = "/") {
  await page.goto(route, { waitUntil: "domcontentloaded", timeout: 45000 });
  await appReady(page);
  const catalog = page.getByTestId("home-circles-catalog");
  await expect(catalog).toHaveAttribute("data-catalog-ready", "true");
  await expect(catalog.locator("#home-cause-category")).toBeEnabled();
  return catalog;
}

async function headerBack(page: Page) {
  await renderedRoute(page);
  await appReady(page);
  // Creation also has an in-form Back; the first Back is its screen header.
  const back = page.locator("#app-content").getByRole("button", { name: /^Back(?: to .+)?$/ }).first();
  await expect(back).toBeVisible();
  await expect(back).toBeEnabled();
  await back.click();
}

test.beforeEach(async ({ page, context, baseURL }) => {
  // A fresh public visitor with a language preference only, no auth cookies or
  // mocked financial/campaign responses. Reduced motion makes scroll exact.
  await context.addCookies([{ name: LOCALE_COOKIE, value: "en", url: new URL(baseURL ?? "http://localhost:4747").origin }]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const health = { errors: [] as string[], console: [] as string[] };
  browserHealth.set(page, health);
  page.on("pageerror", error => health.errors.push(error.message));
  page.on("console", event => {
    if (event.type() !== "error" && event.type() !== "warning") return;
    if (event.text() === "Service Worker registration blocked by Playwright") return;
    // Vercel's optional Preview feedback toolbar is not part of the app.
    const url = event.location().url;
    if (url.startsWith("https://vercel.live/_next-live/feedback/") || event.text().includes("https://vercel.live/_next-live/feedback/feedback.js")) return;
    health.console.push(event.text());
  });
});

test.afterEach(async ({ page }) => {
  const health = browserHealth.get(page);
  expect(health?.errors, "No app JavaScript exceptions").toEqual([]);
  expect(health?.console, "No relevant browser console errors or warnings").toEqual([]);
});

test("hard Home load hydrates one catalog without hidden duplicates or React hydration errors", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await appReady(page);
  // getByTestId includes hidden DOM. A second streamed/stale catalog must not
  // pass merely because only one copy is visible or by selecting .first().
  const catalog = page.getByTestId("home-circles-catalog");
  await expect(catalog).toHaveCount(1, { timeout: 20000 });
  await expect(catalog).toHaveAttribute("data-catalog-ready", "true", { timeout: 20000 });
  await expect(catalog.locator("#home-cause-category")).toBeEnabled();
  await expect(catalog).toHaveCount(1);
  const health = browserHealth.get(page);
  expect(health, "Browser health listeners are installed before the hard load").toBeDefined();
  const hydrationError = /hydration|hydrating|Minified React error #418\b|react\.dev\/errors\/418\b|error-decoder\.html\?invariant=418\b/i;
  expect([...(health?.errors ?? []), ...(health?.console ?? [])].filter(message => hydrationError.test(message)), "No React hydration failure, including production minified error 418").toEqual([]);
});

test("Home organizer, cause and create headers return to their actual Home entry", async ({ page }) => {
  const homeRoute = "/?entry=back-regression-home";
  let catalog = await home(page, homeRoute);
  await catalog.locator('article[data-example-cause="tino-relief"]').getByRole("link", { name: "View campaign", exact: true }).click();
  await expectRoute(page, "/circles/tino-relief");
  await page.getByRole("link", { name: "View example organizer profile: Maria S.", exact: true }).click();
  await expectRoute(page, "/circles/tino-relief/organizer");
  await expect(page.getByRole("heading", { name: "Maria S.", exact: true })).toBeVisible();
  await headerBack(page);
  await expectRoute(page, "/circles/tino-relief");
  await headerBack(page);
  await expectRoute(page, homeRoute);

  catalog = page.getByTestId("home-circles-catalog");
  await expect(catalog).toHaveAttribute("data-catalog-ready", "true");
  await catalog.locator('a[href="/circles/tino-relief"]').first().click();
  await expectRoute(page, "/circles/tino-relief");
  await headerBack(page);
  await expectRoute(page, homeRoute);

  await page.getByTestId("home-circles-catalog").locator("summary").filter({ hasText: "Campaign tools" }).click();
  await page.getByTestId("home-circles-catalog").getByRole("link", { name: "Sketch your own cause", exact: true }).click();
  await expectRoute(page, "/circles/create");
  await expect(page.locator("#circle-draft-title")).toBeVisible();
  await headerBack(page);
  await expectRoute(page, homeRoute);
});

test("Home See all keeps the examples query on Back and does not create a return loop", async ({ page }) => {
  const homeRoute = "/?entry=back-regression-discovery";
  const catalog = await home(page, homeRoute);
  await catalog.getByRole("link", { name: "Browse all example causes", exact: true }).click();
  await expectRoute(page, "/campaigns?mode=examples");
  await page.getByRole("link", { name: "Explore this concept", exact: true }).first().click();
  await expect(page).toHaveURL(/\/circles\/[a-z0-9-]+$/);
  await headerBack(page);
  await expectRoute(page, "/campaigns?mode=examples");
  await expect(page.getByRole("link", { name: "Browse examples", exact: true })).toHaveAttribute("aria-current", "page");
  await headerBack(page);
  await expectRoute(page, homeRoute);
});

test("Vaults discovery and D4 header Back return to Vaults rather than Home", async ({ page }) => {
  await home(page);
  await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("button", { name: "Vaults", exact: true }).click();
  await expectRoute(page, "/vaults");
  await page.getByRole("link", { name: /^Salapi Circles · prototype/ }).click();
  await expectRoute(page, "/circles");
  await page.getByRole("link", { name: "Explore this concept", exact: true }).first().click();
  await expect(page).toHaveURL(/\/circles\/[a-z0-9-]+$/, { timeout: 20000 });
  await headerBack(page);
  await expectRoute(page, "/circles");
  await headerBack(page);
  await expectRoute(page, "/vaults");

  await page.locator("#app-content").getByRole("link", { name: /^Donation campaigns/ }).click();
  await expectRoute(page, "/campaigns");
  await expect(page.getByRole("heading", { name: "Give with clarity.", exact: true })).toBeVisible();
  await headerBack(page);
  await expectRoute(page, "/vaults");
});

test("Learn article and index Back unwind two real entries without looping", async ({ page }) => {
  await home(page);
  await page.getByRole("link", { name: "Help and learning", exact: true }).click();
  await expectRoute(page, "/learn");
  await page.getByRole("button", { name: /Give with clarity\./ }).click();
  await expectRoute(page, "/learn/fund");
  await headerBack(page);
  await expectRoute(page, "/learn");
  await expect(page.getByRole("heading", { name: "Clear rules. Confident steps.", exact: true })).toBeVisible();
  await headerBack(page);
  await expectRoute(page, "/");
});

test("Settings Language Back then browser Back reaches its previous parent", async ({ page }) => {
  await home(page);
  await page.getByRole("link", { name: "Your account", exact: true }).click();
  await expectRoute(page, "/settings");
  await page.getByRole("button", { name: /^Language English/ }).click();
  await expectRoute(page, "/settings/language");
  await headerBack(page);
  await expectRoute(page, "/settings");
  await page.goBack();
  await expectRoute(page, "/");
  await expect(page.getByTestId("home-circles-catalog")).toBeVisible();
});

test("receive, activity and withdraw retain the section that actually opened them", async ({ page }) => {
  await home(page);
  const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
  await nav.getByRole("button", { name: "Vaults", exact: true }).click();
  await expectRoute(page, "/vaults");
  await nav.getByRole("button", { name: "Activity", exact: true }).click();
  await expectRoute(page, "/activity");
  await headerBack(page);
  await expectRoute(page, "/vaults");

  await nav.getByRole("button", { name: "Send", exact: true }).click();
  await expectRoute(page, "/send");
  await page.getByRole("button", { name: "Receive", exact: true }).click();
  await expectRoute(page, "/receive");
  await headerBack(page);
  await expectRoute(page, "/send");

  await nav.getByRole("button", { name: "Home", exact: true }).click();
  await expectRoute(page, "/");
  await page.getByRole("link", { name: "Withdraw", exact: true }).click();
  await expectRoute(page, "/withdraw");
  await headerBack(page);
  await expectRoute(page, "/");
});

test("cold direct cause entry uses a safe catalog fallback", async ({ page }) => {
  await page.goto("/circles/tino-relief", { waitUntil: "domcontentloaded", timeout: 45000 });
  await expect(page.locator("h1#circle-title")).toHaveText("Tino survivors, Cebu - rebuild a fishing barangay");
  await headerBack(page);
  await expectRoute(page, "/circles");
  await expect(page.getByRole("heading", { name: "A cause can bring us closer.", exact: true })).toBeVisible();
});

test("untrusted external predecessor is not used by app Back and fallback replaces the child", async ({ page }) => {
  // A real different-origin entry, not a response mock. No third-party uptime
  // dependency is needed to prove that history.length alone is insufficient.
  await page.goto("about:blank#qa-other-origin");
  await page.goto("/circles/tino-relief/organizer", { waitUntil: "domcontentloaded", timeout: 45000 });
  await headerBack(page);
  await expectRoute(page, "/circles/tino-relief");
  await page.goBack();
  await expect(page).toHaveURL("about:blank#qa-other-origin");
});

test("two rapid header clicks queue only one Back and cannot skip Home into external history", async ({ page }) => {
  await page.goto("about:blank#qa-rapid-back-origin");
  const catalog = await home(page, "/?entry=back-regression-rapid");
  await catalog.locator('article[data-example-cause="tino-relief"]').getByRole("link", { name: "View campaign", exact: true }).click();
  await expectRoute(page, "/circles/tino-relief");
  await appReady(page);
  const back = page.locator("#app-content").getByRole("button", { name: "Back", exact: true }).first();
  await expect(back).toBeVisible();
  // Both dispatches occur before an asynchronous browser popstate can settle.
  await back.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expectRoute(page, "/?entry=back-regression-rapid");
  await expect(page.getByTestId("home-circles-catalog")).toHaveAttribute("data-catalog-ready", "true");
});

test("reload and browser Forward retain the trusted actual Home predecessor", async ({ page }) => {
  const homeRoute = "/?entry=back-regression-reload";
  const catalog = await home(page, homeRoute);
  await catalog.locator('a[href="/circles/tino-relief"]').first().click();
  await expectRoute(page, "/circles/tino-relief");
  await page.reload({ waitUntil: "domcontentloaded" });
  await headerBack(page);
  await expectRoute(page, homeRoute);
  await page.goForward();
  await expectRoute(page, "/circles/tino-relief");
  await headerBack(page);
  await expectRoute(page, homeRoute);
});

test("repeated cause routes preserve separate entries rather than collapsing by pathname", async ({ page }) => {
  const catalog = await home(page);
  await catalog.locator('a[href="/circles/tino-relief"]').first().click();
  await expectRoute(page, "/circles/tino-relief");
  await page.getByRole("link", { name: "View example organizer profile: Maria S.", exact: true }).click();
  await expectRoute(page, "/circles/tino-relief/organizer");
  await page.getByRole("link", { name: "View example cause", exact: true }).click();
  await expectRoute(page, "/circles/tino-relief");
  await headerBack(page);
  await expectRoute(page, "/circles/tino-relief/organizer");
  await headerBack(page);
  await expectRoute(page, "/circles/tino-relief");
  await headerBack(page);
  await expectRoute(page, "/");
});

test("organizer Back preserves a deep-linked cause tab and the complete query", async ({ page }) => {
  const causeRoute = "/circles/tino-relief?tab=updates&entry=back-regression-query";
  await page.goto(causeRoute, { waitUntil: "domcontentloaded", timeout: 45000 });
  await appReady(page);
  // Updates intentionally has no pledge CTA. Use its actual organizer link.
  await page.getByRole("link", { name: "View example organizer profile: Maria S.", exact: true }).click();
  await expectRoute(page, "/circles/tino-relief/organizer");
  await headerBack(page);
  await expectRoute(page, causeRoute);
  await expect(page.locator("#circle-tab-updates")).toHaveAttribute("aria-selected", "true");
});

test("Discovery Back restores the full query, category, sort and main scroll position", async ({ page }) => {
  const route = "/campaigns?mode=examples&entry=back-regression-state";
  await page.goto(route, { waitUntil: "domcontentloaded", timeout: 45000 });
  await appReady(page);
  const category = page.getByRole("group", { name: "Example cause categories", exact: true }).getByRole("button", { name: "Animal care", exact: true });
  await category.click();
  await page.locator("#circles-sort").selectOption("trending");
  await expect(page.getByRole("link", { name: "Explore this concept", exact: true })).toHaveCount(3);
  const cause = page.getByRole("link", { name: "Explore this concept", exact: true }).first();
  await cause.scrollIntoViewIfNeeded();
  const scrollTop = await page.locator("#app-content").evaluate(element => element.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
  await cause.click();
  await expect(page).toHaveURL(/\/circles\/[a-z0-9-]+$/, { timeout: 20000 });
  await headerBack(page);
  await expectRoute(page, route);
  await expect(category).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#circles-sort")).toHaveValue("trending");
  await expect(page.getByRole("link", { name: "Explore this concept", exact: true })).toHaveCount(3);
  await expect.poll(async () => Math.abs(await page.locator("#app-content").evaluate(element => element.scrollTop) - scrollTop)).toBeLessThanOrEqual(2);
});

test("Home animals second-card pledge Back restores category, carousel and main scroll", async ({ page }) => {
  // The default dashboard now fits a standard phone. Use a short scrollport
  // to exercise real Back scroll restoration without artificially tall UI.
  await page.setViewportSize({ width: 390, height: 640 });
  const catalog = await home(page);
  const category = catalog.locator("#home-cause-category");
  await category.selectOption("animals");
  await catalog.getByRole("button", { name: "Next example cause", exact: true }).click();
  await expect(catalog.getByLabel("2 of 3 example causes", { exact: true })).toHaveText("02 / 03");
  const pledge = catalog.locator("article[data-example-cause]").nth(1).getByRole("link", { name: "View campaign", exact: true });
  const href = await pledge.getAttribute("href");
  expect(href).toMatch(/^\/circles\/[a-z0-9-]+$/);
  await pledge.scrollIntoViewIfNeeded();
  const main = page.locator("#app-content");
  const scrollTop = await main.evaluate(element => {
    element.scrollTop = Math.min(60, element.scrollHeight - element.clientHeight);
    return element.scrollTop;
  });
  expect(scrollTop).toBeGreaterThan(0);
  const strip = catalog.getByLabel("Example causes carousel", { exact: true });
  const scrollLeft = await strip.evaluate(element => element.scrollLeft);
  expect(scrollLeft).toBeGreaterThan(0);
  await pledge.click();
  await expectRoute(page, href!);
  await page.getByRole("link", { name: donationEntry }).click();
  await expectRoute(page, `${href}/donate`);
  await headerBack(page);
  await expectRoute(page, href!);
  await headerBack(page);
  await expectRoute(page, "/");
  await expect(catalog).toHaveAttribute("data-catalog-ready", "true");
  await expect(category).toHaveValue("animals");
  await expect(catalog.locator("article[data-example-cause]")).toHaveCount(3);
  await expect(catalog.getByLabel("2 of 3 example causes", { exact: true })).toHaveText("02 / 03");
  await expect.poll(async () => Math.abs(await strip.evaluate(element => element.scrollLeft) - scrollLeft)).toBeLessThanOrEqual(2);
  await expect.poll(async () => Math.abs(await main.evaluate(element => element.scrollTop) - scrollTop)).toBeLessThanOrEqual(2);
});

test("same-path Home query entries restore their separate category and carousel without a component remount", async ({ page }) => {
  const priorRoute = "/?entry=back-regression-same-path";
  const catalog = await home(page, priorRoute);
  await catalog.locator("#home-cause-category").selectOption("animals");
  await catalog.getByRole("button", { name: "Next example cause", exact: true }).click();
  await expect(catalog.getByLabel("2 of 3 example causes", { exact: true })).toHaveText("02 / 03");
  const strip = catalog.getByLabel("Example causes carousel", { exact: true });
  const priorLeft = await strip.evaluate(element => element.scrollLeft);
  expect(priorLeft).toBeGreaterThan(0);
  await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("button", { name: "Home", exact: true }).click();
  await expectRoute(page, "/");
  await expect(catalog.locator("#home-cause-category")).toHaveValue("all");
  await page.goBack();
  await expectRoute(page, priorRoute);
  await expect(catalog.locator("#home-cause-category")).toHaveValue("animals");
  await expect(catalog.getByLabel("2 of 3 example causes", { exact: true })).toHaveText("02 / 03");
  await expect.poll(async () => Math.abs(await strip.evaluate(element => element.scrollLeft) - priorLeft)).toBeLessThanOrEqual(2);
  await page.reload({ waitUntil: "domcontentloaded" });
  await appReady(page);
  await expect(catalog.locator("#home-cause-category")).toHaveValue("animals");
  await expect(catalog.getByLabel("2 of 3 example causes", { exact: true })).toHaveText("02 / 03");
  await expect.poll(async () => Math.abs(await strip.evaluate(element => element.scrollLeft) - priorLeft)).toBeLessThanOrEqual(2);
});

test("donation Back edits local preview review or exits unverified native QA to the actual parent", async ({ page }) => {
  const catalog = await home(page);
  await catalog.locator('article[data-example-cause="tino-relief"]').getByRole("link", { name: "View campaign", exact: true }).click();
  await expectRoute(page, "/circles/tino-relief");
  const entry = page.getByRole("link", { name: donationEntry });
  const preview = (await entry.innerText()).trim() === "Preview a pledge";
  await entry.click();
  await expectRoute(page, "/circles/tino-relief/donate");
  if (preview) {
    await expect(page.getByRole("heading", { name: "Donate", exact: true, level: 1 })).toBeVisible();
    // Opening a local review is not its confirmation or email submission.
    await page.getByRole("button", { name: "Review local donation", exact: true }).click();
    await expect(page.getByText("Review local donation demo", { exact: true })).toBeVisible();
    await headerBack(page);
    await expectRoute(page, "/circles/tino-relief/donate");
    await expect(page.getByRole("button", { name: "Review local donation", exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: "Test a donation", exact: true, level: 1 })).toBeVisible();
    const signIn = page.getByRole("link", { name: "Sign in with Google", exact: true });
    const checkAccount = page.getByRole("button", { name: "Check account", exact: true });
    // Read the allowed control and its destination/status in one DOM snapshot.
    // Identity can settle from loading to guest between separate count/expect
    // calls; neither that transition nor missing controls may choose a stale
    // branch. The existing financial assertions below still apply to both.
    await expect.poll(() => signIn.or(checkAccount).evaluateAll(controls => {
      if (controls.length !== 1) return "transitioning";
      const control = controls[0];
      const rect = control.getBoundingClientRect();
      const visibility = getComputedStyle(control).visibility;
      if (rect.width <= 0 || rect.height <= 0 || visibility === "hidden" || visibility === "collapse") return "hidden-control";
      if (control.tagName === "A") return control.getAttribute("href") === "/signin?next=%2Fcircles%2Ftino-relief%2Fdonate" ? "guest" : "invalid-sign-in";
      return control.closest('[role="status"]')?.textContent?.includes("Your account must be verified before donating.") ? "unverified" : "invalid-account-status";
    }), { timeout: 20000, message: "An unverified visitor must have the correct sign-in destination or verification status and Check account control" }).toMatch(/^(guest|unverified)$/);
    await expect(page.getByRole("button", { name: "Review Testnet donation", exact: true }).and(page.locator("button:not([disabled])"))).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Confirm Testnet donation", exact: true })).toHaveCount(0);
    await expect(page.getByText("Testnet donation confirmed", { exact: true })).toHaveCount(0);
  }
  await headerBack(page);
  await expectRoute(page, "/circles/tino-relief");
  await headerBack(page);
  await expectRoute(page, "/");
});
