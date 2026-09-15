import { test, expect } from "@playwright/test";

test.describe("sign-in safety", () => {
  test.beforeEach(({ baseURL }) => {
    test.skip(!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL!).hostname),
      "This smoke test targets the local build without Supabase credentials");
  });

  test("does not pretend email sign-in succeeded when Supabase is absent", async ({ page }) => {
    await page.goto("/signin?next=%2Ftransparency");
    const email = page.getByRole("button", { name: "Use email instead", exact: true });
    await expect(email).toBeDisabled();
    await expect(page.getByText(/Sandbox sign-in seam/)).toBeVisible();
  });

  test("callback falls back to home for an external next URL", async ({ request, baseURL }) => {
    const response = await request.get("/auth/callback?next=%2F%2Fevil.example", {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe(`${baseURL}/`);
  });
});
