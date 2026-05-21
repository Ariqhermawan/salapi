"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { paluwaganState, smartSavingsState, disasterState } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import {
  T,
  Ico,
  AppBar,
  Card,
  Btn,
  Chip,
  Peso,
  Progress,
  PoweredByStellar,
} from "@/components/ui/kit";

type Pal = Awaited<ReturnType<typeof paluwaganState>>;
type Sav = Awaited<ReturnType<typeof smartSavingsState>>;
type Dis = Awaited<ReturnType<typeof disasterState>>;

function pesoNum(label: string) {
  return Number(label.replace(/[^0-9.]/g, "")) || 0;
}

function VaultTile({
  icon,
  title,
  stat,
  amountLabel,
  amount,
  progressPct,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  stat: string;
  amountLabel: string;
  amount: string;
  progressPct?: number;
  onClick: () => void;
}) {
  return (
    <Card p={14} style={{ cursor: "pointer" }} onClick={onClick}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            background: T.actionTint,
            color: T.action,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
        {Ico.chev({ size: 14, c: T.slate })}
      </div>
      <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600 }}>{title}</div>
      <div style={{ marginTop: 2, fontSize: 12, color: T.slate }}>{stat}</div>
      <div
        style={{
          marginTop: 10,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: T.slate,
        }}
      >
        {amountLabel}
      </div>
      <div
        className="sl-balance"
        style={{ marginTop: 1, fontSize: 17, fontWeight: 700, color: T.ink }}
      >
        {amount}
      </div>
      {typeof progressPct === "number" && (
        <div style={{ marginTop: 8 }}>
          <Progress pct={progressPct} color={T.moneyIn} />
        </div>
      )}
    </Card>
  );
}

export default function VaultsScreen() {
  const { t } = useT();
  const router = useRouter();
  const [pal, setPal] = useState<Pal | null>(null);
  const [sav, setSav] = useState<Sav | null>(null);
  const [dis, setDis] = useState<Dis | null>(null);

  useEffect(() => {
    paluwaganState().then(setPal);
    smartSavingsState().then(setSav);
    disasterState().then(setDis);
  }, []);

  const shell: React.CSSProperties = {
    fontFamily: T.fontSans,
    color: T.ink,
    minHeight: "100%",
    paddingBottom: 110,
  };

  const disActive = Boolean(dis && dis.ok && dis.active);
  const savHasGoal = Boolean(sav && sav.ready && sav.hasGoal);

  return (
    <div style={shell}>
      <AppBar large title={t("vaults.title")} sub={t("vaults.sub")} />

      <div style={{ padding: "4px 16px 0" }}>
        {/* Disaster Relief hero */}
        <Card
          p={0}
          onClick={() => router.push("/transparency")}
          style={{
            overflow: "hidden",
            cursor: "pointer",
            background: "linear-gradient(160deg,#fff 0%, #FBF1E0 120%)",
          }}
        >
          <div style={{ padding: "16px 16px 4px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <Chip kind="warn">
                {disActive ? t("vaults.statusActive") : t("vaults.statusStandby")}
              </Chip>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  background: "#fff",
                  color: T.warn,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "inset 0 0 0 1px " + T.hairline,
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={T.warn}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 3l8 4v6c0 5-4 7-8 8-4-1-8-3-8-8V7l8-4z" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
              </div>
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: "-0.02em",
              }}
            >
              {t("vaults.disasterName")}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 13,
                color: T.slate,
                lineHeight: 1.5,
              }}
            >
              {t("vaults.disasterDesc")}
            </div>
          </div>
          <div style={{ padding: "12px 16px 16px" }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: T.slate,
              }}
            >
              {t("vaults.poolLive")}
            </div>
            <div
              style={{
                marginTop: 2,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              {dis && dis.ok ? (
                <Peso value={pesoNum(dis.pesoLabel)} size={28} />
              ) : (
                <div style={{ fontSize: 14, color: T.slate, paddingBottom: 4 }}>
                  {t("common.loading")}
                </div>
              )}
              <Btn
                kind="primary"
                size="md"
                full={false}
                onClick={() => router.push("/transparency")}
              >
                {t("wallet.donate")}
              </Btn>
            </div>
          </div>
        </Card>

        {/* Your money: Arisan + Savings */}
        <div
          style={{
            padding: "16px 4px 8px",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: T.slate,
          }}
        >
          {t("vaults.yourMoney")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <VaultTile
            icon={Ico.refresh({ size: 18, c: T.action })}
            title={t("vaults.arisanName")}
            stat={
              pal && pal.ready
                ? t("vaults.arisanRound", { n: pal.round + 1 })
                : t("common.loading")
            }
            amountLabel={t("vaults.pot")}
            amount={pal && pal.ready ? pal.potPeso : "-"}
            onClick={() => router.push("/paluwagan")}
          />
          <VaultTile
            icon={Ico.shield({ size: 18, c: T.action })}
            title={t("vaults.savingsName")}
            stat={
              savHasGoal && sav && sav.ready && sav.hasGoal
                ? t("vaults.savingsStatGoal", { pct: sav.pct })
                : t("vaults.savingsStatStart")
            }
            amountLabel={t("vaults.saved")}
            amount={
              savHasGoal && sav && sav.ready && sav.hasGoal
                ? sav.savedPeso
                : "-"
            }
            progressPct={
              savHasGoal && sav && sav.ready && sav.hasGoal ? sav.pct : undefined
            }
            onClick={() => router.push("/savings")}
          />
        </div>

        {/* Coming: Salapi Circles (Build-Award preview) */}
        <Card
          p={14}
          style={{ marginTop: 14, cursor: "pointer" }}
          onClick={() => router.push("/circles")}
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
                width: 36,
                height: 36,
                borderRadius: 11,
                background: T.warnTint,
                color: T.warn,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {Ico.sparkle({ size: 18, c: T.warn })}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {t("vaults.circlesName")}
              </div>
              <div style={{ fontSize: 12, color: T.slate, marginTop: 1 }}>
                {t("vaults.circlesCaption")}
              </div>
            </div>
            <Chip kind="warn" size="sm">
              {t("home.circlesBadge")}
            </Chip>
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 13,
              fontWeight: 600,
              color: T.action,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            {t("vaults.circlesCta")} {Ico.chev({ size: 14, c: T.action })}
          </div>
        </Card>
      </div>

      <div style={{ padding: "16px 16px 0", display: "flex", justifyContent: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
