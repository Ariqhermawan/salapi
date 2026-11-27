"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ArrowRight } from "@phosphor-icons/react";
import styles from "./DisasterPartnersPreview.module.css";

const KEY = "salapi.local-preview.disaster-ngos";
type Recommendation = { ngo: string; note: string };
type SavedPartners = { assigned?: unknown; recommendation?: unknown; recommended?: unknown };
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
  const [recommended, setRecommended] = useState<Recommendation | null>(null);
  const [showRecommend, setShowRecommend] = useState(false);

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) ?? "null") as SavedPartners | null;
      const storedAssigned = Array.isArray(data?.assigned) && data.assigned.every((id) => typeof id === "string")
        ? data.assigned as string[]
        : null;
      const storedRecommendation = data?.recommendation && typeof data.recommendation === "object"
        ? data.recommendation as Recommendation
        : typeof data?.recommended === "string"
          ? { ngo: data.recommended, note: "" }
          : null;
      const nextAssigned = team || unassigned
        ? storedAssigned?.length ? [] : storedAssigned ?? []
        : storedAssigned?.length ? storedAssigned : ["tulong-cebu", "bangon-marikina"];
      const nextRecommendation = (team || unassigned) && storedAssigned?.length ? null : storedRecommendation;
      setAssigned(nextAssigned);
      setRecommended(nextRecommendation);
      setRecommendNote(nextRecommendation?.note ?? "");
    } catch { /* Corrupt demo state is ignored; this is only a local sample. */ }
  }, [team, unassigned]);

  useEffect(() => {
    if (!showRecommend) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setShowRecommend(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showRecommend]);

  function saveAssigned(next: string[]) {
    setAssigned(next);
    setSelected([]);
    try { localStorage.setItem(KEY, JSON.stringify({ assigned: next, recommendation: recommended })); } catch { /* Keep the current screen usable without storage. */ }
  }

  const assignedNgos = NGOS.filter((ngo) => assigned.includes(ngo.id));
  const recommendationNgo = NGOS.find((ngo) => ngo.id === recommended?.ngo);

  return <section className={styles.panel} aria-label="Disaster response partners">
    {partner ? <p className={styles.eyebrow}>NGO view · Tulong Cebu Relief</p> : team ? <p className={styles.eyebrow}>Salapi team · NGO review</p> : null}
    <h2>{assignedNgos.length ? "Assigned NGOs" : "No NGOs assigned yet"}</h2>
    {partner ? <p className={styles.note}>{assigned.includes("tulong-cebu") ? "Your organization is assigned to this disaster." : "Your organization has no assignment for this disaster."}</p> : null}

    {assignedNgos.length ? <div className={styles.list}>
      {assignedNgos.map((ngo) => <Link href={`/ngo/${ngo.id}`} key={ngo.id} className={styles.row}>
        <span><strong>{ngo.name}</strong><small>{ngo.place} · {ngo.focus}</small></span><ArrowRight size={19} aria-hidden="true" />
      </Link>)}
    </div> : team ? <>
      <p className={styles.subheading}>Community recommendation</p>
      <p className={styles.note}>{recommendationNgo?.name ?? "No recommendations yet."}</p>
      {recommended?.note ? <p className={styles.note}>{recommended.note}</p> : null}
      <fieldset className={styles.fieldset}>
        <legend>Choose two NGOs</legend>
        {NGOS.map((ngo) => <label className={styles.row} key={ngo.id}>
          <span><strong>{ngo.name}</strong><small>{ngo.place} · {ngo.focus}</small></span>
          <input type="checkbox" checked={selected.includes(ngo.id)} disabled={selected.length >= 2 && !selected.includes(ngo.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, ngo.id] : selected.filter((id) => id !== ngo.id))} />
        </label>)}
      </fieldset>
      <button type="button" className={styles.primary} disabled={selected.length !== 2} onClick={() => saveAssigned(selected)}>Assign two NGOs</button>
    </> : recommendationNgo && !partner ? <>
      <p className={styles.subheading}>Recommendation sent</p>
      <p className={styles.note}>{recommendationNgo.name}</p>
      <p className={styles.note}>The Salapi team will review this recommendation.</p>
    </> : <>
      <p className={styles.note}>The Salapi team chooses the NGOs for this disaster.</p>
      {!partner ? <button type="button" className={styles.secondary} onClick={() => setShowRecommend(true)}>Recommend an NGO</button> : null}
    </>}

    {showRecommend ? createPortal(<div className={styles.sheetBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowRecommend(false); }}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-label="Recommend an NGO">
        <div className={styles.handle} aria-hidden="true" />
        <h2>Recommend an NGO</h2>
        <fieldset className={styles.sheetFieldset}>
          <legend>Choose an NGO</legend>
          {NGOS.map((ngo) => <label className={styles.row} key={ngo.id}>
            <span><strong>{ngo.name}</strong><small>{ngo.focus}</small></span>
            <input type="radio" name="recommended-ngo" checked={recommendation === ngo.id} onChange={() => setRecommendation(ngo.id)} />
          </label>)}
        </fieldset>
        <label className={styles.reasonLabel} htmlFor="preview-ngo-note">Why this NGO? (optional)</label>
        <textarea id="preview-ngo-note" maxLength={500} value={recommendNote} onChange={(event) => setRecommendNote(event.target.value)} />
        <button type="button" className={styles.primary} disabled={!recommendation} onClick={() => {
          const next = { ngo: recommendation, note: recommendNote.trim() };
          setRecommended(next);
          try { localStorage.setItem(KEY, JSON.stringify({ assigned, recommendation: next })); } catch { /* Keep the local preview usable when storage is unavailable. */ }
          setShowRecommend(false);
        }}>Send recommendation</button>
      </section>
    </div>, document.getElementById("phone-layer") ?? document.body) : null}
  </section>;
}
