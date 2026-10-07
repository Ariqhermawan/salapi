import { test, expect, type Page } from "@playwright/test";

// Candidate UI coverage. Guest contexts only; all mutation HTTP methods are
// intercepted. No auth session, signup, transfer, campaign or database write.
// Expected to run against an approved candidate Preview, not an older release.
test.beforeEach(async ({ page }) => {
  await page.route("**/*", async route => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(route.request().method())) {
      await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Read-only QA: mutation blocked" }) });
      return;
    }
    await route.continue();
  });
});

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

for (const width of [320, 390, 1280]) test(`gallery and fictional donor feed are usable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
  await page.goto("/circles/tino-relief", { waitUntil: "domcontentloaded", timeout: 45000 });
  const gallery = page.getByRole("region", { name: "Fictional campaign photo gallery", exact: true });
  await expect(gallery).toBeVisible({ timeout: 20000 });
  await expect(gallery.getByRole("button", { name: /^Show photo/ })).toHaveCount(3);
  const caption = gallery.locator("figcaption");
  await expect(caption).toContainText("Photo 1 of 3");
  const next = gallery.getByRole("button", { name: "Next photo", exact: true });
  const bounds = await next.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44); expect(bounds?.height).toBeGreaterThanOrEqual(44);
  await next.click(); await expect(caption).toContainText("Photo 2 of 3");
  await expect(caption).toContainText(/Not an actual campaign photo|Not a photo of this campaign/);
  await gallery.getByRole("button", { name: "Previous photo", exact: true }).click();
  await expect(caption).toContainText("Photo 1 of 3");
  await gallery.getByRole("button", { name: "Show photo 3 of 3", exact: true }).click();
  await expect(caption).toContainText("Photo 3 of 3");
  await gallery.focus(); await gallery.press("Home"); await expect(caption).toContainText("Photo 1 of 3");
  await gallery.press("ArrowLeft"); await expect(caption).toContainText("Photo 3 of 3");
  const activePhoto = gallery.locator("figure img");
  await expect.poll(() => activePhoto.evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await expect(activePhoto).toHaveAttribute("alt", /AI-generated|Generated illustrative/);
  await expect(gallery.getByText("AI illustration", { exact: true })).toBeVisible();
  // Blocked mapping reads are unknown, not proof this cause is unlinked.
  if (await page.getByTestId("circle-testnet-summary").count()) {
    await expect(page.getByRole("region", { name: "Example donor activity", exact: true })).toHaveCount(0);
  }
  // Completed fictional history is definitively an example in either mode.
  await page.goto("/circles/cebu-boat-repairs", { waitUntil: "domcontentloaded" });
  const feed = page.getByRole("region", { name: "Example donor activity", exact: true });
  await expect(feed.getByText("5 sample entries", { exact: true })).toBeVisible();
  await expect(feed.locator("li")).toHaveCount(5);
  await expect(feed.getByText("Anonymous (example)", { exact: true })).toHaveCount(2);
  const anonymousRows = feed.locator("li").filter({ has: page.getByText("Anonymous (example)", { exact: true }) });
  await expect(anonymousRows.locator("img")).toHaveCount(0);
  await expect(feed.getByText("Lina P. (example)", { exact: true })).toBeVisible();
  await expect(feed.getByText("Example amount", { exact: true })).toHaveCount(5);
  await expect(feed.locator("time")).toHaveCount(5);
  await expect(feed).toContainText("No real donations or public donor records.");
  await noHorizontalOverflow(page);
});

test("organizer identities show a fictional individual portrait or NGO logo with disclaimers", async ({ page }) => {
  for (const [cause, expectedPath] of [["tino-relief", /face-1\.png/], ["cats-recovery", /organizers(?:%2F|\/)paws-home\.svg/]] as const) {
    await page.goto(`/circles/${cause}/organizer`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const identity = page.locator('section[aria-labelledby="organizer-name"]');
    const avatar = identity.locator("img");
    await expect(avatar).toHaveCount(1);
    await expect(avatar).toHaveAttribute("src", expectedPath);
    await expect.poll(() => avatar.evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await expect(identity).toContainText("Fictional profile. Verification, histories and ratings are simulated.");
    await expect(page.getByRole("link", { name: /^View completed example cause:/ })).toHaveCount(3);
  }
});

test("Home retains its compact carousel with actual example avatar images", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
  const catalog = page.getByTestId("home-circles-catalog");
  await expect(catalog).toHaveAttribute("data-catalog-ready", "true", { timeout: 20000 });
  const first = catalog.locator("article[data-example-cause]").first();
  const organizer = first.locator("a").filter({ has: page.getByText("Maria S.", { exact: true }) });
  await expect(organizer).toHaveAttribute("href", "/circles/tino-relief");
  await expect(organizer.locator("img")).toHaveCount(1);
  const bounds = await organizer.locator("img").boundingBox();
  expect(bounds?.height).toBe(30); // 34px avatar includes its existing 2px border.
  await expect(catalog.locator("article[data-example-cause]")).toHaveCount(27);
  await expect(first.getByText("Example rating", { exact: true })).toBeVisible();
  await noHorizontalOverflow(page);
});
