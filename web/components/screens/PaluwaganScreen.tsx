"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  paluwaganState,
  paluwaganPayMine,
  paluwaganFriendsPay,
  paluwaganCollect,
} from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Card,
  Btn,
  Chip,
  Avatar,
  Peso,
  PoweredByStellar,
} from "@/components/ui/kit";
import { formatLocal } from "@/lib/ui/currency";

type State = Awaited<ReturnType<typeof paluwaganState>>;

const RING = ["#FDE6D9", "#DCEAF8", "#E8E3FA", "#DDF1E5", "#FBEAE0", "#E1ECF6"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function Confetti() {
  const colors = ["#fff", "#FDE6D9", "#DDF1E5", "#FBEAE0", "#E1ECF6"];
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 5 }}>
      {Array.from({ length: 18 }).map((_, i) => {
        const shape = i % 3;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              top: -20,
              left: (i * 37) % 320,
              width: shape === 0 ? 8 : shape === 1 ? 6 : 10,
              height: shape === 0 ? 12 : shape === 1 ? 6 : 4,
              background: colors[i % colors.length],
              borderRadius: shape === 1 ? 99 : 2,
              animation: `sl-confetti ${1.8 + (i % 5) * 0.2}s ${(i % 6) * 0.1}s ease-in forwards`,
              opacity: 0.9,
            }}
          />
        );
      })}
    </div>
  );
}

