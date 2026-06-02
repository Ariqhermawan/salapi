import { test, expect } from "@playwright/test";

// The baseline security headers + the Content-Security-Policy must be present
// on the document response.
test("security headers + CSP present on /", async ({ request, baseURL }) => {
  const resp = await request.get(baseURL! + "/");
  const h = resp.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["strict-transport-security"]).toContain("max-age=");

  const csp = h["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("connect-src 'self' https://*.supabase.co");
});
