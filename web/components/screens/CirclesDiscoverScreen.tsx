"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * Salapi Circles — Discover screen (PREVIEW, Build-Award).
 *
 * SCOPE
 *   Salapi Circles is Build-Award vision, NOT day-30 on-chain scope. There is
 *   no new Soroban contract deployed for Circles. Every screen carries a
 *   visible "Preview, Build-Award" pill plus an info modal that points to
 *   SOW v2 Spotlight Section 7.
 *
 * DONATE FLOW CHOICE  (option b: WAITLIST)
 *   Per the task brief there are three acceptable donate-CTA patterns:
 *     a) Disabled state with a Build-Award tooltip.
 *     b) Donate flow that ends in waitlist signup.
 *     c) Route the donation through the existing Disaster Vault contract.
 *   We pick (b). It is the cleanest honest path: it shows the working flow
 *   (amount picker, method, toggles) without bouncing the user's money to a
 *   pool they did not intend, and without falsely claiming a Circles tx is
 *   on-chain. The optional Supabase table `circles_waitlist` captures emails
 *   so we can notify supporters at Build-Award launch. If Supabase is not
 *   configured the action gracefully degrades to a console log and still
 *   shows the success state to the user.
 *
 * CRYPTO INVISIBLE
 *   All amounts render via <Money /> + formatParts / formatUsdc helpers; the
 *   active locale's currency is what the user sees. No token name on surface.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Card,
  Btn,
  Chip,
  Progress,
  PoweredByStellar,
} from "@/components/ui/kit";
import { formatParts } from "@/lib/ui/currency";
import { useT } from "@/components/I18nProvider";
import PreviewBadge from "@/components/circles/PreviewBadge";
import {
  progressPct,
  type CircleCategory,
  type Circle,
  type DiscoverFilter,
} from "@/lib/circles/types";
import { SEED_CIRCLES } from "@/lib/circles/seed";

// Maps a CircleCategory / DiscoverFilter to its localized circles.* key.
const CATEGORY_KEY: Record<CircleCategory, string> = {
  disaster: "circles.catDisaster",
  medical: "circles.catMedical",
  education: "circles.catEducation",
  community: "circles.catCommunity",
  family: "circles.catFamily",
  creator: "circles.catCreator",
};
const FILTER_KEY: Record<DiscoverFilter, string> = {
  all: "circles.filterAll",
  trending: "circles.filterTrending",
  closeToGoal: "circles.filterCloseToGoal",
  justLaunched: "circles.filterJustLaunched",
};

function sortFor(filter: DiscoverFilter, circles: Circle[]): Circle[] {
  const arr = [...circles];
  if (filter === "trending") arr.sort((a, b) => b.donorCount - a.donorCount);
  else if (filter === "closeToGoal")
    arr.sort((a, b) => progressPct(b) - progressPct(a));
  else if (filter === "justLaunched")
    arr.sort((a, b) => b.daysRemaining - a.daysRemaining);
  return arr;
}

