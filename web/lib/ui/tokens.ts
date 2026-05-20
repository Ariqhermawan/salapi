// Salapi design tokens, ported verbatim from the Claude Design delivery
// (salapi/tokens.jsx). Single source of truth for the design-system port.

export const T = {
  ink: "#0B1220",
  ink80: "rgba(11,18,32,0.80)",
  ink60: "rgba(11,18,32,0.60)",
  slate: "#5B6472",
  hairline: "#E6E8EE",
  canvas: "#F4F6FB",
  surface: "#FFFFFF",
  surfaceAlt: "#FAFBFD",
  action: "#2563EB",
  actionPress: "#1D4ED8",
  actionTint: "#EFF4FE",
  moneyIn: "#059669",
  moneyInTint: "#E6F6EF",
  warn: "#B45309",
  warnTint: "#FBF1E0",
  danger: "#B91C1C",
  d_ink: "#F4F6FB",
  d_slate: "#9AA3B2",
  d_canvas: "#0A0F1A",
  d_surface: "#121826",
  d_hairline: "#1E2433",
  fontSans:
    "var(--font-geist-sans), system-ui, -apple-system, sans-serif",
  fontMono: "var(--font-geist-mono), ui-monospace, Menlo, monospace",
  fontUni: "var(--font-geist-sans), 'Noto Sans', system-ui, sans-serif",
  rCard: 16,
  rCtrl: 12,
  rPill: 999,
  shadow:
    "0 1px 2px rgba(11,18,32,0.04), 0 8px 24px -8px rgba(11,18,32,0.10)",
  shadowSm: "0 1px 2px rgba(11,18,32,0.05)",
} as const;

export type Tokens = typeof T;
