// Salapi iconography — ported from the Claude Design delivery. 1.6 stroke,
// rounded caps. Server-safe pure SVG (usable in server or client components).

type P = { size?: number; c?: string };
const S = (n: number) => ({
  width: n,
  height: n,
  fill: "none" as const,
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const Ico = {
  arrowUp: ({ size = 20, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 20 20" stroke={c}><path d="M10 16V4M5 9l5-5 5 5" /></svg>
  ),
  arrowDown: ({ size = 20, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 20 20" stroke={c}><path d="M10 4v12M5 11l5 5 5-5" /></svg>
  ),
  send: ({ size = 20, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 20 20" stroke={c}><path d="M17 3L9 11M17 3l-5 14-3-6-6-3 14-5z" /></svg>
  ),
  plus: ({ size = 20, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 20 20" stroke={c}><path d="M10 4v12M4 10h12" /></svg>
  ),
  check: ({ size = 20, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 20 20" stroke={c}><path d="M4 10l4 4 8-8" /></svg>
  ),
  x: ({ size = 20, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 20 20" stroke={c}><path d="M5 5l10 10M15 5L5 15" /></svg>
  ),
  back: ({ size = 20, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 20 20" stroke={c}><path d="M12 4l-6 6 6 6" /></svg>
  ),
  chev: ({ size = 16, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 20 20" stroke={c} strokeWidth={1.8}><path d="M8 4l6 6-6 6" /></svg>
  ),
  home: ({ size = 22, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 24 24" stroke={c}><path d="M4 11l8-7 8 7M6 10v10h12V10" /></svg>
  ),
  vault: ({ size = 22, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 24 24" stroke={c}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="13" cy="12" r="3.2" /><path d="M13 8.8v-1M13 15.2v1M16.2 12h1M9.8 12h-1M5 8v8M5 12h2" /></svg>
  ),
  activity: ({ size = 22, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 24 24" stroke={c}><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>
  ),
  user: ({ size = 22, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 24 24" stroke={c}><circle cx="12" cy="9" r="3.4" /><path d="M5 20c1-3.5 4-5 7-5s6 1.5 7 5" /></svg>
  ),
  bell: ({ size = 20, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 24 24" stroke={c}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20a2 2 0 0 0 4 0" /></svg>
  ),
  qr: ({ size = 20, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 20 20" stroke={c}><rect x="3" y="3" width="5" height="5" rx="1" /><rect x="12" y="3" width="5" height="5" rx="1" /><rect x="3" y="12" width="5" height="5" rx="1" /><path d="M12 12h2v2M16 12v2M12 16h2M16 14v3" /></svg>
  ),
  shield: ({ size = 20, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 24 24" stroke={c}><path d="M12 3l8 3v6c0 4.5-3 8-8 9-5-1-8-4.5-8-9V6l8-3z" /><path d="M8.5 12l2.5 2.5L16 9.5" /></svg>
  ),
  globe: ({ size = 20, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 20 20" stroke={c}><circle cx="10" cy="10" r="7" /><path d="M3 10h14M10 3c2.5 2.5 2.5 11.5 0 14M10 3c-2.5 2.5-2.5 11.5 0 14" /></svg>
  ),
  search: ({ size = 20, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 20 20" stroke={c}><circle cx="9" cy="9" r="5.5" /><path d="M13 13l4 4" /></svg>
  ),
  refresh: ({ size = 20, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 20 20" stroke={c}><path d="M3 10a7 7 0 0 1 12-5l2 2M17 4v3h-3M17 10a7 7 0 0 1-12 5l-2-2M3 16v-3h3" /></svg>
  ),
  wifi: ({ size = 20, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 20 20" stroke={c}><path d="M2 7c5-4 11-4 16 0M4 10c3.5-3 8.5-3 12 0M7 13c1.5-1.4 4.5-1 6 0" /><circle cx="10" cy="16" r="1" fill={c} /></svg>
  ),
  lock: ({ size = 20, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 20 20" stroke={c}><rect x="4" y="9" width="12" height="8" rx="2" /><path d="M7 9V6a3 3 0 0 1 6 0v3" /></svg>
  ),
  verify: ({ size = 16, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 20 20" stroke={c}><path d="M10 2l2 1.6 2.5-.6.6 2.5L17 7l-1.4 2.2.6 2.5-2.5.6L12 14l-2-1.4-2 1.4-1.6-2.2-2.5-.6.6-2.5L3 7l1.5-1.5.6-2.5L7.6 3.6 10 2z" /><path d="M7 9l2 2 4-4" /></svg>
  ),
  link: ({ size = 16, c = "currentColor" }: P = {}) => (
    <svg {...S(size)} viewBox="0 0 20 20" stroke={c}><path d="M9 11l-2 2a3 3 0 1 1-4-4l2-2M11 9l2-2a3 3 0 1 1 4 4l-2 2M7.5 12.5l5-5" /></svg>
  ),
  star: ({ size = 14, c = "currentColor" }: P = {}) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={c}><path d="M10 1l2.7 5.5 6 .9-4.4 4.2 1.05 6L10 14.8 4.7 17.6l1.05-6L1.3 7.4l6-.9L10 1z" /></svg>
  ),
  sparkle: ({ size = 14, c = "currentColor" }: P = {}) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={c}><path d="M10 1 L11 9 L19 10 L11 11 L10 19 L9 11 L1 10 L9 9 Z" /></svg>
  ),
};

export type IcoName = keyof typeof Ico;
