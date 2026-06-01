"use client";

// Salapi Circles — Circle detail screen (PREVIEW, Build-Award), V10 revamp.
// Immersive photo hero (title overlaid), face avatars, green progress, and a
// trust-chip strip — consistent with the photo-forward home. Story / Recent /
// Transparency tabs. The Donate CTA routes to the /circles/[id]/donate waitlist
// flow; no on-chain transfer is made here. The transparency tab honestly says
// receipts arrive at Build-Award launch and links to the live Disaster Vault as
// proof of the same on-chain primitive working today.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  T,
  Ico,
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
  Stage2Pill,
  WhyExistsLink,
} from "@/components/ui/OperationalAllowanceExplainer";
import {
  progressPct,
  type CircleCategory,
  type Circle,
} from "@/lib/circles/types";
import { localePreviewSplit } from "@/lib/circles/allowance";
import type { KycTier } from "@/lib/circles/allowance";

const CATEGORY_KEY: Record<CircleCategory, string> = {
  disaster: "circles.catDisaster",
  medical: "circles.catMedical",
  education: "circles.catEducation",
  community: "circles.catCommunity",
  family: "circles.catFamily",
  creator: "circles.catCreator",
};
const TIER_KEY: Record<KycTier, string> = {
  0: "circles.tier0",
  1: "circles.tier1",
  2: "circles.tier2",
};

// Owned cause photography by category. Categories without a fitting photo fall
// back to the circle's brand gradient cover.
const CATEGORY_PHOTO: Partial<Record<CircleCategory, string>> = {
  disaster: "/circles/disaster.jpg",
  medical: "/circles/medical.jpg",
  education: "/circles/education.jpg",
};
// A curated organizer face for the individual-led demo circles; group/handle
// organizers keep the neutral initial avatar.
const ORGANIZER_FACE: Record<string, number> = {
  "tino-relief": 1,
  "ate-mei-dialysis": 4,
};

type Tab = "story" | "recent" | "transparency";

