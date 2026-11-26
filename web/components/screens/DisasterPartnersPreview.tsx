"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle, Flag } from "@phosphor-icons/react";
import styles from "./DisasterPartnersPreview.module.css";

const KEY = "salapi.local-preview.disaster-ngos";
const NGOS = [
  { id: "tulong-cebu", name: "Tulong Cebu Relief", place: "Cebu City, PH", focus: "Typhoon and flood relief" },
  { id: "bangon-marikina", name: "Bangon Marikina", place: "Marikina, PH", focus: "Flood response" },
  { id: "dapur-siaga", name: "Dapur Siaga Jakarta", place: "Jakarta Utara, ID", focus: "Emergency kitchens" },
];

export default function DisasterPartnersPreview({ view }: { view: string | null }) {
  const team = view === "team";
  const unassigned = view === "unassigned";
  const partner = view === "partner";
  const [assigned, setAssigned] = useState<string[]>(team || unassigned ? [] : ["tulong-cebu", "bangon-marikina"]);
  const [selected, setSelected] = useState<string[]>([]);
  const [recommendation, setRecommendation] = useState("");
  const [recommendNote, setRecommendNote] = useState("");
  const [recommended, setRecommended] = useState("");
  const [showRecommend, setShowRecommend] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) ?? "null") as { assigned?: unknown; recommended?: unknown } | null;
      if (Array.isArray(data?.assigned) && data.assigned.every((id) => typeof id === "string")) setAssigned(data.assigned);
      if (typeof data?.recommended === "string") setRecommended(data.recommended);
    } catch { /* Corrupt demo state is ignored; this is only a local sample. */ }
  }, []);

  function saveAssigned(next: string[]) {
    setAssigned(next);
    setSelected([]);
    setSaved(true);
    try { localStorage.setItem(KEY, JSON.stringify({ assigned: next, recommended })); } catch { /* Keep the current screen usable without storage. */ }
  }

  const assignedNgos = NGOS.filter((ngo) => assigned.includes(ngo.id));
  const recommendationName = NGOS.find((ngo) => ngo.id === recommended)?.name;

  return <section className={styles.panel} aria-label="Disaster response partners">
    {partner ? <p className={styles.eyebrow}>NGO view · Tulong Cebu Relief</p> : team ? <p className={styles.eyebrow}>Salapi team · NGO review</p> : null}
    <h2>{assignedNgos.length ? "Assigned NGOs" : "No NGOs assigned yet"}</h2>
    {partner ? <p className={styles.note}>{assigned.includes("tulong-cebu") ? "Your organization is assigned to this disaster." : "Your organization has no assignment for this disaster."}</p> : null}

    {assignedNgos.length ? <div className={styles.list}>
      {assignedNgos.map((ngo) => <Link href={`/ngo/${ngo.id}`} key={ngo.id} className={styles.row}>
        <span><strong>{ngo.name}</strong><small>{ngo.place} · {ngo.focus}</small></span><ArrowRight size={19} aria-hidden="true" />
      </Link>)}
      {saved ? <p className={styles.saved} role="status"><CheckCircle size={15} /> Sample assignment saved on this device.</p> : null}
    </div> : team ? <>
      <p className={styles.subheading}>Community recommendation</p>
      <p className={styles.note}>{recommendationName ?? "No recommendations yet."}</p>
      <fieldset className={styles.fieldset}>
        <legend>Choose two NGOs</legend>
        {NGOS.map((ngo) => <label className={styles.row} key={ngo.id}>
          <span><strong>{ngo.name}</strong><small>{ngo.place} · {ngo.focus}</small></span>
          <input type="checkbox" checked={selected.includes(ngo.id)} disabled={selected.length >= 2 && !selected.includes(ngo.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, ngo.id] : selected.filter((id) => id !== ngo.id))} />
        </label>)}
      </fieldset>
      <button type="button" className={styles.primary} disabled={selected.length !== 2} onClick={() => saveAssigned(selected)}>Assign two NGOs</button>
    </> : recommendationName ? <>
      <p className={styles.subheading}>Recommendation sent</p>
      <p className={styles.note}>{recommendationName}</p>
      <p className={styles.note}>The Salapi team will review this recommendation.</p>
    </> : <>
      <p className={styles.note}>The Salapi team chooses the NGOs for this disaster.</p>
      {!partner ? <button type="button" className={styles.secondary} onClick={() => setShowRecommend((open) => !open)}><Flag size={16} />Recommend an NGO</button> : null}
      {showRecommend ? <div className={styles.recommendForm}>
        <label htmlFor="preview-ngo-choice">Choose an NGO</label>
        <select id="preview-ngo-choice" value={recommendation} onChange={(event) => setRecommendation(event.target.value)}>
          <option value="">Select an NGO</option>{NGOS.map((ngo) => <option value={ngo.id} key={ngo.id}>{ngo.name}</option>)}
        </select>
        <label htmlFor="preview-ngo-note">Why this NGO? (optional)</label>
        <textarea id="preview-ngo-note" maxLength={500} value={recommendNote} onChange={(event) => setRecommendNote(event.target.value)} />
        <button type="button" className={styles.primary} disabled={!recommendation} onClick={() => {
          setRecommended(recommendation);
          try { localStorage.setItem(KEY, JSON.stringify({ assigned, recommended: recommendation })); } catch { /* Keep the local preview interactive. */ }
          setShowRecommend(false);
        }}>Send recommendation</button>
      </div> : null}
    </>}
  </section>;
}
