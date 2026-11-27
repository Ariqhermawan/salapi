"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "@phosphor-icons/react";
import { Btn, PoweredByStellar } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import { previewUsdcBalanceCents } from "@/lib/local-preview";
import styles from "./PrototypeArisanJoinScreen.module.css";

const JOINED_ROOM_KEY = "salapi.prototype-arisan-joined.v1";
const VALID_CODE = /^[A-HJ-NP-Z0-9]{6}$/;
const USD_TO_XLM = 8.92307692;

type Offer = { code: string; name: string; members: number; joined: number; share: number; cadence: string; closes: string; firstDraw: string; place: string };

function dateIn(days: number, time: string) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getDate()} ${date.toLocaleDateString("en-US", { month: "short" })} ${date.getFullYear()}, ${time}`;
}

function offerFor(code: string): Offer {
  const offers: Record<string, Omit<Offer, "code" | "closes" | "firstDraw"> & { closeDays: number; drawDays: number }> = {
    FAM234: { name: "Family Circle", members: 4, joined: 1, share: 10, cadence: "Weekly, every 7 days", place: "Remote", closeDays: 3, drawDays: 10 },
    FUL456: { name: "Barkada Savers", members: 4, joined: 3, share: 10, cadence: "Weekly, every 7 days", place: "Remote", closeDays: 2, drawDays: 5 },
    DRW789: { name: "Kapitbahay Circle", members: 5, joined: 4, share: 25, cadence: "Monthly, every 30 days", place: "Barangay San Roque Hall", closeDays: 0, drawDays: 0 },
    GNE321: { name: "Old Friends", members: 4, joined: 3, share: 10, cadence: "Monthly, every 30 days", place: "Remote", closeDays: 0, drawDays: 0 },
    SAR288: { name: "Sari-sari owners", members: 6, joined: 3, share: 25, cadence: "Monthly, every 30 days", place: "Remote", closeDays: 6, drawDays: 7 },
  };
  const source = offers[code] ?? { name: `Practice Circle · ${code}`, members: 4, joined: 1, share: 1, cadence: "Weekly, every 7 days", place: "Remote", closeDays: 3, drawDays: 10 };
  return { code, name: source.name, members: source.members, joined: source.joined, share: source.share, cadence: source.cadence, place: source.place, closes: dateIn(source.closeDays, "19:00"), firstDraw: dateIn(source.drawDays, "19:00") };
}

const usd = (amount: number) => `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usdShort = (amount: number) => `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export default function PrototypeArisanJoinScreen() {
  const router = useRouter();
  const back = useGoBack("/vaults");
  const [code, setCode] = useState("");
  const [sheet, setSheet] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [balanceCents, setBalanceCents] = useState(50_964);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [error, setError] = useState("");
  const clean = code.trim().toUpperCase();
  const found = useMemo(() => VALID_CODE.test(clean) ? offerFor(clean) : null, [clean]);
  const depositCents = found ? found.members * Math.round(found.share * 100) : 0;
  const problem = !found ? "Enter 6 uppercase letters or digits. No O or I." : null;
  const showProblem = problem !== null && (clean.length === 6 || /[^A-HJ-NP-Z0-9]/.test(clean));

  useEffect(() => {
    setPortalHost(document.getElementById("phone-layer"));
    setBalanceCents(previewUsdcBalanceCents());
  }, []);
  useEffect(() => {
    if (!sheet && !confirming) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) { setSheet(false); setConfirming(false); } };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sheet, confirming, busy]);

  function closeSheet() { if (!busy) setSheet(false); }
  function saveJoin() {
    if (!found || busy) return;
    setBusy(true);
    window.setTimeout(() => {
      try {
        window.localStorage.setItem(JOINED_ROOM_KEY, JSON.stringify({ ...found, joined: Math.min(found.members, found.joined + 1), savedAt: Date.now() }));
        window.dispatchEvent(new CustomEvent("salapi:success-motion", { detail: "You joined the room · local example, no money moved" }));
        router.replace("/vaults/rooms/joined");
      } catch {
        setBusy(false);
        setError("This browser could not save the local example. No deposit was moved.");
        setConfirming(false);
      }
    }, 360);
  }

  const header = <header className={styles.header}>
    <button type="button" aria-label="Back to rooms" onClick={() => confirming ? setConfirming(false) : sheet ? setSheet(false) : back()}><ArrowLeft size={19} aria-hidden="true" /></button>
    <h1>{confirming ? "Confirm" : "Join a room"}</h1>
  </header>;

  return <>
    <div className={styles.screen} data-testid="prototype-arisan-join">
      {header}
      {confirming && found ? <>
        <header className={styles.confirmIntro}><span>Joining {found.name}</span><h2>Lock your deposit.</h2><p>This is the last step. Your deposit leaves your balance when you confirm.</p></header>
        <section className={styles.lockCard}>
          <span className={styles.lockIcon} aria-hidden="true">⌑</span>
          <div><p className={styles.eyebrow}>You will lock</p><p className={styles.lockAmount}><strong>{usd(depositCents / 100)}</strong><span>({found.members} × {usdShort(found.share)})</span></p><p className={styles.lockCopy}>It pays your share of all {found.members} rounds. Each round the whole pot goes to one member, picked at random.</p></div>
        </section>
        <dl className={styles.rows}>
          <InfoRow label="Room" value={found.name} />
          <InfoRow label="First draw" value={found.firstDraw} />
          <InfoRow label="Location" value={found.place} />
          <InfoRow label="If the room is cancelled" value="Deposit returned" />
        </dl>
        <p className={styles.hint}>On each draw day two members sign and the Room Master draws. You can&apos;t leave once the room starts.</p>
        <p className={styles.localNote}>Local example · no Testnet transaction or deposit will be made.</p>
        {portalHost ? createPortal(<div className={styles.cta}>
          <Btn kind="secondary" onClick={() => setConfirming(false)} disabled={busy}>Back</Btn>
          <Btn onClick={saveJoin} loading={busy}>{busy ? "Joining…" : "Confirm and join"}</Btn>
        </div>, portalHost) : null}
      </> : <>
        <div className={styles.shortBody}>
          <section className={styles.codeCard}>
            <label htmlFor="prototype-room-code">6-character code</label>
            <input id="prototype-room-code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={6} placeholder="Enter code" value={code} aria-invalid={showProblem || undefined} onChange={event => { setCode(event.target.value.toUpperCase()); setError(""); }} onKeyDown={event => { if (event.key === "Enter" && !problem) setSheet(true); }} />
            {showProblem ? <p className={styles.errorHint}>{problem}</p> : null}
            {error ? <p className={styles.errorHint} role="alert">{error}</p> : null}
          </section>
          <Image className={styles.people} src="/prototype-causes/doodle-people.png" alt="" width={280} height={280} priority />
        </div>
        <footer className={styles.powered}><PoweredByStellar /></footer>
        {portalHost ? createPortal(<div className={styles.cta}>
          <Btn disabled={problem !== null} trailing={<ArrowRight size={17} aria-hidden="true" />} onClick={() => setSheet(true)}>Continue</Btn>
        </div>, portalHost) : null}
      </>}
    </div>

    {portalHost && sheet && found ? createPortal(<div className={styles.backdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeSheet(); }}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-label="Review invitation">
        <header><h2>Review invitation</h2><button type="button" aria-label="Close" onClick={closeSheet}><X size={21} aria-hidden="true" /></button></header>
        <dl className={styles.rows}>
          <InfoRow label="Room" value={found.name} />
          <InfoRow label="Members" value={`${found.joined} of ${found.members} joined`} />
          <InfoRow label="Share per round" value={usd(found.share)} />
          <InfoRow label="First draw" value={found.firstDraw} />
          <InfoRow label="How often" value={found.cadence.split(",")[0]} />
          <InfoRow label="Join deadline" value={found.closes} />
          <InfoRow label="Your deposit" value={usd(depositCents / 100)} total />
        </dl>
        {depositCents > balanceCents ? <p className={styles.sheetHint}>That is more than your balance of {usd(balanceCents / 100)}.</p> : <p className={styles.sheetHint}>Joining locks your full deposit, {usd(depositCents / 100)} from your Salapi balance. You get it back if the room is cancelled before it starts.</p>}
        <div className={styles.sheetActions}>
          {depositCents > balanceCents ? <Btn onClick={() => { setSheet(false); router.push("/topup"); }}>Add money</Btn> : <Btn trailing={<ArrowRight size={17} aria-hidden="true" />} onClick={() => { setSheet(false); setConfirming(true); }}>Continue</Btn>}
          <Btn kind="secondary" onClick={closeSheet}>Cancel</Btn>
        </div>
      </section>
    </div>, portalHost) : null}
  </>;
}

function InfoRow({ label, value, total = false }: { label: string; value: string; total?: boolean }) {
  return <div className={total ? styles.totalRow : styles.row}><dt>{label}</dt><dd>{value}</dd></div>;
}
