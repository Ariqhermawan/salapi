// Salapi, Mascot. Faithful port of salapi/mascot.jsx (V4).
// Additive to the abstract mark, never replacing it. Derived from the ₱ roundel:
// a single-weight geometric coin-being. Used in Learn pages, empty/success
// states, never on money screens. Server-safe pure SVG.

const GRAD = "linear-gradient(160deg, #2563EB 0%, #1D4ED8 55%, #0B1220 100%)";

export type MascotPose = "wave" | "point" | "cheer" | "think";

export function SalapiMascot({
  size = 96,
  c = "#fff",
  pose = "wave",
  stroke = 0.085,
}: {
  size?: number;
  c?: string;
  pose?: MascotPose;
  stroke?: number;
}) {
  const sw = 40 * stroke; // viewBox-space stroke width
  const arms: Record<MascotPose, string[]> = {
    wave: ["M11 26 L9 30", "M30 17 L33 11"],
    point: ["M11 26 L9 30", "M30 22 L36 22", "M34 20 L36 22 L34 24"],
    cheer: ["M11 17 L8 11", "M29 17 L32 11"],
    think: ["M11 26 L9 30", "M29 22 L25 24"],
  };
  const mouth: Record<MascotPose, string> = {
    wave: "M17 25 Q20 27 23 25",
    point: "M17 25 H23",
    cheer: "M17 24 Q20 28 23 24",
    think: "M18 26 Q20 25 22 26",
  };
  const eyeY = pose === "think" ? 19.5 : 20;
  const eyeDot = 0.95;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-label={`Salapi mascot, ${pose}`}
      role="img"
      style={{ display: "block" }}
    >
      <g
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <circle cx="20" cy="22" r="11" />
        <path d="M17 14 L17 17.4" />
        <path d="M17 13.5 H18.6 a1.1 1.1 0 0 1 0 2.2 H17" />
        <path d="M15.6 14.6 H19" />
        <path d={mouth[pose] || mouth.wave} />
        {(arms[pose] || arms.wave).map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <circle cx="17.2" cy={eyeY} r={eyeDot} fill={c} />
      <circle cx="22.8" cy={eyeY} r={eyeDot} fill={c} />
    </svg>
  );
}

// Mascot inside the locked app-icon gradient, for Learn launcher icons.
export function MascotTile({
  size = 96,
  pose = "wave",
}: {
  size?: number;
  pose?: MascotPose;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: GRAD,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 8px 24px -8px rgba(37,99,235,.45)",
      }}
    >
      <SalapiMascot size={size * 0.66} c="#fff" pose={pose} />
    </div>
  );
}
