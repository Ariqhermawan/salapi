"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarBlank, Clock, Info, LockSimple, Minus, Plus } from "@phosphor-icons/react";
import { Btn, PoweredByStellar } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import styles from "./PrototypeArisanCreateScreen.module.css";

const INTERVALS = ["Weekly, every 7 days", "Every 2 weeks, every 14 days", "Monthly, every 30 days"];
const INTERVAL_NAMES = ["Weekly", "Every 2 weeks", "Monthly"];
const ZONES = ["UTC", "Asia/Manila", "Asia/Jakarta", "Asia/Ho_Chi_Minh"];
const STORAGE_KEY = "salapi.prototype-arisan-created.v1";
const USD_TO_XLM = 8.92307692;

type Step = 1 | 2 | 3;
type Moment = { date: string; time: string };
type Schedule = { draw: Moment; closes: Moment; interval: string; zone: string };

function dateIn(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function usd(amount: number) {
  return `$${Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function xlm(amount: number) {
  return `${(amount * USD_TO_XLM).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XLM`;
}

function dateLabel(value: string) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function pickerDateLabel(value: string) {
  if (!value) return "Select date";
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function PickerField({ type, label, value, onChange }: { type: "date" | "time"; label: string; value: string; onChange: (value: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const shown = type === "date" ? pickerDateLabel(value) : value || "Select time";
  const Icon = type === "date" ? CalendarBlank : Clock;
  function openPicker() {
    const control = input.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (control?.showPicker) control.showPicker();
    else control?.click();
  }
  return <span className={styles.pickerWrap}>
    <button type="button" className={styles.pickerField} aria-label={`${label}: ${shown}`} onClick={openPicker}>
      <span>{shown}</span><Icon size={18} aria-hidden="true" />
    </button>
    <input ref={input} className={styles.hiddenPicker} type={type} value={value} aria-label={label} tabIndex={-1} onChange={(event) => onChange(event.target.value)} />
  </span>;
}

function nextDraws(value: string, days: number) {
  if (!value) return "";
  return [1, 2, 3].map((n) => {
    const date = new Date(`${value}T00:00:00`);
    date.setDate(date.getDate() + n * days);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }).join(", ");
}

export default function PrototypeArisanCreateScreen() {
  const router = useRouter();
  const back = useGoBack("/vaults");
  const [step, setStep] = useState<Step>(1);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [name, setName] = useState("");
  const [membersText, setMembersText] = useState("4");
  const [shareText, setShareText] = useState("10");
  const [schedule, setSchedule] = useState<Schedule>({
    draw: { date: dateIn(5), time: "19:00" },
    closes: { date: dateIn(3), time: "19:00" },
    interval: INTERVALS[0],
    zone: ZONES[0],
  });
  const [placeKind, setPlaceKind] = useState<"remote" | "place">("remote");
  const [placeLink, setPlaceLink] = useState("");
  const [editable, setEditable] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => setPortalHost(document.getElementById("phone-layer")), []);

  function backFromStep() {
    if (step === 1) back();
    else setStep((current) => (current - 1) as Step);
  }

  const members = Number(membersText);
  const share = Number(shareText);
  const countOk = Number.isInteger(members) && members >= 4 && members <= 20;
  const shareOk = Number.isFinite(share) && share >= 1 && share <= 1000;
  const basicsOk = name.trim().length >= 2 && countOk && shareOk;
  const deposit = members * share;
  const placeOk = placeKind === "remote" || /^https?:\/\/\S+\.\S+/.test(placeLink.trim());
  const allDatesSet = Boolean(schedule.draw.date && schedule.draw.time && schedule.closes.date && schedule.closes.time);
  const scheduleOk = allDatesSet && `${schedule.draw.date}T${schedule.draw.time}` > `${schedule.closes.date}T${schedule.closes.time}` && placeOk;
  const oftenIndex = Math.max(0, INTERVALS.indexOf(schedule.interval));
  const oftenDays = [7, 14, 30][oftenIndex];
  const placeName = useMemo(() => {
    if (placeKind === "remote") return "Remote";
    const query = placeLink.match(/[?&]q=([^&]+)/) ?? placeLink.match(/\/place\/([^/]+)/);
    return query ? decodeURIComponent(query[1].replace(/\+/g, " ")) : "Pinned place";
  }, [placeKind, placeLink]);

  function createRoom() {
    if (!scheduleOk || !basicsOk || busy) return;
    setBusy(true);
    const created = {
      id: "preview-created",
      name: name.trim(),
      members,
      share,
      interval: schedule.interval,
      zone: schedule.zone,
      closes: `${dateLabel(schedule.closes.date)}, ${schedule.closes.time}`,
      firstDraw: `${dateLabel(schedule.draw.date)}, ${schedule.draw.time}`,
      editable,
      place: placeKind === "remote" ? "Remote" : placeLink.trim(),
      code: "SAL248",
      createdAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(created));
      router.push(`/vaults/rooms/${created.id}`);
    } catch {
      setBusy(false);
      window.dispatchEvent(new CustomEvent("salapi:success-motion", { detail: "Room could not be saved in this browser" }));
    }
  }

  const header = <header className={styles.header}>
    <button type="button" aria-label="Back" onClick={backFromStep}><ArrowLeft size={18} aria-hidden="true" /></button>
    <h1>Create a room</h1>
  </header>;

  return <div className={styles.screen} data-testid="prototype-arisan-create">
    {header}
    <div className={styles.stepBar} role="group" aria-label={`Step ${step} / 3: ${["Set the terms", "Set the schedule", "Review"][step - 1]}`}>
      <div className={styles.stepMeta}><span>Step {step} / 3</span><span>{["Set the terms", "Set the schedule", "Review"][step - 1]}</span></div>
      <div className={styles.stepTrack} aria-hidden="true">{[1, 2, 3].map((number) => <span key={number} data-on={number <= step || undefined} />)}</div>
    </div>

    <header className={styles.intro}>
      <div>
        <h2>{step === 1 ? "Start something together." : step === 2 ? "Agree on the draw schedule." : "Check your circle."}</h2>
        <p>{step === 1 ? "Create a room, then invite people you know." : step === 2 ? "Everyone joins before the deadline. The first draw comes after it." : "Read the terms once more. Then invite people you know."}</p>
      </div>
      <img src="/prototype-arisan/room-head.png" alt="" />
    </header>

    {step === 1 ? <>
      <section className={styles.formCard} aria-label="Room terms">
        <label className={styles.label} htmlFor="prototype-room-name">Room name</label>
        <input id="prototype-room-name" className={styles.textInput} value={name} onChange={(event) => setName(event.target.value)} maxLength={40} autoComplete="off" placeholder="Enter room name" />
        <label className={`${styles.label} ${styles.membersLabel}`} htmlFor="prototype-room-members">Members</label>
        <div className={styles.stepper}>
          <button type="button" aria-label="One member fewer" disabled={members <= 4} onClick={() => setMembersText(String(Math.max(4, (Number.isInteger(members) ? members : 4) - 1)))}><Minus size={18} aria-hidden="true" /></button>
          <input id="prototype-room-members" value={membersText} inputMode="numeric" aria-invalid={membersText !== "" && !countOk} onChange={(event) => /^\d{0,2}$/.test(event.target.value) && setMembersText(event.target.value)} />
          <button type="button" aria-label="One member more" disabled={members >= 20} onClick={() => setMembersText(String(Math.min(20, (Number.isInteger(members) ? members : 4) + 1)))}><Plus size={18} aria-hidden="true" /></button>
          <span>4 to 20</span>
        </div>
        <label className={`${styles.label} ${styles.shareLabel}`} htmlFor="prototype-room-share">Share per round · USD</label>
        <div className={styles.moneyInput}><span>$</span><input id="prototype-room-share" className={styles.textInput} value={shareText} inputMode="decimal" aria-invalid={shareText !== "" && !shareOk} onChange={(event) => /^\d{0,4}(?:\.\d{0,2})?$/.test(event.target.value) && setShareText(event.target.value)} /></div>
        <div className={styles.presets} aria-label="Share per round presets">
          {["10", "25", "50", "100"].map((value) => <button type="button" key={value} aria-pressed={shareText === value} onClick={() => setShareText(value)}>${value}</button>)}
        </div>
        {shareOk ? <p className={styles.xlmHint}>≈ {xlm(share)} per round</p> : <p className={styles.errorHint}>A share is $1 to $1,000.</p>}
        {membersText !== "" && !countOk ? <p className={styles.errorHint}>A room has 4 to 20 members.</p> : null}
      </section>
      {countOk && shareOk ? <section className={styles.lockCard} aria-label="Deposit amount">
        <LockSimple size={20} aria-hidden="true" />
        <div><p className={styles.eyebrow}>You will lock</p><p className={styles.lockAmount}><strong>{usd(deposit)}</strong><span>({members} × {usd(share)})</span></p>
          <p className={styles.lockCopy}>Every member locks {members} × the share up front. Each round the whole pot goes to one member, picked at random, until all {members} have had a turn.</p>
          <p className={styles.lockCopy}>The deposit pays for every round, so nobody can take a pot and leave.</p>
        </div>
      </section> : null}
    </> : step === 2 ? <section className={styles.formCard} aria-label="Draw schedule">
      <div className={styles.dateGrid}>
        <div><label className={styles.label}>First draw date</label><PickerField type="date" label="First draw date" value={schedule.draw.date} onChange={(date) => setSchedule((old) => ({ ...old, draw: { ...old.draw, date } }))} /></div>
        <div><label className={styles.label}>Draw time</label><PickerField type="time" label="Draw time" value={schedule.draw.time} onChange={(time) => setSchedule((old) => ({ ...old, draw: { ...old.draw, time } }))} /></div>
      </div>
      <p className={`${styles.label} ${styles.fieldGroupLabel}`}>How often</p>
      <div className={styles.cadences} role="group" aria-label="How often">
        {INTERVALS.map((value, index) => <button type="button" key={value} aria-pressed={schedule.interval === value} onClick={() => setSchedule((old) => ({ ...old, interval: value }))}>{INTERVAL_NAMES[index]}</button>)}
      </div>
      <p className={styles.scheduleHint}>{INTERVAL_NAMES[oftenIndex]}. Next draws: {nextDraws(schedule.draw.date, oftenDays)}</p>
      <div className={`${styles.dateGrid} ${styles.deadlineGrid}`}>
        <div><label className={styles.label}>Join deadline</label><PickerField type="date" label="Join deadline" value={schedule.closes.date} onChange={(date) => setSchedule((old) => ({ ...old, closes: { ...old.closes, date } }))} /></div>
        <div><label className={styles.label}>Deadline time</label><PickerField type="time" label="Deadline time" value={schedule.closes.time} onChange={(time) => setSchedule((old) => ({ ...old, closes: { ...old.closes, time } }))} /></div>
      </div>
      <p className={styles.fieldHint}><Info size={15} weight="fill" aria-hidden="true" /><span>Every member joins and locks their deposit before this. After it, no one else can come in.</span></p>
      {allDatesSet && `${schedule.draw.date}T${schedule.draw.time}` <= `${schedule.closes.date}T${schedule.closes.time}` ? <p className={styles.errorHint}>The first draw comes after the join deadline.</p> : null}
      <label className={`${styles.label} ${styles.zoneLabel}`} htmlFor="prototype-room-zone">Agreed timezone</label>
      <select id="prototype-room-zone" className={`${styles.textInput} ${styles.zoneSelect}`} value={schedule.zone} onChange={(event) => setSchedule((old) => ({ ...old, zone: event.target.value }))}>{ZONES.map((zone) => <option key={zone}>{zone}</option>)}</select>
      <p className={`${styles.label} ${styles.fieldGroupLabel}`}>Where you meet</p>
      <div className={styles.meetingOptions} role="tablist" aria-label="Where you meet">
        <button type="button" role="tab" aria-selected={placeKind === "remote"} onClick={() => setPlaceKind("remote")}>Remote</button>
        <button type="button" role="tab" aria-selected={placeKind === "place"} onClick={() => setPlaceKind("place")}>In person</button>
      </div>
      {placeKind === "place" ? <><label className={`${styles.label} ${styles.zoneLabel}`} htmlFor="prototype-room-map">Maps link</label><input id="prototype-room-map" className={styles.textInput} value={placeLink} inputMode="url" placeholder="Paste a maps link" onChange={(event) => setPlaceLink(event.target.value)} />{placeLink && !placeOk ? <p className={styles.errorHint}>Paste the full link, starting with https://</p> : placeOk ? <p className={styles.scheduleHint}>{placeName}</p> : null}</> : null}
      <label className={styles.checkboxRow}><input type="checkbox" checked={editable} onChange={(event) => setEditable(event.target.checked)} /><span><strong>Editable later</strong><small>You can change the schedule until the room starts. Members are told when you do.</small></span></label>
    </section> : <>
      <section className={styles.reviewCard} aria-label="Room terms summary">
        <h3>{name.trim()}</h3>
        <dl>
          <div><dt>Members</dt><dd>{members}</dd></div>
          <div><dt>Share per round</dt><dd><strong>{usd(share)}</strong><small>≈ {xlm(share)}</small></dd></div>
          <div><dt>Payout per draw</dt><dd>{usd(share * members)}</dd></div>
          <div><dt>First draw</dt><dd>{dateLabel(schedule.draw.date)}, {schedule.draw.time}</dd></div>
          <div><dt>How often</dt><dd>{INTERVAL_NAMES[oftenIndex]}</dd></div>
          <div><dt>Join deadline</dt><dd>{dateLabel(schedule.closes.date)}, {schedule.closes.time}</dd></div>
          <div><dt>Timezone</dt><dd>{schedule.zone}</dd></div>
          <div><dt>Location</dt><dd>{placeName}</dd></div>
          <div><dt>Schedule</dt><dd>{editable ? "Editable later" : "Fixed"}</dd></div>
          <div><dt>Network fee</dt><dd>Free for now</dd></div>
          <div className={styles.total}><dt>Your upfront deposit</dt><dd>{usd(deposit)}</dd></div>
        </dl>
      </section>
      <p className={styles.fieldHint}>Creating locks your full deposit, {usd(deposit)} from your Salapi balance. You get it back if you cancel the room before it starts.</p>
    </>}

    <footer className={styles.powered}><PoweredByStellar /></footer>
    {portalHost ? createPortal(<div className={`${styles.cta} ${step === 3 ? styles.ctaDouble : ""}`}>
      {step === 1 ? <Btn disabled={!basicsOk} onClick={() => setStep(2)} trailing={<ArrowRight size={17} aria-hidden="true" />}>Continue</Btn> : null}
      {step === 2 ? <Btn disabled={!scheduleOk} onClick={() => setStep(3)} trailing={<ArrowRight size={17} aria-hidden="true" />}>Review room terms</Btn> : null}
      {step === 3 ? <><Btn kind="secondary" onClick={() => setStep(1)}>Edit terms</Btn><Btn disabled={busy} loading={busy} onClick={createRoom}>Create room</Btn></> : null}
    </div>, portalHost) : null}
  </div>;
}
