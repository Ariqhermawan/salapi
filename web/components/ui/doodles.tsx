// Salapi — Learn doodles. Hand-drawn, single-weight line illustrations.
// Authored to the doodle brief (V4's learn.jsx referenced these but never
// shipped their definitions). Style: Ink line + one accent, rounded caps,
// slightly organic, calm. Server-safe pure SVG. Used ONLY in Learn.

import type { ReactNode } from "react";
import { T } from "@/lib/ui/tokens";

const g = (c: string, w: number) => ({
  fill: "none" as const,
  stroke: c,
  strokeWidth: w,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

// ── Spot doodles ───────────────────────────────────────────────────────────

export function DooCoin({ size = 42, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 1.7)}>
        <path d="M20 6 C12 6 6 11 6 20 C6 29 12 34 20 34 C28 34 34 29 34 20 C34 11 28 6 20 6 Z" />
        <path d="M17 14 L17 27" />
        <path d="M17 14 H22.5 a3.4 3.4 0 0 1 0 6.6 H17" />
        <path d="M14 18 H24" />
      </g>
      <g {...g(accent, 1.7)}>
        <path d="M28 9 q3 3 3 6" />
        <path d="M30.5 13 l2 -1" />
      </g>
    </svg>
  );
}

export function DooJar({ size = 42, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 40 44" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 1.7)}>
        <path d="M11 14 H29 a3 3 0 0 1 3 3 V36 a3 3 0 0 1 -3 3 H11 a3 3 0 0 1 -3 -3 V17 a3 3 0 0 1 3 -3 Z" />
        <path d="M9 14 Q9 9 14 9 H26 Q31 9 31 14" />
        <circle cx="16" cy="30" r="2.4" />
        <circle cx="23" cy="33" r="2.4" />
        <circle cx="20" cy="26" r="2.4" />
      </g>
      <g {...g(accent, 1.7)}>
        <path d="M20 2 V7" />
        <path d="M17 5 L20 8 L23 5" />
      </g>
    </svg>
  );
}

export function DooVault({ size = 42, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 1.7)}>
        <rect x="6" y="8" width="28" height="26" rx="3" />
        <path d="M11 34 L10 38 M29 34 L30 38" />
      </g>
      <g {...g(accent, 1.7)}>
        <circle cx="21" cy="21" r="6.5" />
        <path d="M21 14.5 V11 M21 27.5 V31 M27.5 21 H31 M14.5 21 H11" />
      </g>
    </svg>
  );
}

export function DooRails({ width = 56, accent = T.action, c = T.ink }: { width?: number; accent?: string; c?: string }) {
  return (
    <svg width={width} height={width * 0.6} viewBox="0 0 56 34" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 1.7)}>
        <path d="M3 12 Q28 8 53 12" />
        <path d="M3 22 Q28 18 53 22" />
        <path d="M11 10 L10 24 M22 9 L21.5 23 M34 9 L34 23 M45 10 L46 24" />
      </g>
      <g {...g(accent, 1.8)}>
        <circle cx="40" cy="9" r="4.4" />
        <path d="M48 6 h4 M48 10 h3" />
      </g>
    </svg>
  );
}

export function DooTent({ size = 42, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 1.7)}>
        <path d="M20 8 L5 32 H35 Z" />
        <path d="M20 8 L20 32" />
        <path d="M20 32 L15 24 L20 26 L25 24 Z" />
      </g>
      <g {...g(accent, 1.7)}>
        <path d="M20 8 V3 M20 4 H27 V8 H20" />
      </g>
    </svg>
  );
}

export function DooLedger({ size = 46, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 46 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 1.7)}>
        <path d="M23 9 Q15 5 6 7 V32 Q15 30 23 34 Q31 30 40 32 V7 Q31 5 23 9 Z" />
        <path d="M23 9 V34" />
        <path d="M10 14 H19 M10 19 H19 M27 14 H36 M27 19 H36" />
      </g>
      <g {...g(accent, 1.8)}>
        <path d="M28 25 l2.4 2.4 L35 23" />
      </g>
    </svg>
  );
}

