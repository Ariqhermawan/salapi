"use client";
import SuccessMotion from "@/components/ui/SuccessMotion";

import { useEffect, useRef, useState, useTransition } from "react";
import { useGoBack } from "@/lib/ui/useGoBack";
import Image from "next/image";
import Link from "next/link";
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
  PoweredByStellar,
} from "@/components/ui/kit";
import { formatLocal } from "@/lib/ui/currency";
import { isLocalPreview, PREVIEW_WALLET as PREVIEW_ACCOUNT } from "@/lib/local-preview";
import { useUnresolvedSubmission } from "@/lib/ui/useUnresolvedSubmission";
import SubmissionStatusPanel from "@/components/ui/SubmissionStatusPanel";
import styles from "./ArisanRoomRevamp.module.css";
import { accountCopy } from "@/lib/i18n/revamp-account";
import { choosePreviewArisanWinner, readPreviewArisanRoom, savePreviewArisanRoom, type PreviewArisanChange } from "./arisan-preview";
import { pesosToStroopsExact } from "@/lib/money";
import { arisanDrawRecovery, arisanRoomCopy, arisanViewerIdentity, arisanViewerRole } from "@/lib/arisan-room-guidance";
import { arisanMemberName, type ArisanMemberIdentity as MemberIdentity } from "@/lib/arisan-member-identity";
import { useArisanMemberIdentities } from "@/lib/ui/useArisanMemberIdentities";
import { ArisanMemberAvatar, ArisanMemberIdentity } from "@/components/ArisanMemberIdentity";
import ArisanGatheringPanel from "./ArisanGatheringPanel";
import ArisanInboxLink from "@/components/ArisanInboxLink";
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
  const target = created && draft && Number.isInteger(draft.members) && draft.members >= 3 && draft.members <= 20 ? draft.members : active ? 4 : 5;
  const draftShare = created && draft ? (draft.sharePesos ?? draft.share) : null;
  const share = draftShare !== null && Number.isFinite(draftShare) && draftShare > 0 ? draftShare : active ? 180 : 250;
  const shareStroops = pesosToStroopsExact(String(share)) ?? 0n;
  const isHost = !active && !joined && !left;
  const names = created ? ["Ariqhermawan"] : active ? ["Ariqhermawan", "Farrel", "Maya", "Rina"] : ["Ariqhermawan", "Farrel", "Maya", "Rina", "Bayu"];
  const seats = names.map((label,i) => ({ addr: i === 0 ? PREVIEW_WALLET : `LOCAL_MEMBER_${i}`, label, fundedStroops: (shareStroops * BigInt(target)).toString(), won: active && i === 1, committed: active && i === 2, revealed: false, isYou: i === 0 })).filter(seat => !left || !seat.isYou);
  return { ready: true, id: roomId, viewer: PREVIEW_WALLET, viewerIdentity: "unverified", name: created && draft ? draft.name : active ? "Weekend community circle" : "Family arisan", code: left ? null : created ? "NEW234" : active ? "CIR234" : "FAM234", host: joined || left || active ? "LOCAL_MEMBER_1" : PREVIEW_WALLET, hostLabel: joined || left || active ? "Farrel" : "Ariqhermawan", cadence: created && draft ? draft.cadence : active ? "Biweekly" : "Weekly", cadenceSecs: 604800, memberTarget: target, memberCount: seats.length, sharePesos: share, shareStroops: shareStroops.toString(), depositStroops: (shareStroops * BigInt(target)).toString(), sharePeso: String(share), potPesos: share*target, potPeso: String(share*target), status: cancelled ? "Dissolved" : active ? "Active" : "Open", round: active ? 2 : 0, drawPhase: active ? "Commit" : null, firstKocok: time+86400, joinDeadline: time+43200, commitAt: time+3600, revealAt: time+7200, nextActionAt: time+3600, commitCount: active ? 1 : 0, revealCount: 0, eligibleCount: active ? 3 : target, seats, winners: active ? [{ round: 1, addr: "LOCAL_MEMBER_1", label: "Farrel", ts: time-604800 }] : [], isMember: !left, isHost, canUseDemoFriends: isHost, readyToStart: !cancelled && !active && !joined && !left && seats.length === target, canCommit: active, canReveal: false, canFinalize: false };
}

