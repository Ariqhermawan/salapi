"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { AppBar, Btn, Ico, IconButton } from "@/components/ui/kit";
import { claimReferralRewardAction, setupReferralTrustlineAction } from "@/app/referral-actions";
import { earnPreviewReferralReward, isLocalPreview, previewReferralRewardEarned } from "@/lib/local-preview";
import { useGoBack } from "@/lib/ui/useGoBack";
import type { readOwnReferral } from "@/lib/server/referrals";
import styles from "./PrototypeReferralsScreen.module.css";

type ReferralState = Awaited<ReturnType<typeof readOwnReferral>>;
type Friend = { username: string; joined: string; donated: number; avatar?: string };
const SAMPLE: Friend[] = [
  { username: "maria_s", joined: "12 Nov 2026", donated: 2500, avatar: "/prototype-causes/avatar-maria.png" },
  { username: "meis_family", joined: "14 Nov 2026", donated: 1200, avatar: "/prototype-causes/avatar-mei.png" },
  { username: "jamal_r", joined: "17 Nov 2026", donated: 500 },
  { username: "mika_t", joined: "21 Nov 2026", donated: 0 },
  { username: "ana.reyes", joined: "24 Nov 2026", donated: 0 },
];
const EARNED_SAMPLE: Friend[] = [
  ...SAMPLE.slice(0, 3),
  { username: "mika_t", joined: "21 Nov 2026", donated: 1000 },
  { username: "ana.reyes", joined: "24 Nov 2026", donated: 500 },
  { username: "jamamam", joined: "24 Nov 2026", donated: 2000 },
  { username: "lito_r", joined: "25 Nov 2026", donated: 500 },
  { username: "ana_d", joined: "25 Nov 2026", donated: 1500 },
  { username: "kapatid_tinta", joined: "26 Nov 2026", donated: 500 },
  { username: "budi.s", joined: "26 Nov 2026", donated: 5000 },
  { username: "rina_w", joined: "27 Nov 2026", donated: 0 },
  { username: "paolo_c", joined: "27 Nov 2026", donated: 0 },
];
const REFERRAL_TERMS = "You get $20 USDC once 10 friends you invited have each donated $5 or more.";
const EARNED_TERMS = "You earned $20 USDC: 10 friends you invited have each donated $5 or more. It was added to your balance.";
const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function initials(username: string) {
  const parts = username.replace(/[^a-z0-9]+/gi, " ").trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : username.slice(0, 2)).toUpperCase();
}

