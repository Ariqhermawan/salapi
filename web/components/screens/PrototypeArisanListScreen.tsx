"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, ShareNetwork, Users } from "@phosphor-icons/react";
import { PoweredByStellar } from "@/components/ui/kit";
import ArisanListScreen from "@/components/screens/ArisanListScreen";
import styles from "./PrototypeArisanListScreen.module.css";

type Mode = "default" | "empty" | "rooms";
type Room = { id: number; name: string; members: string; perRound: string; status: "Open" | "Active"; code: string; route: string };

const ROOMS: Room[] = [
  { id: 2, name: "Kapitbahay Circle", members: "5 of 5 joined", perRound: "$25", status: "Active", code: "DRW789", route: "/vaults/sample/rooms/r_4" },
  { id: 1, name: "Family Circle", members: "2 of 4 joined", perRound: "$10", status: "Open", code: "FAM234", route: "/vaults/sample/rooms/r_1" },
];
const CHANGE_KEYS = [
  "salapi.preview.arisan-draft", "salapi.preview.arisan-joined", "salapi.preview.arisan-left",
  "salapi.preview.arisan-room.1", "salapi.preview.arisan-room.2", "salapi.preview.arisan-room.9001",
  "salapi.preview.arisan-cancelled.1", "salapi.preview.arisan-cancelled.2",
];

export default function PrototypeArisanListScreen({ mode = "default" }: { mode?: Mode }) {
  const [changed, setChanged] = useState(mode === "rooms");
  const [filter, setFilter] = useState<"All" | Room["status"] | "Done">("All");
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (mode !== "default") return;
    try { setChanged(CHANGE_KEYS.some(key => sessionStorage.getItem(key) !== null)); }
    catch { setChanged(false); }
  }, [mode]);

  if (mode === "default" && changed) return <ArisanListScreen />;
  const showRooms = mode === "rooms";
  const visible = ROOMS.filter(room => filter === "All" || room.status === filter);

  async function copyCode(room: Room) {
    try {
      const message = `Join ${room.name} on Salapi with code ${room.code}`;
      if (navigator.share) {
        await navigator.share({ title: `Join ${room.name}`, text: message });
        window.dispatchEvent(new CustomEvent("salapi:success-motion", { detail: "Invite is ready to share" }));
      } else {
        await navigator.clipboard.writeText(message);
        setCopied(room.code);
        window.dispatchEvent(new CustomEvent("salapi:success-motion", { detail: `Invite code ${room.code} copied` }));
        window.setTimeout(() => setCopied(current => current === room.code ? null : current), 1800);
      }
    } catch {
      window.dispatchEvent(new CustomEvent("salapi:success-motion", { detail: "Could not copy the invite code" }));
    }
  }

  return <div className={`${styles.page} ${showRooms ? styles.withRooms : styles.emptyPage}`} data-testid="prototype-arisan">
    <header className={styles.heading}><h1>Arisan</h1></header>

    {showRooms ? <>
      <div className={styles.filters} role="group" aria-label="Room status">
        {(["All", "Open", "Active", "Done"] as const).map(option => <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)}>{option}</button>)}
      </div>
      <section className={styles.roomList} aria-label="Arisan rooms">
        {visible.map(room => <article key={room.id} className={styles.roomCard}>
          <Link className={styles.roomMain} href={room.route} aria-label={`Open ${room.name}`}>
            <span className={styles.groupIcon}><Users size={19} aria-hidden="true" /></span>
            <span className={styles.roomCopy}><strong>{room.name}</strong><small>{room.members} · {room.perRound} per round</small></span>
            <span className={`${styles.status} ${room.status === "Active" ? styles.active : styles.open}`}>{room.status}</span>
            <ArrowRight className={styles.chevron} size={18} aria-hidden="true" />
          </Link>
          <div className={styles.codeRow}>
            <span>Code</span><strong>{room.code}</strong>
            <button type="button" onClick={() => void copyCode(room)} aria-label={`${copied === room.code ? "Copied" : "Share"} invite code ${room.code}`}>
              {copied === room.code ? <Check size={16} aria-hidden="true" /> : <ShareNetwork size={16} aria-hidden="true" />}{copied === room.code ? "Copied" : "Share"}
            </button>
          </div>
        </article>)}
        {visible.length === 0 ? <div className={styles.noRooms}><strong>No {filter.toLowerCase()} rooms</strong><button type="button" onClick={() => setFilter("All")}>Show all rooms</button></div> : null}
      </section>
      <Ways className={styles.listWays} />
      <footer className={styles.listFooter}><PoweredByStellar /></footer>
    </> : <>
      <section className={styles.emptyState}>
        <Image src="/illustrations/empty-rooms.png" alt="" width={200} height={200} priority />
        <h2>No rooms yet</h2>
        <p>Start a room or join one with a code.</p>
        <Ways className={styles.emptyWays} />
      </section>
      <footer className={styles.emptyFooter}><PoweredByStellar /></footer>
    </>}
  </div>;
}

function Ways({ className }: { className: string }) {
  return <nav className={`${styles.ways} ${className}`} aria-label="Create or join an Arisan room">
    <Link className={styles.create} href="/arisan/new">Create a room</Link>
    <Link className={styles.join} href="/arisan/join">Join with a code</Link>
  </nav>;
}
