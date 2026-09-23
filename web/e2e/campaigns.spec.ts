import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

const wallets = [
  "GAKZLTZFGSSM372XUKW2ZIJ5GSHVVIW5BYZIKIXRW2BW4MM6TUI5536Y",
  "GAVWJIZ45MHV2KWBHNBBB7YHU5CPTIDD3YONC4ZNP7IGE6Z3C777OV4H",
  "GAXPCCZD3AKYIRCI5CCX2TRIMVGQ45XEUEZPF5RBUZHYFRRZGN64ZNO3",
];
const campaign = { id: "1", title: "UI fixture campaign", state: "Funding", total: "1000000001", escrow: "1000000001",
  config: { creator: wallets[0], beneficiary: wallets[1], token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    creator_cut_bps: 500, funding_deadline: "1100", review_deadline: "1200", approvers: wallets },
  proofHash: null as string | null, proofUrl: "", approvals: [] as string[], contribution: { amount: "300000000", refunded: false } };
function actions() {
  const m = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
  return new Map(Object.entries(m.node as Record<string, { exportedName: string }>).map(([id, v]) => [id, v.exportedName]));
}
async function fixture(page: Page, options: { viewer?: string; now?: string; unavailable?: boolean; campaign?: typeof campaign } = {}) {
  const names = actions(); const writes: { name: string; args: unknown[] }[] = [];
  await page.route("**/campaigns*", async route => {
    const name = names.get(route.request().headers()["next-action"]);
    if (!name?.startsWith("campaign")) return route.continue();
    let value: unknown;
    if (name === "campaignState") value = options.unavailable ? { ok: false, error: "Configured contract does not match D4" }
      : { ok: true, contractId: "CCN2O4Z6CSUVF74DWZBJJ526IMEXVRCYKY74PM5BDKA22WWTOW5WHZDY", viewer: options.viewer ?? null,
        now: options.now ?? "1000", campaigns: [options.campaign ?? campaign] };
    else { writes.push({ name, args: JSON.parse(route.request().postData() ?? "[]") }); value = { ok: true, link: "https://stellar.expert/explorer/testnet/tx/ui-fixture-only", value: "2" }; }
    await route.fulfill({ contentType: "text/x-component", body: `0:{"a":"$@1","f":"","i":false}\n1:${JSON.stringify(value)}\n` });
  });
  await page.goto("/campaigns"); return writes;
}
test.describe("D4 isolated local UI and HTTP authorization", () => {
  test.beforeEach(({ baseURL }) => test.skip(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL!).hostname),
    "Fixture interception and local action IDs never target a live deployment"));

  test("public read-only view exposes terms but no write controls", async ({ page }) => {
    await fixture(page);
    await expect(page.getByText(/Public read-only view/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Review donation|Approve proof|Release funds|Claim full refund/ })).toHaveCount(0);
    await page.getByText("View locked campaign terms").click();
    await expect(page.getByText("Approver 1: Not approved")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in for campaign actions" })).toHaveAttribute("href", "/signin?next=%2Fcampaigns");
  });
  test("unverified deployment fails closed", async ({ page }) => {
    await fixture(page, { unavailable: true });
    await expect(page.getByRole("alert").filter({ hasText: "does not match D4" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Confirm|Review|Approve|Release|Claim/ })).toHaveCount(0);
  });
  test("donation confirms exact 6.50 PHP and retains raw decimal payload", async ({ page }) => {
    const writes = await fixture(page, { viewer: wallets[2] });
    await page.getByLabel("Donation amount", { exact: true }).fill("6.50");
    await page.getByLabel("Donation display currency").selectOption("tl");
    await page.getByRole("button", { name: "Review donation" }).click();
    await expect(page.getByRole("dialog")).toContainText("Donate 1 Testnet XLM");
    expect(writes).toHaveLength(0);
    await page.getByRole("button", { name: "Confirm transaction", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Transaction confirmed");
    expect(writes).toEqual([{ name: "campaignDonate", args: ["1", { amount: "6.50", currency: "tl" }] }]);
  });
  test("creator config is confirmed once with three fixed approvers", async ({ page }) => {
    const writes = await fixture(page, { viewer: wallets[0] });
    await page.getByText("Create a Testnet campaign", { exact: true }).click();
    await page.getByLabel("Campaign title").fill("Test release");
    await page.getByLabel("Beneficiary wallet").fill(wallets[1]);
    await page.getByLabel("Creator share (%)").fill("5.25");
    await page.getByLabel("Funding deadline", { exact: true }).fill("2030-01-01T12:00");
    await page.getByLabel("Review deadline", { exact: true }).fill("2030-01-02T12:00");
    for (let i = 0; i < 3; i++) await page.getByLabel(`Approver ${i + 1} wallet`).fill(wallets[i]);
    await page.getByRole("button", { name: "Review campaign creation" }).click();
    await expect(page.getByRole("dialog")).toContainText("cannot be changed"); expect(writes).toHaveLength(0);
    await page.getByRole("button", { name: "Confirm transaction", exact: true }).click();
    await expect(page.getByRole("link", { name: "Open created campaign #2" })).toBeVisible();
    expect(writes[0].name).toBe("campaignCreate"); expect(writes[0].args[0]).toMatchObject({ creatorCut: "5.25", approvers: wallets });
  });
  test("campaign navigation clears drafts and prior page state", async ({ page }) => {
    await fixture(page, { viewer: wallets[0] });
    await page.getByLabel("Donation amount", { exact: true }).fill("6.50");
    await page.getByRole("link", { name: "UI fixture campaign", exact: true }).click();
    await expect(page).toHaveURL(/\/campaigns\?id=1$/);
    await expect(page.getByLabel("Donation amount", { exact: true })).toHaveValue("");
  });
  test("only configured reviewer sees proof approval and duplicate is disabled", async ({ page }) => {
    await fixture(page, { viewer: wallets[0], now: "1150", campaign: { ...campaign, state: "PendingProof", proofHash: "a".repeat(64), approvals: [wallets[0]] } });
    await expect(page.getByRole("button", { name: "Approve proof" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Release funds" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Review donation" })).toHaveCount(0);
  });
  test("timely quorum stays releasable after deadline, without refund", async ({ page }) => {
    await fixture(page, { viewer: wallets[0], now: "1200", campaign: { ...campaign, state: "PendingProof", proofHash: "a".repeat(64), approvals: wallets.slice(0, 2) } });
    await expect(page.getByRole("button", { name: "Release funds" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Claim full refund" })).toHaveCount(0);
  });
  test("expired incomplete review allows only the original donor refund", async ({ page }) => {
    const writes = await fixture(page, { viewer: wallets[0], now: "1200" });
    await page.getByRole("button", { name: "Claim full refund" }).click();
    await expect(page.getByRole("dialog")).toContainText("full 30 XLM");
    await page.getByRole("button", { name: "Confirm transaction", exact: true }).click();
    await expect(page.getByRole("status")).toBeVisible();
    expect(writes).toEqual([{ name: "campaignRefund", args: ["1"] }]);
  });
  for (const name of ["campaignCreate", "campaignDonate", "campaignSubmitProof", "campaignApprove", "campaignRelease", "campaignRefund", "campaignCloseEmpty"]) {
    test(`${name} rejects unauthenticated direct HTTP requests (no mocks)`, async ({ request, baseURL }) => {
      const id = [...actions()].find(([, n]) => n === name)?.[0]; expect(id).toBeTruthy();
      const response = await request.post("/campaigns", { headers: { "Next-Action": id!, "Content-Type": "text/plain;charset=UTF-8", Origin: baseURL! }, data: '["1"]' });
      expect(response.ok()).toBeTruthy(); const body = await response.text();
      expect(body).toContain('"ok":false'); expect(body).toContain("Sign in to use signer controls");
    });
  }
});
test("D4 is reachable from Circles without using preview campaign data", async ({ page }) => {
  await page.goto("/circles");
  await expect(page.getByRole("link", { name: "Open live Testnet donation campaigns" })).toHaveAttribute("href", "/campaigns");
});
test("D4 live deployment identity and real on-chain reads (opt-in, no mocks)", async ({ page }) => {
  const expected = process.env.D4_E2E_CONTRACT;
  test.skip(!expected, "Set D4_E2E_CONTRACT to verify real Testnet reads");
  await page.goto("/campaigns");
  await page.getByText("Active D4 contract", { exact: true }).click({ timeout: 30000 });
  await expect(page.getByRole("link", { name: expected!, exact: true })).toBeVisible();
  await expect(page.locator("p[role=alert]")).toHaveCount(0);
});
