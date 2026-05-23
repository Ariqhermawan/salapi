"use client";

// Salapi design-system primitives, faithful port of salapi/primitives.jsx
// + tokens.jsx marks. Additive (does not touch components/ui/index.tsx).
// New screens compose THESE to match the Claude Design pixel language.

import type { CSSProperties, ReactNode } from "react";
import { T } from "@/lib/ui/tokens";
import { Ico } from "@/components/ui/icons";
import { useT } from "@/components/I18nProvider";
import { formatParts, formatUsdc } from "@/lib/ui/currency";
import {
  SalapiLockup,
  PoweredByStellarV2,
  TestnetPillV2,
} from "@/components/ui/brand";

export { T, Ico };
export {
  SalapiMark,
  SalapiMarkAlt,
  SalapiLockup,
  MakerLockup,
  StellarMark,
  PoweredByStellarV2,
  TestnetPillV2,
  TestnetStrip,
  GRAD,
} from "@/components/ui/brand";

// Brand wordmark, now the real mark + "Salapi." lockup (V4). Signature kept
// so every existing call site rolls forward unchanged.
export function Wordmark({ size = 22, c = T.ink, dot = T.action }: { size?: number; c?: string; dot?: string }) {
  return <SalapiLockup size={size} c={c} dot={dot} />;
}

// "Powered by Stellar", now uses the real Stellar kinship mark, not a sparkle.
export function PoweredByStellar({ c = T.slate, size = 11 }: { c?: string; size?: number }) {
  return <PoweredByStellarV2 c={c} size={size} />;
}

// "Testnet version" pill (V4).
export function TestnetPill() {
  return <TestnetPillV2 />;
}

export function IconButton({ children, onClick, size = 36, ariaLabel }: { children: ReactNode; onClick?: () => void; size?: number; ariaLabel?: string }) {
  // ariaLabel falls back to "button" so the Lighthouse button-name audit
  // never fails on an icon-only button; screens should pass a more
  // descriptive label (back / activity / settings / etc) when available.
  return (
    <button onClick={onClick} aria-label={ariaLabel ?? "button"} style={{ width: size, height: size, borderRadius: size / 2, border: "none", background: "rgba(11,18,32,.04)", color: T.ink, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </button>
  );
}

export function AppBar({ title, leading, trailing, sub, large = false }: { title?: ReactNode; leading?: ReactNode; trailing?: ReactNode; sub?: ReactNode; large?: boolean }) {
  return (
    <div style={{ padding: large ? "14px 20px 4px" : "8px 16px", display: "flex", flexDirection: "column", gap: large ? 8 : 0, background: T.canvas }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{leading}</div>
        {!large && <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{trailing}</div>
      </div>
      {large && (
        <div style={{ padding: "4px 4px 12px" }}>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{title}</div>
          {sub && <div style={{ marginTop: 4, fontSize: 13, color: T.slate }}>{sub}</div>}
        </div>
      )}
    </div>
  );
}

type BtnKind = "primary" | "secondary" | "ghost" | "success" | "danger" | "quiet";
export function Btn({ children, kind = "primary", size = "lg", full = true, leading, trailing, style = {}, onClick, disabled, loading, className }: { children: ReactNode; kind?: BtnKind; size?: "lg" | "md" | "sm"; full?: boolean; leading?: ReactNode; trailing?: ReactNode; style?: CSSProperties; onClick?: () => void; disabled?: boolean; loading?: boolean; className?: string }) {
  const h = size === "lg" ? 52 : size === "md" ? 44 : 36;
  const fs = size === "lg" ? 16 : size === "md" ? 15 : 14;
  const kinds: Record<BtnKind, CSSProperties> = {
    primary: { background: T.action, color: "#fff", boxShadow: "0 1px 2px rgba(11,18,32,.06), 0 6px 16px -6px rgba(37,99,235,.55)" },
    secondary: { background: T.surface, color: T.ink, boxShadow: "inset 0 0 0 1px " + T.hairline },
    ghost: { background: "transparent", color: T.ink },
    success: { background: T.moneyIn, color: "#fff" },
    danger: { background: T.danger, color: "#fff" },
    quiet: { background: T.actionTint, color: T.action },
  };
  return (
    <button className={className} onClick={onClick} disabled={disabled} style={{ height: h, padding: "0 18px", borderRadius: T.rCtrl, border: "none", fontFamily: T.fontSans, fontWeight: 600, fontSize: fs, letterSpacing: "-0.005em", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: full ? "100%" : "auto", cursor: "pointer", transition: "transform .12s, background .12s, box-shadow .12s", opacity: disabled ? 0.45 : 1, ...kinds[kind], ...style }}>
      {loading && <span className="sl-spin" style={{ width: 14, height: 14, borderRadius: 99, border: "2px solid currentColor", borderTopColor: "transparent" }} />}
      {!loading && leading}
      <span>{children}</span>
      {!loading && trailing}
    </button>
  );
}

export function Card({ children, p = 16, style = {}, onClick, hairline = true, elevation = false, className }: { children: ReactNode; p?: number; style?: CSSProperties; onClick?: () => void; hairline?: boolean; elevation?: boolean; className?: string }) {
  return (
    <div className={className} onClick={onClick} style={{ background: T.surface, borderRadius: T.rCard, padding: p, boxShadow: elevation ? T.shadow + (hairline ? ", inset 0 0 0 1px " + T.hairline : "") : hairline ? "inset 0 0 0 1px " + T.hairline : "none", ...style }}>
      {children}
    </div>
  );
}

export function Row({ leading, title, sub, trailing, onClick, divider = true, style = {} }: { leading?: ReactNode; title?: ReactNode; sub?: ReactNode; trailing?: ReactNode; onClick?: () => void; divider?: boolean; style?: CSSProperties }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: divider ? "1px solid " + T.hairline : "none", ...style }}>
      {leading && <div style={{ flex: "0 0 auto" }}>{leading}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.25, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: T.slate, marginTop: 2 }}>{sub}</div>}
      </div>
      {trailing && <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8 }}>{trailing}</div>}
    </div>
  );
}

