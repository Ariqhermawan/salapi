"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookmarkSimple, Check, DotsThree, Flag, ShareNetwork, UserCircle, X } from "@phosphor-icons/react";
import { localPreviewCauses, type LocalPreviewCause } from "@/lib/local-preview";
import { useGoBack } from "@/lib/ui/useGoBack";
import { PROTOTYPE_CAUSES, type PrototypeCause } from "@/lib/prototype-causes";
import styles from "./PrototypeCauseDetailScreen.module.css";

const SAVED_KEY = "salapi.local-preview.prototype-causes.v1";
const money = (cents: number) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function CausePill({ name }: { name: string }) {
  return <span className={styles.category} data-category={name.toLowerCase().replace(/[^a-z]+/g, "-")}>
    {name}
  </span>;
}

function StatusPill({ cause }: { cause: PrototypeCause }) {
  const tone = cause.status === "Funding" ? "funding" : cause.status === "Released" ? "success"
    : cause.status === "In review" ? "review" : cause.status === "Awaiting proof" ? "waiting" : "paused";
  return <span className={`${styles.status} ${styles[`status_${tone}`]}`}>{cause.status}</span>;
}

function Progress({ cause }: { cause: PrototypeCause }) {
  const percent = cause.target > 0 ? Math.round((cause.raised / cause.target) * 10000) / 100 : 0;
  return <span className={styles.progress} role="img" aria-label={`${percent}% of goal`}>
    <span style={{ width: `${Math.min(percent, 100)}%` }} />
  </span>;
}