function CircleCard({ circle }: { circle: Circle }) {
  const router = useRouter();
  const { currency, t } = useT();
  const pct = progressPct(circle);
  const raised = formatParts(circle.pesoRaised, currency);
  const target = formatParts(circle.pesoTarget, currency);
  const [from, to] = circle.coverGradient;
  return (
    <Card
      p={0}
      style={{ overflow: "hidden", cursor: "pointer" }}
      onClick={() => router.push(`/circles/${circle.id}`)}
    >
      {/* Cover placeholder — gradient with a soft sparkle. Real images at
          Build-Award launch (upload + moderation pipeline). */}
      <div
        style={{
          height: 110,
          background: `linear-gradient(140deg, ${from} 0%, ${to} 100%)`,
          position: "relative",
          overflow: "hidden",
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
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            padding: "4px 9px",
            borderRadius: 99,
            background: "rgba(11,18,32,0.55)",
            color: "#fff",
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            backdropFilter: "blur(4px)",
          }}
        >
          {t(CATEGORY_KEY[circle.category])}
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 10,
            right: 10,
            padding: "4px 9px",
            borderRadius: 99,
            background: "rgba(255,255,255,0.85)",
            color: T.ink,
            fontSize: 11,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 99,
              background: circle.daysRemaining > 7 ? T.moneyIn : T.warn,
            }}
          />
          {circle.daysRemaining > 0
            ? t("circles.daysLeft", { n: circle.daysRemaining })
            : t("circles.closing")}
        </div>
      </div>
      <div style={{ padding: "12px 14px 14px" }}>
        <div
          style={{
            fontSize: 14.5,
            fontWeight: 600,
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
            color: T.ink,
          }}
        >
          {circle.title}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: 12,
            color: T.slate,
          }}
        >
          {t("circles.by", { name: circle.organizer })} · {circle.organizerLocation}
        </div>
        <div style={{ marginTop: 8 }}>
          <Progress pct={pct} h={6} />
          <div
            style={{
              marginTop: 6,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {raised.symbol}
              {raised.int}
              {raised.dp > 0 && (
                <span style={{ color: T.slate, fontWeight: 500 }}>
                  .{raised.dec}
                </span>
              )}{" "}
              <span style={{ color: T.slate, fontWeight: 500 }}>
                {t("circles.raisedOf", {
                  amount: `${target.symbol}${target.int}`,
                })}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: T.slate, fontWeight: 500 }}>
              {t("circles.donorsPct", { count: circle.donorCount, pct })}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function CirclesDiscoverScreen() {
  const router = useRouter();
  const { t } = useT();
  const [filter, setFilter] = useState<DiscoverFilter>("all");
  const visible = useMemo(() => sortFor(filter, SEED_CIRCLES), [filter]);
  const filters: DiscoverFilter[] = [
    "all",
    "trending",
    "closeToGoal",
    "justLaunched",
  ];

  return (
    <div
      style={{
        fontFamily: T.fontSans,
        color: T.ink,
        minHeight: "100%",
        paddingBottom: 110,
      }}
    >
      <AppBar
        leading={
          <IconButton onClick={() => router.push("/")}>
            {Ico.back({})}
          </IconButton>
        }
        title=""
        trailing={<PreviewBadge />}
      />

      {/* Hero: Spotlight Section 7 framing */}
      <div style={{ padding: "2px 16px 10px" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: T.warn,
          }}
        >
          {t("circles.visionEyebrow")}
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            marginTop: 4,
            lineHeight: 1.15,
          }}
        >
          {t("circles.discoverTitle")}
        </div>
        <div
          style={{
            fontSize: 13,
            color: T.slate,
            marginTop: 4,
            lineHeight: 1.5,
            maxWidth: 420,
          }}
        >
          {t("circles.discoverSub")}
        </div>
      </div>

      {/* The three differentiators */}
      <div style={{ padding: "0 16px 10px" }}>
        <Card p={0} style={{ overflow: "hidden" }}>
          {[
            {
              ico: Ico.shield,
              title: t("circles.diff1Title"),
              body: t("circles.diff1Body"),
            },
            {
              ico: Ico.globe,
              title: t("circles.diff2Title"),
              body: t("circles.diff2Body"),
            },
            {
              ico: Ico.verify,
              title: t("circles.diff3Title"),
              body: t("circles.diff3Body"),
            },
          ].map((row, i, arr) => (
            <div
              key={row.title}
              style={{
                display: "flex",
                gap: 10,
                padding: "10px 14px",
                borderBottom: i < arr.length - 1 ? "1px solid " + T.hairline : "none",
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  background: T.actionTint,
                  color: T.action,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "0 0 auto",
                }}
              >
                {row.ico({ size: 16, c: T.action })}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {row.title}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: T.slate,
                    lineHeight: 1.45,
                    marginTop: 1,
                  }}
                >
                  {row.body}
                </div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* Filter bar */}
      <div
        style={{
          padding: "6px 16px 12px",
          display: "flex",
          gap: 8,
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            style={{
              flex: "0 0 auto",
              padding: "8px 14px",
              borderRadius: 99,
              border: "none",
              cursor: "pointer",
              background: f === filter ? T.ink : T.surface,
              color: f === filter ? "#fff" : T.slate,
              fontSize: 12.5,
              fontWeight: 600,
              fontFamily: T.fontSans,
              letterSpacing: "-0.005em",
              boxShadow:
                f === filter
                  ? "0 1px 2px rgba(11,18,32,0.06)"
                  : "inset 0 0 0 1px " + T.hairline,
            }}
          >
            {t(FILTER_KEY[f])}
          </button>
        ))}
      </div>

      {/* Card list */}
      <div
        style={{
          padding: "0 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {visible.map((c) => (
          <CircleCard key={c.id} circle={c} />
        ))}
      </div>

      {/* Start your own */}
      <div style={{ padding: "12px 16px 0" }}>
        <Card
          p={14}
          style={{
            background: "linear-gradient(160deg, #fff 0%, #EFF4FE 110%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: T.action,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {Ico.plus({ c: "#fff", size: 20 })}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {t("circles.startOwnTitle")}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: T.slate,
                  marginTop: 1,
                  lineHeight: 1.4,
                }}
              >
                {t("circles.startOwnBody")}
              </div>
            </div>
            <Btn
              kind="primary"
              size="sm"
              full={false}
              onClick={() => router.push("/circles/create")}
              trailing={Ico.chev({ c: "#fff" })}
            >
              {t("circles.startOwnCta")}
            </Btn>
          </div>
        </Card>
      </div>

      {/* Honesty footer */}
      <div
        style={{
          padding: "14px 20px 0",
          textAlign: "center",
          fontSize: 11,
          color: T.slate,
          lineHeight: 1.5,
        }}
      >
        {t("circles.honestyFooter")}
      </div>
      <div
        style={{
          padding: "6px 16px 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Btn
          kind="ghost"
          size="sm"
          onClick={() => router.push("/transparency")}
        >
          {t("circles.seePrimitive")} →
        </Btn>
      </div>
      <div
        style={{
          padding: "10px 16px 0",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <PoweredByStellar />
      </div>
      {/* Honesty pill, in a centered padded container consistent with the
          footer elements above (PoweredByStellar, the ghost button). */}
      <div
        style={{
          padding: "12px 16px 0",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Chip kind="warn">
          <span style={{ marginRight: 2 }}>●</span> {t("circles.previewNotOnChain")}
        </Chip>
      </div>
    </div>
  );
}
