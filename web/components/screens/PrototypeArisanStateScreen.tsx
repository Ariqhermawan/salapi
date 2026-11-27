"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check } from "@phosphor-icons/react";
import { PoweredByStellar } from "@/components/ui/kit";
import styles from "./PrototypeArisanRoomScreen.module.css";

type Scenario = "countdown" | "draw-member" | "draw-master" | "master-away";
type Member = { name: string; initials: string; detail: string; status: string };
type Detail = { label: string; value: string };

const ROOMS: Record<Scenario, {
  name: string; status: string; cadence: string; zone: string; joined: number; members: number;
  share: number; pot: number; xlm: string; deadline: string; deadlineDetail: string;
  firstDraw: string; often: string; code: string; master: string; automaticSigners: string[];
  detailRows: Detail[]; historyRows: Detail[]; memberRows: Member[];
}> = {
  countdown: {
    name: "Barkada Savers", status: "Full", cadence: "Weekly", zone: "Asia/Manila", joined: 4, members: 4,
    share: 10, pot: 40, xlm: "356.92 XLM", deadline: "29 Nov", deadlineDetail: "18:00 Asia/Manila",
    firstDraw: "2 Dec 2026, 19:00", often: "Weekly, every 7 days", code: "FUL456", master: "@jamal_r", automaticSigners: [],
    detailRows: [
      { label: "First draw", value: "2 Dec 2026, 19:00" }, { label: "How often", value: "Weekly, every 7 days" },
      { label: "Join deadline", value: "29 Nov 2026, 18:00" }, { label: "Timezone", value: "Asia/Manila" }, { label: "Location", value: "Remote" },
    ],
    historyRows: [
      { label: "You locked your deposit", value: "27 Nov · $40.00" }, { label: "@maria_s joined", value: "Deposit locked" }, { label: "Room opened by @jamal_r", value: "Code FUL456" },
    ],
    memberRows: [
      { name: "@jamal_r", initials: "JR", detail: "Room Master · Deposit locked", status: "Paid" },
      { name: "@maria_s", initials: "MS", detail: "Deposit locked", status: "Paid" },
      { name: "@jamamam", initials: "JA", detail: "Deposit locked", status: "Paid" },
      { name: "You", initials: "YO", detail: "Deposit locked", status: "Paid" },
    ],
  },
  "draw-member": {
    name: "Kapitbahay Circle", status: "Draw day", cadence: "Monthly", zone: "Asia/Manila", joined: 5, members: 5,
    share: 25, pot: 125, xlm: "1,115.38 XLM", deadline: "27 Nov", deadlineDetail: "23:00 Asia/Manila",
    firstDraw: "27 Nov 2026, 23:30", often: "Monthly, every 30 days", code: "DRW789", master: "@maria_s", automaticSigners: ["@jamamam"],
    detailRows: [
      { label: "First draw", value: "27 Nov 2026, 23:30" }, { label: "How often", value: "Monthly, every 30 days" },
      { label: "Join deadline", value: "27 Nov 2026, 23:00" }, { label: "Timezone", value: "Asia/Manila" }, { label: "Location", value: "Barangay San Roque Hall" },
    ],
    historyRows: [
      { label: "You locked your deposit", value: "27 Nov · $125.00" }, { label: "@ana_d joined", value: "Deposit locked" }, { label: "Room opened by @maria_s", value: "Code DRW789" },
    ],
    memberRows: [
      { name: "@maria_s", initials: "MS", detail: "Room Master · Deposit locked", status: "Paid" },
      { name: "@jamamam", initials: "JA", detail: "Deposit locked", status: "Paid" },
      { name: "@jamal_r", initials: "JR", detail: "Deposit locked", status: "Paid" },
      { name: "@ana_d", initials: "AD", detail: "Deposit locked", status: "Paid" },
      { name: "You", initials: "YO", detail: "Deposit locked", status: "Paid" },
    ],
  },
  "draw-master": {
    name: "Kapitbahay Circle", status: "Draw day", cadence: "Monthly", zone: "Asia/Manila", joined: 5, members: 5,
    share: 25, pot: 125, xlm: "1,115.38 XLM", deadline: "27 Nov", deadlineDetail: "23:00 Asia/Manila",
    firstDraw: "27 Nov 2026, 23:30", often: "Monthly, every 30 days", code: "DRW789", master: "You", automaticSigners: ["@maria_s", "@jamamam"],
    detailRows: [
      { label: "First draw", value: "27 Nov 2026, 23:30" }, { label: "How often", value: "Monthly, every 30 days" },
      { label: "Join deadline", value: "27 Nov 2026, 23:00" }, { label: "Timezone", value: "Asia/Manila" }, { label: "Location", value: "Barangay San Roque Hall" },
    ],
    historyRows: [
      { label: "You locked your deposit", value: "27 Nov · $125.00" }, { label: "@ana_d joined", value: "Deposit locked" }, { label: "Room opened by You", value: "Code DRW789" },
    ],
    memberRows: [
      { name: "You", initials: "YO", detail: "Room Master · Deposit locked", status: "Paid" },
      { name: "@maria_s", initials: "MS", detail: "Deposit locked", status: "Paid" },
      { name: "@jamamam", initials: "JA", detail: "Deposit locked", status: "Paid" },
      { name: "@jamal_r", initials: "JR", detail: "Deposit locked", status: "Paid" },
      { name: "@ana_d", initials: "AD", detail: "Deposit locked", status: "Paid" },
    ],
  },
  "master-away": {
    name: "Old Friends", status: "Draw day", cadence: "Monthly", zone: "Asia/Manila", joined: 4, members: 4,
    share: 10, pot: 40, xlm: "356.92 XLM", deadline: "27 Nov", deadlineDetail: "23:00 Asia/Manila",
    firstDraw: "27 Nov 2026, 23:30", often: "Monthly, every 30 days", code: "GNE321", master: "@lito_r", automaticSigners: ["@maria_s", "@jamamam"],
    detailRows: [
      { label: "First draw", value: "27 Nov 2026, 23:30" }, { label: "How often", value: "Monthly, every 30 days" },
      { label: "Join deadline", value: "27 Nov 2026, 23:00" }, { label: "Timezone", value: "Asia/Manila" }, { label: "Location", value: "Remote" },
    ],
    historyRows: [
      { label: "You locked your deposit", value: "27 Nov · $40.00" }, { label: "@jamamam joined", value: "Deposit locked" }, { label: "Room opened by @lito_r", value: "Code GNE321" },
    ],
    memberRows: [
      { name: "@lito_r", initials: "LR", detail: "Room Master · away · Deposit locked", status: "Paid" },
      { name: "@maria_s", initials: "MS", detail: "Deposit locked", status: "Paid" },
      { name: "@jamamam", initials: "JA", detail: "Deposit locked", status: "Paid" },
      { name: "You", initials: "YO", detail: "Deposit locked", status: "Paid" },
    ],
  },
};

