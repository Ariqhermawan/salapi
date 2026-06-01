"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerUsername, myUsername, sendByUsername } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
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
  Avatar,
  PoweredByStellar,
} from "@/components/ui/kit";
import { SalapiMascot } from "@/components/ui/mascot";
import {
  CURRENCY,
  formatLocalAmount,
  pesoFromLocal,
} from "@/lib/ui/currency";
import type { Locale } from "@/lib/i18n/config";

// Quick-pick send amounts per display currency — round figures in each.
const QUICK: Record<Locale, string[]> = {
  en: ["2", "5", "10", "20"],
  tl: ["100", "500", "1000", "2000"],
  id: ["20000", "50000", "100000", "200000"],
  vi: ["50000", "100000", "200000", "500000"],
};

const box: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 14px",
  borderRadius: T.rCtrl,
  background: T.surface,
  boxShadow: "inset 0 0 0 1px " + T.hairline,
};

export default function SendScreen({ initialTo }: { initialTo?: string }) {
  const { t, currency } = useT();
  const router = useRouter();
  const [mine, setMine] = useState<string | null>(null);
  const [claim, setClaim] = useState("");
  // Pre-fill from a scanned Receive QR (?to=). Sanitize to the username charset
  // so the query param can never inject anything unexpected into the field.
  const [to, setTo] = useState(() =>
    (initialTo ?? "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 32)
  );
  const [amount, setAmount] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState<null | { link: string }>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    myUsername().then(setMine);
  }, []);

  function doClaim() {
    start(async () => {
      setErr("");
      const r = await registerUsername(claim);
      if (r.ok) setMine(r.name);
      else setErr(r.error);
    });
  }
  function doSend() {
    start(async () => {
      setErr("");
      setNotFound(null);
      const r = await sendByUsername(to, pesoFromLocal(Number(amount), currency));
      if (r.ok) setDone({ link: r.link });
      else if (/not found/i.test(r.error))
        setNotFound(to.replace(/^@/, ""));
      else setErr(r.error);
    });
  }

  // ── SENT ──
  if (done) {
    return (
      <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%" }}>
        <AppBar leading={<IconButton ariaLabel="Close" onClick={() => router.push("/")}>{Ico.x({})}</IconButton>} title="" />
        <div style={{ padding: "24px 24px 0", textAlign: "center" }}>
          <div
            className="sl-tick"
            style={{
              width: 78,
              height: 78,
              margin: "0 auto",
              borderRadius: 99,
              background: T.moneyInTint,
              color: T.moneyIn,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 10px 26px -10px rgba(5,150,105,.55), inset 0 0 0 1px rgba(5,150,105,.14)",
            }}
          >
            {Ico.check({ size: 40, c: T.moneyIn })}
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
            <SalapiMascot size={42} c={T.moneyIn} pose="cheer" />
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 11,
              color: T.slate,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {t("send.sentOk", {
              amt: formatLocalAmount(Number(amount) || 0, currency),
              to: to.replace(/^@/, ""),
            })}
          </div>
          <div className="sl-rise" style={{ marginTop: 8 }}>
            <Money value={pesoFromLocal(Number(amount) || 0, currency)} size={40} />
          </div>
          <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 6px", borderRadius: 99, background: T.surface, boxShadow: "inset 0 0 0 1px " + T.hairline }}>
            <Avatar name={to.replace(/^@/, "")} size={24} />
            <span style={{ fontSize: 13.5, color: T.ink, fontWeight: 700 }}>@{to.replace(/^@/, "")}</span>
          </div>
        </div>
        <div style={{ padding: "20px 16px 0" }}>
          <Card p={4} elevation>
            <Row title={t("send.arrives")} trailing={<span style={{ fontSize: 14, fontWeight: 700, color: T.moneyIn }}>{t("send.arrivesValue")}</span>} divider />
            <Row
              title={t("send.receipt")}
              trailing={
                <a
                  href={done.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13, color: T.action, fontFamily: T.fontMono, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  {t("common.viewOnChain")} {Ico.link({ size: 14, c: T.action })}
                </a>
              }
              divider={false}
            />
          </Card>
        </div>
        <div style={{ padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          <Btn kind="primary" leading={Ico.send({ c: "#fff" })} onClick={() => { setDone(null); setAmount(""); setTo(""); }}>{t("send.sendAgain")}</Btn>
          <Btn kind="ghost" onClick={() => router.push("/")}>{t("send.done")}</Btn>
        </div>
        <div style={{ padding: "18px 16px 0", display: "flex", justifyContent: "center" }}>
          <PoweredByStellar />
        </div>
      </div>
    );
  }

  // ── NOT FOUND ──
  if (notFound) {
    return (
      <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%" }}>
        <AppBar leading={<IconButton ariaLabel="Back" onClick={() => setNotFound(null)}>{Ico.back({})}</IconButton>} title={t("send.title")} />
        <div style={{ padding: "22px 24px 0", textAlign: "center" }}>
          <div style={{ width: 72, height: 72, margin: "0 auto", borderRadius: 99, background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", color: T.slate, boxShadow: "inset 0 0 0 1px " + T.hairline }}>
            {Ico.search({ size: 30, c: T.slate })}
          </div>
          <div style={{ marginTop: 14, fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em" }}>
            @{notFound}
          </div>
          <div style={{ marginTop: 6, fontSize: 13.5, color: T.slate, lineHeight: 1.55, maxWidth: 268, margin: "6px auto 0" }}>
            {t("send.notFoundBody")}
          </div>
        </div>
        <div style={{ padding: "20px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          <Btn kind="primary" leading={Ico.back({ c: "#fff" })} onClick={() => setNotFound(null)}>
            {t("send.tryAgain")}
          </Btn>
        </div>
      </div>
    );
  }

  // ── COMPOSE ──
  const canSend = !!to && !!amount;
  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <AppBar
        leading={<IconButton ariaLabel="Back" onClick={() => router.push("/")}>{Ico.back({})}</IconButton>}
        title={t("send.title")}
        trailing={<IconButton ariaLabel="Receive" onClick={() => router.push("/receive")}>{Ico.qr({})}</IconButton>}
      />

      {/* Big amount display — premium hero number */}
      <div style={{ padding: "14px 24px 0", textAlign: "center" }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.slate, marginBottom: 10 }}>
          {t("send.sendMoney")}
        </div>
        <div className="sl-balance" style={{ fontSize: 56, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, display: "inline-flex", alignItems: "baseline", gap: 4, color: amount ? T.ink : "rgba(11,18,32,.32)" }}>
          <span style={{ fontSize: 28, color: T.slate, fontWeight: 600, alignSelf: "flex-start", marginTop: 6 }}>
            {CURRENCY[currency].symbol}
          </span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="0"
            style={{ width: Math.max(1, amount.length || 1) + "ch", border: "none", outline: "none", background: "transparent", font: "inherit", color: "inherit", textAlign: "center", padding: 0 }}
          />
        </div>
      </div>

      {/* Quick-pick amounts */}
      <div style={{ padding: "16px 16px 0", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {QUICK[currency].map((q) => (
          <span key={q} onClick={() => setAmount(q)} style={{ cursor: "pointer" }}>
            <Chip kind={amount === q ? "action" : "neutral"} size="md">
              {formatLocalAmount(Number(q), currency)}
            </Chip>
          </span>
        ))}
      </div>

      {/* Recipient */}
      <div style={{ padding: "22px 16px 0" }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate, padding: "0 2px 8px" }}>
          {t("send.toUsername").replace(/^@/, "")}
        </div>
        <div style={{ ...box, padding: "14px 16px" }}>
          <span style={{ color: T.slate, fontSize: 17, fontWeight: 600 }}>@</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={t("send.toUsername").replace("@", "")}
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 16, fontWeight: 600, color: T.ink, fontFamily: T.fontSans }}
          />
          {Ico.search({ c: T.slate })}
        </div>
      </div>

      {/* Your username */}
      <div style={{ padding: "10px 16px 0" }}>
        <Card p={14}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>
            {t("send.yourUsername")}
          </div>
          {mine ? (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar name={mine} size={30} />
              <span style={{ fontWeight: 700, color: T.action, fontSize: 15 }}>@{mine}</span>
              <span style={{ marginLeft: "auto" }}>
                <Chip kind="action" leading={Ico.verify({ size: 11, c: T.action })}>{t("send.yourUsername")}</Chip>
              </span>
            </div>
          ) : (
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <div style={{ ...box, flex: 1 }}>
                <span style={{ color: T.slate, fontWeight: 600 }}>@</span>
                <input
                  value={claim}
                  onChange={(e) => setClaim(e.target.value)}
                  placeholder={t("send.choose")}
                  style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 15, fontWeight: 600, color: T.ink, fontFamily: T.fontSans }}
                />
              </div>
              <Btn kind="primary" size="md" full={false} disabled={pending} onClick={doClaim}>
                {t("send.claim")}
              </Btn>
            </div>
          )}
        </Card>
      </div>

      {err && (
        <div style={{ margin: "14px 16px 0", padding: "11px 14px", borderRadius: T.rCtrl, background: "#FBEAE8", color: T.danger, fontSize: 13, fontWeight: 600 }}>
          {err}
        </div>
      )}

      {/* Spacer pushes the footer + sticky bar down on tall screens */}
      <div style={{ flex: 1, minHeight: 16 }} />

      {/* Footer — scrolls above the sticky send bar */}
      <div style={{ padding: "18px 16px 0", display: "flex", justifyContent: "center" }}>
        <PoweredByStellar />
      </div>

      {/* Sticky send bar — floats above the BottomNav and stays visible while
          scrolling. main has overflow-y-auto + pb so bottom:0 pins it just
          above the nav rather than the viewport edge. */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: 12,
          padding: "12px 16px",
          background: "rgba(244,246,251,0.94)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderTop: "1px solid " + T.hairline,
          boxShadow: "0 -12px 28px -16px rgba(11,18,32,.28)",
          zIndex: 5,
        }}
      >
        <Btn kind="primary" disabled={pending || !canSend} loading={pending} onClick={doSend} trailing={!pending && Ico.chev({ c: "#fff" })}>
          {pending ? t("send.sending") : t("send.send")}
        </Btn>
      </div>
    </div>
  );
}
