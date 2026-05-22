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

// Counts a value up from 0 to `target` once `run` turns true. Honors
// prefers-reduced-motion by snapping straight to the final figure.
function useCountUp(target: number, run: boolean) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!run) {
      setVal(0);
      return;
    }
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || target <= 0) {
      setVal(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const dur = 1100;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      setVal(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
      else setVal(target);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return val;
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
  amount: number | null;
  progressPct?: number;
  onClick: () => void;
}) {
  return (
    <Card
      p={14}
      elevation
      className="sl-lift"
      style={{ cursor: "pointer" }}
      onClick={onClick}
    >
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
      <div style={{ marginTop: 1 }}>
        {amount === null ? (
          <span
            className="sl-balance"
            style={{ fontSize: 17, fontWeight: 700, color: T.slate }}
          >
            -
          </span>
        ) : (
          <Peso value={amount} size={17} weight={700} />
        )}
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

  // No explicit bottom padding: the layout's <main> already reserves
  // pb-[92px] to clear the bottom nav. The screen is sized to sit on one
  // screen without scroll.
  const shell: React.CSSProperties = {
    fontFamily: T.fontSans,
    color: T.ink,
    minHeight: "100%",
  };

  const disActive = Boolean(dis && dis.ok && dis.active);
  const savHasGoal = Boolean(sav && sav.ready && sav.hasGoal);
  const disReady = Boolean(dis && dis.ok);
  const disRaisedTarget = dis && dis.ok ? pesoNum(dis.pesoLabel) : 0;
  const disRaisedShown = useCountUp(disRaisedTarget, disReady);

  return (
    <div style={shell}>
      <AppBar large title={t("vaults.title")} sub={t("vaults.sub")} />

      <div style={{ padding: "4px 16px 0" }}>
        {/* Disaster Relief hero - "Brankas Hidup": a living vault. */}
        <Card
          p={0}
          onClick={() => router.push("/transparency")}
          className="sl-breathe"
          style={{
            position: "relative",
            overflow: "hidden",
            cursor: "pointer",
            background: "linear-gradient(160deg,#fff 0%, #FBF1E0 120%)",
            boxShadow:
              "inset 0 0 0 1px #F0DCB6, 0 12px 26px -16px rgba(180,83,9,0.5)",
          }}
        >
          {/* Living vault dial - one emblem: a turning vault wheel in a
              white badge, with a soft "rupiah masuk" ripple. Decorative. */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              width: 58,
              height: 58,
              pointerEvents: "none",
            }}
          >
            <span
              className="sl-ripple"
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 99,
                border: "1.5px solid rgba(180,83,9,0.4)",
              }}
            />
            <span
              className="sl-ripple"
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 99,
                border: "1.5px solid rgba(180,83,9,0.4)",
                animationDelay: "1.9s",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 16,
                background: "#fff",
                boxShadow:
                  "0 3px 8px -3px rgba(180,83,9,0.3), inset 0 0 0 1px " +
                  T.hairline,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                className="sl-dial"
                viewBox="0 0 100 100"
                width="38"
                height="38"
                fill="none"
                stroke={T.warn}
              >
                <circle cx="50" cy="50" r="37" strokeWidth="6.5" />
                <circle cx="50" cy="50" r="9" fill={T.warn} stroke="none" />
                <g strokeWidth="7" strokeLinecap="round">
                  <path d="M50 13V41" />
                  <path d="M50 59V87" />
                  <path d="M13 50H41" />
                  <path d="M59 50H87" />
                </g>
              </svg>
            </div>
          </div>

          <div style={{ position: "relative", padding: "14px 16px 4px" }}>
            <Chip
              kind="warn"
              leading={
                <span
                  className="sl-dotpulse"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 99,
                    background: T.warn,
                    display: "block",
                  }}
                />
              }
            >
              {disActive ? t("vaults.statusActive") : t("vaults.statusStandby")}
            </Chip>
            <div
              style={{
                marginTop: 8,
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
                maxWidth: 230,
              }}
            >
              {t("vaults.disasterDesc")}
            </div>
          </div>
          <div style={{ position: "relative", padding: "10px 16px 14px" }}>
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
                <Peso value={disRaisedShown} size={28} />
              ) : (
                <div style={{ fontSize: 14, color: T.slate, paddingBottom: 4 }}>
                  {t("common.loading")}
                </div>
              )}
              <Btn
                kind="primary"
                size="md"
                full={false}
                className="sl-glow"
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
            padding: "12px 4px 6px",
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
                ? t("vaults.arisanRound", { n: pal.cycleRound })
                : t("common.loading")
            }
            amountLabel={t("vaults.pot")}
            amount={pal && pal.ready ? pal.potPesos : null}
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
                ? sav.savedPesos
                : null
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
          elevation
          className="sl-lift"
          style={{ marginTop: 10, cursor: "pointer" }}
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

      <div style={{ padding: "12px 16px 0", display: "flex", justifyContent: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
