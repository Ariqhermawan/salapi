import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { LOCALE_COOKIE, type Locale } from "../lib/i18n/config";
import { circlesCopy } from "../lib/i18n/revamp-circles";

// Clean guest contexts and a language preference only. Server mutations, signup,
// auth changes and financial actions are forbidden throughout this UI audit.
const health = new WeakMap<Page, { errors: string[]; console: string[]; blocked: string[] }>();
test.beforeEach(async ({ page, baseURL }) => {
  test.skip(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL!).hostname), "Organizer candidate QA runs locally only");
  const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
  const actionNames = new Map(Object.entries(manifest.node as Record<string, { exportedName: string }>).map(([id, value]) => [id, value.exportedName]));
  const state = { errors: [] as string[], console: [] as string[], blocked: [] as string[] };
  health.set(page, state);
  page.on("pageerror", error => state.errors.push(error.message));
  page.on("console", message => {
    if (!["error", "warning"].includes(message.type())) return;
    if (message.text() === "Service Worker registration blocked by Playwright") return;
    state.console.push(message.text());
  });
  await page.route("**/*", async route => {
    const request = route.request();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
      // Mapping GET reads retain their real response. The legacy mapping POST,
      // if registered, remains the only permitted readonly action; metadata,
      // auth and money writes still fail the afterEach assertions if attempted.
      const action = actionNames.get(request.headers()["next-action"]);
      if (request.method() === "POST" && action === "readCircleTestnetCampaign") return route.continue();
      state.blocked.push(`${request.method()} ${new URL(request.url()).pathname}: ${action ?? "unknown"}`);
      await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Read-only organizer QA: server mutation blocked" }) });
      return;
    }
    await route.continue();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.afterEach(async ({ page }, testInfo) => {
  const state = health.get(page);
  // A beforeEach production skip never installs the candidate health monitor.
  // Missing monitoring still fails every non-skipped test.
  if (testInfo.status === "skipped" && !state) return;
  expect(state, "Health monitor must exist for every exercised test").toBeDefined();
  expect(state?.errors, "No app runtime exception").toEqual([]);
  expect(state?.console, "No relevant browser console error or warning").toEqual([]);
  expect(state?.blocked, "Organizer viewing and Back must not attempt a server mutation").toEqual([]);
});

const verificationCopy: Record<Locale, { ngo: string; individual: string; disclaimer: string }> = {
  en: { ngo: "NGO verified · demo", individual: "KYC checked · demo", disclaimer: "Demo verification, not an identity check." },
  id: { ngo: "NGO terverifikasi · simulasi", individual: "Sudah KYC · simulasi", disclaimer: "Verifikasi simulasi, bukan pemeriksaan identitas." },
  tl: { ngo: "Beripikadong NGO · demo", individual: "Nasuri ang KYC · demo", disclaimer: "Demo na beripikasyon, hindi pagsusuri ng pagkakakilanlan." },
  vi: { ngo: "NGO đã xác minh · mô phỏng", individual: "Đã kiểm tra KYC · mô phỏng", disclaimer: "Xác minh mô phỏng, không phải kiểm tra danh tính." },
};

const cases = [
  { id: "cats-recovery", name: "Paws & Home Care", location: "Yogyakarta, ID", kind: "ngo", image: /organizers(?:%2F|\/)paws-home\.svg/ },
  { id: "tino-relief", name: "Maria S.", location: "Cebu, PH", kind: "individual", image: /face-1\.png/ },
  // A longer organizer name guards normal wrapping, not just the short Maria.
  { id: "bohol-health-screening", name: "Teachers' Circle, Tubigon", location: "Bohol, PH", kind: "ngo", image: /organizers(?:%2F|\/)teachers-tubigon\.svg/ },
] as const;

async function expectContained(inner: Locator, outer: Locator, label: string) {
  await expect(inner).toBeVisible();
  const box = await inner.boundingBox(), container = await outer.boundingBox();
  expect(box, `${label} must have a rendered box`).not.toBeNull();
  expect(container).not.toBeNull();
  expect(box!.x, `${label} must fit the card's left edge`).toBeGreaterThanOrEqual(container!.x - 1);
  expect(box!.x + box!.width, `${label} must fit the card's right edge`).toBeLessThanOrEqual(container!.x + container!.width + 1);
  expect(box!.y, `${label} must fit the card's top edge`).toBeGreaterThanOrEqual(container!.y - 1);
  expect(box!.y + box!.height, `${label} must fit the card's bottom edge`).toBeLessThanOrEqual(container!.y + container!.height + 1);
}

for (const width of [320, 390, 1280]) for (const locale of ["en", "tl", "id", "vi"] as const) {
  test.describe(`${locale} organizer card at ${width}px`, () => {
    test.use({ viewport: { width, height: width === 1280 ? 800 : 844 }, isMobile: width < 1024, hasTouch: width < 1024 });
    test("name, location and inline example badge fit; profile Back preserves the original cause", async ({ page, context, baseURL }, testInfo) => {
      const c = circlesCopy(locale), copy = verificationCopy[locale];
      await context.addCookies([{ name: LOCALE_COOKIE, value: locale, url: new URL(baseURL ?? "http://localhost:4747").origin }]);
      for (const fixture of cases) {
        const path = `/circles/${fixture.id}`;
        await page.goto(path, { waitUntil: "domcontentloaded", timeout: 45000 });
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        expect(await page.title()).toContain("Salapi");
        await expect(page.locator("#circle-title")).not.toBeEmpty();
        await expect(page.locator("nextjs-portal")).toHaveCount(0);
        await page.evaluate(async () => { await document.fonts.ready; });
        const card = page.getByTestId("circle-organizer-card");
        await expect(card).toHaveCount(1);
        await expect(card).toHaveJSProperty("tagName", "A");
        await expect(card).toHaveAttribute("data-organizer-kind", fixture.kind);
        await expect(card).toHaveAttribute("href", `${path}/organizer`);
        await expect(card).toHaveAccessibleName(c("View example organizer profile: {name}", { name: fixture.name }));
        await card.scrollIntoViewIfNeeded();
        const name = card.getByText(fixture.name, { exact: true });
        const location = card.getByText(fixture.location, { exact: true });
        await expectContained(name, card, "Organizer name");
        await expectContained(location, card, "Organizer location");
        for (const field of [name, location]) {
          expect(await field.evaluate(node => getComputedStyle(node).whiteSpace), "Identity text must allow normal wrapping").not.toBe("nowrap");
          expect(await field.evaluate(node => node.scrollWidth <= node.clientWidth + 1), "Identity text must not overflow its allocated width").toBe(true);
        }
        const avatar = card.locator("img");
        await expect(avatar).toHaveCount(1); await expect(avatar).toHaveAttribute("src", fixture.image);
        await expect.poll(() => avatar.evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
        await expectContained(avatar, card, "Organizer avatar");
        const avatarBox = await avatar.boundingBox(), nameBox = await name.boundingBox();
        expect(avatarBox!.width).toBeLessThanOrEqual(64); expect(avatarBox!.height).toBeLessThanOrEqual(64);
        expect(avatarBox!.x + avatarBox!.width, "Avatar must stay left of the identity text").toBeLessThanOrEqual(nameBox!.x + 1);
        const badge = card.getByRole("img", { name: `${copy[fixture.kind]}. ${copy.disclaimer}`, exact: true });
        await expectContained(badge, card, "Example verification badge");
        await expect(badge).toHaveAttribute("title", copy.disclaimer);
        await expect(badge).toContainText(copy[fixture.kind]);
        const badgeColor = await badge.evaluate(node => getComputedStyle(node).color);
        expect(badgeColor).toBe(fixture.kind === "ngo" ? "rgb(138, 100, 34)" : "rgb(38, 90, 180)");
        const icon = badge.locator("svg").first(), label = badge.locator(":scope > span").last();
        expect(await label.evaluate(node => getComputedStyle(node).color), "Badge label must retain its NGO gold or individual blue, not inherit unrelated location styling").toBe(badgeColor);
        const iconBox = await icon.boundingBox(), labelBox = await label.boundingBox();
        expect(iconBox).not.toBeNull(); expect(labelBox).not.toBeNull();
        expect(iconBox!.width).toBeLessThanOrEqual(18); expect(iconBox!.height).toBeLessThanOrEqual(18);
        expect(labelBox!.x, "Badge text must be inline to the right of its icon, not stacked under it").toBeGreaterThanOrEqual(iconBox!.x + iconBox!.width - 1);
        expect(iconBox!.y + iconBox!.height / 2).toBeGreaterThanOrEqual(labelBox!.y - 1);
        expect(iconBox!.y + iconBox!.height / 2).toBeLessThanOrEqual(labelBox!.y + labelBox!.height + 1);
        expect(await badge.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await expect(page.getByText(c("Demo verification, not an identity check. Names, goals, ratings, dates and scenes are fictional."), { exact: true })).toBeVisible();
        await testInfo.attach(`${fixture.id}-${locale}-${width}-card`, { body: await card.screenshot(), contentType: "image/png" });
        await card.click();
        await expect(page).toHaveURL(new RegExp(`${path}/organizer$`));
        await expect(page.locator("#organizer-name")).toHaveText(fixture.name);
        await expect(page.getByText("Fictional profile. Verification, histories and ratings are simulated. Demo verification, not an identity check.", { exact: true })).toBeVisible();
        await page.locator("#app-content").getByRole("button", { name: c("Back"), exact: true }).first().click();
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await expect(page.getByTestId("circle-organizer-card")).toHaveAccessibleName(c("View example organizer profile: {name}", { name: fixture.name }));
      }
    });
  });
}
