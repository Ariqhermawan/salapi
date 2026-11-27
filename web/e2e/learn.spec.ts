import { test, expect } from "@playwright/test";

const translations = [
  { locale: "en", link: "Read donation guide", quorum: "Two of three wallets must approve the same document" },
  { locale: "tl", link: "Basahin ang donation guide", quorum: "Dalawa sa tatlong wallet ang mag-aapruba sa parehong dokumento" },
  { locale: "id", link: "Baca panduan donasi", quorum: "Dua dari tiga wallet harus menyetujui dokumen yang sama" },
  { locale: "vi", link: "Đọc hướng dẫn quyên góp", quorum: "Hai trong ba ví phải duyệt cùng tài liệu" },
];

test.beforeEach(({ baseURL }) => {
  test.skip(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL!).hostname),
    "Learn browser cases run against the isolated local build");
});

test("Learn keeps the prototype accordion and opens the current donation guide in all supported locales", async ({ page }) => {
  await page.goto("/learn");
  await expect(page.locator("details")).toHaveCount(5);
  const language = page.getByRole("combobox");

  for (const { locale, link, quorum } of translations) {
    await language.selectOption(locale);
    await expect.poll(() => page.locator("html").getAttribute("lang")).toBe(locale);
    await page.locator("details").first().getByRole("button", { name: link, exact: true }).click();
    await expect(page).toHaveURL(/\/learn\/fund$/);
    await expect(page.locator("p").filter({ hasText: quorum }).first()).toBeVisible();
    await page.goto("/learn");
  }

  await expect(page.getByText(/at least three/i)).toHaveCount(0);
  await expect(page.getByText(/up to 25%/i)).toHaveCount(0);
  await language.selectOption("en");
  await expect.poll(() => page.locator("html").getAttribute("lang")).toBe("en");
  await page.locator("details").nth(1).locator("summary").click();
  await expect(page.getByText(/campaign donations do not automatically send 1%/i)).toBeVisible();
});

test("unknown Learn topics return 404, and guest Terms state the active D3 rules", async ({ page }) => {
  const missing = await page.goto("/learn/not-a-real-topic");
  expect(missing?.status()).toBe(404);

  await page.goto("/terms");
  await expect(page.getByText(/campaign donations do not automatically send a percentage/i)).toBeVisible();
  await expect(page.getByText(/rolling 24-hour cap of 20% of the current balance/i)).toBeVisible();
  await expect(page.getByText(/informational draft/i)).toBeVisible();
  await expect(page.getByText(/25%/i)).toHaveCount(0);

  await page.goto("/docs#rules");
  await expect(page.getByText(/D4 campaign donations do not automatically send a percentage into D3/i)).toBeVisible();
  await expect(page.getByText(/rolling 24-hour limit of 20% of the current balance/i)).toBeVisible();
});
