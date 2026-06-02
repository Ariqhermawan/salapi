import { defineConfig } from "@playwright/test";

// E2E target:
//   - E2E_BASE_URL set  → test that URL (e.g. https://salapi.app for prod/preview)
//   - unset             → http://localhost:4747 (run `npm run build` then start
//                          `next start -p 4747` first; chosen port avoids the
//                          3000/3100 conflicts common on this machine)
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:4747";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    viewport: { width: 430, height: 900 },
    isMobile: true,
    hasTouch: true,
    trace: "retain-on-failure",
  },
});
