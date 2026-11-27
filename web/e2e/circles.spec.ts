import { test, expect } from "@playwright/test";

const donationEntry = /^(Preview a pledge|Donate Testnet XLM)$/;
type DonationMode = "preview" | "testnet";

async function donationScreen(page: import("@playwright/test").Page, expected: DonationMode) {
  const main = page.locator("#app-content");
  const heading = main.getByRole("heading", { name: /^(Donate|Test a donation)$/, exact: true, level: 1 });
  await expect(heading).toBeVisible({ timeout: 20000 });
  await expect(heading).toHaveText(expected === "preview" ? "Donate" : "Test a donation");
  if (expected === "preview") {
    await expect(main.getByText("Prototype · no payment", { exact: true })).toBeVisible();
    await expect(main.getByText("Where your pledge would go", { exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: "Review local donation", exact: true })).toBeVisible();
    await expect(main.getByText(/No payment method, authorization or/)).toBeVisible();
  } else {
    await expect(main.getByText("Fictional cause, real Testnet transaction", { exact: true })).toBeVisible();
    await expect(main.getByText(/QA wallets receive test tokens, not the pictured organizer or NGO/)).toBeVisible();
    const signIn = main.getByRole("link", { name: "Sign in with Google", exact: true });
    const unavailableIdentity = main.getByText("Your account must be verified before donating.");
    await expect(signIn.or(unavailableIdentity)).toBeVisible({ timeout: 20000 });
    if (await signIn.count()) await expect(signIn).toHaveAttribute("href", /^\/signin\?next=%2Fcircles%2F[a-z0-9-]+%2Fdonate$/);
    else await expect(main.getByRole("button", { name: "Check account", exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: "Review Testnet donation", exact: true }).and(main.locator("button:not([disabled])"))).toHaveCount(0);
    await expect(main.getByRole("button", { name: "Confirm Testnet donation", exact: true })).toHaveCount(0);
    await expect(main.getByRole("button", { name: "Request launch notification", exact: true })).toHaveCount(0);
    await expect(main.getByText("Testnet donation confirmed", { exact: true })).toHaveCount(0);
  }
}

test("Home renders the prototype wallet and featured causes, with a distinct Testnet browse link", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 });
  const home = page.locator('[data-testid="home-dashboard"], [data-testid="prototype-home"]');
  await expect(home).toHaveCount(1);
  const actions = home.getByRole("navigation", { name: "Wallet actions", exact: true });
  for (const label of ["Top up", "Withdraw", "Send", "Receive"]) await expect(actions.getByRole("link", { name: label, exact: true })).toBeVisible();
  const causes = home.locator('section[aria-labelledby="prototype-home-causes"]');
  const cards = causes.locator('a[href^="/cause/"]');
  await expect(cards).toHaveCount(8);
  await expect(causes.getByRole("link", { name: "See all", exact: true })).toHaveAttribute("href", "/causes");
  const cover = cards.first().locator("img").first();
  await expect.poll(() => cover.evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await cards.first().click();
  await expect(page).toHaveURL(/\/cause\/bantayan$/);
});

test("Circles donation entry clearly separates the no-payment preview from gated Testnet donations", async ({ page }, testInfo) => {
  await page.goto("/circles/tino-relief", { waitUntil: "domcontentloaded", timeout: 45000 });
  await expect(page.locator("h1#circle-title")).toBeVisible({ timeout: 20000 });
  const donate = page.getByRole("link", { name: donationEntry });
  const mode: DonationMode = (await donate.innerText()).trim() === "Preview a pledge" ? "preview" : "testnet";
  await donate.click();
  await expect(page).toHaveURL(/\/circles\/[a-z0-9-]+\/donate$/);
  await expect(page).toHaveTitle(/Salapi/);
  await donationScreen(page, mode);
  await page.screenshot({ path: testInfo.outputPath(`${mode}-donation-boundary.png`), fullPage: false });
});

test("Campaign discovery keeps fictional Circles examples separate from Testnet campaigns", async ({ page }) => {
  await page.goto("/campaigns?mode=examples", { waitUntil: "domcontentloaded", timeout: 45000 });
  await expect(page.getByRole("link", { name: "Browse examples", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "A cause can bring us closer.", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore this concept", exact: true })).toHaveCount(27);
  await expect(page.getByRole("group", { name: "Example cause categories", exact: true }).getByRole("button")).toHaveCount(10);
  await page.getByRole("link", { name: "Testnet campaigns", exact: true }).click();
  await expect(page).toHaveURL(/\/campaigns\?mode=testnet$/);
  await expect(page.getByRole("link", { name: "Testnet campaigns", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Causes", exact: true })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search campaigns", exact: true })).toBeVisible();
  await expect(page.getByText(/Campaign terms and balances are read from the Stellar Testnet D4 contract/)).toBeVisible();
});

test("Arisan room list exposes create and join actions even before rooms are deployed", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/vaults", { waitUntil: "domcontentloaded", timeout: 45000 });
  await expect(page.getByRole("heading", { name: "Arisan", exact: true })).toBeVisible();
  const empty = page.getByTestId("arisan-empty");
  await expect(empty.getByRole("heading", { name: "No rooms yet", exact: true })).toBeVisible();
  const artwork = empty.locator('img[alt=""]');
  await expect(artwork).toBeVisible();
  const artworkBox = await artwork.boundingBox();
  const titleBox = await empty.getByRole("heading", { name: "No rooms yet", exact: true }).boundingBox();
  const actions = empty.getByRole("navigation", { name: "Create or join an Arisan room" });
  const actionsBox = await actions.boundingBox();
  expect(artworkBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(Math.abs(artworkBox!.y - 192)).toBeLessThanOrEqual(4);
  expect(Math.abs(titleBox!.y - 448)).toBeLessThanOrEqual(4);
  expect(Math.abs(actionsBox!.y - 516)).toBeLessThanOrEqual(4);
  const create = page.getByRole("link", { name: "Create a room", exact: true }).or(page.getByRole("button", { name: "Create a room", exact: true }));
  const join = page.getByRole("link", { name: "Join with a code", exact: true }).or(page.getByRole("button", { name: "Join with a code", exact: true }));
  await expect(create).toBeEnabled();
  await expect(join).toBeEnabled();
  await create.click();
  await expect(page).toHaveURL(/\/arisan\/new$/);
  await expect(page.getByRole("heading", { name: /create|new room/i })).toBeVisible();
});

test("Example organizer tools return to the cause and keep their canonical links", async ({ page }) => {
  await page.goto("/circles/cats-recovery", { waitUntil: "domcontentloaded", timeout: 45000 });
  await expect(page.locator("h1#circle-title")).toHaveText("Clinic recovery for injured cats", { timeout: 20000 });
  await page.getByRole("link", { name: "Explore organizer tools", exact: true }).click();
  await expect(page).toHaveURL(/\/circles\/cats-recovery\/manage$/);
  await expect(page.getByRole("heading", { name: "Care for the cause.", exact: true, level: 1 })).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Back", exact: true }).first().click();
  await expect(page).toHaveURL(/\/circles\/cats-recovery$/);
  await page.getByRole("link", { name: /^View example organizer profile:/ }).click();
  await expect(page).toHaveURL(/\/circles\/cats-recovery\/organizer$/);
  await expect(page.locator("h1#organizer-name")).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("link", { name: "View example cause", exact: true })).toHaveAttribute("href", "/circles/cats-recovery");
  await expect(page.getByRole("link", { name: "Browse Circles", exact: true })).toHaveAttribute("href", "/circles");
});
