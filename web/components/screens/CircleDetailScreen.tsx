"use client";

// Salapi Circles — Circle detail screen (PREVIEW, Build-Award).
// Story / Recent / Transparency tabs. The Donate CTA routes to the
// /circles/[id]/donate waitlist flow (option b). No on-chain transfer is made
// from this screen; the transparency tab honestly says receipts will appear
// at Build-Award launch and links to the live Disaster Vault as proof of the
// same on-chain primitive working today.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Card,
  Btn,
  Chip,
  Avatar,
  Progress,
  PoweredByStellar,
} from "@/components/ui/kit";
import { formatParts } from "@/lib/ui/currency";
import { useT } from "@/components/I18nProvider";
import PreviewBadge from "@/components/circles/PreviewBadge";
import {
  CATEGORY_LABEL,
  progressPct,
  type Circle,
} from "@/lib/circles/types";

type Tab = "story" | "recent" | "transparency";

export default function CircleDetailScreen({ circle }: { circle: Circle }) {
  const router = useRouter();
  const { locale } = useT();
  const [tab, setTab] = useState<Tab>("story");

  const pct = progressPct(circle);
  const raised = formatParts(circle.pesoRaised, locale);
  const target = formatParts(circle.pesoTarget, locale);
  const [from, to] = circle.coverGradient;

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
          <IconButton onClick={() => router.push("/circles")}>
            {Ico.back({})}
          </IconButton>
        }
        title=""
        trailing={<PreviewBadge />}
      />

      {/* Cover */}
      <div
        style={{
          margin: "4px 16px 0",
          borderRadius: 18,
          overflow: "hidden",
          height: 168,
          background: `linear-gradient(140deg, ${from} 0%, ${to} 100%)`,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(120% 80% at 80% 20%, rgba(255,255,255,0.32), transparent 60%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            padding: "5px 10px",
            borderRadius: 99,
            background: "rgba(11,18,32,0.55)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {CATEGORY_LABEL[circle.category]}
        </div>
      </div>

      <div style={{ padding: "16px 20px 0" }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          {circle.title}
        </div>
        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Avatar name={circle.organizer} size={32} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {circle.organizer}
            </div>
            <div style={{ fontSize: 11.5, color: T.slate }}>
              {circle.organizerLocation} · organizer
            </div>
          </div>
          <span style={{ marginLeft: "auto" }}>
            <Chip kind="action" leading={Ico.verify({ size: 11, c: T.action })}>
              Verified at launch
            </Chip>
          </span>
        </div>
      </div>

      {/* Progress card */}
      <div style={{ padding: "16px 16px 0" }}>
        <Card>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: T.slate,
                }}
              >
                Raised so far
              </div>
              <div style={{ marginTop: 4, fontSize: 22, fontWeight: 600 }}>
                {raised.symbol}
                {raised.int}
                {raised.dp > 0 && (
                  <span style={{ color: T.slate, fontWeight: 500 }}>
                    .{raised.dec}
                  </span>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: T.slate,
                }}
              >
                Goal
              </div>
              <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600 }}>
                {target.symbol}
                {target.int}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <Progress pct={pct} h={7} />
          </div>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: T.slate,
            }}
          >
            <span>{circle.donorCount} donors · {pct}%</span>
            <span>
              {circle.daysRemaining > 0
                ? `${circle.daysRemaining} days left`
                : "Closing soon"}
            </span>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div
        style={{
          padding: "16px 16px 0",
          display: "flex",
          gap: 4,
          borderBottom: "1px solid " + T.hairline,
          marginTop: 4,
        }}
      >
        {(["story", "recent", "transparency"] as Tab[]).map((id) => {
          const label =
            id === "story" ? "Story" : id === "recent" ? "Recent" : "Transparency";
          const active = id === tab;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                flex: 1,
                padding: "10px 12px",
                border: "none",
                background: "transparent",
                color: active ? T.ink : T.slate,
                fontFamily: T.fontSans,
                fontWeight: 600,
                fontSize: 13,
                borderBottom: active ? "2px solid " + T.action : "2px solid transparent",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "story" && (
        <div style={{ padding: "16px 20px 0" }}>
          {circle.story.split("\n\n").map((para, i) => (
            <p
              key={i}
              style={{
                fontSize: 14.5,
                lineHeight: 1.65,
                color: T.ink,
                marginBottom: 12,
              }}
            >
              {para}
            </p>
          ))}
        </div>
      )}

      {tab === "recent" && (
        <div style={{ padding: "16px 16px 0" }}>
          <Card p={0}>
            {circle.recentDonations.map((d, i, arr) => {
              const amt = formatParts(d.pesoAmount, locale);
              return (
                <div
                  key={d.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    borderBottom: i < arr.length - 1 ? "1px solid " + T.hairline : "none",
                  }}
                >
                  <Avatar name={d.donorLabel} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {d.donorLabel}{" "}
                      <span
                        style={{
                          color: T.slate,
                          fontWeight: 500,
                          fontSize: 12,
                        }}
                      >
                        · {d.whenLabel}
                      </span>
                    </div>
                    {d.note && (
                      <div
                        style={{
                          fontSize: 12.5,
                          color: T.slate,
                          marginTop: 3,
                          lineHeight: 1.45,
                        }}
                      >
                        &ldquo;{d.note}&rdquo;
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: T.action,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {amt.symbol}
                    {amt.int}
                    {amt.dp > 0 && (
                      <span style={{ color: T.slate, fontWeight: 500 }}>
                        .{amt.dec}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
          <div
            style={{
              marginTop: 12,
              fontSize: 11.5,
              color: T.slate,
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            Preview seed data. Real donor feed appears here at Build-Award
            launch, each entry linked to its on-chain receipt.
          </div>
        </div>
      )}

      {tab === "transparency" && (
        <div style={{ padding: "16px 16px 0" }}>
          <Card>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: T.warnTint,
                  color: T.warn,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {Ico.shield({ size: 16, c: T.warn })}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                On-chain receipts arrive at Build-Award launch
              </div>
            </div>
            <p
              style={{
                fontSize: 13,
                color: T.slate,
                lineHeight: 1.55,
                margin: "6px 0 0",
              }}
            >
              On-chain receipts will appear here at Build-Award launch (the same
              on-chain receipt mechanism that powers Disaster Vault today).
              Every contribution and disbursement will be a public Stellar
              transaction, independently verifiable on stellar.expert.
            </p>
            <div
              style={{
                marginTop: 14,
                padding: "12px 14px",
                borderRadius: 12,
                background: T.canvas,
                fontSize: 12.5,
                color: T.slate,
                lineHeight: 1.5,
              }}
            >
              The Disaster Vault is the live primitive Salapi Circles is built
              on. It runs the same contribute / public-receipt mechanism today,
              already on Stellar testnet.
            </div>
            <div style={{ marginTop: 12 }}>
              <Btn
                kind="secondary"
                size="md"
                onClick={() => router.push("/transparency")}
                trailing={Ico.chev({ c: T.ink })}
              >
                Open the Disaster Vault (live on testnet)
              </Btn>
            </div>
          </Card>
        </div>
      )}

      {/* Donate CTA - in-flow, anchored inside the phone-frame so it does
          not overlap BottomNav (which sits at the bottom of the same frame).
          A fixed-position CTA would float at the viewport bottom on desktop
          (outside the app shell) and collide with BottomNav on mobile. */}
      <div style={{ padding: "24px 16px 0" }}>
        <Btn
          kind="primary"
          leading={Ico.shield({ c: "#fff" })}
          onClick={() => router.push(`/circles/${circle.id}/donate`)}
        >
          Donate to this circle
        </Btn>
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: T.slate,
            textAlign: "center",
            lineHeight: 1.45,
          }}
        >
          Preview - your pledge joins the launch waitlist; no charge today.
        </div>
      </div>

      <div
        style={{
          padding: "22px 16px 0",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <PoweredByStellar />
      </div>
    </div>
  );
}