export function DooMagnify({ size = 42, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 1.7)}>
        <circle cx="17" cy="17" r="11" />
        <path d="M25 25 L34 34" />
      </g>
      <g {...g(accent, 1.7)}>
        <path d="M12 18 H16 L19 13 L22 21 L24 17" />
      </g>
    </svg>
  );
}

export function DooPadlock({ size = 42, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 1.7)}>
        <rect x="9" y="18" width="22" height="16" rx="3" />
        <circle cx="20" cy="25" r="2.3" />
        <path d="M20 27 V30" />
      </g>
      <g {...g(accent, 1.7)}>
        <path d="M13 18 V14 a7 7 0 0 1 14 0 V18" />
      </g>
    </svg>
  );
}

export function DooSprout({ size = 42, accent = T.moneyIn, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 1.7)}>
        <path d="M10 30 H30 L28 36 H12 Z" />
        <path d="M20 28 V14" />
      </g>
      <g {...g(accent, 1.7)}>
        <path d="M20 18 Q13 17 11 11 Q18 10 20 17" />
        <path d="M20 21 Q27 19 29 13 Q22 12 20 20" />
      </g>
    </svg>
  );
}

export function DooCalendar({ size = 42, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 1.7)}>
        <rect x="7" y="9" width="26" height="24" rx="3" />
        <path d="M7 16 H33 M14 6 V12 M26 6 V12" />
      </g>
      <g {...g(accent, 1.8)}>
        <path d="M16 24 a4.5 4.5 0 1 1 1 4" />
        <path d="M15 21 L16 25 L20 24" />
      </g>
    </svg>
  );
}

export function DooHandshake({ size = 48, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 48 34" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 1.7)}>
        <path d="M4 14 L13 12 L21 17 L18 21 L13 18" />
        <path d="M44 14 L35 12 L27 17 L30 21 L35 18" />
        <path d="M21 17 Q24 15 27 17" />
      </g>
      <g {...g(accent, 1.7)}>
        <path d="M24 9 V4 M20 6 L24 3 L28 6" />
      </g>
    </svg>
  );
}

export function DooStorm({ size = 48, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 48 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 1.7)}>
        <path d="M13 20 a8 8 0 0 1 1 -15 a10 10 0 0 1 19 3 a6 6 0 0 1 1 12 Z" />
      </g>
      <g {...g(accent, 1.8)}>
        <path d="M15 26 L12 33 M24 26 L21 33 M33 26 L30 33" />
      </g>
    </svg>
  );
}

export function DooFlag({ size = 42, c = T.warn }: { size?: number; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 1.7)}>
        <path d="M12 6 V34" />
        <path d="M12 8 H30 L26 14 L30 20 H12" />
      </g>
    </svg>
  );
}

export function DooEyes({ width = 54, c = T.ink }: { width?: number; c?: string }) {
  return (
    <svg width={width} height={width * 0.5} viewBox="0 0 54 27" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 1.7)}>
        <path d="M4 14 Q14 5 24 14 Q14 23 4 14 Z" />
        <circle cx="14" cy="14" r="2.4" fill={c} stroke="none" />
        <path d="M30 14 Q40 5 50 14 Q40 23 30 14 Z" />
        <circle cx="40" cy="14" r="2.4" fill={c} stroke="none" />
      </g>
    </svg>
  );
}

