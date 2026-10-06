import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

// Isolated candidate UI fixtures only. No authentication, contract submission,
// real photo upload or database mutation. Never intercept a live deployment.
const wallet = "GAKZLTZFGSSM372XUKW2ZIJ5GSHVVIW5BYZIKIXRW2BW4MM6TUI5536Y";
const contractId = "CCN2O4Z6CSUVF74DWZBJJ526IMEXVRCYKY74PM5BDKA22WWTOW5WHZDY";
const campaign = { id: "7", title: "Isolated organizer gallery fixture", state: "Funding", total: "10000000", escrow: "10000000",
  config: { creator: wallet, beneficiary: wallet, token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC", creator_cut_bps: 500,
    funding_deadline: "4102444800", review_deadline: "4102531200", approvers: [wallet, wallet, wallet] },
  proofHash: null, proofUrl: "", approvals: [], contribution: { amount: "0", refunded: false } };
const paths = ["tino-relief", "tino-relief-materials", "tino-relief-shore"];

async function fixture(page: Page, empty = false, unavailable = false) {
  const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
  const names = new Map(Object.entries(manifest.node as Record<string, { exportedName: string }>).map(([id, value]) => [id, value.exportedName]));
  const forbidden: string[] = [];
  await page.route("**/*", async route => {
    const request = route.request();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) return route.continue();
    const name = names.get(request.headers()["next-action"]);
    let value: unknown;
    if (name === "campaignState") value = { ok: true, viewer: null, now: "1000", campaigns: [campaign], contractId };
    else if (name === "campaignMedia") value = {
      ok: !unavailable, available: !unavailable, ...(unavailable ? { code: "not_configured" } : {}),
      network: "testnet", contractId, campaignId: campaign.id, creatorWallet: wallet,
      photos: empty || unavailable ? [] : paths.map(id => ({ src: `/circles/generated/${id}.png`, width: 1536, height: 1024 })),
      updatedAt: null, ownerId: null, canManage: false, permissionCode: "unauthenticated",
    };
    else {
      forbidden.push(name ?? request.url());
      return route.fulfill({ status: 403, body: "Read-only candidate QA: mutation blocked" });
    }
    await route.fulfill({ contentType: "text/x-component", body: `0:{"a":"$@1","f":"","i":false}\n1:${JSON.stringify(value)}\n` });
  });
  await page.goto("/campaigns?id=7", { waitUntil: "domcontentloaded" });
  return forbidden;
}

test.describe("D4 organizer gallery, isolated read-only candidate UI", () => {
  test.beforeEach(({ baseURL }) => test.skip(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL!).hostname), "Local HTTP fixtures never target live deployments"));

  for (const width of [320, 390, 1280]) test(`all three organizer gallery scenes load and change at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const forbidden = await fixture(page);
    await expect(page.getByRole("heading", { name: campaign.title })).toBeVisible();
    const gallery = page.getByRole("region", { name: "Campaign photo gallery", exact: true });
    await expect(gallery).toBeVisible();
    await expect(gallery).toContainText("Organizer photos");
    await expect(gallery).not.toContainText("AI illustration");
    for (let index = 0; index < 3; index++) {
      const photo = gallery.locator('div[role="group"] img');
      await expect.poll(() => photo.evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
      await expect(photo).toHaveAttribute("src", new RegExp(paths[index]));
      await gallery.getByRole("button", { name: "Next photo", exact: true }).click();
    }
    await expect(gallery.locator('div[role="group"] img')).toHaveAttribute("src", /tino-relief\.png/);
    await expect(page.getByRole("button", { name: "Publish campaign photos", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]); expect(forbidden).toEqual([]);
  });

  test("no photos and unavailable storage retain honest, nonblank placeholders", async ({ page }) => {
    for (const unavailable of [false, true]) {
      const forbidden = await fixture(page, true, unavailable);
      const gallery = page.getByRole("region", { name: "Campaign photo gallery", exact: true });
      await expect(gallery).toContainText("This campaign has no organizer photos yet.");
      await expect(gallery.getByRole("button", { name: "Next photo", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Publish campaign photos", exact: true })).toHaveCount(0);
      expect(forbidden).toEqual([]);
      await page.unrouteAll({ behavior: "wait" });
    }
  });
});
