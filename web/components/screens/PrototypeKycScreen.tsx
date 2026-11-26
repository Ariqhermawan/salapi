"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ico, Btn, T } from "@/components/ui/kit";
import styles from "./PrototypeKycScreen.module.css";

type Outcome = "pending" | "approved" | "retry" | "rejected";
type Applicant = "Individual" | "NGO";

const outcomes: Record<Outcome, { title: string; label: string; note: string; icon: "refresh" | "check" | "x"; tone: string }> = {
  pending: { title: "Under review", label: "Pending", note: "A sample result: no provider is connected.", icon: "refresh", tone: "pending" },
  approved: { title: "Identity verified", label: "Approved", note: "A sample result: no provider is connected.", icon: "check", tone: "approved" },
  retry: { title: "More information", label: "Retry required", note: "A sample result: no provider is connected.", icon: "refresh", tone: "retry" },
  rejected: { title: "Not approved", label: "Rejected", note: "A sample result: no provider is connected.", icon: "x", tone: "rejected" },
};

export default function PrototypeKycScreen({ state }: { state?: string }) {
  const router = useRouter();
  const [applicant, setApplicant] = useState<Applicant>("Individual");
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [step, setStep] = useState(1);
  const [photoTaken, setPhotoTaken] = useState(false);
  const [notice, setNotice] = useState("");
  const checks = applicant === "Individual"
    ? [["Identity document", "A government-issued ID in a future live flow. Do not upload it here."], ["Selfie check", "A future live face-match step."]]
    : [["Organization document", "A registration document in a future live flow. Do not upload it here."], ["Representative check", "A future live check of the person who signs."]];
  const selectedOutcome = state && state in outcomes ? outcomes[state as Outcome] : null;
  const isLevels = state === "levels";

  function back() {
    if (step > 1 && !selectedOutcome) setStep((current) => current - 1);
    else router.push("/you");
  }

  function toggleCheck(title: string) {
    setAcknowledged((current) => current.includes(title) ? current.filter((item) => item !== title) : [...current, title]);
  }

  if (isLevels) return <main className={styles.screen}>
    <header className={styles.header}><button type="button" aria-label="Back" onClick={back}>{Ico.back({ size: 19, c: T.ink })}</button><h1>Limits</h1><span /></header>
    <section className={styles.levelCard}>
      <p>Your level</p><h2>Level 0</h2>
      <div><span>Organizer fee</span><strong>0%</strong></div>
      <div><span>Identity check</span><strong>Not verified</strong></div>
    </section>
    <h2 className={styles.groupTitle}>Next levels</h2>
    <section className={styles.levelCard}><h3>Level 1 · Basic ID</h3><div><span>Needs</span><strong>Basic ID check</strong></div><div><span>Organizer fee</span><strong>Up to 5%</strong></div></section>
    <section className={styles.levelCard}><h3>Level 2 · Enhanced ID</h3><div><span>Needs</span><strong>Enhanced ID check</strong></div><div><span>Completed causes</span><strong>3</strong></div><div><span>Organizer fee</span><strong>Up to 5%</strong></div></section>
    <div className={styles.buttonArea}><Btn kind="primary" onClick={() => router.push("/you/verify/preview")}>Verify your identity</Btn></div>
  </main>;

  if (selectedOutcome) return <main className={styles.screen}>
    <header className={styles.header}><button type="button" aria-label="Back" onClick={back}>{Ico.back({ size: 19, c: T.ink })}</button><div><h1>Verify your identity</h1><p>Sumsub · not connected</p></div><span /></header>
    <div className={styles.progressHead}><span>Step 3 / 3</span><span>Result</span></div><div className={styles.progress}><i /><i /><i /></div>
    <section className={styles.outcome} data-tone={selectedOutcome.tone}>
      <span className={styles.outcomeIcon}>{Ico[selectedOutcome.icon]({ size: 22, c: "currentColor" })}</span>
      <h2>{selectedOutcome.title}</h2>
      <p>{selectedOutcome.note}</p>
    </section>
    <button type="button" className={styles.tierLink} onClick={() => router.push(`/you/verify/preview/levels?status=${state}`)}>
      <span className={styles.tierIcon}>{Ico.vault({ size: 20, c: T.action })}</span><span><strong>Tier ladder</strong><small>What each tier would unlock</small></span>{Ico.chev({ size: 16, c: T.slate })}
    </button>
    {state === "retry" ? <div className={styles.buttonArea}><Btn kind="primary" onClick={() => router.push("/you/verify/preview")}>Start again</Btn></div> : null}
    <div className={styles.buttonArea}><Btn kind="secondary" onClick={() => router.push("/you")}>Return to Settings</Btn></div>
    <div className={styles.emptyArt} aria-hidden="true"><span>♡</span><span>♡</span><span>♡</span><div>{Ico.user({ size: 32 })}<IcoWrapper />{Ico.user({ size: 32 })}<IcoWrapper /></div></div>
  </main>;

  return <main className={styles.screen}>
    <header className={styles.header}><button type="button" aria-label="Back" onClick={back}>{Ico.back({ size: 19, c: T.ink })}</button><div><h1>Verify your identity</h1><p>Sumsub · not connected</p></div><span /></header>
    <div className={styles.progressHead}><span>Step {step} / 3</span><span>{["Prepare", "Review", "Result"][step - 1]}</span></div>
    <div className={styles.progress}>{[1, 2, 3].map((n) => <i key={n} data-active={n <= step || undefined} />)}</div>
    {step === 1 ? <>
      <div className={styles.kindPicker} role="group" aria-label="Account type">
        {(["Individual", "NGO"] as const).map((kind) => <button type="button" key={kind} aria-pressed={applicant === kind} onClick={() => { setApplicant(kind); setAcknowledged([]); }}><strong>{kind}</strong><small>{kind === "Individual" ? "Verify as a person" : "Verify as an organization"}</small></button>)}
      </div>
      <section className={styles.checkCard}>
        <h2>Before you begin</h2><p>Preview the {applicant} checks. Tick to acknowledge each step.</p>
        {checks.map(([title, note]) => <label key={title}><input type="checkbox" checked={acknowledged.includes(title)} onChange={() => toggleCheck(title)} /><span><strong>{title}</strong><small>{note}</small></span></label>)}
      </section>
      <div className={styles.buttonArea}><Btn disabled={acknowledged.length < checks.length} onClick={() => setStep(2)}>Continue</Btn></div>
    </> : step === 2 ? <>
      <section className={styles.checkCard}>
        <h2>{photoTaken ? "Sample photo taken" : "Prepare a sample check"}</h2>
        <p>This preview never opens your camera or saves a photo.</p>
        <div className={styles.photoBox}>{photoTaken ? Ico.check({ size: 36, c: T.action }) : Ico.user({ size: 36, c: T.action })}<span>{photoTaken ? "Sample photo ready" : "No document or selfie is captured"}</span></div>
      </section>
      <div className={styles.buttonArea}><Btn onClick={() => setPhotoTaken(true)}>{photoTaken ? "Retake sample" : "Take sample photo"}</Btn><Btn kind="secondary" onClick={() => photoTaken ? setStep(3) : setNotice("Take the sample photo to continue.")}>{photoTaken ? "Continue" : "Continue"}</Btn>{notice ? <p role="status">{notice}</p> : null}</div>
    </> : <>
      <section className={styles.checkCard}><h2>Sumsub handoff</h2><span className={styles.notConnected}>Not connected</span><p>Live verification needs a server-issued session. This local flow sends no documents or request to Sumsub.</p></section>
      <div className={styles.buttonArea}><Btn onClick={() => router.push("/you/verify/preview/pending")}>Submit for review</Btn><Btn kind="secondary" onClick={() => setStep(2)}>Back</Btn></div>
    </>}
  </main>;
}

function IcoWrapper() {
  return <span className={styles.packageIcon} aria-hidden="true">▣</span>;
}
