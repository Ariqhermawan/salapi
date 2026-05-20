"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  smartSavingsState,
  smartSavingsOpen,
  smartSavingsDeposit,
  smartSavingsWithdraw,
} from "@/app/actions";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Card,
  Btn,
  Chip,
  Money,
  PoweredByStellar,
} from "@/components/ui/kit";
import { SalapiMascot } from "@/components/ui/mascot";

type State = Awaited<ReturnType<typeof smartSavingsState>>;

function Ring({ pct }: { pct: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: 120, height: 120 }}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} stroke={T.hairline} strokeWidth="10" fill="none" />
        <circle
          cx="60"
          cy="60"
          r={r}
          stroke={T.moneyIn}
          strokeWidth="10"
          fill="none"
          strokeDasharray={`${(circ * pct) / 100} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{ transition: "stroke-dasharray .6s" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div className="sl-balance" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>{pct}%</div>
        <div style={{ fontSize: 11, color: T.slate, fontWeight: 500 }}>saved</div>
      </div>
    </div>
  );
}

const TARGETS = ["5000", "10000", "20000", "50000"];
const ADDS = ["500", "1000", "2000", "5000"];

export default function SavingsScreen() {
  const router = useRouter();
  const [st, setSt] = useState<State | null>(null);
  const [target, setTarget] = useState("20000");
  const [add, setAdd] = useState("500");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string; link?: string } | null>(null);
  const [pending, start] = useTransition();

  async function refresh() {
    setSt(await smartSavingsState());
  }
  useEffect(() => {
    refresh();
  }, []);

  function run(
    fn: () => Promise<{ ok: boolean; link?: string; error?: string }>,
    okText: string
  ) {
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (r.ok) setMsg({ tone: "ok", text: okText, link: r.link });
      else setMsg({ tone: "err", text: r.error || "Something went wrong" });
      await refresh();
    });
  }

  const shell: React.CSSProperties = {
    fontFamily: T.fontSans,
    color: T.ink,
    minHeight: "100%",
    paddingBottom: 110,
  };

  const Toast = () =>
    msg ? (
      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ padding: "12px 14px", borderRadius: 12, background: msg.tone === "ok" ? T.moneyInTint : "#FBEAE8", color: msg.tone === "ok" ? T.moneyIn : T.danger, fontSize: 13, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600 }}>{msg.tone === "ok" ? "✓ " : ""}{msg.text}</span>
          {msg.link && (
            <a href={msg.link} target="_blank" rel="noopener noreferrer" style={{ color: T.action, fontFamily: T.fontMono, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
              View on Stellar {Ico.link({ size: 13, c: T.action })}
            </a>
          )}
        </div>
      </div>
    ) : null;

  // ── LOADING ──
  if (st === null) {
    return (
      <div style={shell}>
        <AppBar leading={<IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>} title="Smart Savings" />
        <div style={{ padding: "60px 24px", textAlign: "center", color: T.slate, fontSize: 14 }}>Loading your goal…</div>
      </div>
    );
  }

  // ── VAULT NOT CONFIGURED ──
  if (!st.ready) {
    return (
      <div style={shell}>
        <AppBar leading={<IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>} title="Smart Savings" />
        <div style={{ padding: "60px 28px 0", textAlign: "center" }}>
          <div style={{ width: 72, height: 72, margin: "0 auto", borderRadius: 18, background: T.actionTint, color: T.action, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {Ico.lock({ size: 32, c: T.action })}
          </div>
          <div style={{ marginTop: 18, fontSize: 20, fontWeight: 600 }}>Smart Savings</div>
          <div style={{ marginTop: 8, fontSize: 14, color: T.slate, lineHeight: 1.5 }}>
            The savings vault isn&apos;t configured on this deployment yet.
          </div>
        </div>
        <div style={{ padding: "26px 16px 0", display: "flex", justifyContent: "center" }}>
          <PoweredByStellar />
        </div>
      </div>
    );
  }

  // ── NO GOAL → CREATE ──
  if (!st.hasGoal) {
    const tnum = Number(target) || 0;
    return (
      <div style={shell}>
        <AppBar leading={<IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>} title="New goal" />
        <div style={{ padding: "6px 20px 8px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.slate }}>Smart savings</div>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 4 }}>What are you saving for?</div>
        </div>
        <div style={{ padding: "4px 24px 0", textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>Target amount</div>
          <div className="sl-balance" style={{ marginTop: 6, fontSize: 42, fontWeight: 600, letterSpacing: "-0.03em", display: "inline-flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 24, color: T.slate, fontWeight: 500 }}>₱</span>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              placeholder="0"
              style={{ width: Math.max(2, target.length || 1) + "ch", border: "none", outline: "none", background: "transparent", font: "inherit", color: T.ink, textAlign: "center" }}
            />
          </div>
        </div>
        <div style={{ padding: "14px 16px 0", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {TARGETS.map((a) => (
            <span key={a} onClick={() => setTarget(a)} style={{ cursor: "pointer" }}>
              <Chip kind={a === target ? "action" : "neutral"} size="md">₱{Number(a).toLocaleString("en-PH")}</Chip>
            </span>
          ))}
        </div>
        <div style={{ padding: "14px 16px 0" }}>
          <div style={{ padding: "10px 12px", borderRadius: 10, background: T.warnTint, color: T.warn, fontSize: 12, display: "flex", gap: 8, alignItems: "flex-start", lineHeight: 1.4 }}>
            {Ico.lock({ size: 16, c: T.warn })}
            <div>Funds are <strong>locked</strong> by the contract until you hit the target, to protect you from yourself. Verifiable on Stellar.</div>
          </div>
        </div>
        <Toast />
        <div style={{ padding: "16px 16px 0" }}>
          <Btn kind="primary" disabled={pending || tnum <= 0} loading={pending} onClick={() => run(() => smartSavingsOpen(tnum), `Goal opened · target ₱${tnum.toLocaleString("en-PH")}`)}>
            Open this goal
          </Btn>
        </div>
      </div>
    );
  }

  // ── MATURED ──
  if (st.unlocked) {
    return (
      <div style={shell}>
        <AppBar leading={<IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>} title="" />
        <div style={{ padding: "32px 28px 0", textAlign: "center" }}>
          <div className="sl-tick" style={{ width: 88, height: 88, margin: "0 auto", borderRadius: 99, background: T.moneyIn, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 18px 40px -8px rgba(5,150,105,0.5)" }}>
            {Ico.check({ size: 44, c: "#fff" })}
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
            <SalapiMascot size={52} c={T.moneyIn} pose="cheer" />
          </div>
          <div style={{ marginTop: 22, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: T.moneyIn }}>Goal reached</div>
          <div className="sl-rise" style={{ marginTop: 12 }}><Money value={Number(st.savedPeso.replace(/[^0-9.]/g, "")) || 0} size={46} /></div>
          <div style={{ marginTop: 8, fontSize: 13, color: T.slate }}>Locked, on-chain. The contract held it the whole way.</div>
        </div>
        <Toast />
        <div style={{ padding: "30px 16px 0" }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 0 12px" }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: T.actionTint, color: T.action, display: "flex", alignItems: "center", justifyContent: "center" }}>{Ico.star({ size: 14, c: T.action })}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>It&apos;s yours. Release the funds</div>
            </div>
            <Btn kind="primary" disabled={pending} loading={pending} leading={!pending && Ico.arrowUp({ c: "#fff" })} onClick={() => run(smartSavingsWithdraw, "Released to your balance")}>
              Release to my balance
            </Btn>
          </Card>
        </div>
      </div>
    );
  }

  // ── IN PROGRESS ──
  const anum = Number(add) || 0;
  return (
    <div style={shell}>
      <AppBar
        leading={<IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>}
        title="Smart Savings"
        trailing={<IconButton onClick={() => router.push("/")}>{Ico.shield({})}</IconButton>}
      />
      <div style={{ padding: "6px 16px 10px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>Smart savings · locked</div>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 2 }}>Your goal</div>
      </div>
      <div style={{ padding: "2px 20px 0", display: "flex", alignItems: "center", gap: 14 }}>
        <Ring pct={st.pct} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: T.slate }}>Saved so far</div>
          <div className="sl-balance" style={{ marginTop: 2, fontSize: 24, fontWeight: 600 }}>{st.savedPeso}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: T.slate }}>
            of <span style={{ color: T.ink, fontWeight: 600 }}>{st.targetPeso}</span> · locked until reached
          </div>
        </div>
      </div>

      <div style={{ padding: "14px 16px 0" }}>
        <Card p={14}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: T.slate }}>Add to goal</div>
          <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 20, color: T.slate, fontWeight: 500 }}>₱</span>
            <input
              value={add}
              onChange={(e) => setAdd(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="0"
              className="sl-balance"
              style={{ width: Math.max(3, add.length || 1) + "ch", border: "none", outline: "none", background: "transparent", fontSize: 26, fontWeight: 600, color: T.ink }}
            />
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ADDS.map((a) => (
              <span key={a} onClick={() => setAdd(a)} style={{ cursor: "pointer" }}>
                <Chip kind={a === add ? "action" : "neutral"} size="md">₱{Number(a).toLocaleString("en-PH")}</Chip>
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Toast />

      <div style={{ padding: "14px 16px 0" }}>
        <Btn
          kind="primary"
          disabled={pending || anum <= 0}
          loading={pending}
          leading={!pending && Ico.plus({ c: "#fff" })}
          onClick={() => run(() => smartSavingsDeposit(anum), `Added ₱${anum.toLocaleString("en-PH")} to your goal`)}
        >
          Add ₱{anum.toLocaleString("en-PH")}
        </Btn>
        <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
          <PoweredByStellar />
        </div>
      </div>
    </div>
  );
}
