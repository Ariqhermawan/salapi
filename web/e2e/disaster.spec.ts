import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

// UI fixtures mock only HTTP responses in isolated test browsers. They do not
// bypass production authentication and are NOT on-chain acceptance evidence.
type ActionInfo = { exportedName: string };
function actionNames() {
  const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
  return new Map(Object.entries(manifest.node as Record<string, ActionInfo>)
    .map(([id, info]) => [id, info.exportedName]));
}
const signers = [
  "GBYKBA4V3TN3L6LOAM5KWXHAWUGZD6C2NVOJC7NKGSZDOGJT46FUMOTT",
  "GAQFNAT4GDSYMSO56C45QPHUTB6SSLIA7YZVI2ARKBKGOJM5BI4F7FR3",
  "GCI3WTODXAKGEQV56IO4VBPWHCFWSSDTAM6QKLJYJ7LN36ZRLNY73TDK",
];
const contractId = "CDC3HBAQY53THCXWIVROPSGM745WELMZ3Z4Y2ATKEBFSFRCETG4SY35D";
const recipient = "GA2WEDD3KE6MNXNMP4EZFUDFX727WPH57OSO4YX6LYVEKKS4VLKZXIBQ";
const state = {
  ok: true, contractId, active: false, pesos: 0, pesoLabel: "₱0",
  config: { signers, cap_bps: 2000, timelock_ledgers: 20 },
  status: { balance: "0", cap: "0", allowance: "0", spent_24h: "0",
    paused: true, epoch: "0", ledger: 100, next_id: "1" },
};
type Proposal = { id: string; kind: string; amount: string | null; recipient: string | null;
  approvals: string[]; readyLedger: number | null; epoch: string; executed: boolean };

async function fixture(page: Page, options: { viewer?: string; unavailable?: boolean; proposals?: Proposal[]; funded?: boolean } = {}) {
  const names = actionNames();
  const writes: { name: string; args: unknown[] }[] = [];
  await page.addInitScript(() => localStorage.setItem("salapi_currency", "tl"));
  await page.route("**/transparency", async route => {
    const request = route.request();
    const name = names.get(request.headers()["next-action"]);
    if (!name?.startsWith("disaster")) return route.continue();
    let value: unknown;
    if (name === "disasterState") value = options.unavailable
      ? { ok: false, error: "Configured contract does not match the D3 Testnet controls" }
      : options.funded ? { ...state, status: { ...state.status, balance: "80307692", cap: "16061538", allowance: "16061538" } } : state;
    else if (name === "disasterProposals") value = { ok: true, viewer: options.viewer ?? null, proposals: options.proposals ?? [] };
    else if (name === "disasterEvents") value = { ok: true, events: [] };
    else {
      writes.push({ name, args: JSON.parse(request.postData() ?? "[]") });
      value = { ok: true, link: "https://stellar.expert/explorer/testnet/tx/ui-fixture-only" };
    }
    await route.fulfill({ contentType: "text/x-component",
      body: `0:{"a":"$@1","f":"","i":false}\n1:${JSON.stringify(value)}\n` });
  });
  await page.goto("/transparency");
  return writes;
}

