"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { paluwaganState, smartSavingsState, disasterState } from "@/app/actions";
import {
  T,
  Ico,
  AppBar,
  Card,
  Btn,
  Chip,
  Peso,
  Avatar,
  Progress,
  PoweredByStellar,
} from "@/components/ui/kit";

type Pal = Awaited<ReturnType<typeof paluwaganState>>;
type Sav = Awaited<ReturnType<typeof smartSavingsState>>;
type Dis = Awaited<ReturnType<typeof disasterState>>;

function pesoNum(label: string) {
  return Number(label.replace(/[^0-9.]/g, "")) || 0;
}

export default function VaultsScreen() {
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

  const label = (s: string) => (s === "-" ? "?" : s);

  return (
    <div style={shell}>
      <AppBar large title="Vaults" sub="Where your money does more." />

      <div style={{ padding: "4px 16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Paluwagan */}
        <Card p={0} style={{ overflow: "hidden", cursor: "pointer" }} onClick={() => router.push("/paluwagan")}>
          <div style={{ padding: "18px 18px 6px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <Chip kind="action" leading={Ico.star({ size: 11, c: T.action })}>Most loved</Chip>
              <div style={{ marginTop: 10, fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>Paluwagan</div>
              <div style={{ marginTop: 4, fontSize: 13, color: T.slate }}>Save together · trust by code</div>
            </div>
            <div style={{ display: "flex", marginLeft: -4 }}>
              {(pal && pal.ready ? pal.seats.slice(0, 3) : [{ label: "?" }, { label: "?" }, { label: "?" }]).map((m, i) => (
                <div key={i} style={{ marginLeft: i === 0 ? 0 : -10 }}>
                  <Avatar name={label((m as { label: string }).label)} size={30} />
                </div>
              ))}
              {pal && pal.ready && pal.seats.length > 3 && (
                <div style={{ marginLeft: -10, width: 30, height: 30, borderRadius: 99, background: T.canvas, color: T.slate, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 0 0 1px " + T.hairline }}>
                  +{pal.seats.length - 3}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "8px 18px 16px", borderTop: "1px solid " + T.hairline, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>
                {pal && pal.ready ? `Pot · round ${String(pal.round + 1).padStart(2, "0")}` : "Pot"}
              </div>
              <div className="sl-balance" style={{ marginTop: 4, fontSize: 18, fontWeight: 600 }}>
                {pal && pal.ready ? pal.potPeso : "-"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>This round to</div>
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600 }}>
                {pal && pal.ready ? pal.recipientLabel : "-"}
              </div>
            </div>
          </div>
        </Card>

        {/* Smart Savings */}
        <Card p={0} style={{ overflow: "hidden", cursor: "pointer" }} onClick={() => router.push("/savings")}>
          <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: T.moneyInTint, color: T.moneyIn, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {Ico.shield({ c: T.moneyIn })}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Smart Savings</div>
              <div style={{ fontSize: 12, color: T.slate }}>
                {sav && sav.ready && sav.hasGoal
                  ? `${sav.pct}% saved · locked until target`
                  : sav && sav.ready
                    ? "Start a goal · locked savings"
                    : "Goal vault"}
              </div>
            </div>
            {sav && sav.ready && sav.hasGoal ? (
              <span className="sl-balance" style={{ fontSize: 16, fontWeight: 600 }}>{sav.savedPeso}</span>
            ) : (
              <span style={{ color: T.slate }}>{Ico.chev({ c: T.slate })}</span>
            )}
          </div>
          {sav && sav.ready && sav.hasGoal && (
            <div style={{ padding: "0 18px 14px" }}>
              <Progress pct={sav.pct} color={T.moneyIn} />
            </div>
          )}
        </Card>

        {/* Disaster Relief */}
        <Card
          p={0}
          style={{ overflow: "hidden", background: "linear-gradient(160deg,#fff 0%, #FBF1E0 110%)", cursor: "pointer" }}
          onClick={() => router.push("/transparency")}
        >
          <div style={{ padding: "18px 18px 4px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <Chip kind="warn">{dis && dis.ok && dis.active ? "Live now · relief active" : "Standby"}</Chip>
              <div style={{ marginTop: 10, fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>Disaster Relief</div>
              <div style={{ marginTop: 4, fontSize: 13, color: T.slate }}>Every peso, traceable end-to-end.</div>
            </div>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "#fff", color: T.warn, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 0 0 1px " + T.hairline }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={T.warn} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l8 4v6c0 5-4 7-8 8-4-1-8-3-8-8V7l8-4z" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
          </div>
          <div style={{ padding: "12px 18px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>Pool live</div>
                {dis && dis.ok ? (
                  <Peso value={pesoNum(dis.pesoLabel)} size={26} />
                ) : (
                  <div style={{ fontSize: 15, color: T.slate, marginTop: 4 }}>verify on explorer</div>
                )}
              </div>
              <Btn kind="primary" full={false} size="md" onClick={() => router.push("/transparency")}>
                Donate
              </Btn>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ padding: "22px 24px 0", display: "flex", justifyContent: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
