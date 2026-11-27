"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Info, UsersThree } from "@phosphor-icons/react";
import { AppBar, Btn, Ico, IconButton, PoweredByStellar } from "@/components/ui/kit";
import { saveLocalPreviewCause } from "@/lib/local-preview";
import { useGoBack } from "@/lib/ui/useGoBack";
import PrototypeFeeStory from "./PrototypeFeeStory";
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

type Photo = { name: string; url: string; kind: "image" | "video"; file: File };

async function previewCoverDataUrl(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 720 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) { bitmap.close(); throw new Error("Could not resize cover image."); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not save cover image.")), "image/jpeg", 0.7));
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not save cover image."));
    reader.onerror = () => reject(new Error("Could not save cover image."));
    reader.readAsDataURL(blob);
  });
}

export default function PrototypeCreateCauseScreen() {
  const router = useRouter();
  const back = useGoBack("/");
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("A library for our barangay");
  const [story, setStory] = useState("Our barangay kids need a quiet place to read after school. Funds buy shelves, books and lights.");
  const [category, setCategory] = useState("Community");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [beneficiaryKind, setBeneficiaryKind] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("Barangay San Roque reading room");
  const [location, setLocation] = useState("Quezon City, PH");
  const [about, setAbout] = useState("Forty children use the hall after school. I volunteer there on weekends.");
  const [links, setLinks] = useState("");
  const [payout, setPayout] = useState("meis_family");
  const [proofFiles, setProofFiles] = useState<Photo[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [goal, setGoal] = useState("862.07");
  const [endDate, setEndDate] = useState(() => dateInDays(30));
  const [endTime, setEndTime] = useState("18:00");
  const [recurring, setRecurring] = useState(false);
  const [fee, setFee] = useState(5);
  const [photoIssue, setPhotoIssue] = useState("");
  const [mainPhotoUrl, setMainPhotoUrl] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [feeInfoOpen, setFeeInfoOpen] = useState(false);
  const [persistError, setPersistError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [frame, setFrame] = useState<HTMLElement | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const categoryPicker = useRef<HTMLDivElement>(null);
  const objectUrls = useRef(new Set<string>());

  useEffect(() => {
    setFrame(document.querySelector<HTMLElement>(".sl-app-frame"));
    setPortalHost(document.getElementById("phone-layer") ?? document.body);
    return () => { for (const url of objectUrls.current) URL.revokeObjectURL(url); };
  }, []);

  useEffect(() => {
    if (!categoryOpen) return;
    const closeOutside = (event: PointerEvent) => { if (event.target instanceof Node && !categoryPicker.current?.contains(event.target)) setCategoryOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setCategoryOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [categoryOpen]);

  useEffect(() => {
    if (!feeInfoOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setFeeInfoOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [feeInfoOpen]);

  const validTitle = title.trim().length >= 3;
  const validStory = story.trim().length >= STORY_MIN;
  const validGoal = Number(goal) >= 1 && Number.isFinite(Number(goal));
  const photoCount = photos.filter(photo => photo.kind === "image").length;
  const mainPhotoIndex = mainPhotoUrl ? photos.findIndex(photo => photo.url === mainPhotoUrl && photo.kind === "image") : -1;
  const effectiveMainPhotoIndex = mainPhotoIndex >= 0 ? mainPhotoIndex : photos.findIndex(photo => photo.kind === "image");
  const canContinue = step === 1 ? validTitle && validStory && !!category
    : step === 2 ? beneficiaryName.trim().length >= 2
      : step === 3 ? photoCount >= 3
        : validGoal;
  const next = () => setStep(value => Math.min(5, value + 1));
  const previous = () => step > 1 ? setStep(value => value - 1) : back();

  function addProofFiles(files: FileList | null) {
    if (!files?.length) return;
    const remaining = Math.max(0, 5 - proofFiles.length);
    const picked = Array.from(files).filter(file => file.type.startsWith("image/")).slice(0, remaining).map(file => {
      const url = URL.createObjectURL(file);
      objectUrls.current.add(url);
      return { name: file.name, url, kind: "image" as const, file };
    });
    setProofFiles(current => [...current, ...picked].slice(0, 5));
  }

  function removeProofFile(index: number) {
    const removed = proofFiles[index];
    if (removed) { URL.revokeObjectURL(removed.url); objectUrls.current.delete(removed.url); }
    setProofFiles(current => current.filter((_, at) => at !== index));
  }

  function addCauseFiles(files: FileList | null) {
    if (!files?.length) return;
    const remaining = Math.max(0, 7 - photos.length);
    const selected = Array.from(files);
    const picked = selected.slice(0, remaining);
    const valid = picked.filter(file => {
      if (file.type.startsWith("video/") && file.size > 50 * 1024 * 1024) return false;
      return file.type.startsWith("image/") || file.type.startsWith("video/");
    });
    const tooLarge = picked.some(file => file.type.startsWith("video/") && file.size > 50 * 1024 * 1024);
    setPhotoIssue(tooLarge ? "A video can be 50 MB at most." : selected.length > remaining ? "You can add 7 files at most." : "");
    const created = valid.map(file => {
      const url = URL.createObjectURL(file);
      objectUrls.current.add(url);
      return { name: file.name, url, kind: file.type.startsWith("video/") ? "video" as const : "image" as const, file };
    });
    const next = [...photos, ...created].slice(0, 7);
    setPhotos(next);
    if (!mainPhotoUrl) setMainPhotoUrl(next.find(photo => photo.kind === "image")?.url ?? null);
  }

  const removePhoto = (index: number) => {
    const removed = photos[index];
    if (removed) { URL.revokeObjectURL(removed.url); objectUrls.current.delete(removed.url); }
    const next = photos.filter((_, at) => at !== index);
    setPhotos(next);
    if (removed?.url === mainPhotoUrl) setMainPhotoUrl(next.find(photo => photo.kind === "image")?.url ?? null);
  };

  const rawGoal = Math.max(0, Number(goal) || 0);
  const organizerFee = rawGoal * fee / 100;
  const platformAndVault = rawGoal * 0.02;
  const receives = Math.max(0, rawGoal - organizerFee - platformAndVault);
  const finishLocalPreview = async () => {
    if (saving) return;
    setSaving(true);
    const id = `local-${Date.now().toString(36)}`;
    try {
      const coverDataUrl = effectiveMainPhotoIndex >= 0 ? await previewCoverDataUrl(photos[effectiveMainPhotoIndex].file) : undefined;
      const saved = saveLocalPreviewCause({ id, title: title.trim(), category, story: story.trim(), beneficiaryName: beneficiaryName.trim(), location: location.trim(), targetCents: Math.round(rawGoal * 100), organizerFeePercent: fee, endDate, recurring, coverDataUrl, photoNames: photos.map(photo => photo.name), createdAt: Date.now() });
      if (!saved) { setPersistError(true); setSaving(false); return; }
    } catch { setPersistError(true); setSaving(false); return; }
    setPersistError(false);
    setCreatedId(id);
    setReviewOpen(false);
    setSaving(false);
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
        <div className={styles.categorySelect} ref={categoryPicker}>
          <button id="create-category" className={styles.categoryTrigger} type="button" aria-haspopup="listbox" aria-expanded={categoryOpen} onClick={() => setCategoryOpen(value => !value)}>
            <UsersThree size={17} weight="regular" aria-hidden="true" /><span>{category}</span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {categoryOpen && <div className={styles.categoryMenu} role="listbox" aria-label="Choose a category">
            {CATEGORIES.map(item => <button key={item} type="button" role="option" aria-selected={category === item} className={styles.categoryOption} onClick={() => { setCategory(item); setCategoryOpen(false); }}><UsersThree size={17} weight="regular" aria-hidden="true" /><span>{item}</span>{category === item ? <strong aria-hidden="true">✓</strong> : null}</button>)}
          </div>}
        </div>
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
        <label>Proof · {proofFiles.length} of 5</label>
        <div className={styles.photoGrid} role="group" aria-label="Proof for the beneficiary">
          {proofFiles.map((file, index) => <div className={styles.photo} key={`${file.name}-${index}`}>
            <img src={file.url} alt={file.name} /><button className={styles.removePhoto} type="button" aria-label={`Remove ${file.name}`} onClick={() => removeProofFile(index)}>×</button>
          </div>)}
          {proofFiles.length < 5 && <button className={styles.photoAdd} type="button" onClick={() => document.getElementById("beneficiary-proof")?.click()}><span>＋</span><small>Photo</small></button>}
        </div>
        <input id="beneficiary-proof" className={styles.hiddenInput} type="file" accept="image/*" multiple onChange={event => { addProofFiles(event.target.files); event.currentTarget.value = ""; }} />
        <p className={styles.hint}>A letter, a registration paper, or a photo that shows the need. Donors see it on the cause page.</p>
      </section>}

      {step === 3 && <section className={styles.card}>
        <h1>Show the cause.</h1>
        <p className={styles.sub}>Photos and videos · {photos.length} of 7</p>
        <div className={styles.photoGrid} role="group" aria-label="Photos and videos of the cause">
        {photos.map((photo, index) => <div className={styles.photo} key={`${photo.name}-${index}`} data-main={index === effectiveMainPhotoIndex || undefined}>
          {photo.kind === "image" ? <img src={photo.url} alt={photo.name} /> : <video src={photo.url} aria-label={photo.name} />}
          <button className={styles.removePhoto} type="button" aria-label={`Remove ${photo.name}`} onClick={() => removePhoto(index)}>×</button>
          {photo.kind === "image" ? index === effectiveMainPhotoIndex ? <span className={styles.photoMain}>Main banner</span> : <button className={styles.photoMain} type="button" onClick={() => setMainPhotoUrl(photo.url)}>Set as main</button> : null}
        </div>)}
        {photos.length < 7 && <button className={styles.photoAdd} type="button" onClick={() => document.getElementById("cause-photos")?.click()}><span>＋</span><small>Photo or video</small></button>}
        </div>
        <input id="cause-photos" className={styles.hiddenInput} type="file" accept="image/*,video/*" multiple onChange={event => { addCauseFiles(event.target.files); event.currentTarget.value = ""; }} />
        {photoIssue && <p className={styles.error} role="alert">{photoIssue}</p>}
        <p className={photoCount > 0 && photoCount < 3 ? styles.error : styles.hint}>Add at least 3 photos. A video is optional and does not count toward the 3. 7 files at most, 50 MB a video. The main banner is what donors see first.</p>
      </section>}

      {step === 4 && <section className={styles.card}>
        <h1>Set the goal and the payout.</h1>
        <label htmlFor="cause-goal">Goal amount · USD</label>
        <div className={styles.moneyInput}><span>$</span><input id="cause-goal" inputMode="decimal" value={goal} placeholder="0" onChange={event => setGoal(event.target.value.replace(/[^0-9.]/g, ""))} /></div>
        <small>{goal && !validGoal ? "Enter a goal of $1 or more." : "You can change the goal after launch."}</small>
        <label>Cause type</label>
        <div className={styles.causeTypes} role="radiogroup" aria-label="Cause type">
          <button type="button" role="radio" aria-checked={!recurring} className={styles.causeType} onClick={() => setRecurring(false)}><span><strong>One time</strong><small>A single need, like a surgery.</small></span><i /></button>
          <button type="button" role="radio" aria-checked={recurring} className={styles.causeType} onClick={() => setRecurring(true)}><span><strong>Recurring</strong><small>A need that comes back, like dialysis.</small></span><i /></button>
        </div>
        <div className={styles.dateGrid}><label htmlFor="cause-end">Funding ends on<input id="cause-end" type="date" min={dateInDays(1)} max={dateInDays(365)} value={endDate} onChange={event => setEndDate(event.target.value)} /></label><label htmlFor="cause-time">At<input id="cause-time" type="time" value={endTime} onChange={event => setEndTime(event.target.value)} /></label></div>
        <small>{Math.max(1, Math.ceil((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${dateInDays(0)}T00:00:00`).getTime()) / 86_400_000))} days from today.</small>
        <div className={styles.feeHeader}>
          <label htmlFor="cause-fee">Organizer fee</label>
          <button className={styles.feeInfo} type="button" aria-label="What is the organizer fee?" aria-haspopup="dialog" onClick={() => setFeeInfoOpen(true)}><Info size={16} weight="fill" aria-hidden="true" /></button>
          <strong>{fee}%</strong>
        </div>
        <input id="cause-fee" className={styles.range} type="range" min="0" max="5" step="0.5" value={fee} onChange={event => setFee(Number(event.target.value))} />
        <div className={styles.rangeLabels}><span>0%</span><span>5%</span></div>
        <div className={styles.feeBox}><strong>If the goal is reached</strong><div><span>Donors give</span><b>{money(rawGoal)}</b></div><div><span>Your organizer fee · {fee}%</span><b>{money(organizerFee)}</b></div><div><span>Salapi 1% and Disaster Vault 1%</span><b>{money(platformAndVault)}</b></div><div className={styles.total}><span>The cause receives</span><b>{money(receives)}</b></div></div>
        <p className={styles.hint}>You set the fee, from 0 to 5%. It comes out of each donation and donors see it before they give.</p>
        <p className={styles.soft}>Funds stay in escrow until donors rate your proof of delivery.</p>
      </section>}

      {step === 5 && <>
        <p className={styles.reviewEyebrow}>Preview · how donors will see it</p>
        <section className={styles.reviewCard}>
          <div className={styles.cover}>{effectiveMainPhotoIndex >= 0 ? <img src={photos[effectiveMainPhotoIndex].url} alt="" /> : <span>No photo yet</span>}<span className={styles.category}>{category}</span></div>
          <div className={styles.reviewBody}><h1>{title || "Your cause title"}</h1><p className={styles.organizer}>◉　@{payout || "Organizer"} <span>Not verified</span></p><strong>$0.00 <small>raised of {money(rawGoal)}</small></strong><div className={styles.emptyProgress} /><small>No donors yet</small><p>{story}</p><small>For {[beneficiaryName, beneficiaryKind].filter(Boolean).join(" · ")}</small></div>
        </section>
        <section className={styles.card}>
          <h1>Check before you launch.</h1>
          {[["Title", title, 1], ["Beneficiary", beneficiaryName || "Not set", 2], ["Location", location || "Not set", 2], ["Receives", `@${payout || "Not set"}`, 2], ["Photos", `${photos.length} ${photos.length === 1 ? "file" : "files"}`, 3], ["Target", money(rawGoal), 4], ["Cause type", recurring ? "Recurring" : "One time", 4], ["Ends", `${endDate}, ${endTime}`, 4], ["Organizer fee", `${fee}%`, 4]].map(([label, value, at]) => <div key={String(label)} className={styles.reviewRow}><span>{label}</span><strong>{value}</strong><button type="button" onClick={() => setStep(Number(at))}>Edit</button></div>)}
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
    {portalHost && (reviewOpen || feeInfoOpen) && createPortal(<>
    {reviewOpen && <div className={styles.backdrop} role="presentation" onClick={event => { if (event.target === event.currentTarget) setReviewOpen(false); }}>
        <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="launch-confirm-title">
        <div className={styles.handle} /><h2 id="launch-confirm-title">Launch cause?</h2><p>This prototype flow is local only. No cause will be published and no funds will move.</p>{persistError && <p role="alert" className={styles.error}>Could not save this preview in the browser. Check local storage and try again.</p>}<Btn disabled={saving} onClick={() => void finishLocalPreview()}>{saving ? "Saving…" : "Finish local preview"}</Btn><button type="button" onClick={() => setReviewOpen(false)}>Go back</button>
      </section>
    </div>}
    {feeInfoOpen && <div className={styles.backdrop} role="presentation" onClick={event => { if (event.target === event.currentTarget) setFeeInfoOpen(false); }}>
      <section className={`${styles.sheet} ${styles.storySheet}`} role="dialog" aria-modal="true" aria-label="Organizer fee">
        <div className={styles.handle} />
        <PrototypeFeeStory onDone={() => setFeeInfoOpen(false)} />
      </section>
    </div>}
    </>, portalHost)}
  </div>;
}
