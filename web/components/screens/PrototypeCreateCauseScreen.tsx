"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { Info, UsersThree } from "@phosphor-icons/react";
import { CalendarBlank } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretLeft } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { Clock } from "@phosphor-icons/react/dist/csr/Clock";
import { CloudRain } from "@phosphor-icons/react/dist/csr/CloudRain";
import { Drop } from "@phosphor-icons/react/dist/csr/Drop";
import { ForkKnife } from "@phosphor-icons/react/dist/csr/ForkKnife";
import { GraduationCap } from "@phosphor-icons/react/dist/csr/GraduationCap";
import { HandHeart } from "@phosphor-icons/react/dist/csr/HandHeart";
import { Heartbeat } from "@phosphor-icons/react/dist/csr/Heartbeat";
import { House } from "@phosphor-icons/react/dist/csr/House";
import { Leaf } from "@phosphor-icons/react/dist/csr/Leaf";
import { PaintBrush } from "@phosphor-icons/react/dist/csr/PaintBrush";
import { PawPrint } from "@phosphor-icons/react/dist/csr/PawPrint";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { AppBar, Btn, Ico, IconButton, PoweredByStellar } from "@/components/ui/kit";
import { saveLocalPreviewCause } from "@/lib/local-preview";
import { RECURRING_CAMPAIGN_FEE_PREVIEW_NOTICE, RECURRING_CAMPAIGN_PREVIEW_NOTICE, recurringCampaignPreviewSetup } from "@/lib/prototype-recurring-preview";
import { useGoBack } from "@/lib/ui/useGoBack";
import PrototypeFeeStory from "./PrototypeFeeStory";
import styles from "./PrototypeCreateCauseScreen.module.css";

const CATEGORIES = ["Community", "Medical", "Disaster relief", "Education", "Family", "Care & meals", "Animal care", "Volunteer action", "Creator support", "Housing", "Environment", "Clean water"];
const CATEGORY_ICONS = {
  Community: UsersThree,
  Medical: Heartbeat,
  "Disaster relief": CloudRain,
  Education: GraduationCap,
  Family: UsersThree,
  "Care & meals": ForkKnife,
  "Animal care": PawPrint,
  "Volunteer action": HandHeart,
  "Creator support": PaintBrush,
  Housing: House,
  Environment: Leaf,
  "Clean water": Drop,
} as const;
const TITLE_LIMIT = 90;
const STORY_LIMIT = 1500;
const STORY_MIN = 40;
const STAGES_MIN = 2;
const STAGES_MAX = 6;
const STAGE_TITLE_MAX = 40;
const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const moneyCents = (value: number) => money(value / 100);
const dateInDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const stageDate = (iso: string) => {
  const date = new Date(`${iso}T12:00:00`);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
};

type Photo = { name: string; url: string; kind: "image" | "video"; file: File };
type StageDraft = { title: string; amountCents: number | null; amountText?: string; dueDate: string };
const blankStages = (): StageDraft[] => Array.from({ length: STAGES_MIN }, () => ({ title: "", amountCents: null, dueDate: "" }));

function CategoryIcon({ name }: { name: string }) {
  const Icon = CATEGORY_ICONS[name as keyof typeof CATEGORY_ICONS];
  return Icon ? <Icon size={20} weight="regular" aria-hidden="true" /> : null;
}

function isoDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function DatePicker({ id, value, min, max, onChange }: { id: string; value: string; min: string; max: string; onChange: (value: string) => void }) {
  const selected = value ? new Date(`${value}T12:00:00`) : undefined;
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => { const initial = selected ?? new Date(`${min}T12:00:00`); return new Date(initial.getFullYear(), initial.getMonth(), 1); });
  const root = useRef<HTMLDivElement>(null);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cellCount = first.getDay() + days > 35 ? 42 : 35;
  const minDate = new Date(`${min}T12:00:00`);
  const maxDate = new Date(`${max}T12:00:00`);
  const previousMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const atMinMonth = previousMonth < new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const atMaxMonth = nextMonth > new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  const monthTitle = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return <div className={styles.picker} ref={root}>
    <button id={id} type="button" className={styles.pickerTrigger} aria-haspopup="dialog" aria-expanded={open} onClick={() => { const initial = selected ?? minDate; setMonth(new Date(initial.getFullYear(), initial.getMonth(), 1)); setOpen(value => !value); }}>
      <span>{selected?.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) ?? "Select date"}</span><CalendarBlank size={18} aria-hidden="true" />
    </button>
    {open && <div className={styles.calendarPopover} role="dialog" aria-label="Choose funding end date">
      <div className={styles.calendarHeader}>
        <button type="button" aria-label="Previous month" disabled={atMinMonth} onClick={() => setMonth(previousMonth)}><CaretLeft size={17} /></button>
        <strong>{monthTitle}</strong>
        <button type="button" aria-label="Next month" disabled={atMaxMonth} onClick={() => setMonth(nextMonth)}><CaretRight size={17} /></button>
      </div>
      <div className={styles.calendarGrid} role="grid" aria-label={monthTitle}>
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day, index) => <span key={`${day}-${index}`} className={styles.weekday} role="columnheader">{day}</span>)}
        {Array.from({ length: cellCount }, (_, index) => {
          const day = index - first.getDay() + 1;
          if (day < 1 || day > days) return <span key={index} className={styles.emptyDay} aria-hidden="true" />;
          const date = new Date(month.getFullYear(), month.getMonth(), day, 12);
          const iso = isoDay(date);
          const disabled = iso < min || iso > max;
          const isSelected = !!selected && iso === value;
          return <button key={iso} type="button" role="gridcell" aria-label={date.toLocaleDateString("en-US", { dateStyle: "full" })} aria-selected={isSelected} disabled={disabled} data-selected={isSelected || undefined} onClick={() => { onChange(iso); setOpen(false); }}>{day}</button>;
        })}
      </div>
    </div>}
  </div>;
}

