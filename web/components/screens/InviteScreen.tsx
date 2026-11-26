"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { AppBar, Btn, Ico, IconButton } from "@/components/ui/kit";
import { useT } from "@/components/I18nProvider";
import { accountCopy } from "@/lib/i18n/revamp-account";
import { useGoBack } from "@/lib/ui/useGoBack";
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
  const [feedback, setFeedback] = useState<"link" | "code" | "failed" | null>(null);
  const ready = referral.status === "ready";
  const link = ready ? `${origin}/r/${referral.code}` : "";

  async function copy(what: "link" | "code") {
    if (!ready || !origin) return;
    try {
      await navigator.clipboard.writeText(what === "link" ? link : referral.code);
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
    <div className={styles.screen}>
      <AppBar title={c.inviteFriends} leading={<IconButton ariaLabel={c.back} onClick={back}>{Ico.back({})}</IconButton>} />
      <div className={styles.body}>
        {ready ? <>
          <p className={styles.note}>{c.referralIntro}</p>
          <section className={styles.card} aria-label={c.inviteFriends}>
            <div className={styles.row}>
              <div><span>{c.referralLink}</span><strong>{link}</strong></div>
              <IconButton ariaLabel={c.copyReferralLink} onClick={() => void copy("link")}>
                {feedback === "link" ? Ico.check({}) : Ico.link({})}
              </IconButton>
            </div>
            <div className={styles.row}>
              <div><span>{c.referralCode}</span><strong className={styles.code}>{referral.code.slice(0, 4)} {referral.code.slice(4)}</strong></div>
              <IconButton ariaLabel={c.copyReferralCode} onClick={() => void copy("code")}>
                {feedback === "code" ? Ico.check({}) : Ico.link({})}
              </IconButton>
            </div>
            <p className={styles.count}>{c.referralCount} <strong>{referral.invitedCount}</strong></p>
          </section>
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
        <Image className={styles.art} src="/illustrations/referral-people.png" alt="" width={252} height={155} />
      </div>
      {ready && <div className={styles.actions}>
        <Btn kind="secondary" disabled={!origin} onClick={() => void copy("link")}>{c.copyReferralLink}</Btn>
        <Btn kind="primary" disabled={!origin} onClick={() => void share()}>{t("receive.share")}</Btn>
      </div>}
    </div>
  );
}
