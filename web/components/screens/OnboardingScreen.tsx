"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { T, Ico, Btn, Wordmark, Avatar, Peso } from "@/components/ui/kit";

function BalanceVisual() {
  return (
    <div style={{ width: 210, height: 124, borderRadius: 18, background: "linear-gradient(160deg,#fff 0%,#F4F6FB 100%)", boxShadow: "0 10px 30px -8px rgba(11,18,32,0.18), inset 0 0 0 1px " + T.hairline, padding: 18, position: "relative" }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: T.slate, letterSpacing: "0.1em", textTransform: "uppercase" }}>Available</div>
      <div style={{ marginTop: 8 }}><Peso value={24580.5} size={28} /></div>
      <div style={{ position: "absolute", bottom: 12, right: 14 }}><Wordmark size={12} /></div>
    </div>
  );
}

function SendVisual() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <Avatar name="You" size={56} />
        <div style={{ fontSize: 12, color: T.slate, fontFamily: T.fontMono }}>@you</div>
      </div>
      <div style={{ width: 110, borderTop: "2px dashed " + T.hairline, position: "relative", height: 2 }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: T.action, color: "#fff", width: 36, height: 36, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px -8px rgba(37,99,235,0.55)" }}>
          {Ico.send({ c: "#fff", size: 18 })}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <Avatar name="Maria" size={56} />
        <div style={{ fontSize: 12, color: T.slate, fontFamily: T.fontMono }}>@maria</div>
      </div>
    </div>
  );
}

function CircleVisual() {
  const seats = [0, 1, 2, 3, 4, 5];
  return (
    <div style={{ width: 200, height: 200, position: "relative" }}>
      <div style={{ position: "absolute", inset: 30, borderRadius: 99, border: "2px dashed " + T.hairline }} />
      {seats.map((i) => {
        const a = (i / seats.length) * Math.PI * 2 - Math.PI / 2;
        const x = 100 + Math.cos(a) * 70 - 18;
        const y = 100 + Math.sin(a) * 70 - 18;
        const active = i === 2;
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, width: 36, height: 36, borderRadius: 99, background: active ? T.action : T.surface, color: active ? "#fff" : T.ink, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, boxShadow: active ? "0 8px 24px -6px rgba(37,99,235,.6)" : "inset 0 0 0 1px " + T.hairline }}>
            {["M", "J", "L", "P", "K", "A"][i]}
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 60, top: 60, width: 80, height: 80, borderRadius: 99, background: T.canvas, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 0 0 1px " + T.hairline }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: T.slate, letterSpacing: "0.08em", textTransform: "uppercase" }}>Pot</div>
        <div className="sl-balance" style={{ fontSize: 18, fontWeight: 600 }}>₱6,000</div>
      </div>
    </div>
  );
}

const SLIDES = [
  { eyebrow: "PESOS, NOT TOKENS", title: "Your money,\nstays as pesos.", body: "Top up with GCash. See pesos. Pay in pesos. No wallets, seed phrases or tokens to manage — ever.", visual: <BalanceVisual /> },
  { eyebrow: "SEND BY @USERNAME", title: "Send money\nby name, not number.", body: "Claim your @username. Send to anyone the same way. No long numbers, no addresses, no mistakes.", visual: <SendVisual /> },
  { eyebrow: "COMMUNITY", title: "Paluwagan,\nwithout the worry.", body: "Start a savings circle with friends or family. The contract holds the pot — no one can run away with it.", visual: <CircleVisual /> },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [i, setI] = useState(0);
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;

  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%", display: "flex", flexDirection: "column", paddingBottom: 110 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px 0" }}>
        <Wordmark size={20} />
        <button onClick={() => router.push("/")} style={{ fontSize: 13, color: T.slate, fontWeight: 500, background: "none", border: "none", cursor: "pointer", fontFamily: T.fontSans }}>
          Skip
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 28px 0", textAlign: "center" }}>
        <div style={{ marginBottom: 36, minHeight: 200, display: "flex", alignItems: "center" }}>{s.visual}</div>
        <div style={{ fontSize: 11, color: T.action, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>{s.eyebrow}</div>
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.15, whiteSpace: "pre-line", maxWidth: 280 }}>{s.title}</div>
        <div style={{ marginTop: 14, fontSize: 15, color: T.slate, lineHeight: 1.5, maxWidth: 280 }}>{s.body}</div>
      </div>

      <div style={{ padding: "24px 16px 0" }}>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 18 }}>
          {[0, 1, 2].map((k) => (
            <div key={k} style={{ width: k === i ? 24 : 8, height: 8, borderRadius: 99, background: k === i ? T.ink : T.hairline, transition: "width .3s" }} />
          ))}
        </div>
        <Btn kind="primary" onClick={() => (last ? router.push("/signin") : setI(i + 1))}>
          {last ? "Get started" : "Next"}
        </Btn>
      </div>
    </div>
  );
}
