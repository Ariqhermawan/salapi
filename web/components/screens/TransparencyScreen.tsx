"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useGoBack } from "@/lib/ui/useGoBack";
import { disasterState, disasterContribute } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
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
import {
  CURRENCY,
  formatLocalAmount,
  pesoFromLocal,
} from "@/lib/ui/currency";
import type { Locale } from "@/lib/i18n/config";

const EXPLORER = "https://stellar.expert/explorer/testnet";
const DISASTER_CONTRACT = "CCKQ3UVBZ75KSZDO6IPA5U6PFARJG4PLRGN2SAIW5RAGQ6K4B7ZDWBUZ";
// Every Soroban contract Salapi runs on Testnet. Click any line in the UI to
// inspect it on Stellar Expert — the entry point for reviewers verifying the
// "we said we built it, here it is on-chain" claim. Names stay as technical
// artifacts (no localisation).
const CONTRACTS: { name: string; id: string }[] = [
  { name: "base-vault",       id: "CBC6BTKW5VA6Y2XH6WP4IEPWDZ7TBPYSIIOZQMTEH62N62NFT4F4VYDD" },
  { name: "username-registry",id: "CDDINUQXTF6SHZN2ZJ36IT7P4YOJ3OZN3H6LTYHVCQ35YYO7YTAWM4G3" },
  { name: "disaster",         id: DISASTER_CONTRACT },
  { name: "paluwagan",        id: "CCXNSK6IGPSB4QGUSNB2EFZWYV53NKVX5AV3XSJANCDDD7TULGQSY37X" },
  { name: "smart-savings",    id: "CBQBUAOP3T235Q2U63XNC2NQVNAOXQL2KHWALO6FTIOJS46NTKIZJ5WI" },
  { name: "arisan-rooms",     id: "CDAUA3TN4PRJFVHWBITT2DZMCY24DEZRA4NQLZLEX5CKL6AOA6RLII4S" },
];
// Founding on-chain trail: technical proof artifact with real testnet tx
// hashes, step labels stay as technical literals (see ActivityScreen).
const TRAIL: { step: string; hash: string }[] = [
  { step: "Deploy disaster vault", hash: "1bed6a16e6b6b2a8fddf3c8e247764f77f80bc18f58cd019bec225e60d891d12" },
  { step: "Register @juandelacruz", hash: "00d0861463b124d7ec83b1cb5ef65f4b13579167127b8acede5c01362f8bf913" },
  { step: "Initialize(admin, token)", hash: "f49b815b47b052ba12f288c64c1e11e336b9a6a1afaf5d359db08b928e20beb1" },
  { step: "Contribute 5 XLM", hash: "618dedd72dd1ba49f7432dc33e237007da5280c857d00e4eff6164247ad0cd66" },
  { step: "set_disaster(true)", hash: "7ecdeaf152745257b1d0f619503f6f59971068ad1a3bf7dd8499a08295608d0a" },
  { step: "Disburse 2 XLM", hash: "1115f685287faf7b508e97d378df5f4ccb1ccc302d007b2190776ad0c986a837" },
];
// Quick-pick donations per display currency — round figures in each.
const QUICK: Record<Locale, string[]> = {
  en: ["1", "2", "5", "10", "20"],
  tl: ["50", "100", "200", "500", "1000"],
  id: ["10000", "20000", "50000", "100000", "200000"],
  vi: ["20000", "50000", "100000", "200000", "500000"],
};

type Pool = Awaited<ReturnType<typeof disasterState>>;

