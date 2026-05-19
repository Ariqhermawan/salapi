"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disasterState, disasterContribute } from "@/app/actions";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Card,
  Btn,
  Chip,
  Peso,
  PoweredByStellar,
} from "@/components/ui/kit";

const EXPLORER = "https://stellar.expert/explorer/testnet";
const DISASTER_CONTRACT = "CCKQ3UVBZ75KSZDO6IPA5U6PFARJG4PLRGN2SAIW5RAGQ6K4B7ZDWBUZ";
const TRAIL: { step: string; hash: string }[] = [
  { step: "Deploy disaster vault", hash: "1bed6a16e6b6b2a8fddf3c8e247764f77f80bc18f58cd019bec225e60d891d12" },
  { step: "Register @juandelacruz", hash: "00d0861463b124d7ec83b1cb5ef65f4b13579167127b8acede5c01362f8bf913" },
  { step: "Initialize(admin, token)", hash: "f49b815b47b052ba12f288c64c1e11e336b9a6a1afaf5d359db08b928e20beb1" },
  { step: "Contribute 5 XLM", hash: "618dedd72dd1ba49f7432dc33e237007da5280c857d00e4eff6164247ad0cd66" },
  { step: "set_disaster(true)", hash: "7ecdeaf152745257b1d0f619503f6f59971068ad1a3bf7dd8499a08295608d0a" },
  { step: "Disburse 2 XLM", hash: "1115f685287faf7b508e97d378df5f4ccb1ccc302d007b2190776ad0c986a837" },
];
const QUICK = ["50", "100", "200", "500", "1000"];

type Pool = Awaited<ReturnType<typeof disasterState>>;

