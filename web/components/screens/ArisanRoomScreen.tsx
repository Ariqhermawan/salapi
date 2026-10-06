"use client";
import SuccessMotion from "@/components/ui/SuccessMotion";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  arisanRoomState,
  arisanStart,
  arisanCancel,
  arisanLeave,
  arisanCommit,
  arisanReveal,
  arisanFinalize,
  arisanFriendsCommit,
  arisanFriendsReveal,
  arisanFriendsJoin,
  arisanPostpone,
} from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Btn,
  Chip,
  Avatar,
  PoweredByStellar,
} from "@/components/ui/kit";
import { formatLocal } from "@/lib/ui/currency";
import { isLocalPreview, PREVIEW_WALLET as PREVIEW_ACCOUNT } from "@/lib/local-preview";
import { useUnresolvedSubmission } from "@/lib/ui/useUnresolvedSubmission";
import SubmissionStatusPanel from "@/components/ui/SubmissionStatusPanel";
import styles from "./ArisanRoomRevamp.module.css";
import { readPreviewArisanRoom, savePreviewArisanRoom, type PreviewArisanChange } from "./arisan-preview";
const PREVIEW_WALLET = PREVIEW_ACCOUNT.address;

type State = Awaited<ReturnType<typeof arisanRoomState>>;
type FinalizeResult = Awaited<ReturnType<typeof arisanFinalize>>;
type ReadyRoom = Extract<State, { ready: true }>;
type PreviewAction = "join" | "start" | "cancel" | "leave" | "commit" | "friendsCommit" | "reveal" | "friendsReveal" | "postpone";
function loadLocalRoom(roomId: number): ReadyRoom {
  const saved = readPreviewArisanRoom(roomId);
  if (saved) return saved;
  const time = Math.floor(Date.now()/1000);
  let draft: { id: number; name: string; members: number; share: number; sharePesos?: number; cadence: "Weekly" | "Biweekly" | "Monthly" } | null = null;
  try { draft = JSON.parse(sessionStorage.getItem("salapi.preview.arisan-draft") || "null"); } catch { /* A previous browser session may have stored an invalid draft. */ }
  const created = roomId === 9001 && draft?.id === 9001;
  let joined = false; let left = false; let cancelled = false;
  try {
    joined = roomId === 1 && sessionStorage.getItem("salapi.preview.arisan-joined") === "1";
    left = roomId === 1 && sessionStorage.getItem("salapi.preview.arisan-left") === "1";
    cancelled = sessionStorage.getItem(`salapi.preview.arisan-cancelled.${roomId}`) === "1";
  } catch { /* Initial restore remains tolerant; every mutation requires checked storage. */ }
  const active = roomId === 2;
  const target = created && draft ? draft.members : active ? 4 : 5;
  const share = created && draft ? (draft.sharePesos ?? draft.share) : active ? 180 : 250;
  const names = created ? ["Ariqhermawan"] : active ? ["Ariqhermawan", "Farrel", "Maya", "Rina"] : ["Ariqhermawan", "Farrel", "Maya", "Rina", "Bayu"];
  const seats = names.map((label,i) => ({ addr: i === 0 ? PREVIEW_WALLET : `LOCAL_MEMBER_${i}`, label, won: active && i === 1, committed: active && i === 2, revealed: false, isYou: i === 0 })).filter(seat => !left || !seat.isYou);
  return { ready: true, id: roomId, name: created && draft ? draft.name : active ? "Weekend community circle" : "Family arisan", code: left ? null : created ? "NEW234" : active ? "CIR234" : "FAM234", host: joined || left || active ? "LOCAL_MEMBER_1" : PREVIEW_WALLET, hostLabel: joined || left || active ? "Farrel" : "Ariqhermawan", cadence: created && draft ? draft.cadence : active ? "Biweekly" : "Weekly", cadenceSecs: 604800, memberTarget: target, memberCount: seats.length, sharePesos: share, sharePeso: String(share), potPesos: share*target, potPeso: String(share*target), status: cancelled ? "Dissolved" : active ? "Active" : "Open", round: active ? 2 : 0, drawPhase: active ? "Commit" : null, firstKocok: time+86400, joinDeadline: time+43200, commitAt: time+3600, revealAt: time+7200, nextActionAt: time+3600, commitCount: active ? 1 : 0, revealCount: 0, eligibleCount: active ? 3 : target, seats, winners: active ? [{ round: 1, addr: "LOCAL_MEMBER_1", label: "Farrel", ts: time-604800 }] : [], isMember: !left, isHost: !active && !joined && !left, readyToStart: !cancelled && !active && !joined && !left && seats.length === target, canCommit: active, canReveal: false, canFinalize: false };
}

