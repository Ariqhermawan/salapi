import { test, expect } from "@playwright/test";

// Home exposes fictional Circles fixtures in both modes, with real D4 campaigns
// kept in a separate live-only section. Explicit D4 links keep their mode.
// These are read-only navigation checks, never a payment/chain acceptance test.

test("Home example pledge opens a no-payment preview before any submission", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
  const catalog = page.getByTestId("home-circles-catalog");
  await expect(catalog).toHaveAttribute("data-catalog-ready", "true", { timeout: 20000 });
  const campaignLink = catalog.getByRole("link", { name: "Preview a pledge", exact: true }).first();
  await expect(campaignLink).toHaveAttribute("href", /^\/circles\/[a-z0-9-]+\/donate$/);
  await campaignLink.click();
  await expect(page).toHaveURL(/\/circles\/[a-z0-9-]+\/donate$/);
  await expect(page.getByText("Prototype · no payment", { exact: true })).toBeVisible();
  await expect(page.getByText("Where your pledge would go", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Review local donation|Continue to optional signup)$/ })).toBeVisible();
  await expect(page.getByText(/No payment method, authorization or/)).toBeVisible();
});

test("Home exposes example discovery and keeps D4 as a distinct route", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
  const catalogSection = page.getByTestId("home-circles-catalog");
  await expect(catalogSection).toHaveAttribute("data-catalog-ready", "true", { timeout: 20000 });
  const catalog = catalogSection.getByRole("link", { name: "Browse all example causes", exact: true });
  await expect(catalog).toHaveAttribute("href", "/campaigns?mode=examples");
  await expect(page.locator("#home-cause-category option")).toHaveCount(10);
  await expect(catalogSection.locator("article[data-example-cause]")).toHaveCount(27);
  await expect(catalogSection.getByRole("link", { name: "Sketch your own cause", exact: true })).toHaveAttribute("href", "/circles/create");
  const d4Heading = page.getByRole("heading", { name: "D4 Testnet campaigns", exact: true });
  if (await d4Heading.count()) {
    const d4Section = page.locator('section[aria-labelledby="testnet-campaign-title"]');
    await expect(d4Section.getByRole("link", { name: /See all/ })).toHaveAttribute("href", "/campaigns?mode=testnet");
    await expect(d4Section.locator("[data-example-cause]")).toHaveCount(0);
  } else {
    await expect(page.getByRole("link", { name: /^D4 Testnet campaigns/ })).toHaveAttribute("href", "/campaigns?mode=testnet");
  }
  await catalog.click();
  await expect(page).toHaveURL(/\/campaigns\?mode=examples$/);
  await expect(page.getByRole("heading", { name: "A cause can bring us closer.", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Explore this concept/ }).first().click();
  await expect(page).toHaveURL(/\/circles\/[a-z0-9-]+$/);
  await expect(page.getByRole("link", { name: "Preview a pledge", exact: true })).toBeVisible();
});