export default function TransparencyScreen() {
  const router = useRouter();
  const [pool, setPool] = useState<Pool | null>(null);
  const [phase, setPhase] = useState<"view" | "amount" | "processing" | "done">("view");
  const [amount, setAmount] = useState("200");
  const [done, setDone] = useState<{ link?: string } | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  async function refresh() {
    setPool(await disasterState());
  }
  useEffect(() => {
    refresh();
  }, []);

  const amt = Number(amount) || 0;

  function donate() {
    setPhase("processing");
    start(async () => {
      setErr("");
      const r = await disasterContribute(amt);
      if (r.ok) {
        setDone({ link: r.link });
        setPhase("done");
      } else {
        setErr(r.error);
        setPhase("amount");
      }
      await refresh();
    });
  }

  const shell: React.CSSProperties = {
    fontFamily: T.fontSans,
    color: T.ink,
    minHeight: "100%",
    paddingBottom: 110,
  };

  // ── DONATE · PROCESSING ──
  if (phase === "processing") {
    return (
      <div style={shell}>
        <AppBar leading={<IconButton onClick={() => setPhase("amount")}>{Ico.x({})}</IconButton>} title="Processing" />
        <div style={{ padding: "70px 36px 0", textAlign: "center" }}>
          <div style={{ width: 84, height: 84, borderRadius: 99, background: T.warnTint, color: T.warn, display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <span className="sl-spin" style={{ position: "absolute", inset: 0, borderRadius: 99, border: "3px solid " + T.warn, borderTopColor: "transparent" }} />
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={T.warn} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 4v6c0 5-4 7-8 8-4-1-8-3-8-8V7l8-4z" /></svg>
          </div>
          <div style={{ marginTop: 24, fontSize: 22, fontWeight: 600 }}>Donating ₱{amt.toLocaleString("en-PH")}</div>
          <div style={{ marginTop: 8, fontSize: 14, color: T.slate }}>Posting to the public relief pool on Stellar.</div>
        </div>
        <div style={{ padding: "42px 16px 0" }}>
          <Card>
            {["Debited from your wallet", "Posted to relief pool", "Published to public ledger"].map((s, i) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < 2 ? "1px solid " + T.hairline : "none" }}>
                {i < 2 ? (
                  <div style={{ width: 22, height: 22, borderRadius: 99, background: T.moneyInTint, color: T.moneyIn, display: "flex", alignItems: "center", justifyContent: "center" }}>{Ico.check({ size: 14, c: T.moneyIn })}</div>
                ) : (
                  <div className="sl-spin" style={{ width: 22, height: 22, borderRadius: 99, border: "2px solid " + T.warn, borderTopColor: "transparent" }} />
                )}
                <div style={{ flex: 1, fontSize: 14, fontWeight: i === 2 ? 600 : 500, color: i === 2 ? T.ink : T.slate }}>{s}</div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    );
  }

  // ── DONATE · SUCCESS ──
  if (phase === "done" && done) {
    return (
      <div style={shell}>
        <AppBar leading={<IconButton onClick={() => { setDone(null); setPhase("view"); }}>{Ico.x({})}</IconButton>} title="" />
        <div style={{ padding: "48px 32px 0", textAlign: "center" }}>
          <div className="sl-tick" style={{ width: 88, height: 88, borderRadius: 99, background: "linear-gradient(160deg,#FBF1E0,#fff)", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 0 0 1px " + T.hairline }}>
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={T.warn} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z" /></svg>
          </div>
          <div style={{ marginTop: 22, fontSize: 13, color: T.slate, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>Salamat po</div>
          <div className="sl-rise" style={{ marginTop: 8 }}><Peso value={amt} size={46} /></div>
          <div style={{ marginTop: 10, fontSize: 14, color: T.slate, lineHeight: 1.5, maxWidth: 280, margin: "10px auto 0" }}>
            Your donation is now in the public ledger. You can watch it disburse, peso by peso.
          </div>
        </div>
        <div style={{ padding: "30px 16px 0" }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 99, background: T.warnTint, color: T.warn, display: "flex", alignItems: "center", justifyContent: "center" }}>{Ico.arrowUp({ c: T.warn, size: 16 })}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Pool now at</div>
                <div style={{ fontSize: 12, color: T.slate }}>Live · on-chain</div>
              </div>
              {pool && pool.ok ? <span className="sl-balance" style={{ fontSize: 16, fontWeight: 600 }}>{pool.pesoLabel}</span> : null}
            </div>
          </Card>
          {done.link && (
            <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, background: T.actionTint, color: T.action, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
              {Ico.check({ size: 16, c: T.action })}
              <a href={done.link} target="_blank" rel="noopener noreferrer" style={{ color: T.action, fontFamily: T.fontMono, display: "inline-flex", alignItems: "center", gap: 5 }}>
                Receipt · verifiable on Stellar {Ico.link({ size: 13, c: T.action })}
              </a>
            </div>
          )}
        </div>
        <div style={{ padding: "22px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
          <Btn kind="primary" onClick={() => { setDone(null); setPhase("view"); }}>View public feed</Btn>
          <Btn kind="ghost" onClick={() => router.push("/")}>Done</Btn>
        </div>
      </div>
    );
  }

  // ── DONATE · AMOUNT ──
  if (phase === "amount") {
    return (
      <div style={shell}>
        <AppBar leading={<IconButton onClick={() => setPhase("view")}>{Ico.back({})}</IconButton>} title="Donate" />
        <div style={{ padding: "8px 16px 12px" }}>
          <Card>
            <Chip kind="warn">Active relief</Chip>
            <div style={{ marginTop: 10, fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>Disaster Relief Pool</div>
            <div style={{ marginTop: 6, fontSize: 13, color: T.slate, lineHeight: 1.5 }}>
              100% of donations are held by the contract and disbursed only while a disaster is active — every peso published live.
            </div>
          </Card>
        </div>
        <div style={{ padding: "8px 24px 0" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.slate }}>You&apos;re donating</div>
        </div>
        <div style={{ padding: "12px 24px 0", textAlign: "center" }}>
          <div className="sl-balance" style={{ fontSize: 54, fontWeight: 600, letterSpacing: "-0.03em", display: "inline-flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 28, color: T.slate, fontWeight: 500 }}>₱</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="0"
              style={{ width: Math.max(2, amount.length || 1) + "ch", border: "none", outline: "none", background: "transparent", font: "inherit", color: T.ink, textAlign: "center" }}
            />
          </div>
        </div>
        <div style={{ padding: "20px 16px 0", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {QUICK.map((p) => (
            <span key={p} onClick={() => setAmount(p)} style={{ cursor: "pointer" }}>
              <Chip kind={p === amount ? "action" : "neutral"} size="md">₱{Number(p).toLocaleString("en-PH")}</Chip>
            </span>
          ))}
        </div>
        <div style={{ padding: "18px 16px 0" }}>
          <div style={{ padding: "14px 16px", borderRadius: 14, background: T.canvas, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 99, background: T.surface, display: "flex", alignItems: "center", justifyContent: "center" }}>{Ico.shield({ size: 18, c: T.action })}</div>
            <div style={{ flex: 1, fontSize: 12, color: T.slate, lineHeight: 1.4 }}>
              Donations are <strong style={{ color: T.ink }}>final</strong>. Every disbursement is published on this page, verifiable on Stellar.
            </div>
          </div>
        </div>
        {err && (
          <div style={{ margin: "16px 16px 0", padding: "12px 14px", borderRadius: 12, background: "#FBEAE8", color: T.danger, fontSize: 13 }}>{err}</div>
        )}
        <div style={{ padding: "24px 16px 0" }}>
          <Btn kind="primary" disabled={pending || amt <= 0} loading={pending} leading={!pending && Ico.shield({ c: "#fff" })} onClick={donate}>
            Donate ₱{amt.toLocaleString("en-PH")} publicly
          </Btn>
        </div>
      </div>
    );
  }

  // ── VIEW · PUBLIC TRANSPARENCY DASHBOARD ──
  return (
    <div style={shell}>
      <AppBar
        leading={<IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>}
        title=""
        trailing={<span style={{ fontSize: 12, color: T.slate, fontFamily: T.fontMono }}>Public · no login</span>}
      />
      <div style={{ padding: "4px 20px 8px" }}>
        <Chip kind="warn">Live now</Chip>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 8, lineHeight: 1.2 }}>Disaster Relief — public ledger</div>
        <div style={{ fontSize: 13, color: T.slate, marginTop: 6, lineHeight: 1.5 }}>
          Every peso in, every peso out — independently verifiable on Stellar. No login, no middleman.
        </div>
      </div>

      {/* Pool card */}
      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ background: T.ink, color: "#fff", borderRadius: 18, padding: "20px 20px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Pool total · live on-chain</div>
          <div style={{ marginTop: 8 }}>
            {pool === null ? (
              <div style={{ fontSize: 22, color: "rgba(255,255,255,0.6)" }}>Reading testnet…</div>
            ) : pool.ok ? (
              <Peso value={Number(pool.pesoLabel.replace(/[^0-9.]/g, "")) || 0} size={36} color="#fff" />
            ) : (
              <div style={{ fontSize: 16, color: "rgba(255,255,255,0.7)" }}>RPC unavailable — verify on explorer below</div>
            )}
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <div style={{ flex: 1, padding: "8px 10px", background: "rgba(255,255,255,0.06)", borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>Status</div>
              <div className="sl-mono" style={{ fontSize: 15, fontWeight: 600, marginTop: 3 }}>
                {pool && pool.ok ? (pool.active ? "Active" : "Standby") : "—"}
              </div>
            </div>
            <div style={{ flex: 1, padding: "8px 10px", background: "rgba(255,255,255,0.06)", borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>Disburse gate</div>
              <div className="sl-mono" style={{ fontSize: 15, fontWeight: 600, marginTop: 3 }}>Enforced</div>
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 8 }}>
            <span className="sl-pulse" style={{ width: 6, height: 6, borderRadius: 99, background: T.moneyIn }} />
            <span>Payout only releases while a disaster is active</span>
          </div>
        </div>
      </div>

      <div style={{ padding: "16px 16px 0" }}>
        <Btn kind="primary" leading={Ico.shield({ c: "#fff" })} onClick={() => { setErr(""); setPhase("amount"); }}>
          Donate to this pool
        </Btn>
      </div>

      {/* Verifiable trail */}
      <div style={{ padding: "22px 24px 6px", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>
        Verifiable trail · Stellar testnet
      </div>
      <div style={{ padding: "0 16px" }}>
        <Card p={0}>
          {TRAIL.map((tx, i) => (
            <div key={tx.hash} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i < TRAIL.length - 1 ? "1px solid " + T.hairline : "none" }}>
              <div style={{ width: 30, height: 30, borderRadius: 99, background: T.actionTint, color: T.action, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.fontMono, fontSize: 12, fontWeight: 600 }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{tx.step}</div>
                <div style={{ fontSize: 11, color: T.slate, fontFamily: T.fontMono, marginTop: 2 }}>{tx.hash.slice(0, 14)}…</div>
              </div>
              <a href={`${EXPLORER}/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer" style={{ color: T.action, display: "inline-flex" }}>
                {Ico.link({ size: 15, c: T.action })}
              </a>
            </div>
          ))}
        </Card>
        <a
          href={`${EXPLORER}/contract/${DISASTER_CONTRACT}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, color: T.action, fontFamily: T.fontMono, fontWeight: 600 }}
        >
          Disaster contract {DISASTER_CONTRACT.slice(0, 12)}… {Ico.link({ size: 13, c: T.action })}
        </a>
      </div>

      <div style={{ padding: "22px 16px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <PoweredByStellar />
        <span style={{ fontSize: 11, color: T.slate, fontFamily: T.fontMono }}>Read-only · anyone can verify</span>
      </div>
    </div>
  );
}
