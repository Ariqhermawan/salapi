"use client";

// Compact, side-scrollable preview of the live Salapi Circles feed, surfaced
// inside the home VISION zone so the feed is visible without a tap. Reuses the
// real SEED_CIRCLES data and routes into the existing /circles preview screens.
//
// Build-Award scope: the parent home section is labelled VISION and the Circles
// showcase card directly above carries the PREVIEW badge, so every card here is
// already tiered as preview. Covers are gradients (no uploaded photos), matching
// the /circles Discover screen. Card heights are kept tight so the whole home
// stays close to one screen.

import { useRouter } from "next/navigation";
import { T } from "@/components/ui/kit";
import { useT } from "@/components/I18nProvider";
import { formatParts } from "@/lib/ui/currency";
import { SEED_CIRCLES } from "@/lib/circles/seed";
import { CATEGORY_LABEL, progressPct } from "@/lib/circles/types";

// A varied trio for the home teaser: one disaster, one medical, one education.
const FEATURED = ["tino-relief", "ate-mei-dialysis", "barangay-library"];

export default function CirclesHomeStrip() {
  const router = useRouter();
  const { t, currency } = useT();
  const circles = SEED_CIRCLES.filter((c) => FEATURED.includes(c.id));

  return (
    <div style={{ marginTop: 6 }}>
      <div
        className="sl-hscroll"
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          padding: "2px 2px 4px",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {circles.map((c) => {
          const pct = progressPct(c);
          const raised = formatParts(c.pesoRaised, currency);
          const [from, to] = c.coverGradient;
          return (
            <div
              key={c.id}
              onClick={() => router.push(`/circles/${c.id}`)}
              style={{
                flex: "0 0 auto",
                width: 190,
                cursor: "pointer",
                background: T.surface,
                borderRadius: 14,
                boxShadow: "inset 0 0 0 1px " + T.hairline,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: 62,
                  background: `linear-gradient(140deg, ${from} 0%, ${to} 100%)`,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "radial-gradient(120% 80% at 80% 20%, rgba(255,255,255,0.28), transparent 60%)",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    top: 7,
                    left: 7,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    padding: "3px 7px",
                    borderRadius: 99,
                    background: "rgba(11,18,32,0.55)",
                    color: "#fff",
                  }}
                >
                  {CATEGORY_LABEL[c.category]}
                </span>
              </div>
              <div style={{ padding: "9px 11px 10px" }}>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    lineHeight: 1.3,
                    color: T.ink,
                    height: 31,
                    overflow: "hidden",
                  }}
                >
                  {c.title}
                </div>
                <div
                  style={{
                    marginTop: 7,
                    height: 5,
                    borderRadius: 99,
                    background: T.hairline,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: pct + "%",
                      height: "100%",
                      background: T.moneyIn,
                      borderRadius: 99,
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: 5,
                    fontSize: 10.5,
                    color: T.slate,
                    fontWeight: 600,
                  }}
                >
                  {raised.symbol}
                  {raised.int} {t("home.disHeroRaised")} · {pct}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