export type Tab = { id: string; label: string; icon: (p?: { size?: number; c?: string }) => ReactNode; fab?: boolean };
export function TabBar({ active = "home", items, onNav }: { active?: string; items: Tab[]; onNav?: (id: string) => void }) {
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)", paddingTop: 8, background: T.surface, borderTop: "1px solid " + T.hairline, display: "grid", gridTemplateColumns: `repeat(${items.length},1fr)` }}>
      {items.map((it) => {
        const isActive = it.id === active;
        const col = isActive ? T.action : T.slate;
        if (it.fab) {
          return (
            <div key={it.id} onClick={() => onNav?.(it.id)} style={{ display: "flex", justifyContent: "center", alignItems: "center", position: "relative", height: 48, cursor: "pointer" }}>
              <div style={{ width: 56, height: 56, borderRadius: 18, position: "absolute", top: -14, background: T.action, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px -6px rgba(37,99,235,.6), 0 2px 6px rgba(11,18,32,.06)" }}>
                {it.icon({ size: 26, c: "#fff" })}
              </div>
            </div>
          );
        }
        return (
          <div key={it.id} onClick={() => onNav?.(it.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, height: 48, color: col, cursor: "pointer" }}>
            {it.icon({ size: 22, c: col })}
            <div style={{ fontSize: 10, fontWeight: isActive ? 600 : 500, letterSpacing: "0.02em" }}>{it.label}</div>
          </div>
        );
      })}
    </div>
  );
}

const AV_BG = ["#FDE6D9", "#DCEAF8", "#E8E3FA", "#DDF1E5", "#FBEAE0", "#E1ECF6"];
const AV_FG = ["#9C4221", "#2E5DA0", "#4C2F8A", "#1F6E48", "#9C5320", "#264965"];
export function Avatar({ name = "?", size = 36 }: { name?: string; size?: number }) {
  const idx = (name || "?").charCodeAt(0) % AV_BG.length;
  return (
    <div style={{ width: size, height: size, borderRadius: 99, background: AV_BG[idx], color: AV_FG[idx], display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: size * 0.42, fontFamily: T.fontSans, flex: "0 0 auto" }}>
      {(name || "?").trim().charAt(0).toUpperCase()}
    </div>
  );
}

