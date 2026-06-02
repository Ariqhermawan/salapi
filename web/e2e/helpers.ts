import type { Page } from "@playwright/test";

// Collect any console / page error that looks like a Content-Security-Policy
// violation. With the app's CSP (script/style 'unsafe-inline'), there should be
// ZERO — a non-empty list means the CSP is blocking a real asset/connection and
// the policy needs a missing origin added.
export function collectCspViolations(page: Page): string[] {
  const hits: string[] = [];
  const rx = /content security policy|refused to (load|execute|apply|connect|frame)/i;
  page.on("console", (m) => {
    if (m.type() === "error" && rx.test(m.text())) hits.push(m.text());
  });
  page.on("pageerror", (e) => {
    const s = String(e);
    if (rx.test(s)) hits.push(s);
  });
  return hits;
}
