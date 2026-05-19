// Salapi — V4 brand primitives. Faithful port of salapi/brand.jsx.
// Real logomark (two parallel rails → S), the maker lockup, the Stellar
// kinship mark, and the testnet trust signals. Server-safe pure SVG/markup.
// MakerLockup is Title Case "Salapi by Catatu" per the product owner.

import { T } from "@/lib/ui/tokens";

export const GRAD = "linear-gradient(160deg, #2563EB 0%, #1D4ED8 55%, #0B1220 100%)";

// Primary symbol — "Invisible Rails": two parallel rounded strokes leaning
// forward, curling into an S / peso-in-motion.
export function SalapiMark({
  size = 64,
  c = "#fff",
  strokeRatio = 0.108,
}: {
  size?: number;
  c?: string;
  strokeRatio?: number;
}) {
  const s = size;
  const w = s * strokeRatio;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 40 40"
      fill="none"
      aria-label="Salapi"
      role="img"
      style={{ display: "block" }}
    >
      <g stroke={c} strokeWidth={(w * 40) / s} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M30.5 8 C 22 6, 13.5 8, 13.5 13 C 13.5 17.5, 25 18.5, 25 23 C 25 28, 17 30, 9 28" />
        <path d="M33 14.5 C 27.5 13, 21 14, 21 16.5 C 21 19, 29.5 20, 29.5 23" />
      </g>
    </svg>
  );
}

// Alternative concept — quiet ₱ roundel (kept on file; used by the mascot family).
export function SalapiMarkAlt({
  size = 64,
  c = "#fff",
  strokeRatio = 0.09,
}: {
  size?: number;
  c?: string;
  strokeRatio?: number;
}) {
  const s = size;
  const w = ((s * strokeRatio) * 40) / s;
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none" aria-label="Salapi" role="img" style={{ display: "block" }}>
      <g stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <circle cx="20" cy="20" r="14.5" />
        <path d="M15.5 13 L15.5 28" />
        <path d="M15.5 13 H22 a3.4 3.4 0 0 1 0 6.8 H15.5" />
        <path d="M13 17 H24" />
        <path d="M13 21.5 H22" />
      </g>
    </svg>
  );
}

// Lockup: mark tile + "Salapi." wordmark.
export function SalapiLockup({
  size = 24,
  c = T.ink,
  dot = T.action,
  gap = 10,
  markSize,
}: {
  size?: number;
  c?: string;
  dot?: string;
  gap?: number;
  markSize?: number;
}) {
  const m = markSize ?? size * 1.4;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap, color: c, fontFamily: T.fontSans }}>
      <span
        style={{
          width: m,
          height: m,
          borderRadius: m * 0.22,
          background: GRAD,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "0 0 auto",
        }}
      >
        <SalapiMark size={m * 0.62} c="#fff" />
      </span>
      <span style={{ fontWeight: 600, fontSize: size, letterSpacing: "-0.02em", lineHeight: 1 }}>
        Salapi<span style={{ color: dot }}>.</span>
      </span>
    </span>
  );
}

// "Salapi by Catatu" — quiet maker attribution. Always subordinate.
export function MakerLockup({ c = T.slate, size = 11 }: { c?: string; size?: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 6,
        fontFamily: T.fontSans,
        fontSize: size,
        color: c,
        letterSpacing: "0.01em",
      }}
    >
      <span style={{ fontWeight: 500 }}>Salapi</span>
      <span style={{ opacity: 0.55, fontWeight: 400 }}>by</span>
      <span style={{ fontWeight: 600 }}>Catatu</span>
    </span>
  );
}

// Stellar kinship mark — an ORIGINAL geometric symbol (a circle crossed by two
// transit arcs) that echoes Stellar's orbit motif so the "Powered by Stellar"
// pairing reads as family. This is intentionally NOT the trademarked Stellar
// logo: production should drop in Stellar's official brand-kit asset (licensed).
export function StellarMark({ size = 14, c = T.slate }: { size?: number; c?: string }) {
  const sw = Math.max(1, size * 0.085);
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-label="Stellar" role="img" style={{ display: "block" }}>
      <circle cx="10" cy="10" r="8.4" stroke={c} strokeWidth={sw} fill="none" />
      <path d="M2.6 12.4 Q10 8.6 17.4 7" stroke={c} strokeWidth={sw} strokeLinecap="round" />
      <path d="M2.6 13 Q10 11.4 17.4 13.6" stroke={c} strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}

// Official Stellar lockup (symbol + wordmark) from Stellar's brand kit,
// unmodified, used for sanctioned "Powered by Stellar" attribution. Black on
// light, white on dark, per Stellar brand guidelines.
export function PoweredByStellarV2({ c = T.slate, size = 11 }: { c?: string; size?: number }) {
  const onDark = typeof c === "string" && /255\s*,\s*255\s*,\s*255|#fff/i.test(c);
  const h = size + 5;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: c, fontSize: size, fontFamily: T.fontSans, letterSpacing: 0.02 }}>
      <span style={{ fontWeight: 400, opacity: 0.75 }}>Powered by</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={onDark ? "/stellar-white.png" : "/stellar.png"}
        alt="Stellar"
        height={h}
        style={{ height: h, width: "auto", display: "block" }}
      />
    </span>
  );
}

export function TestnetPillV2({ dark = false }: { dark?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 9px 3px 8px",
        borderRadius: 999,
        background: dark ? "rgba(180,83,9,0.18)" : T.warnTint,
        color: dark ? "#F0B26B" : T.warn,
        fontFamily: T.fontMono,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        boxShadow: dark ? "inset 0 0 0 1px rgba(180,83,9,0.35)" : "inset 0 0 0 1px rgba(180,83,9,0.18)",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 99, background: dark ? "#F0B26B" : T.warn }} />
      Testnet version
    </span>
  );
}

export function TestnetStrip({ dark = false }: { dark?: boolean }) {
  const fg = dark ? "#F0B26B" : T.warn;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        background: dark ? "rgba(180,83,9,0.14)" : T.warnTint,
        borderRadius: 10,
        boxShadow: dark ? "inset 0 0 0 1px rgba(180,83,9,0.30)" : "inset 0 0 0 1px rgba(180,83,9,0.22)",
        color: fg,
        fontFamily: T.fontSans,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 99, background: fg, flex: "0 0 auto" }} />
      <span style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase" }}>
        Testnet version
      </span>
      <span style={{ flex: 1, height: 1, background: fg, opacity: 0.2 }} />
      <span style={{ fontSize: 11.5, fontWeight: 500, opacity: 0.85, letterSpacing: "-0.005em" }}>
        Real funds arrive at mainnet launch.
      </span>
    </div>
  );
}
