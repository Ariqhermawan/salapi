// Salapi — Learn doodles (v2, "Patient Line"). Hand-drawn single-weight line
// illustrations, richer composition per the concept direction. Strict palette:
// Ink line + one Action-blue accent, emerald only for growth, warn only for
// the testnet flag. Server-safe pure SVG. Exports & signatures unchanged so
// the Learn screens keep working.

import type { ReactNode } from "react";
import { T } from "@/lib/ui/tokens";

const g = (c: string, w: number) => ({
  fill: "none" as const,
  stroke: c,
  strokeWidth: w,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

// Minimal coin-being mascot (matches mascot.tsx) — used inside heroes.
function Mascot({ x = 0, y = 0, s = 1, pose = "wave", c = T.ink }: { x?: number; y?: number; s?: number; pose?: "wave" | "point" | "cheer"; c?: string }) {
  const arms: Record<string, string[]> = {
    wave: ["M11 26 L9 30", "M30 17 L33 11"],
    point: ["M11 26 L9 30", "M30 22 L36 22", "M34 20 L36 22 L34 24"],
    cheer: ["M11 17 L8 11", "M29 17 L32 11"],
  };
  const mouth: Record<string, string> = {
    wave: "M17 25 Q20 27 23 25",
    point: "M17 25 H23",
    cheer: "M17 24 Q20 28 23 24",
  };
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g {...g(c, 3)}>
        <circle cx="20" cy="22" r="11" />
        <path d="M17 14 L17 17.4" />
        <path d="M17 13.5 H18.6 a1.1 1.1 0 0 1 0 2.2 H17" />
        <path d="M15.6 14.6 H19" />
        <path d={mouth[pose]} />
        {arms[pose].map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <circle cx="17.2" cy="20" r="1.05" fill={c} />
      <circle cx="22.8" cy="20" r="1.05" fill={c} />
    </g>
  );
}

// ── Spot doodles ───────────────────────────────────────────────────────────

export function DooCoin({ size = 42, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 2.6)}>
        <path d="M20 6 C12 6 6 11 6 20 C6 29 12 34 20 34 C28 34 34 29 34 20 C34 11 28 6 20 6 Z" />
        <path d="M17 14 V27 M17 14 H22.5 a3.4 3.4 0 0 1 0 6.6 H17 M14 18 H24" />
      </g>
      <g {...g(accent, 2.6)}>
        <path d="M28 9 q3.4 3 3 6.4" />
      </g>
    </svg>
  );
}

export function DooJar({ size = 42, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 40 44" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 2.6)}>
        <path d="M11 15 H29 a3 3 0 0 1 3 3 V36 a3 3 0 0 1 -3 3 H11 a3 3 0 0 1 -3 -3 V18 a3 3 0 0 1 3 -3 Z" />
        <path d="M9 15 Q9 9.5 14.5 9.5 H25.5 Q31 9.5 31 15" />
        <circle cx="16" cy="31" r="2.6" />
        <circle cx="23.5" cy="33.5" r="2.6" />
        <circle cx="20" cy="26.5" r="2.6" />
      </g>
      <g {...g(accent, 2.6)}>
        <path d="M20 2.5 V7.5 M16.6 5 L20 8.4 L23.4 5" />
      </g>
    </svg>
  );
}

export function DooVault({ size = 42, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 2.6)}>
        <rect x="6" y="8" width="28" height="25" rx="3.5" />
        <path d="M11 33 L10 38 M29 33 L30 38" />
      </g>
      <g {...g(accent, 2.6)}>
        <circle cx="20.5" cy="20.5" r="6.5" />
        <path d="M20.5 14 V11 M20.5 27 V30 M27 20.5 H30 M14 20.5 H11" />
      </g>
    </svg>
  );
}

export function DooRails({ width = 56, accent = T.action, c = T.ink }: { width?: number; accent?: string; c?: string }) {
  return (
    <svg width={width} height={width * 0.6} viewBox="0 0 56 34" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 2.4)}>
        <path d="M3 12 Q28 7 53 12 M3 22 Q28 17 53 22" />
        <path d="M11 10 L10 24 M22 9 L21.5 23 M34 9 L34 23 M45 10 L46 24" />
      </g>
      <g {...g(accent, 2.6)}>
        <circle cx="40" cy="9" r="4.6" />
      </g>
    </svg>
  );
}

