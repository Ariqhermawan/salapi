import { expect, type Locator, type Page } from "@playwright/test";
import type { HomeCauseCategory } from "../../lib/home-circles";
import type { Locale } from "../../lib/i18n/config";
import { circlesCategory, circlesCopy } from "../../lib/i18n/revamp-circles";
import { homeCatalogCopy } from "../../lib/i18n/revamp-home-catalog";

export async function chooseHomeCauseCategory(catalog: Locator, category: HomeCauseCategory, locale: Locale = "en") {
  const summary = catalog.locator("summary#home-cause-category");
  await expect(summary).toHaveAttribute("aria-disabled", "false");
  const disclosure = summary.locator("..");
  if (await disclosure.getAttribute("open") === null) await summary.click();
  const choices = catalog.getByRole("group", { name: circlesCopy(locale)("Example cause categories"), exact: true });
  await choices.getByRole("button", { name: category === "all" ? circlesCopy(locale)("All examples") : circlesCategory(locale, category), exact: true }).click();
  await expect(summary).toContainText(category === "all" ? homeCatalogCopy(locale, "All campaigns") : circlesCategory(locale, category));
  await expect(disclosure).not.toHaveAttribute("open", "");
}

/** The richer card may scroll, but controls must remain fully clear of Send. */
export async function expectHomeControlReachable(page: Page, control: Locator, label: string) {
  await expect(control, `${label} must remain rendered`).toBeVisible();
  await control.evaluate(element => element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
  const bounds = await page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>(".sl-app-frame")!;
    const main = document.querySelector<HTMLElement>("#app-content")!;
    const nav = document.querySelector<HTMLElement>(".sl-tabbar")!;
    const controls = [...nav.querySelectorAll("button,button span")].map(node => node.getBoundingClientRect()).filter(rect => rect.height > 0 && rect.width > 0);
    return {
      top: Math.max(0, frame.getBoundingClientRect().top, main.getBoundingClientRect().top),
      bottom: Math.min(innerHeight, frame.getBoundingClientRect().bottom, main.getBoundingClientRect().bottom, nav.getBoundingClientRect().top, ...controls.map(rect => rect.top)),
      left: Math.max(0, frame.getBoundingClientRect().left, main.getBoundingClientRect().left),
      right: Math.min(innerWidth, frame.getBoundingClientRect().right, main.getBoundingClientRect().right),
      documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
    };
  });
  const rect = await control.boundingBox();
  expect(rect, `${label} must have a rendered box`).not.toBeNull();
  expect(rect!.y, `${label} must remain below the main scrollport's top edge`).toBeGreaterThanOrEqual(bounds.top - 1);
  expect(rect!.y + rect!.height, `${label} must clear the persistent navigation`).toBeLessThanOrEqual(bounds.bottom + 1);
  expect(rect!.x, `${label} must remain inside the app's left edge`).toBeGreaterThanOrEqual(bounds.left - 1);
  expect(rect!.x + rect!.width, `${label} must remain inside the app's right edge`).toBeLessThanOrEqual(bounds.right + 1);
  expect(bounds.documentScrollTop, "The app scrollport, not document scrolling, must expose the control").toBe(0);
  expect(await control.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  }), `${label} must not be obstructed at its center`).toBe(true);
}
