import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Explicit browser-local interaction doubles. Not Gmail or on-chain E2E.
test.beforeEach(async ({ page, baseURL }) => {
  test.skip(process.env.E2E_ARISAN_PREVIEW !== "1", "Needs NEXT_PUBLIC_LOCAL_PREVIEW=1 on a separate local server");
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  await page.route("**/*", route => ["POST","PUT","PATCH","DELETE"].includes(route.request().method())
    ? route.fulfill({ status: 403, body: "External writes prohibited in local interaction QA" }) : route.continue());
  await page.emulateMedia({ reducedMotion: "reduce" });
});
async function create(page: Page) {
  await page.goto("/arisan/funding");
  await expect(page.getByText("Local interaction test only", { exact: true })).toBeVisible();
  await page.getByLabel("Room name", { exact: true }).fill("QA installment circle");
  await page.getByRole("button", { name: "Review room terms", exact: true }).click();
  await page.getByRole("button", { name: "Confirm room without deposit", exact: true }).click();
  await expect(page).toHaveURL(/\/arisan\/funding\/1$/);
  await expect(page.getByRole("heading", { name: "Your contribution", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start fully funded arisan", exact: true })).toBeDisabled();
}
async function actor(page: Page, value: number) {
  await page.getByRole("combobox", { name: "Try as member", exact: true }).selectOption(String(value));
  await expect(page.getByRole("button", { name: "Refresh verified state", exact: true })).toBeEnabled();
}
async function join(page: Page, value: number) {
  await actor(page,value);
  await page.goto("/arisan/funding");
  await page.getByLabel("Invite code", { exact: true }).fill("QA3222");
  await page.getByRole("button", { name: "Review invitation", exact: true }).click();
  await expect(page.getByText("0 XLM deposit", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Accept terms and join without deposit", exact: true }).click();
  await expect(page).toHaveURL(/\/arisan\/funding\/1$/);
  await expect(page.getByRole("heading", { name: "Your contribution", exact: true })).toBeVisible();
  const contributions = page.locator("section").filter({ has: page.getByRole("heading", { name: "Your contribution", exact: true }) });
  await expect(contributions.locator("dl")).toContainText("0 XLM");
  await expect(contributions.locator("dl")).toContainText("3 XLM");
}
async function deposit(page: Page, amount: string) {
  await page.getByLabel("Add any amount up to your remaining XLM", { exact: true }).fill(amount);
  await page.getByRole("button", { name: "Review contribution", exact: true }).click();
  await page.getByRole("button", { name: /^Confirm contribution of / }).click();
  await expect(page.getByText("Contribution completed locally. No tokens moved.", { exact: true })).toBeVisible();
}
for (const width of [320,390,1280]) test(`create and zero-funded room fit ${width}px`, async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", reason => errors.push(reason.message));
  page.on("console", message => { if (message.type()==="error") errors.push(message.text()); });
  await page.setViewportSize({ width, height: 844 });
  await create(page);
  await expect(page).toHaveTitle(/Arisan Installment Room/);
  await expect(page.getByText(/Application error:|Runtime Error|Build Error/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({ path: info.outputPath(`installments-${width}.png`), fullPage: true });
  await page.getByRole("heading", { name: "Your contribution", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(`contribution-${width}.png`), fullPage: true });
  expect(errors).toEqual([]);
});
test("join free, partial payments, three actors fully fund, Start and three simulated payouts", async ({ page }) => {
  const writes: string[] = [];
  const errors: string[] = [];
  page.on("request", request => { if (["POST","PUT","PATCH","DELETE"].includes(request.method())) writes.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  await create(page);
  await deposit(page,"0.5");
  const my = page.locator("section").filter({ has: page.getByRole("heading", { name: "Your contribution", exact: true }) });
  await expect(my.locator("dl")).toContainText("0.5 XLM");
  await expect(my.locator("dl")).toContainText("2.5 XLM");
  await expect(page.getByRole("button", { name: "Start fully funded arisan", exact: true })).toBeDisabled();
  await page.reload();
  await expect(my.locator("dl")).toContainText("0.5 XLM");
  await page.getByLabel("Add any amount up to your remaining XLM", { exact: true }).fill("2.5000001");
  await expect(page.getByRole("button", { name: "Review contribution", exact: true })).toBeDisabled();
  await join(page,1); await deposit(page,"3");
  await join(page,2); await deposit(page,"1"); await deposit(page,"2");
  await actor(page,0);
  await expect(page.getByRole("button", { name: "Start fully funded arisan", exact: true })).toBeDisabled();
  await deposit(page,"2.5");
  await expect(page.getByRole("button", { name: "Start fully funded arisan", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Start fully funded arisan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Round 1 of 3", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review contribution", exact: true })).toHaveCount(0);
  for (let index=0; index<3; index++) await page.getByRole("button", { name: "Simulate next payout locally", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Cycle completed", exact: true })).toBeVisible();
  const pool = page.locator("div").filter({ has: page.getByText("Room pool remaining", { exact: true }) }).filter({ has: page.getByText("0 XLM", { exact: true }) });
  expect(await pool.count()).toBeGreaterThan(0);
  expect(writes).toEqual([]); expect(errors).toEqual([]);
});
test("partial member exit refunds actual paid, expired funding blocks deposits and Start, cancel clears pool", async ({ page }) => {
  page.on("dialog", dialog => dialog.accept());
  await create(page); await deposit(page,"0.25");
  await join(page,1); await deposit(page,"0.1");
  await page.getByRole("button", { name: "Leave and refund 0.1 XLM", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your contribution", exact: true })).toHaveCount(0);
  await actor(page,0);
  await page.evaluate(() => {
    const key="salapi.preview.installments.v1";
    const value=JSON.parse(sessionStorage.getItem(key)!);
    value.rooms[0].fundingDeadline=Math.floor(Date.now()/1000)-1;
    sessionStorage.setItem(key,JSON.stringify(value));
  });
  await page.reload();
  await expect(page.getByText(/Funding is closed\. Do not send more/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Review contribution", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start fully funded arisan", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel room and refund contributions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Cancelled and refunded", exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("salapi.preview.installments.v1")!).rooms[0].paid)).toEqual({});
});

test("reminders are opt-in, persist for one wallet only, export a calendar and disappear when fully funded", async ({ page }) => {
  await create(page);
  const reminders = page.getByRole("region", { name: "Deposit reminders", exact: true });
  const checkbox = reminders.getByRole("checkbox");
  await expect(checkbox).toBeEnabled();
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(reminders.getByText(/Reminder: your remaining deposit is/)).toBeVisible();
  await page.reload();
  await expect(checkbox).toBeChecked();
  const downloaded = page.waitForEvent("download");
  await reminders.getByRole("button", { name: "Download calendar reminder", exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
  const contents = await readFile((await download.path())!, "utf8");
  expect(contents).toContain("BEGIN:VCALENDAR");
  expect(contents).toContain("BEGIN:VALARM");
  await expect(reminders.getByText(/no alert has been scheduled by Salapi/)).toBeVisible();
  await join(page, 1);
  await expect(checkbox).not.toBeChecked();
  await actor(page, 0);
  await expect(checkbox).toBeChecked();
  await deposit(page, "3");
  await expect(reminders).toHaveCount(0);
});
