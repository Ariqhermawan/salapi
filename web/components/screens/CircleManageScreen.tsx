"use client";

// Salapi Circles - Organizer dashboard (Build-Award STAGE 2 preview).
// Shows allowance status (accrued / escrow / blocked), the "Upload proof of
// delivery" affordance (preview-only, no real upload), reputation score, and
// the seven-day dispute window countdown (mock). Nothing here is on-chain
// today. SOW Section 8.

import { useEffect, useMemo, useState } from "react";
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
import {
  Stage2Pill,
  WhyExistsLink,
} from "@/components/ui/OperationalAllowanceExplainer";
import { KYC_TIER_CEILING, mockReputation } from "@/lib/circles/allowance";
import type { KycTier } from "@/lib/circles/allowance";
import { type Circle, progressPct } from "@/lib/circles/types";

// Maps a KycTier to its localized circles.* key.
const TIER_KEY: Record<KycTier, string> = {
  0: "circles.tier0",
  1: "circles.tier1",
  2: "circles.tier2",
};

// preview seed data, Build-Award stage 2 - never persisted, never on-chain.
// Two-decimal padding in ISO so a stable dispute-window countdown renders
// across page loads in the preview (60 hours from now, deterministic shift).
function mockDisputeWindowEndsAt(): string {
  const now = new Date();
  now.setHours(now.getHours() + 60);
  return now.toISOString();
}

// Translation fn type, mirrors useT()'s `t`.
type TFn = (key: string, vars?: Record<string, string | number>) => string;

function formatRemaining(iso: string, t: TFn): string {
  const target = new Date(iso).getTime();
  const ms = target - Date.now();
  if (ms <= 0) return t("circles.windowClosed");
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours - days * 24;
  if (days > 0)
    return t("circles.remainingDh", { days, hours: remainingHours });
  return t("circles.remainingH", { hours });
}