export default function PrototypeCauseDetailScreen({ id, initialTab = "Story", initialReport = false }: { id: string; initialTab?: "Story" | "Reviews"; initialReport?: boolean }) {
  const sampleCause = PROTOTYPE_CAUSES.find(item => item.id === id);
  const [createdCause, setCreatedCause] = useState<LocalPreviewCause | null>(null);
  const cause = sampleCause ?? (createdCause ? {
    id: createdCause.id, title: createdCause.title, category: createdCause.category,
    organizer: "@you", place: createdCause.location, story: createdCause.story,
    image: createdCause.coverDataUrl, photos: createdCause.coverDataUrl ? [createdCause.coverDataUrl] : [],
    raised: 0, target: createdCause.targetCents, donors: 0,
    organizerFeeBps: createdCause.organizerFeePercent * 100,
    daysLeft: Math.max(0, Math.ceil((new Date(`${createdCause.endDate}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000)),
    status: "Funding" as const,
  } : undefined);
  const router = useRouter();
  const back = useGoBack("/causes");
  const [tab, setTab] = useState<"Story" | "Activity" | "Proof" | "Reviews">(initialTab);
  const [more, setMore] = useState(false);
  const [image, setImage] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reporting, setReporting] = useState(initialReport);
  const [reportReason, setReportReason] = useState("");
  const [reportText, setReportText] = useState("");
  const [reportFiles, setReportFiles] = useState<string[]>([]);
  const [reportSent, setReportSent] = useState(false);
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const photos = cause?.photos ?? (cause?.image ? [cause.image] : []);
  const thumbnails = cause?.image ? photos.slice(1) : photos;
  const finished = !!cause && (cause.status !== "Funding" && cause.status !== "Paused" || cause.raised >= cause.target);
  const categories = cause ? [cause.category, ...(cause.alsoIn ?? [])] : [];

  useEffect(() => {
    setLayer(document.querySelector<HTMLElement>(".sl-app-frame"));
    if (/^local-[0-9a-z-]+$/.test(id)) setCreatedCause(localPreviewCauses().find(item => item.id === id) ?? null);
    try {
      const ids: unknown = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
      setSaved(Array.isArray(ids) && ids.includes(id));
    } catch { setSaved(false); }
  }, [id]);

  const sampleDonors = useMemo(() => [
    { name: "@jamal_r", time: "Today · 9:41", amount: 25, note: "Stay strong. We are with you." },
    { name: "@ana.reyes", time: "Today · 8:12", amount: 5 },
    { name: "Anonymous", time: "Yesterday · 16:20", amount: 12 },
    { name: "@mika_t", time: "Yesterday · 11:05", amount: 50, note: "From the whole office." },
  ], []);

  if (!cause) return <div className={styles.missing}><h1>Cause not found</h1><Link href="/causes">Browse causes</Link></div>;
  const days = cause.daysLeft === undefined ? "" : cause.daysLeft === 0 ? "Last day" : `${cause.daysLeft} days left`;
  const progress = cause.target ? Math.round((cause.raised / cause.target) * 10000) / 100 : 0;
  const tabs: ("Story" | "Activity" | "Proof" | "Reviews")[] = ["Story", "Activity", "Proof", ...(finished ? ["Reviews" as const] : [])];
  const savedIds = () => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
      return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
    } catch { return []; }
  };
  const toggleSaved = () => {
    const current = savedIds();
    const next = current.includes(id) ? current.filter(value => value !== id) : [id, ...current];
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); setSaved(next.includes(id)); } catch { /* local-only saved state */ }
  };
  const share = async () => {
    const url = `${window.location.origin}/cause/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: cause.title, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    } catch { /* Share sheet dismissed. */ }
  };
  const closeReport = () => {
    setReporting(false);
    if (initialReport) router.replace(`/cause/${id}`);
  };

  return <>
    <div className={styles.screen}>
      <div className={styles.hero}>
        {cause.image ? <Image src={cause.image} fill priority sizes="100vw" alt="" unoptimized={cause.id.startsWith("local-")} /> : <div className={styles.emptyImage} />}
        {cause.image && <button type="button" className={styles.heroHitArea} aria-label={`Open photos, ${photos.length} in total`} onClick={() => setImage(0)} />}
        <div className={styles.heroCategories}>{categories.map(name => <CausePill name={name} key={name} />)}</div>
        <button type="button" className={`${styles.glassButton} ${styles.heroBack}`} aria-label="Back" onClick={back}><ArrowLeft size={20} /></button>
        <button type="button" className={`${styles.glassButton} ${styles.heroOptions}`} aria-label="Cause options" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><DotsThree size={22} weight="bold" /></button>
        {menuOpen && <div className={styles.options} role="menu">
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void share(); }}><ShareNetwork size={18} />Share</button>
          <button type="button" role="menuitem" onClick={() => { toggleSaved(); setMenuOpen(false); }}><BookmarkSimple size={18} />{saved ? "Remove from saved" : "Save this cause"}</button>
          <Link role="menuitem" href={`/cause/${id}/report`} onClick={() => setMenuOpen(false)}><Flag size={18} />Report this cause</Link>
        </div>}
      </div>

      {thumbnails.length > 0 && <div className={styles.thumbs} aria-label="Cause photos">
        {thumbnails.map((photo, index) => <button type="button" key={photo} aria-label={`Open photo ${index + 2} of ${photos.length}`} onClick={() => setImage(index + 1)}>
          <Image src={photo} width={64} height={56} alt="" />
        </button>)}
      </div>}

      <h1 className={styles.title}>{cause.title}</h1>

      <Link href={`/organizer/${cause.organizer.replace(/^@/, "")}`} className={styles.organizer}>
        {cause.avatar ? <Image src={cause.avatar} width={40} height={40} alt="" /> : <UserCircle size={40} weight="light" aria-hidden="true" />}
        <span><strong>{cause.organizer}</strong><small>{cause.place}</small></span>
        {cause.verified && <span className={styles.verified}><Check size={12} weight="bold" />Verified</span>}
        <span className={styles.chevron}>›</span>
      </Link>

      <section className={styles.funding} aria-label="Cause funding">
        <div className={styles.amountLine}><span><strong>≈ {money(cause.raised)} USDC</strong> raised</span><span>of {money(cause.target)} USDC</span></div>
        <Progress cause={cause} />
        <p>{days && <span>{days}</span>}{days && cause.donors ? <span aria-hidden="true"> · </span> : null}{cause.donors > 0 ? <span>{cause.donors} donors</span> : <span>No donors yet</span>}</p>
        {cause.status !== "Funding" && cause.status !== "Paused" ? <div className={styles.statusLine}><StatusPill cause={cause} /><span>{cause.status === "Awaiting proof" ? "The organizer has not submitted proof yet." : cause.status === "In review" ? "Donors are reviewing the submitted proof." : "The campaign funds have been released."}</span></div> : null}
      </section>

      <div className={styles.tabs} role="tablist" aria-label="Cause details">
        {tabs.map(item => <button type="button" role="tab" key={item} aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>)}
      </div>

      {tab === "Story" && <section className={styles.story}>
        {cause.summary && <strong>{cause.summary}</strong>}
        <p>{cause.story || "This cause is raising support for a local community need."}{more && cause.more ? `${cause.more.includes("\n") ? "\n\n" : " "}${cause.more}` : ""}</p>
        {cause.more && <button type="button" onClick={() => setMore(value => !value)}>{more ? "Read less" : "Read more"}</button>}
      </section>}

      {tab === "Activity" && <section className={styles.activity}>
        <div className={styles.sectionTitle}><h2>Donor activity</h2><span>{cause.donors} contributions</span></div>
        {sampleDonors.map((donor, index) => <article key={`${donor.name}-${index}`} className={styles.donor}>
          <span className={styles.donorAvatar}>{donor.name === "Anonymous" ? <UserCircle size={22} /> : donor.name.slice(1, 2).toUpperCase()}</span>
          <span className={styles.donorInfo}><strong>{donor.name}</strong><small>{donor.time}</small>{donor.note && <small>“{donor.note}”</small>}</span>
          <b>≈ {money(donor.amount * 100)} USDC</b>
        </article>)}
        {cause.status === "Funding" && <div className={styles.updates}><h3>Organizer updates</h3><p>Session 4 is done</p><small>Thank you to everyone who gave. The next update will be posted here.</small></div>}
      </section>}

      {tab === "Proof" && <section className={styles.proof}>
        <h2>Where the funds stand</h2>
        <div className={styles.proofStats}><p><small>Confirmed contributions</small><strong>≈ {money(cause.raised)} USDC</strong></p><p><small>Held in escrow</small><strong>≈ {money(cause.status === "Released" ? 0 : cause.raised)} USDC</strong></p></div>
        <h3>Payout steps</h3>
        <ol>{["Funding", "Proof uploaded", "Donor ratings", "Funds released"].map((step, index) => <li key={step} data-complete={index === 0 && cause.status === "Funding" || index > 0 && cause.status === "Released" || index === 1 && ["In review", "Awaiting proof"].includes(cause.status) || index === 2 && cause.status === "In review" || undefined}><span>{step}</span><small>{index === 0 ? cause.status === "Funding" ? "Ongoing" : "Closed" : index === 1 ? cause.status === "Awaiting proof" ? "Waiting" : "Done" : index === 2 ? cause.status === "In review" ? "In review" : cause.status === "Released" ? "Done" : "Waiting" : cause.status === "Released" ? "Done" : "Waiting"}</small></li>)}</ol>
        <p className={styles.note}>Example cause details. This preview does not represent a verified Stellar transaction or payout.</p>
      </section>}

      {tab === "Reviews" && <section className={styles.activity}>
        <h2>What donors say</h2>
        {["The receipts match what was promised.", "Photos every week. Clear.", "Delivered, a few days late."].map((review, index) => <article className={styles.review} key={review}><span>{"★".repeat(index === 2 ? 4 : 5)}</span><p>{review}</p><small>{["@jamal_r", "@ana.reyes", "@mika_t"][index]}</small></article>)}
      </section>}

      <p className={styles.powered}>Powered by <Image src="/stellar.png" width={63} height={18} alt="Stellar" /></p>
    </div>

    {layer ? createPortal(<div className={styles.actionBar}>
      <button type="button" className={styles.saveButton} aria-label={saved ? "Remove from saved causes" : "Save this cause"} aria-pressed={saved} onClick={toggleSaved}><BookmarkSimple size={20} weight={saved ? "fill" : "regular"} /></button>
      <button type="button" className={styles.shareButton} onClick={() => void share()}>{copied ? "Copied" : "Share"}</button>
      {!finished && <Link href={`/donate/${id}`} className={styles.donateButton} aria-disabled={cause.status === "Paused" || undefined} onClick={cause.status === "Paused" ? event => event.preventDefault() : undefined}>Donate <span>›</span></Link>}
      {cause.status === "Paused" && <p>Donations are paused.</p>}
    </div>, layer) : null}

    {image !== null && <div className={styles.gallery} role="dialog" aria-modal="true" aria-label="Cause photos">
      <button type="button" className={styles.closeGallery} aria-label="Close photos" onClick={() => setImage(null)}><X size={22} /></button>
      {photos[image] && <Image src={photos[image]} fill sizes="100vw" alt="" />}
      <span className={styles.galleryCount}>{image + 1} / {photos.length}</span>
      {photos.length > 1 && <>
        <button type="button" className={styles.galleryPrev} aria-label="Previous photo" onClick={() => setImage((image + photos.length - 1) % photos.length)}>‹</button>
        <button type="button" className={styles.galleryNext} aria-label="Next photo" onClick={() => setImage((image + 1) % photos.length)}>›</button>
      </>}
    </div>}

    {reporting && layer ? createPortal(<div className={styles.reportBackdrop} role="presentation" onClick={event => { if (event.target === event.currentTarget) closeReport(); }}>
      <section className={styles.reportSheet} role="dialog" aria-modal="true" aria-labelledby="prototype-report-title">
        <div className={styles.reportHandle} />
        <header><h2 id="prototype-report-title">{reportSent ? "Report sent" : "Report this cause"}</h2><button type="button" aria-label="Close" onClick={closeReport}><X size={18} /></button></header>
        {reportSent ? <><p>We review every report. You can follow what happens to it in Notifications.</p><button className={styles.reportPrimary} type="button" onClick={() => { closeReport(); router.push("/notifications"); }}>Go to Notifications</button><button className={styles.reportSecondary} type="button" onClick={closeReport}>Done</button></> : <>
          <p className={styles.reportSubject}>{cause.title}</p><p>All fields are required. Add at least one photo.</p>
          <strong className={styles.reportLabel}>Reason</strong>
          <div className={styles.reasons} role="radiogroup" aria-label="Reason">
            {["Fraud", "Scam", "Misleading story", "Money not used as promised", "Something else"].map(reason => <button type="button" role="radio" aria-checked={reportReason === reason} key={reason} onClick={() => setReportReason(reason)}>{reason}<span /></button>)}
          </div>
          <label className={styles.reportLabel} htmlFor="prototype-report-text">What happened?</label>
          <textarea id="prototype-report-text" maxLength={500} placeholder="Tell us what you saw" value={reportText} onChange={event => setReportText(event.target.value)} />
          <label className={styles.reportLabel} htmlFor="prototype-report-files">Photos · {reportFiles.length} of 5</label>
          <input id="prototype-report-files" type="file" accept="image/*" multiple onChange={event => setReportFiles(current => [...current, ...Array.from(event.target.files ?? []).map(file => file.name)].slice(0, 5))} />
          <button className={styles.reportPrimary} type="button" disabled={!reportReason || !reportText.trim() || reportFiles.length === 0} onClick={() => setReportSent(true)}>Send report</button>
        </>}
      </section>
    </div>, layer) : null}
  </>;
}