export default function PaluwaganScreen() {
  const { t, currency } = useT();
  const router = useRouter();
  const [st, setSt] = useState<State | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string; link?: string } | null>(null);
  const [party, setParty] = useState(false);
  const [pending, start] = useTransition();

  async function refresh() {
    setSt(await paluwaganState());
  }
  useEffect(() => {
    refresh();
  }, []);

  function run(
    fn: () => Promise<{ ok: boolean; link?: string; error?: string }>,
    okText: string,
    celebrate = false
  ) {
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (r.ok) {
        setMsg({ tone: "ok", text: okText, link: r.link });
        if (celebrate) {
          setParty(true);
          setTimeout(() => setParty(false), 2400);
        }
      } else {
        setMsg({ tone: "err", text: r.error || t("paluwagan.somethingWrong") });
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

  // ── LOADING ──
  if (st === null) {
    return (
      <div style={shell}>
        <AppBar
          leading={<IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>}
          title={t("paluwagan.title")}
        />
        <div style={{ padding: "60px 24px", textAlign: "center", color: T.slate, fontSize: 14 }}>
          {t("paluwagan.loading")}
        </div>
      </div>
    );
  }

  // ── EMPTY / INVITATION (contract not configured) ──
  if (!st.ready) {
    const features = [
      { ico: Ico.shield, t: t("paluwagan.feature1Title"), s: t("paluwagan.feature1Sub") },
      { ico: Ico.check, t: t("paluwagan.feature2Title"), s: t("paluwagan.feature2Sub") },
      { ico: Ico.refresh, t: t("paluwagan.feature3Title"), s: t("paluwagan.feature3Sub") },
    ];
    return (
      <div style={shell}>
        <AppBar
          leading={<IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>}
          title={t("paluwagan.title")}
        />
        <div style={{ padding: "10px 24px 0" }}>
          <div style={{ position: "relative", width: "100%", height: 200, marginBottom: 24 }}>
            <div style={{ position: "absolute", inset: "10px 50px", borderRadius: 99, border: "2px dashed " + T.hairline }} />
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
              const r = 80, w = 44;
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: `calc(50% + ${Math.cos(a) * r}px - ${w / 2}px)`,
                    top: `calc(50% + ${Math.sin(a) * r}px - ${w / 2}px)`,
                    width: w,
                    height: w,
                    borderRadius: 99,
                    background: i === 0 ? T.action : T.surface,
                    color: i === 0 ? "#fff" : T.slate,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 600,
                    boxShadow: i === 0 ? "0 8px 24px -6px rgba(37,99,235,.5)" : "inset 0 0 0 1px " + T.hairline,
                  }}
                >
                  {i === 0 ? Ico.plus({ size: 20, c: "#fff" }) : "+"}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.action, textAlign: "center" }}>
            {t("paluwagan.kicker")}
          </div>
          <div style={{ fontSize: 25, fontWeight: 600, letterSpacing: "-0.02em", textAlign: "center", marginTop: 6, lineHeight: 1.25 }}>
            {t("paluwagan.inviteTitle")}
          </div>
          <div style={{ marginTop: 10, fontSize: 14, color: T.slate, textAlign: "center", lineHeight: 1.5, padding: "0 8px" }}>
            {t("paluwagan.inviteBody")}
          </div>
        </div>
        <div style={{ padding: "28px 16px 0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {features.map((it) => (
              <div key={it.t} style={{ background: T.surface, borderRadius: 14, padding: "14px 12px", boxShadow: "inset 0 0 0 1px " + T.hairline, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: T.actionTint, color: T.action, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {it.ico({ size: 16, c: T.action })}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{it.t}</div>
                <div style={{ fontSize: 11, color: T.slate, lineHeight: 1.3 }}>{it.s}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: "28px 16px 0", textAlign: "center", color: T.slate, fontSize: 13, lineHeight: 1.5 }}>
          {t("paluwagan.notConfigured")}
        </div>
        <div style={{ padding: "20px 16px 0", display: "flex", justifyContent: "center" }}>
          <PoweredByStellar />
        </div>
      </div>
    );
  }

  // ── ACTIVE CIRCLE (hero) ──
  const seats = st.seats;
  const total = seats.length;
  const paidCount = seats.filter((s) => s.paid).length;
  const mine = seats.find((s) => /^(ikaw|you)/i.test(s.label));
  const iPaid = mine?.paid ?? false;

  return (
    <div style={shell}>
      {party && <Confetti />}
      <AppBar
        leading={<IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>}
        title={t("paluwagan.circleName")}
        trailing={<IconButton onClick={() => router.push("/activity")}>{Ico.activity({})}</IconButton>}
      />

      <div style={{ padding: "4px 16px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Chip kind="action">
            {t("paluwagan.roundChip", { n: pad2(st.round + 1), total: pad2(total) })}
          </Chip>
          <Chip kind="neutral">{t("paluwagan.monthly")}</Chip>
        </div>
        <Chip
          kind="success"
          leading={<span className="sl-pulse" style={{ width: 6, height: 6, borderRadius: 99, background: T.moneyIn, display: "inline-block" }} />}
        >
          {t("paluwagan.live")}
        </Chip>
      </div>

      {/* Circle visual */}
      <div style={{ padding: "10px 16px 0" }}>
        <div style={{ position: "relative", width: "100%", height: 220, background: T.surface, borderRadius: 20, boxShadow: "inset 0 0 0 1px " + T.hairline, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: "24px 50px", borderRadius: 99, border: "2px dashed " + T.hairline }} />
          {seats.map((m, i) => {
            const a = (i / total) * Math.PI * 2 - Math.PI / 2;
            const r = 80;
            const turn = m.isRecipient;
            const w = turn ? 50 : 40;
            return (
              <div
                key={m.addr}
                style={{
                  position: "absolute",
                  left: `calc(50% + ${Math.cos(a) * r}px - ${w / 2}px)`,
                  top: `calc(50% + ${Math.sin(a) * r}px - ${w / 2}px)`,
                  width: w,
                  height: w,
                  transition: "all .4s",
                }}
              >
                <div
                  style={{
                    width: w,
                    height: w,
                    borderRadius: 99,
                    background: RING[i % RING.length],
                    color: "#3d2a18",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: turn ? 16 : 14,
                    fontWeight: 600,
                    boxShadow: turn
                      ? "0 0 0 3px " + T.action + ", 0 8px 24px -6px rgba(37,99,235,.5)"
                      : m.paid
                        ? "inset 0 0 0 1.5px " + T.moneyIn
                        : "inset 0 0 0 1px " + T.hairline,
                    position: "relative",
                  }}
                >
                  {m.label.trim().charAt(0).toUpperCase()}
                  {m.paid && !turn && (
                    <div style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: 99, background: T.moneyIn, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 2px " + T.surface }}>
                      {Ico.check({ size: 10, c: "#fff" })}
                    </div>
                  )}
                  {turn && (
                    <div style={{ position: "absolute", top: -22, left: "50%", transform: "translateX(-50%)", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: T.action, whiteSpace: "nowrap" }}>
                      ↓ {t("paluwagan.statusReceiving").toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 104, height: 104, borderRadius: 99, background: T.ink, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, boxShadow: "0 10px 28px -8px rgba(11,18,32,.4)" }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>
              {t("paluwagan.pot")}
            </div>
            <Peso value={st.potPesos} size={19} weight={600} color="#fff" />
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontFamily: T.fontMono }}>
              {t("paluwagan.paidCount", { paid: paidCount, total })}
            </div>
          </div>
        </div>
      </div>

      {/* Status card */}
      <div style={{ padding: "12px 16px 0" }}>
        <Card p={14}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>
                {t("paluwagan.goesTo")}
              </div>
              <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar name={st.recipientLabel} size={26} />
                <div style={{ fontSize: 15, fontWeight: 600 }}>{st.recipientLabel}</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>
                {t("paluwagan.shareEach")}
              </div>
              <div style={{ marginTop: 4 }}>
                <Peso value={st.sharePesos} size={17} weight={600} />
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 10, background: T.canvas, fontSize: 12, color: T.slate, display: "flex", gap: 8, alignItems: "center" }}>
            {Ico.shield({ size: 14, c: iPaid ? T.moneyIn : T.slate })}
            <span>
              {iPaid
                ? t("paluwagan.youPaid", { n: pad2(st.round + 1) })
                : t("paluwagan.youNotPaid", { n: pad2(st.round + 1) })}
            </span>
          </div>
        </Card>
      </div>

      {/* Pre-round reminder — a nudge before the round closes */}
      {!st.allPaid && (
        <div style={{ padding: "12px 16px 0" }}>
          <div
            style={{
              padding: "11px 13px",
              borderRadius: 12,
              background: T.actionTint,
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
                background: T.surface,
                color: T.action,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "0 0 auto",
              }}
            >
              {Ico.bell({ size: 15, c: T.action })}
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: T.action }}>
                {t("paluwagan.reminderTitle")}
              </div>
              <div style={{ marginTop: 2, fontSize: 12, color: T.slate, lineHeight: 1.45 }}>
                {t("paluwagan.reminderBody")}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  color: T.slate,
                  fontFamily: T.fontMono,
                }}
              >
                {t("paluwagan.paidCount", { paid: paidCount, total })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Member wall */}
      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate, padding: "0 4px 6px" }}>
          {t("paluwagan.members")}
        </div>
        <Card p={0}>
          {seats.map((m, i) => {
            const status = m.isRecipient
              ? { label: t("paluwagan.statusReceiving"), kind: "action" as const }
              : m.paid
                ? { label: t("paluwagan.statusPaid"), kind: "success" as const }
                : { label: t("paluwagan.statusNotPaid"), kind: "neutral" as const };
            return (
              <div
                key={m.addr}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderBottom: i < seats.length - 1 ? "1px solid " + T.hairline : "none",
                  minHeight: 44,
                }}
              >
                <Avatar name={m.label} size={30} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600 }}>
                  {m.label}
                </div>
                <Chip kind={status.kind} size="sm">
                  {status.label}
                </Chip>
              </div>
            );
          })}
        </Card>
      </div>

      {msg && (
        <div style={{ padding: "10px 16px 0" }}>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              background: msg.tone === "ok" ? T.moneyInTint : "#FBEAE8",
              color: msg.tone === "ok" ? T.moneyIn : T.danger,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontWeight: 600 }}>
              {msg.tone === "ok" ? "✓ " : ""}
              {msg.text}
            </span>
            {msg.link && (
              <a
                href={msg.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: T.action, fontFamily: T.fontMono, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                {t("paluwagan.viewOnStellar")} {Ico.link({ size: 13, c: T.action })}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: "12px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
        {st.allPaid ? (
          <Btn
            kind="primary"
            loading={pending}
            disabled={pending}
            leading={!pending && Ico.check({ c: "#fff" })}
            onClick={() =>
              run(paluwaganCollect, t("paluwagan.potReleased", { who: st.recipientLabel }), true)
            }
          >
            {pending
              ? t("paluwagan.releasing")
              : t("paluwagan.releasePot", {
                  pot: formatLocal(st.potPesos, currency),
                  who: st.recipientLabel,
                })}
          </Btn>
        ) : (
          <Btn
            kind="primary"
            loading={pending}
            disabled={pending || iPaid}
            leading={!pending && Ico.check({ c: "#fff" })}
            onClick={() =>
            run(
              paluwaganPayMine,
              t("paluwagan.sharePaidOk", {
                share: formatLocal(st.sharePesos, currency),
              })
            )
          }
          >
            {iPaid
              ? t("paluwagan.sharePaid")
              : pending
                ? t("paluwagan.paying")
                : t("paluwagan.payShare", {
                    share: formatLocal(st.sharePesos, currency),
                  })}
          </Btn>
        )}
        <Btn
          kind="secondary"
          disabled={pending || st.allPaid}
          onClick={() => run(paluwaganFriendsPay, t("paluwagan.friendsPaidOk"))}
        >
          {t("paluwagan.simFriends")}
        </Btn>
      </div>

      <div style={{ padding: "12px 16px 0", display: "flex", justifyContent: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
