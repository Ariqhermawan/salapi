"use client";
import { announceSuccessMotion } from "@/lib/ui/success-feedback";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { arisanJoin, arisanResolveCode, arisanRoomState } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { T, Ico, AppBar, Card, Btn } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import { isLocalPreview } from "@/lib/local-preview";
import { useUnresolvedSubmission } from "@/lib/ui/useUnresolvedSubmission";
import SubmissionStatusPanel from "@/components/ui/SubmissionStatusPanel";
import { formatLocal } from "@/lib/ui/currency";
import styles from "./CampaignArisan.module.css";
import { commitPreviewArisanSession, readPreviewArisanRoom, savePreviewArisanRoom } from "./arisan-preview";
import { PREVIEW_WALLET } from "@/lib/local-preview";
import type { ArisanReviewedInvitation } from "@/lib/arisan-invitation";
import { pesosToStroopsExact } from "@/lib/money";

// Invite codes are 6 chars from {digits 2–9, A–Z minus O/I}.
const INVITE_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
type JoinRoom = { id: number; name: string; memberTarget: number; memberCount: number; sharePesos: number; cadence: string; cadenceSecs?: number; status: string; isMember: boolean; joinDeadline: number; shareStroops?: string; depositStroops?: string; viewer?: string | null };
type ReviewedInvite = Readonly<{ room: Readonly<JoinRoom>; invitation: Readonly<ArisanReviewedInvitation> }>;
function formatXlm(stroops: string) {
  const value = BigInt(stroops);
  return `${value / 10_000_000n}.${(value % 10_000_000n).toString().padStart(7, "0")}`;
}

