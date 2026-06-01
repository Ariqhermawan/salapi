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
    <Card p={14} elevation className="sl-lift" style={{ cursor: "pointer" }} onClick={onClick}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
          <span className="sl-balance" style={{ fontSize: 17, fontWeight: 700, color: T.slate }}>
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
    disasterState().then((d) => {
      setDis(d);
      if (!d.ok) setTimeout(() => disasterState().then(setDis), 700);
    });
  }, []);

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
        {/* Disaster Relief hero — photo-forward, live on-chain pool overlaid.
            Real data only (disasterState); taps through to /transparency. */}
        <div
          onClick={() => router.push("/transparency")}
          className="sl-lift"
          style={{
            position: "relative",
            borderRadius: 18,
            overflow: "hidden",
            cursor: "pointer",
            minHeight: 196,
            boxShadow: "0 16px 34px -18px rgba(11,18,32,.55), inset 0 0 0 1px " + T.hairline,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/circles/disaster.jpg"
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(to top, rgba(7,12,22,.92) 4%, rgba(7,12,22,.48) 44%, rgba(7,12,22,.12) 100%)",
            }}
          />
          {/* status pill (glass) */}
          <span
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 99,
              background: "rgba(11,18,32,.5)",
              backdropFilter: "blur(4px)",
              color: "#fff",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            <span
              className="sl-dotpulse"
              style={{ width: 6, height: 6, borderRadius: 99, background: disActive ? "#34d399" : "#F0B26B", display: "block" }}
            />
            {disActive ? t("vaults.statusActive") : t("vaults.statusStandby")}
          </span>
          {/* name + desc + pool + donate */}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 16px 14px", color: "#fff" }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", textShadow: "0 2px 12px rgba(0,0,0,.5)" }}>
              {t("vaults.disasterName")}
            </div>
            <div style={{ marginTop: 3, fontSize: 12.5, color: "rgba(255,255,255,.82)", lineHeight: 1.45, maxWidth: 250 }}>
              {t("vaults.disasterDesc")}
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,.7)" }}>
                  {t("vaults.poolLive")}
                </div>
                <div style={{ marginTop: 2 }}>
                  {dis && dis.ok ? (
                    <Peso value={disRaisedShown} size={27} color="#fff" />
                  ) : (
                    <span style={{ fontSize: 14, color: "rgba(255,255,255,.7)" }}>{t("common.loading")}</span>
                  )}
                </div>
              </div>
              <Btn kind="primary" size="md" full={false} className="sl-glow" onClick={() => router.push("/transparency")}>
                {t("wallet.donate")}
              </Btn>
            </div>
          </div>
        </div>

        {/* Your money: Arisan + Savings */}
        <div
          style={{
            padding: "10px 4px 4px",
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
            stat={pal && pal.ready ? t("vaults.arisanRound", { n: pal.cycleRound }) : t("common.loading")}
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
            amount={savHasGoal && sav && sav.ready && sav.hasGoal ? sav.savedPesos : null}
            progressPct={savHasGoal && sav && sav.ready && sav.hasGoal ? sav.pct : undefined}
            onClick={() => router.push("/savings")}
          />
        </div>

        {/* Preview tiles — Salapi Circles + Arisan Rooms (slim 2-col row). */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
          <Card p={10} elevation className="sl-lift" style={{ cursor: "pointer" }} onClick={() => router.push("/circles")}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  background: T.warnTint,
                  color: T.warn,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "0 0 auto",
                }}
              >
                {Ico.sparkle({ size: 14, c: T.warn })}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t("vaults.circlesName")}
                </div>
                <div style={{ fontSize: 10, color: T.warn, fontWeight: 600, letterSpacing: "0.04em", marginTop: 1 }}>
                  {t("home.circlesBadge")}
                </div>
              </div>
              {Ico.chev({ size: 12, c: T.slate })}
            </div>
          </Card>
          <Card p={10} elevation className="sl-lift" style={{ cursor: "pointer" }} onClick={() => router.push("/arisan")}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  background: T.actionTint,
                  color: T.action,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "0 0 auto",
                }}
              >
                {Ico.refresh({ size: 14, c: T.action })}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t("arisan.title")}
                </div>
                <div style={{ fontSize: 10, color: T.warn, fontWeight: 600, letterSpacing: "0.04em", marginTop: 1 }}>
                  {t("home.circlesBadge")}
                </div>
              </div>
              {Ico.chev({ size: 12, c: T.slate })}
            </div>
          </Card>
        </div>
      </div>

      <div style={{ padding: "14px 16px 0", display: "flex", justifyContent: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
