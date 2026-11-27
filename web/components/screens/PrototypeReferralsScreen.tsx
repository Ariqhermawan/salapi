"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppBar, Btn, Ico, IconButton } from "@/components/ui/kit";
import { isLocalPreview } from "@/lib/local-preview";
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
const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function initials(username: string) {
  const parts = username.replace(/[^a-z0-9]+/gi, " ").trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : username.slice(0, 2)).toUpperCase();
}

export default function PrototypeReferralsScreen({ referral }: { referral: ReferralState }) {
  const params = useSearchParams();
  const back = useGoBack("/you/invite");
  const empty = params.get("state") === "empty" || (!isLocalPreview && referral.status === "ready" && referral.invitedCount === 0);
  const friends = isLocalPreview && params.get("state") !== "empty" ? SAMPLE : [];
  const donated = friends.filter(friend => friend.donated >= 500);
  const waiting = friends.filter(friend => friend.donated < 500);
  const count = isLocalPreview ? donated.length : 0;
  const realCount = referral.status === "ready" ? referral.invitedCount ?? 0 : 0;

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
              <div className={styles.summaryHead}><span>Invite 10 users</span><span>{isLocalPreview ? "7 to go" : `${Math.max(0, 10 - realCount)} to go`}</span></div>
              <strong>{isLocalPreview ? "3 of 10" : `${Math.min(realCount, 10)} of 10`}</strong>
              <span className={styles.progress} role="img" aria-label={`${count} of 10`}><i style={{ width: `${isLocalPreview ? 30 : Math.min(realCount * 10, 100)}%` }} /></span>
              <div className={styles.terms}><span>Minimum donation <b>$5</b></span><span>Reward <b>$20 USDC</b></span></div>
              {!isLocalPreview && <p className={styles.backendNote}>Referral sign-ups are tracked. Donation progress is not available yet.</p>}
              <Link className={styles.inviteButton} href="/you/invite">Invite friends</Link>
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
