"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppBar, Btn, Ico, IconButton } from "@/components/ui/kit";
import { useT } from "@/components/I18nProvider";
import { accountCopy } from "@/lib/i18n/revamp-account";
import { useGoBack } from "@/lib/ui/useGoBack";
import { earnPreviewReferralReward, isLocalPreview, previewReferralRewardEarned } from "@/lib/local-preview";
import type { readOwnReferral } from "@/lib/server/referrals";
import styles from "./InviteScreen.module.css";

const subscribe = () => () => {};
const browserOrigin = () => window.location.origin;
const serverOrigin = () => "";

export default function InviteScreen({ referral }: { referral: Awaited<ReturnType<typeof readOwnReferral>> }) {
  const { locale, t } = useT();
  const c = accountCopy(locale);
  const back = useGoBack("/settings");
  const origin = useSyncExternalStore(subscribe, browserOrigin, serverOrigin);
  const params = useSearchParams();
  const rewardState = params.get("state");
  const earnedRoute = rewardState === "earned";
  const [rewardEarned, setRewardEarned] = useState(false);
  const [feedback, setFeedback] = useState<"link" | "code" | "failed" | null>(null);
  const preview = isLocalPreview && referral.status === "preview";
  const previewCode = "K7M2Q9XD";
  const intro = preview ? "Anyone who signs up with your link or code is recorded as invited by you." : c.referralIntro;
  const ready = referral.status === "ready" || preview;
  const earnedNow = preview ? rewardEarned : referral.status === "ready" && referral.rewardStatus === "paid";
  const rewardCount = preview ? rewardEarned ? 10 : 3 : referral.status === "ready" && referral.progressStatus === "ready" ? referral.qualifiedCount : null;
  const code = preview ? previewCode : referral.status === "ready" ? referral.code : "";
  const link = preview ? `https://salapi.app/r/${previewCode}` : ready ? `${origin}/r/${code}` : "";
  const shownLink = preview ? `salapi.app/r/${previewCode}` : link;

  useEffect(() => {
    if (preview && earnedRoute) earnPreviewReferralReward();
    setRewardEarned(preview && previewReferralRewardEarned());
  }, [earnedRoute, preview]);

  async function copy(what: "link" | "code") {
    if (!ready || !origin) return;
    try {
      await navigator.clipboard.writeText(what === "link" ? link : code);
      setFeedback(what);
    } catch {
      setFeedback("failed");
    }
  }

  async function share() {
    if (!ready || !origin) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: c.inviteFriends, url: link });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copy("link");
  }

  return (
    <div className={`${styles.screen} ${preview ? styles.invitePreview : ""}`}>
      {preview ? <header className={styles.previewHeader}><IconButton ariaLabel={c.back} onClick={back}>{Ico.back({})}</IconButton><strong>{c.inviteFriends}</strong></header>
        : <AppBar title={c.inviteFriends} leading={<IconButton ariaLabel={c.back} onClick={back}>{Ico.back({})}</IconButton>} />}
      <div className={styles.body}>
        {ready ? <>
          <p className={styles.note}>{intro}</p>
          <section className={styles.card} aria-label={c.inviteFriends}>
            <div className={styles.row}>
              <div><span>{c.referralLink}</span><strong>{shownLink}</strong></div>
              <IconButton ariaLabel={c.copyReferralLink} onClick={() => void copy("link")}>
                {feedback === "link" ? Ico.check({}) : <CopyIcon />}
              </IconButton>
            </div>
            <div className={styles.row}>
              <div><span>{c.referralCode}</span><strong className={styles.code}>{code.slice(0, 4)} {code.slice(4)}</strong></div>
              <IconButton ariaLabel={c.copyReferralCode} onClick={() => void copy("code")}>
                {feedback === "code" ? Ico.check({}) : <CopyIcon />}
              </IconButton>
            </div>
            {!preview && <p className={styles.count}>{c.referralCount} <strong>{referral.status === "ready" ? referral.invitedCount : 0}</strong></p>}
          </section>
          {(preview || referral.status === "ready") && <Link className={styles.campaign} href={earnedNow ? "/activity/referral-reward" : "/you/referrals"}>
            <span className={styles.campaignHead}><strong>Referral reward</strong><strong>{earnedNow ? "Earned" : `${rewardCount === null ? "—" : Math.min(rewardCount, 10)} of 10`}</strong></span>
            <span className={styles.campaignProgress} role="img" aria-label={earnedNow ? "10 of 10" : `${rewardCount ?? 0} of 10`}><i style={{ width: earnedNow ? "100%" : rewardCount === null ? "0%" : `${Math.min(rewardCount * 10, 100)}%` }} /></span>
            <span className={styles.campaignTerms}>{earnedNow ? "You earned $20 USDC on Stellar Testnet. View your transaction receipt." : rewardCount === null ? "Verified Testnet donation progress will appear when receipts and a fresh price quote are available." : "You get $20 USDC on Testnet once 10 friends you invited have each donated at least $5 at a fresh market estimate."}</span>
            <span className={styles.campaignLink}>View your referrals <span aria-hidden="true">→</span></span>
          </Link>}
          {feedback === "failed" && <p role="alert" className={styles.note}>{c.referralCopyError}</p>}
          {feedback && feedback !== "failed" && <p role="status" className="sr-only">{c.referralCopied}</p>}
        </> : (
          <section className={styles.card}>
            {referral.status === "guest" ? <Link href="/signin?next=%2Fyou%2Finvite">{t("signin.signIn")}</Link>
              : <p role={referral.status === "unavailable" ? "alert" : undefined}>
                {referral.status === "preview" ? c.referralPreview : c.referralUnavailable}
              </p>}
          </section>
        )}
        <Image className={styles.art} src="/illustrations/referral-people.png" alt="" width={200} height={200} />
      </div>
      {ready && <div className={styles.actions}>
        <Btn kind="secondary" disabled={!origin} onClick={() => void copy("link")}>{c.copyReferralLink}</Btn>
        <Btn kind="primary" disabled={!origin} onClick={() => void share()}>{t("receive.share")}</Btn>
      </div>}
    </div>
  );
}

function CopyIcon() {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <rect x="7" y="6" width="9" height="11" rx="1.8" stroke="currentColor" strokeWidth="1.5" />
    <path d="M12.5 6V4.8A1.8 1.8 0 0 0 10.7 3H5.8A1.8 1.8 0 0 0 4 4.8v7.4A1.8 1.8 0 0 0 5.8 14H7" stroke="currentColor" strokeWidth="1.5" />
  </svg>;
}