export function DooStars({ width = 60, accent = T.action, c }: { width?: number; accent?: string; c?: string }) {
  const a = c ?? accent;
  return (
    <svg width={width} height={width * 0.5} viewBox="0 0 60 30" style={{ display: "block" }} aria-hidden>
      <g {...g(a, 1.6)}>
        <path d="M12 5 L13 10 L18 11 L13 12 L12 17 L11 12 L6 11 L11 10 Z" />
        <path d="M40 3 L40.7 6 L44 6.6 L40.7 7.2 L40 10 L39.3 7.2 L36 6.6 L39.3 6 Z" />
        <path d="M50 16 L51 21 L56 22 L51 23 L50 28 L49 23 L44 22 L49 21 Z" />
        <circle cx="26" cy="20" r="1.4" fill={a} stroke="none" />
        <circle cx="33" cy="13" r="1" fill={a} stroke="none" />
      </g>
    </svg>
  );
}

export function DooHandGive({ size = 42, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 1.7)}>
        <path d="M4 30 H14 L20 27 H27 a2.5 2.5 0 0 1 0 5 H19" />
        <path d="M4 26 V34" />
      </g>
      <g {...g(accent, 1.7)}>
        <circle cx="24" cy="13" r="6" />
        <path d="M22.5 10.5 V17 M22.5 10.5 H25.5 a1.7 1.7 0 0 1 0 3.3 H22.5" />
      </g>
    </svg>
  );
}

// ── spot() — name → element. Mirrors V4 learn.jsx's map. ─────────────────────
export function spot(
  name: string,
  { size = 42, accent = T.action }: { size?: number; accent?: string } = {}
): ReactNode {
  const map: Record<string, ReactNode> = {
    coin: <DooCoin size={size} accent={accent} />,
    jar: <DooJar size={size} accent={accent} />,
    vault: <DooVault size={size} accent={accent} />,
    rails: <DooRails width={size * 1.4} accent={accent} />,
    tent: <DooTent size={size} accent={accent} />,
    ledger: <DooLedger size={size * 1.1} accent={accent} />,
    magnify: <DooMagnify size={size} accent={accent} />,
    padlock: <DooPadlock size={size} accent={accent} />,
    sprout: <DooSprout size={size} accent={T.moneyIn} />,
    calendar: <DooCalendar size={size} accent={accent} />,
    handshake: <DooHandshake size={size * 1.15} accent={accent} />,
    storm: <DooStorm size={size * 1.15} accent={accent} />,
    flag: <DooFlag size={size} c={T.warn} />,
    eyes: <DooEyes width={size * 1.3} c={T.ink} />,
    stars: <DooStars width={size * 2} accent={accent} />,
    hand: <DooHandGive size={size} accent={accent} />,
  };
  return map[name] || null;
}

// ── Hero doodles — composed scenes, the emotional anchor per topic ───────────

export function HeroFund({ width = 300, c = T.ink, accent = T.action }: { width?: number; c?: string; accent?: string }) {
  return (
    <svg width={width} height={width * 0.6} viewBox="0 0 300 180" style={{ display: "block" }} aria-hidden>
      {/* faded "where did it go?" tangle — the old way */}
      <g {...g(c, 2)} opacity={0.18}>
        <path d="M28 44 q14 -14 26 2 q-18 8 -8 24 q16 6 6 22" />
        <path d="M40 30 l-10 -8 M26 36 l-12 2" />
      </g>
      {/* giving hand */}
      <g {...g(c, 2.4)}>
        <path d="M30 132 H62 L78 124 H96 a4 4 0 0 1 0 8 H72" />
        <path d="M30 126 V140" />
      </g>
      {/* the coin, travelling along the rail (accent) */}
      <g {...g(accent, 2.4)}>
        <path d="M96 122 Q150 86 214 104" />
        <circle cx="112" cy="106" r="8" />
        <path d="M109 102 V113 M109 102 H113 a2.4 2.4 0 0 1 0 4.8 H109" />
        <path d="M150 96 l3 -5 M178 92 l2 -5" />
      </g>
      {/* public glass vault/jar it lands in */}
      <g {...g(c, 2.4)}>
        <path d="M214 78 H266 a5 5 0 0 1 5 5 V150 a5 5 0 0 1 -5 5 H214 a5 5 0 0 1 -5 -5 V83 a5 5 0 0 1 5 -5 Z" />
        <path d="M206 78 Q206 66 220 66 H260 Q274 66 274 78" />
        <circle cx="228" cy="134" r="6" />
        <circle cx="248" cy="140" r="6" />
        <circle cx="240" cy="122" r="6" />
      </g>
      {/* watching eyes — accountability */}
      <g {...g(c, 2)}>
        <path d="M222 168 Q236 158 250 168 Q236 178 222 168 Z" />
        <circle cx="236" cy="168" r="2.6" fill={c} stroke="none" />
      </g>
    </svg>
  );
}