export function DooTent({ size = 42, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 2.6)}>
        <path d="M20 8 L5 32 H35 Z M20 8 V32 M20 32 L15 24 L20 26 L25 24 Z" />
      </g>
      <g {...g(accent, 2.6)}>
        <path d="M20 8 V3 M20 4 H27 V8 H20" />
      </g>
    </svg>
  );
}

export function DooLedger({ size = 46, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 46 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 2.6)}>
        <path d="M23 9 Q15 5 6 7 V32 Q15 30 23 34 Q31 30 40 32 V7 Q31 5 23 9 Z M23 9 V34" />
        <path d="M10 14 H19 M10 19 H19 M27 14 H36" />
      </g>
      <g {...g(accent, 2.8)}>
        <path d="M27 25 l3 3 L36 22" />
      </g>
    </svg>
  );
}

export function DooMagnify({ size = 42, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 2.6)}>
        <circle cx="17" cy="17" r="11" />
        <path d="M25 25 L34 34" />
      </g>
      <g {...g(accent, 2.6)}>
        <path d="M12 18 H16 L19 12.5 L22 21.5 L24 17 H26" />
      </g>
    </svg>
  );
}

export function DooPadlock({ size = 42, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 2.6)}>
        <rect x="9" y="18" width="22" height="16" rx="3.5" />
        <circle cx="20" cy="25" r="2.4" />
        <path d="M20 27 V30" />
      </g>
      <g {...g(accent, 2.6)}>
        <path d="M13 18 V14 a7 7 0 0 1 14 0 V18" />
      </g>
    </svg>
  );
}

export function DooSprout({ size = 42, accent = T.moneyIn, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 2.6)}>
        <path d="M10 30 H30 L28 36 H12 Z M20 28 V14" />
      </g>
      <g {...g(accent, 2.6)}>
        <path d="M20 19 Q12.5 17.5 10.5 10.5 Q18.5 9.5 20 17.5" />
        <path d="M20 22 Q27.5 20 29.5 13 Q21.5 11.5 20 20" />
      </g>
    </svg>
  );
}

export function DooCalendar({ size = 42, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 2.6)}>
        <rect x="7" y="9" width="26" height="24" rx="3.5" />
        <path d="M7 16 H33 M14 6 V12 M26 6 V12" />
      </g>
      <g {...g(accent, 2.8)}>
        <path d="M15.5 24 a4.8 4.8 0 1 1 1.4 4.2" />
        <path d="M14.5 20.5 L15.8 25 L20 24" />
      </g>
    </svg>
  );
}

export function DooHandshake({ size = 48, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 48 34" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 2.6)}>
        <path d="M4 14 L13 12 L21 17 L18 21 L13 18" />
        <path d="M44 14 L35 12 L27 17 L30 21 L35 18" />
        <path d="M21 17 Q24 15 27 17" />
      </g>
      <g {...g(accent, 2.6)}>
        <path d="M24 9 V4 M20 6 L24 3 L28 6" />
      </g>
    </svg>
  );
}

export function DooStorm({ size = 48, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 48 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 2.6)}>
        <path d="M13 21 a8 8 0 0 1 1 -15.5 a10 10 0 0 1 19.5 3 a6 6 0 0 1 1 12.5 Z" />
      </g>
      <g {...g(accent, 2.8)}>
        <path d="M15 27 L12 34 M24 27 L21 34 M33 27 L30 34" />
      </g>
    </svg>
  );
}

export function DooFlag({ size = 42, c = T.warn }: { size?: number; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 2.6)}>
        <path d="M12 6 V34 M12 8 H30 L26 14 L30 20 H12" />
      </g>
    </svg>
  );
}