const RING = ["#FDE6D9", "#DCEAF8", "#E8E3FA", "#DDF1E5", "#FBEAE0", "#E1ECF6"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtCountdown(secs: number): string {
  if (secs <= 0) return "ready";
  const d = Math.floor(secs / 86_400);
  const h = Math.floor((secs % 86_400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m === 0) return `${Math.ceil(secs)}s`;
  return `${m}m`;
}

function ringPos(i: number, total: number, r: number, w: number) {
  const a = (i / total) * Math.PI * 2 - Math.PI / 2;
  return {
    left: `calc(50% + ${Math.cos(a) * r}px - ${w / 2}px)`,
    top: `calc(50% + ${Math.sin(a) * r}px - ${w / 2}px)`,
  };
}

// ─────────────────────────────────────────────────────────────
// Kocok roulette overlay — lands on the winner the contract returned.
// The animation is presentation only. finalize_draw combines the secrets
// revealed on-chain, pays the selected eligible member, and returns that
// address. The browser never supplies a winner or random index.
// ─────────────────────────────────────────────────────────────
function Roulette({
  seats,
  winnerIdx,
  onDone,
}: {
  seats: { addr: string; label: string; won: boolean; isYou: boolean }[];
  winnerIdx: number;
  onDone: () => void;
}) {
  const { t } = useT();
  const [phase, setPhase] = useState<"spin" | "land">("spin");
  const [pointer, setPointer] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let i = 0;
    tickRef.current = setInterval(() => {
      i++;
      setPointer((p) => (p + 1) % seats.length);
      // Decelerate then land on winnerIdx.
      if (i > 18) {
        if (tickRef.current) clearInterval(tickRef.current);
        setPointer(winnerIdx);
        setPhase("land");
        setTimeout(onDone, 1800);
      }
    }, 80);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerIdx]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(11,18,32,0.86)",
        backdropFilter: "blur(8px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ color: "#fff", fontWeight: 700, letterSpacing: "0.16em", fontSize: 11, textTransform: "uppercase", opacity: 0.7 }}>
        {phase === "spin" ? t("arisan.kocok.spinning") : t("arisan.kocok.winner")}
      </div>
      <div style={{ position: "relative", width: 280, height: 280, marginTop: 14 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 99, border: "2px dashed rgba(255,255,255,0.25)" }} />
        {seats.map((m, i) => {
          const pos = ringPos(i, seats.length, 110, 56);
          const active = i === pointer;
          return (
            <div
              key={m.addr}
              style={{
                position: "absolute",
                ...pos,
                width: 56,
                height: 56,
                borderRadius: 99,
                background: RING[i % RING.length],
                color: "#3d2a18",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: active ? 18 : 14,
                fontWeight: 700,
                transition: "all .25s",
                boxShadow: active
                  ? "0 0 0 4px #fff, 0 0 32px 8px rgba(255,255,255,.45)"
                  : "inset 0 0 0 1px rgba(255,255,255,0.2)",
                transform: active ? "scale(1.18)" : "scale(1)",
              }}
            >
              {m.label.trim().charAt(0).toUpperCase()}
            </div>
          );
        })}
        <div
          style={{
            position: "absolute",
            inset: "50% 50% auto auto",
            transform: "translate(50%, -50%)",
            width: 120,
            height: 120,
            borderRadius: 99,
            background: "rgba(255,255,255,0.07)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
            color: "#fff",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.6 }}>
            {t("arisan.kocok.kocok")}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {phase === "land" ? seats[winnerIdx]?.label.slice(0, 10) : "•••"}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 18, color: "rgba(255,255,255,0.7)", fontSize: 12, textAlign: "center", maxWidth: 320, lineHeight: 1.5 }}>
        {phase === "spin"
          ? t("arisan.kocok.spinFooter")
          : t("arisan.kocok.landFooter")}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main screen — polymorphic per RoomStatus.
