// Salapi design tokens, ported verbatim from the Claude Design delivery
// (salapi/tokens.jsx). Single source of truth for the design-system port.

// Mobile-first density scale. The whole app composes against these to keep
// every screen tight on iPhone 14 (390x844) without scroll. Tablet/desktop
// breakpoints relax the same scale upward in the screens that need it.
//
//  page         page padding L/R/T (the outer rhythm of any screen)
//  sectionGap   vertical space between two distinct sections
//  cardGap      vertical space between two cards in the same section
//  cardP        default internal padding of a Card
//  headBot      bottom margin under a section header
//  hero         hero amount font on mobile (the big number on send/topup/etc.)
//  title        screen H1 font on mobile
//  body         default body font on mobile
//  touch        minimum touch-target dimension (iOS HIG)
//
// Numbers here are documentation. Screen files still use bare numbers so the
// existing inline-style pattern stays uniform. Anything ≤4px off these values
// is treated as a regression.
export const S = {
  page: 16,
  pageTop: 12,
  sectionGap: 16,
  cardGap: 10,
  cardP: 14,
  headBot: 8,
  hero: 40,
  title: 22,
  body: 14,
  touch: 44,
} as const;

export const T = {
  ink: "var(--sl-ink)",
  ink80: "color-mix(in srgb, var(--sl-ink) 80%, transparent)",
  ink60: "color-mix(in srgb, var(--sl-ink) 60%, transparent)",
  slate: "var(--sl-sub)",
  hairline: "var(--sl-line)",
  canvas: "var(--sl-canvas)",
  surface: "var(--sl-surface)",
  surfaceAlt: "var(--sl-surface-alt)",
  action: "var(--sl-primary)",
  actionPress: "var(--sl-primary-pressed)",
  actionTint: "var(--sl-tint)",
  moneyIn: "var(--sl-success)",
  moneyInTint: "var(--sl-success-tint)",
  // warn was #B45309 — 4.48:1 on warnTint, below the 4.5 a11y bar for
  // small text. #92400E is amber-800, ~6.5:1 on the same tint, well over.
  warn: "var(--sl-warning)",
  warnTint: "var(--sl-warning-tint)",
  danger: "var(--sl-danger)",
  d_ink: "#F4F6FB",
  d_slate: "#9AA3B2",
  d_canvas: "#0A0F1A",
  d_surface: "#121826",
  d_hairline: "#1E2433",
  fontSans:
    "var(--font-geist-sans), system-ui, -apple-system, sans-serif",
  fontMono: "var(--font-geist-mono), ui-monospace, Menlo, monospace",
  fontUni: "var(--font-geist-sans), 'Noto Sans', system-ui, sans-serif",
  rCard: 20,
  rCtrl: 999,
  rPill: 999,
  shadow:
    "var(--sl-card-shadow)",
  shadowSm: "var(--sl-shadow-sm)",
} as const;

export type Tokens = typeof T;
