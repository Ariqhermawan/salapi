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
} from "@/components/ui/kit";
import { SalapiMascot } from "@/components/ui/mascot";

const box: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 14px",
  borderRadius: T.rCtrl,
  background: T.surface,
  boxShadow: "inset 0 0 0 1px " + T.hairline,
};

export default function SendScreen() {
  const { t } = useT();
  const router = useRouter();
  const [mine, setMine] = useState<string | null>(null);
  const [claim, setClaim] = useState("");
  const [to, setTo] = useState("");
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
      const r = await sendByUsername(to, Number(amount));
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
        <AppBar leading={<IconButton onClick={() => router.push("/")}>{Ico.x({})}</IconButton>} title="" />
        <div style={{ padding: "40px 32px 0", textAlign: "center" }}>
          <div
            className="sl-tick"
            style={{
              width: 96,
              height: 96,
              borderRadius: 99,
              background: T.moneyInTint,
              color: T.moneyIn,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {Ico.check({ size: 48, c: T.moneyIn })}
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
            <SalapiMascot size={50} c={T.moneyIn} pose="cheer" />
          </div>
          <div
            style={{
              marginTop: 22,
              fontSize: 13,
              color: T.slate,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {t("send.sentOk", { amt: amount, to: to.replace(/^@/, "") })}
          </div>
          <div className="sl-rise" style={{ marginTop: 8 }}>
            <Money value={Number(amount) || 0} size={42} />
          </div>
          <div style={{ marginTop: 8, fontSize: 14, color: T.slate }}>
            → <span style={{ color: T.ink, fontWeight: 600 }}>@{to.replace(/^@/, "")}</span>
          </div>
        </div>
        <div style={{ padding: "28px 16px 0" }}>
          <Card>
            <Row title="Arrives" trailing={<span style={{ fontSize: 14, fontWeight: 600, color: T.moneyIn }}>Instantly · Free</span>} divider />
            <Row
              title="Receipt"
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
        <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <Btn kind="secondary" onClick={() => { setDone(null); setAmount(""); setTo(""); }}>Send again</Btn>
          <Btn kind="ghost" onClick={() => router.push("/")}>Done</Btn>
        </div>
      </div>
    );
  }

  // ── NOT FOUND ──
  if (notFound) {
    return (
      <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%" }}>
        <AppBar leading={<IconButton onClick={() => setNotFound(null)}>{Ico.back({})}</IconButton>} title={t("send.title")} />
        <div style={{ padding: "24px 24px 0", textAlign: "center" }}>
          <div style={{ width: 80, height: 80, margin: "0 auto", borderRadius: 99, background: T.canvas, display: "flex", alignItems: "center", justifyContent: "center", color: T.slate }}>
            {Ico.search({ size: 36, c: T.slate })}
          </div>
          <div style={{ marginTop: 18, fontSize: 18, fontWeight: 600 }}>
            @{notFound}
          </div>
          <div style={{ marginTop: 6, fontSize: 14, color: T.slate, lineHeight: 1.5, maxWidth: 260, margin: "6px auto 0" }}>
            {t("send.title")} — no one has claimed this @username yet. Check the
            spelling or invite them.
          </div>
        </div>
        <div style={{ padding: "26px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
          <Btn kind="primary" onClick={() => setNotFound(null)}>
            {t("send.send")}
          </Btn>
        </div>
      </div>
    );
  }

  // ── COMPOSE ──
  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink, paddingBottom: 24 }}>
      <AppBar
        leading={<IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>}
        title={t("send.title")}
        trailing={<IconButton onClick={() => router.push("/receive")}>{Ico.qr({})}</IconButton>}
      />

      {/* Your username */}
      <div style={{ padding: "8px 16px 0" }}>
        <Card p={16}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: T.slate }}>
            {t("send.yourUsername")}
          </div>
          {mine ? (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <Avatar name={mine} size={32} />
              <span style={{ fontWeight: 700, color: T.action }}>@{mine}</span>
            </div>
          ) : (
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <div style={{ ...box, flex: 1 }}>
                <span style={{ color: T.slate }}>@</span>
                <input
                  value={claim}
                  onChange={(e) => setClaim(e.target.value)}
                  placeholder={t("send.choose")}
                  style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 15, color: T.ink, fontFamily: T.fontSans }}
                />
              </div>
              <Btn kind="primary" size="md" full={false} disabled={pending} onClick={doClaim}>
                {t("send.claim")}
              </Btn>
            </div>
          )}
        </Card>
      </div>

      {/* Recipient */}
      <div style={{ padding: "12px 16px 0" }}>
        <div style={box}>
          <span style={{ color: T.slate }}>@</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={t("send.toUsername").replace("@", "")}
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 16, color: T.ink, fontFamily: T.fontSans }}
          />
          {Ico.search({ c: T.slate })}
        </div>
      </div>

      {/* Amount */}
      <div style={{ padding: "30px 24px 0", textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.slate, marginBottom: 12 }}>
          {t("send.sendMoney")}
        </div>
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
      <div style={{ padding: "22px 16px 0", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {["100", "500", "1000", "2000"].map((q) => (
          <span key={q} onClick={() => setAmount(q)} style={{ cursor: "pointer" }}>
            <Chip kind={amount === q ? "action" : "neutral"} size="md">₱{Number(q).toLocaleString("en-PH")}</Chip>
          </span>
        ))}
      </div>

      {err && (
        <div style={{ margin: "16px 16px 0", padding: "12px 14px", borderRadius: 12, background: "#FBEAE8", color: T.danger, fontSize: 13 }}>
          {err}
        </div>
      )}

      <div style={{ padding: "26px 16px 0" }}>
        <Btn kind="primary" disabled={pending || !to || !amount} loading={pending} onClick={doSend} trailing={!pending && Ico.chev({ c: "#fff" })}>
          {pending ? t("send.sending") : t("send.send")}
        </Btn>
      </div>
    </div>
  );
}
