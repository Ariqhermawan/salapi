import { test, expect, type Page } from "@playwright/test";
import { arisanRoomCopy } from "../lib/arisan-room-guidance";
import { assertLocalArisanFixtureTarget, isLocalArisanFixtureTarget, installGuidanceFixture, guidanceRoom, type GuidancePhase } from "./helpers/arisan-guidance";

// Real production React screen with isolated read responses. No login, signing,
// membership writes, Testnet payments or winner-selection actions are executed.
test.beforeEach(async ({ baseURL }) => {
  test.skip(!isLocalArisanFixtureTarget(baseURL), "Isolated Arisan fixtures must not target a live deployment");
  assertLocalArisanFixtureTarget(baseURL);
  test.skip(process.env.E2E_ARISAN_PREVIEW === "1", "Production-route fixture suite, not local-preview acceptance");
});

async function renderHealth(page: Page) {
  await expect(page).toHaveURL(/\/arisan\/71$/);
  await expect(page).toHaveTitle("Arisan Room · Salapi");
  await expect(page.getByRole("region", { name: "Room overview", exact: true })).toBeVisible();
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
  await expect(page.getByText(/Application error:|Runtime Error|Build Error/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await page.locator("#app-content").evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
}

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  for (const locale of ["en", "id", "tl", "vi"] as const) {
    test(`member deposits, phase guidance and completed destinations ${locale} ${viewport.width}px`, async ({ page, baseURL }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.clock.install();
      const fixture = await installGuidanceFixture(page, "Open", baseURL!, locale);
      const copy = arisanRoomCopy(locale);
      await page.goto("/arisan/71", { waitUntil: "domcontentloaded" });
      await renderHealth(page);
      await expect.poll(() => fixture.calls.reads).toBeGreaterThan(0);

      for (const phase of ["Open", "Commit", "Reveal", "Finalizable", "Done"] as GuidancePhase[]) {
        if (phase !== "Open") { fixture.setPhase(phase); await page.clock.fastForward(5100); }
        const rows = page.getByTestId("arisan-member-row");
        await expect(rows).toHaveCount(5);
        for (let index = 0; index < 4; index++) {
          const deposit = rows.nth(index).getByTestId("arisan-member-deposit");
          await expect(deposit).toHaveAttribute("data-stroops", "500000000");
          await expect(deposit).toContainText("50.0000000 XLM");
          await expect(deposit).toContainText(copy.deposited);
          await expect(deposit).toContainText(copy.illustrative);
        }
        const unknown = rows.nth(4).getByTestId("arisan-member-deposit");
        await expect(unknown).toContainText(copy.depositUnavailable);
        await expect(unknown).not.toHaveAttribute("data-stroops", /\d+/);
        await expect(unknown).not.toContainText("50.0000000 XLM");
        await expect(page.getByRole("region", { name: "All room members", exact: true })).toContainText(copy.depositHistory);

        if (["Commit", "Reveal", "Finalizable"].includes(phase)) {
          const guide = page.getByTestId("arisan-next-step");
          await expect(guide).toBeVisible();
          await expect(guide).toContainText(copy.nextStep);
          await expect(guide).toContainText(phase === "Commit" ? copy.enterHelp : phase === "Reveal" ? copy.revealHelp : copy.drawHelp);
          await expect(guide).toContainText(copy.localTime);
          await expect(guide).toContainText(copy.entryDeadline);
          await expect(guide).toContainText(copy.revealDeadline);
          await expect(guide).toContainText(copy.drawFrom);
          const times = await guide.locator("time").evaluateAll(nodes => nodes.map(node => (node as HTMLTimeElement).dateTime));
          expect(times).toHaveLength(3);
          expect(Date.parse(times[1]) - Date.parse(times[0])).toBe(3600000);
          expect(times[2]).toBe(times[1]);
          await expect(guide.locator('[data-current="true"]')).toHaveCount(1);
          const label = phase === "Commit" ? copy.enterDraw : phase === "Reveal" ? copy.completeEntry : copy.drawWinner;
          const action = page.getByRole("region", { name: "Your next action", exact: true }).getByRole("button", { name: label });
          await expect(action).toBeEnabled();
          expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
          if (phase === "Commit" && locale === "en" && viewport.width === 390) {
            expect(await page.locator("#app-content").evaluate(node => node.scrollTop)).toBe(0);
            const actionBounds = (await action.boundingBox())!;
            const navigationBounds = (await page.getByRole("navigation", { name: "Main navigation", exact: true }).boundingBox())!;
            expect(actionBounds.y).toBeGreaterThanOrEqual(0);
            expect(actionBounds.y + actionBounds.height).toBeLessThanOrEqual(navigationBounds.y + 1);
            await page.screenshot({ path: testInfo.outputPath("commit-390-primary-action-fully-visible.png") });
          }
        }
        if (phase === "Done") {
          const complete = page.getByRole("region", { name: "Your next action", exact: true });
          await expect(complete).toContainText(copy.newCycleHelp);
          const history = page.locator("details").filter({ has: page.locator("ol") });
          await expect(history).toHaveCount(1);
          await expect(history).not.toHaveAttribute("open", "");
          const openHistory = complete.getByRole("button", { name: copy.viewHistory, exact: true });
          await expect(openHistory).toBeEnabled();
          await openHistory.click();
          await expect(history).toHaveAttribute("open", "");
          await expect(history.locator("ol > li")).toHaveCount(5);
          await expect(complete.getByRole("link", { name: copy.newCycle, exact: true })).toHaveAttribute("href", "/arisan/new");
          await expect(complete.getByRole("link", { name: copy.allRooms, exact: true })).toHaveAttribute("href", "/arisan");
          await expect(complete.getByRole("link", { name: copy.home, exact: true })).toHaveAttribute("href", "/");
          await complete.scrollIntoViewIfNeeded();
          await page.screenshot({ path: testInfo.outputPath(`done-${locale}-${viewport.width}.png`) });
        }
        await renderHealth(page);
      }
      expect(fixture.errors).toEqual([]);
      expect(fixture.warnings).toEqual([]);
      expect(fixture.calls.blockedActions).toEqual([]);
      await page.getByRole("region", { name: "Your next action", exact: true }).getByRole("link", { name: copy.allRooms, exact: true }).click();
      await expect(page).toHaveURL(/\/arisan$/);
      await expect(page.getByRole("heading", { name: "Save together.", exact: true })).toBeVisible();
      expect(fixture.calls.blockedActions).toEqual([]);
    });
  }
}

test("already-paid member and missed-entry guidance does not imply another deposit", async ({ page, baseURL }) => {
  await page.clock.install();
  const fixture = await installGuidanceFixture(page, "Commit", baseURL!);
  const paid = guidanceRoom("Commit");
  paid.seats[0].won = true; paid.canCommit = false;
  fixture.setRoom(paid);
  await page.goto("/arisan/71", { waitUntil: "domcontentloaded" });
  const guide = page.getByTestId("arisan-next-step");
  await expect(guide).toContainText("You already received your payout. No further deposit is needed");
  await expect(page.getByRole("region", { name: "Your next action", exact: true }).getByRole("button").first()).toBeDisabled();
  const missed = guidanceRoom("Reveal");
  missed.seats[0].committed = false; missed.canReveal = false;
  fixture.setRoom(missed); await page.clock.fastForward(5100);
  await expect(guide).toContainText("You did not enter during the entry window");
  await expect(page.getByRole("region", { name: "Your next action", exact: true }).getByRole("button").first()).toBeDisabled();
  expect(fixture.errors).toEqual([]);
  expect(fixture.calls.blockedActions).toEqual([]);
});

test("completed entry waits for authoritative phase rather than stale browser deadline", async ({ page, baseURL }) => {
  await page.clock.install();
  const fixture = await installGuidanceFixture(page, "Reveal", baseURL!);
  const completed = guidanceRoom("Reveal");
  completed.seats[0].revealed = true; completed.canReveal = false;
  completed.revealAt = Math.floor(Date.now() / 1000) - 1;
  fixture.setRoom(completed);
  await page.goto("/arisan/71", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("arisan-next-step")).toContainText("Entry complete. Wait until the draw opens.");
  await expect(page.getByRole("region", { name: "Your next action", exact: true }).getByRole("button", { name: "Draw winner" })).toHaveCount(0);
  const final = guidanceRoom("Finalizable"); final.eligibleCount = 1;
  fixture.setRoom(final); await page.clock.fastForward(5100);
  await expect(page.getByTestId("arisan-next-step")).toContainText("Only one member has not received a payout");
  await expect(page.getByRole("button", { name: "Complete final payout" })).toBeEnabled();
  expect(fixture.errors).toEqual([]);
  expect(fixture.calls.blockedActions).toEqual([]);
});

test("zero-reveal fallback is visibly predictable and requires fresh round acknowledgement", async ({ page, baseURL }, testInfo) => {
  await page.clock.install();
  const fixture = await installGuidanceFixture(page, "Finalizable", baseURL!);
  const fallback = guidanceRoom("Finalizable");
  fallback.commitCount = 0; fallback.revealCount = 0;
  fallback.seats = fallback.seats.map(seat => ({ ...seat, committed: false, revealed: false }));
  fixture.setRoom(fallback);
  await page.goto("/arisan/71", { waitUntil: "domcontentloaded" });
  const warning = page.getByTestId("arisan-fallback-warning");
  const action = page.getByRole("region", { name: "Your next action", exact: true }).getByRole("button", { name: "Finalize fallback payout" });
  await expect(warning).toHaveAttribute("role", "alert");
  await expect(warning).toContainText("No completed entries: predictable fallback");
  await expect(warning).toContainText("not a fresh random draw");
  await expect(warning).toContainText("cannot reopen this round's entries");
  await expect(action).toBeDisabled();
  const ack = warning.getByRole("checkbox", { name: /I understand this payout uses the predictable Testnet fallback/ });
  await expect(ack).not.toBeChecked();
  await ack.check();
  await expect(action).toBeEnabled();
  // Acknowledgement itself is local UI state. Never click the financial action.
  expect(fixture.calls.blockedActions).toEqual([]);
  const advanced = { ...fallback, round: 3, revealAt: fallback.revealAt + 604800 };
  fixture.setRoom(advanced); await page.clock.fastForward(5100);
  await expect(ack).not.toBeChecked();
  await expect(action).toBeDisabled();
  await ack.check();
  const changedViewer = { ...advanced, viewer: advanced.seats[1].addr,
    seats: advanced.seats.map((seat, index) => ({ ...seat, isYou: index === 1 })) };
  fixture.setRoom(changedViewer); await page.clock.fastForward(5100);
  await expect(ack).not.toBeChecked();
  await expect(action).toBeDisabled();
  await ack.check();
  // Deliberately retain a simulated stale capability while the identity changes,
  // to prove this local acknowledgement is bound to identity, not permission.
  fixture.setRoom({ ...changedViewer, viewerIdentity: "demo" }); await page.clock.fastForward(5100);
  await expect(ack).not.toBeChecked();
  await expect(action).toBeDisabled();
  await warning.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("fallback-ack-required.png") });
  expect(fixture.errors).toEqual([]);
  expect(fixture.calls.blockedActions).toEqual([]);
});

