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
  CATEGORY_LABEL,
  DISCOVER_FILTER_LABEL,
  progressPct,
  type Circle,
  type DiscoverFilter,
} from "@/lib/circles/types";
import { SEED_CIRCLES } from "@/lib/circles/seed";

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
  const { locale } = useT();
  const pct = progressPct(circle);
  const raised = formatParts(circle.pesoRaised, locale);
  const target = formatParts(circle.pesoTarget, locale);
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
          height: 132,
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
          {CATEGORY_LABEL[circle.category]}
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
            ? `${circle.daysRemaining} days left`
            : "Closing"}
        </div>
      </div>
      <div style={{ padding: "14px 16px 16px" }}>
        <div
          style={{
            fontSize: 15.5,
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
            marginTop: 4,
            fontSize: 12,
            color: T.slate,
          }}
        >
          by {circle.organizer} · {circle.organizerLocation}
        </div>
        <div style={{ marginTop: 12 }}>
          <Progress pct={pct} h={6} />
          <div
            style={{
              marginTop: 8,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>
              {raised.symbol}
              {raised.int}
              {raised.dp > 0 && (
                <span style={{ color: T.slate, fontWeight: 500 }}>
                  .{raised.dec}
                </span>
              )}{" "}
              <span style={{ color: T.slate, fontWeight: 500 }}>
                of {target.symbol}
                {target.int}
              </span>
            </div>
            <div style={{ fontSize: 12, color: T.slate, fontWeight: 500 }}>
              {circle.donorCount} donors · {pct}%
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function CirclesDiscoverScreen() {
  const router = useRouter();
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
      <div style={{ padding: "4px 20px 16px" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: T.warn,
          }}
        >
          Build-Award vision
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            marginTop: 6,
            lineHeight: 1.15,
          }}
        >
          Salapi Circles
        </div>
        <div
          style={{
            fontSize: 14,
            color: T.slate,
            marginTop: 8,
            lineHeight: 1.55,
            maxWidth: 420,
          }}
        >
          Open community fund-raising on transparent rails. The Disaster Vault
          primitive, opened to any cause from any trusted person. Borderless by
          one Google login.
        </div>
      </div>

      {/* The three differentiators */}
      <div style={{ padding: "0 16px 14px" }}>
        <Card p={0} style={{ overflow: "hidden" }}>
          {[
            {
              ico: Ico.shield,
              title: "Trust in the contract, not the brand",
              body: "Every peso held on Stellar. Receipts anyone can audit at Build-Award launch.",
            },
            {
              ico: Ico.globe,
              title: "Borderless by one Google login",
              body: "PH and ID diaspora send home $53B+ a year. One rail. No FX queue, no bank gate.",
            },
            {
              ico: Ico.verify,
              title: "Never monetize generosity",
              body: "Salapi charges a flat rail fee, not a percentage of the cause. Creators keep more.",
            },
          ].map((row, i, arr) => (
            <div
              key={row.title}
              style={{
                display: "flex",
                gap: 12,
                padding: "12px 16px",
                borderBottom: i < arr.length - 1 ? "1px solid " + T.hairline : "none",
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: T.actionTint,
                  color: T.action,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "0 0 auto",
                }}
              >
                {row.ico({ size: 18, c: T.action })}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {row.title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: T.slate,
                    lineHeight: 1.5,
                    marginTop: 2,
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
            {DISCOVER_FILTER_LABEL[f]}
          </button>
        ))}
      </div>

      {/* Card list */}
      <div
        style={{
          padding: "0 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {visible.map((c) => (
          <CircleCard key={c.id} circle={c} />
        ))}
      </div>

      {/* Start your own */}
      <div style={{ padding: "18px 16px 0" }}>
        <Card
          style={{
            background: "linear-gradient(160deg, #fff 0%, #EFF4FE 110%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: T.action,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {Ico.plus({ c: "#fff", size: 22 })}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                Start your own circle
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: T.slate,
                  marginTop: 2,
                  lineHeight: 1.4,
                }}
              >
                Set a goal, share the link, get receipts at launch.
              </div>
            </div>
            <Btn
              kind="primary"
              size="sm"
              full={false}
              onClick={() => router.push("/circles/create")}
              trailing={Ico.chev({ c: "#fff" })}
            >
              Begin
            </Btn>
          </div>
        </Card>
      </div>

      {/* Honesty footer */}
      <div
        style={{
          padding: "22px 24px 0",
          textAlign: "center",
          fontSize: 11,
          color: T.slate,
          lineHeight: 1.6,
        }}
      >
        Day-30 ships the Disaster Vault live on Stellar testnet. Salapi
        Circles ships at Build-Award. See SOW v2 Spotlight Section 7.
      </div>
      <div
        style={{
          padding: "10px 16px 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Btn
          kind="ghost"
          size="sm"
          onClick={() => router.push("/transparency")}
        >
          See the live primitive: Disaster Vault →
        </Btn>
      </div>
      <div
        style={{
          padding: "16px 16px 0",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <PoweredByStellar />
      </div>
      <div style={{ height: 12 }} />
      <Chip kind="warn">
        <span style={{ marginRight: 2 }}>●</span> Preview - not on-chain yet
      </Chip>
    </div>
  );
}
