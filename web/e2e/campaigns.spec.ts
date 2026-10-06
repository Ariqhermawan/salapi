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
  await page.goto("/campaigns?mode=testnet"); return writes;
}
test.describe("D4 isolated local UI and HTTP authorization", () => {
  test.beforeEach(({ baseURL }) => test.skip(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL!).hostname),
    "Fixture interception and local action IDs never target a live deployment"));

  test("public read-only view exposes terms but no write controls", async ({ page }) => {
    await fixture(page);
    await expect(page.getByText(/Explore campaign terms and proof publicly/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Donate · Review amount|Approve proof|Release funds|Claim full refund/ })).toHaveCount(0);
    await page.getByText("Locked terms and recipients", { exact: true }).click();
    await expect(page.getByText("Approver 1: Not approved")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Sign in/ })).toHaveAttribute("href", "/signin?next=%2Fcampaigns%3Fmode%3Dtestnet");
  });
  test("unverified deployment fails closed", async ({ page }) => {
    await fixture(page, { unavailable: true });
    await expect(page.getByRole("alert").filter({ hasText: "does not match D4" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Confirm|Review|Approve|Release|Claim/ })).toHaveCount(0);
  });
  test("donation confirms exact 6.50 PHP and retains raw decimal payload", async ({ page }) => {
    const writes = await fixture(page, { viewer: wallets[2] });
    await page.getByLabel("Donation amount", { exact: true }).fill("6.50");
    await page.getByLabel("Display currency", { exact: true }).selectOption("tl");
    await page.getByRole("button", { name: "Donate · Review amount", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Donate 1 Testnet XLM");
    expect(writes).toHaveLength(0);
    await page.getByRole("button", { name: "Confirm transaction", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Testnet transaction confirmed");
    expect(writes).toEqual([{ name: "campaignDonate", args: ["1", { amount: "6.50", currency: "tl" }] }]);
  });
  for (const variant of [
    { name: "desktop instant-open", viewport: { width: 1280, height: 720 }, reduced: false, create: false },
    { name: "short mobile long review", viewport: { width: 390, height: 480 }, reduced: false, create: true },
    { name: "desktop reduced motion", viewport: { width: 1280, height: 720 }, reduced: true, create: false },
  ]) {
    test(`confirmation stays inside the visible frame and blocks navigation: ${variant.name}`, async ({ page }) => {
      await page.setViewportSize(variant.viewport);
      await page.emulateMedia({ reducedMotion: variant.reduced ? "reduce" : "no-preference" });
      const writes = await fixture(page, { viewer: wallets[0] });
      if (variant.create) {
        await page.getByText("Start a campaign", { exact: true }).click();
        await page.getByLabel("1. Name your cause", { exact: true }).fill("Long cause terms for a careful review. ".repeat(40));
        await page.getByLabel("Beneficiary public wallet", { exact: true }).fill(wallets[1]);
        await page.getByLabel("2. Funding closes", { exact: true }).fill("2030-01-01T12:00");
        await page.getByLabel("Review closes", { exact: true }).fill("2030-01-02T12:00");
        for (let i = 0; i < 3; i++) await page.getByLabel(`${i === 0 ? "3. " : ""}Approver ${i + 1} public wallet`, { exact: true }).fill(wallets[i]);
      } else {
        await page.getByLabel("Donation amount", { exact: true }).fill("6.50");
        await page.getByLabel("Display currency", { exact: true }).selectOption("tl");
      }
      const review = page.getByRole("button", { name: variant.create ? "Review campaign terms" : "Donate · Review amount", exact: true });
      await review.scrollIntoViewIfNeeded();
      // Re-enter and pause the wrapper fade so opening during motion is tested,
      // not only after its animation has completed.
      await page.locator("main > .sl-state-enter").evaluate(node => {
        (node as HTMLElement).style.animation = "none";
        void (node as HTMLElement).offsetHeight;
        (node as HTMLElement).style.animation = "";
        const animation = node.getAnimations()[0];
        if (animation) { animation.currentTime = 80; animation.pause(); }
      });
      const scrollBefore = await page.locator("main").evaluate(node => node.scrollTop);
      expect(scrollBefore).toBeGreaterThan(0);
      await review.click();
      const dialog = page.getByRole("dialog", { name: "Confirm campaign transaction", exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog).toBeFocused();
      const geometry = await dialog.evaluate(node => {
        const frame = document.querySelector(".sl-app-frame")!.getBoundingClientRect();
        const overlay = node.getBoundingClientRect();
        const card = node.querySelector<HTMLElement>(".sl-card")!;
        const box = card.getBoundingClientRect();
        const wrapper = node.closest(".sl-state-enter")!;
        return { frame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
          overlay: { x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height },
          card: { top: box.top, bottom: box.bottom, width: box.width, height: box.height, clientHeight: card.clientHeight, scrollHeight: card.scrollHeight },
          wrapperTransform: getComputedStyle(wrapper).transform, wrapperAnimation: getComputedStyle(wrapper).animationName,
          navBlocked: !!document.elementFromPoint(frame.left + 45, frame.bottom - 25)?.closest('[role="dialog"]') };
      });
      expect(geometry.wrapperTransform).toBe("none");
      expect(geometry.wrapperAnimation).toBe("none");
      for (const dimension of ["x", "y", "width", "height"] as const) expect(Math.abs(geometry.overlay[dimension] - geometry.frame[dimension])).toBeLessThanOrEqual(2);
      expect(geometry.card.top).toBeGreaterThanOrEqual(geometry.overlay.y + 19);
      expect(geometry.card.bottom).toBeLessThanOrEqual(geometry.overlay.y + geometry.overlay.height - 19);
      expect(geometry.card.width).toBeLessThanOrEqual(420);
      expect(geometry.navBlocked).toBe(true);
      if (variant.create) expect(geometry.card.scrollHeight).toBeGreaterThan(geometry.card.clientHeight);
      expect(await page.locator("main").evaluate(node => node.scrollTop)).toBe(scrollBefore);
      // Existing focus trap must still reach the scroll-contained controls.
      await page.keyboard.press("Shift+Tab");
      await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(dialog.getByRole("button", { name: "Confirm transaction", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(review).toBeFocused();
      expect(await page.locator("main").evaluate(node => node.scrollTop)).toBe(scrollBefore);
      expect(writes).toHaveLength(0);
    });
  }
  test("creator config is confirmed once with three fixed approvers", async ({ page }) => {
    const writes = await fixture(page, { viewer: wallets[0] });
    await page.getByText("Start a campaign", { exact: true }).click();
    await page.getByLabel("1. Name your cause", { exact: true }).fill("Test release");
    await page.getByLabel("Beneficiary public wallet", { exact: true }).fill(wallets[1]);
    await page.getByLabel("Creator share, 0 to 10%", { exact: true }).fill("5.25");
    await page.getByLabel("2. Funding closes", { exact: true }).fill("2030-01-01T12:00");
    await page.getByLabel("Review closes", { exact: true }).fill("2030-01-02T12:00");
    for (let i = 0; i < 3; i++) await page.getByLabel(`${i === 0 ? "3. " : ""}Approver ${i + 1} public wallet`, { exact: true }).fill(wallets[i]);
    await page.getByRole("button", { name: "Review campaign terms", exact: true }).click();
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
    await expect(page.getByRole("button", { name: "Donate · Review amount", exact: true })).toHaveCount(0);
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
  await expect(page.getByRole("link", { name: /^Open donation campaigns/ })).toHaveAttribute("href", "/campaigns?mode=testnet");
});
test("D4 live deployment identity and real on-chain reads (opt-in, no mocks)", async ({ page }) => {
  const expected = process.env.D4_E2E_CONTRACT;
  test.skip(!expected, "Set D4_E2E_CONTRACT to verify real Testnet reads");
  await page.goto("/campaigns?mode=testnet");
  await page.getByText("View the D4 Testnet contract", { exact: true }).click({ timeout: 30000 });
  await expect(page.getByRole("link", { name: expected!, exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
