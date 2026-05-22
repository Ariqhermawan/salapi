// Compact country flags as inline SVG. Flag emoji render as bare letters
// on Windows, so the language picker draws real flags instead. 3:2 ratio.

export type FlagCode = "gb" | "ph" | "id" | "vn";

export function Flag({ code, w = 26 }: { code: FlagCode; w?: number }) {
  const h = (w / 3) * 2;
  return (
    <svg
      viewBox="0 0 24 16"
      width={w}
      height={h}
      style={{ display: "block", borderRadius: 3 }}
      aria-hidden
    >
      {code === "id" && (
        <>
          <rect width="24" height="8" fill="#E70011" />
          <rect y="8" width="24" height="8" fill="#ffffff" />
        </>
      )}
      {code === "vn" && (
        <>
          <rect width="24" height="16" fill="#DA251D" />
          <path
            d="M12 3L13.12 6.46L16.76 6.45L13.81 8.59L14.94 12.05L12 9.9L9.06 12.05L10.19 8.59L7.24 6.45L10.88 6.46Z"
            fill="#FFFF00"
          />
        </>
      )}
      {code === "ph" && (
        <>
          <rect width="24" height="8" fill="#0038A8" />
          <rect y="8" width="24" height="8" fill="#CE1126" />
          <path d="M0 0L0 16L11 8Z" fill="#ffffff" />
          <circle cx="3.7" cy="8" r="1.8" fill="#FCD116" />
          <circle cx="2.3" cy="2.8" r="0.8" fill="#FCD116" />
          <circle cx="2.3" cy="13.2" r="0.8" fill="#FCD116" />
          <circle cx="8.7" cy="8" r="0.8" fill="#FCD116" />
        </>
      )}
      {code === "gb" && (
        <>
          <rect width="24" height="16" fill="#012169" />
          <path d="M0 0L24 16M24 0L0 16" stroke="#ffffff" strokeWidth="3.2" />
          <path d="M0 0L24 16M24 0L0 16" stroke="#C8102E" strokeWidth="1.6" />
          <path d="M12 0V16M0 8H24" stroke="#ffffff" strokeWidth="5" />
          <path d="M12 0V16M0 8H24" stroke="#C8102E" strokeWidth="3" />
        </>
      )}
    </svg>
  );
}