export function Peso({ value = 0, size = 44, color, weight = 600, sign }: { value?: number; size?: number; color?: string; weight?: number; sign?: "+" | "-" }) {
  const { currency } = useT();
  const { symbol, int, dec, dp } = formatParts(value, currency);
  return (
    <span className="sl-balance" style={{ fontSize: size, fontWeight: weight, color: color ?? T.ink, letterSpacing: "-0.025em", display: "inline-flex", alignItems: "baseline", lineHeight: 1 }}>
      <span style={{ fontSize: size * 0.62, opacity: 0.7, marginRight: 2 }}>{sign === "+" ? "+" : sign === "-" ? "-" : ""}{symbol}</span>
      <span>{int}</span>
      {dp > 0 && <span style={{ fontSize: size * 0.5, opacity: 0.55 }}>.{dec || "".padEnd(dp, "0")}</span>}
    </span>
  );
}

// Locale-aware money: primary amount in the active locale's currency, with a
// small constant "≈ X USDC" beneath (the real rail). Drop-in for Peso.
export function Money({
  value = 0,
  size = 44,
  color,
  weight = 600,
  sign,
  usdc = true,
}: {
  value?: number;
  size?: number;
  color?: string;
  weight?: number;
  sign?: "+" | "-";
  usdc?: boolean;
}) {
  const { currency } = useT();
  const { symbol, int, dec, dp } = formatParts(value, currency);
  const light = typeof color === "string" && /#fff|255,\s*255,\s*255|white/i.test(color);
  const secondary = light ? "rgba(255,255,255,0.62)" : T.slate;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", lineHeight: 1 }}>
      <span className="sl-balance" style={{ fontSize: size, fontWeight: weight, color: color ?? T.ink, letterSpacing: "-0.025em", display: "inline-flex", alignItems: "baseline" }}>
        <span style={{ fontSize: size * 0.62, opacity: 0.7, marginRight: 2 }}>
          {sign === "+" ? "+" : sign === "-" ? "-" : ""}
          {symbol}
        </span>
        <span>{int}</span>
        {dp > 0 && <span style={{ fontSize: size * 0.5, opacity: 0.55 }}>.{dec || "".padEnd(dp, "0")}</span>}
      </span>
      {usdc && (
        <span style={{ marginTop: Math.max(3, size * 0.08), fontSize: Math.max(11, size * 0.3), fontWeight: 500, color: secondary, fontFamily: T.fontMono }}>
          ≈ {formatUsdc(value)}
        </span>
      )}
    </span>
  );
}

export function Progress({ pct = 0, h = 6, color = T.action }: { pct?: number; h?: number; color?: string }) {
  return (
    <div style={{ height: h, width: "100%", background: T.hairline, borderRadius: 99, overflow: "hidden" }}>
      <div style={{ width: Math.min(100, Math.max(0, pct)) + "%", height: "100%", background: color, borderRadius: 99, transition: "width .4s cubic-bezier(.2,.7,.3,1)" }} />
    </div>
  );
}

type ChipKind = "neutral" | "success" | "action" | "warn";
export function Chip({ children, kind = "neutral", size = "md", leading }: { children: ReactNode; kind?: ChipKind; size?: "sm" | "md"; leading?: ReactNode }) {
  const map: Record<ChipKind, { bg: string; fg: string }> = {
    neutral: { bg: T.hairline, fg: T.slate },
    success: { bg: T.moneyInTint, fg: T.moneyIn },
    action: { bg: T.actionTint, fg: T.action },
    warn: { bg: T.warnTint, fg: T.warn },
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: size === "sm" ? "3px 8px" : "5px 10px", borderRadius: 99, background: map[kind].bg, color: map[kind].fg, fontSize: size === "sm" ? 11 : 12, fontWeight: 600 }}>
      {leading}
      <span>{children}</span>
    </span>
  );
}

export function SheetHandle() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
      <div style={{ width: 36, height: 4, borderRadius: 99, background: "#D5D9E2" }} />
    </div>
  );
}
