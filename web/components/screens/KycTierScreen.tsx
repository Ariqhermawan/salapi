"use client";

// Salapi Circles - KYC tier sheet (Build-Award STAGE 2 preview).
// Visual progression Tier 0 -> Tier 1 -> Tier 2. SOW Section 8 trust gate 2.
// "Verify identity" CTA is intentionally non-functional in this preview - we
// DO NOT collect any actual ID document or personal data here. Real KYC ships
// at Build-Award stage 2.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/I18nProvider";
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

const TIERS: KycTier[] = [0, 1, 2];

export default function KycTierScreen() {
  const { t } = useT();
  const router = useRouter();

  // Preview state: the logged-in user is Tier 0 by default. There is no
  // backend that stores tier in this preview - real verification lives at
  // Build-Award stage 2. The "Verify identity" button is intentionally non-
  // functional and shows a toast explaining that.
  const currentTier: KycTier = 0;

  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
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
        title={t("kyc.title")}
        trailing={<Stage2Pill />}
      />

      {/* Hero */}
      <div style={{ padding: "4px 16px 0" }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          {t("kyc.heroTitle")}
        </h1>
        <p style={{ marginTop: 6, fontSize: 13, color: T.slate, lineHeight: 1.5 }}>
          {t("kyc.heroBody")}
        </p>
        <div style={{ marginTop: 4 }}>
          <WhyExistsLink label={t("kyc.whyLink")} />
        </div>
      </div>

      {/* Current tier banner */}
      <div style={{ padding: "12px 16px 0" }}>
        <Card
          p={14}
          style={{ background: "linear-gradient(160deg, #fff 0%, #EFF4FE 110%)" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
                {t("kyc.currently")}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>
                {KYC_TIER_LABEL[currentTier]} · {t("kyc.ceiling")}{" "}
                {KYC_TIER_CEILING[currentTier]}%
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Tier ladder */}
      <div
        style={{
          padding: "12px 20px 6px",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: T.slate,
        }}
      >
        {t("kyc.ladderLabel")}
      </div>
      <div
        style={{
          padding: "0 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {TIERS.map((tier) => {
          const active = tier === currentTier;
          const ceiling = KYC_TIER_CEILING[tier];
          return (
            <Card
              key={tier}
              style={{
                boxShadow: active
                  ? "0 0 0 2px " + T.action + ", inset 0 0 0 1px " + T.hairline
                  : "inset 0 0 0 1px " + T.hairline,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background:
                      tier === 2
                        ? T.moneyInTint
                        : tier === 1
                          ? T.actionTint
                          : T.canvas,
                    color:
                      tier === 2 ? T.moneyIn : tier === 1 ? T.action : T.slate,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    fontWeight: 700,
                    flex: "0 0 auto",
                  }}
                >
                  {tier}
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
                      {KYC_TIER_LABEL[tier]}
                    </div>
                    <Chip
                      kind={
                        tier === 2 ? "success" : tier === 1 ? "action" : "neutral"
                      }
                      size="sm"
                    >
                      {t("kyc.ceiling")} {ceiling}%
                    </Chip>
                    {active && (
                      <Chip kind="action" size="sm">
                        {t("kyc.current")}
                      </Chip>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>
                    {t(`kyc.tier${tier}Name`)}
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
                  {t("kyc.requiredLabel")}
                </div>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 13,
                    color: T.ink,
                    lineHeight: 1.55,
                  }}
                >
                  {t(`kyc.tier${tier}Required`)}
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
                  {t("kyc.unlocksLabel")}
                </div>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 13,
                    color: T.ink,
                    lineHeight: 1.55,
                  }}
                >
                  {t(`kyc.tier${tier}Unlocks`)}
                </p>
              </div>

              {/* CTA per row */}
              {tier === 1 && (
                <div style={{ marginTop: 14 }}>
                  <Btn kind="primary" onClick={() => setToast(t("kyc.toast"))}>
                    {t("kyc.verifyCta")}
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
                    {t("kyc.verifyNote")}
                  </div>
                </div>
              )}
              {tier === 2 && (
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
                    <div>{t("kyc.tier2Lock")}</div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Honesty banner */}
      <div style={{ padding: "12px 16px 0" }}>
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: T.warnTint,
            color: T.warn,
            fontSize: 12,
            lineHeight: 1.45,
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
          }}
        >
          <div style={{ marginTop: 1 }}>{Ico.shield({ size: 16, c: T.warn })}</div>
          <div>
            <strong>{t("kyc.honestyStrong")}</strong> {t("kyc.honestyBody")}
          </div>
        </div>
      </div>

      {/* Privacy note (V7) */}
      <div style={{ padding: "10px 16px 0" }}>
        <Card p={12}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ marginTop: 1 }}>
              {Ico.lock({ size: 14, c: T.action })}
            </div>
            <div style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.5 }}>
              {t("kyc.privacyNote")}
            </div>
          </div>
        </Card>
      </div>

      <div style={{ padding: "14px 16px 0", display: "flex", justifyContent: "center" }}>
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
