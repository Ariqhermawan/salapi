"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, ShareNetwork } from "@phosphor-icons/react";
import { PoweredByStellar } from "@/components/ui/kit";
import styles from "./PrototypeArisanRoomScreen.module.css";

type RoomKey = "r_1" | "r_4" | "r_done" | "joined" | "preview-created";
type JoinedRoom = { code: string; name: string; members: number; joined: number; share: number; cadence: string; closes: string; firstDraw: string; place: string };
type CreatedRoom = { name: string; members: number; share: number; interval: string; zone: string; closes: string; firstDraw: string; place: string; code: string };
const CREATED_ROOM_KEY = "salapi.prototype-arisan-created.v1";
const JOINED_ROOM_KEY = "salapi.prototype-arisan-joined.v1";
const MEMBER_ROWS = [
  { name: "@maria_s", initials: "MS", detail: "Room Master · Deposit locked", status: "Paid" },
  { name: "@jamamam", initials: "JA", detail: "Deposit locked", status: "Paid" },
  { name: "@jamal_r", initials: "JR", detail: "Deposit locked", status: "Paid" },
  { name: "@ana_d", initials: "AD", detail: "Deposit locked", status: "Paid" },
  { name: "You", initials: "YO", detail: "Deposit locked", status: "Paid" },
];
const DONE_MEMBER_ROWS = [
  { name: "@maria_s", initials: "MS", detail: "Completed member", status: "Paid" },
  { name: "@jamamam", initials: "JA", detail: "Completed member", status: "Paid" },
  { name: "@jamal_r", initials: "JR", detail: "Completed member", status: "Paid" },
  { name: "You", initials: "YO", detail: "Completed member · local example", status: "Paid" },
];

