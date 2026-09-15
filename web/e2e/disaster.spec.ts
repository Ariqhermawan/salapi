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

async function fixture(page: Page, options: { viewer?: string; unavailable?: boolean; proposals?: Proposal[] } = {}) {
  const names = actionNames();
  const writes: { name: string; args: unknown[] }[] = [];
  await page.addInitScript(() => localStorage.setItem("salapi_currency", "tl"));
  await page.route("**/transparency", async route => {
    const request = route.request();
    const name = names.get(request.headers()["next-action"]);
    if (!name?.startsWith("disaster")) return route.continue();
    let value: unknown;
    if (name === "disasterState") value = options.unavailable
      ? { ok: false, error: "Configured contract does not match the D3 Testnet controls" } : state;
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
    await expect(controls.getByText(/Public read-only view/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Donate to this pool", exact: true })).toBeEnabled();
    await expect(controls.getByRole("button", { name: /Approve|Execute|Review payout/ })).toHaveCount(0);
    await controls.getByText("View the three fixed signers", { exact: true }).click();
    for (const signer of signers) await expect(controls.getByRole("link", { name: signer, exact: true })).toBeVisible();
    await expect(controls.getByRole("link", { name: "Sign in for signer controls" }))
      .toHaveAttribute("href", "/signin?next=%2Ftransparency");
  });

  test("unverified deployment fails closed in the UI", async ({ page }) => {
    await fixture(page, { unavailable: true });
    await expect(page.getByRole("region", { name: "Disaster Vault controls" }))
      .toContainText("Configured contract does not match the D3 Testnet controls");
    await expect(page.getByRole("button", { name: "Donate to this pool", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Approve #|Execute #|Review payout/ })).toHaveCount(0);
  });

  test("signer UI reviews exact 6.50 PHP before sending a proposal (mocked responses)", async ({ page }) => {
    const writes = await fixture(page, { viewer: signers[0] });
    await page.getByLabel("Recipient wallet", { exact: true }).fill(recipient);
    await page.getByLabel("Payout amount", { exact: true }).fill("6.50");
    await page.getByRole("button", { name: "Review payout proposal" }).click();
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
    await expect(page.getByRole("button", { name: "Approve #4", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Execute #4", exact: true })).toBeDisabled();
    await expect(page.getByText(/Wait 20 ledgers/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Execute #3", exact: true })).toBeDisabled();
    await expect(page.getByText(/Blocked: payouts paused/)).toBeVisible();
    await expect(page.getByText(/Stale control proposal/)).toBeVisible();
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
      expect(body).toContain("Sign in to use signer controls");
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
  await expect(controls.getByRole("link", { name: `Active D3 contract: ${expected}` })).toBeVisible({ timeout: 30000 });
  await expect(controls.getByText(/Public read-only view/)).toBeVisible();
  await expect(controls.getByText("Loading proposals…")).toHaveCount(0);
  await expect(controls.getByRole("alert")).toHaveCount(0);
});