export default function PrototypeReferralsScreen({ referral }: { referral: ReferralState }) {
  const params = useSearchParams();
  const router = useRouter();
  const back = useGoBack("/you/invite");
  const earnedRoute = params.get("state") === "earned";
  const [earned, setEarned] = useState(false);
  const [actionNote, setActionNote] = useState("");
  const [actionPending, startTransition] = useTransition();
  useEffect(() => {
    if (isLocalPreview && earnedRoute) earnPreviewReferralReward();
    setEarned(isLocalPreview && previewReferralRewardEarned());
  }, [earnedRoute]);
  const empty = params.get("state") === "empty" || (!isLocalPreview && referral.status === "ready" && referral.invitedCount === 0);
  const friends = isLocalPreview && params.get("state") !== "empty" ? earned ? EARNED_SAMPLE : SAMPLE : [];
  const donated = friends.filter(friend => friend.donated >= 500);
  const waiting = friends.filter(friend => friend.donated < 500);
  const count = isLocalPreview ? donated.length : 0;
  const realCount = referral.status === "ready" ? referral.qualifiedCount : 0;
  const realEarned = referral.status === "ready" && referral.rewardStatus === "paid";
  const rewardEarned = isLocalPreview ? earned : realEarned;
  const rewardProgressReady = referral.status === "ready" && referral.progressStatus === "ready";

  function runRewardAction(action: "trustline" | "claim") {
    setActionNote("");
    startTransition(async () => {
      const result = action === "trustline" ? await setupReferralTrustlineAction() : await claimReferralRewardAction();
      const notes: Record<string, string> = {
        trustline_ready: "USDC is ready in your Testnet wallet. You can claim the reward now.",
        trustline_pending: "Your USDC trustline is being confirmed on Stellar Testnet. Check again shortly.",
        trustline_required: "Set up a USDC trustline before claiming. This uses additional Testnet XLM reserve, not a fee.",
        wallet_not_ready: "Set up your Testnet wallet before receiving the reward.",
        treasury_unconfigured: "Referral payout is not configured yet. No transfer was sent.",
        treasury_unfunded: "The Testnet reward wallet does not have enough USDC yet. No transfer was sent.",
        pending: "The payout is being confirmed on Stellar Testnet. Check again shortly.",
        paid: "The $20 USDC Testnet reward is confirmed.",
        failed: "The Testnet payout failed. No reward was transferred.",
        not_eligible: "The reward is available after 10 invited friends each reach $5 in verified donations.",
        busy: "A reward claim is already being processed. Check again shortly.",
        unauthenticated: "Sign in to claim your referral reward.",
        unavailable: "Referral progress or payout could not be verified. No transfer was sent.",
      };
      setActionNote(notes[result.status] ?? "Referral reward status updated.");
      router.refresh();
    });
  }

  return <div className={styles.screen}>
    <AppBar leading={<IconButton ariaLabel="Back" onClick={back}>{Ico.back({})}</IconButton>} title="Referrals" />
    {empty ? <section className={styles.empty}>
      <Image src="/illustrations/empty-rooms.png" alt="" width={104} height={104} />
      <h1>No referrals yet</h1>
      <p>Friends who sign up with your link or code show here.</p>
      <Link href="/you/invite">Invite friends</Link>
    </section> : <div className={styles.body}>
      {referral.status === "guest" ? <section className={styles.panel}><p>Sign in to see your referrals.</p><Link href="/signin?next=%2Fyou%2Freferrals">Sign in</Link></section>
        : referral.status === "unavailable" ? <section className={styles.panel} role="status"><p>Referrals could not be loaded. Try again later.</p></section>
          : <>
            <section className={styles.summary}>
              <div className={styles.summaryHead}><span>Referral reward</span><span>{rewardEarned ? "Earned" : `${Math.max(0, 10 - (isLocalPreview ? count : realCount))} to go`}</span></div>
              <strong>{isLocalPreview ? `${count} of 10` : rewardProgressReady ? `${Math.min(realCount, 10)} of 10` : "— of 10"}</strong>
              <span className={styles.progress} role="img" aria-label={`${isLocalPreview ? count : rewardProgressReady ? realCount : 0} of 10`}><i style={{ width: `${isLocalPreview ? Math.min(count * 10, 100) : rewardProgressReady ? Math.min(realCount * 10, 100) : 0}%` }} /></span>
              <p className={styles.terms}>{rewardEarned ? EARNED_TERMS : isLocalPreview ? REFERRAL_TERMS : "You get $20 Testnet USDC once 10 friends you invited have each donated at least $5 at a fresh market estimate."}</p>
              {!isLocalPreview && !rewardProgressReady && <p className={styles.backendNote}>Verified Testnet donation progress is temporarily unavailable. It will appear when the receipt records and a fresh price quote are available.</p>}
              {!isLocalPreview && rewardProgressReady && <p className={styles.backendNote}>{referral.invitedCount} friend{referral.invitedCount === 1 ? " has" : "s have"} signed up. Progress counts only distinct invited accounts with verified D4 Testnet donations worth at least $5.</p>}
              {rewardEarned ? <Link className={styles.inviteButton} href="/activity/referral-reward">View receipt</Link>
                : isLocalPreview ? <Link className={styles.inviteButton} href="/you/invite">Invite friends</Link>
                  : rewardProgressReady && realCount >= 10 && referral.rewardStatus === "paid" ? <Link className={styles.inviteButton} href="/activity/referral-reward">View receipt</Link>
                    : rewardProgressReady && realCount >= 10 && referral.rewardStatus === "preparing" ? <Btn kind="secondary" disabled>Preparing reward…</Btn>
                    : rewardProgressReady && realCount >= 10 && referral.rewardStatus === "failed" ? <p className={styles.backendNote}>The last Testnet transfer failed and is not being retried automatically.</p>
                    : rewardProgressReady && realCount >= 10 && referral.rewardStatus === "unavailable" ? <p className={styles.backendNote}>Reward payout is not available yet. No transfer was sent.</p>
                    : rewardProgressReady && realCount >= 10 && !referral.walletReady ? <Link className={styles.inviteButton} href="/wallet/setup?next=%2Fyou%2Freferrals">Set up your Testnet wallet</Link>
                    : rewardProgressReady && realCount >= 10 && referral.usdcTrustline === null ? <p className={styles.backendNote}>Could not confirm your Testnet USDC trustline. Refresh or check wallet setup; no transfer was sent.</p>
                    : rewardProgressReady && realCount >= 10 && referral.usdcTrustline === false ? <Btn kind="primary" disabled={actionPending} onClick={() => runRewardAction("trustline")}>{actionPending ? "Setting up…" : "Set up USDC"}</Btn>
                      : rewardProgressReady && realCount >= 10 && referral.usdcTrustline === true && (referral.rewardStatus === "eligible" || referral.rewardStatus === "pending" || referral.rewardStatus === "submitted")
                        ? <Btn kind="primary" disabled={actionPending} onClick={() => runRewardAction("claim")}>{actionPending ? "Checking…" : referral.rewardStatus === "submitted" ? "Check payout" : "Claim $20 USDC"}</Btn>
                        : <Link className={styles.inviteButton} href="/you/invite">Invite friends</Link>}
              {actionNote && <p className={styles.backendNote} role="status">{actionNote}</p>}
              {!isLocalPreview && rewardProgressReady && realCount >= 10 && referral.usdcTrustline === false && <p className={styles.backendNote}>Setting up USDC adds a Testnet trustline and uses some Testnet XLM as account reserve. The reserve is not a transaction fee.</p>}
              {!isLocalPreview && rewardProgressReady && realCount >= 10 && referral.rewardStatus === "failed" && referral.rewardHash && <a className={styles.rewardExplorer} href={`https://stellar.expert/explorer/testnet/tx/${referral.rewardHash}`} target="_blank" rel="noreferrer">View failed Testnet transaction</a>}
              {!isLocalPreview && referral.rewardStatus === "submitted" && referral.rewardHash && <a className={styles.rewardExplorer} href={`https://stellar.expert/explorer/testnet/tx/${referral.rewardHash}`} target="_blank" rel="noreferrer">View Testnet transaction</a>}
            </section>
            {isLocalPreview ? <>
              <h2 className={styles.groupTitle}>Donated · {donated.length}</h2>
              <section className={styles.rows}>{donated.map(friend => <FriendRow key={friend.username} friend={friend} />)}</section>
              <h2 className={styles.groupTitle}>Registered, no donation yet · {waiting.length}</h2>
              <section className={styles.rows}>{waiting.map(friend => <FriendRow key={friend.username} friend={friend} />)}</section>
            </> : referral.status === "ready" && referral.invitedCount > 0 ? <section className={styles.panel}><p>{referral.invitedCount} friend{referral.invitedCount === 1 ? " has" : "s have"} signed up with your link or code.</p></section> : null}
          </>}
    </div>}
  </div>;
}

function FriendRow({ friend }: { friend: Friend }) {
  return <article className={styles.friend}>
    {friend.avatar ? <Image className={styles.avatar} src={friend.avatar} alt="" width={40} height={40} /> : <span className={styles.initials}>{initials(friend.username)}</span>}
    <span className={styles.friendCopy}><strong>@{friend.username}</strong><small>Joined {friend.joined}</small></span>
    <span className={friend.donated >= 500 ? styles.donated : styles.waiting}>{friend.donated >= 500 ? `Donated ${dollars(friend.donated)}` : "No donation yet"}</span>
  </article>;
}
