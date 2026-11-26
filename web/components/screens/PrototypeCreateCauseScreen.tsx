"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { UsersThree } from "@phosphor-icons/react";
import { AppBar, Btn, Ico, IconButton, PoweredByStellar } from "@/components/ui/kit";
import { saveLocalPreviewCause } from "@/lib/local-preview";
import { useGoBack } from "@/lib/ui/useGoBack";
import styles from "./PrototypeCreateCauseScreen.module.css";

const CATEGORIES = ["Community", "Medical", "Disaster relief", "Education", "Family", "Care & meals", "Animal care", "Volunteer action", "Creator support", "Housing", "Environment", "Clean water"];
const TITLE_LIMIT = 90;
const STORY_LIMIT = 1500;
const STORY_MIN = 40;
const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateInDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

type Photo = { name: string; url: string; kind: "image" | "video" };

export default function PrototypeCreateCauseScreen() {
  const router = useRouter();
  const back = useGoBack("/");
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("A library for our barangay");
  const [story, setStory] = useState("Our barangay kids need a quiet place to read after school. Funds buy shelves, books and lights.");
  const [category, setCategory] = useState("Community");
  const [beneficiaryKind, setBeneficiaryKind] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("Barangay San Roque reading room");
  const [location, setLocation] = useState("Quezon City, PH");
  const [about, setAbout] = useState("Forty children use the hall after school. I volunteer there on weekends.");
  const [links, setLinks] = useState("");
  const [payout, setPayout] = useState("meis_family");
  const [proofFiles, setProofFiles] = useState<string[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [goal, setGoal] = useState("862.07");
  const [endDate, setEndDate] = useState(() => dateInDays(30));
  const [endTime, setEndTime] = useState("18:00");
  const [fee, setFee] = useState(5);
  const [done, setDone] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [persistError, setPersistError] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [frame, setFrame] = useState<HTMLElement | null>(null);
  const objectUrls = useRef(new Set<string>());

  useEffect(() => {
    setFrame(document.querySelector<HTMLElement>(".sl-app-frame"));
    return () => { for (const url of objectUrls.current) URL.revokeObjectURL(url); };
  }, []);

  const validTitle = title.trim().length >= 3;
  const validStory = story.trim().length >= STORY_MIN;
  const validGoal = Number(goal) >= 1 && Number.isFinite(Number(goal));
  const canContinue = step === 1 ? validTitle && validStory && !!category
    : step === 2 ? beneficiaryName.trim().length >= 2
      : step === 3 ? photos.length >= 3
        : validGoal;
  const next = () => setStep(value => Math.min(5, value + 1));
  const previous = () => step > 1 ? setStep(value => value - 1) : back();

  function addProofFiles(files: FileList | null) {
    if (!files?.length) return;
    const names = Array.from(files).slice(0, Math.max(0, 5 - proofFiles.length)).map(file => file.name);
    setProofFiles(current => [...current, ...names].slice(0, 5));
  }

  function addCauseFiles(files: FileList | null) {
    if (!files?.length) return;
    const picked = Array.from(files).slice(0, Math.max(0, 7 - photos.length));
    const created = picked.map(file => {
      const url = URL.createObjectURL(file);
      objectUrls.current.add(url);
      return { name: file.name, url, kind: file.type.startsWith("video/") ? "video" as const : "image" as const };
    });
    setPhotos(value => [...value, ...created].slice(0, 7));
  }

  const removePhoto = (index: number) => setPhotos(current => {
    const removed = current[index];
    if (removed) { URL.revokeObjectURL(removed.url); objectUrls.current.delete(removed.url); }
    return current.filter((_, at) => at !== index);
  });

  const rawGoal = Math.max(0, Number(goal) || 0);
  const organizerFee = rawGoal * fee / 100;
  const platformAndVault = rawGoal * 0.02;
  const receives = Math.max(0, rawGoal - organizerFee - platformAndVault);
  const finishLocalPreview = () => {
    const id = `local-${Date.now().toString(36)}`;
    const saved = saveLocalPreviewCause({ id, title: title.trim(), category, story: story.trim(), beneficiaryName: beneficiaryName.trim(), location: location.trim(), targetCents: Math.round(rawGoal * 100), organizerFeePercent: fee, endDate, photoNames: photos.map(photo => photo.name), createdAt: Date.now() });
    if (!saved) { setPersistError(true); return; }
    setPersistError(false);
    setCreatedId(id);
    setReviewOpen(false);
    setDone(true);
  };

  return <div className={styles.screen}>
    <AppBar leading={<IconButton ariaLabel="Back" onClick={previous}>{Ico.back({})}</IconButton>} title="Create cause" />
    {!done ? <>
      <div className={styles.stepHeader}>
        <div className={styles.progress} aria-label={`Step ${Math.min(step, 4)} of 4`}>
          {[1, 2, 3, 4].map(number => <span key={number} data-active={step >= number || undefined} />)}
        </div>
        <div className={styles.stepCopy}>
          <span>{step <= 4 ? `Step ${step} / 4` : "Review"}</span>
          <strong>{["The cause", "The beneficiary", "The photos", "Goal & payout", "Review"][step - 1]}</strong>
        </div>
      </div>

      {step === 1 && <section className={styles.card}>
        <h1>Tell us what matters.</h1>
        <label htmlFor="create-title">Cause title</label>
        <input id="create-title" maxLength={TITLE_LIMIT} value={title} placeholder="Name your cause" onChange={event => setTitle(event.target.value)} />
        <small className={title.trim().length > 0 && !validTitle ? styles.error : ""}>{title.length} / {TITLE_LIMIT} characters</small>
        <label htmlFor="create-story">The story</label>
        <textarea id="create-story" maxLength={STORY_LIMIT} value={story} placeholder="What is it for, and who does it help?" onChange={event => setStory(event.target.value)} />
        <small className={story.trim().length > 0 && !validStory ? styles.error : ""}>{story.length} / {STORY_LIMIT.toLocaleString("en-US")} characters. Use at least {STORY_MIN}.</small>
        <label htmlFor="create-category">Category</label>
        <div className={styles.categorySelect}><UsersThree size={17} weight="regular" aria-hidden="true" /><select id="create-category" value={category} onChange={event => setCategory(event.target.value)}>
          {CATEGORIES.map(item => <option key={item}>{item}</option>)}
        </select></div>
      </section>}

      {step === 2 && <section className={styles.card}>
        <h1>Who is it for?</h1>
        <p className={styles.sub}>The one the help goes to. It can be a person, an organization or a community.</p>
        <input id="beneficiary-kind" maxLength={80} value={beneficiaryKind} placeholder="Person, organization or community" onChange={event => setBeneficiaryKind(event.target.value)} />
        <label>Who receives the money</label>
        <div className={styles.recipient}><img className={styles.avatarImage} src="/prototype-causes/avatar-mei.png" alt="" /><span><strong>@{payout || "your_username"}</strong><small>{location || "Salapi account"}</small></span><span className={styles.status}>Not verified</span></div>
        <p className={styles.hint}>Released funds go to your own Salapi account.</p>
        <div className={styles.kyc}><strong>Identity check (KYC)</strong><small>Needed before the first payout. It takes a few minutes.</small><button type="button" onClick={() => router.push("/you/verify")}>Verify</button></div>
        <label htmlFor="beneficiary-name">Name</label>
        <input id="beneficiary-name" maxLength={80} value={beneficiaryName} placeholder="Beneficiary name" onChange={event => setBeneficiaryName(event.target.value)} />
        <label htmlFor="beneficiary-location">Location</label>
        <input id="beneficiary-location" maxLength={60} value={location} placeholder="City and country" onChange={event => setLocation(event.target.value)} />
        <label htmlFor="beneficiary-about">About them</label>
        <textarea id="beneficiary-about" maxLength={400} value={about} placeholder="How do you know them, and what do they need?" onChange={event => setAbout(event.target.value)} />
        <label htmlFor="beneficiary-links">Links</label>
        <input id="beneficiary-links" inputMode="url" autoCapitalize="none" spellCheck={false} value={links} placeholder="A website, a page or a news story" onChange={event => setLinks(event.target.value)} />
        <label htmlFor="beneficiary-proof">Proof · {proofFiles.length} of 5</label>
        <input id="beneficiary-proof" className={styles.fileInput} type="file" accept="image/*,.pdf" multiple onChange={event => addProofFiles(event.target.files)} />
        <p className={styles.hint}>A letter, a registration paper, or a photo that shows the need. Donors see it on the cause page.</p>
      </section>}

      {step === 3 && <section className={styles.card}>
        <h1>Show the cause.</h1>
        <p className={styles.sub}>Photos and videos · {photos.length} of 7</p>
        <label className={styles.upload} htmlFor="cause-photos"><span className={styles.uploadIcon}>＋</span><strong>Add photos or videos</strong><small>Choose 3 to 7 files. A video can be 50 MB at most.</small></label>
        <input id="cause-photos" className={styles.hiddenInput} type="file" accept="image/*,video/*" multiple onChange={event => addCauseFiles(event.target.files)} />
        {photos.length > 0 && <div className={styles.photoGrid}>{photos.map((photo, index) => <div className={styles.photo} key={`${photo.name}-${index}`}>
          {photo.kind === "image" ? <img src={photo.url} alt={photo.name} /> : <video src={photo.url} aria-label={photo.name} />}
          <button type="button" aria-label={`Remove ${photo.name}`} onClick={() => removePhoto(index)}>×</button>
          {index === 0 && <span>Main banner</span>}
        </div>)}</div>}
        <p className={photos.length > 0 && photos.length < 3 ? styles.error : styles.hint}>Add 3 to 7. A video can be 50 MB at most. The main banner is what donors see first.</p>
      </section>}

      {step === 4 && <section className={styles.card}>
        <h1>Set the goal and the payout.</h1>
        <label htmlFor="cause-goal">Goal amount · USD</label>
        <div className={styles.moneyInput}><span>$</span><input id="cause-goal" inputMode="decimal" value={goal} placeholder="0" onChange={event => setGoal(event.target.value.replace(/[^0-9.]/g, ""))} /></div>
        <small>{goal && !validGoal ? "Enter a goal of $1 or more." : "You can change the goal after launch."}</small>
        <div className={styles.dateGrid}><label htmlFor="cause-end">Funding ends on<input id="cause-end" type="date" min={dateInDays(1)} max={dateInDays(365)} value={endDate} onChange={event => setEndDate(event.target.value)} /></label><label htmlFor="cause-time">At<input id="cause-time" type="time" value={endTime} onChange={event => setEndTime(event.target.value)} /></label></div>
        <small>{Math.max(1, Math.ceil((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${dateInDays(0)}T00:00:00`).getTime()) / 86_400_000))} days from today.</small>
        <div className={styles.feeHeader}><label htmlFor="cause-fee">Organizer fee</label><strong>{fee}%</strong></div>
        <input id="cause-fee" className={styles.range} type="range" min="0" max="5" step="0.5" value={fee} onChange={event => setFee(Number(event.target.value))} />
        <div className={styles.rangeLabels}><span>0%</span><span>5%</span></div>
        <div className={styles.feeBox}><strong>If the goal is reached</strong><div><span>Donors give</span><b>{money(rawGoal)}</b></div><div><span>Your organizer fee · {fee}%</span><b>{money(organizerFee)}</b></div><div><span>Salapi 1% and Disaster Vault 1%</span><b>{money(platformAndVault)}</b></div><div className={styles.total}><span>The cause receives</span><b>{money(receives)}</b></div></div>
        <p className={styles.hint}>You set the fee, from 0 to 5%. It comes out of each donation and donors see it before they give.</p>
        <p className={styles.soft}>Funds stay in escrow until donors rate your proof of delivery.</p>
      </section>}

      {step === 5 && <>
        <p className={styles.reviewEyebrow}>Preview · how donors will see it</p>
        <section className={styles.reviewCard}>
          <div className={styles.cover}>{photos[0]?.kind === "image" ? <img src={photos[0].url} alt="" /> : <span>No photo yet</span>}<span className={styles.category}>{category}</span></div>
          <div className={styles.reviewBody}><h1>{title || "Your cause title"}</h1><p className={styles.organizer}>◉　@{payout || "Organizer"} <span>Not verified</span></p><strong>$0.00 <small>raised of {money(rawGoal)}</small></strong><div className={styles.emptyProgress} /><small>No donors yet</small><p>{story}</p><small>For {[beneficiaryName, beneficiaryKind].filter(Boolean).join(" · ")}</small></div>
        </section>
        <section className={styles.card}>
          <h1>Check before you launch.</h1>
          {[["Title", title, 1], ["Beneficiary", beneficiaryName || "Not set", 2], ["Location", location || "Not set", 2], ["Receives", `@${payout || "Not set"}`, 2], ["Photos", `${photos.length} ${photos.length === 1 ? "file" : "files"}`, 3], ["Target", money(rawGoal), 4], ["Ends", `${endDate}, ${endTime}`, 4], ["Organizer fee", `${fee}%`, 4]].map(([label, value, at]) => <div key={String(label)} className={styles.reviewRow}><span>{label}</span><strong>{value}</strong><button type="button" onClick={() => setStep(Number(at))}>Edit</button></div>)}
        </section>
      </>}

      {step === 1 && <div className={styles.powered}><PoweredByStellar /></div>}
    </> : <section className={styles.finished}>
      <span className={styles.check}>✓</span><h1>Your cause is ready to launch</h1><p>Saved in this browser's local preview. It has not been published and no transaction was sent.</p>
      <div className={styles.finishCard}><strong>{title}</strong><span>{category} · Goal {money(rawGoal)}</span><p>{story}</p></div>
      <Btn onClick={() => router.push(createdId ? `/cause/${createdId}` : "/manage")}>View local cause</Btn>
      <button type="button" onClick={() => { setDone(false); setStep(1); }}>Edit cause</button>
    </section>}

    {frame && !done && createPortal(<div className={styles.cta}>
      {step < 5 ? <Btn trailing={Ico.chev({ c: "#fff" })} disabled={!canContinue} onClick={next}>Continue</Btn>
        : <Btn disabled={!validGoal || !beneficiaryName.trim()} onClick={() => setReviewOpen(true)}>Launch cause</Btn>}
    </div>, frame)}
    {reviewOpen && <div className={styles.backdrop} role="presentation" onClick={event => { if (event.target === event.currentTarget) setReviewOpen(false); }}>
        <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="launch-confirm-title">
        <div className={styles.handle} /><h2 id="launch-confirm-title">Launch cause?</h2><p>This prototype flow is local only. No cause will be published and no funds will move.</p>{persistError && <p role="alert" className={styles.error}>Could not save this preview in the browser. Check local storage and try again.</p>}<Btn onClick={finishLocalPreview}>Finish local preview</Btn><button type="button" onClick={() => setReviewOpen(false)}>Go back</button>
      </section>
    </div>}
  </div>;
}
