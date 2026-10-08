import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Keypair } from "@stellar/stellar-sdk";
import type { CircleTestnetCampaignResult } from "../lib/circles/testnet";
import { donationReviewCss, donationReviewMarkup } from "./fixtures/circle-donation-review";
import { circleTestnetDonateCopy } from "../lib/i18n/circle-testnet-donate";
import { getCircle } from "../lib/circles/seed";
import type { Locale } from "../lib/i18n/config";

// Read-only candidate browser coverage. This is not authenticated Gmail,
// Supabase persistence or a Testnet payment acceptance test.
const allowedReads = new Set(["readCirclesSignupIdentity", "accountPhoto", "accountDetails", "readCircleTestnetCampaign", "campaignDonorActivity"]);
type Health = { errors: string[]; blocked: string[]; names: Map<string, string> };
const health = new WeakMap<Page, Health>();

function mappingFailure(code: "not_configured" | "unmapped"): CircleTestnetCampaignResult {
  return { ok: false, available: false, network: "testnet", circleId: "tino-relief", contractId: null,
    qaLabel: "QA Testnet · fictional cause", code, donationOpen: false, mapping: null, campaign: null, now: null };
}

async function readFixture(page: Page, values: Record<string, unknown>) {
  const state = health.get(page)!;
  for (const name of Object.keys(values)) expect(allowedReads.has(name), `Fixture ${name} must be a read-only response`).toBe(true);
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === "GET") {
      // Match only the migrated read endpoint and reviewed fixture identifier.
      // Other public reads, pagination and private reads retain their real path.
      let fixtureName: string | undefined;
      const mapping = values.readCircleTestnetCampaign;
      const donors = values.campaignDonorActivity;
      if (url.pathname === "/api/public/circles-testnet" && url.searchParams.size === 1
        && typeof mapping === "object" && mapping !== null && "circleId" in mapping
        && url.searchParams.get("circleId") === mapping.circleId) fixtureName = "readCircleTestnetCampaign";
      else if (url.pathname === "/api/public/campaign-donors" && url.searchParams.size === 1
        && typeof donors === "object" && donors !== null && "campaignId" in donors
        && url.searchParams.get("campaignId") === donors.campaignId) fixtureName = "campaignDonorActivity";
      else if (url.pathname === "/api/account/photo" && !url.search && "accountPhoto" in values) fixtureName = "accountPhoto";
      else if (url.pathname === "/api/account/circles-identity" && !url.search && "readCirclesSignupIdentity" in values) fixtureName = "readCirclesSignupIdentity";
      if (fixtureName) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(values[fixtureName]) });
      return route.fallback();
    }
    const name = state.names.get(request.headers()["next-action"]);
    if (request.method() !== "POST" || !name || !(name in values)) return route.fallback();
    await route.fulfill({ status: 200, contentType: "text/x-component; charset=utf-8",
      body: `0:{"a":"$@1","f":"","i":false}\n1:${JSON.stringify(values[name])}\n` });
  });
}

async function expectIdentityDenied(page: Page) {
  const signin = page.getByRole("link", { name: "Sign in with Google", exact: true });
  const unavailable = page.getByRole("status").filter({ hasText: "Your account must be verified before donating." });
  // A clean context has no verified account. A configured client can confirm
  // guest; missing client configuration stays unavailable. Both must deny
  // payment rather than invent a user or enable a confirmation button.
  await expect(signin.or(unavailable)).toBeVisible();
  if (await signin.isVisible()) await expect(signin).toHaveAttribute("href", "/signin?next=%2Fcircles%2Ftino-relief%2Fdonate");
  else await expect(unavailable.getByRole("button", { name: "Check account", exact: true })).toBeVisible();
}

