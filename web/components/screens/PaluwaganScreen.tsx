"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useGoBack } from "@/lib/ui/useGoBack";
import {
  paluwaganState,
  paluwaganPayMine,
  paluwaganFriendsPay,
  paluwaganCollect,
} from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { moneyCopy, moneyMessage } from "@/lib/i18n/revamp-money";
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
import { isLocalPreview, PREVIEW_WALLET } from "@/lib/local-preview";
import { useUnresolvedSubmission } from "@/lib/ui/useUnresolvedSubmission";
import SubmissionStatusPanel from "@/components/ui/SubmissionStatusPanel";
import SuccessMotion from "@/components/ui/SuccessMotion";
import {
  applyLocalPaluwagan,
  localPaluwaganDisplayPesos,
  localPaluwaganSummary,
  LOCAL_PALUWAGAN_ROSTER,
  readLocalPaluwagan,
  type LocalPaluwaganAction,
  type LocalPaluwaganState,
} from "@/lib/local-preview-paluwagan";

type State = Awaited<ReturnType<typeof paluwaganState>>;
type LocalReview = { action: LocalPaluwaganAction; revision: number; round: number; amountStroops: string; recipientLabel: string };

function localView(state: LocalPaluwaganState): State {
  const summary = localPaluwaganSummary(state);
  const sharePesos = localPaluwaganDisplayPesos(state.shareStroops);
  const potPesos = localPaluwaganDisplayPesos(summary.potStroops);
  return { ready: true, round: state.round, cycleRound: Math.min(state.round + 1, LOCAL_PALUWAGAN_ROSTER.length),
    sharePesos, potPesos, sharePeso: formatLocal(sharePesos, "tl"), potPeso: formatLocal(potPesos, "tl"),
    allPaid: summary.allPaid, recipientLabel: summary.recipientLabel,
    seats: LOCAL_PALUWAGAN_ROSTER.map((member, index) => ({ addr: member.id === "you" ? PREVIEW_WALLET.address : `demo-${member.id}`,
      label: member.label, paid: state.paid[index], isRecipient: member.id === summary.recipientId })) };
}

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
  const submission = useUnresolvedSubmission("paluwagan:legacy");
  const { t, currency, locale } = useT();
  const m = moneyCopy(locale);
  const router = useRouter();
  const goBack = useGoBack("/vaults");
  const [st, setSt] = useState<State | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string; link?: string } | null>(null);
  const [party, setParty] = useState(false);
  const [transitionPending, start] = useTransition();
  const pending = transitionPending || submission.locked;
  const submitting = useRef(false);
  const [localState, setLocalState] = useState<LocalPaluwaganState | null>(null);
  const [localReview, setLocalReview] = useState<LocalReview | null>(null);
  const reviewedLocal = useRef<LocalReview | null>(null);
  const [localSuccess, setLocalSuccess] = useState("");
  const [localNeedsReload, setLocalNeedsReload] = useState(false);

  async function refresh() {
    if (isLocalPreview) {
      const result = readLocalPaluwagan();
      if (result.ok) { setLocalState(result.state); setSt(localView(result.state)); setLocalNeedsReload(false); setMsg(null); }
      else { setLocalState(null); setSt({ ready: false }); setLocalNeedsReload(true); setMsg({ tone: "err", text: result.error }); }
      return;
    }
    try { setSt(await paluwaganState()); }
    catch {
      setSt({ ready: false });
      setMsg({ tone: "err", text: "The circle could not be loaded. Reload this page to try again." });
    }
  }
  useEffect(() => {
    Promise.resolve().then(refresh);
  }, []);

  function reviewLocal(action: LocalPaluwaganAction) {
    if (!isLocalPreview || !localState || pending || submitting.current || localNeedsReload) return;
    const summary = localPaluwaganSummary(localState);
    if (summary.completed || action === "pay-mine" && localState.paid[0] ||
      action === "friends-pay" && localState.paid.slice(1).every(Boolean) || action === "collect" && !summary.allPaid) return;
    const shares = action === "friends-pay" ? localState.paid.slice(1).filter(paid => !paid).length : 1;
    const review: LocalReview = { action, revision: localState.revision, round: localState.round + 1,
      amountStroops: action === "collect" ? summary.fullPotStroops : (BigInt(localState.shareStroops) * BigInt(shares)).toString(),
      recipientLabel: summary.recipientLabel };
    reviewedLocal.current = review;
    setLocalReview(review);
    setMsg(null);
    setLocalSuccess("");
  }

  function confirmLocal() {
    const review = reviewedLocal.current;
    if (!isLocalPreview || !review || submitting.current) return;
    submitting.current = true;
    reviewedLocal.current = null;
    setLocalReview(null);
    setLocalSuccess("");
    try {
      const result = applyLocalPaluwagan(review.action, review.revision);
      if (!result.ok) { setLocalNeedsReload(true); setMsg({ tone: "err", text: result.error }); return; }
      setLocalState(result.state);
      setSt(localView(result.state));
      setMsg(null);
      setLocalSuccess(review.action === "collect" ? m("Example round {round} payout saved for {name}.", { round: review.round, name: review.recipientLabel === "You" ? m("You") : review.recipientLabel }) : m("Example contributions saved for this browser session."));
    } finally { submitting.current = false; }
  }

  function run(
    fn: () => Promise<{ ok: boolean; link?: string; error?: string }>,
    okText: string,
    celebrate = false
  ) {
    if (submitting.current || submission.locked) return;
    submitting.current = true;
    start(async () => {
      setMsg(null);
      try {
        if (isLocalPreview) { setMsg({ tone: "ok", text: m("Local demo only. No contribution or payout was submitted.") }); return; }
        const r = await submission.run(fn);
        if (!r) return;
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
      } catch {
        setMsg({ tone: "err", text: m("The operation was not confirmed. Check the wallet history before trying again.") });
      } finally {
        submitting.current = false;
      }
    });
  }

  const shell: React.CSSProperties = {
    fontFamily: T.fontSans,
    color: T.ink,
    minHeight: "100%",
    paddingBottom: isLocalPreview ? 24 : 110,
  };

  // ── LOADING ──
  if (st === null) {
    return (
      <div style={shell}>
        <SubmissionStatusPanel guard={submission} onRefresh={refresh} />
        <AppBar
          leading={<IconButton ariaLabel={m("Back to Vaults")} onClick={goBack}>{Ico.back({})}</IconButton>}
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
        <SubmissionStatusPanel guard={submission} onRefresh={refresh} />
        <AppBar
          leading={<IconButton ariaLabel={m("Back to Vaults")} onClick={goBack}>{Ico.back({})}</IconButton>}
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
          {isLocalPreview ? m("The saved local circle could not be loaded. No example record was overwritten and no tokens moved.") : t("paluwagan.notConfigured")}
        </div>
        {msg && <p role="alert" style={{ padding: "0 20px", color: T.danger, fontSize: 13 }}>{moneyMessage(locale, msg.text)}</p>}
        {isLocalPreview && <div style={{ padding: "0 16px" }}><Btn kind="secondary" onClick={() => void refresh()}>{m("Reload local circle")}</Btn></div>}
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
  const completedLocal = isLocalPreview && localState ? localPaluwaganSummary(localState).completed : false;

  return (
    <div style={shell}>
      <SubmissionStatusPanel guard={submission} onRefresh={refresh} />
      {party && <Confetti />}
      <AppBar
        leading={<IconButton ariaLabel={m("Back to Vaults")} onClick={goBack}>{Ico.back({})}</IconButton>}
        title={t("paluwagan.circleName")}
        trailing={<IconButton ariaLabel={m("View Activity")} onClick={() => router.push("/activity")}>{Ico.activity({})}</IconButton>}
      />

      <div style={{ padding: "8px 16px" }}><Card p={18} style={{ background: "#F2EFE7" }}><Chip kind="warn">{isLocalPreview ? m("EXAMPLE ROOM") : m("LEGACY TESTNET MODE")}</Chip><p style={{ margin: "10px 0 0", fontSize: 13, color: T.slate, lineHeight: 1.55 }}>{m("This Paluwagan uses a fixed roster and contributions each round. Arisan Rooms use a separate upfront deposit model. A missing contribution can hold up this pot; this legacy mode has no donor refund flow.")}</p>{isLocalPreview && <p style={{ margin: "8px 0 0", fontSize: 12, color: T.slate, lineHeight: 1.5 }}>{m("Browser-only example, including the two starting paid shares. No real deposits, tokens, wallet balance changes, contract calls or notifications. Rotation: Maria, Jose, then You.")}</p>}</Card></div>

      <div style={{ padding: "4px 16px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Chip kind="action">
            {t("paluwagan.roundChip", {
              n: pad2(st.cycleRound),
              total: pad2(total),
            })}
          </Chip>
          <Chip kind="neutral">{isLocalPreview ? completedLocal ? m("Cycle complete") : m("Fixed rotation") : t("paluwagan.monthly")}</Chip>
        </div>
        <Chip
          kind="success"
          leading={<span className="sl-pulse" style={{ width: 6, height: 6, borderRadius: 99, background: T.moneyIn, display: "inline-block" }} />}
        >
          {isLocalPreview ? m("Local example") : t("paluwagan.live")}
        </Chip>
      </div>

      {/* Circle visual */}
      <div style={{ padding: "10px 16px 0" }}>
        <div style={{ position: "relative", width: "100%", height: 220, background: T.surface, borderRadius: 20, boxShadow: "inset 0 0 0 1px " + T.hairline, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: "24px 50px", borderRadius: 99, border: "2px dashed " + T.hairline }} />
          {seats.map((member, i) => {
            const a = (i / total) * Math.PI * 2 - Math.PI / 2;
            const r = 80;
            const turn = member.isRecipient;
            const w = turn ? 50 : 40;
            return (
              <div
                key={member.addr}
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
                      : member.paid
                        ? "inset 0 0 0 1.5px " + T.moneyIn
                        : "inset 0 0 0 1px " + T.hairline,
                    position: "relative",
                  }}
                >
                  {member.label.trim().charAt(0).toUpperCase()}
                  {member.paid && !turn && (
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
              {isLocalPreview ? m("Example pot") : t("paluwagan.pot")}
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
                {isLocalPreview ? completedLocal ? m("Example cycle") : m("Next example payout") : t("paluwagan.goesTo")}
              </div>
              <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar name={st.recipientLabel} size={26} />
                <div style={{ fontSize: 15, fontWeight: 600 }}>{st.recipientLabel === "You" ? m("You") : st.recipientLabel}</div>
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
              {isLocalPreview ? m("Example contribution status only. No tokens are held or moved by this preview.") : iPaid
                ? t("paluwagan.youPaid", { n: pad2(st.cycleRound) })
                : t("paluwagan.youNotPaid", { n: pad2(st.cycleRound) })}
            </span>
          </div>
        </Card>
      </div>

      {/* Pre-round reminder — a nudge before the round closes */}
      {!st.allPaid && !completedLocal && (
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
                {isLocalPreview ? m("This reminder is illustrative. No messages or notifications are sent.") : m("Agree on payment reminders with your circle before the round closes.")}
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
          {seats.map((member, i) => {
            const status = completedLocal
              ? { label: m("Example payout saved"), kind: "success" as const }
              : member.isRecipient
              ? { label: t("paluwagan.statusReceiving"), kind: "action" as const }
              : member.paid
                ? { label: t("paluwagan.statusPaid"), kind: "success" as const }
                : { label: t("paluwagan.statusNotPaid"), kind: "neutral" as const };
            return (
              <div
                key={member.addr}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderBottom: i < seats.length - 1 ? "1px solid " + T.hairline : "none",
                  minHeight: 44,
                }}
              >
                <Avatar name={member.label} size={30} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600 }}>
                  {member.label === "You" ? m("You") : member.label}
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
            role={msg.tone === "err" ? "alert" : "status"}
          >
            <span style={{ fontWeight: 600 }}>
              {msg.tone === "ok" ? "✓ " : ""}
              {moneyMessage(locale, msg.text)}
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

      {isLocalPreview && localSuccess && <div style={{ padding: "12px 16px 0" }}><SuccessMotion title={localSuccess}><p style={{ margin: 0 }}>{m("Local simulation only. No tokens moved and no on-chain receipt was created.")}</p></SuccessMotion></div>}

      {isLocalPreview && localReview && <div style={{ padding: "12px 16px 0" }}><Card p={18} style={{ background: "#F2EFE7" }}>
        <section aria-label={m("Review local Paluwagan action")}>
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>{localReview.action === "collect" ? m("Review example payout") : m("Review example contribution")}</h2>
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "1fr auto", gap: 8, fontSize: 14 }}>
            <dt>{m("Example round")}</dt><dd style={{ margin: 0 }}>{localReview.round} of {total}</dd>
            <dt>{m("Illustrative amount")}</dt><dd style={{ margin: 0, fontWeight: 600 }}>{formatLocal(localPaluwaganDisplayPesos(localReview.amountStroops), currency)}</dd>
            <dt>{localReview.action === "collect" ? m("Example recipient") : m("Marked paid")}</dt><dd style={{ margin: 0 }}>{localReview.action === "collect" ? (localReview.recipientLabel === "You" ? m("You") : localReview.recipientLabel) : localReview.action === "pay-mine" ? m("You") : m("Unpaid friends only")}</dd>
          </dl>
          <p style={{ fontSize: 12, lineHeight: 1.5, color: T.slate }}>{m("This only saves fictional circle progress in this browser session. It does not debit your wallet, send funds, pay fees or produce a Stellar transaction.")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Btn kind="primary" disabled={pending} onClick={confirmLocal}>{m("Confirm local simulation")}</Btn>
            <Btn kind="ghost" disabled={pending} onClick={() => { reviewedLocal.current = null; setLocalReview(null); }}>{m("Cancel")}</Btn>
          </div>
        </section>
      </Card></div>}

      {/* Actions */}
      <div style={{ padding: "12px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
        {completedLocal ? <Card p={16}><h2 style={{ margin: "0 0 8px", fontSize: 18 }}>{m("Example cycle complete.")}</h2><p style={{ margin: 0, fontSize: 13, color: T.slate, lineHeight: 1.5 }}>{m("All three fictional members have one saved example payout. There is no fourth round, automatic restart or real money movement.")}</p></Card> : st.allPaid ? (
          <Btn
            kind="primary"
            loading={pending}
            disabled={pending || localNeedsReload}
            leading={!pending && Ico.check({ c: "#fff" })}
            onClick={() =>
              isLocalPreview ? reviewLocal("collect") : run(paluwaganCollect, t("paluwagan.potReleased", { who: st.recipientLabel }), true)
            }
          >
            {isLocalPreview ? m("Review example payout · {amount} to {name}", { amount: formatLocal(st.potPesos, currency), name: st.recipientLabel === "You" ? m("You") : st.recipientLabel }) : pending
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
            disabled={pending || iPaid || localNeedsReload}
            leading={!pending && Ico.check({ c: "#fff" })}
            onClick={() =>
            isLocalPreview ? reviewLocal("pay-mine") : run(
              paluwaganPayMine,
              t("paluwagan.sharePaidOk", {
                share: formatLocal(st.sharePesos, currency),
              })
            )
          }
          >
            {isLocalPreview ? iPaid ? m("Your example share is marked paid") : m("Review my example share · {amount}", { amount: formatLocal(st.sharePesos, currency) }) : iPaid
              ? t("paluwagan.sharePaid")
              : pending
                ? t("paluwagan.paying")
                : t("paluwagan.payShare", {
                    share: formatLocal(st.sharePesos, currency),
                  })}
          </Btn>
        )}
        {!completedLocal && <Btn
          kind="secondary"
          disabled={pending || st.allPaid || localNeedsReload || isLocalPreview && !!localState?.paid.slice(1).every(Boolean)}
          onClick={() => isLocalPreview ? reviewLocal("friends-pay") : run(paluwaganFriendsPay, t("paluwagan.friendsPaidOk"))}
        >
          {isLocalPreview ? m("Review friends' example shares") : t("paluwagan.simFriends")}
        </Btn>}
        {isLocalPreview && <Btn kind="ghost" disabled={pending} onClick={() => { reviewedLocal.current = null; setLocalReview(null); setLocalSuccess(""); void refresh(); }}>{m("Reload local circle")}</Btn>}
      </div>

      {isLocalPreview && localState && localState.payouts.length > 0 && <div style={{ padding: "14px 16px 0" }}><Card p={16}>
        <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>{m("Example payout history")}</h2>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: T.slate }}>{m("Browser-session examples, not payment receipts or confirmed transactions.")}</p>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.8 }}>{localState.payouts.map(payout => <li key={payout.round}>{m("Round")} {payout.round}: {LOCAL_PALUWAGAN_ROSTER.find(member => member.id === payout.recipientId)?.label} · {formatLocal(localPaluwaganDisplayPesos(payout.amountStroops), currency)}</li>)}</ol>
      </Card></div>}

      <div style={{ padding: "12px 16px 0", display: "flex", justifyContent: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