export function DooEyes({ width = 54, c = T.ink }: { width?: number; c?: string }) {
  return (
    <svg width={width} height={width * 0.5} viewBox="0 0 54 27" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 2.4)}>
        <path d="M4 14 Q14 5 24 14 Q14 23 4 14 Z" />
        <path d="M30 14 Q40 5 50 14 Q40 23 30 14 Z" />
      </g>
      <circle cx="14" cy="14" r="2.6" fill={c} />
      <circle cx="40" cy="14" r="2.6" fill={c} />
    </svg>
  );
}

export function DooStars({ width = 60, accent = T.action, c }: { width?: number; accent?: string; c?: string }) {
  const a = c ?? accent;
  return (
    <svg width={width} height={width * 0.5} viewBox="0 0 60 30" style={{ display: "block" }} aria-hidden>
      <g {...g(a, 2)}>
        <path d="M12 4 L13.4 9.4 L18.8 10.8 L13.4 12.2 L12 17.6 L10.6 12.2 L5.2 10.8 L10.6 9.4 Z" />
        <path d="M41 3 L41.9 6.6 L45.5 7.5 L41.9 8.4 L41 12 L40.1 8.4 L36.5 7.5 L40.1 6.6 Z" />
      </g>
      <circle cx="51" cy="20" r="1.6" fill={a} />
      <circle cx="27" cy="22" r="1.3" fill={a} />
    </svg>
  );
}

export function DooHandGive({ size = 42, accent = T.action, c = T.ink }: { size?: number; accent?: string; c?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block" }} aria-hidden>
      <g {...g(c, 2.6)}>
        <path d="M4 30 H14 L20 27 H27 a2.6 2.6 0 0 1 0 5.2 H19" />
        <path d="M4 26 V34" />
      </g>
      <g {...g(accent, 2.6)}>
        <circle cx="24" cy="13" r="6.2" />
        <path d="M22.4 10.4 V17 M22.4 10.4 H25.6 a1.8 1.8 0 0 1 0 3.5 H22.4" />
      </g>
    </svg>
  );
}

// ── spot() — name → element. Mirrors the original map (unchanged API). ───────
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

// ── Hero doodles — composed scenes (the "Patient Line" direction) ────────────
// viewBox 0 0 300 186; rendered at width≈260 (article banner) and 78 (thumb).

export function HeroFund({ width = 300, c = T.ink, accent = T.action }: { width?: number; c?: string; accent?: string }) {
  return (
    <svg width={width} height={Math.round(width * 0.62)} viewBox="0 0 300 186" style={{ display: "block" }} aria-hidden>
      {/* faded "old opaque way" — crossed-out tangle + ? */}
      <g {...g(c, 2.6)} opacity={0.16}>
        <path d="M30 40 q14 -16 27 3 q-18 10 -6 25 q16 8 4 23" />
        <path d="M22 30 l34 40 M56 30 l-34 40" />
      </g>
      <text x="40" y="34" fontSize="20" fontWeight="700" fill={c} fillOpacity={0.2}>?</text>

      {/* giving hand */}
      <g {...g(c, 3.2)}>
        <path d="M16 132 H78 L100 120 H128 a6 6 0 0 1 0 12 H104" />
        <path d="M16 124 V140" />
      </g>

      {/* coin on a clear single rail (accent) into the jar */}
      <g {...g(accent, 3.2)}>
        <path d="M128 116 C 162 70, 200 50, 244 46" />
        <circle cx="150" cy="84" r="10" />
        <path d="M180 64 l4 -8 M210 52 l3 -7" />
      </g>

      {/* public glass jar (transparent, coins visible) */}
      <g {...g(c, 3.2)}>
        <path d="M214 44 H266 a8 8 0 0 1 8 8 V128 a8 8 0 0 1 -8 8 H214 a8 8 0 0 1 -8 -8 V52 a8 8 0 0 1 8 -8 Z" />
        <path d="M200 44 Q200 28 224 28 H256 Q280 28 280 44" />
      </g>
      <g {...g(c, 2.6)}>
        <circle cx="228" cy="118" r="9" />
        <circle cx="256" cy="122" r="9" />
        <circle cx="244" cy="100" r="9" />
        <path d="M225 113 V123 M225 113 H230 a2.6 2.6 0 0 1 0 5 H225" />
      </g>

      {/* watching eyes — accountability */}
      <g {...g(c, 2.6)}>
        <path d="M218 160 Q234 147 250 160 Q234 173 218 160 Z" />
        <path d="M256 160 Q272 147 288 160 Q272 173 256 160 Z" />
      </g>
      <circle cx="234" cy="160" r="3" fill={c} />
      <circle cx="272" cy="160" r="3" fill={c} />

      <Mascot x={70} y={138} s={1.05} pose="point" c={c} />
    </svg>
  );
}

