import { test, expect } from "@playwright/test";

// The browser must not accept an invite code before React can record onChange.
// No invite lookup, membership, signer, or financial action is submitted.
test("invite input waits for hydration and retains the first accepted code", async ({ page, baseURL }, testInfo) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  const scriptsReady = new Promise<void>(resolve => { release = resolve; });
  const writes: string[] = [], errors: string[] = [], warnings: string[] = [];
  let heldScripts = 0;
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); else if (message.type() === "warning") warnings.push(message.text()); });
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
      writes.push(request.url());
      return route.fulfill({ status: 403, body: "No server writes during isolated hydration QA" });
    }
    if (url.pathname.startsWith("/_next/") && request.resourceType() === "script") {
      heldScripts++;
      await scriptsReady;
    }
    return route.continue();
  });
  try {
    await page.goto("/arisan/join", { waitUntil: "commit" });
    const input = page.locator('input[placeholder="FAM234"]');
    await expect(input).toBeVisible();
    await expect.poll(() => heldScripts).toBeGreaterThan(0);
    // This is the critical old-build failure: SSR previously exposed an enabled
    // field whose input events could be lost before the handlers were installed.
    await expect(input).toBeDisabled();
    await expect(page.getByRole("button", { name: "Review invitation", exact: true })).toBeDisabled();
    const serverInputStyle = await input.getAttribute("style");
    // Playwright's default caret hiding rewrites input inline styles. Before
    // hydration that would introduce a synthetic React attribute mismatch.
    await page.screenshot({ path: testInfo.outputPath("invite-client-loading-disabled.png"), caret: "initial" });
    expect(await input.getAttribute("style")).toBe(serverInputStyle);
    release();
    await expect(input).toBeEnabled();
    await input.fill("FAM234");
    await expect(input).toHaveValue("FAM234");
    await expect(page.getByRole("button", { name: "Review invitation", exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath("invite-first-code-ready.png") });
    await expect(page).toHaveURL(/\/arisan\/join$/);
    await expect(page).toHaveTitle(/Salapi/);
    // A dev portal may exist for HMR without an error overlay. Check the actual
    // framework error surface, so this assertion is valid in both server modes.
    await expect(page.locator("[data-nextjs-dialog-overlay]")).not.toBeVisible();
    await expect(page.getByText(/Application error:|Runtime Error|Build Error/)).toHaveCount(0);
    await testInfo.attach("browser-health", { body: JSON.stringify({ writes, errors, warnings }), contentType: "application/json" });
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  } finally { release(); }
});
