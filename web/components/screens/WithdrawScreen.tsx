"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { walletState, withdrawSandbox } from "@/app/actions";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Card,
  Row,
  Btn,
  Chip,
  Money,
  PoweredByStellar,
} from "@/components/ui/kit";
import { SalapiMascot } from "@/components/ui/mascot";

export default function WithdrawScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<"amount" | "processing" | "done">("amount");
  const [amount, setAmount] = useState("");
  const [bal, setBal] = useState<{ pesos: number; pesoLabel: string } | null>(null);
  const [result, setResult] = useState<{ note: string; pesoLabel: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    walletState().then((w) => setBal({ pesos: w.pesos, pesoLabel: w.pesoLabel }));
  }, []);

  const amt = Number(amount) || 0;

  function pct(p: number) {
    if (!bal) return;
    setAmount(String(Math.floor(bal.pesos * p)));
  }

  function go() {
    setPhase("processing");
    start(async () => {
      const r = await withdrawSandbox(amt);
      setResult({ note: r.note, pesoLabel: r.pesoLabel });
      setPhase("done");
    });
  }

  const shell: React.CSSProperties = {
    fontFamily: T.fontSans,
    color: T.ink,
    minHeight: "100%",
    paddingBottom: 110,
  };

  // ── PROCESSING ──
  if (phase === "processing") {
    return (
      <div style={shell}>
        <AppBar leading={<IconButton onClick={() => router.push("/")}>{Ico.x({})}</IconButton>} title="Processing" />
        <div style={{ padding: "70px 36px 0", textAlign: "center" }}>
          <div style={{ width: 84, height: 84, borderRadius: 99, background: T.actionTint, color: T.action, display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <span className="sl-spin" style={{ position: "absolute", inset: 0, borderRadius: 99, border: "3px solid " + T.action, borderTopColor: "transparent" }} />
            {Ico.arrowUp({ size: 32, c: T.action })}
          </div>
          <div style={{ marginTop: 24, fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
            Sending ₱{amt.toLocaleString("en-PH")}
          </div>
          <div style={{ marginTop: 8, fontSize: 14, color: T.slate, lineHeight: 1.5 }}>
            Posting to GCash (sandbox). Almost there.
          </div>
        </div>
        <div style={{ padding: "42px 16px 0" }}>
          <Card>
            {["Debited from your wallet", "Routing to GCash", "GCash confirms receipt"].map((s, i) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < 2 ? "1px solid " + T.hairline : "none" }}>
                {i < 2 ? (
                  <div style={{ width: 22, height: 22, borderRadius: 99, background: T.moneyInTint, color: T.moneyIn, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {Ico.check({ size: 14, c: T.moneyIn })}
                  </div>
                ) : (
                  <div className="sl-spin" style={{ width: 22, height: 22, borderRadius: 99, border: "2px solid " + T.action, borderTopColor: "transparent" }} />
                )}
                <div style={{ flex: 1, fontSize: 14, fontWeight: i === 2 ? 600 : 500, color: i === 2 ? T.ink : T.slate }}>{s}</div>
              </div>
            ))}
          </Card>
          <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
            <PoweredByStellar />
          </div>
        </div>
      </div>
    );
  }

  // ── DONE ──
  if (phase === "done" && result) {
    return (
      <div style={shell}>
        <AppBar leading={<IconButton onClick={() => router.push("/")}>{Ico.x({})}</IconButton>} title="" />
        <div style={{ padding: "48px 32px 0", textAlign: "center" }}>
          <div className="sl-tick" style={{ width: 88, height: 88, borderRadius: 99, background: T.moneyIn, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 18px 40px -10px rgba(5,150,105,0.5)" }}>
            {Ico.check({ size: 42, c: "#fff" })}
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
            <SalapiMascot size={50} c={T.moneyIn} pose="cheer" />
          </div>
          <div style={{ marginTop: 22, fontSize: 13, color: T.slate, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Withdrawal complete
          </div>
          <div className="sl-rise" style={{ marginTop: 8 }}>
            <Money value={amt} size={46} />
          </div>
          <div style={{ marginTop: 8, fontSize: 14, color: T.slate }}>
            to your GCash · <span style={{ color: T.ink, fontWeight: 600 }}>sandbox</span>
          </div>
        </div>
        <div style={{ padding: "32px 16px 0" }}>
          <Card>
            <Row title="Fee" trailing={<span style={{ fontSize: 14, color: T.moneyIn, fontWeight: 600 }}>Free</span>} divider />
            <Row title="On-chain balance" trailing={<span className="sl-balance" style={{ fontSize: 14, fontWeight: 600 }}>{result.pesoLabel}</span>} divider={false} />
          </Card>
          <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, background: T.canvas, fontSize: 12, color: T.slate, lineHeight: 1.5 }}>
            {result.note}
          </div>
        </div>
        <div style={{ padding: "22px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
          <Btn kind="primary" onClick={() => router.push("/")}>Done</Btn>
          <Btn kind="ghost" onClick={() => { setResult(null); setAmount(""); setPhase("amount"); }}>Withdraw again</Btn>
        </div>
      </div>
    );
  }

  // ── AMOUNT ──
  return (
    <div style={shell}>
      <AppBar leading={<IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>} title="Withdraw" />
      <div style={{ padding: "8px 24px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.slate }}>
          From Salapi to GCash
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 6 }}>
          How much do you want to withdraw?
        </div>
        <div style={{ fontSize: 13, color: T.slate, marginTop: 6 }}>
          Available: <span className="sl-balance" style={{ color: T.ink, fontWeight: 600 }}>{bal ? bal.pesoLabel : "…"}</span>
        </div>
      </div>
      <div style={{ padding: "10px 24px 0", textAlign: "center" }}>
        <div className="sl-balance" style={{ fontSize: 56, fontWeight: 600, letterSpacing: "-0.03em", display: "inline-flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontSize: 30, color: T.slate, fontWeight: 500 }}>₱</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="0"
            style={{ width: Math.max(2, amount.length || 1) + "ch", border: "none", outline: "none", background: "transparent", font: "inherit", color: T.ink, textAlign: "center" }}
          />
        </div>
      </div>
      <div style={{ padding: "20px 16px 0", display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {([["25%", 0.25], ["50%", 0.5], ["75%", 0.75], ["Max", 1]] as const).map(([label, p]) => (
          <span key={label} onClick={() => pct(p)} style={{ cursor: "pointer" }}>
            <Chip kind="neutral" size="md">{label}</Chip>
          </span>
        ))}
      </div>
      <div style={{ padding: "20px 16px 0" }}>
        <div style={{ padding: "14px 16px", background: T.surface, borderRadius: 14, boxShadow: "inset 0 0 0 1px " + T.hairline, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#0079FF", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12 }}>
            GC
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>GCash · sandbox</div>
            <div style={{ fontSize: 11, color: T.slate }}>Arrives in seconds · licensed anchor at Build Award</div>
          </div>
        </div>
        <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, background: T.warnTint, color: T.warn, display: "flex", gap: 10, alignItems: "flex-start" }}>
          {Ico.shield({ size: 18, c: T.warn })}
          <div style={{ fontSize: 12, lineHeight: 1.4 }}>
            On testnet your on-chain balance stays put. This confirms the off-ramp flow end to end.
          </div>
        </div>
      </div>
      <div style={{ padding: "24px 16px 0" }}>
        <Btn
          kind="primary"
          disabled={pending || amt <= 0 || (bal ? amt > bal.pesos : false)}
          loading={pending}
          trailing={!pending && Ico.chev({ c: "#fff" })}
          onClick={go}
        >
          {bal && amt > bal.pesos ? "Amount exceeds balance" : "Withdraw to GCash"}
        </Btn>
      </div>
    </div>
  );
}