function openMappingFixture(): Extract<CircleTestnetCampaignResult, { ok: true }> {
  // Deterministic public test-double addresses only. These are not provisioned
  // wallets, configured recipients, or evidence of an actual linked campaign.
  const wallets = [1, 2, 3, 4, 5].map(value => Keypair.fromRawEd25519Seed(Buffer.alloc(32, value)).publicKey());
  const mapping = { campaignId: "100", creatorWallet: wallets[0], beneficiaryWallet: wallets[1], approverWallets: wallets.slice(2),
    creatorCutBps: 0, fundingDeadline: "1793000000", reviewDeadline: "1794000000" };
  return { ok: true, available: true, network: "testnet", circleId: "tino-relief", contractId: "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU",
    qaLabel: "QA Testnet · fictional cause", donationOpen: true, status: "ready", mapping, now: "1791000000",
    campaign: { id: "100", title: "QA Circles: tino-relief", state: "Funding", total: "0", escrow: "0", proofHash: null, proofUrl: "", approvals: [],
      config: { creator: mapping.creatorWallet, beneficiary: mapping.beneficiaryWallet, approvers: mapping.approverWallets, creator_cut_bps: 0,
        funding_deadline: mapping.fundingDeadline, review_deadline: mapping.reviewDeadline, token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC" } } };
}

async function reviewDockGeometry(page: Page) {
  return page.getByTestId("donation-review-actions").evaluate(dock => {
    const frame = dock.closest(".sl-app-frame")!.getBoundingClientRect();
    const rect = dock.getBoundingClientRect();
    const nav = document.querySelector('.sl-tabbar')!;
    const navTop = Math.min(...[nav, ...nav.querySelectorAll("button, button > span")].map(node => node.getBoundingClientRect().top));
    const buttons = [...dock.querySelectorAll("button")].map(button => {
      const bounds = button.getBoundingClientRect();
      const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right,
        height: bounds.height, hit: !!hit && button.contains(hit) };
    });
    return { top: rect.top, bottom: rect.bottom, frameTop: frame.top, frameBottom: frame.bottom,
      frameLeft: frame.left, frameRight: frame.right, navTop, buttons, viewportHeight: innerHeight };
  });
}

function expectVisibleReviewDock(geometry: Awaited<ReturnType<typeof reviewDockGeometry>>) {
  expect(geometry.top).toBeGreaterThanOrEqual(geometry.frameTop);
  expect(geometry.bottom).toBeLessThanOrEqual(Math.min(geometry.frameBottom, geometry.viewportHeight));
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.navTop);
  for (const button of geometry.buttons) {
    expect(button.left).toBeGreaterThanOrEqual(geometry.frameLeft);
    expect(button.right).toBeLessThanOrEqual(geometry.frameRight);
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.hit, "Review action must not be covered by content or navigation").toBe(true);
  }
}
test.beforeEach(async ({ page, baseURL }) => {
  test.skip(!["localhost", "127.0.0.1"].includes(new URL(baseURL!).hostname), "Candidate screenshots and action allowlist only run locally");
  const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
  const names = new Map(Object.entries(manifest.node as Record<string, { exportedName: string }>).map(([id, value]) => [id, value.exportedName]));
  const state: Health = { errors: [], blocked: [], names }; health.set(page, state);
  page.on("pageerror", error => state.errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && message.text() !== "Service Worker registration blocked by Playwright") state.errors.push(message.text());
  });
  await page.route("**/*", async route => {
    const request = route.request();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
      const action = names.get(request.headers()["next-action"]) ?? "unknown";
      if (request.method() !== "POST" || !allowedReads.has(action)) {
        state.blocked.push(`${request.method()} ${new URL(request.url()).pathname}: ${action}`);
        return route.fulfill({ status: 403, body: "Read-only candidate QA: mutation blocked" });
      }
    }
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.afterEach(({ page }, testInfo) => {
  const state = health.get(page);
  if (testInfo.status === "skipped" && !state) return;
  expect(state, "Health monitor must exist for every exercised test").toBeDefined();
  expect(state?.blocked, "No auth, signup, donor metadata or financial mutation was attempted").toEqual([]);
  expect(state?.errors, "No app runtime or console error").toEqual([]);
});

for (const locale of ["en", "id", "tl", "vi"] as const) for (const viewport of [
  { width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1280, height: 800 },
]) test(`isolated ${locale} donation review keeps confirm visible without scrolling at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
  // Geometry only: actual review JSX/CSS inside the real app frame and nav.
  // This is not authenticated/hydrated payment acceptance. No Auth session is
  // invented and no confirm handler is clicked. All external writes are denied.
  await page.setViewportSize(viewport);
  const mapping = openMappingFixture();
  mapping.mapping.creatorCutBps = mapping.campaign.config.creator_cut_bps = 500;
  await readFixture(page, { readCircleTestnetCampaign: mapping });
  await page.goto("/circles/tino-relief/donate", { waitUntil: "domcontentloaded" });
  await expectIdentityDenied(page);
  await expect(page.locator("#circle-testnet-amount")).toBeVisible();
  const circle = getCircle("tino-relief")!;
  const html = donationReviewMarkup(circle, mapping, locale);
  await page.addStyleTag({ content: donationReviewCss });
  await page.locator("#app-content").evaluate((main, markup) => {
    const fixture = document.createElement("div");
    fixture.dataset.donationLayoutFixture = "true";
    fixture.innerHTML = markup;
    main.replaceChildren(fixture);
    main.scrollTo({ top: 0, behavior: "instant" });
  }, html);
  await page.evaluate(async () => { await document.fonts.ready; });
  const text = circleTestnetDonateCopy(locale as Locale);
  const fixture = page.locator("[data-donation-layout-fixture]");
  const region = fixture.getByRole("region", { name: text("Review Testnet donation"), exact: true });
  const confirm = fixture.getByRole("button", { name: text("Confirm Testnet donation"), exact: true });
  await expect(region.getByRole("heading", { name: text("Review before sending"), exact: true })).toBeVisible();
  await expect(confirm).toHaveCount(1);
  await expect(confirm).toBeEnabled();
  await expect(region.getByText("10 XLM", { exact: true })).toBeVisible();
  await expect(region.getByText("9.5 XLM", { exact: true })).toBeVisible();
  await expect(region.locator(".reviewSplit")).toContainText("0.5 XLM (5%)");
  const details = region.locator("details");
  await expect(details).not.toHaveAttribute("open");
  expect(await page.locator("#app-content").evaluate(main => main.scrollTop)).toBe(0);
  const initial = await reviewDockGeometry(page);
  expectVisibleReviewDock(initial);
  if (viewport.height >= 800) {
    for (const selector of [".reviewPrivacy", ".reviewFee", ".reviewBoundary"]) {
      const bounds = await region.locator(selector).boundingBox();
      expect(bounds!.y + bounds!.height, `${selector} stays above confirm dock`).toBeLessThanOrEqual(initial.top);
    }
  }
  expect(await fixture.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (locale === "en" && viewport.width !== 320) await page.screenshot({ path: testInfo.outputPath(`review-first-view-${viewport.width}.png`) });

  // Long optional comment/full recipient stay reachable while the single
  // confirm action remains in the same position, including short screens.
  await details.locator("summary").click();
  await expect(details).toHaveAttribute("open");
  await page.locator("#app-content").evaluate(main => main.scrollTo({ top: main.scrollHeight, behavior: "instant" }));
  await expect(details.getByText(mapping.mapping.beneficiaryWallet, { exact: true })).toBeAttached();
  const comment = details.locator("blockquote");
  await expect(comment).toBeVisible();
  const expanded = await reviewDockGeometry(page);
  expectVisibleReviewDock(expanded);
  expect(expanded.top).toBe(initial.top);
  expect(expanded.bottom).toBe(initial.bottom);
  const commentBounds = await comment.boundingBox();
  expect(commentBounds!.y + commentBounds!.height, "Last detail is not trapped behind action dock").toBeLessThanOrEqual(expanded.top);
});

for (const code of ["not_configured", "unmapped"] as const) for (const width of [320, 390, 1280]) test(`public proof ${code} keeps mock evidence separate at ${width}px`, async ({ page }, testInfo) => {
  // Explicit read-only response fixtures distinguish an unverified setup from
  // a confirmed missing association. Neither branch is live chain evidence.
  await readFixture(page, { readCircleTestnetCampaign: mappingFailure(code) });
  await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
  await page.goto("/circles/tino-relief", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("circle-testnet-summary")).toContainText(code === "unmapped"
    ? "This fictional cause has no reviewed Testnet campaign yet."
    : "Testnet donations are not configured for this cause yet.");
  await page.getByRole("tab", { name: "Public proof", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Public proof", exact: true });
  await expect(panel.getByRole("heading", { name: "Trace the evidence, step by step", exact: true })).toBeVisible();
  await expect(panel.getByText("Not verified", { exact: true })).toBeVisible();
  const pipeline = panel.getByRole("list", { name: "Evidence and approval pipeline", exact: true });
  if (code === "unmapped") {
    await expect(panel.getByText("No on-chain campaign linked", { exact: true })).toBeVisible();
    await expect(pipeline.locator("li")).toHaveCount(4);
  } else {
    await expect(panel.getByText("On-chain linkage is not verified right now. Check the QA status above; no proof or balance is assumed.", { exact: true })).toBeVisible();
    await expect(panel.getByText("No on-chain campaign linked", { exact: true })).toHaveCount(0);
    await expect(pipeline).toHaveCount(0);
    await expect(panel.getByText("No evidence hash or confirmed transaction exists. A launch signup is not an on-chain receipt.", { exact: true })).toHaveCount(0);
  }
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
  await page.screenshot({ path: testInfo.outputPath(`proof-${code}-${width}.png`) });
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

test("native QA donation with missing setup neither offers payment nor the old manual-email waitlist", async ({ page }) => {
  await readFixture(page, { readCircleTestnetCampaign: mappingFailure("not_configured") });
  await page.goto("/circles/tino-relief/donate", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Test a donation", exact: true })).toBeVisible();
  await expect(page.getByText("Fictional cause, real Testnet transaction", { exact: true })).toBeVisible();
  await expect(page.getByTestId("circle-testnet-summary")).toContainText("Testnet donations are not configured for this cause yet.");
  await expectIdentityDenied(page);
  await expect(page.locator("#circle-testnet-amount")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirm Testnet donation", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue to optional signup", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Request launch notification", exact: true })).toHaveCount(0);
  await expect(page.locator('input[type="email"]')).toHaveCount(0);
  await expect(page.getByText("Testnet donation confirmed", { exact: true })).toHaveCount(0);
});

for (const width of [320, 390, 1280]) test(`new donation defaults to public profile, respects anonymity and denies unverified payment at ${width}px`, async ({ page }, testInfo) => {
  await readFixture(page, { readCircleTestnetCampaign: openMappingFixture(),
    campaignDonorActivity: { ok: false, campaignId: "100", code: "not_configured" } });
  await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
  await page.goto("/circles/tino-relief/donate", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("circle-testnet-summary")).toContainText("Funding open");
  await expectIdentityDenied(page);
  const review = page.getByRole("button", { name: "Review Testnet donation", exact: true });
  await expect(review).toBeDisabled();
  await page.locator("#circle-testnet-amount").fill("2.5");
  const notice = page.getByTestId("donor-privacy-notice");
  const options = page.locator("details").filter({ has: page.getByText("Privacy and comment (optional)", { exact: true }) });
  await expect(options).not.toHaveAttribute("open");
  await expect(notice).toContainText("Your wallet, available @username and permitted profile photo will be public.");
  await notice.scrollIntoViewIfNeeded();
  await expect(notice).toBeVisible();
  await page.getByText("Privacy and comment (optional)", { exact: true }).click();
  const anonymous = page.getByRole("checkbox", { name: "Display anonymously in the donor feed", exact: true });
  const publicProfile = page.getByRole("checkbox", { name: "Also publish my available @username and permitted profile photo for this donation", exact: true });
  await expect(anonymous).not.toBeChecked();
  await expect(publicProfile).toBeChecked();
  await publicProfile.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`donor-public-default-${width}.png`) });
  await publicProfile.uncheck();
  await expect(notice).toContainText("Your name and photo will not be published.");
  await publicProfile.check();
  await anonymous.check();
  await expect(publicProfile).toHaveCount(0);
  await expect(notice).toContainText("Your donor entry will be anonymous.");
  await anonymous.uncheck();
  await expect(publicProfile).not.toBeChecked();
  await review.evaluate(element => (element as HTMLButtonElement).click());
  await expect(page.getByRole("heading", { name: "Review before sending", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirm Testnet donation", exact: true })).toHaveCount(0);
  await expect(page.locator('input[type="email"]')).toHaveCount(0);
  await expect(page.getByText("Testnet donation confirmed", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  // A fresh form gets the new defaults. This is not pending receipt recovery,
  // whose separate metadata path must retain anonymous/no-profile safeguards.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(notice).toContainText("Your wallet, available @username and permitted profile photo will be public.");
  await page.getByText("Privacy and comment (optional)", { exact: true }).click();
  await expect(anonymous).not.toBeChecked();
  await expect(publicProfile).toBeChecked();
  await expect(review).toBeDisabled();
});

for (const width of [320, 390, 1280]) test(`Story precedes confirmed donor amounts and market progress updates at ${width}px`, async ({ page }, testInfo) => {
  // Isolated public read fixtures, not a donation, real donor or wallet balance.
  let now = Date.now(), price = .25;
  await page.clock.install({ time: new Date(now) });
  await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
  const mapping = openMappingFixture();
  mapping.campaign.total = "1000000000";
  mapping.campaign.escrow = "1000000000";
  await readFixture(page, { readCircleTestnetCampaign: mapping, campaignDonorActivity: {
    ok: true, campaignId: "100", nextCursor: null, anonymityNotice: "Isolated UI fixture",
    entries: [{ id: "1", network: "testnet", campaignId: "100", createdAt: "2026-10-07T12:00:00.000Z",
      amountStroops: "500000000", asset: "XLM", badge: "confirmed_testnet", anonymous: false, comment: "Isolated donor fixture",
      donor: { address: mapping.mapping.creatorWallet, handle: "qa-fixture", photoUrl: "/illustrations/giving.png" }, hash: null, link: null }],
  } });
  await page.route("**/api/market-prices", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    status: "fresh", source: "CoinGecko", fetchedAt: Math.floor(now / 1000), assets: {
      xlm: { prices: { usd: price, php: price * 58, idr: price * 16000, vnd: price * 25000 }, updatedAt: Math.floor(now / 1000) },
      usdc: { prices: { usd: 1, php: 58, idr: 16000, vnd: 25000 }, updatedAt: Math.floor(now / 1000) },
    },
  }) }));
  await page.goto("/circles/tino-relief", { waitUntil: "domcontentloaded" });
  const story = page.getByRole("tabpanel", { name: "Story", exact: true });
  const summary = page.getByTestId("circle-testnet-summary");
  const donors = page.getByRole("region", { name: "Testnet donor activity", exact: true });
  await expect(summary.getByText("100 XLM", { exact: true })).toHaveCount(2);
  await expect(summary.getByText("≈ 25.00 USDC", { exact: true })).toHaveCount(2);
  await expect(summary.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "0.58% of QA goal");
  await expect(donors).toContainText("50 XLM");
  await expect(donors).toContainText("≈ 12.50 USDC");
  const preview = story.getByTestId("circle-story-preview"), more = story.getByTestId("circle-story-more");
  expect((await preview.innerText()).length).toBeLessThanOrEqual(361);
  await expect(more).not.toHaveAttribute("open");
  const order = await page.evaluate(() => {
    const sections = [...document.querySelectorAll("section")];
    return { story: sections.findIndex(s => s.id === "circle-panel-story"),
      summary: sections.findIndex(s => s.getAttribute("data-testid") === "circle-testnet-summary"),
      donors: sections.findIndex(s => s.querySelector("h3")?.textContent === "Testnet donor activity") };
  });
  expect(order.story).toBeGreaterThanOrEqual(0);
  expect(order.story).toBeLessThan(order.summary); expect(order.summary).toBeLessThan(order.donors);
  await more.locator("summary").click(); await expect(more).toHaveAttribute("open");
  await expect(more).toContainText("identity or delivered aid.");
  await more.locator("summary").click(); await expect(more).not.toHaveAttribute("open");
  const address = donors.getByLabel(/^Full wallet address:/);
  await address.click();
  await expect(donors.getByText(mapping.mapping.creatorWallet, { exact: true })).toBeVisible();
  await address.click();
  now += 61_000; price = .5; await page.clock.fastForward(61_000);
  await expect(summary.getByText("100 XLM", { exact: true })).toHaveCount(2);
  await expect(summary.getByText("≈ 50.00 USDC", { exact: true })).toHaveCount(2);
  await expect(summary.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "1.16% of QA goal");
  await expect(donors).toContainText("≈ 25.00 USDC");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await donors.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await donors.getByRole("heading").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`story-market-donors-${width}.png`) });
});