test("Home categories show three examples per sector and clickable organizer ratings and histories", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
  const catalog = page.getByTestId("home-circles-catalog");
  const category = catalog.locator("#home-cause-category");
  await expect(catalog.getByText("Fictional causes · AI photos · example ratings · no payment.", { exact: true })).toBeVisible();
  await expect(catalog).toHaveAttribute("data-catalog-ready", "true", { timeout: 20000 });
  await expect(category).toBeEnabled();
  for (const sector of ["disaster", "medical", "education", "community", "family", "creator", "animals", "care", "volunteer"]) {
    await category.selectOption(sector);
    await expect(catalog.locator("article[data-example-cause]")).toHaveCount(3);
    await expect(catalog.getByRole("status")).toHaveText("3 examples");
    await expect(catalog.getByText("Example rating", { exact: true })).toHaveCount(3);
    await expect(catalog.getByText("3 example reviews", { exact: true })).toHaveCount(3);
    const covers = catalog.locator("article[data-example-cause] > a img");
    await expect(covers).toHaveCount(3);
    for (const cover of await covers.all()) await expect(cover).toHaveAttribute("src", /(?:\/circles\/generated\/|circles%2Fgenerated%2F)/);
  }
  await category.selectOption("all");
  await expect(catalog.locator("article[data-example-cause]")).toHaveCount(27);
  await catalog.getByRole("button", { name: "Next example cause", exact: true }).click();
  await expect(catalog.getByLabel("2 of 27 example causes", { exact: true })).toHaveText("02 / 27");
  await category.selectOption("animals");
  const organizerLink = catalog.getByRole("link", { name: /^View example organizer profile:/ }).first();
  await expect(organizerLink).toHaveAttribute("href", /^\/circles\/[a-z0-9-]+\/organizer$/);
  await organizerLink.click();
  await expect(page).toHaveURL(/\/circles\/[a-z0-9-]+\/organizer$/);
  await expect(page.getByText("Example rating", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Example completed history", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^View completed example cause:/ })).toHaveCount(3);
  await expect(page.getByText("Fictional profile. Verification, histories and ratings are simulated. Demo verification, not an identity check.", { exact: true })).toBeVisible();
});

test("live Home D4 cards retain direct contract IDs separately from examples", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
  const d4Section = page.locator('section[aria-labelledby="testnet-campaign-title"]');
  test.skip(await d4Section.count() === 0, "Local preview deliberately exposes the separate D4 route without live on-chain readers");
  const campaignLink = d4Section.getByLabel("Campaign carousel").getByRole("link", { name: /^(Donate|View campaign)$/ }).first();
  await expect(campaignLink).toHaveAttribute("href", /^\/campaigns\?id=\d+$/);
  await campaignLink.click();
  await expect(page).toHaveURL(/\/campaigns\?id=\d+$/);
  await expect(page.getByRole("heading", { name: "Give with clarity.", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Explore this concept/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Back", exact: true }).first().click();
  await expect(page).toHaveURL(new URL("/", page.url()).href);
  await expect(page.getByTestId("home-circles-catalog")).toBeVisible();
});

test("explicit examples and testnet mode switches retain separate catalogs and direct D4 IDs", async ({ page }) => {
  await page.goto("/campaigns?mode=examples", { waitUntil: "domcontentloaded", timeout: 45000 });
  await expect(page.getByRole("link", { name: "Browse examples", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: /Explore this concept/ })).toHaveCount(27);
  await expect(page.getByRole("group", { name: "Example cause categories", exact: true }).getByRole("button")).toHaveCount(10);
  await expect(page.getByRole("link", { name: "Testnet campaigns", exact: true })).toHaveAttribute("href", "/campaigns?mode=testnet");
  await page.getByRole("link", { name: "Testnet campaigns", exact: true }).click();
  await expect(page).toHaveURL(/\/campaigns\?mode=testnet$/);
  await expect(page.getByRole("link", { name: "Testnet campaigns", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Give with clarity.", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Explore this concept/ })).toHaveCount(0);
});

test("Vaults preserves discovery of Circles and the original Paluwagan pool", async ({ page }) => {
  await page.goto("/vaults", { waitUntil: "domcontentloaded", timeout: 45000 });
  await expect(page.getByRole("link", { name: /Salapi Circles · prototype/ })).toHaveAttribute("href", "/circles");
  await expect(page.getByRole("link", { name: /Original Paluwagan pool/ })).toHaveAttribute("href", "/paluwagan");
});

test("donor and detail Back unwind the actual Home to cause to pledge path", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
  const catalog = page.getByTestId("home-circles-catalog");
  await expect(catalog).toHaveAttribute("data-catalog-ready", "true");
  await catalog.locator('a[href="/circles/tino-relief"]').first().click();
  await expect(page).toHaveURL(/\/circles\/tino-relief$/);
  await page.getByRole("link", { name: "Preview a pledge", exact: true }).click();
  await expect(page).toHaveURL(/\/circles\/tino-relief\/donate$/);
  await expect(page.getByRole("heading", { name: "Donate", exact: true, level: 1 })).toBeVisible({ timeout: 20000 });
  await expect.poll(() => page.evaluate(() => Boolean(window.history.state?.__salapiNavigation)), { timeout: 20000 }).toBe(true);
  await page.getByRole("button", { name: "Back", exact: true }).first().click();
  await expect(page).toHaveURL(/\/circles\/tino-relief$/);
  await expect(page.locator("h1#circle-title")).toHaveText("Tino survivors, Cebu - rebuild a fishing barangay", { timeout: 20000 });
  await page.getByRole("button", { name: "Back", exact: true }).first().click();
  await expect(page).toHaveURL(new URL("/", page.url()).href);
  await expect(page.getByTestId("home-circles-catalog")).toBeVisible();
});

test("organizer tools Back returns to the actual detail entry while organizer body links remain canonical", async ({ page }) => {
  await page.goto("/circles/cats-recovery", { waitUntil: "domcontentloaded", timeout: 45000 });
  await expect.poll(() => page.evaluate(() => Boolean(window.history.state?.__salapiNavigation)), { timeout: 20000 }).toBe(true);
  await expect(page.locator("h1#circle-title")).toHaveText("Clinic recovery for injured cats", { timeout: 20000 });
  await page.getByRole("link", { name: "Explore organizer tools", exact: true }).click();
  await expect(page).toHaveURL(/\/circles\/cats-recovery\/manage$/);
  await expect(page.getByRole("heading", { name: "Care for the cause.", exact: true, level: 1 })).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Back", exact: true }).first().click();
  await expect(page).toHaveURL(/\/circles\/cats-recovery$/);
  await expect(page.locator("h1#circle-title")).toHaveText("Clinic recovery for injured cats", { timeout: 20000 });

  await page.getByRole("link", { name: /^View example organizer profile:/ }).click();
  await expect(page).toHaveURL(/\/circles\/cats-recovery\/organizer$/);
  await expect(page.locator("h1#organizer-name")).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("link", { name: "View example cause", exact: true })).toHaveAttribute("href", "/circles/cats-recovery");
  await expect(page.getByRole("link", { name: "Browse Circles", exact: true })).toHaveAttribute("href", "/circles");
  await page.getByRole("link", { name: "Browse Circles", exact: true }).click();
  await expect(page).toHaveURL(/\/circles$/);
  await expect(page.getByRole("heading", { name: "A cause can bring us closer.", exact: true })).toBeVisible();
});