// ─────────────────────────────────────────────────────────────
export default function ArisanRoomScreen({ roomId }: { roomId: number }) {
  const submission = useUnresolvedSubmission("arisan:rooms");
  const { t, currency } = useT();
  const router = useRouter();
  const [st, setSt] = useState<State | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string; link?: string } | null>(null);
  const [transitionPending, start] = useTransition();
  const pending = transitionPending || submission.locked;
  const [roulette, setRoulette] = useState<{
    winnerIdx: number;
    link?: string;
    winnerLabel: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    if (isLocalPreview) return;
    try { setSt(await arisanRoomState(roomId)); }
    catch { setSt({ ready: false, error: "Room state could not be read. No operation was resubmitted." }); }
  }
  useEffect(() => {
    const initialLoad = setTimeout(() => { if (isLocalPreview) setSt(loadLocalRoom(roomId)); else void refresh(); }, 0);
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    const poll = isLocalPreview ? null : setInterval(() => void refresh(), 5000);
    return () => {
      clearInterval(tick);
      clearTimeout(initialLoad);
      if (poll) clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  function run<
    T extends { ok: boolean; link?: string; error?: string; errorKey?: string },
  >(fn: () => Promise<T>, okText: string, previewAction?: PreviewAction) {
    if (pending) return;
    if (isLocalPreview) {
      try {
      if (!st?.ready) return;
      // Check storage before changing the in-memory example or claiming it saved.
      readPreviewArisanRoom(roomId, true);
      const changes: PreviewArisanChange[] = [];
      if (previewAction === "leave" || previewAction === "cancel") changes.push({ key: "salapi.preview.arisan-joined", value: null });
      if (previewAction === "leave" && roomId === 1) changes.push({ key: "salapi.preview.arisan-left", value: "1" });
      if (previewAction === "cancel") changes.push({ key: `salapi.preview.arisan-cancelled.${roomId}`, value: "1" });
        const room = { ...st, seats: st.seats.map(seat => ({ ...seat })) };
        if (previewAction === "join") { while (room.seats.length < room.memberTarget) room.seats.push({ addr: `LOCAL_MEMBER_${room.seats.length}`, label: ["Maya","Rina","Bayu","Nadia","Lila"][room.seats.length%5], won: false, committed: false, revealed: false, isYou: false }); room.memberCount = room.seats.length; room.readyToStart = room.isHost; }
        if (previewAction === "start") { room.status = "Active"; room.round = 1; room.drawPhase = "Commit"; room.canCommit = true; room.readyToStart = false; }
        if (previewAction === "cancel") { room.status = "Dissolved"; room.readyToStart = false; }
        if (previewAction === "leave") { room.seats = room.seats.filter(seat => !seat.isYou); room.memberCount = room.seats.length; room.isMember = false; room.isHost = false; room.readyToStart = false; room.code = null; }
        if (previewAction === "commit" || previewAction === "friendsCommit") { room.seats = room.seats.map(seat => ({ ...seat, committed: !seat.won && (previewAction === "friendsCommit" || seat.isYou) || seat.committed })); room.commitCount = room.seats.filter(seat => seat.committed).length; room.canCommit = false; if (room.commitCount >= room.eligibleCount) { room.drawPhase = "Reveal"; room.canReveal = !!room.seats.find(seat => seat.isYou)?.committed; } }
        if (previewAction === "reveal" || previewAction === "friendsReveal") { room.seats = room.seats.map(seat => ({ ...seat, revealed: seat.committed && (previewAction === "friendsReveal" || seat.isYou) || seat.revealed })); room.revealCount = room.seats.filter(seat => seat.revealed).length; room.canReveal = false; if (room.revealCount >= room.commitCount) { room.drawPhase = "Finalizable"; room.canFinalize = true; } }
        if (previewAction === "postpone") { room.nextActionAt += 60; room.commitAt += 60; }
        if (!savePreviewArisanRoom(room, changes)) throw new Error("Preview room could not be saved.");
        setSt(room);
        setMsg({ tone: "ok", text: "Local example saved for this browser session. No transaction was sent." });
      } catch { setMsg({ tone: "err", text: "Browser storage could not confirm this local change. No tokens moved. Refresh the local room to inspect its saved state before retrying." }); }
      return;
    }
    start(async () => {
      setMsg(null);
      try {
        const r = await submission.run(fn);
        if (!r) return;
        if (r.ok) {
          setMsg({ tone: "ok", text: okText, link: r.link });
        } else {
          // Prefer the i18n key the action attached (e.g. arisanPostpone maps
          // contract error codes to keys) so the toast is human-readable
          // instead of a raw HostError / XDR dump.
          const text = r.errorKey
            ? t(r.errorKey)
            : r.error || t("arisan.somethingWrong");
          setMsg({ tone: "err", text });
        }
        await refresh();
      } catch (error) {
        setMsg({
          tone: "err",
          text: error instanceof Error ? error.message : t("arisan.somethingWrong"),
        });
      }
    });
  }

  function doFinalize() {
    if (pending) return;
    if (isLocalPreview) {
      try {
        if (!st?.ready) return;
        readPreviewArisanRoom(roomId, true);
        const winner = st.seats.find(seat => !seat.won && seat.revealed);
        if (!winner) return;
        const final = st.round >= st.memberTarget;
        const room: ReadyRoom = { ...st, seats: st.seats.map(seat => ({ ...seat, won: seat.won || seat.addr === winner.addr, committed: false, revealed: false })), winners: [...st.winners, { round: st.round, addr: winner.addr, label: winner.label, ts: now }], round: st.round+1, status: final ? "Done" : "Active", drawPhase: final ? null : "Commit", commitCount: 0, revealCount: 0, eligibleCount: st.eligibleCount-1, canFinalize: false, canCommit: !final && winner.addr !== PREVIEW_WALLET && !st.seats.find(seat => seat.isYou)?.won, canReveal: false };
        if (!savePreviewArisanRoom(room)) throw new Error("Preview result could not be saved.");
        setSt(room);
        setMsg({ tone: "ok", text: "Example payout saved locally. The next eligible example member was selected for this preview; no draw or transaction ran on-chain." });
      } catch { setMsg({ tone: "err", text: "Browser storage could not confirm this local result. No tokens moved. Refresh the local room to inspect its saved state before retrying." }); }
      return;
    }
    start(async () => {
      setMsg(null);
      try {
        const r: FinalizeResult | null = await submission.run(() => arisanFinalize(roomId));
        if (!r) return;
        if (!r.ok) {
          setMsg({ tone: "err", text: r.error || t("arisan.somethingWrong") });
          return;
        }
        // Find winner index by address — the contract is the source of truth.
        const idx = st && st.ready ? st.seats.findIndex((s) => s.addr === r.winner) : -1;
        setRoulette({
          winnerIdx: Math.max(0, idx),
          link: r.link,
          winnerLabel: r.winnerLabel,
        });
      } catch (error) {
        setMsg({
          tone: "err",
          text: error instanceof Error ? error.message : t("arisan.somethingWrong"),
        });
      }
    });
  }

  function copyCode() {
    if (!st || !st.ready || !st.code) return;
    navigator.clipboard?.writeText(st.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }

  if (st === null) {
    return <div className={styles.screen}><SubmissionStatusPanel guard={submission} onRefresh={refresh} /><AppBar leading={<IconButton ariaLabel="Back to arisan rooms" onClick={() => router.push("/arisan")}>{Ico.back({})}</IconButton>} title={t("arisan.room.title")} /><div className={styles.content}><div className={styles.skeleton} aria-label={t("common.loading")} /></div></div>;
  }
  if (!st.ready) {
    return <div className={styles.screen}><SubmissionStatusPanel guard={submission} onRefresh={refresh} /><AppBar leading={<IconButton ariaLabel="Back to arisan rooms" onClick={() => router.push("/arisan")}>{Ico.back({})}</IconButton>} title={t("arisan.room.title")} /><section className={styles.errorState}><h1>{t("arisan.room.notFound")}</h1>{st.error ? <p role="alert">{st.error}</p> : null}<Btn kind="secondary" onClick={() => void refresh()}>Try again</Btn></section></div>;
  }
  const viewerSeat = st.seats.find(seat => seat.isYou);
  const viewerAlreadyPaid = !!viewerSeat?.won;
  const staleOpen = st.status === "Open" && now >= st.firstKocok;
  const seatsFull = st.memberCount >= st.memberTarget;
  const joinWindowClosed = now >= st.joinDeadline;
  const awaitingMembers = st.status === "Open" && !seatsFull && !joinWindowClosed;
  const countdownAt = st.status === "Open" ? awaitingMembers ? st.joinDeadline : st.firstKocok : st.nextActionAt;
  const countdown = Math.max(0, countdownAt - now);
  const countdownLabel = st.status === "Open"
    ? staleOpen ? "Start window closed" : awaitingMembers ? "Join deadline in" : "Start deadline in"
    : st.status === "Done" || st.status === "Dissolved" ? "Room closed"
    : st.drawPhase === "Commit" ? t("arisan.draw.commitClosesIn")
    : st.drawPhase === "Reveal" ? t("arisan.draw.revealClosesIn") : t("arisan.draw.readyToFinalize");
  const countdownValue = st.status === "Done" || st.status === "Dissolved" || staleOpen ? "-"
    : st.drawPhase === "Finalizable" ? "Ready" : fmtCountdown(countdown);
  const role = st.isHost ? "You are the host" : st.isMember ? "You are a member" : "Public view";
  const statusTitle = staleOpen ? "This room missed its start window."
    : st.status === "Open" ? seatsFull ? st.isHost ? "Everyone is funded. Ready to start." : "Everyone is funded. Waiting for the host."
      : joinWindowClosed ? "Funding closed before the circle filled." : "Waiting for the circle to fill."
    : st.status === "Active" ? "Round " + st.round + " of " + st.memberTarget
    : st.status === "Done" ? "The circle is complete." : "This room has closed.";
  const recovery = staleOpen || st.status === "Open" && !seatsFull && joinWindowClosed;
  const statusCopy = recovery ? st.isHost ? "Cancel this open room to return deposits, then create a room with a new schedule." : "Ask the host to cancel this open room. Members can leave before it starts."
    : "Each member funds " + st.memberTarget + " × their share upfront. No interest or yield.";
  const memberSummary = st.status === "Open" ? seatsFull ? "All members funded" : (st.memberTarget - st.memberCount) + " places remaining"
    : st.status === "Active" ? st.eligibleCount + " eligible this round" : st.status === "Done" ? "Cycle complete" : "Room closed";
  const phaseSummary = st.drawPhase === "Commit" ? st.commitCount + "/" + st.eligibleCount + " committed"
    : st.drawPhase === "Reveal" ? st.revealCount + "/" + st.commitCount + " revealed" : st.drawPhase === "Finalizable" ? "Ready for payout" : "";
  const latestWinner = st.winners[st.winners.length - 1];
  const hasDemoControls = st.status === "Open" && st.isHost && st.memberCount < st.memberTarget && !joinWindowClosed
    || st.status === "Active" && st.round <= st.memberTarget && (st.drawPhase === "Commit" || st.drawPhase === "Reveal");
  const canPostpone = st.status === "Active" && st.round <= st.memberTarget && st.isHost && st.drawPhase === "Commit" && st.commitCount === 0;

  return <div className={styles.screen}>
    <SubmissionStatusPanel guard={submission} onRefresh={refresh} />
    {roulette ? <Roulette seats={st.seats} winnerIdx={roulette.winnerIdx} onDone={() => {
      setMsg({ tone: "ok", text: t("arisan.kocok.wonText", { who: roulette.winnerLabel, pot: formatLocal(st.potPesos, currency) }), link: roulette.link });
      setRoulette(null); refresh();
    }} /> : null}
    <AppBar leading={<IconButton ariaLabel="Back to arisan rooms" onClick={() => router.push("/arisan")}>{Ico.back({})}</IconButton>} title={st.name} />
    <div className={styles.content}>
      <section className={styles.summary} aria-label="Room overview">
        <div className={styles.badges}>
          <Chip kind={st.status === "Open" ? "action" : st.status === "Active" ? "success" : st.status === "Done" ? "neutral" : "warn"}>{t("arisan.status." + st.status)}</Chip>
          <Chip kind="neutral">{t("arisan.cadence." + st.cadence)}</Chip><Chip kind="neutral">{t("arisan.previewBadge")}</Chip>
        </div>
        <div className={styles.hero}><div><span className={styles.role}>{role}</span><h1>{statusTitle}</h1><p>{statusCopy}</p></div><Image className={styles.doodle} src="/illustrations/arisan.png" width={112} height={108} alt="Friends contributing to a shared arisan pool" /></div>
        <div className={styles.memberStrip}>
          <div className={styles.avatars} aria-hidden="true">{st.seats.slice(0,5).map(seat => <Avatar key={seat.addr} name={seat.label} size={29} />)}{st.seats.length > 5 ? <span className={styles.moreAvatars}>+{st.seats.length-5}</span> : null}</div>
          <div><strong>{st.memberCount}/{st.memberTarget} {t("arisan.members")}</strong><span>{memberSummary}</span></div>
        </div>
        {st.status === "Active" ? <div className={styles.phaseRail} aria-label="Current draw phase">{["Commit","Reveal","Finalizable"].map(phase => <span key={phase} className={st.drawPhase === phase ? styles.currentPhase : undefined}>{phase === "Finalizable" ? "Payout" : t("arisan.draw.phase." + phase)}</span>)}</div> : null}
        <div className={styles.moneyBand} aria-label="Room amounts and timing">
          <div><span>{st.status === "Open" ? "Target round pot" : "Round pot"}</span><strong>{formatLocal(st.potPesos,currency)}</strong><small>{st.status === "Active" ? phaseSummary : st.memberCount + "/" + st.memberTarget + " members"}</small></div>
          <div><span>Share per round</span><strong>{formatLocal(st.sharePesos,currency)}</strong><small>{st.memberTarget} rounds</small></div>
          <div><span>{countdownLabel}</span><strong>{countdownValue}</strong><small>{st.status === "Active" ? "Round " + Math.min(st.round,st.memberTarget) + "/" + st.memberTarget : st.status === "Open" ? "Host starts the room" : "No active deadline"}</small></div>
        </div>
      </section>

      <section className={styles.primaryAction} aria-label="Your next action">
        {st.status === "Open" && st.readyToStart && !staleOpen ? <Btn kind="primary" leading={Ico.send({ size:18,c:"#fff" })} onClick={() => run(() => arisanStart(st.id),t("arisan.room.startedOk"),"start")} disabled={pending} loading={pending && !roulette}>{t("arisan.room.startCta")}</Btn> : null}
        {st.status === "Active" && st.round <= st.memberTarget && st.drawPhase === "Commit" ? <Btn kind="primary" onClick={() => run(() => arisanCommit(st.id),t("arisan.draw.committedOk"),"commit")} disabled={viewerAlreadyPaid || !st.isMember || !st.canCommit || pending} loading={pending && !roulette}>{viewerAlreadyPaid ? "You already received your payout." : !st.isMember ? "Only eligible members can commit." : st.canCommit ? t("arisan.draw.commitCta") : t("arisan.draw.commitWaiting",{ time:fmtCountdown(countdown) })}</Btn> : null}
        {st.status === "Active" && st.round <= st.memberTarget && st.drawPhase === "Reveal" ? <Btn kind="primary" onClick={() => run(() => arisanReveal(st.id),t("arisan.draw.revealedOk"),"reveal")} disabled={viewerAlreadyPaid || !st.isMember || !viewerSeat?.committed || !st.canReveal || pending} loading={pending && !roulette}>{viewerAlreadyPaid ? "You already received your payout." : !st.isMember ? "Only eligible members can reveal." : !viewerSeat?.committed ? "You did not commit in this round." : st.canReveal ? t("arisan.draw.revealCta") : t("arisan.draw.revealWaiting",{ time:fmtCountdown(countdown) })}</Btn> : null}
        {st.status === "Active" && st.round <= st.memberTarget && st.drawPhase === "Finalizable" ? <Btn kind="primary" onClick={doFinalize} disabled={!st.canFinalize || pending || !!roulette} loading={pending && !roulette}>{t("arisan.draw.finalizeCta",{ pot:formatLocal(st.potPesos,currency) })}</Btn> : null}
        {st.status === "Done" ? <div className={styles.complete}><strong>{t("arisan.room.doneTitle")}</strong><p>{isLocalPreview ? "Every example member has received one payout. This local preview sent no transactions." : t("arisan.room.doneBody")}</p></div> : null}
        {st.status === "Dissolved" ? <div className={styles.closed}><strong>{t("arisan.room.dissolvedTitle")}</strong><p>{isLocalPreview ? "This local example is closed. No real refunds or transactions were sent." : t("arisan.room.dissolvedBody")}</p></div> : null}
      </section>

      {msg ? msg.tone === "ok" ? <SuccessMotion key={msg.text} title={msg.text}>{msg.link ? <a href={msg.link} target="_blank" rel="noreferrer">{t("paluwagan.viewOnStellar")}</a> : null}</SuccessMotion> : <div className={styles.error} role="alert">{msg.text}</div> : null}

      {st.code && st.status === "Open" ? <section className={styles.invitation} aria-label="Room invitation"><div className={styles.ticketIcon}>{Ico.qr({ size:21,c:T.ink })}</div><div className={styles.inviteText}><span>{t("arisan.room.inviteCode")}</span><strong>{st.code}</strong><p>{t("arisan.room.inviteBody")}</p></div><Btn kind="quiet" size="md" full={false} onClick={copyCode} leading={Ico.link({ size:14,c:T.action })}>{copied ? t("arisan.room.copied") : t("arisan.room.copy")}</Btn></section> : null}

      <section className={styles.members} aria-label="All room members">
        <header className={styles.sectionHeader}><h2>Members <span>({st.memberCount}/{st.memberTarget})</span></h2><span>{memberSummary}</span></header>
        <div>{st.seats.map(seat => <div className={styles.memberRow} key={seat.addr}><Avatar name={seat.label} size={30} /><div className={styles.memberName}>{seat.label}{seat.isYou ? <span>{t("arisan.you")}</span> : null}</div>
          {seat.won ? <Chip kind="success" size="sm" leading={Ico.check({ size:11,c:T.moneyIn })}>{t("arisan.statusWon")}</Chip>
            : seat.revealed ? <Chip kind="success" size="sm" leading={Ico.check({ size:11,c:T.moneyIn })}>{t("arisan.draw.revealed")}</Chip>
            : seat.committed ? <Chip kind="action" size="sm">{t("arisan.draw.committed")}</Chip>
            : <Chip kind="neutral" size="sm">{t("arisan.statusWaiting")}</Chip>}
        </div>)}</div>
      </section>

      {latestWinner ? <details className={styles.history}><summary><div><span>{isLocalPreview ? "Latest example payout" : "Latest payout"} · Round {latestWinner.round}</span><strong>{latestWinner.label}</strong></div><div className={styles.historyAmount}><strong>{formatLocal(st.potPesos,currency)}</strong><span>{st.winners.length} payout{st.winners.length === 1 ? "" : "s"} · View history</span></div></summary><ol>{st.winners.map(winner => <li key={winner.round}><span className={styles.roundNumber}>{pad2(winner.round)}</span><strong>{winner.label}</strong><span>{formatLocal(st.sharePesos*st.memberTarget,currency)}</span></li>)}</ol></details> : null}

      {st.status === "Open" && st.isHost ? <Btn kind="ghost" className={styles.secondaryExit} onClick={() => run(() => arisanCancel(st.id),t("arisan.room.cancelledOk"),"cancel")} disabled={pending} trailing={Ico.chev({ size:16,c:T.danger })}>{t("arisan.room.cancelCta")}</Btn>
        : st.status === "Open" && st.isMember ? <Btn kind="ghost" className={styles.secondaryExit} onClick={() => run(() => arisanLeave(st.id),t("arisan.room.leftOk"),"leave")} disabled={pending} trailing={Ico.chev({ size:16,c:T.danger })}>{t("arisan.room.leaveCta")}</Btn> : null}

      {hasDemoControls || canPostpone ? <details className={styles.tools}><summary>{isLocalPreview ? "Local example controls" : "Testnet demo controls"}<span>Show</span></summary><div className={styles.toolButtons}>
        {st.status === "Open" && st.isHost && st.memberCount < st.memberTarget && !joinWindowClosed ? <Btn kind="secondary" size="md" onClick={() => run(() => arisanFriendsJoin(st.id),t("arisan.room.friendsJoinedOk"),"join")} disabled={pending} loading={pending && !roulette} leading={Ico.plus({ size:14,c:T.ink })}>{t("arisan.room.friendsJoinCta")}</Btn> : null}
        {st.status === "Active" && st.round <= st.memberTarget && st.drawPhase === "Commit" ? <Btn kind="secondary" size="md" onClick={() => run(() => arisanFriendsCommit(st.id),t("arisan.draw.friendsCommittedOk"),"friendsCommit")} disabled={pending || st.commitCount >= st.eligibleCount}>{t("arisan.draw.friendsCommitCta")}</Btn> : null}
        {st.status === "Active" && st.round <= st.memberTarget && st.drawPhase === "Reveal" ? <Btn kind="secondary" size="md" onClick={() => run(() => arisanFriendsReveal(st.id),t("arisan.draw.friendsRevealedOk"),"friendsReveal")} disabled={pending || st.revealCount >= st.commitCount}>{t("arisan.draw.friendsRevealCta")}</Btn> : null}
        {canPostpone ? <Btn kind="ghost" size="md" onClick={() => run(() => arisanPostpone(st.id,60),t("arisan.room.postponingOk"),"postpone")} disabled={pending}>{t("arisan.room.postponeCta")}</Btn> : null}
        <p>{isLocalPreview ? "These controls update example participants only. No network transaction is sent." : "Demo participants are separate Testnet accounts. These controls send Testnet transactions."}</p>
      </div></details> : null}

      <details className={styles.rules}><summary>How this room works<span>Read terms</span></summary><div><p><strong>Upfront funding:</strong> {st.memberTarget} × {formatLocal(st.sharePesos,currency)} = {formatLocal(st.sharePesos*st.memberTarget,currency)} per member before the first draw. Share per round and upfront deposit are different amounts.</p><p>Payout order comes from the commit and reveal process after the host starts the room. Only members who have not received a payout are eligible for a later draw.</p><p>{isLocalPreview ? "The local preview selects an example eligible member for demonstration. It is not a random on-chain draw and moves no funds." : "The browser animation displays the result returned by the contract. Use the receipt to check network activity."} Testnet XLM has no real monetary value.</p></div></details>
      <footer className={styles.footer}><PoweredByStellar /><span>{isLocalPreview ? "Example data · no transactions" : "Stellar Testnet · no real money"}</span></footer>
    </div>
  </div>;
}