export function HeroCircle({ width = 300, c = T.ink, accent = T.action }: { width?: number; c?: string; accent?: string }) {
  const ppl = [
    { x: 150, y: 30 },
    { x: 248, y: 96 },
    { x: 150, y: 162 },
    { x: 52, y: 96 },
  ];
  return (
    <svg width={width} height={Math.round(width * 0.62)} viewBox="0 0 300 186" style={{ display: "block" }} aria-hidden>
      <circle cx="150" cy="96" r="70" {...g(c, 2)} strokeDasharray="2 11" strokeOpacity={0.3} />

      {/* rotation arrows */}
      <g {...g(accent, 2.8)}>
        <path d="M150 26 A 70 70 0 0 1 220 96" />
        <path d="M214 84 L222 97 L207 100" />
        <path d="M220 96 A 70 70 0 0 1 150 166" />
        <path d="M163 160 L150 168 L153 153" />
      </g>

      {/* four people */}
      <g {...g(c, 3.2)}>
        {ppl.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="13" />
            <path d={`M${p.x - 19} ${p.y + 31} q19 -22 38 0`} />
          </g>
        ))}
      </g>

      {/* pot held by the contract padlock, centre */}
      <g {...g(c, 3.2)}>
        <path d="M132 100 H168 a3 3 0 0 1 3 3 V122 a3 3 0 0 1 -3 3 H132 a3 3 0 0 1 -3 -3 V103 a3 3 0 0 1 3 -3 Z" />
        <path d="M150 100 V92" />
      </g>
      <g {...g(accent, 3)}>
        <path d="M140 100 V93 a10 10 0 0 1 20 0 V100" />
        <circle cx="150" cy="112" r="3.4" />
      </g>

      <Mascot x={232} y={140} s={1} pose="wave" c={c} />
    </svg>
  );
}

export function HeroGrow({ width = 300, c = T.ink, accent = T.action }: { width?: number; c?: string; accent?: string }) {
  return (
    <svg width={width} height={Math.round(width * 0.62)} viewBox="0 0 300 186" style={{ display: "block" }} aria-hidden>
      {/* faint Stellar orbit + sparkles, behind */}
      <g {...g(accent, 2.4)} opacity={0.4}>
        <circle cx="150" cy="74" r="52" />
        <path d="M102 60 L198 86 M104 72 L196 98" />
        <path d="M70 36 l1.6 5 l5 1.6 l-5 1.6 l-1.6 5 l-1.6 -5 l-5 -1.6 l5 -1.6 z" />
        <path d="M232 50 l1.4 4.4 l4.4 1.4 l-4.4 1.4 l-1.4 4.4 l-1.4 -4.4 l-4.4 -1.4 l4.4 -1.4 z" />
      </g>

      {/* vault */}
      <g {...g(c, 3.2)}>
        <rect x="106" y="112" width="88" height="56" rx="7" />
        <path d="M118 168 L115 180 M182 168 L185 180" />
        <circle cx="150" cy="140" r="11" />
        <path d="M150 129 V123 M150 151 V157 M161 140 H167 M139 140 H133" />
      </g>

      {/* sprout growing up out of the vault (emerald) */}
      <g {...g(T.moneyIn, 3.2)}>
        <path d="M150 112 V58" />
        <path d="M150 84 Q124 78 116 52 Q142 46 150 78" />
        <path d="M150 96 Q176 90 184 64 Q158 58 150 90" />
        <path d="M150 58 q-5 -8 0 -15 q5 8 0 15" />
        <path d="M146 45 H149 a2.4 2.4 0 0 1 0 5 H146" />
      </g>

      <Mascot x={234} y={140} s={1} pose="cheer" c={c} />
    </svg>
  );
}