function TimePicker({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(value.split(":"));
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const openPicker = () => { setTime(value.split(":")); setOpen(current => !current); };
  return <div className={`${styles.picker} ${styles.timePicker}`} ref={root}>
    <button id={id} type="button" className={styles.pickerTrigger} aria-haspopup="dialog" aria-expanded={open} onClick={openPicker}><span>{value}</span><Clock size={18} aria-hidden="true" /></button>
    {open && <div className={styles.timePopover} role="dialog" aria-label="Choose funding end time">
      <div className={styles.timeColumns}>
        {["Hour", "Minute"].map((label, column) => <div key={label}>
          <p>{label}</p>
          <div className={styles.timeOptions} role="group" aria-label={label}>
            {Array.from({ length: column === 0 ? 24 : 60 }, (_, index) => String(index).padStart(2, "0")).map(item => <button key={item} type="button" aria-pressed={time[column] === item} onClick={() => setTime(current => column === 0 ? [item, current[1]] : [current[0], item])}>{item}</button>)}
          </div>
        </div>)}
      </div>
      <button className={styles.timeDone} type="button" onClick={() => { onChange(time.join(":")); setOpen(false); }}>Done</button>
    </div>}
  </div>;
}

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
  const searchParams = useSearchParams();
  const previewQuery = searchParams.toString();
  const [recurringSetup] = useState(() => recurringCampaignPreviewSetup(previewQuery));
  const back = useGoBack("/");
  const [step, setStep] = useState(recurringSetup?.step ?? 1);
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
  const [goal, setGoal] = useState(recurringSetup?.goal ?? "862.07");
  const [endDate, setEndDate] = useState(() => dateInDays(30));
  const [endTime, setEndTime] = useState("18:00");
  const [recurring, setRecurring] = useState(recurringSetup !== null);
  const [stages, setStages] = useState<StageDraft[]>(recurringSetup?.stages ?? []);
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
  const rawGoal = Math.max(0, Number(goal) || 0);
  const targetCents = Math.round(rawGoal * 100);
  const photoCount = photos.filter(photo => photo.kind === "image").length;
  const mainPhotoIndex = mainPhotoUrl ? photos.findIndex(photo => photo.url === mainPhotoUrl && photo.kind === "image") : -1;
  const effectiveMainPhotoIndex = mainPhotoIndex >= 0 ? mainPhotoIndex : photos.findIndex(photo => photo.kind === "image");
  const stagesTotal = stages.reduce((sum, stage) => sum + (stage.amountCents ?? 0), 0);
  const stagesComplete = stages.length >= STAGES_MIN && stages.length <= STAGES_MAX && stages.every((stage, index) => {
    const dueOnOrAfterPrevious = index === 0 || !stages[index - 1].dueDate || !stage.dueDate || stage.dueDate >= stages[index - 1].dueDate;
    return stage.title.trim().length >= 2 && stage.amountCents !== null && stage.amountCents >= 100
      && !!stage.dueDate && stage.dueDate > dateInDays(0) && dueOnOrAfterPrevious;
  }) && stagesTotal === targetCents;
  const stageSummary = !validGoal ? "Enter a goal first. The stages add up to it."
    : stagesTotal === targetCents ? `The stages add up to the goal, ${money(rawGoal)}.`
      : stagesTotal > targetCents ? `The stages add up to ${moneyCents(stagesTotal)}, ${moneyCents(stagesTotal - targetCents)} over the goal.`
        : stages.some(stage => stage.amountCents !== null) ? `${moneyCents(stagesTotal)} of ${money(rawGoal)} in stages. ${moneyCents(targetCents - stagesTotal)} left.`
          : `The stages must add up to the goal, ${money(rawGoal)}.`;
  const stageFieldsFilled = stages.length >= STAGES_MIN && stages.every((stage, index) => stage.title.trim().length >= 2
    && stage.amountCents !== null && stage.amountCents >= 100 && !!stage.dueDate && stage.dueDate > dateInDays(0)
    && (index === 0 || !stages[index - 1].dueDate || stage.dueDate >= stages[index - 1].dueDate));
  const updateStage = (index: number, patch: Partial<StageDraft>) => setStages(current => current.map((stage, at) => at === index ? { ...stage, ...patch } : stage));
  const canContinue = step === 1 ? validTitle && validStory && !!category
    : step === 2 ? beneficiaryName.trim().length >= 2
      : step === 3 ? photoCount >= 3
        : validGoal && (!recurring || stagesComplete);
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

  const organizerFee = rawGoal * fee / 100;
  const platformAndVault = rawGoal * 0.02;
  const receives = Math.max(0, rawGoal - organizerFee - platformAndVault);
  const finishLocalPreview = async () => {
    if (saving) return;
    setSaving(true);
    const id = `local-${Date.now().toString(36)}`;
    try {
      const coverDataUrl = effectiveMainPhotoIndex >= 0 ? await previewCoverDataUrl(photos[effectiveMainPhotoIndex].file) : undefined;
      const saved = saveLocalPreviewCause({ id, title: title.trim(), category, story: story.trim(), beneficiaryName: beneficiaryName.trim(), location: location.trim(), targetCents, organizerFeePercent: fee, endDate, recurring, ...(recurring ? { stages: stages.map(stage => ({ title: stage.title.trim(), amountCents: stage.amountCents ?? 0, dueDate: stage.dueDate })) } : {}), coverDataUrl, photoNames: photos.map(photo => photo.name), createdAt: Date.now() });
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
          <strong>{["The cause", "The beneficiary", "The photos", "Goal & payout", "Ready to launch"][step - 1]}</strong>
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
            <CategoryIcon name={category} /><span>{category}</span><CaretDown size={20} weight="regular" aria-hidden="true" />
          </button>
          {categoryOpen && <div className={styles.categoryMenu} role="listbox" aria-label="Choose a category">
            {CATEGORIES.map(item => <button key={item} type="button" role="option" aria-selected={category === item} className={styles.categoryOption} onClick={() => { setCategory(item); setCategoryOpen(false); }}><CategoryIcon name={item} /><span>{item}</span>{category === item ? <Check size={18} aria-hidden="true" /> : null}</button>)}
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
        <input id="cause-goal" className={styles.goalInput} inputMode="decimal" value={goal} placeholder="0" onChange={event => setGoal(event.target.value.replace(/[^0-9.]/g, ""))} />
        <small>{goal && !validGoal ? "Enter a goal of $1 or more." : recurring ? "The stages add up to the goal, so it is fixed after launch." : "You can change the goal after launch."}</small>
        <label>Cause type</label>
        <div className={styles.causeTypes} role="radiogroup" aria-label="Cause type">
          <button type="button" role="radio" aria-checked={!recurring} className={styles.causeType} onClick={() => setRecurring(false)}><span><strong>One time</strong><small>A single need, like a surgery.</small></span><i /></button>
          <button type="button" role="radio" aria-checked={recurring} className={styles.causeType} onClick={() => { setRecurring(true); setStages(current => current.length ? current : blankStages()); }}><span><strong>Recurring</strong><small>A need that comes back, like dialysis.</small></span><i /></button>
        </div>
        {recurring && <div className={styles.stages}>
          <strong className={styles.stagesTitle}>Planned payout stages · local preview</strong>
          <p className={styles.recurringNotice} role="note">{RECURRING_CAMPAIGN_PREVIEW_NOTICE}</p>
          <p className={styles.hint}>Set example amounts and target dates. This schedule does not create payouts.</p>
          <div className={styles.stageList} role="group" aria-label="Payout stages">
            {stages.map((stage, index) => {
              const previousDue = index > 0 ? stages[index - 1].dueDate : "";
              const minDue = previousDue && previousDue > dateInDays(1) ? previousDue : dateInDays(1);
              const amountText = stage.amountText ?? (stage.amountCents === null ? "" : String(stage.amountCents / 100));
              const badTitle = stage.title.trim().length < 2;
              const badAmount = stage.amountCents === null || stage.amountCents < 100;
              const badDate = !stage.dueDate || stage.dueDate <= dateInDays(0) || !!previousDue && stage.dueDate < previousDue;
              return <fieldset className={styles.stageBlock} key={index}>
                <legend className={styles.srOnly}>Stage {index + 1}</legend>
                <div className={styles.stageHeading}><strong>Stage {index + 1}</strong>{stages.length > STAGES_MIN && <button type="button" onClick={() => setStages(current => current.filter((_, at) => at !== index))}>Remove</button>}</div>
                <label htmlFor={`stage-title-${index}`}>Title</label>
                <input id={`stage-title-${index}`} maxLength={STAGE_TITLE_MAX} value={stage.title} placeholder="What this stage pays for" onChange={event => updateStage(index, { title: event.target.value })} />
                {badTitle && stage.title.length > 0 && <small className={styles.error}>Use at least 2 characters.</small>}
                <div className={styles.stageFields}>
                  <div><label htmlFor={`stage-amount-${index}`}>Amount · USD</label><input id={`stage-amount-${index}`} inputMode="decimal" autoComplete="off" placeholder="0" value={amountText} aria-invalid={badAmount || undefined} onChange={event => {
                    const text = event.target.value;
                    if (!/^\d*\.?\d{0,2}$/.test(text)) return;
                    updateStage(index, { amountText: text, amountCents: text && Number.isFinite(Number(text)) ? Math.round(Number(text) * 100) : null });
                  }} />{badAmount && amountText && <small className={styles.error}>Enter $1 or more.</small>}</div>
                  <div><label htmlFor={`stage-due-${index}`}>Due date</label><DatePicker id={`stage-due-${index}`} min={minDue} max={dateInDays(730)} value={stage.dueDate} onChange={dueDate => updateStage(index, { dueDate })} />{badDate && stage.dueDate && <small className={styles.error}>{stage.dueDate < (previousDue || dateInDays(1)) ? `Stage ${index + 1} is due before stage ${index}.` : "Pick a day after today."}</small>}</div>
                </div>
              </fieldset>;
            })}
          </div>
          {stages.length < STAGES_MAX ? <button className={styles.addStage} type="button" onClick={() => setStages(current => [...current, { title: "", amountCents: null, dueDate: "" }])}><Plus size={18} aria-hidden="true" />Add stage</button> : <small className={styles.hint}>{STAGES_MAX} stages at most.</small>}
          <p className={`${styles.stageSummary} ${stageFieldsFilled && stagesTotal !== targetCents ? styles.error : ""}`} role="status">{stageSummary}</p>
        </div>}
        <div className={styles.dateGrid}><div><label htmlFor="cause-end">Funding ends on</label><DatePicker id="cause-end" min={dateInDays(1)} max={dateInDays(365)} value={endDate} onChange={setEndDate} /></div><div><label htmlFor="cause-time">At</label><TimePicker id="cause-time" value={endTime} onChange={setEndTime} /></div></div>
        <small>{Math.max(1, Math.ceil((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${dateInDays(0)}T00:00:00`).getTime()) / 86_400_000))} days from today.</small>
        <div className={styles.feeHeader}>
          <label htmlFor="cause-fee">{recurring ? "Prototype organizer fee" : "Organizer fee"}</label>
          <button className={styles.feeInfo} type="button" aria-label="What is the organizer fee?" aria-haspopup="dialog" onClick={() => setFeeInfoOpen(true)}><Info size={16} weight="fill" aria-hidden="true" /></button>
          <strong>{fee}%</strong>
        </div>
        <input id="cause-fee" className={styles.range} type="range" min="0" max="5" step="0.5" value={fee} onChange={event => setFee(Number(event.target.value))} />
        <div className={styles.rangeLabels}><span>0%</span><span>5%</span></div>
        <div className={styles.feeBox}><strong>{recurring ? "Illustrative split · not D4 terms" : "If the goal is reached"}</strong><div><span>Donors give</span><b>{money(rawGoal)}</b></div><div><span>{recurring ? "Example organizer fee" : "Your organizer fee"} · {fee}%</span><b>{money(organizerFee)}</b></div><div><span>{recurring ? "Example platform and Vault amount" : "Salapi 1% and Disaster Vault 1%"}</span><b>{money(platformAndVault)}</b></div><div className={styles.total}><span>{recurring ? "Illustrative amount to the cause" : "The cause receives"}</span><b>{money(receives)}</b></div></div>
        <p className={styles.hint}>You set the fee, from 0 to 5%. It comes out of each donation and donors see it before they give.</p>
        {recurring && <p className={styles.recurringNotice} role="note">{RECURRING_CAMPAIGN_FEE_PREVIEW_NOTICE}</p>}
        <p className={styles.soft}>{recurring ? "The schedule stays in this browser preview; no Testnet or production payout is created." : "Active D4 campaigns use one proof reviewed by two of three configured wallets, then a single release."}</p>
      </section>}

      {step === 5 && <>
        <p className={styles.reviewEyebrow}>Preview · how donors will see it</p>
        <section className={styles.reviewCard}>
          <div className={styles.cover}>{effectiveMainPhotoIndex >= 0 ? <img src={photos[effectiveMainPhotoIndex].url} alt="" /> : <span>No photo yet</span>}<span className={styles.category}>{category}</span></div>
          <div className={styles.reviewBody}><h1>{title || "Your cause title"}</h1><p className={styles.organizer}>◉　@{payout || "Organizer"} <span>Not verified</span></p><strong>$0.00 <small>raised of {money(rawGoal)}</small></strong><div className={styles.emptyProgress} /><small>No donors yet · {Math.max(0, Math.ceil((new Date(`${endDate}T23:59:59`).getTime() - Date.now()) / 86_400_000))} days left</small><p>{story}</p><small>For {[beneficiaryName, beneficiaryKind].filter(Boolean).join(" · ")}</small></div>
        </section>
        <section className={styles.card}>
          <h1>Check before you launch.</h1>
          {[["Title", title, 1], ["Beneficiary", beneficiaryName || "Not set", 2], ["Location", location || "Not set", 2], ["Receives", `@${payout || "Not set"}`, 2], ["Photos", `${photos.length} ${photos.length === 1 ? "file" : "files"}`, 3], ["Target", money(rawGoal), 4], ["Cause type", recurring ? `Recurring · ${stages.length} stages` : "One time", 4], ["Ends", `${new Date(`${endDate}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, ${endTime}`, 4], ["Organizer fee", `${fee}%`, 4]].map(([label, value, at]) => <div key={String(label)} className={styles.reviewRow}><span>{label}</span><strong>{value}</strong><button type="button" aria-label={`Edit ${String(label).toLowerCase()}`} onClick={() => setStep(Number(at))}>Edit</button></div>)}
        </section>
        {recurring && <section className={styles.card}><div className={styles.stagesReviewHead}><h1>Schedule example</h1><button type="button" aria-label="Edit payout stages" onClick={() => setStep(4)}>Edit</button></div><p className={styles.recurringNotice} role="note">{RECURRING_CAMPAIGN_PREVIEW_NOTICE}</p><p className={styles.recurringNotice} role="note">{RECURRING_CAMPAIGN_FEE_PREVIEW_NOTICE}</p><ol className={styles.reviewStages}>{stages.map((stage, index) => <li className={styles.reviewStage} key={index}><span><span><strong>{stage.title.trim() || `Stage ${index + 1}`}</strong><small>Planned · due {stage.dueDate ? stageDate(stage.dueDate) : "No date set"}</small></span></span><b>{stage.amountCents === null ? "Not set" : moneyCents(stage.amountCents)}</b></li>)}</ol></section>}
      </>}

      {step === 1 && <div className={styles.powered}><PoweredByStellar /></div>}
    </> : <section className={styles.finished}>
      <span className={styles.check}>✓</span><h1>{recurring ? "Your schedule example is saved" : "Your cause is ready to launch"}</h1><p>Saved in this browser&apos;s local preview. It has not been published and no transaction was sent.</p>
      <div className={styles.finishCard}><strong>{title}</strong><span>{category} · Goal {money(rawGoal)}</span><p>{story}</p></div>
      <Btn onClick={() => router.push(createdId ? `/cause/${createdId}` : "/manage")}>View local cause</Btn>
      <button type="button" onClick={() => { setDone(false); setStep(1); }}>Edit cause</button>
    </section>}

    {frame && !done && createPortal(<div className={styles.cta}>
      {step < 5 ? <Btn trailing={Ico.chev({ c: "#fff" })} disabled={!canContinue} onClick={next}>Continue</Btn>
        : <Btn disabled={!validGoal || !beneficiaryName.trim() || recurring && !stagesComplete} onClick={() => setReviewOpen(true)}>Launch cause</Btn>}
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
