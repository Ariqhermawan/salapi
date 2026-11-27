"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import styles from "./PrototypeRoomFill.module.css";

type DoodleKind = "people" | "coins" | "vault";
const ART: Record<DoodleKind, { light: string; dark: string }> = {
  people: { light: "/prototype-causes/doodle-people.png", dark: "/prototype-causes/doodle-people-dark.png" },
  coins: { light: "/prototype-ui/doodle-coins.png", dark: "/prototype-ui/doodle-coins-dark.png" },
  vault: { light: "/prototype-ui/doodle-vault.png", dark: "/prototype-ui/doodle-vault-dark.png" },
};
const MIN = 130;
const MAX = 280;
const PAINTS = /^(IMG|svg|INPUT|TEXTAREA|BUTTON|SELECT|VIDEO|CANVAS)$/;

function kind(pathname: string): DoodleKind {
  if (/^\/(vault(?:\/|$)|ngo)/.test(pathname)) return "vault";
  if (/^\/(send|receive|topup|withdraw|donate|activity|notifications|manage\/[^/]+\/(goal|payout|release))/.test(pathname)) return "coins";
  return "people";
}

function paintedSpans(route: HTMLElement, fill: HTMLElement): [number, number][] {
  const box = route.getBoundingClientRect();
  const spans: [number, number][] = [];
  for (const el of route.querySelectorAll<HTMLElement>("*")) {
    if (fill.contains(el) || (el.closest("svg") && el.tagName !== "svg")) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    let paints = PAINTS.test(el.tagName) || [...el.childNodes].some(node => node.nodeType === 3 && node.textContent?.trim());
    if (!paints) {
      if (rect.height >= box.height * 0.6 && rect.width >= box.width * 0.9) continue;
      const css = getComputedStyle(el);
      paints = !/^(rgba\(0, 0, 0, 0\)|transparent)$/.test(css.backgroundColor)
        || css.backgroundImage !== "none" || css.boxShadow !== "none"
        || (parseFloat(css.borderTopWidth) > 0 && css.borderTopStyle !== "none");
    }
    if (paints && getComputedStyle(el).visibility !== "hidden") spans.push([rect.top, rect.bottom]);
  }
  return spans.sort((a, b) => a[0] - b[0]);
}

/** Mirrors the prototype's room-filling artwork in any unused 130px+ area. */
export default function PrototypeRoomFill() {
  const pathname = usePathname();
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const fill = ref.current;
    const screen = fill?.closest<HTMLElement>(".sl-main");
    const frame = fill?.closest<HTMLElement>(".sl-app-frame");
    const route = screen?.querySelector<HTMLElement>(":scope > .sl-state-enter");
    if (!fill || !screen || !frame || !route) return;

    let raf = 0;
    const fit = () => {
      raf = 0;
      fill.hidden = true;
      if (screen.scrollHeight > screen.clientHeight + 1) return;
      if (route.querySelector('[class*="roomDoodle"], [class*="shortDoodle"], [class*="successDoodle"]')
        || pathname === "/signin"
        || /^\/donate\/[^/]+\/review$/.test(pathname)) return;

      const box = screen.getBoundingClientRect();
      const scale = box.height / screen.offsetHeight || 1;
      const pinned = [...frame.querySelectorAll<HTMLElement>("#phone-layer > *, .sl-tabbar")]
        .map(el => el.getBoundingClientRect().top)
        .filter(y => y > box.top);
      const indicator = frame.querySelector<HTMLElement>(".sl-preview-home-indicator")?.getBoundingClientRect().top;
      const edge = pinned.length ? Math.min(...pinned) : indicator ?? box.bottom;
      const bottom = edge - 12 * scale;
      let end = box.top;
      let gap: [number, number] = [box.top, box.top];
      for (const [a, b] of paintedSpans(route, fill)) {
        const from = Math.min(a, bottom);
        if (from - end > gap[1] - gap[0]) gap = [end, from];
        if (b > end) end = Math.min(b, bottom);
      }
      if (bottom - end > gap[1] - gap[0]) gap = [end, bottom];

      const room = (gap[1] - gap[0]) / scale;
      if (room < MIN) return;
      const full = Math.floor(Math.min(MAX, screen.clientWidth - 64));
      const under = full + 32 > room && gap[1] >= bottom - 1;
      const side = under ? full : Math.floor(Math.min(full, room - 32));
      const y = (value: number) => (value - box.top) / scale + screen.scrollTop;
      const start = under ? y(gap[0]) + 16 : y((gap[0] + gap[1]) / 2) - side / 2;
      const fade = y(edge) - start;
      fill.style.width = `${side}px`;
      fill.style.height = `${under ? y(box.bottom) - start : side}px`;
      fill.style.left = `${(screen.clientWidth - side) / 2}px`;
      fill.style.top = `${start}px`;
      fill.style.maskImage = fill.style.webkitMaskImage = under
        ? `linear-gradient(to bottom, #000 ${Math.max(0, fade - Math.min(90, room / 2))}px, transparent ${fade + 14}px)`
        : "none";
      fill.hidden = false;
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(fit); };
    fit();
    const later = [window.setTimeout(schedule, 350), window.setTimeout(schedule, 1200)];
    const resize = new ResizeObserver(schedule);
    resize.observe(screen);
    const mutation = new MutationObserver(schedule);
    mutation.observe(route, { childList: true, subtree: true, characterData: true });
    return () => {
      later.forEach(window.clearTimeout);
      if (raf) cancelAnimationFrame(raf);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [pathname]);

  const doodle = ART[kind(pathname)];
  return <span ref={ref} className={styles.fill} aria-hidden="true" hidden>
    <img className={styles.light} src={doodle.light} alt="" />
    <img className={styles.dark} src={doodle.dark} alt="" />
  </span>;
}
