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
import {
  KYC_TIER_CEILING,
  KYC_TIER_LABEL,
  mockReputation,
} from "@/lib/circles/allowance";
import { type Circle, progressPct } from "@/lib/circles/types";

// preview seed data, Build-Award stage 2 - never persisted, never on-chain.
// Two-decimal padding in ISO so a stable dispute-window countdown renders
// across page loads in the preview (60 hours from now, deterministic shift).
function mockDisputeWindowEndsAt(): string {
  const now = new Date();
  now.setHours(now.getHours() + 60);
  return now.toISOString();
}

function formatRemaining(iso: string): string {
  const target = new Date(iso).getTime();
  const ms = target - Date.now();
  if (ms <= 0) return "Window closed";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours - days * 24;
  if (days > 0) return `${days}d ${remainingHours}h remaining`;
  return `${hours}h remaining`;
}

export default function CircleManageScreen({ circle }: { circle: Circle }) {
  const router = useRouter();
  const { locale } = useT();

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

  // Stable dispute-window deadline per circle id (so countdown does not jump
  // between renders within the same tab session).
  const [disputeEndsAt] = useState<string>(() => mockDisputeWindowEndsAt());
  const [remaining, setRemaining] = useState(() => formatRemaining(disputeEndsAt));
  useEffect(() => {
    if (!hasAllowance) return;
    const t = setInterval(() => setRemaining(formatRemaining(disputeEndsAt)), 60_000);
    return () => clearInterval(t);
  }, [disputeEndsAt, hasAllowance]);

  // Inline toast (Upload proof of delivery is non-functional preview).
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const pct = progressPct(circle);
  const raised = formatParts(circle.pesoRaised, locale);
  const accrued = formatParts(allowance?.pesoAccrued ?? 0, locale);

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
        title="Manage circle"
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
              {KYC_TIER_LABEL[allowance.tier]}
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
                Raised so far
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
                Progress
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
      <SectionHead>Operational allowance</SectionHead>
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
                    Accrued in escrow
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
                  {allowancePct}% locked
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
                  <strong>Blocked pending proof of delivery.</strong> Funds
                  release once you upload photo, signature, or receipt of the
                  beneficiary receiving the disbursement.
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
                No allowance configured for this circle.
              </div>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 12.5,
                  color: T.slate,
                  lineHeight: 1.5,
                }}
              >
                100% goes to the beneficiary - the day-30 Disaster Vault model.
                Operational allowance (Build-Award stage 2) is opt-in at
                circle creation; this one was created at 0%.
              </p>
            </>
          )}
        </Card>
      </div>

      {/* Upload proof of delivery */}
      <SectionHead>Proof of delivery</SectionHead>
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
                Upload proof
              </div>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 12.5,
                  color: T.slate,
                  lineHeight: 1.5,
                }}
              >
                Photo, signature, or receipt of the beneficiary receiving the
                disbursement. Hashed on-chain at Build-Award stage 2; not yet
                live.
              </p>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <Btn
              kind="primary"
              leading={Ico.arrowUp({ c: "#fff" })}
              onClick={() =>
                setToast(
                  "This goes live at Build-Award. Currently a UI preview."
                )
              }
            >
              Upload proof of delivery
            </Btn>
          </div>
        </Card>
      </div>

      {/* Reputation */}
      <SectionHead>Reputation</SectionHead>
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
              {reputation.score || "—"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                Reputation score
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: T.slate,
                  marginTop: 3,
                  lineHeight: 1.5,
                }}
              >
                Each circle closed with verified delivery improves this score.
                A successful close also unlocks Tier 2 eligibility after three
                closes.
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
            <Stat label="Closed" value={String(reputation.closedCircles)} />
            <Stat label="Verified" value={String(reputation.verifiedDeliveries)} />
            <Stat label="Open disputes" value={String(reputation.openDisputes)} />
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
              Tier 2 needs 3+ closed circles with verified delivery (currently{" "}
              {reputation.closedCircles}). Ceiling at Tier{" "}
              {allowance?.tier ?? 0} is{" "}
              {KYC_TIER_CEILING[allowance?.tier ?? 0]}%.
            </div>
          )}
        </Card>
      </div>

      {/* Dispute window */}
      {hasAllowance && (
        <>
          <SectionHead>Dispute window</SectionHead>
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
                    Seven-day donor dispute window
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: T.slate,
                      marginTop: 3,
                      lineHeight: 1.5,
                    }}
                  >
                    Donors can flag spending; a multi-donor signal triggers a
                    freeze and community review. (Mocked countdown in preview.)
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
                  mock window
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
        <WhyExistsLink label="How the five trust gates work" align="center" />
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
