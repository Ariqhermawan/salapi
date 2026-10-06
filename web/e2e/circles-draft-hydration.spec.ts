import { test, expect, type Page } from "@playwright/test";

// Cold first loads and reloads use real SSR and real React chunks. Only their
// delivery is held; no app response, handler, hydration state or timer is mocked.
// Guest draft storage is browser-local. Every server mutation is blocked.
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/*", async route => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(route.request().method())) {
      await route.abort();
      throw new Error(`Unexpected server mutation in draft hydration QA: ${route.request().method()}`);
    }
    await route.continue();
  });
});

async function holdReactScripts(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const held: string[] = [];
  await page.route("**/_next/**", async route => {
    if (route.request().resourceType() === "script") {
      held.push(route.request().url());
      await gate;
    }
    await route.fallback();
  });
  return { release, held };
}

async function expectColdDraftDisabled(page: Page, held: string[]) {
  await expect(page).toHaveURL(/\/circles\/create$/);
  await expect(page.getByRole("heading", { name: "Start with your cause.", exact: true })).toBeVisible();
  await expect(page).toHaveTitle("Start a circle · Salapi Circles preview");
  await expect(page.getByTestId("circle-draft-fields")).toHaveJSProperty("disabled", true);
  await expect(page.getByTestId("circle-draft-fields")).toHaveAttribute("aria-busy", "true");
  for (const id of ["circle-draft-title", "circle-draft-story", "circle-draft-category"]) await expect(page.locator(`#${id}`)).toBeDisabled();
  for (const name of ["Restore last browser draft", "Continue"]) await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
  expect(held.length, "The disabled state must be observed while real React script requests are held").toBeGreaterThan(0);
}

test("cold draft fields wait for React handlers, then the first permitted input and Continue work", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const scripts = await holdReactScripts(page);
  try {
    await page.goto("/circles/create", { waitUntil: "domcontentloaded" });
    await expectColdDraftDisabled(page, scripts.held);
    expect(await page.locator("nextjs-portal").count()).toBe(0);
    const title = "QA fictional animal support";
    // Begin immediately, as the original failing test did. Actionability waits
    // on the actual disabled fields, not a fixed delay or a test-only ready hook.
    const firstInput = page.locator("#circle-draft-title").fill(title);
    scripts.release();
    await firstInput;
    await expect(page.getByTestId("circle-draft-fields")).toHaveAttribute("aria-busy", "false");
    await expect(page.getByText(`${title.length} / 90 characters`, { exact: true })).toBeVisible();
    await page.locator("#circle-draft-story").fill("A browser-only fictional cause with practical animal care supplies. No real campaign, payment or upload is made.");
    await page.locator("#circle-draft-category").selectOption("animals");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.locator("#circle-draft-goal")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Give the idea a goal.", exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("salapi.circles.draft.v1"))).toBeNull();
    expect(errors).toEqual([]);
  } finally { scripts.release(); }
});

test("a cold reload does not discard the first permitted Restore or rewrite the stored draft", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const key = "salapi.circles.draft.v1";
  const draft = { version: 1, savedAt: "2026-10-01T00:00:00.000Z", title: "QA legacy community cause", story: "A fictional old browser draft with one example cover and practical community supplies.", category: "community", target: { localValue: "20.00", currency: "en", pesoEquivalent: 1160 }, durationDays: 60, cover: "/circles/disaster.jpg", allowance: { percentage: 0, conceptAcknowledged: false }, organizerVerification: "not-performed", publication: "browser-draft-only" };
  await page.addInitScript(({ key, draft }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(draft)); }, { key, draft });
  await page.goto("/circles/create", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Restore last browser draft", exact: true })).toBeEnabled();
  const scripts = await holdReactScripts(page);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectColdDraftDisabled(page, scripts.held);
    const restore = page.getByRole("button", { name: "Restore last browser draft", exact: true });
    await restore.evaluate(button => (button as HTMLButtonElement).click());
    await expect(page.locator("#circle-draft-title")).toHaveValue("");
    expect(await page.getByText("The last browser draft is restored. Review it before saving again.", { exact: true }).count()).toBe(0);
    const firstRestore = restore.click();
    scripts.release();
    await firstRestore;
    await expect(page.getByText("The last browser draft is restored. Review it before saving again.", { exact: true })).toBeVisible();
    await expect(page.locator("#circle-draft-title")).toHaveValue(draft.title);
    await expect(page.locator("#circle-draft-story")).toHaveValue(draft.story);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key)).toEqual(draft);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.locator("#circle-draft-photo-0")).toHaveValue(draft.cover);
    expect(errors).toEqual([]);
  } finally { scripts.release(); }
});