export default function TransparencyScreen() {
  const { t, currency } = useT();
  const router = useRouter();
  const goBack = useGoBack("/");
  const [pool, setPool] = useState<Pool | null>(null);
  const [phase, setPhase] = useState<"view" | "amount" | "processing" | "done">("view");
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState<{ link?: string } | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const amtTouched = useRef(false);

  async function refresh() {
    setPool(await disasterState());
  }
  useEffect(() => {
    refresh();
  }, []);

  // Prefill a sensible donation in the active display currency, until the
  // user touches the field (currency resolves after hydration).
  useEffect(() => {
    if (!amtTouched.current) setAmount(QUICK[currency][2]);
  }, [currency]);

  const amt = Number(amount) || 0;
  const amtLabel = formatLocalAmount(amt, currency);

  function donate() {
    setPhase("processing");
    start(async () => {
      setErr("");
      const r = await disasterContribute(pesoFromLocal(amt, currency));
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
        <AppBar leading={<IconButton onClick={() => setPhase("amount")}>{Ico.x({})}</IconButton>} title={t("common.processing")} />
        <div style={{ padding: "32px 28px 0", textAlign: "center" }}>
          <div style={{ width: 68, height: 68, borderRadius: 99, background: T.warnTint, color: T.warn, display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <span className="sl-spin" style={{ position: "absolute", inset: 0, borderRadius: 99, border: "3px solid " + T.warn, borderTopColor: "transparent" }} />
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.warn} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 4v6c0 5-4 7-8 8-4-1-8-3-8-8V7l8-4z" /></svg>
          </div>
          <div style={{ marginTop: 14, fontSize: 19, fontWeight: 600 }}>{t("transparency.donating", { amount: amtLabel })}</div>
          <div style={{ marginTop: 4, fontSize: 13, color: T.slate }}>{t("transparency.processingSub")}</div>
        </div>
        <div style={{ padding: "22px 16px 0" }}>
          <Card p={14}>
            {[t("transparency.pStep1"), t("transparency.pStep2"), t("transparency.pStep3")].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: i < 2 ? "1px solid " + T.hairline : "none" }}>
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
        <div style={{ padding: "20px 24px 0", textAlign: "center" }}>
          <div className="sl-tick" style={{ width: 72, height: 72, borderRadius: 99, background: "linear-gradient(160deg,#FBF1E0,#fff)", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 0 0 1px " + T.hairline }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={T.warn} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z" /></svg>
          </div>
          <div style={{ marginTop: 14, fontSize: 12, color: T.slate, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>{t("transparency.thankYou")}</div>
          <div className="sl-rise" style={{ marginTop: 6 }}><Peso value={pesoFromLocal(amt, currency)} size={38} /></div>
          <div style={{ marginTop: 6, fontSize: 13, color: T.slate, lineHeight: 1.5, maxWidth: 280, margin: "6px auto 0" }}>
            {t("transparency.doneNote")}
          </div>
        </div>
        <div style={{ padding: "16px 16px 0" }}>
          <Card p={14}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 99, background: T.warnTint, color: T.warn, display: "flex", alignItems: "center", justifyContent: "center" }}>{Ico.arrowUp({ c: T.warn, size: 14 })}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t("transparency.poolNowAt")}</div>
                <div style={{ fontSize: 12, color: T.slate }}>{t("transparency.liveOnChain")}</div>
              </div>
              {pool && pool.ok ? <Peso value={pool.pesos} size={15} /> : null}
            </div>
          </Card>
          {done.link && (
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: T.actionTint, color: T.action, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
              {Ico.check({ size: 16, c: T.action })}
              <a href={done.link} target="_blank" rel="noopener noreferrer" style={{ color: T.action, fontFamily: T.fontMono, display: "inline-flex", alignItems: "center", gap: 5 }}>
                {t("transparency.receiptVerifiable")} {Ico.link({ size: 13, c: T.action })}
              </a>
            </div>
          )}
        </div>
        <div style={{ padding: "14px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          <Btn kind="primary" onClick={() => { setDone(null); setPhase("view"); }}>{t("transparency.viewFeed")}</Btn>
          <Btn kind="ghost" onClick={() => router.push("/")}>{t("transparency.done")}</Btn>
        </div>
      </div>
    );
  }

  // ── DONATE · AMOUNT ──
  if (phase === "amount") {
    return (
      <div style={shell}>
        <AppBar leading={<IconButton onClick={() => setPhase("view")}>{Ico.back({})}</IconButton>} title={t("wallet.donate")} />
        <div style={{ padding: "4px 16px 8px" }}>
          <Card p={14}>
            <Chip kind="warn">{t("transparency.activeRelief")}</Chip>
            <div style={{ marginTop: 6, fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>{t("transparency.poolName")}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: T.slate, lineHeight: 1.5 }}>
              {t("transparency.poolDesc")}
            </div>
          </Card>
        </div>
        <div style={{ padding: "4px 20px 0" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.slate }}>{t("transparency.youreDonating")}</div>
        </div>
        <div style={{ padding: "6px 24px 0", textAlign: "center" }}>
          <div className="sl-balance" style={{ fontSize: 42, fontWeight: 600, letterSpacing: "-0.03em", display: "inline-flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 24, color: T.slate, fontWeight: 500 }}>
              {CURRENCY[currency].symbol}
            </span>
            <input
              value={amount}
              onChange={(e) => {
                amtTouched.current = true;
                setAmount(e.target.value.replace(/[^0-9.]/g, ""));
              }}
              inputMode="decimal"
              placeholder="0"
              style={{ width: Math.max(2, amount.length || 1) + "ch", border: "none", outline: "none", background: "transparent", font: "inherit", color: T.ink, textAlign: "center" }}
            />
          </div>
        </div>
        <div style={{ padding: "12px 16px 0", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {QUICK[currency].map((p) => (
            <span
              key={p}
              onClick={() => {
                amtTouched.current = true;
                setAmount(p);
              }}
              style={{ cursor: "pointer" }}
            >
              <Chip kind={p === amount ? "action" : "neutral"} size="md">
                {formatLocalAmount(Number(p), currency)}
              </Chip>
            </span>
          ))}
        </div>
        <div style={{ padding: "12px 16px 0" }}>
          <div style={{ padding: "10px 12px", borderRadius: 12, background: T.canvas, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 99, background: T.surface, display: "flex", alignItems: "center", justifyContent: "center" }}>{Ico.shield({ size: 16, c: T.action })}</div>
            <div style={{ flex: 1, fontSize: 12, color: T.slate, lineHeight: 1.4 }}>
              {t("transparency.finalNote")}
            </div>
          </div>
        </div>
        {err && (
          <div style={{ margin: "12px 16px 0", padding: "10px 12px", borderRadius: 10, background: "#FBEAE8", color: T.danger, fontSize: 13 }}>{err}</div>
        )}
        <div style={{ padding: "16px 16px 0" }}>
          <Btn kind="primary" disabled={pending || amt <= 0} loading={pending} leading={!pending && Ico.shield({ c: "#fff" })} onClick={donate}>
            {t("transparency.donatePublicly", { amount: amtLabel })}
          </Btn>
        </div>
      </div>
    );
  }

  // ── VIEW · PUBLIC TRANSPARENCY DASHBOARD ──
  return (
    <div style={shell}>
      <AppBar
        leading={<IconButton onClick={goBack}>{Ico.back({})}</IconButton>}
        title=""
        trailing={<span style={{ fontSize: 12, color: T.slate, fontFamily: T.fontMono }}>{t("transparency.publicNoLogin")}</span>}
      />
      <div style={{ padding: "4px 16px 6px" }}>
        <Chip kind="warn">{t("transparency.liveNow")}</Chip>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 6, lineHeight: 1.2 }}>{t("transparency.title")}</div>
        <div style={{ fontSize: 12.5, color: T.slate, marginTop: 4, lineHeight: 1.5 }}>
          {t("transparency.sub")}
        </div>
      </div>

      {/* Pool card */}
      <div style={{ padding: "10px 16px 0" }}>
        <div style={{ background: T.ink, color: "#fff", borderRadius: 16, padding: "14px 16px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>{t("transparency.poolTotal")}</div>
          <div style={{ marginTop: 6 }}>
            {pool === null ? (
              <div style={{ fontSize: 18, color: "rgba(255,255,255,0.6)" }}>{t("transparency.readingTestnet")}</div>
            ) : pool.ok ? (
              <Peso value={pool.pesos} size={30} color="#fff" />
            ) : (
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)" }}>{t("transparency.rpcUnavailable")}</div>
            )}
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <div style={{ flex: 1, padding: "6px 10px", background: "rgba(255,255,255,0.06)", borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>{t("transparency.statusLabel")}</div>
              <div className="sl-mono" style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
                {pool && pool.ok ? (pool.active ? t("transparency.active") : t("transparency.standby")) : "-"}
              </div>
            </div>
            <div style={{ flex: 1, padding: "6px 10px", background: "rgba(255,255,255,0.06)", borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>{t("transparency.disburseGate")}</div>
              <div className="sl-mono" style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{t("transparency.enforced")}</div>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 8 }}>
            <span className="sl-pulse" style={{ width: 6, height: 6, borderRadius: 99, background: T.moneyIn }} />
            <span>{t("transparency.gateNote")}</span>
          </div>
        </div>
      </div>

      {/* Multi-key release — Build-Award preview, honestly badged */}
      <div style={{ padding: "10px 16px 0" }}>
        <div
          style={{
            padding: "11px 13px",
            borderRadius: 12,
            background: T.surface,
            boxShadow: "inset 0 0 0 1px " + T.hairline,
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 99,
              background: T.actionTint,
              color: T.action,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "0 0 auto",
            }}
          >
            {Ico.shield({ size: 15, c: T.action })}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>
                {t("transparency.multiKeyTitle")}
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: T.action,
                  background: T.actionTint,
                  padding: "2px 6px",
                  borderRadius: 999,
                }}
              >
                {t("home.circlesBadge")}
              </span>
            </div>
            <div style={{ marginTop: 3, fontSize: 11.5, color: T.slate, lineHeight: 1.45 }}>
              {t("transparency.multiKeyBody")}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "12px 16px 0" }}>
        <Btn kind="primary" leading={Ico.shield({ c: "#fff" })} onClick={() => { setErr(""); setPhase("amount"); }}>
          {t("transparency.donateCta")}
        </Btn>
      </div>

      {/* Verifiable trail */}
      <div style={{ padding: "16px 20px 4px", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>
        {t("transparency.trailLabel")}
      </div>
      <div style={{ padding: "0 16px" }}>
        <Card p={0}>
          {TRAIL.map((tx, i) => (
            <div key={tx.hash} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: i < TRAIL.length - 1 ? "1px solid " + T.hairline : "none", minHeight: 44 }}>
              <div style={{ width: 28, height: 28, borderRadius: 99, background: T.actionTint, color: T.action, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.fontMono, fontSize: 11, fontWeight: 600 }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{tx.step}</div>
                <div style={{ fontSize: 11, color: T.slate, fontFamily: T.fontMono, marginTop: 1 }}>{tx.hash.slice(0, 14)}…</div>
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
          style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, color: T.action, fontFamily: T.fontMono, fontWeight: 600 }}
        >
          {t("transparency.disasterContract")} {DISASTER_CONTRACT.slice(0, 12)}… {Ico.link({ size: 13, c: T.action })}
        </a>
      </div>

      {/* Every deployed Soroban contract behind Salapi — click to verify on Stellar Expert. */}
      <div style={{ padding: "22px 20px 4px", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>
        {t("transparency.contractsLabel")}
      </div>
      <div style={{ padding: "0 16px" }}>
        <Card p={0}>
          {CONTRACTS.map((c, i) => (
            <a
              key={c.id}
              href={`${EXPLORER}/contract/${c.id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: i < CONTRACTS.length - 1 ? "1px solid " + T.hairline : "none", color: T.ink, textDecoration: "none", minHeight: 44 }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 99, background: T.actionTint, color: T.action, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
                {Ico.link({ size: 14, c: T.action })}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, fontFamily: T.fontMono }}>{c.name}</div>
                <div style={{ fontSize: 11, color: T.slate, fontFamily: T.fontMono, marginTop: 1 }}>{c.id.slice(0, 14)}…</div>
              </div>
            </a>
          ))}
        </Card>
        <div style={{ marginTop: 8, fontSize: 11, color: T.slate, lineHeight: 1.5, textAlign: "center", padding: "0 8px" }}>
          {t("transparency.contractsBody")}
        </div>
      </div>

      <div style={{ padding: "14px 16px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <PoweredByStellar />
        <span style={{ fontSize: 11, color: T.slate, fontFamily: T.fontMono }}>{t("transparency.readOnly")}</span>
      </div>
    </div>
  );
}