function FaceAvatar({ n, size = 32, ring }: { n: number; size?: number; ring?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/circles/face-${n}.png`}
      alt=""
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: 99,
        objectFit: "cover",
        flex: "0 0 auto",
        border: ring ? `2px solid ${ring}` : "none",
        boxShadow: "0 1px 2px rgba(11,18,32,.18)",
      }}
    />
  );
}

const isAnon = (label: string) => /anon/i.test(label);

export default function CircleDetailScreen({ circle }: { circle: Circle }) {
  const router = useRouter();
  const { currency, t } = useT();
  const [tab, setTab] = useState<Tab>("story");

  const pct = progressPct(circle);
  const raised = formatParts(circle.pesoRaised, currency);
  const target = formatParts(circle.pesoTarget, currency);
  const [from, to] = circle.coverGradient;
  const allowance = circle.allowance;
  const allowancePct = allowance?.percentage ?? 0;
  const hasAllowance = allowancePct > 0;
  const preview = localePreviewSplit(currency, allowancePct);

  const heroPhoto = CATEGORY_PHOTO[circle.category];
  const organizerFace = ORGANIZER_FACE[circle.id];
  const beneficiaryChip = hasAllowance
    ? t("circles.beneficiaryPct", { pct: 100 - allowancePct })
    : t("circles.fullToBeneficiaryStrong").replace(/[.。]\s*$/, "");

  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%", paddingBottom: 0 }}>
      {/* Immersive photo hero — back + preview pill overlaid, title on the photo */}
      <div style={{ position: "relative", height: 232, overflow: "hidden" }}>
        {heroPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroPhoto} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(140deg, ${from} 0%, ${to} 100%)` }} />
        )}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(7,12,22,.45) 0%, rgba(7,12,22,0) 24%, rgba(7,12,22,0) 40%, rgba(7,12,22,.88) 100%)",
          }}
        />
        {/* top controls */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            padding: "calc(env(safe-area-inset-top, 0px) + 12px) 14px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button
            type="button"
            onClick={() => router.push("/circles")}
            aria-label="Back"
            style={{
              width: 38,
              height: 38,
              borderRadius: 99,
              border: "none",
              background: "rgba(255,255,255,.92)",
              color: T.ink,
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              boxShadow: "0 2px 8px -2px rgba(11,18,32,.35)",
            }}
          >
            {Ico.back({ size: 18, c: T.ink })}
          </button>
          {hasAllowance ? <Stage2Pill /> : <PreviewBadge />}
        </div>
        {/* category chip + title */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 16px 14px", color: "#fff" }}>
          <span
            style={{
              display: "inline-block",
              padding: "5px 10px",
              borderRadius: 99,
              background: "rgba(11,18,32,.55)",
              backdropFilter: "blur(4px)",
              color: "#fff",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {t(CATEGORY_KEY[circle.category])}
          </span>
          <div
            style={{
              marginTop: 9,
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.18,
              textShadow: "0 2px 14px rgba(0,0,0,.5)",
            }}
          >
            {circle.title}
          </div>
        </div>
      </div>

      {/* Organizer row */}
      <div style={{ padding: "14px 16px 0", display: "flex", alignItems: "center", gap: 11 }}>
        {organizerFace ? (
          <FaceAvatar n={organizerFace} size={36} ring="#fff" />
        ) : (
          <Avatar name={circle.organizer} size={36} />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{circle.organizer}</div>
          <div style={{ fontSize: 12, color: T.slate }}>
            {circle.organizerLocation} · {t("circles.organizer")}
          </div>
        </div>
        {allowance ? (
          <button
            type="button"
            onClick={() => router.push("/you/kyc-tier")}
            aria-label={t("circles.kycAria", { tier: t(TIER_KEY[allowance.tier]) })}
            style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer" }}
          >
            <Chip
              kind={allowance.tier === 2 ? "success" : "action"}
              leading={Ico.verify({ size: 11, c: allowance.tier === 2 ? T.moneyIn : T.action })}
            >
              {t("circles.kycChip", { tier: t(TIER_KEY[allowance.tier]) })}
            </Chip>
          </button>
        ) : (
          <Chip kind="action" leading={Ico.verify({ size: 11, c: T.action })}>
            {t("circles.verifiedAtLaunch")}
          </Chip>
        )}
      </div>

      {/* Progress card */}
      <div style={{ padding: "14px 16px 0" }}>
        <Card elevation>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>
                {t("circles.raisedSoFar")}
              </div>
              <div style={{ marginTop: 4, fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em" }}>
                {raised.symbol}
                {raised.int}
                {raised.dp > 0 && <span style={{ color: T.slate, fontWeight: 600 }}>.{raised.dec}</span>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>
                {t("circles.goal")}
              </div>
              <div style={{ marginTop: 4, fontSize: 15, fontWeight: 700 }}>
                {target.symbol}
                {target.int}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <Progress pct={pct} h={8} color={T.moneyIn} />
          </div>
          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", fontSize: 12, color: T.slate }}>
            <span>{t("circles.donorsPct", { count: circle.donorCount, pct })}</span>
            <span>
              {circle.daysRemaining > 0
                ? t("circles.daysLeft", { n: circle.daysRemaining })
                : t("circles.closingSoon")}
            </span>
          </div>
          {/* donor social proof */}
          <div style={{ marginTop: 12, display: "flex", alignItems: "center" }}>
            {[1, 2, 3, 5].map((n, i) => (
              <span key={n} style={{ marginLeft: i === 0 ? 0 : -8, display: "inline-flex" }}>
                <FaceAvatar n={n} size={26} ring="#fff" />
              </span>
            ))}
          </div>
          {/* trust chips */}
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 7 }}>
            <Chip kind="success" leading={Ico.check({ size: 11, c: T.moneyIn })}>{beneficiaryChip}</Chip>
            <Chip kind="action" leading={Ico.shield({ size: 11, c: T.action })}>{t("circles.onChainChip")}</Chip>
            <Chip kind="action" leading={Ico.verify({ size: 11, c: T.action })}>{t("circles.verifiedAtLaunch")}</Chip>
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
            id === "story"
              ? t("circles.tabStory")
              : id === "recent"
                ? t("circles.tabRecent")
                : t("circles.tabTransparency");
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
                fontWeight: 700,
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

      {/* Story */}
      {tab === "story" && (
        <div style={{ padding: "16px 20px 0" }}>
          {circle.story.split("\n\n").map((para, i) => (
            <p key={i} style={{ fontSize: 14.5, lineHeight: 1.65, color: T.ink, marginBottom: 12 }}>
              {para}
            </p>
          ))}
        </div>
      )}

      {/* Recent */}
      {tab === "recent" && (
        <div style={{ padding: "16px 16px 0" }}>
          <Card p={0} elevation>
            {circle.recentDonations.map((d, i, arr) => {
              const amt = formatParts(d.pesoAmount, currency);
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
                  {isAnon(d.donorLabel) ? (
                    <Avatar name={d.donorLabel} size={32} />
                  ) : (
                    <FaceAvatar n={(i % 5) + 1} size={32} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                      {d.donorLabel}{" "}
                      <span style={{ color: T.slate, fontWeight: 500, fontSize: 12 }}>· {d.whenLabel}</span>
                    </div>
                    {d.note && (
                      <div style={{ fontSize: 12.5, color: T.slate, marginTop: 3, lineHeight: 1.45 }}>
                        &ldquo;{d.note}&rdquo;
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.moneyIn, whiteSpace: "nowrap" }}>
                    {amt.symbol}
                    {amt.int}
                    {amt.dp > 0 && <span style={{ color: T.slate, fontWeight: 500 }}>.{amt.dec}</span>}
                  </div>
                </div>
              );
            })}
          </Card>
          <div style={{ marginTop: 12, fontSize: 11.5, color: T.slate, textAlign: "center", lineHeight: 1.5 }}>
            {t("circles.recentSeedNote")}
          </div>
        </div>
      )}

      {/* Transparency */}
      {tab === "transparency" && (
        <div style={{ padding: "16px 16px 0" }}>
          <Card elevation>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: T.actionTint,
                  color: T.action,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "0 0 auto",
                }}
              >
                {Ico.shield({ size: 16, c: T.action })}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25 }}>{t("circles.receiptsTitle")}</div>
            </div>
            <p style={{ fontSize: 13, color: T.slate, lineHeight: 1.55, margin: "6px 0 0" }}>
              {t("circles.receiptsBody")}
            </p>
            <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, background: T.canvas, fontSize: 12.5, color: T.slate, lineHeight: 1.5 }}>
              {t("circles.receiptsVaultNote")}
            </div>
            <div style={{ marginTop: 12 }}>
              <Btn kind="secondary" size="md" onClick={() => router.push("/transparency")} trailing={Ico.chev({ c: T.ink })}>
                {t("circles.openVaultCta")}
              </Btn>
            </div>
          </Card>
        </div>
      )}

      {/* Donation breakdown — SOW Section 8 "Honest creator economy". */}
      <div style={{ padding: "20px 16px 0" }}>
        <Card elevation>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>
              {t("circles.breakdownLabel")}
            </div>
            {hasAllowance && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "2px 7px",
                  borderRadius: 99,
                  background: T.ink,
                  color: "#fff",
                }}
              >
                {t("circles.stage2")}
              </span>
            )}
          </div>

          {hasAllowance && allowance ? (
            <>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: T.ink }}>
                {t("circles.splitLine1", { sample: preview.fmtSample })}{" "}
                <strong>{preview.fmtBeneficiary}</strong>{" "}
                {t("circles.splitLine2", { allowance: preview.fmtAllowance })}{" "}
                <strong>{allowance.organizerName}</strong>,{" "}
                {t("circles.splitLine3", { tier: t(TIER_KEY[allowance.tier]) })}
              </p>
              <div style={{ marginTop: 14, height: 12, borderRadius: 99, background: T.hairline, overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${100 - allowancePct}%`, background: T.moneyIn }} />
                <div style={{ width: `${allowancePct}%`, background: T.warn }} />
              </div>
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 11.5, color: T.slate }}>
                <span>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: T.moneyIn, marginRight: 6, verticalAlign: "middle" }} />
                  {t("circles.beneficiaryPct", { pct: 100 - allowancePct })}
                </span>
                <span>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: T.warn, marginRight: 6, verticalAlign: "middle" }} />
                  {t("circles.operationalPct", { pct: allowancePct })}
                </span>
              </div>
              <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <WhyExistsLink label={t("circles.whySplit")} />
                <span style={{ fontSize: 11, color: T.slate, fontFamily: T.fontMono }}>
                  {t("circles.previewNotOnChainToday")}
                </span>
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: T.ink }}>
                <strong>{t("circles.fullToBeneficiaryStrong")}</strong>{" "}
                {t("circles.fullToBeneficiaryBody")}
              </p>
              <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <WhyExistsLink label={t("circles.aboutAllowance")} />
                <span style={{ fontSize: 11, color: T.slate, fontFamily: T.fontMono }}>
                  {t("circles.default0")}
                </span>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Footer — scrolls above the sticky donate bar */}
      <div style={{ padding: "20px 16px 0", display: "flex", justifyContent: "center" }}>
        <PoweredByStellar />
      </div>
      <div style={{ padding: "10px 16px 16px", display: "flex", justifyContent: "center" }}>
        <Btn kind="ghost" size="sm" full={false} onClick={() => router.push(`/circles/${circle.id}/manage`)}>
          {t("circles.organizerViewCta")} →
        </Btn>
      </div>

      {/* Sticky donate bar — floats above the BottomNav and stays visible while
          scrolling. main has overflow-y-auto + pb so bottom:0 pins it just
          above the nav rather than the viewport edge. */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: 8,
          padding: "12px 16px",
          background: "rgba(244,246,251,0.94)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderTop: "1px solid " + T.hairline,
          boxShadow: "0 -12px 28px -16px rgba(11,18,32,.28)",
          zIndex: 5,
        }}
      >
        <Btn kind="primary" leading={Ico.shield({ c: "#fff" })} onClick={() => router.push(`/circles/${circle.id}/donate`)}>
          {t("circles.donateToCircle")}
        </Btn>
        <div style={{ marginTop: 7, fontSize: 11, color: T.slate, textAlign: "center", lineHeight: 1.4 }}>
          {t("circles.donateCircleNote")}
        </div>
      </div>
    </div>
  );
}