export default function PrototypeArisanRoomScreen({ roomKey }: { roomKey: RoomKey }) {
  const [created, setCreated] = useState<CreatedRoom | null>(null);
  const [joinedRoom, setJoinedRoom] = useState<JoinedRoom | null>(null);
  const [released, setReleased] = useState(false);
  const isActive = roomKey === "r_4";
  const isDone = roomKey === "r_done";
  useEffect(() => {
    if (roomKey === "joined") {
      try {
        const value = JSON.parse(window.localStorage.getItem(JOINED_ROOM_KEY) ?? "null") as Partial<JoinedRoom> | null;
        if (value && typeof value.code === "string" && typeof value.name === "string" && Number.isInteger(value.members) && Number.isInteger(value.joined) && typeof value.share === "number") setJoinedRoom(value as JoinedRoom);
      } catch { /* The room keeps its sample view if this local example is unavailable. */ }
      return;
    }
    if (roomKey !== "preview-created") return;
    try {
      const value = JSON.parse(window.localStorage.getItem(CREATED_ROOM_KEY) ?? "null") as Partial<CreatedRoom> | null;
      if (value && typeof value.name === "string" && Number.isInteger(value.members) && typeof value.share === "number" && typeof value.code === "string") {
        setCreated(value as CreatedRoom);
      }
    } catch { /* A missing local example falls back to the sample room view. */ }
  }, [roomKey]);
  useEffect(() => {
    if (!isActive) return;
    const timer = window.setTimeout(() => setReleased(true), 3200);
    return () => window.clearTimeout(timer);
  }, [isActive]);
  const usd = (amount: number) => `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const sampleRoom = roomKey === "joined" && joinedRoom
    ? { name: joinedRoom.name, status: joinedRoom.joined >= joinedRoom.members ? "Active" : "Open", cadence: joinedRoom.cadence.split(",")[0], zone: "UTC", joined: joinedRoom.joined, members: joinedRoom.members, share: usd(joinedRoom.share), pot: usd(joinedRoom.share * joinedRoom.members), xlm: `${(joinedRoom.share * joinedRoom.members * 8.92307692).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XLM`, deadline: joinedRoom.closes.split(",")[0].replace(/ \d{4}$/, ""), deadlineDetail: `${joinedRoom.closes.split(", ").slice(1).join(", ")} UTC`, code: joinedRoom.code }
    : isActive
    ? { name: "Kapitbahay Circle", status: "Active", cadence: "Monthly", zone: "Asia/Manila", joined: 5, members: 5, share: "$25.00", pot: "$125.00", xlm: "1,115.38 XLM", deadline: "27 Nov", deadlineDetail: "23:00 Asia/Manila", code: "DRW789" }
    : isDone
    ? { name: "Barangay Savings Circle", status: "Done", cadence: "Monthly", zone: "Asia/Manila", joined: 4, members: 4, share: "$20.00", pot: "$80.00", xlm: "713.85 XLM", deadline: "27 Oct", deadlineDetail: "23:00 Asia/Manila", code: "SAV456" }
    : { name: "Family Circle", status: "Open", cadence: "Weekly", zone: "UTC", joined: 2, members: 4, share: "$10.00", pot: "$40.00", xlm: "356.92 XLM", deadline: "30 Nov", deadlineDetail: "19:00 UTC", code: "FAM234" };
  const isCreated = roomKey === "preview-created" && created !== null;
  const placeName = (place: string) => {
    if (!/^https?:\/\//.test(place)) return place;
    const match = place.match(/[?&]q=([^&]+)/) ?? place.match(/\/place\/([^/]+)/);
    return match ? decodeURIComponent(match[1].replace(/\+/g, " ")) : "Pinned place";
  };
  const room = isCreated && created ? {
    name: created.name,
    status: "Open",
    cadence: created.interval.split(",")[0],
    zone: created.zone,
    joined: 1,
    members: created.members,
    share: usd(created.share),
    pot: usd(created.share * created.members),
    xlm: `${(created.share * created.members * 8.92307692).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XLM`,
    deadline: created.closes.split(",")[0].replace(/ \d{4}$/, ""),
    deadlineDetail: `${created.closes.split(", ").slice(1).join(", ")} ${created.zone}`,
    code: created.code,
  } : sampleRoom;
  const [tab, setTab] = useState<"Schedule" | "History">("Schedule");
  const [copied, setCopied] = useState(false);
  const memberRows = isCreated ? [{ name: "You", initials: "YO", detail: "Room Master · Deposit locked", status: "Paid" }] : isDone ? DONE_MEMBER_ROWS : isActive ? MEMBER_ROWS : joinedRoom && roomKey === "joined" ? [MEMBER_ROWS[0], { name: "You", initials: "YO", detail: "Joined just now · local example", status: "Preview" }, ...Array.from({ length: Math.max(0, room.joined - 2) }, (_, index) => ({ name: `Member ${index + 3}`, initials: `M${index + 3}`, detail: "Deposit locked", status: "Paid" }))] : [MEMBER_ROWS[0], MEMBER_ROWS[4]];

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
        <div><span className={styles.eyebrow}>{isDone ? "COMPLETED EXAMPLE" : "YOU JOINED THIS ROOM"}</span><h2>{isDone ? "This circle is complete." : isActive ? "The circle is running." : "Waiting for the circle to fill."}</h2></div>
        <Image src="/prototype-arisan/helping.png" alt="" width={80} height={75} />
      </div>
      <p>{isDone ? "A local example for the Done group. No Testnet deposits or payouts were made." : `Each member locks ${room.members} × their share up front. No interest, no yield.`}</p>
      <div className={styles.memberCount}>
        <span className={styles.youAvatar}>YO</span>
        <span><strong>{room.joined}/{room.members} members</strong><small>{room.joined === room.members ? "Every seat is taken" : `${room.members - room.joined} places remaining`}</small></span>
      </div>
    </section>

    <dl className={styles.band}>
      <div><dt>Round pot</dt><dd>{room.pot}</dd><span>≈ {room.xlm}</span></div>
      <div><dt>Share per round</dt><dd>{room.share}</dd><span>{room.members} rounds</span></div>
      <div><dt>{isDone ? "Completed" : "Join deadline"}</dt><dd>{room.deadline}</dd><span>{room.deadlineDetail}</span></div>
    </dl>

    {isDone ? <section className={styles.stage}>
      <h2 className={styles.stageTitle}>All 4 rounds completed</h2>
      <p>This sample is read-only. No Testnet funds moved.</p>
    </section> : isActive ? <section className={styles.stage}>
      <span className={styles.eyebrow}>ROUND 1 OF 5</span>
      <div className={styles.winner}>
        <span className={styles.winnerAvatar}>MS</span>
        <span className={styles.winnerInfo}><strong>@maria_s won this round</strong><small>{room.pot} · ≈ {room.xlm}</small></span>
      <span className={styles.released}>{released ? "Released" : "Held"}</span>
      </div>
      <p>{released ? "The pot is with @maria_s. Next draw: 27 Dec 2026." : "Waiting for @maria_s to release the pot."}</p>
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
        {!isActive ? Array.from({ length: Math.max(0, room.members - room.joined) }, (_, index) => room.joined + index + 1).map(seat => <div key={seat} className={styles.member}>
          <span className={styles.emptySeat}>{seat}</span><span className={styles.memberInfo}><strong>Seat {seat}</strong><small>No one has joined yet</small></span><span className={styles.waiting}>Waiting</span>
        </div>) : null}
      </div>
    </section>

    <section className={styles.deposit} aria-label={isDone ? "Example round amount" : "Your deposit"}>
      <h2>{isDone ? "Example round amount" : "Your deposit"}</h2><div><span>{isDone ? "Per round" : "Locked"}</span><strong>{isDone ? room.share : room.pot}</strong></div><div><span>In XLM</span><strong>≈ {isDone ? "178.46 XLM" : room.xlm}</strong></div>
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
      </> : isDone ? <>
        <Detail label="First round" value="27 Jul 2026, 23:00" />
        <Detail label="How often" value="Monthly, every 30 days" />
        <Detail label="Completed" value="27 Oct 2026, 23:00" />
        <Detail label="Timezone" value="Asia/Manila" />
        <Detail label="Location" value="Barangay San Roque Hall" />
      </> : <>
        <Detail label="First draw" value={isCreated && created ? created.firstDraw : "7 Dec 2026, 19:00"} />
        <Detail label="How often" value={isCreated && created ? created.interval : "Weekly, every 7 days"} />
        <Detail label="Join deadline" value={isCreated && created ? created.closes : "30 Nov 2026, 19:00"} />
        <Detail label="Timezone" value={room.zone} />
        <Detail label="Location" value={isCreated && created ? placeName(created.place) : "Remote"} />
      </>}
    </section> : <section className={styles.details} aria-label="Room history">
      {isActive ? <>
        <Detail label="Pot released to @maria_s" value="Round 1 · $125.00" />
        <Detail label="@maria_s won the draw" value="Signed by @jamamam, @jamal_r" />
        <Detail label="You locked your deposit" value="27 Nov · $125.00" />
        <Detail label="Room opened by @maria_s" value="Code DRW789" />
      </> : isDone ? <>
        <Detail label="All rounds completed" value="4 of 4" />
        <Detail label="Final round closed" value="27 Oct · Example" />
        <Detail label="Room opened by @maria_s" value="Code SAV456" />
      </> : <>
        <Detail label="You locked your deposit" value="27 Nov · $40.00" />
        <Detail label="@maria_s joined" value="Deposit locked" />
        <Detail label="Room opened by @maria_s" value="Code FAM234" />
      </>}
    </section>}

    {!isActive && !isDone ? <p className={styles.fillingNote}>The room starts once all {room.members} members have joined, at the join deadline. Until then the person who opened it can cancel it, and your deposit comes back.</p> : null}
    {roomKey === "joined" && joinedRoom ? <p className={styles.fillingNote}>Local example · no Testnet transaction or deposit was made.</p> : null}
    <footer className={styles.footer}><PoweredByStellar /></footer>
  </div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className={styles.detail}><span>{label}</span><strong>{value}</strong></div>;
}
