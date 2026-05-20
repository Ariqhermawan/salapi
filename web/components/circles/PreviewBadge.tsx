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
        aria-label="About Salapi Circles preview"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 11px 5px 12px",
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
        }}
      >
        <span
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
            width: 14,
            height: 14,
            borderRadius: 99,
            background: "rgba(180,83,9,0.18)",
            color: T.warn,
            fontSize: 10,
            fontWeight: 700,
            marginLeft: 2,
          }}
        >
          i
        </span>
      </button>
      <StageExplainerModalShared open={open} onClose={() => setOpen(false)} />
    </>
  );
}
