"use client";

// Shared honesty marker for every Salapi Circles screen (stage 1).
// A persistent "Preview, Build-Award" pill with a tappable info icon. Tapping
// opens the SAME stage explainer modal that the Stage 2 pill uses, so a
// reviewer reading either pill gets the full day-30 / stage 1 / stage 2 map.
// The pill itself stays orange (visually distinct from the ink-dark Stage 2
// pill) but the explainer copy lives in one place.

import { useState } from "react";
import { T } from "@/components/ui/kit";
import { StageExplainerModalShared } from "@/components/ui/OperationalAllowanceExplainer";

export default function PreviewBadge() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="More info about Build-Award"
        style={{
          display: "inline-flex",
          alignItems: "center",
          // gap:10 between dot, text, and icon gives the info icon clear
          // breathing room from the word "Build-Award" so it never reads as a
          // letter ("Awardi"). The icon also has its own ring + heavier bg.
          gap: 10,
          padding: "5px 8px 5px 12px",
          borderRadius: 999,
          background: T.warnTint,
          color: T.warn,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          border: "1px solid " + T.warnTint,
          cursor: "pointer",
          fontFamily: T.fontSans,
          minHeight: 26, // tap target stays >= 24x24
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: 99,
            background: T.warn,
          }}
        />
        Preview, Build-Award
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 18,
            height: 18,
            borderRadius: 99,
            background: "rgba(255,255,255,0.85)",
            color: T.warn,
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontStyle: "italic",
            lineHeight: 1,
            boxShadow: "inset 0 0 0 1.5px " + T.warn,
          }}
        >
          i
        </span>
      </button>
      <StageExplainerModalShared open={open} onClose={() => setOpen(false)} />
    </>
  );
}
