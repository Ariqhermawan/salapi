import { test, expect } from "@playwright/test";
import { guidanceRoom } from "./helpers/arisan-guidance";
import { PREVIEW_WALLET } from "../lib/local-preview";
import { DICTS } from "../lib/i18n/dictionaries";

// This suite requires an explicitly compiled local-preview server. Browser
// examples and storage only; every server write is blocked before leaving QA.
test.beforeEach(async ({ page, baseURL }) => {
  test.skip(process.env.E2E_ARISAN_PREVIEW !== "1", "Requires separate NEXT_PUBLIC_LOCAL_PREVIEW=1 server");
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  await page.route("**/*", async route => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(route.request().method()))
      return route.fulfill({ status: 403, body: "No server writes allowed in isolated local-preview QA" });
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("actual local preview completes entry steps and samples a non-first eligible member", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  const writes: string[] = [], errors: string[] = [];
  page.on("request", request => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  // Deterministic browser entropy exercises the real preview selection helper.
  // Sample 1 selects eligible index 1, not the old always-first implementation.
  await page.addInitScript(() => {
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = ((array: ArrayBufferView) => {
      if (array instanceof Uint32Array && array.length === 1) { array[0] = 1; return array; }
      return original(array);
    }) as typeof crypto.getRandomValues;
  });
  await page.goto("/arisan/1", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Example data · no transactions", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start the arisan", exact: true }).click();
  await expect(page.getByTestId("arisan-next-step")).toContainText("Local simulation");
  await expect(page.getByTestId("arisan-next-step").locator("time")).toHaveCount(0);
  await page.getByRole("button", { name: "Enter this draw", exact: true }).click();
  const tools = page.locator("details").filter({ hasText: "Local example controls" });
  await tools.locator("summary").click();
  await tools.getByRole("button", { name: "Commit demo friends", exact: true }).click();
  await page.getByRole("button", { name: "Complete my draw entry", exact: true }).click();
  await tools.getByRole("button", { name: "Reveal demo friends", exact: true }).click();
  await expect(page.getByRole("button", { name: "Draw winner" })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("local-preview-before-draw.png") });
  await page.getByRole("button", { name: "Draw winner" }).click();
  await page.clock.runFor(4000);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("salapi.preview.arisan-room.1") || "null").room);
  expect(saved.winners).toHaveLength(1);
  expect(saved.winners[0].addr).toBe("LOCAL_MEMBER_1");
  expect(saved.winners[0].label).toBe("Farrel");
  expect(saved.round).toBe(2);
  expect(saved.seats.filter((seat: { won: boolean }) => seat.won)).toHaveLength(1);
  await expect(page.getByText(/not an on-chain draw and moves no funds/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Room overview", exact: true })).toContainText("Round 2 of 5");
  await page.screenshot({ path: testInfo.outputPath("local-preview-sampled-Farrel.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("sole local-preview recipient completes cycle with no false randomness or real transactions", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  const writes: string[] = [], errors: string[] = [];
  page.on("request", request => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  const room = guidanceRoom("Finalizable");
  Object.assign(room, { id: 73, viewer: PREVIEW_WALLET.address, host: PREVIEW_WALLET.address, memberTarget: 3, memberCount: 3, round: 3, eligibleCount: 1, commitCount: 1, revealCount: 1, potPesos: 195, potPeso: "195", depositStroops: "300000000", canCommit: false, canReveal: false, canFinalize: true });
  room.seats = room.seats.slice(0, 3).map((seat, index) => ({ ...seat, addr: index === 0 ? PREVIEW_WALLET.address : seat.addr, won: index < 2, committed: index === 2, revealed: index === 2, fundedStroops: "300000000" }));
  room.winners = room.seats.slice(0, 2).map((seat, index) => ({ round: index + 1, addr: seat.addr, label: seat.label, ts: Math.floor(Date.now() / 1000) - (2 - index) * 604800 }));
  await page.addInitScript(({ room }) => {
    sessionStorage.setItem("salapi.preview.arisan-room.73", JSON.stringify({ version: 1, room }));
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = ((array: ArrayBufferView) => {
      if (array instanceof Uint32Array && array.length === 1) throw new Error("Sole recipient must not request random selection");
      return original(array);
    }) as typeof crypto.getRandomValues;
  }, { room });
  await page.goto("/arisan/73", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("arisan-next-step")).toContainText("there is no random choice left");
  await page.getByRole("button", { name: "Complete final payout" }).click();
  await expect(page.getByText(DICTS.en.arisan.kocok.spinning, { exact: true })).toHaveCount(0);
  await page.clock.runFor(4000);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("salapi.preview.arisan-room.73") || "null").room);
  expect(saved.status).toBe("Done");
  expect(saved.winners).toHaveLength(3);
  expect(saved.winners[2].addr).toBe(room.seats[2].addr);
  expect(new Set(saved.winners.map((winner: { addr: string }) => winner.addr)).size).toBe(3);
  const complete = page.getByRole("region", { name: "Your next action", exact: true });
  await expect(complete).toContainText("This local preview sent no transactions");
  await complete.getByRole("button", { name: "View payout history", exact: true }).click();
  await expect(page.locator("details[open] ol > li")).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath("local-preview-completed-cycle.png") });
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("one completed entry among several unpaid members pays that entrant without a random-draw animation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes: string[] = [], errors: string[] = [];
  page.on("request", request => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  const room = guidanceRoom("Finalizable");
  Object.assign(room, { id: 74, viewer: PREVIEW_WALLET.address, host: PREVIEW_WALLET.address,
    round: 3, eligibleCount: 3, commitCount: 1, revealCount: 1, canCommit: false, canReveal: false, canFinalize: true });
  room.seats = room.seats.map((seat, index) => ({ ...seat, addr: index === 0 ? PREVIEW_WALLET.address : seat.addr,
    won: index < 2, committed: index === 2, revealed: index === 2, fundedStroops: "500000000" }));
  room.winners = room.seats.slice(0, 2).map((seat, index) => ({ round: index + 1, addr: seat.addr, label: seat.label, ts: Math.floor(Date.now() / 1000) - (2 - index) * 604800 }));
  await page.addInitScript(({ room }) => {
    sessionStorage.setItem("salapi.preview.arisan-room.74", JSON.stringify({ version: 1, room }));
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = ((array: ArrayBufferView) => {
      if (array instanceof Uint32Array && array.length === 1) throw new Error("One completed entry must not request random selection");
      return original(array);
    }) as typeof crypto.getRandomValues;
  }, { room });
  await page.goto("/arisan/74", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("arisan-next-step")).toContainText("Only one member completed their entry");
  await expect(page.getByTestId("arisan-next-step")).not.toContainText("Only one member has not received a payout");
  await page.getByRole("button", { name: "Complete round payout" }).click();
  await expect(page.getByText(DICTS.en.arisan.kocok.spinning, { exact: true })).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("salapi.preview.arisan-room.74") || "null").room);
  expect(saved.winners).toHaveLength(3);
  expect(saved.winners[2].addr).toBe(room.seats[2].addr);
  expect(saved.status).toBe("Active");
  expect(saved.round).toBe(4);
  expect(saved.eligibleCount).toBe(2);
  await expect(page.getByText(/Only one member completed their entry.*No transaction was sent/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("local-preview-single-completed-entry.png") });
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