function formatXlm(stroops: string) {
  const value = BigInt(stroops);
  return `${value / 10_000_000n}.${(value % 10_000_000n).toString().padStart(7, "0")}`;
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
  seats: { addr: string; label: string; won: boolean; isYou: boolean; identity?: MemberIdentity }[];
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
              <ArisanMemberAvatar address={m.addr} identity={m.identity} previewLabel={m.label} size={56} />
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
  const { t, currency, locale } = useT();
  const roomCopy = arisanRoomCopy(locale);
  const goBack = useGoBack("/arisan");
  const [st, setSt] = useState<State | null>(null);
  const latestRoom = useRef<ReadyRoom | null>(null);
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
  const [fallbackConsent, setFallbackConsent] = useState<string | null>(null);
  const history = useRef<HTMLDetailsElement>(null);
  const identities = useArisanMemberIdentities("upfront", roomId, st?.ready ? st.seats.map(seat => seat.addr) : [], st?.ready ? st.viewer : null);
  const memberName = (address: string, previewLabel?: string) => arisanMemberName(address, identities.get(address), isLocalPreview ? previewLabel : undefined);

  useEffect(() => {
    latestRoom.current = st?.ready ? st : null;
    return () => { latestRoom.current = null; };
  }, [st]);

  async function readLatestRoom(): Promise<State | null> {
    if (isLocalPreview) return null;
    try {
      const room = await arisanRoomState(roomId);
      setSt(room);
      return room;
    } catch {
      setSt({ ready: false, error: "Room state could not be read. No operation was resubmitted." });
      return null;
    }
  }
  async function refresh() {
    await readLatestRoom();
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
    T extends { ok: boolean; link?: string; error?: string; errorKey?: string; pending?: boolean },
  >(fn: () => Promise<T>, okText: string, previewAction?: PreviewAction) {
    if (pending) return;
    if ((previewAction === "join" || previewAction === "friendsCommit" || previewAction === "friendsReveal") && latestRoom.current?.canUseDemoFriends !== true) return;
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
        if (previewAction === "join") { while (room.seats.length < room.memberTarget) room.seats.push({ addr: `LOCAL_MEMBER_${room.seats.length}`, label: ["Maya","Rina","Bayu","Nadia","Lila"][room.seats.length%5], fundedStroops: room.depositStroops, won: false, committed: false, revealed: false, isYou: false }); room.memberCount = room.seats.length; room.readyToStart = room.isHost; }
        if (previewAction === "start") { room.status = "Active"; room.round = 1; room.drawPhase = "Commit"; room.canCommit = true; room.readyToStart = false; }
        if (previewAction === "cancel") { room.status = "Dissolved"; room.readyToStart = false; }
        if (previewAction === "leave") { room.seats = room.seats.filter(seat => !seat.isYou); room.memberCount = room.seats.length; room.isMember = false; room.isHost = false; room.canUseDemoFriends = false; room.readyToStart = false; room.code = null; }
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
      const before = st?.ready ? st : null;
      try {
        const r = await submission.run(fn);
        if (!r) return;
        if (r.ok) {
          setMsg({ tone: "ok", text: okText, link: r.link });
          await refresh();
        } else {
          // Prefer the i18n key the action attached (e.g. arisanPostpone maps
          // contract error codes to keys) so the toast is human-readable
          // instead of a raw HostError / XDR dump.
          const text = r.errorKey && r.errorKey !== "arisan.somethingWrong"
            ? t(r.errorKey)
            : r.errorKey === "arisan.somethingWrong" ? roomCopy.notConfirmed : r.error || roomCopy.notConfirmed;
          const refreshed = await readLatestRoom();
          const guidance = r.pending ? null : arisanDrawRecovery(previewAction, before, refreshed?.ready ? refreshed : null, locale);
          setMsg({ tone: "err", text: guidance ? `${text} ${guidance}` : text });
        }
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
    if (!st?.ready || st.status !== "Active" || st.drawPhase !== "Finalizable" || !st.canFinalize) return;
    if (!isLocalPreview && st.eligibleCount > 1 && st.revealCount === 0 && fallbackConsent !== `${st.id}:${st.round}:${st.revealAt}:${st.viewer}:${st.viewerIdentity}`) return;
    if (isLocalPreview) {
      try {
        if (!st?.ready || st.status !== "Active" || st.drawPhase !== "Finalizable" || !st.canFinalize) return;
        readPreviewArisanRoom(roomId, true);
        const winner = choosePreviewArisanWinner(st.seats);
        if (!winner) {
          setMsg({ tone: "err", text: "The local draw could not select a valid entry. No payout was saved. Complete the entry steps or retry in a browser with secure randomness." });
          return;
        }
        const final = st.round >= st.memberTarget;
        const completedEntries = st.seats.filter(seat => !seat.won && seat.committed && seat.revealed).length;
        const room: ReadyRoom = { ...st, seats: st.seats.map(seat => ({ ...seat, won: seat.won || seat.addr === winner.addr, committed: false, revealed: false })), winners: [...st.winners, { round: st.round, addr: winner.addr, label: winner.label, ts: now }], round: st.round+1, status: final ? "Done" : "Active", drawPhase: final ? null : "Commit", commitCount: 0, revealCount: 0, eligibleCount: st.eligibleCount-1, canFinalize: false, canCommit: !final && winner.addr !== PREVIEW_WALLET && !st.seats.find(seat => seat.isYou)?.won, canReveal: false };
        if (!savePreviewArisanRoom(room)) throw new Error("Preview result could not be saved.");
        setSt(room);
        if (completedEntries > 1) setRoulette({ winnerIdx: st.seats.findIndex(seat => seat.addr === winner.addr), winnerLabel: winner.label });
        setMsg({ tone: "ok", text: `${completedEntries === 1 ? st.seats.filter(seat => !seat.won).length === 1 ? roomCopy.oneRemaining : roomCopy.singleEntry : roomCopy.localRandomNote} No transaction was sent.` });
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
        // A no-reveal fallback or a sole eligible recipient is not a fresh
        // random draw. Never dress either outcome in the roulette animation.
        if (st.ready && (st.revealCount <= 1 || st.eligibleCount <= 1)) {
          setMsg({ tone: "ok", text: t("arisan.kocok.wonText", { who: r.winnerLabel, pot: formatLocal(st.potPesos, currency) }), link: r.link });
          await refresh();
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
    return <div className={styles.screen}><SubmissionStatusPanel guard={submission} onRefresh={refresh} /><AppBar leading={<IconButton ariaLabel={accountCopy(locale).back} onClick={goBack}>{Ico.back({})}</IconButton>} title={t("arisan.room.title")} /><div className={styles.content}><div className={styles.skeleton} aria-label={t("common.loading")} /></div></div>;
  }
  if (!st.ready) {
    return <div className={styles.screen}><SubmissionStatusPanel guard={submission} onRefresh={refresh} /><AppBar leading={<IconButton ariaLabel={accountCopy(locale).back} onClick={goBack}>{Ico.back({})}</IconButton>} title={t("arisan.room.title")} /><section className={styles.errorState}><h1>{t("arisan.room.notFound")}</h1>{st.error ? <p role="alert">{st.error}</p> : null}<Btn kind="secondary" onClick={() => void refresh()}>Try again</Btn></section></div>;
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
  const role = arisanViewerRole(st, isLocalPreview, locale);
  const viewerIdentity = arisanViewerIdentity(st);
  const identityNotice = isLocalPreview ? roomCopy.localNotice : viewerIdentity === "demo" ? roomCopy.demoNotice : viewerIdentity !== "personal" ? roomCopy.unverifiedNotice : null;
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
  const hasDemoControls = st.canUseDemoFriends === true && (st.status === "Open" && st.memberCount < st.memberTarget && !joinWindowClosed
    || st.status === "Active" && st.round <= st.memberTarget && (st.drawPhase === "Commit" || st.drawPhase === "Reveal"));
  const scheduleLabel = st.cadenceSecs > 0 && st.cadenceSecs < 86400 ? `${st.cadenceSecs} seconds between rounds` : t("arisan.cadence." + st.cadence);
  const canPostpone = st.status === "Active" && st.round <= st.memberTarget && st.isHost && st.drawPhase === "Commit" && st.commitCount === 0;
  const fallback = !isLocalPreview && st.status === "Active" && st.drawPhase === "Finalizable" && st.revealCount === 0 && st.eligibleCount > 1;
  const fallbackKey = `${st.id}:${st.round}:${st.revealAt}:${st.viewer}:${st.viewerIdentity}`;
  const completedEntries = isLocalPreview ? st.seats.filter(seat => !seat.won && seat.committed && seat.revealed).length : st.revealCount;
  const phaseLabels = { Commit: roomCopy.enterDraw, Reveal: roomCopy.completeEntry, Finalizable: roomCopy.drawWinner };
  const stepHelp = !st.isMember ? roomCopy.guestDraw
    : st.drawPhase === "Finalizable" ? `${roomCopy.drawHelp}${st.eligibleCount === 1 ? ` ${roomCopy.oneRemaining}` : completedEntries === 1 ? ` ${roomCopy.singleEntry}` : ""}`
    : viewerAlreadyPaid ? roomCopy.alreadyPaid
    : st.drawPhase === "Commit" ? viewerSeat?.committed ? roomCopy.entrySaved : roomCopy.enterHelp
    : st.drawPhase === "Reveal" ? !viewerSeat?.committed ? roomCopy.missedEntry : viewerSeat.revealed ? roomCopy.entryComplete : roomCopy.revealHelp : "";
  const timeLocale = { en: "en-US", id: "id-ID", tl: "fil-PH", vi: "vi-VN" }[locale];
  const dateTime = (seconds: number) => new Date(seconds * 1000).toLocaleString(timeLocale, { dateStyle: "medium", timeStyle: "medium" });
  function openHistory() {
    if (!history.current) return;
    history.current.open = true;
    history.current.querySelector("summary")?.focus();
    history.current.scrollIntoView({ block: "start", behavior: "instant" });
  }

  return <div className={styles.screen}>
    <SubmissionStatusPanel guard={submission} onRefresh={refresh} />
    {roulette ? <Roulette seats={st.seats.map(seat => ({ ...seat, label: memberName(seat.addr, seat.label), identity: identities.get(seat.addr) }))} winnerIdx={roulette.winnerIdx} onDone={() => {
      const winner = st.seats[roulette.winnerIdx];
      setMsg({ tone: "ok", text: isLocalPreview ? `${winner ? memberName(winner.addr, winner.label) : "Example member"}: ${roomCopy.localRandomNote}` : t("arisan.kocok.wonText", { who: winner ? memberName(winner.addr, winner.label) : "Wallet user", pot: formatLocal(st.potPesos, currency) }), link: roulette.link });
      setRoulette(null); refresh();
    }} /> : null}
    <AppBar leading={<IconButton ariaLabel={accountCopy(locale).back} onClick={goBack}>{Ico.back({})}</IconButton>} title={st.name} trailing={<ArisanInboxLink locale={locale} />} />
    <div className={styles.content}>
      <section className={styles.summary} aria-label="Room overview">
        <div className={styles.badges}>
          <Chip kind={st.status === "Open" ? "action" : st.status === "Active" ? "success" : st.status === "Done" ? "neutral" : "warn"}>{t("arisan.status." + st.status)}</Chip>
          <Chip kind="neutral">{scheduleLabel}</Chip><Chip kind="neutral">{isLocalPreview ? roomCopy.localBadge : roomCopy.testnetBadge}</Chip>
        </div>
        <div className={styles.hero}><div><span className={styles.role}>{role}</span><h1>{statusTitle}</h1><p>{statusCopy}</p>{identityNotice ? <p>{identityNotice}</p> : null}</div><Image className={styles.doodle} src="/illustrations/arisan.png" width={112} height={108} alt="Friends contributing to a shared arisan pool" /></div>
        <div className={styles.memberStrip}>
          <div className={styles.avatars} aria-hidden="true">{st.seats.slice(0,5).map(seat => <ArisanMemberAvatar key={seat.addr} address={seat.addr} identity={identities.get(seat.addr)} previewLabel={isLocalPreview ? seat.label : undefined} size={29} />)}{st.seats.length > 5 ? <span className={styles.moreAvatars}>+{st.seats.length-5}</span> : null}</div>
          <div><strong>{st.memberCount}/{st.memberTarget} {t("arisan.members")}</strong><span>{memberSummary}</span></div>
        </div>
        {st.status === "Active" ? <div className={styles.phaseRail} aria-label="Current draw phase">{(["Commit","Reveal","Finalizable"] as const).map((phase, index) => <span key={phase} className={st.drawPhase === phase ? styles.currentPhase : undefined}>{index + 1}. {phaseLabels[phase]}</span>)}</div> : null}
        <div className={styles.moneyBand} aria-label="Room amounts and timing">
          <div><span>{st.status === "Open" ? "Target round pot" : "Round pot"}</span><strong>{formatLocal(st.potPesos,currency)}</strong><small>{st.status === "Active" ? phaseSummary : st.memberCount + "/" + st.memberTarget + " members"}</small></div>
          <div><span>Share per round</span><strong>{formatLocal(st.sharePesos,currency)}</strong><small>{st.memberTarget} rounds</small></div>
          <div><span>{countdownLabel}</span><strong>{countdownValue}</strong><small>{st.status === "Active" ? "Round " + Math.min(st.round,st.memberTarget) + "/" + st.memberTarget : st.status === "Open" ? "Host starts the room" : "No active deadline"}</small></div>
        </div>
      </section>

      {st.status === "Active" ? <section className={styles.nextStep} data-testid="arisan-next-step" aria-labelledby="arisan-next-title">
        <span>{roomCopy.nextStep}</span><h2 id="arisan-next-title">{st.drawPhase ? phaseLabels[st.drawPhase] : t("common.loading")}</h2><p>{stepHelp}</p>
        {isLocalPreview ? <p>{roomCopy.previewTiming}</p> : <><dl className={styles.schedule}>
          <div data-current={st.drawPhase === "Commit"}><dt>{roomCopy.entryDeadline}</dt><dd><time dateTime={new Date(st.commitAt * 1000).toISOString()}>{dateTime(st.commitAt)}</time></dd></div>
          <div data-current={st.drawPhase === "Reveal"}><dt>{roomCopy.revealDeadline}</dt><dd><time dateTime={new Date(st.revealAt * 1000).toISOString()}>{dateTime(st.revealAt)}</time></dd></div>
          <div data-current={st.drawPhase === "Finalizable"}><dt>{roomCopy.drawFrom}</dt><dd><time dateTime={new Date(st.revealAt * 1000).toISOString()}>{dateTime(st.revealAt)}</time></dd></div>
        </dl><small>{roomCopy.localTime}</small></>}
      </section> : null}

      {fallback ? <section className={styles.fallbackWarning} role="alert" data-testid="arisan-fallback-warning"><strong>{roomCopy.fallbackTitle}</strong><p>{roomCopy.fallbackHelp}</p>{st.canFinalize ? <label><input type="checkbox" checked={fallbackConsent === fallbackKey} onChange={event => setFallbackConsent(event.target.checked ? fallbackKey : null)} />{roomCopy.fallbackAck}</label> : null}</section> : null}

      <section className={styles.primaryAction} aria-label="Your next action">
        {st.status === "Open" && st.readyToStart && !staleOpen ? <Btn kind="primary" leading={Ico.send({ size:18,c:"#fff" })} onClick={() => run(() => arisanStart(st.id),t("arisan.room.startedOk"),"start")} disabled={pending} loading={pending && !roulette}>{t("arisan.room.startCta")}</Btn> : null}
        {st.status === "Active" && st.round <= st.memberTarget && st.drawPhase === "Commit" ? <Btn kind="primary" onClick={() => run(() => arisanCommit(st.id),t("arisan.draw.committedOk"),"commit")} disabled={viewerAlreadyPaid || !st.isMember || !st.canCommit || pending} loading={pending && !roulette}>{viewerAlreadyPaid ? roomCopy.paidStatus : !st.isMember ? roomCopy.guestDraw : st.canCommit ? roomCopy.enterDraw : roomCopy.entrySaved}</Btn> : null}
        {st.status === "Active" && st.round <= st.memberTarget && st.drawPhase === "Reveal" ? <Btn kind="primary" onClick={() => run(() => arisanReveal(st.id),t("arisan.draw.revealedOk"),"reveal")} disabled={viewerAlreadyPaid || !st.isMember || !viewerSeat?.committed || !st.canReveal || pending} loading={pending && !roulette}>{viewerAlreadyPaid ? roomCopy.paidStatus : !st.isMember ? roomCopy.guestDraw : !viewerSeat?.committed ? roomCopy.missedEntry : st.canReveal ? roomCopy.completeEntry : roomCopy.entryComplete}</Btn> : null}
        {st.status === "Active" && st.round <= st.memberTarget && st.drawPhase === "Finalizable" ? <Btn kind="primary" onClick={doFinalize} disabled={!st.canFinalize || pending || !!roulette || fallback && fallbackConsent !== fallbackKey} loading={pending && !roulette}>{fallback ? roomCopy.fallbackCta : st.eligibleCount === 1 ? roomCopy.finalPayout : completedEntries === 1 ? roomCopy.completePayout : roomCopy.drawWinner} · {formatLocal(st.potPesos,currency)}</Btn> : null}
        {st.status === "Done" ? <div className={styles.complete}><strong>{t("arisan.room.doneTitle")}</strong><p>{isLocalPreview ? "Every example member has received one payout. This local preview sent no transactions." : t("arisan.room.doneBody")}</p><p>{roomCopy.newCycleHelp}</p><nav className={styles.completedActions} aria-label={roomCopy.nextStep}>
          {latestWinner ? <button type="button" onClick={openHistory}>{roomCopy.viewHistory}</button> : null}
          <Link href="/arisan/new">{roomCopy.newCycle}</Link><Link href="/arisan">{roomCopy.allRooms}</Link><Link href="/">{roomCopy.home}</Link>
        </nav></div> : null}
        {st.status === "Dissolved" ? <div className={styles.closed}><strong>{t("arisan.room.dissolvedTitle")}</strong><p>{isLocalPreview ? "This local example is closed. No real refunds or transactions were sent." : t("arisan.room.dissolvedBody")}</p></div> : null}
      </section>

      {msg ? msg.tone === "ok" ? <SuccessMotion key={msg.text} title={msg.text}>{msg.link ? <a href={msg.link} target="_blank" rel="noreferrer">{t("paluwagan.viewOnStellar")}</a> : null}</SuccessMotion> : <div className={styles.error} role="alert">{msg.text}</div> : null}

      {st.code && st.status === "Open" ? <section className={styles.invitation} aria-label="Room invitation"><div className={styles.ticketIcon}>{Ico.qr({ size:21,c:T.ink })}</div><div className={styles.inviteText}><span>{t("arisan.room.inviteCode")}</span><strong>{st.code}</strong><p>{t("arisan.room.inviteBody")}</p></div><Btn kind="quiet" size="md" full={false} onClick={copyCode} leading={Ico.link({ size:14,c:T.action })}>{copied ? t("arisan.room.copied") : t("arisan.room.copy")}</Btn></section> : null}

      <section className={styles.members} aria-label="All room members">
        <header className={styles.sectionHeader}><h2>Members <span>({st.memberCount}/{st.memberTarget})</span></h2><span>{memberSummary}</span></header>
        <div>{st.seats.map(seat => <div className={styles.memberRow} data-testid="arisan-member-row" key={seat.addr}><div className={styles.memberPerson}><ArisanMemberAvatar address={seat.addr} identity={identities.get(seat.addr)} previewLabel={isLocalPreview ? seat.label : undefined} size={30} /><ArisanMemberIdentity address={seat.addr} identity={identities.get(seat.addr)} previewLabel={isLocalPreview ? seat.label : undefined}>{seat.isYou ? <span>{isLocalPreview ? roomCopy.localYou : viewerIdentity === "demo" ? roomCopy.demoYou : t("arisan.you")}</span> : null}</ArisanMemberIdentity></div>
          <div className={styles.memberDeposit} data-testid="arisan-member-deposit" data-stroops={seat.fundedStroops ?? undefined}><span>{st.status === "Dissolved" ? roomCopy.depositAfterRefund : roomCopy.deposited}</span>{seat.fundedStroops !== null && seat.fundedStroops !== undefined ? <><strong>{formatXlm(seat.fundedStroops)} XLM</strong><small>{roomCopy.illustrative}: {formatLocal(Number(seat.fundedStroops) / Number(st.shareStroops) * st.sharePesos,currency)}</small></> : <strong>{roomCopy.depositUnavailable}</strong>}</div>
          {seat.won ? <Chip kind="success" size="sm" leading={Ico.check({ size:11,c:T.moneyIn })}>{roomCopy.paidStatus}</Chip>
            : seat.revealed ? <Chip kind="success" size="sm" leading={Ico.check({ size:11,c:T.moneyIn })}>{roomCopy.readyStatus}</Chip>
            : seat.committed ? <Chip kind="action" size="sm">{roomCopy.enteredStatus}</Chip>
            : <Chip kind="neutral" size="sm">{roomCopy.waitingStatus}</Chip>}
        </div>)}</div>
        <p className={styles.depositNote}>{st.status === "Dissolved" ? roomCopy.refundedDepositNote : roomCopy.depositHistory}</p>
      </section>

      {latestWinner ? <details className={styles.history} ref={history}><summary><div><span>{isLocalPreview ? "Latest example payout" : "Latest payout"} · Round {latestWinner.round}</span><ArisanMemberIdentity address={latestWinner.addr} identity={identities.get(latestWinner.addr)} previewLabel={isLocalPreview ? latestWinner.label : undefined} /></div><div className={styles.historyAmount}><strong>{formatLocal(st.potPesos,currency)}</strong><span>{st.winners.length} payout{st.winners.length === 1 ? "" : "s"} · View history</span></div></summary><ol>{st.winners.map(winner => <li key={winner.round}><span className={styles.roundNumber}>{pad2(winner.round)}</span><ArisanMemberIdentity address={winner.addr} identity={identities.get(winner.addr)} previewLabel={isLocalPreview ? winner.label : undefined} /><span>{formatLocal(st.sharePesos*st.memberTarget,currency)}</span></li>)}</ol></details> : null}

      {st.status === "Open" && st.isHost ? <Btn kind="ghost" className={styles.secondaryExit} onClick={() => run(() => arisanCancel(st.id),t("arisan.room.cancelledOk"),"cancel")} disabled={pending} trailing={Ico.chev({ size:16,c:T.danger })}>{t("arisan.room.cancelCta")}</Btn>
        : st.status === "Open" && st.isMember ? <Btn kind="ghost" className={styles.secondaryExit} onClick={() => run(() => arisanLeave(st.id),t("arisan.room.leftOk"),"leave")} disabled={pending} trailing={Ico.chev({ size:16,c:T.danger })}>{t("arisan.room.leaveCta")}</Btn> : null}

      {hasDemoControls || canPostpone ? <details className={styles.tools}><summary>{isLocalPreview ? "Local example controls" : "Testnet demo controls"}<span>Show</span></summary><div className={styles.toolButtons}>
        {st.canUseDemoFriends === true && st.status === "Open" && st.memberCount < st.memberTarget && !joinWindowClosed ? <Btn kind="secondary" size="md" onClick={() => run(() => arisanFriendsJoin(st.id),t("arisan.room.friendsJoinedOk"),"join")} disabled={pending} loading={pending && !roulette} leading={Ico.plus({ size:14,c:T.ink })}>{t("arisan.room.friendsJoinCta")}</Btn> : null}
        {st.canUseDemoFriends === true && st.status === "Active" && st.round <= st.memberTarget && st.drawPhase === "Commit" ? <Btn kind="secondary" size="md" onClick={() => run(() => arisanFriendsCommit(st.id),t("arisan.draw.friendsCommittedOk"),"friendsCommit")} disabled={pending || st.commitCount >= st.eligibleCount}>{t("arisan.draw.friendsCommitCta")}</Btn> : null}
        {st.canUseDemoFriends === true && st.status === "Active" && st.round <= st.memberTarget && st.drawPhase === "Reveal" ? <Btn kind="secondary" size="md" onClick={() => run(() => arisanFriendsReveal(st.id),t("arisan.draw.friendsRevealedOk"),"friendsReveal")} disabled={pending || st.revealCount >= st.commitCount}>{t("arisan.draw.friendsRevealCta")}</Btn> : null}
        {canPostpone ? <Btn kind="ghost" size="md" onClick={() => run(() => arisanPostpone(st.id,60),t("arisan.room.postponingOk"),"postpone")} disabled={pending}>{t("arisan.room.postponeCta")}</Btn> : null}
        <p>{isLocalPreview ? "These controls update example participants only. No network transaction is sent." : "Demo participants are separate Testnet accounts. These controls send Testnet transactions."}</p>
      </div></details> : null}

      <details className={styles.rules}><summary>How this room works<span>Read terms</span></summary><div><p><strong>Upfront funding:</strong> {st.memberTarget} × {formatXlm(st.shareStroops)} Testnet XLM = {formatXlm(st.depositStroops)} Testnet XLM per member before the first draw. Share per round and upfront deposit are different amounts.</p><p>Illustrative display only: share {formatLocal(st.sharePesos,currency)}; upfront deposit {formatLocal(st.sharePesos*st.memberTarget,currency)}.</p><p><strong>Schedule:</strong> {st.cadenceSecs} seconds between rounds. {isLocalPreview ? "Local example timing." : "Testnet demo timing."}</p><p>Payout order comes from the commit and reveal process after the host starts the room. Only members who have not received a payout are eligible for a later draw.</p><p>{isLocalPreview ? roomCopy.localRandomNote : roomCopy.protocolNote} Testnet XLM has no real monetary value.</p></div></details>
      {!isLocalPreview && st.contractId && /^C[A-Z2-7]{55}$/.test(st.contractId) ? <ArisanGatheringPanel key={`upfront:${st.contractId}:${st.id}`} kind="upfront" contractId={st.contractId} roomId={st.id} watchVersion={`${st.status}:${st.round}:${st.drawPhase}:${st.memberCount}:${st.commitCount}:${st.revealCount}`} /> : null}
      <footer className={styles.footer}><PoweredByStellar /><span>{isLocalPreview ? "Example data · no transactions" : "Stellar Testnet · no real money"}</span></footer>
    </div>
  </div>;
}
