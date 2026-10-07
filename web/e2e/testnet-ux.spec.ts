import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Keypair } from "@stellar/stellar-sdk";
import type { CircleTestnetCampaignResult } from "../lib/circles/testnet";

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
  for (const name of Object.keys(values)) expect(allowedReads.has(name), `Fixture ${name} must be a read-only action`).toBe(true);
  await page.route("**/*", async route => {
    const request = route.request(), name = state.names.get(request.headers()["next-action"]);
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

test.afterEach(({ page }) => {
  expect(health.get(page)?.blocked, "No auth, signup, donor metadata or financial mutation was attempted").toEqual([]);
  expect(health.get(page)?.errors, "No app runtime or console error").toEqual([]);
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

test("unverified user cannot review or submit an open QA campaign; privacy defaults remain anonymous", async ({ page }, testInfo) => {
  await readFixture(page, { readCircleTestnetCampaign: openMappingFixture(),
    campaignDonorActivity: { ok: false, campaignId: "100", code: "not_configured" } });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/circles/tino-relief/donate", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("circle-testnet-summary")).toContainText("Funding open");
  await expectIdentityDenied(page);
  const review = page.getByRole("button", { name: "Review Testnet donation", exact: true });
  await expect(review).toBeDisabled();
  await page.locator("#circle-testnet-amount").fill("2.5");
  await page.getByText("Privacy and comment (optional)", { exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Display anonymously in the donor feed", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Also publish my available @username and permitted profile photo for this donation", exact: true })).toHaveCount(0);
  await review.evaluate(element => (element as HTMLButtonElement).click());
  await expect(page.getByRole("heading", { name: "Review before sending", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirm Testnet donation", exact: true })).toHaveCount(0);
  await expect(page.locator('input[type="email"]')).toHaveCount(0);
  await expect(page.getByText("Testnet donation confirmed", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("native-qa-identity-denied-320.png") });
});
