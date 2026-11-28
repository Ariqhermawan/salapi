import { existsSync, readFileSync } from "node:fs";
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
  const devManifest = ".next/dev/server/server-reference-manifest.json";
  const buildManifest = ".next/server/server-reference-manifest.json";
  // The E2E server is `next start` in CI. Prefer its manifest when a local
  // developer also has a stale `.next/dev` tree from the preview server.
  const manifest = existsSync(buildManifest) ? buildManifest : devManifest;
  const m = JSON.parse(readFileSync(manifest, "utf8"));
  return new Map(Object.entries(m.node as Record<string, { exportedName: string }>).map(([id, v]) => [id, v.exportedName]));
}
function xlm(stroops: string) {
  const amount = BigInt(stroops); const whole = amount / 10_000_000n;
  const fractional = (amount % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : String(whole);
}
async function fixture(page: Page, options: { viewer?: string; now?: string; unavailable?: boolean; campaign?: typeof campaign } = {},
  entry = "/campaigns?id=1") {
  const names = actions(); const writes: { name: string; args: unknown[] }[] = [];
  const preparations: unknown[] = [];
  await page.route("**/campaigns*", async route => {
    const name = names.get(route.request().headers()["next-action"]);
    if (!name || !(name.startsWith("campaign") || name === "prepareCampaignConfirmation" || name === "cancelCampaignConfirmation")) return route.continue();
    let value: unknown;
    if (name === "campaignState") value = options.unavailable ? { ok: false, error: "Configured contract does not match D4" }
      : { ok: true, contractId: "CCN2O4Z6CSUVF74DWZBJJ526IMEXVRCYKY74PM5BDKA22WWTOW5WHZDY", viewer: options.viewer ?? null,
        now: options.now ?? "1000", campaigns: [options.campaign ?? campaign] };
    else if (name === "campaignRatingState") value = {
      ok: true,
      campaign: { id: "1", title: "UI fixture campaign", state: "Funding", proofAvailable: false },
      viewer: { signedIn: Boolean(options.viewer), hasDonated: Boolean(options.viewer), canRate: false, rating: null, comment: "" },
      ratings: [], totalRatings: 0, average: 0,
    };
    else if (name === "campaignMedia") value = { ok: false, available: false, code: "not_configured", network: "testnet",
      contractId: null, campaignId: (options.campaign ?? campaign).id, creatorWallet: null, photos: [], updatedAt: null,
      ownerId: null, canManage: false, permissionCode: null };
    else if (name === "prepareCampaignConfirmation") {
      const request = (JSON.parse(route.request().postData() ?? "[]") as unknown[])[0] as {
        kind?: string; campaignId?: string; amountStroops?: string; hash?: string; url?: string;
        input?: { title?: string; beneficiary?: string; creatorCut?: string; approvers?: string[]; fundingDeadline?: string; reviewDeadline?: string };
      };
      preparations.push(request);
      const action = ({ create: "campaign_create", donate: "campaign_donate", submit_proof: "campaign_submit_proof",
        approve: "campaign_approve", release: "campaign_release", refund: "campaign_refund", close_empty: "campaign_close_empty" } as Record<string, string>)[request?.kind ?? ""];
      const current = options.campaign ?? campaign;
      const summary = request?.kind === "create"
        ? `Create “${request.input?.title}” on Stellar Testnet. Beneficiary: ${request.input?.beneficiary}. Creator share: ${request.input?.creatorCut}%. Funding deadline: ${request.input?.fundingDeadline}; review deadline: ${request.input?.reviewDeadline}. Approvers: ${request.input?.approvers?.join(", ")}. These terms cannot be changed.`
        : request?.kind === "donate"
          ? `Donate ${xlm(request.amountStroops ?? "0")} Testnet XLM to “${current.title}”, campaign #${request.campaignId}. Funds remain in escrow pending proof review.`
          : request?.kind === "refund"
            ? `Return your full donation of ${xlm(current.contribution.amount)} Testnet XLM from “${current.title}”, campaign #${request.campaignId}, to your wallet.`
            : request?.kind === "submit_proof"
              ? `Submit proof ${request.hash} and ${request.url} for “${current.title}”, campaign #${request.campaignId}. It cannot be replaced.`
              : `Review the exact ${request?.kind} action for “${current.title}”, campaign #${request?.campaignId}.`;
      value = { ok: true, intentId: "11111111-1111-4111-8111-111111111111", action,
        summary,
        feeStroops: "100", expiresAt: "2099-01-01T00:00:00.000Z" };
    }
    else if (name === "cancelCampaignConfirmation") value = { ok: true };
    else { writes.push({ name, args: JSON.parse(route.request().postData() ?? "[]") }); value = { ok: true, link: "https://stellar.expert/explorer/testnet/tx/ui-fixture-only", value: "2" }; }
    await route.fulfill({ contentType: "text/x-component", body: `0:{"a":"$@1","f":"","i":false}\n1:${JSON.stringify(value)}\n` });
  });
  await page.goto(entry); return { writes, preparations };
}
test.describe("D4 isolated local UI and HTTP authorization", () => {
  test.beforeEach(({ baseURL }) => test.skip(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL!).hostname),
    "Fixture interception and local action IDs never target a live deployment"));

  test("live Causes keeps every prototype category visible when Testnet data is sparse", async ({ page }) => {
    const names = actions();
    await page.route("**/causes*", async route => {
      if (names.get(route.request().headers()["next-action"]) !== "campaignState") return route.continue();
      const value = { ok: true, contractId: "D4 UI fixture", viewer: null, now: "1000", campaigns: [campaign] };
      await route.fulfill({ contentType: "text/x-component", body: `0:{"a":"$@1","f":"","i":false}\n1:${JSON.stringify(value)}\n` });
    });
    await page.goto("/causes");
    const filters = page.getByRole("group", { name: "Campaign filters", exact: true });
    await expect(filters.getByRole("button")).toHaveCount(10);
    for (const label of ["Disaster relief", "Medical", "Education", "Community", "Family", "Creator support", "Care & meals", "Volunteer action", "Animal care"]) {
      await expect(filters.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    await filters.getByRole("button", { name: "Family", exact: true }).click();
    await expect(page).toHaveURL(/\/causes\?c=family$/);
    await expect(page.getByRole("heading", { name: "No causes match", exact: true })).toBeVisible();
  });

  test("open campaign cards and details show the contribution deadline explicitly", async ({ page }) => {
    await fixture(page, { viewer: wallets[2], now: "1000" }, "/campaigns?mode=testnet");
    const cardStatus = page.getByTestId("campaign-lifecycle-status").first();
    await expect(cardStatus).toContainText("Open for contributions");
    await expect(cardStatus).toContainText("Funding closes");
    await expect(cardStatus).toContainText("UTC");
    await page.getByRole("link", { name: /UI fixture campaign/ }).click();
    await expect(page).toHaveURL(/\/campaigns\?id=1$/);
    const detailStatus = page.getByTestId("campaign-lifecycle-status");
    await expect(detailStatus).toContainText("Open for contributions");
    await expect(detailStatus).toContainText("Funding closes");
    await expect(page.getByRole("button", { name: "Donate · Review amount", exact: true })).toBeVisible();
  });

  test("released campaigns read closed with funds released and cannot accept donations", async ({ page }) => {
    const released = { ...campaign, state: "Released", escrow: "0", proofHash: "a".repeat(64), approvals: wallets.slice(0, 2) };
    await fixture(page, { viewer: wallets[2], now: "1300", campaign: released }, "/campaigns?id=1");
    await expect(page.getByTestId("campaign-lifecycle-status")).toHaveText("Closed · funds released");
    await expect(page.getByRole("button", { name: "Donate · Review amount", exact: true })).toHaveCount(0);
  });

  test("expired review shows refund availability and replaces the donation action", async ({ page }) => {
    await fixture(page, { viewer: wallets[2], now: "1200" }, "/campaigns?id=1");
    await expect(page.getByTestId("campaign-lifecycle-status")).toHaveText("Closed · refund available");
    await expect(page.getByRole("button", { name: "Donate · Review amount", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Claim full refund", exact: true })).toBeVisible();
  });

  test("public read-only view exposes terms but no write controls", async ({ page }) => {
    await fixture(page);
    await expect(page.getByText(/Explore campaign terms and proof publicly/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Donate · Review amount|Approve proof|Release funds|Claim full refund/ })).toHaveCount(0);
    await page.getByText("Locked terms and recipients", { exact: true }).click();
    await expect(page.getByText("Approver 1: Not approved")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Sign in/ })).toHaveAttribute("href", "/signin?next=%2Fcampaigns%3Fid%3D1");
  });
  test("unverified deployment fails closed", async ({ page }) => {
    await fixture(page, { unavailable: true });
    await expect(page.getByRole("alert").filter({ hasText: "does not match D4" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Confirm|Review|Approve|Release|Claim/ })).toHaveCount(0);
  });
  test("donation confirms exact USD to XLM conversion and retains raw decimal payload", async ({ page }) => {
    const { writes, preparations } = await fixture(page, { viewer: wallets[2] });
    await page.getByLabel("Donation amount (USD)", { exact: true }).fill("6.50");
    await page.getByRole("button", { name: "Donate · Review amount", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Donate 58 Testnet XLM");
    expect(writes).toHaveLength(0);
    await page.getByRole("button", { name: "Confirm transaction", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Testnet transaction confirmed" })).toBeVisible();
    expect(preparations).toHaveLength(1);
    expect(preparations[0]).toMatchObject({ kind: "donate", campaignId: "1" });
    expect((preparations[0] as { amountStroops: string }).amountStroops).toMatch(/^[1-9]\d+$/);
    expect(writes).toEqual([{ name: "campaignDonate", args: ["11111111-1111-4111-8111-111111111111"] }]);
  });
  for (const variant of [
    { name: "desktop instant-open", viewport: { width: 1280, height: 720 }, reduced: false, create: false },
    { name: "short mobile long review", viewport: { width: 390, height: 480 }, reduced: false, create: true },
    { name: "desktop reduced motion", viewport: { width: 1280, height: 720 }, reduced: true, create: false },
  ]) {
    test(`confirmation stays inside the visible frame and blocks navigation: ${variant.name}`, async ({ page }) => {
      await page.setViewportSize(variant.viewport);
      await page.emulateMedia({ reducedMotion: variant.reduced ? "reduce" : "no-preference" });
      const { writes, preparations } = await fixture(page, { viewer: wallets[0] }, variant.create ? "/campaigns?create=1" : "/campaigns?id=1");
      if (variant.create) {
        await page.getByLabel("1. Name your cause", { exact: true }).fill("Long cause terms for a careful review. ".repeat(40));
        await page.getByRole("button", { name: "Continue", exact: true }).click();
        await page.getByLabel("Beneficiary public wallet", { exact: true }).fill(wallets[1]);
        await page.getByRole("button", { name: "Continue", exact: true }).click();
        await page.getByLabel("3. Funding closes", { exact: true }).fill("2030-01-01T12:00");
        await page.getByLabel("Review closes", { exact: true }).fill("2030-01-02T12:00");
        await page.getByRole("button", { name: "Continue", exact: true }).click();
        for (let i = 0; i < 3; i++) await page.getByLabel(`${i === 0 ? "4. " : ""}Approver ${i + 1} public wallet`, { exact: true }).fill(wallets[i]);
      } else {
        await page.getByLabel("Donation amount (USD)", { exact: true }).fill("6.50");
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
      // Existing focus trap must still reach the scroll-contained controls.
      await page.keyboard.press("Shift+Tab");
      await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(dialog.getByRole("button", { name: "Confirm transaction", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(review).toBeFocused();
      expect(writes).toHaveLength(0); expect(preparations).toHaveLength(1);
    });
  }
  test("creator config is confirmed once with three fixed approvers", async ({ page }) => {
    const { writes, preparations } = await fixture(page, { viewer: wallets[0] }, "/campaigns?create=1");
    await page.getByLabel("1. Name your cause", { exact: true }).fill("Test release");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Beneficiary public wallet", { exact: true }).fill(wallets[1]);
    await page.getByLabel("Creator share, 0 to 10%", { exact: true }).fill("5.25");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("3. Funding closes", { exact: true }).fill("2030-01-01T12:00");
    await page.getByLabel("Review closes", { exact: true }).fill("2030-01-02T12:00");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    for (let i = 0; i < 3; i++) await page.getByLabel(`${i === 0 ? "4. " : ""}Approver ${i + 1} public wallet`, { exact: true }).fill(wallets[i]);
    await page.getByRole("button", { name: "Review campaign terms", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("cannot be changed"); expect(writes).toHaveLength(0);
    expect(preparations).toHaveLength(1);
    expect(preparations[0]).toMatchObject({ kind: "create", input: { title: "Test release", creatorCut: "5.25", beneficiary: wallets[1], approvers: wallets } });
    await page.getByRole("button", { name: "Confirm transaction", exact: true }).click();
    await expect(page.getByRole("link", { name: "Open created campaign #2" })).toBeVisible();
    expect(writes).toEqual([{ name: "campaignCreate", args: ["11111111-1111-4111-8111-111111111111"] }]);
  });
  test("campaign wizard validates each step and keeps terms when going back", async ({ page }) => {
    const { writes, preparations } = await fixture(page, { viewer: wallets[0] }, "/campaigns?create=1");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Enter a campaign name.", { exact: true })).toBeVisible();
    expect(writes).toHaveLength(0); expect(preparations).toHaveLength(0);

    await page.getByLabel("1. Name your cause", { exact: true }).fill("Wizard campaign");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Beneficiary public wallet", { exact: true }).fill(wallets[1]);
    await page.getByLabel("Creator share, 0 to 10%", { exact: true }).fill("11");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Creator share cannot exceed 10%", { exact: true })).toBeVisible();
    await page.getByLabel("Creator share, 0 to 10%", { exact: true }).fill("5.25");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText(/Funding must end in the future/)).toBeVisible();
    await page.getByLabel("3. Funding closes", { exact: true }).fill("2030-01-01T12:00");
    await page.getByLabel("Review closes", { exact: true }).fill("2030-01-02T12:00");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).last().click();
    await expect(page.getByLabel("3. Funding closes", { exact: true })).toHaveValue("2030-01-01T12:00");
    await expect(page.getByLabel("Review closes", { exact: true })).toHaveValue("2030-01-02T12:00");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByLabel("4. Approver 1 public wallet", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Review campaign terms", exact: true }).click();
    await expect(page.getByText(/Enter complete Stellar public wallet addresses/)).toBeVisible();
    expect(writes).toHaveLength(0); expect(preparations).toHaveLength(0);
  });
  test("campaign navigation clears drafts and prior page state", async ({ page }) => {
    await fixture(page, { viewer: wallets[0] });
    await page.getByLabel("Donation amount (USD)", { exact: true }).fill("6.50");
    await page.getByRole("link", { name: "All campaigns", exact: true }).click();
    await expect(page).toHaveURL(/\/campaigns\?mode=testnet$/);
    await page.getByRole("link", { name: "Testnet campaigns", exact: true }).click();
    await page.getByRole("link", { name: /UI fixture campaign/ }).click();
    await expect(page).toHaveURL(/\/campaigns\?id=1$/);
    await expect(page.getByLabel("Donation amount (USD)", { exact: true })).toHaveValue("");
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
    const { writes, preparations } = await fixture(page, { viewer: wallets[0], now: "1200" });
    await page.getByRole("button", { name: "Claim full refund" }).click();
    await expect(page.getByRole("dialog")).toContainText("30 Testnet XLM");
    await page.getByRole("button", { name: "Confirm transaction", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Testnet transaction confirmed" })).toBeVisible();
    expect(preparations).toMatchObject([{ kind: "refund", campaignId: "1" }]);
    expect(writes).toEqual([{ name: "campaignRefund", args: ["11111111-1111-4111-8111-111111111111"] }]);
  });
  for (const name of ["campaignCreate", "campaignDonate", "campaignSubmitProof", "campaignApprove", "campaignRelease", "campaignRefund", "campaignCloseEmpty"]) {
    test(`${name} rejects unauthenticated direct HTTP requests (no mocks)`, async ({ request, baseURL }) => {
      const id = [...actions()].find(([, n]) => n === name)?.[0]; expect(id).toBeTruthy();
      const response = await request.post("/campaigns", { headers: { "Next-Action": id!, "Content-Type": "text/plain;charset=UTF-8", Origin: baseURL! }, data: '["11111111-1111-4111-8111-111111111111"]' });
      expect(response.ok()).toBeTruthy(); const body = await response.text();
      expect(body).toContain('"ok":false'); expect(body).toMatch(/Sign in with your Salapi account|wallet could not be verified|unavailable|Local preview/i);
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
  // Next's route announcer is an empty accessibility alert outside the app.
  // Keep rejecting all campaign error alerts without treating it as an error.
  await expect(page.locator("#app-content").getByRole("alert")).toHaveCount(0);
});