export function HeroCircle({ width = 300, c = T.ink, accent = T.action }: { width?: number; c?: string; accent?: string }) {
  const people = [
    { x: 150, y: 26 },
    { x: 250, y: 96 },
    { x: 150, y: 166 },
    { x: 50, y: 96 },
  ];
  return (
    <svg width={width} height={width * 0.6} viewBox="0 0 300 192" style={{ display: "block" }} aria-hidden>
      {/* rotation arrows around the ring */}
      <g {...g(accent, 2)}>
        <path d="M150 50 A 48 48 0 0 1 226 96" />
        <path d="M222 88 L227 97 L218 100" />
        <path d="M226 96 A 48 48 0 0 1 150 142" />
        <path d="M158 138 L149 143 L152 134" />
      </g>
      {/* the pot held by the contract — center */}
      <g {...g(c, 2.4)}>
        <path d="M134 92 H166 a3 3 0 0 1 3 3 V112 a3 3 0 0 1 -3 3 H134 a3 3 0 0 1 -3 -3 V95 a3 3 0 0 1 3 -3 Z" />
        <path d="M150 92 V84" />
      </g>
      <g {...g(accent, 2.2)}>
        <path d="M141 92 V87 a9 9 0 0 1 18 0 V92" />
      </g>
      {/* four people around */}
      {people.map((p, i) => (
        <g key={i} {...g(c, 2.4)}>
          <circle cx={p.x} cy={p.y} r="11" />
          <path d={`M${p.x - 16} ${p.y + 30} q16 -20 32 0`} />
        </g>
      ))}
    </svg>
  );
}

export function HeroGrow({ width = 300, c = T.ink, accent = T.action }: { width?: number; c?: string; accent?: string }) {
  return (
    <svg width={width} height={width * 0.6} viewBox="0 0 300 180" style={{ display: "block" }} aria-hidden>
      {/* subtle stellar constellation behind */}
      <g {...g(accent, 1.8)} opacity={0.5}>
        <path d="M40 30 L42 38 L50 40 L42 42 L40 50 L38 42 L30 40 L38 38 Z" />
        <path d="M250 24 L251 30 L257 31 L251 32 L250 38 L249 32 L243 31 L249 30 Z" />
        <circle cx="270" cy="70" r="2" fill={accent} stroke="none" />
        <circle cx="60" cy="64" r="1.6" fill={accent} stroke="none" />
      </g>
      {/* the vault */}
      <g {...g(c, 2.4)}>
        <rect x="96" y="92" width="108" height="74" rx="6" />
        <path d="M112 166 L109 178 M188 166 L191 178" />
        <circle cx="150" cy="129" r="13" />
        <path d="M150 116 V108 M150 142 V150 M163 129 H171 M137 129 H129" />
      </g>
      {/* the sprout growing up out of the vault (money-in green) */}
      <g {...g(T.moneyIn, 2.4)}>
        <path d="M150 92 V44" />
        <path d="M150 60 Q132 56 126 38 Q146 34 150 58" />
        <path d="M150 70 Q170 64 176 46 Q156 42 150 68" />
        <path d="M150 44 q-4 -6 0 -12 q4 6 0 12" />
      </g>
    </svg>
  );
}
