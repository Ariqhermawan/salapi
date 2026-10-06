"use client";
import { announceSuccessMotion } from "@/lib/ui/success-feedback";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { arisanJoin, arisanResolveCode, arisanRoomState } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { T, Ico, AppBar, IconButton, Card, Btn } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import { isLocalPreview } from "@/lib/local-preview";
import { useUnresolvedSubmission } from "@/lib/ui/useUnresolvedSubmission";
import SubmissionStatusPanel from "@/components/ui/SubmissionStatusPanel";
import { formatLocal } from "@/lib/ui/currency";
import styles from "./CampaignArisan.module.css";
import { commitPreviewArisanSession, readPreviewArisanRoom, savePreviewArisanRoom } from "./arisan-preview";
import { PREVIEW_WALLET } from "@/lib/local-preview";

// Invite codes are 6 chars from {digits 2–9, A–Z minus O/I}.
const ALPHA = /^[A-Z2-9]+$/;

export default function ArisanJoinScreen() {
  const submission = useUnresolvedSubmission("arisan:rooms");
  const { t, currency } = useT();
  const router = useRouter();
  const goBack = useGoBack("/arisan");
  const [code, setCode] = useState("");
  const [transitionPending, start] = useTransition();
  const pending = transitionPending || submission.locked;
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<{ id: number; name: string; memberTarget: number; memberCount: number; sharePesos: number; cadence: string; status: string; isMember: boolean; joinDeadline: number } | null>(null);
  const [reviewClock, setReviewClock] = useState(0);

  const canSubmit = code.length === 6 && ALPHA.test(code);

  function clean(s: string): string {
    return s
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .replace(/[OI01]/g, "")
      .slice(0, 6);
  }

  function submit() {
    if (pending) return;
    setError(null);
    start(async () => {
      if (isLocalPreview) {
        try {
        const saved = readPreviewArisanRoom(room?.id ?? 1, true);
        const changes = [{ key: "salapi.preview.arisan-left", value: null }, { key: "salapi.preview.arisan-joined", value: "1" }];
        if (saved && !saved.isMember) {
          const seats = [...saved.seats.filter(seat => !seat.isYou), { addr: PREVIEW_WALLET.address, label: "Ariqhermawan", won: false, committed: false, revealed: false, isYou: true }];
          if (!savePreviewArisanRoom({ ...saved, seats, memberCount: seats.length, isMember: true, isHost: false, readyToStart: false, code: "FAM234" }, changes)) throw new Error("Preview membership could not be saved.");
        } else if (!commitPreviewArisanSession(changes)) throw new Error("Preview membership could not be saved.");
        announceSuccessMotion("Arisan funding demo complete. No tokens moved."); router.replace(`/arisan/${room?.id ?? 1}`);
        } catch { setError("Browser storage could not confirm the local membership save. No room was opened and no tokens moved. Check the local room before retrying."); }
        return;
      }
      try {
      const r = await submission.run(() => arisanJoin(code));
      if (!r) return;
      if (r.ok) {
        announceSuccessMotion("Arisan contribution confirmed on Testnet."); router.replace(`/arisan/${r.id}`);
      } else {
        setError(r.error || t("arisan.somethingWrong"));
      }
      } catch { setError("Joining was interrupted. Check whether you joined before retrying."); }
    });
  }
  function review() {
    setError(null);
    setReviewClock(Math.floor(Date.now()/1000));
    start(async () => {
      if (isLocalPreview) {
        if (code !== "FAM234") { setError("This local example uses invite code FAM234."); return; }
        const saved = readPreviewArisanRoom(1);
        if (saved) { setRoom(saved); return; }
        setRoom({ id: 1, name: "Family arisan", memberTarget: 5, memberCount: 4, sharePesos: 250, cadence: "Weekly", status: "Open", isMember: false, joinDeadline: Math.floor(Date.now()/1000)+86400 }); return;
      }
      try {
        const resolved = await arisanResolveCode(code);
        if (!resolved.ok) { setError(resolved.error); return; }
        const current = await arisanRoomState(resolved.id);
        if (!current.ready) { setError("Room terms could not load. Please retry."); return; }
        setRoom(current);
      } catch { setError("Room terms could not load. Please retry."); }
    });
  }

  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%", paddingBottom: 24 }}>
      <SubmissionStatusPanel guard={submission} />
      <AppBar
        leading={
          <IconButton ariaLabel="Back to arisan rooms" onClick={room ? () => setRoom(null) : goBack}>{Ico.back({})}</IconButton>
        }
        title={t("arisan.join.title")}
      />

      <header className={styles.formIntro}><div><span className={styles.eyebrow}>{room ? "Review your invitation" : "Join a circle · Testnet"}</span><h1>{room ? "Know the terms first." : "Your circle is waiting."}</h1><p>{isLocalPreview ? "Use FAM234 to try the local join flow. Example data only." : "Enter an invite code from someone you know. Review the deposit before joining."}</p></div><Image width={112} height={112} src="/illustrations/arisan.png" className={styles.doodle} alt="A small community sharing a money pool" /></header>
      {room ? <div className={styles.body}><section className={styles.review}><h2>{room.name}</h2><dl><dt>Members</dt><dd>{room.memberCount}/{room.memberTarget}</dd><dt>Schedule</dt><dd>{t("arisan.cadence." + room.cadence)}</dd><dt>Share per round</dt><dd>{formatLocal(room.sharePesos,currency)}</dd><dt>Your upfront deposit</dt><dd>{formatLocal(room.memberTarget*room.sharePesos,currency)}</dd><dt>Status</dt><dd>{room.status}</dd></dl><p className={styles.muted}>Deposit = {room.memberTarget} × your share. It funds all rounds before the first draw. Live rooms move valueless Testnet XLM; display currency is illustrative.</p></section>{error && <p role="alert" className={styles.error}>{error}</p>}{room.isMember ? <Btn onClick={() => router.push(`/arisan/${room.id}`)}>View your room</Btn> : <Btn onClick={submit} disabled={pending || room.status !== "Open" || room.memberCount >= room.memberTarget || room.joinDeadline <= reviewClock} loading={pending}>{isLocalPreview ? "Join local example" : "Confirm deposit and join"}</Btn>}<Btn kind="secondary" onClick={() => setRoom(null)} disabled={pending}>Use another invite</Btn></div> : <>
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
            onChange={(e) => { setCode(clean(e.target.value)); setError(null); }}
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