export default function CircleManageScreen({ circle }: { circle: Circle }) {
  const router = useRouter();
  const { currency, t } = useT();

  const allowance = circle.allowance;
  const allowancePct = allowance?.percentage ?? 0;
  const hasAllowance = allowancePct > 0;

  // Mocked reputation drawing from the circle's organizer tier. For circles
  // without allowance we still surface the day-30 organizer summary.
  const reputation = useMemo(
    () =>
      mockReputation({
        tier: allowance?.tier ?? 0,
        closes: allowance?.tier === 2 ? 5 : allowance?.tier === 1 ? 2 : 0,
      }),
    [allowance]
  );

  // Dispute-window deadline is time-dependent (new Date()), so server and
  // client would compute different values and React 19 would log a hydration
  // mismatch on this dynamic-SSR route. Defer to post-mount: SSR + initial
  // client render both show the same neutral "—", then useEffect populates
  // it client-side. The setState here is the documented "subscribe to an
  // external system (the system clock)" pattern, not derived from URL/props.
  const [remaining, setRemaining] = useState<string>("-");
  useEffect(() => {
    if (!hasAllowance) return;
    const ends = mockDisputeWindowEndsAt();
    const tick = () => setRemaining(formatRemaining(ends, t));
    // setState lives in async callbacks (timer + interval) so React 19's
    // react-hooks/set-state-in-effect rule is satisfied; the first tick is
    // scheduled immediately rather than waiting a full minute.
    const initial = setTimeout(tick, 0);
    const interval = setInterval(tick, 60_000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [hasAllowance, t]);

  // Inline toast (Upload proof of delivery is non-functional preview).
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const pct = progressPct(circle);
  const raised = formatParts(circle.pesoRaised, currency);
  const accrued = formatParts(allowance?.pesoAccrued ?? 0, currency);

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
          <IconButton onClick={() => router.push(`/circles/${circle.id}`)}>
            {Ico.back({})}
          </IconButton>
        }
        title={t("circles.manageTitle")}
        trailing={<Stage2Pill />}
      />

      {/* Circle summary header */}
      <div style={{ padding: "8px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name={circle.organizer} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                lineHeight: 1.3,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {circle.title}
            </div>
            <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>
              {circle.organizer} · {circle.organizerLocation}
            </div>
          </div>
          {allowance && (
            <Chip
              kind={allowance.tier === 2 ? "success" : "action"}
              leading={Ico.verify({
                size: 11,
                c: allowance.tier === 2 ? T.moneyIn : T.action,
              })}
            >
              {t(TIER_KEY[allowance.tier])}
            </Chip>
          )}
        </div>
      </div>

      {/* Raised summary mini-card */}
      <div style={{ padding: "14px 16px 0" }}>
        <Card>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
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
                {t("circles.raisedSoFar")}
              </div>
              <div style={{ marginTop: 4, fontSize: 20, fontWeight: 600 }}>
                {raised.symbol}
                {raised.int}
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
                {t("circles.progress")}
              </div>
              <div style={{ marginTop: 4, fontSize: 16, fontWeight: 600 }}>
                {pct}%
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <Progress pct={pct} h={6} />
          </div>
        </Card>
      </div>

      {/* Allowance status */}
      <SectionHead>{t("circles.allowanceH1")}</SectionHead>
      <div style={{ padding: "0 16px" }}>
        <Card>
          {hasAllowance && allowance ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
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
                    {t("circles.accruedEscrow")}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 24,
                      fontWeight: 600,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {accrued.symbol}
                    {accrued.int}
                  </div>
                </div>
                <Chip kind="warn" leading={Ico.lock({ size: 11, c: T.warn })}>
                  {t("circles.pctLocked", { pct: allowancePct })}
                </Chip>
              </div>
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: T.warnTint,
                  color: T.warn,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ marginTop: 1 }}>
                  {Ico.shield({ size: 14, c: T.warn })}
                </div>
                <div>
                  <strong>{t("circles.blockedStrong")}</strong>{" "}
                  {t("circles.blockedBody")}
                </div>
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: T.ink,
                  lineHeight: 1.4,
                }}
              >
                {t("circles.noAllowanceTitle")}
              </div>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 12.5,
                  color: T.slate,
                  lineHeight: 1.5,
                }}
              >
                {t("circles.noAllowanceBody")}
              </p>
            </>
          )}
        </Card>
      </div>

      {/* Upload proof of delivery */}
      <SectionHead>{t("circles.proofOfDelivery")}</SectionHead>
      <div style={{ padding: "0 16px" }}>
        <Card>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: T.actionTint,
                color: T.action,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "0 0 auto",
              }}
            >
              {Ico.verify({ size: 18, c: T.action })}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {t("circles.uploadProof")}
              </div>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 12.5,
                  color: T.slate,
                  lineHeight: 1.5,
                }}
              >
                {t("circles.uploadProofBody")}
              </p>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <Btn
              kind="primary"
              leading={Ico.arrowUp({ c: "#fff" })}
              onClick={() => setToast(t("circles.uploadProofToast"))}
            >
              {t("circles.uploadProofCta")}
            </Btn>
          </div>
        </Card>
      </div>

      {/* Reputation */}
      <SectionHead>{t("circles.reputation")}</SectionHead>
      <div style={{ padding: "0 16px" }}>
        <Card>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background:
                  reputation.score >= 75
                    ? T.moneyInTint
                    : reputation.score > 0
                      ? T.actionTint
                      : T.canvas,
                color:
                  reputation.score >= 75
                    ? T.moneyIn
                    : reputation.score > 0
                      ? T.action
                      : T.slate,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "0 0 auto",
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              {reputation.score || "-"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {t("circles.reputationScore")}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: T.slate,
                  marginTop: 3,
                  lineHeight: 1.5,
                }}
              >
                {t("circles.reputationBody")}
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
            }}
          >
            <Stat
              label={t("circles.statClosed")}
              value={String(reputation.closedCircles)}
            />
            <Stat
              label={t("circles.statVerified")}
              value={String(reputation.verifiedDeliveries)}
            />
            <Stat
              label={t("circles.statOpenDisputes")}
              value={String(reputation.openDisputes)}
            />
          </div>
          {!reputation.tier2Eligible && (
            <div
              style={{
                marginTop: 12,
                fontSize: 11.5,
                color: T.slate,
                lineHeight: 1.5,
              }}
            >
              {t("circles.tier2Need", {
                closes: reputation.closedCircles,
                tier: t(TIER_KEY[allowance?.tier ?? 0]),
                ceiling: KYC_TIER_CEILING[allowance?.tier ?? 0],
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Dispute window */}
      {hasAllowance && (
        <>
          <SectionHead>{t("circles.disputeWindow")}</SectionHead>
          <div style={{ padding: "0 16px" }}>
            <Card>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    background: T.warnTint,
                    color: T.warn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: "0 0 auto",
                  }}
                >
                  {Ico.bell({ size: 18, c: T.warn })}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {t("circles.disputeWindowTitle")}
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: T.slate,
                      marginTop: 3,
                      lineHeight: 1.5,
                    }}
                  >
                    {t("circles.disputeWindowBody")}
                  </div>
                </div>
              </div>
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: T.canvas,
                  fontSize: 13,
                  fontWeight: 600,
                  color: T.ink,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{remaining}</span>
                <span
                  style={{
                    fontSize: 11,
                    color: T.slate,
                    fontFamily: T.fontMono,
                    fontWeight: 500,
                  }}
                >
                  {t("circles.mockWindow")}
                </span>
              </div>
            </Card>
          </div>
        </>
      )}

      {/* Trust gates link */}
      <div
        style={{
          padding: "20px 16px 0",
          textAlign: "center",
        }}
      >
        <WhyExistsLink label={t("circles.trustGatesLink")} align="center" />
      </div>

      <div
        style={{
          padding: "18px 16px 0",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <PoweredByStellar />
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 96,
            background: T.ink,
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 12px 30px -10px rgba(11,18,32,0.45)",
            zIndex: 60,
            maxWidth: "calc(100% - 32px)",
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "20px 24px 8px",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: T.slate,
      }}
    >
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: T.canvas,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{value}</div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: T.slate,
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}