test("refunded room distinguishes a cleared zero record from unavailable original funding", async ({ page, baseURL }, testInfo) => {
  const fixture = await installGuidanceFixture(page, "Open", baseURL!);
  const refunded = guidanceRoom("Open");
  Object.assign(refunded, { status: "Dissolved", code: null, readyToStart: false,
    seats: refunded.seats.map((seat, index) => ({ ...seat, fundedStroops: index === 4 ? null : "0" })) });
  fixture.setRoom(refunded);
  await page.goto("/arisan/71", { waitUntil: "domcontentloaded" });
  const members = page.getByRole("region", { name: "All room members", exact: true });
  await expect(members).toContainText("A refund can clear the contract's deposit record");
  await expect(members).toContainText("Zero does not prove that a member originally contributed nothing");
  const deposits = members.getByTestId("arisan-member-deposit");
  await expect(deposits).toHaveCount(5);
  await expect(deposits.nth(0)).toHaveAttribute("data-stroops", "0");
  await expect(deposits.nth(0)).toContainText("Contract deposit record after any refund");
  await expect(deposits.nth(0)).toContainText("0.0000000 XLM");
  await expect(deposits.nth(4)).toContainText("Deposit amount unavailable");
  await expect(deposits.nth(4)).not.toHaveAttribute("data-stroops", /\d+/);
  await expect(page.getByTestId("arisan-next-step")).toHaveCount(0);
  await members.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("dissolved-zero-not-original-amount.png") });
  await renderHealth(page);
  expect(fixture.errors).toEqual([]);
  expect(fixture.calls.blockedActions).toEqual([]);
});
