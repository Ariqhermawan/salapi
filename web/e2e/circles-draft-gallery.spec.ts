import { test, expect, type Page } from "@playwright/test";

// Guest candidate coverage only. Browser-local drafts are the only writes.
// Every server mutation is intercepted, including accidental optional signup.
test.beforeEach(async ({ page }) => {
  await page.route("**/*", async route => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(route.request().method())) {
      await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Read-only draft QA: server mutation blocked" }) });
      return;
    }
    await route.continue();
  });
});

const draftKey = "salapi.circles.draft.v1";
async function enterCause(page: Page, category: string) {
  await page.goto("/circles/create", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Start with your cause.", exact: true })).toBeVisible();
  await page.getByLabel("Cause title", { exact: false }).fill("QA fictional animal support");
  await page.getByLabel("The story", { exact: false }).fill("A browser-only fictional draft to review three AI example photos. No real campaign, payment or upload is made.");
  await page.getByRole("combobox", { name: "Category", exact: true }).selectOption(category);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("#circle-draft-goal").fill("10.00");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("region", { name: "Browser draft photo gallery", exact: true }).locator("img")).toHaveCount(3);
  await page.getByRole("checkbox", { name: /^Save this concept on this device only/ }).check();
  await page.getByRole("button", { name: "Save complete browser draft", exact: true }).click();
  await expect(page.getByText("Complete draft saved in this browser.", { exact: true })).toBeVisible();
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), draftKey);
}

for (const width of [320, 390, 1280]) test(`new three-photo browser draft saves, exports and restores at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
  await enterCause(page, "animals");
  const picker = page.getByRole("group", { name: "Choose three example photos", exact: true });
  await expect(picker.locator("img")).toHaveCount(3);
  await expect(picker).toContainText("Added photos are AI concepts, not uploads or delivery proof; nothing is published.");
  const sources = ["cats-clinic-recovery", "dogs-foster-homes", "shelter-kennel-repairs"].map(id => `/circles/generated/${id}.png`);
  for (const [index, source] of sources.entries()) {
    const choice = page.locator(`#circle-draft-photo-${index}`);
    await choice.selectOption(source);
    await expect(choice.locator("option:checked")).toHaveText(`AI ${index + 4}`);
    const bounds = await choice.boundingBox(); expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
  await expect.poll(() => picker.locator("img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const draft = await save(page);
  expect(draft.version).toBe(1); expect(draft.gallery.map((photo: { src: string }) => photo.src)).toEqual(sources);
  expect(draft.cover).toBe(sources[0]); expect(draft.publication).toBe("browser-draft-only"); expect(draft.organizerVerification).toBe("not-performed"); expect(draft.email).toBeUndefined();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download draft JSON", exact: true }).click();
  expect((await downloadEvent).suggestedFilename()).toBe("salapi-circle-draft.json");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Restore last browser draft", exact: true }).click();
  await expect(page.getByText("The last browser draft is restored. Review it before saving again.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  for (const [index, source] of sources.entries()) await expect(page.locator(`#circle-draft-photo-${index}`)).toHaveValue(source);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), draftKey)).toEqual(draft);
});

test("a cover-only legacy draft restores honestly and saves three photos without changing its original cover", async ({ page }) => {
  const legacy = {
    version: 1, savedAt: "2026-10-01T00:00:00.000Z", title: "QA legacy community cause", story: "A fictional old browser draft with one example cover and practical community supplies.",
    category: "community", target: { localValue: "20.00", currency: "en", pesoEquivalent: 1160 }, durationDays: 60,
    cover: "/circles/disaster.jpg", allowance: { percentage: 0, conceptAcknowledged: false }, organizerVerification: "not-performed", publication: "browser-draft-only",
  };
  await page.addInitScript(({ key, record }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(record)); }, { key: draftKey, record: legacy });
  await page.goto("/circles/create", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Restore last browser draft", exact: true }).click();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), draftKey)).toEqual(legacy);
  await page.getByRole("button", { name: "Continue", exact: true }).click(); await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator("#circle-draft-photo-0")).toHaveValue(legacy.cover);
  await expect(page.getByRole("group", { name: "Choose three example photos" })).toContainText("Restored legacy cover");
  const draft = await save(page);
  expect(draft.cover).toBe(legacy.cover); expect(draft.gallery).toHaveLength(3);
  expect(new Set(draft.gallery.map((photo: { src: string }) => photo.src)).size).toBe(3);
  expect(draft.gallery[0].caption).toContain("not a verified campaign photo");
});
