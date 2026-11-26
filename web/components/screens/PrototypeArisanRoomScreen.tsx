"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check, Copy, ShareNetwork } from "@phosphor-icons/react";
import { PoweredByStellar } from "@/components/ui/kit";
import styles from "./PrototypeArisanRoomScreen.module.css";

type RoomKey = "r_1" | "r_4";
const MEMBER_ROWS = [
  { name: "@maria_s", initials: "MS", detail: "Room Master · Deposit locked", status: "Paid" },
  { name: "@jamamam", initials: "JA", detail: "Deposit locked", status: "Paid" },
  { name: "@jamal_r", initials: "JR", detail: "Deposit locked", status: "Paid" },
  { name: "@ana_d", initials: "AD", detail: "Deposit locked", status: "Paid" },
  { name: "You", initials: "YO", detail: "Deposit locked", status: "Paid" },
];

export default function PrototypeArisanRoomScreen({ roomKey }: { roomKey: string }) {
  const isActive = roomKey === "r_4";
  const room = isActive
    ? { name: "Kapitbahay Circle", status: "Active", cadence: "Monthly", zone: "Asia/Manila", joined: 5, members: 5, share: "$25.00", pot: "$125.00", xlm: "1,115.38 XLM", deadline: "27 Nov", deadlineDetail: "23:00 Asia/Manila", code: "DRW789" }
    : { name: "Family Circle", status: "Open", cadence: "Weekly", zone: "UTC", joined: 2, members: 4, share: "$10.00", pot: "$40.00", xlm: "356.92 XLM", deadline: "30 Nov", deadlineDetail: "19:00 UTC", code: "FAM234" };
  const [tab, setTab] = useState<"Schedule" | "History">("Schedule");
  const [copied, setCopied] = useState(false);
  const memberRows = isActive ? MEMBER_ROWS : [MEMBER_ROWS[0], MEMBER_ROWS[4]];

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(`Join ${room.name} on Salapi with code ${room.code}`);
      setCopied(true);
      window.dispatchEvent(new CustomEvent("salapi:success-motion", { detail: `Invite code ${room.code} copied` }));
      window.setTimeout(() => setCopied(false), 1800);
    } catch { window.dispatchEvent(new CustomEvent("salapi:success-motion", { detail: "Could not copy the invite code" })); }
  }

  async function shareCode() {
    try {
      if (navigator.share) await navigator.share({ title: `Join ${room.name}`, text: `Join ${room.name} on Salapi with code ${room.code}` });
      else await copyCode();
    } catch { /* The share sheet can be dismissed without changing the room. */ }
  }

  return <div className={styles.screen} data-testid="prototype-arisan-room">
    <header className={styles.header}>
      <Link href="/vaults/sample" aria-label="Back to Arisan"><ArrowLeft size={19} aria-hidden="true" /></Link>
      <h1>{room.name}</h1>
    </header>

    <div className={styles.chips} aria-label="Room status">
      <span data-status={room.status}>{room.status}</span><span>{room.cadence}</span><span>{room.zone}</span>
    </div>

    <section className={styles.overview} aria-label="Room overview">
      <div className={styles.overviewTop}>
        <div><span className={styles.eyebrow}>YOU JOINED THIS ROOM</span><h2>{isActive ? "The circle is running." : "Waiting for the circle to fill."}</h2></div>
        <Image src="/prototype-arisan/helping.png" alt="" width={80} height={75} />
      </div>
      <p>Each member locks {room.members} × their share up front. No interest, no yield.</p>
      <div className={styles.memberCount}>
        <span className={styles.youAvatar}>YO</span>
        <span><strong>{room.joined}/{room.members} members</strong><small>{room.joined === room.members ? "Every seat is taken" : `${room.members - room.joined} places remaining`}</small></span>
      </div>
    </section>

    <dl className={styles.band}>
      <div><dt>Round pot</dt><dd>{room.pot}</dd><span>≈ {room.xlm}</span></div>
      <div><dt>Share per round</dt><dd>{room.share}</dd><span>{room.members} rounds</span></div>
      <div><dt>Join deadline</dt><dd>{room.deadline}</dd><span>{room.deadlineDetail}</span></div>
    </dl>

    {isActive ? <section className={styles.stage}>
      <span className={styles.eyebrow}>ROUND 1 OF 5</span>
      <div className={styles.winner}>
        <span className={styles.winnerAvatar}>MS</span>
        <span className={styles.winnerInfo}><strong>@maria_s won this round</strong><small>{room.pot} · ≈ {room.xlm}</small></span>
        <span className={styles.released}>Released</span>
      </div>
      <p>The pot is with @maria_s. Next draw: 27 Dec 2026.</p>
    </section> : <section className={styles.invite}>
      <span className={styles.qr} aria-hidden="true">▦</span>
      <div className={styles.inviteText}><small>Invite code</small><strong>{room.code}</strong><p>Share it with friends or family. Only people with this code can join the room.</p></div>
      <div className={styles.inviteActions}>
        <button type="button" onClick={() => void copyCode()} aria-label={`${copied ? "Copying" : "Copy"} code ${room.code}`}>
          {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={() => void shareCode()} aria-label={`Share code ${room.code}`}><ShareNetwork size={15} aria-hidden="true" />Share</button>
      </div>
    </section>}

    <section className={styles.members} aria-labelledby="room-members-title">
      <header><h2 id="room-members-title">Members ({room.joined}/{room.members})</h2>{room.joined < room.members ? <span>{room.members-room.joined} places remaining</span> : null}</header>
      <div className={styles.memberList}>
        {memberRows.map(member => <div key={member.name} className={styles.member}>
          <span className={styles.avatar}>{member.initials}</span><span className={styles.memberInfo}><strong>{member.name}</strong><small>{member.detail}</small></span><span className={styles.paid}>{member.status}</span>
        </div>)}
        {!isActive ? [3, 4].map(seat => <div key={seat} className={styles.member}>
          <span className={styles.emptySeat}>{seat}</span><span className={styles.memberInfo}><strong>Seat {seat}</strong><small>No one has joined yet</small></span><span className={styles.waiting}>Waiting</span>
        </div>) : null}
      </div>
    </section>

    <section className={styles.deposit} aria-label="Your deposit">
      <h2>Your deposit</h2><div><span>Locked</span><strong>{room.pot}</strong></div><div><span>In XLM</span><strong>≈ {room.xlm}</strong></div>
    </section>

    <div className={styles.tabs} role="tablist" aria-label="Room details">
      {(["Schedule", "History"] as const).map(value => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value}</button>)}
    </div>

    {tab === "Schedule" ? <section className={styles.details} aria-label="Room schedule">
      {isActive ? <>
        <Detail label="First draw" value="27 Nov 2026, 23:30" />
        <Detail label="How often" value="Monthly, every 30 days" />
        <Detail label="Join deadline" value="27 Nov 2026, 23:00" />
        <Detail label="Timezone" value="Asia/Manila" />
        <Detail label="Location" value="Barangay San Roque Hall" />
      </> : <>
        <Detail label="First draw" value="7 Dec 2026, 19:00" />
        <Detail label="How often" value="Weekly, every 7 days" />
        <Detail label="Join deadline" value="30 Nov 2026, 19:00" />
        <Detail label="Timezone" value="UTC" />
        <Detail label="Location" value="Remote" />
      </>}
    </section> : <section className={styles.details} aria-label="Room history">
      {isActive ? <>
        <Detail label="Pot released to @maria_s" value="Round 1 · $125.00" />
        <Detail label="@maria_s won the draw" value="Signed by @jamamam, @jamal_r" />
        <Detail label="You locked your deposit" value="27 Nov · $125.00" />
        <Detail label="Room opened by @maria_s" value="Code DRW789" />
      </> : <>
        <Detail label="You locked your deposit" value="27 Nov · $40.00" />
        <Detail label="@maria_s joined" value="Deposit locked" />
        <Detail label="Room opened by @maria_s" value="Code FAM234" />
      </>}
    </section>}

    {!isActive ? <p className={styles.fillingNote}>The room starts once all 4 members have joined, at the join deadline. Until then the person who opened it can cancel it, and your deposit comes back.</p> : null}
    <footer className={styles.footer}><PoweredByStellar /></footer>
  </div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className={styles.detail}><span>{label}</span><strong>{value}</strong></div>;
}