test.describe("D3 local UI and HTTP authorization", () => {
  test.beforeEach(({ baseURL }) => {
    test.skip(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL!).hostname),
      "Local build action IDs and fixture interception must not target a remote deployment");
  });

  test("verified zero balance is valid and anonymous viewers have no signer controls", async ({ page }) => {
    await fixture(page);
    const controls = page.getByRole("region", { name: "Disaster Vault controls" });
    await expect(controls.getByText("Vault balance", { exact: true })).toBeVisible();
    await expect(controls.getByText("0 XLM", { exact: true })).toHaveCount(4);
    await expect(controls.getByText(/Public view\. Everyone can review the pool/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Contribute to the pool", exact: true })).toBeEnabled();
    await expect(controls.getByRole("button", { name: /Approve|Execute|Review payout/ })).toHaveCount(0);
    await controls.getByText("The three signer wallets and custody details", { exact: true }).click();
    for (const signer of signers) await expect(controls.getByRole("link", { name: signer, exact: true })).toBeVisible();
    await expect(controls.getByRole("link", { name: "Sign in for signer access", exact: true }))
      .toHaveAttribute("href", "/signin?next=%2Ftransparency");
  });

  test("unverified deployment fails closed in the UI", async ({ page }) => {
    await fixture(page, { unavailable: true });
    await expect(page.getByRole("region", { name: "Disaster Vault controls" }))
      .toContainText("Configured contract does not match the D3 Testnet controls");
    await expect(page.getByRole("button", { name: "Contribute to the pool", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Approve #|Execute #|Review payout/ })).toHaveCount(0);
  });

  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 430, height: 900 }, { width: 1280, height: 900 }]) {
    test(`compact Disaster Vault explains the fund and bounds trailing scroll at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const appErrors: string[] = [];
      page.on("pageerror", error => appErrors.push(error.message));
      const writes = await fixture(page, { funded: true });
      await expect(page.getByRole("heading", { name: "Disaster Vault", exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: "Community pool balance" })).toContainText("8.0307692");
      await expect(page.getByRole("img", { name: "Caring hands holding a blue community safe" })).toBeVisible();
      const art = await page.getByRole("img", { name: "Caring hands holding a blue community safe" })
        .evaluate((img: HTMLImageElement) => ({ loaded: img.complete && img.naturalWidth > 0, width: img.getBoundingClientRect().width }));
      expect(art.loaded).toBe(true);
      expect(art.width).toBeLessThanOrEqual(120);
      await expect(page.getByRole("heading", { name: "How this vault works" })).toBeVisible();
      await expect(page.getByText(/Two of the three different signer wallets/)).toBeVisible();
      await expect(page.getByText(/wait 20 ledgers/)).toBeVisible();

      for (const tab of ["Overview", "Payout requests", "Public proof"]) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        await expect(page.getByRole("tabpanel", { name: tab, exact: true })).toBeVisible();
        await expect(page.getByRole("tabpanel")).toHaveCount(1);
        const geometry = await page.locator("#app-content").evaluate(main => {
          const footer = main.querySelector("footer")!;
          const rect = main.getBoundingClientRect();
          const footerBottom = footer.getBoundingClientRect().bottom - rect.top + main.scrollTop;
          return { trailing: main.scrollHeight - footerBottom, scrolling: main.scrollHeight > main.clientHeight,
            horizontal: main.scrollWidth - main.clientWidth };
        });
        if (geometry.scrolling) expect(geometry.trailing).toBeLessThanOrEqual(112);
        expect(geometry.horizontal).toBeLessThanOrEqual(1);
      }

      await page.getByRole("tab", { name: "Overview", exact: true }).click();
      await page.getByText("The three signer wallets and custody details", { exact: true }).click();
      for (const signer of signers) await expect(page.getByRole("link", { name: signer, exact: true })).toBeVisible();
      await page.getByText("The three signer wallets and custody details", { exact: true }).click();
      if (process.env.DISASTER_QA_SCREENSHOTS) {
        await page.locator("#app-content").evaluate(main => { main.scrollTo({ top: 0, behavior: "instant" }); });
        await page.screenshot({ path: `${process.env.DISASTER_QA_SCREENSHOTS}/disaster-${viewport.width}-top.png` });
        await page.locator("#app-content").evaluate(main => { main.scrollTo({ top: main.scrollHeight, behavior: "instant" }); });
        await page.screenshot({ path: `${process.env.DISASTER_QA_SCREENSHOTS}/disaster-${viewport.width}-bottom.png` });
      }
      await page.getByRole("button", { name: "Contribute to the pool", exact: true }).click();
      await expect(page.getByLabel("Contribution amount (PHP)")).toBeVisible();
      await page.getByRole("button", { name: "Disaster Vault", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Disaster Vault", exact: true })).toBeVisible();
      expect(writes).toHaveLength(0);
      expect(appErrors).toEqual([]);
    });
  }

  test("signer UI reviews exact 6.50 PHP before sending a proposal (mocked responses)", async ({ page }) => {
    const writes = await fixture(page, { viewer: signers[0] });
    await page.getByRole("tab", { name: "Payout requests", exact: true }).click();
    await page.getByLabel("Recipient wallet", { exact: true }).fill(recipient);
    await page.getByLabel("Payout amount", { exact: true }).fill("6.50");
    await page.getByRole("button", { name: "Review payout request", exact: true }).click();
    await expect(page.getByText(`Send 1 Testnet XLM to ${recipient}.`, { exact: false })).toBeVisible();
    expect(writes).toHaveLength(0);
    await page.getByRole("button", { name: "Confirm propose", exact: true }).click();
    await expect(page.getByText("Transaction confirmed.", { exact: false })).toBeVisible();
    expect(writes).toEqual([{ name: "disasterPropose", args: [{ kind: "Disburse", recipient,
      money: { amount: "6.50", currency: "tl" } }] }]);
  });

  test("signer UI respects duplicate approvals, timelock, pause and stale controls (mocked responses)", async ({ page }) => {
    const payout = { kind: "Disburse", amount: "10000000", recipient, approvals: signers.slice(0, 2),
      readyLedger: 120, epoch: "0", executed: false };
    await fixture(page, { viewer: signers[0], proposals: [
      { ...payout, id: "4" }, { ...payout, id: "3", readyLedger: 100 },
      { ...payout, id: "2", kind: "Unpause", amount: null, recipient: null, epoch: "1" },
      { ...payout, id: "1", executed: true },
    ] });
    await page.getByRole("tab", { name: "Payout requests", exact: true }).click();
    await expect(page.getByRole("button", { name: "Approve #4", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Execute #4", exact: true })).toBeDisabled();
    await expect(page.getByText(/Wait 20 ledgers/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Execute #3", exact: true })).toBeDisabled();
    await expect(page.getByText(/Blocked: payouts paused/).first()).toBeVisible();
    await expect(page.getByText(/Stale control request/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Approve #2|Execute #2|Approve #1|Execute #1/ })).toHaveCount(0);
  });

  for (const name of ["disasterPropose", "disasterApprove", "disasterExecute"]) {
    test(`${name} rejects direct unauthenticated HTTP calls (real server, no mocks)`, async ({ request, baseURL }) => {
      const id = [...actionNames()].find(([, exported]) => exported === name)?.[0];
      expect(id).toBeTruthy();
      const response = await request.post("/transparency", {
        headers: { "Next-Action": id!, "Content-Type": "text/plain;charset=UTF-8", Origin: baseURL! },
        data: JSON.stringify(name === "disasterPropose" ? [{ kind: "Pause" }] : ["1"]),
      });
      expect(response.ok()).toBeTruthy();
      const body = await response.text();
      expect(body).toContain('"ok":false');
      expect(body).toContain("Sign in to prepare your personal Testnet wallet.");
      expect(body).not.toContain('"ok":true');
    });
  }
});

test("D3 public UI reads the expected live Testnet deployment (opt-in, no mocks)", async ({ page }) => {
  const expected = process.env.D3_E2E_CONTRACT;
  test.skip(!expected, "Set D3_E2E_CONTRACT to require real Testnet configuration and reads");
  await page.goto("/transparency");
  const controls = page.getByRole("region", { name: "Disaster Vault controls" });
  await expect(controls.getByText("Vault balance", { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(controls.getByText(/Public view\. Everyone can review the pool/)).toBeVisible();
  await controls.getByRole("tab", { name: "Payout requests", exact: true }).click();
  await expect(controls.getByText("Loading requests…", { exact: true })).toHaveCount(0);
  await controls.getByRole("tab", { name: "Public proof", exact: true }).click();
  await expect(controls.getByRole("link", { name: /^Active D3 contract/ })).toHaveAttribute("href", `https://stellar.expert/explorer/testnet/contract/${expected}`, { timeout: 30000 });
  await expect(controls.getByRole("alert")).toHaveCount(0);
});