export default function ArisanJoinScreen() {
  const submission = useUnresolvedSubmission("arisan:rooms");
  const { t, currency } = useT();
  const router = useRouter();
  const goBack = useGoBack("/arisan");
  const [code, setCode] = useState("");
  const [, start] = useTransition();
  const [activeOperation, setActiveOperation] = useState<"review" | "join" | null>(null);
  const operation = useRef<"review" | "join" | null>(null);
  const reviewRequest = useRef(0);
  const mounted = useRef(true);
  const reviewedRef = useRef<ReviewedInvite | null>(null);
  const pending = activeOperation !== null || submission.locked;
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<ReviewedInvite | null>(null);
  const [reviewClock, setReviewClock] = useState(0);
  const room = reviewed?.room ?? null;

  const canSubmit = INVITE_CODE.test(code);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current = null; reviewedRef.current = null; };
  }, []);

  useEffect(() => {
    if (!room || room.joinDeadline <= reviewClock) return;
    const timer = setTimeout(() => { if (mounted.current) setReviewClock(Math.floor(Date.now() / 1000)); }, Math.min(2147483647, Math.max(0, room.joinDeadline * 1000 - Date.now())));
    return () => clearTimeout(timer);
  }, [room, reviewClock]);

  function resetReview() {
    if (!mounted.current || operation.current === "join" || submission.locked) return;
    reviewRequest.current++;
    operation.current = null;
    reviewedRef.current = null;
    setActiveOperation(null);
    setReviewed(null);
    setError(null);
  }

  function back() {
    if (!mounted.current || operation.current === "join" || submission.locked) return;
    const wasReviewed = reviewedRef.current !== null;
    resetReview();
    if (!wasReviewed) goBack();
  }

  function clean(s: string): string {
    return s
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .replace(/[OI01]/g, "")
      .slice(0, 6);
  }

  function submit() {
    if (!mounted.current || operation.current || submission.locked || !reviewed || reviewedRef.current !== reviewed) return;
    const accepted = reviewed;
    const acceptedRoom = accepted.room;
    if (acceptedRoom.isMember || acceptedRoom.status !== "Open" || acceptedRoom.memberCount >= acceptedRoom.memberTarget) return;
    if (acceptedRoom.joinDeadline <= Math.floor(Date.now() / 1000)) {
      setReviewClock(Math.floor(Date.now() / 1000));
      setError("This invitation has expired. Use another invite or ask the host for an open room.");
      return;
    }
    operation.current = "join";
    setActiveOperation("join");
    setError(null);
    start(async () => {
      let joined = false;
      try {
        if (isLocalPreview) {
          try {
            const saved = readPreviewArisanRoom(acceptedRoom.id, true);
            const changes = [{ key: "salapi.preview.arisan-left", value: null }, { key: "salapi.preview.arisan-joined", value: "1" }];
            if (saved && !saved.isMember) {
              const seats = [...saved.seats.filter(seat => !seat.isYou), { addr: PREVIEW_WALLET.address, label: "Ariqhermawan", won: false, committed: false, revealed: false, isYou: true }];
              if (!savePreviewArisanRoom({ ...saved, seats, memberCount: seats.length, isMember: true, isHost: false, canUseDemoFriends: false, readyToStart: false, code: "FAM234" }, changes)) throw new Error("Preview membership could not be saved.");
            } else if (!commitPreviewArisanSession(changes)) throw new Error("Preview membership could not be saved.");
            if (!mounted.current) return;
            joined = true;
            reviewedRef.current = null;
            announceSuccessMotion("Arisan funding demo complete. No tokens moved."); router.replace(`/arisan/${acceptedRoom.id}`);
          } catch { if (mounted.current) setError("Browser storage could not confirm the local membership save. No room was opened and no tokens moved. Check the local room before retrying."); }
          return;
        }
        try {
          const r = await submission.run(() => arisanJoin(accepted.invitation));
          if (!mounted.current || reviewedRef.current !== accepted || !r) return;
          if (r.ok) {
            joined = true;
            reviewedRef.current = null;
            announceSuccessMotion("Arisan contribution confirmed on Testnet."); router.replace(`/arisan/${r.id}`);
          } else {
            setError(r.error || t("arisan.somethingWrong"));
          }
        } catch { if (mounted.current) setError("Joining was interrupted. Check whether you joined before retrying."); }
      } finally {
        if (!joined && mounted.current) { operation.current = null; setActiveOperation(null); }
      }
    });
  }
  function review() {
    if (!mounted.current || operation.current || submission.locked || !canSubmit) return;
    const requestedCode = code;
    const request = ++reviewRequest.current;
    const isCurrent = () => mounted.current && reviewRequest.current === request && operation.current === "review";
    operation.current = "review";
    reviewedRef.current = null;
    setReviewed(null);
    setActiveOperation("review");
    setError(null);
    start(async () => {
      function accept(current: JoinRoom) {
        if (!isCurrent()) return;
        if (!Number.isSafeInteger(current.id) || current.id < 1 || !Number.isInteger(current.memberTarget) || current.memberTarget < 3 || current.memberTarget > 20 || !Number.isInteger(current.memberCount) || current.memberCount < 0 || current.memberCount > current.memberTarget || !Number.isFinite(current.sharePesos) || current.sharePesos <= 0 || !Number.isSafeInteger(current.joinDeadline) || current.joinDeadline < 0) {
          setError("Room terms could not be verified. Please retry.");
          return;
        }
        const shareStroops = isLocalPreview ? pesosToStroopsExact(String(current.sharePesos))?.toString() : current.shareStroops;
        const depositStroops = isLocalPreview && shareStroops ? (BigInt(shareStroops) * BigInt(current.memberTarget)).toString() : current.depositStroops;
        const viewer = isLocalPreview ? PREVIEW_WALLET.address : current.viewer;
        if (typeof shareStroops !== "string" || !/^[1-9]\d{0,38}$/.test(shareStroops) || typeof depositStroops !== "string" || !/^[1-9]\d{0,38}$/.test(depositStroops) || BigInt(depositStroops) !== BigInt(shareStroops) * BigInt(current.memberTarget) || typeof viewer !== "string" || !/^G[A-Z2-7]{55}$/.test(viewer)) {
          setError("Room terms could not be verified. Please retry.");
          return;
        }
        const accepted = Object.freeze({ room: Object.freeze({ ...current }), invitation: Object.freeze({ code: requestedCode, roomId: current.id, memberTarget: current.memberTarget, shareStroops, depositStroops, viewer }) });
        reviewedRef.current = accepted;
        setReviewed(accepted);
        setReviewClock(Math.floor(Date.now() / 1000));
      }
      try {
        if (isLocalPreview) {
          if (requestedCode !== "FAM234") { setError("This local example uses invite code FAM234."); return; }
          const saved = readPreviewArisanRoom(1);
          if (saved) { accept(saved); return; }
          accept({ id: 1, name: "Family arisan", memberTarget: 5, memberCount: 4, sharePesos: 250, cadence: "Weekly", cadenceSecs: 604800, status: "Open", isMember: false, joinDeadline: Math.floor(Date.now()/1000)+86400 }); return;
        }
        const resolved = await arisanResolveCode(requestedCode);
        if (!isCurrent()) return;
        if (!resolved.ok) { setError(resolved.error); return; }
        if (resolved.code !== requestedCode) { setError("The invitation changed. Please review it again."); return; }
        const current = await arisanRoomState(resolved.id);
        if (!isCurrent()) return;
        if (!current.ready || current.id !== resolved.id) { setError("Room terms could not load. Please retry."); return; }
        accept(current);
      } catch { if (isCurrent()) setError("Room terms could not load. Please retry."); }
      finally { if (isCurrent()) { operation.current = null; setActiveOperation(null); } }
    });
  }

  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%", paddingBottom: 24 }}>
      <SubmissionStatusPanel guard={submission} />
      <AppBar
        leading={
          <button type="button" aria-label="Back to arisan rooms" onClick={back} disabled={activeOperation === "join" || submission.locked} style={{ width: 44, height: 44, borderRadius: 22, border: "none", background: "rgba(11,18,32,.04)", color: T.ink, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{Ico.back({})}</button>
        }
        title={t("arisan.join.title")}
      />

      <header className={styles.formIntro}><div><span className={styles.eyebrow}>{room ? "Review your invitation" : "Join a circle · Testnet"}</span><h1>{room ? "Know the terms first." : "Your circle is waiting."}</h1><p>{isLocalPreview ? "Use FAM234 to try the local join flow. Example data only." : "Enter an invite code from someone you know. Review the deposit before joining."}</p></div><Image width={112} height={112} src="/illustrations/arisan.png" className={styles.doodle} alt="A small community sharing a money pool" /></header>
      {room && reviewed ? <div className={styles.body}><section className={styles.review}><h2>{room.name}</h2><dl><dt>Members</dt><dd>{room.memberCount}/{room.memberTarget}</dd><dt>Schedule</dt><dd>{room.cadenceSecs ? `${room.cadenceSecs} seconds between rounds (${isLocalPreview ? "local example" : "Testnet"})` : t("arisan.cadence." + room.cadence)}</dd><dt>Share per round</dt><dd>{formatXlm(reviewed.invitation.shareStroops)} Testnet XLM</dd><dt>Your upfront deposit</dt><dd>{formatXlm(reviewed.invitation.depositStroops)} Testnet XLM</dd><dt>Status</dt><dd>{room.status}</dd></dl><p className={styles.muted}>Illustrative display only: share {formatLocal(room.sharePesos,currency)}; upfront deposit {formatLocal(room.memberTarget*room.sharePesos,currency)}.</p><p className={styles.muted}>Deposit = {room.memberTarget} × your share. It funds all rounds before the first draw. Live rooms move valueless Testnet XLM; display currency is illustrative.</p></section>{error && <p role="alert" className={styles.error}>{error}</p>}{room.isMember ? <Btn onClick={() => router.push(`/arisan/${room.id}`)}>View your room</Btn> : <Btn onClick={submit} disabled={pending || room.status !== "Open" || room.memberCount >= room.memberTarget || room.joinDeadline <= reviewClock} loading={pending}>{isLocalPreview ? "Join local example" : "Confirm deposit and join"}</Btn>}<Btn kind="secondary" onClick={resetReview} disabled={pending}>Use another invite</Btn></div> : <>
      <div style={{ padding: "24px 16px 0" }}>
        <Card p={24} style={{ background: "#F2EFE7" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.slate }}>
            {t("arisan.join.codeLabel")}
          </div>
          <input
            value={code}
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="FAM234"
            aria-label={t("arisan.join.codeLabel")}
            disabled={pending}
            onChange={(e) => { if (!mounted.current || operation.current || submission.locked) return; reviewRequest.current++; reviewedRef.current = null; setReviewed(null); setCode(clean(e.target.value)); setError(null); }}
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: T.fontMono,
              fontSize: 32,
              fontWeight: 600,
              color: T.ink,
              letterSpacing: "0.18em",
              padding: "12px 0",
              textAlign: "center",
            }}
          />
          <div style={{ marginTop: 4, fontSize: 12, color: T.slate, textAlign: "center" }}>
            {t("arisan.join.codeHint")}
          </div>
        </Card>
      </div>

      {error && (
        <div style={{ padding: "12px 16px 0" }}>
          <div style={{ padding: "10px 12px", borderRadius: 10, background: T.warnTint, color: T.warn, fontSize: 13 }}>
            {error}
          </div>
        </div>
      )}

      <div style={{ padding: "20px 16px 0" }}>
        <Btn
          kind="primary"
          onClick={review}
          disabled={!canSubmit || pending}
          loading={pending}
        >
          Review invitation
        </Btn>
      </div>

      <div style={{ padding: "16px 24px 0", fontSize: 12, color: T.slate, lineHeight: 1.5, textAlign: "center" }}>
        {isLocalPreview ? "No funds are locked in this local demonstration." : t("arisan.join.footer")}
      </div>
      </>}
    </div>
  );
}