export default function PrototypeArisanStateScreen({ scenario }: { scenario: Scenario }) {
  const room = ROOMS[scenario];
  const isCountdown = scenario === "countdown";
  const isAway = scenario === "master-away";
  const isMaster = scenario === "draw-master";
  const requiredSignatures = isAway ? 3 : 2;
  const [signed, setSigned] = useState<string[]>([]);
  const [tab, setTab] = useState<"Schedule" | "History">("Schedule");
  const [drawStarted, setDrawStarted] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const timers = room.automaticSigners.map((signer, index) => window.setTimeout(() => {
      setSigned(current => current.includes(signer) ? current : [...current, signer]);
    }, 2400 * (index + 1)));
    return () => timers.forEach(window.clearTimeout);
  }, [room]);

  useEffect(() => {
    if (!isCountdown) return;
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [isCountdown]);

  const sign = () => setSigned(current => current.includes("You") ? current : [...current, "You"]);
  const startDraw = () => setDrawStarted(true);
  const signatureCount = signed.length;
  const secondsLeft = now === null ? 5 * 86400 + 6 * 3600 + 6 * 60 + 6 : Math.max(0, Math.floor((Date.parse("2026-12-02T19:00:00+08:00") - now) / 1000));
  const countdown = [
    [String(Math.floor(secondsLeft / 86400)).padStart(2, "0"), "days"],
    [String(Math.floor((secondsLeft % 86400) / 3600)).padStart(2, "0"), "hours"],
    [String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, "0"), "min"],
    [String(secondsLeft % 60).padStart(2, "0"), "sec"],
  ];

  return <div className={styles.screen} data-testid={`prototype-arisan-state-${scenario}`}>
    <header className={styles.header}>
      <Link href="/vaults/sample" aria-label="Back to Arisan"><ArrowLeft size={19} aria-hidden="true" /></Link>
      <h1>{room.name}</h1>
    </header>

    <div className={styles.chips} aria-label="Room status">
      <span>{room.status}</span><span>{room.cadence}</span><span>{room.zone}</span>
    </div>

    <section className={styles.overview} aria-label="Room overview">
      <div className={styles.overviewTop}>
        <div><span className={styles.eyebrow}>{isMaster ? "YOU OPENED THIS ROOM" : "YOU JOINED THIS ROOM"}</span><h2>{isCountdown ? "The circle is full." : "Today is the draw."}</h2></div>
        <Image src="/prototype-arisan/helping.png" alt="" width={80} height={75} />
      </div>
      <p>Each member locks {room.members} × their share up front. No interest, no yield.</p>
      <div className={styles.memberCount}>
        <span className={styles.youAvatar}>YO</span>
        <span><strong>{room.joined}/{room.members} members</strong><small>Every seat is taken</small></span>
      </div>
    </section>

    <dl className={styles.band}>
      <div><dt>Round pot</dt><dd>{`$${room.pot.toFixed(2)}`}</dd><span>≈ {room.xlm}</span></div>
      <div><dt>Share per round</dt><dd>{`$${room.share.toFixed(2)}`}</dd><span>{room.members} rounds</span></div>
      <div><dt>Join deadline</dt><dd>{room.deadline}</dd><span>{room.deadlineDetail}</span></div>
    </dl>

    {isCountdown ? <section className={styles.stage}>
      <span className={styles.eyebrow}>EVERY MEMBER HAS JOINED</span>
      <h2 className={styles.stageTitle}>First draw in</h2>
      <div className={styles.clock} role="timer" aria-label={`First draw in ${countdown.map(([value, label]) => `${Number(value)} ${label}`).join(", ")}`}>
        {countdown.map(([value, label]) => <span key={label}><b>{value}</b><i>{label}</i></span>)}
      </div>
      <p>{room.firstDraw} Asia/Manila. On the day, two members sign and the Room Master draws.</p>
    </section> : <section className={styles.stage}>
      <span className={styles.eyebrow}>DRAW DAY · ROUND 1</span>
      <h2 className={styles.signatureTitle}>{drawStarted ? "Draw started" : `${Math.min(signatureCount, requiredSignatures)} of ${requiredSignatures} signatures`}</h2>
      {isAway ? <p className={styles.awayNotice}>{room.master} is the Room Master and has not been active for 7 days. Three members can sign and run the draw without them. A room keeps going with at least 4 members.</p> : null}
      <div className={styles.signatures} aria-label={`${signatureCount} of ${requiredSignatures} signatures`}>
        {Array.from({ length: requiredSignatures }, (_, index) => <span key={index} data-signed={signed[index] ? "true" : undefined}>{signed[index] ? <><Check size={14} aria-hidden="true" />{signed[index]}</> : "Waiting"}</span>)}
      </div>
      {isMaster ? <button type="button" disabled={signatureCount < requiredSignatures || drawStarted} onClick={startDraw}>{drawStarted ? "Draw started" : "Draw"}</button>
        : drawStarted ? <p role="status">The draw has started.</p>
          : signatureCount >= requiredSignatures ? <button type="button" onClick={startDraw}>Start the draw</button>
            : <button type="button" disabled={signed.includes("You")} onClick={sign}>{signed.includes("You") ? "Signed" : "Sign the draw"}</button>}
      <p>{drawStarted ? `The draw is under way. ${room.master} runs the room.` : isMaster ? signatureCount >= requiredSignatures ? "Two members signed. The draw picks one member at random." : "Draw opens once two members sign." : isAway ? signatureCount >= requiredSignatures ? "Three members signed. Any of you can start the draw." : "The draw opens once three members sign." : signed.includes("You") ? `Signed. Waiting for ${room.master} to press Draw.` : `Your signature lets ${room.master} run the draw.`}</p>
    </section>}

    <section className={styles.members} aria-labelledby="room-members-title">
      <header><h2 id="room-members-title">Members ({room.joined}/{room.members})</h2></header>
      <div className={styles.memberList}>
        {room.memberRows.map(member => <div key={member.name} className={styles.member}>
          <span className={styles.avatar}>{member.initials}</span><span className={styles.memberInfo}><strong>{member.name}</strong><small>{signed.includes(member.name) ? "Signed the draw" : member.detail}</small></span><span className={styles.paid}>{member.status}</span>
        </div>)}
      </div>
    </section>

    <section className={styles.deposit} aria-label="Your deposit">
      <h2>Your deposit</h2><div><span>Locked</span><strong>{`$${room.pot.toFixed(2)}`}</strong></div><div><span>In XLM</span><strong>≈ {room.xlm}</strong></div>
    </section>

    <div className={styles.tabs} role="tablist" aria-label="Room details">
      {(["Schedule", "History"] as const).map(value => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value}</button>)}
    </div>
    <section className={styles.details} aria-label={tab === "Schedule" ? "Room schedule" : "Room history"}>
      {(tab === "Schedule" ? room.detailRows : room.historyRows).map(detail => <Detail key={detail.label} label={detail.label} value={detail.value} />)}
    </section>
    <footer className={styles.footer}><PoweredByStellar /></footer>
  </div>;
}

function Detail({ label, value }: Detail) {
  return <div className={styles.detail}><span>{label}</span><strong>{value}</strong></div>;
}
