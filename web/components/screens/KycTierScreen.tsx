"use client";

// Salapi Circles - KYC tier sheet (Build-Award STAGE 2 preview).
// Visual progression Tier 0 -> Tier 1 -> Tier 2. SOW Section 8 trust gate 2.
// "Verify identity" CTA is intentionally non-functional in this preview - we
// DO NOT collect any actual ID document or personal data here. Real KYC ships
// at Build-Award stage 2.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Card,
  Btn,
  Chip,
  PoweredByStellar,
} from "@/components/ui/kit";
import {
  Stage2Pill,
  WhyExistsLink,
} from "@/components/ui/OperationalAllowanceExplainer";
import {
  KYC_TIER_CEILING,
  KYC_TIER_LABEL,
  type KycTier,
} from "@/lib/circles/allowance";

type TierRow = {
  tier: KycTier;
  name: string;
  required: string;
  unlocks: string;
};

const TIERS: TierRow[] = [
  {
    tier: 0,
    name: "No KYC",
    required: "Default for every new Salapi account. No documents collected.",
    unlocks:
      "Use Salapi normally - send by username, top up, save, join the Disaster Vault. Operational allowance on any circle you organize is 0 percent.",
  },
  {
    tier: 1,
    name: "Basic ID",
    required:
      "Government ID with photo. Face-match selfie. Recipient account ownership confirmation.",
    unlocks:
      "Organize a Salapi Circle with operational allowance up to 5 percent of donations. Allowance held in escrow until proof of delivery uploaded.",
  },
  {
    tier: 2,
    name: "Enhanced KYC + 3 closes",
    required:
      "Tier 1 verification PLUS three prior circles closed with verified delivery and zero unresolved disputes.",
    unlocks:
      "Operational allowance up to 10 percent (the cap). Reputation visible to every future donor.",
  },
];

export default function KycTierScreen() {
  const router = useRouter();

  // Preview state: the logged-in user is Tier 0 by default. There is no
  // backend that stores tier in this preview - real verification lives at
  // Build-Award stage 2. The "Verify identity" button is intentionally non-
  // functional and shows a toast explaining that.
  const currentTier: KycTier = 0;

  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

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
          <IconButton onClick={() => router.push("/settings")}>
            {Ico.back({})}
          </IconButton>
        }
        title="KYC tier"
        trailing={<Stage2Pill />}
      />

      {/* Hero */}
      <div style={{ padding: "8px 20px 0" }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          Your verification tier
        </h1>
        <p
          style={{
            marginTop: 8,
            fontSize: 13.5,
            color: T.slate,
            lineHeight: 1.55,
          }}
        >
          KYC tier caps the operational allowance you can set when organizing
          a Salapi Circle. The cap is encoded into the smart contract at
          circle creation, immutable once the first donation lands.
        </p>
        <div style={{ marginTop: 6 }}>
          <WhyExistsLink label="Why an honest allowance exists" />
        </div>
      </div>

      {/* Current tier banner */}
      <div style={{ padding: "16px 16px 0" }}>
        <Card
          style={{
            background: "linear-gradient(160deg, #fff 0%, #EFF4FE 110%)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
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
                fontWeight: 700,
                fontSize: 17,
                flex: "0 0 auto",
              }}
            >
              {currentTier}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: T.slate,
                }}
              >
                Currently
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>
                {KYC_TIER_LABEL[currentTier]} · ceiling{" "}
                {KYC_TIER_CEILING[currentTier]}%
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Tier ladder */}
      <div
        style={{
          padding: "16px 24px 8px",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: T.slate,
        }}
      >
        Tier ladder
      </div>
      <div
        style={{
          padding: "0 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {TIERS.map((row) => {
          const active = row.tier === currentTier;
          const ceiling = KYC_TIER_CEILING[row.tier];
          return (
            <Card
              key={row.tier}
              style={{
                boxShadow: active
                  ? "0 0 0 2px " + T.action + ", inset 0 0 0 1px " + T.hairline
                  : "inset 0 0 0 1px " + T.hairline,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background:
                      row.tier === 2
                        ? T.moneyInTint
                        : row.tier === 1
                          ? T.actionTint
                          : T.canvas,
                    color:
                      row.tier === 2
                        ? T.moneyIn
                        : row.tier === 1
                          ? T.action
                          : T.slate,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    fontWeight: 700,
                    flex: "0 0 auto",
                  }}
                >
                  {row.tier}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 600 }}>
                      {KYC_TIER_LABEL[row.tier]}
                    </div>
                    <Chip
                      kind={
                        row.tier === 2
                          ? "success"
                          : row.tier === 1
                            ? "action"
                            : "neutral"
                      }
                      size="sm"
                    >
                      ceiling {ceiling}%
                    </Chip>
                    {active && (
                      <Chip kind="action" size="sm">
                        Current
                      </Chip>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: T.slate,
                      marginTop: 2,
                    }}
                  >
                    {row.name}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: T.slate,
                  }}
                >
                  Required
                </div>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 13,
                    color: T.ink,
                    lineHeight: 1.55,
                  }}
                >
                  {row.required}
                </p>
              </div>
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: T.slate,
                  }}
                >
                  Unlocks
                </div>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 13,
                    color: T.ink,
                    lineHeight: 1.55,
                  }}
                >
                  {row.unlocks}
                </p>
              </div>

              {/* CTA per row */}
              {row.tier === 1 && (
                <div style={{ marginTop: 14 }}>
                  <Btn
                    kind="primary"
                    onClick={() =>
                      setToast(
                        "Real KYC ships at Build-Award. We don't collect ID data in this preview."
                      )
                    }
                  >
                    Verify identity
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
                    Preview - no document uploaded today.
                  </div>
                </div>
              )}
              {row.tier === 2 && (
                <div style={{ marginTop: 14 }}>
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: T.canvas,
                      fontSize: 12.5,
                      color: T.slate,
                      lineHeight: 1.5,
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ marginTop: 1 }}>
                      {Ico.lock({ size: 14, c: T.slate })}
                    </div>
                    <div>
                      Tier 2 requires history. Complete three circles with
                      verified delivery first - then upgrade from Tier 1.
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Honesty banner */}
      <div style={{ padding: "18px 16px 0" }}>
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 12,
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
            {Ico.shield({ size: 16, c: T.warn })}
          </div>
          <div>
            <strong>Build-Award stage 2.</strong> Day-30 ships a 0% allowance
            Disaster Vault with a whitelisted NGO shortlist. The KYC tier
            system above arrives at stage 2 alongside Operational Allowance.
            This preview does not collect any actual ID data.
          </div>
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
