"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookmarkSimple, Check, DotsThree, Flag, Info, Plus, ShareNetwork, Star, UserCircle, X } from "@phosphor-icons/react";
import { localPreviewCauses, type LocalPreviewCause } from "@/lib/local-preview";
import { useGoBack } from "@/lib/ui/useGoBack";
import { PROTOTYPE_CAUSES, type PrototypeCause } from "@/lib/prototype-causes";
import styles from "./PrototypeCauseDetailScreen.module.css";

const SAVED_KEY = "salapi.local-preview.prototype-causes.v1";
const XLM_PER_USD = 8.92307692;
const money = (cents: number) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const xlm = (cents: number) => ((cents / 100) * XLM_PER_USD).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const proofStamp = (day: string, time: string) => `${/^today$/i.test(day) ? new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : /\d{4}/.test(day) ? day : `${day} 2026`}, ${time}`;

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

export default function PrototypeCauseDetailScreen({ id, initialTab = "Story", initialReport = false }: { id: string; initialTab?: "Story" | "Activity" | "Proof" | "Reviews"; initialReport?: boolean }) {
  const sampleCause = PROTOTYPE_CAUSES.find(item => item.id === id);
  const [createdCause, setCreatedCause] = useState<LocalPreviewCause | null>(null);
  const cause: PrototypeCause | undefined = sampleCause ?? (createdCause ? {
    id: createdCause.id, title: createdCause.title, category: createdCause.category,
    organizer: "@you", place: createdCause.location, story: createdCause.story,
    image: createdCause.coverDataUrl, photos: createdCause.coverDataUrl ? [createdCause.coverDataUrl] : [],
    raised: 0, target: createdCause.targetCents, donors: 0,
    organizerFeeBps: createdCause.organizerFeePercent * 100,
    recurring: createdCause.recurring, stages: createdCause.stages?.map(stage => ({ title: stage.title, amountCents: stage.amountCents, dueDate: stage.dueDate, status: "Waiting" as const })),
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
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingText, setRatingText] = useState("");
  const [proofInfo, setProofInfo] = useState<"confirmed" | "escrow" | null>(null);
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

  const canRate = id === "santos-roof" && !!cause && (cause.status !== "Funding" && cause.status !== "Paused" || cause.raised >= cause.target);
  useEffect(() => {
    if (!canRate || initialReport) return;
    const timer = window.setTimeout(() => setRatingOpen(true), 600);
    return () => window.clearTimeout(timer);
  }, [canRate, initialReport]);

  const sampleDonors = useMemo(() => [
    { name: "@jamal_r", time: "Today · 9:41", amount: 25, note: "Stay strong. We are with you." },
    { name: "@ana.reyes", time: "Today · 8:12", amount: 5 },
    { name: "Anonymous", time: "Yesterday · 16:20", amount: 12 },
    { name: "@mika_t", time: "Yesterday · 11:05", amount: 50, note: "From the whole office." },
  ], []);

  if (!cause) return <div className={styles.missing}><h1>Cause not found</h1><Link href="/causes">Browse causes</Link></div>;
  const days = cause.closedOn ? `Closed ${cause.closedOn}` : cause.daysLeft === undefined ? "" : cause.daysLeft === 0 ? "Last day" : `${cause.daysLeft} days left`;
  const progress = cause.target ? Math.round((cause.raised / cause.target) * 10000) / 100 : 0;
  const stageCount = cause.stages?.length ?? 0;
  const paidStages = cause.stages?.filter(stage => stage.status === "Paid").length ?? 0;
  const currentStageIndex = cause.stages?.findIndex(stage => stage.status !== "Paid") ?? -1;
  const reviews = cause.reviews ?? (cause.status === "Released" ? [
    { by: "@jamal_r", stars: 5, text: "The receipts match what was promised." },
    { by: "@ana.reyes", stars: 5, text: "Photos every week. Clear." },
    { by: "@mika_t", stars: 4, text: "Delivered, a few days late." },
  ] : cause.status === "In review" ? [
    { by: "@jamal_r", stars: 5, text: "The receipts match what was promised." },
    { by: "@ana.reyes", stars: 5, text: "Photos every week. Clear." },
  ] : []);
  const ratings = reviews.map(review => review.stars);
  const ratingAverage = reviews.length ? (reviews.reduce((sum, review) => sum + review.stars, 0) / reviews.length).toFixed(1) : "";
  const proofDay = cause.proofOn ?? cause.closedOn ?? "Today";
  const proofSteps = cause.stages?.length ? [
    ...cause.stages.flatMap((stage, index) => stage.status === "Paid" ? [{
      title: `Stage ${index + 1} paid · ${stage.title}`,
      when: proofStamp(stage.paidOn ?? "Today", "19:10"),
      text: `${stage.proofNote ?? "The organizer sent receipts and photos of the delivery."} ${money(stage.paidCents ?? stage.amountCents)} released to ${cause.organizer}.`,
      photos: [] as string[],
    }] : []),
    ...(cause.status === "In review" && currentStageIndex >= 0 ? [{
      title: `Stage ${currentStageIndex + 1} · Proof uploaded`, when: proofStamp(proofDay, "14:05"),
      text: cause.stages[currentStageIndex].proofNote ?? cause.proofNote ?? "The organizer sent receipts and photos of the delivery.", photos: [] as string[],
    }, ...(ratings.length ? [{
      title: `Stage ${currentStageIndex + 1} · Rated by donors`, when: proofStamp(proofDay, "18:30"),
      text: `${ratingAverage} out of 5 from ${ratings.length} donors. 3 are needed.`, photos: [] as string[],
    }] : [])] : []),
  ] : cause.status === "In review" || cause.status === "Released" ? [
    { title: "Proof uploaded", when: proofStamp(proofDay, "14:05"), text: cause.proofNote ?? "The organizer sent receipts and photos of the delivery.", photos: cause.photos?.slice(1, 4) ?? [] },
    ...(ratings.length ? [{ title: "Rated by donors", when: proofStamp(proofDay, "18:30"), text: `${ratingAverage} out of 5 from ${ratings.length} ${ratings.length === 1 ? "donor" : "donors"}. 3 are needed.`, photos: [] as string[] }] : []),
    ...(cause.releasedCents ? [{ title: "Funds released", when: proofStamp(proofDay, "19:10"), text: `${money(cause.releasedCents)} released to ${cause.organizer}.`, photos: [] as string[] }] : []),
  ] : [];
  const statusCopy = stageCount > 0
    ? cause.status === "Funding" ? `Paid out in ${stageCount} stages, each after donors rate its proof.`
      : cause.status === "In review" ? `${paidStages} of ${stageCount} stages paid. The organizer sent proof for stage ${currentStageIndex + 1}. Donors are rating it.`
        : cause.status === "Released" ? `${money(cause.releasedCents ?? cause.raised)} was released in ${paidStages} stages, each after donors rated its proof.`
          : `${paidStages} of ${stageCount} stages paid. Funds stay in escrow until donors rate proof for stage ${Math.max(1, currentStageIndex + 1)}.`
    : cause.status === "Awaiting proof" ? "The organizer has not submitted proof yet." : cause.status === "In review" ? "Donors are reviewing the submitted proof." : "The campaign funds have been released.";
  const stageDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(Number(value.slice(0, 4)) !== new Date().getFullYear() ? { year: "numeric" } : {}) });
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
          {canRate && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setRatingOpen(true); }}><Star size={18} />Rate this cause</button>}
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
        {cause.stages?.length && cause.status === "Funding" ? <p className={styles.stageFundingNote}>{statusCopy}</p> : null}
        {cause.status !== "Funding" && cause.status !== "Paused" ? <div className={styles.statusLine}><StatusPill cause={cause} /><span>{statusCopy}</span></div> : null}
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
        <div className={styles.proofStats}>
          {[{ label: "Confirmed contributions", cents: cause.raised, kind: "confirmed" as const }, { label: "Held in escrow", cents: cause.escrowCents ?? (cause.status === "Released" ? 0 : cause.raised), kind: "escrow" as const }].map(item => <div className={styles.proofStat} key={item.kind}>
            <p className={styles.proofStatLabel}>{item.label}<button type="button" aria-label={item.kind === "escrow" ? "What is escrow?" : "What is a confirmed contribution?"} onClick={() => setProofInfo(item.kind)}><Info size={15} weight="fill" /></button></p>
            <strong>≈ {money(item.cents)} <small>USDC</small></strong>
            <span>{xlm(item.cents)} XLM</span>
            {cause.raised > 0 && item.kind === "confirmed" && <em>Organizer fee ({(cause.organizerFeeBps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%) · ${money(Math.round((item.cents * cause.organizerFeeBps) / 10_000))}</em>}
            {cause.raised > 0 && item.kind === "escrow" && <em>{Math.round((item.cents / cause.raised) * 100)}% of what was raised</em>}
          </div>)}
        </div>
        {cause.raised + (cause.escrowCents ?? (cause.status === "Released" ? 0 : cause.raised)) > 0 && <p className={styles.priceNote}>USDC at the last known price.</p>}
      </section>}

      {tab === "Proof" && cause.stages?.length ? <section className={styles.proof}>
        <h2>Payout stages</h2>
        <p className={styles.stageIntro}>Funds leave escrow one stage at a time, each after donors rate its proof.</p>
        <ol className={styles.stageProofList}>{cause.stages.map((stage, index) => {
          const isPaid = stage.status === "Paid";
          const sub = isPaid ? `${money(stage.paidCents ?? stage.amountCents)} · Paid ${stage.paidOn ?? "today"}` : `${money(stage.amountCents)} · Due ${stageDate(stage.dueDate)}`;
          return <li className={styles.stageProofRow} key={stage.title} data-complete={isPaid || undefined} data-current={stage.status === "In review" || undefined}>
            <span className={styles.stageNumber}>{index + 1}</span>
            <span className={styles.stageProofCopy}><span className={styles.stageProofTop}><strong>{stage.title}</strong><em data-status={stage.status.toLowerCase().replace(" ", "-")}>{stage.status}</em></span><small>{sub}</small>{stage.status === "In review" && <small>Donors are rating the proof: 2 of 3.</small>}</span>
          </li>;
        })}</ol>
      </section> : null}

      {tab === "Proof" && !cause.stages?.length ? <section className={styles.proof}>
        <h2>Payout steps</h2><p className={styles.stageIntro}>Funds stay in escrow until every step is done.</p>
        <ol className={styles.payoutStepList}>{["Funding", "Proof uploaded", "Donor ratings", "Funds released"].map((step, index) => {
          const complete = index === 0 ? cause.status !== "Funding" : index === 1 ? ["In review", "Awaiting proof", "Released"].includes(cause.status) : index === 2 ? ["In review", "Released"].includes(cause.status) : cause.status === "Released";
          const state = index === 0 ? cause.status === "Funding" ? "Ongoing" : "Closed" : index === 1 ? cause.status === "Awaiting proof" ? "Waiting" : complete ? "Done" : "Waiting" : index === 2 ? cause.status === "In review" ? "In review" : complete ? "Done" : "Waiting" : complete ? "Done" : "Waiting";
          return <li key={step} data-complete={complete || undefined}><span className={styles.payoutStepName}><i>{index + 1}</i>{step}</span><small>{state}</small></li>;
        })}</ol>
      </section> : null}

      {tab === "Proof" ? <section className={styles.proof}>
        <header className={styles.proofTimelineHead}><h2>Proof of delivery</h2>{ratings.length > 0 && <span><Star size={15} weight="fill" />{ratingAverage}</span>}</header>
        {!proofSteps.length ? <p className={styles.emptyProof}>{cause.stages?.length ? "No proof yet. The organizer sends proof for each stage, starting after the goal is reached or the deadline passes." : "No proof yet. The organizer sends it after the goal is reached or the deadline passes."}</p> : <ol className={styles.timeline}>{proofSteps.map(step => <li key={step.title}>
          <strong>{step.title}</strong><small>{step.when}</small><p>{step.text}</p>
          {step.photos.length > 0 && <div className={styles.proofPhotos}>{step.photos.map(photo => <Image key={photo} src={photo} width={88} height={88} alt="Proof photo" />)}</div>}
        </li>)}</ol>}
      </section> : null}

      {tab === "Reviews" && <section className={styles.activity}>
        <div className={styles.reviewHeader}><h2>Donor reviews{reviews.length ? ` · ${reviews.length}` : ""}</h2>{reviews.length > 0 && <span>★ {ratingAverage}</span>}</div>
        {reviews.length === 0 ? <p className={styles.emptyProof}>No reviews yet. Donors who gave can rate the cause now that it is finished.</p> : reviews.map(review => <article className={styles.review} key={review.by}><strong>{review.by}<span>★ {review.stars}</span></strong><p>{review.text}</p></article>)}
        {canRate && <button className={styles.rateButton} type="button" onClick={() => setRatingOpen(true)}><Star size={18} weight="fill" />Rate this cause</button>}
      </section>}

      <p className={styles.powered}>Powered by <Image src="/stellar.png" width={63} height={18} alt="Stellar" /></p>
    </div>

    {layer ? createPortal(<div className={styles.actionBar}>
      <button type="button" className={styles.saveButton} aria-label={saved ? "Remove from saved causes" : "Save this cause"} aria-pressed={saved} onClick={toggleSaved}><BookmarkSimple size={20} weight={saved ? "fill" : "regular"} /></button>
      <button type="button" className={styles.shareButton} onClick={() => void share()}>{copied ? "Copied" : "Share"}</button>
      {!finished && <Link href={`/donate/${id}`} className={styles.donateButton} aria-disabled={cause.status === "Paused" || undefined} onClick={cause.status === "Paused" ? event => event.preventDefault() : undefined}>Donate <span>›</span></Link>}
      {cause.status === "Paused" && <p>Donations are paused.</p>}
    </div>, layer) : null}

    {proofInfo && layer ? createPortal(<div className={styles.proofInfoBackdrop} role="presentation" onClick={event => { if (event.target === event.currentTarget) setProofInfo(null); }}>
      <section className={styles.proofInfoSheet} role="dialog" aria-modal="true" aria-labelledby="proof-info-title"><div className={styles.proofInfoHandle} /><header><h2 id="proof-info-title">{proofInfo === "escrow" ? "Held in escrow" : "Confirmed contributions"}</h2><button type="button" aria-label="Close" onClick={() => setProofInfo(null)}><X size={18} /></button></header>
        <p>{proofInfo === "escrow" ? "Donations are not paid to the organizer at once. They wait in escrow on Stellar until the organizer uploads proof of delivery and donors rate it. The percentage is the part of everything raised that is still waiting." : "Every donation that has settled on Stellar. A donation still on its way is not counted yet. The organizer fee under it is the part the organizer keeps for running the cause, at the rate donors saw before they gave."}</p>
        <button type="button" onClick={() => setProofInfo(null)}>Got it</button>
      </section>
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
          <strong className={styles.reportLabel}>Reason <span>*</span></strong>
          <div className={styles.reasons} role="radiogroup" aria-label="Reason">
            {["Fraud", "Scam", "Misleading story", "Money not used as promised", "Something else"].map(reason => <button type="button" role="radio" aria-checked={reportReason === reason} key={reason} onClick={() => setReportReason(reason)}>{reason}<span /></button>)}
          </div>
          <label className={styles.reportLabel} htmlFor="prototype-report-text">What happened? <span>*</span></label>
          <textarea id="prototype-report-text" maxLength={500} placeholder="Tell us what you saw" value={reportText} onChange={event => setReportText(event.target.value)} />
          <label className={styles.reportLabel} htmlFor="prototype-report-files">Photos · {reportFiles.length} of 5 <span>*</span></label>
          <div className={styles.reportMedia} role="group" aria-label="Photos for the report">{reportFiles.map((name, index) => <div key={`${name}-${index}`} className={styles.reportPhoto}>{name}<button type="button" aria-label={`Remove ${name}`} onClick={() => setReportFiles(files => files.filter((_, at) => at !== index))}>×</button></div>)}{reportFiles.length < 5 && <button className={styles.reportAdd} type="button" onClick={() => document.getElementById("prototype-report-files")?.click()}><Plus size={18} /><span>Photo</span></button>}</div>
          <input className={styles.reportFileInput} id="prototype-report-files" type="file" accept="image/*" multiple onChange={event => { setReportFiles(current => [...current, ...Array.from(event.target.files ?? []).map(file => file.name)].slice(0, 5)); event.currentTarget.value = ""; }} />
          <button className={styles.reportPrimary} type="button" disabled={!reportReason || !reportText.trim() || reportFiles.length === 0} onClick={() => setReportSent(true)}>Send report</button>
        </>}
      </section>
    </div>, layer) : null}

    {ratingOpen && layer ? createPortal(<div className={styles.reportBackdrop} role="presentation" onClick={event => { if (event.target === event.currentTarget) setRatingOpen(false); }}>
      <section className={styles.reportSheet} role="dialog" aria-modal="true" aria-labelledby="prototype-rating-title">
        <div className={styles.reportHandle} /><header><h2 id="prototype-rating-title">How did this cause do?</h2><button type="button" aria-label="Close" onClick={() => setRatingOpen(false)}><X size={18} /></button></header>
        {!!proofSteps.length && <div className={styles.ratingTimeline} aria-label="Proof of delivery"><ol>{proofSteps.map(step => <li key={step.title}><small>{step.when}</small><strong>{step.title}</strong>{step.photos.length ? <div>{step.photos.map(photo => <Image key={photo} src={photo} width={88} height={72} alt="Proof photo" />)}</div> : <p>{step.text}</p>}</li>)}</ol></div>}
        <p className={styles.reportSubject}>{cause.title}</p><p>You gave to {cause.shortTitle ?? cause.title}. It has finished. Your rating helps release the funds.</p>
        <div className={styles.ratingStars} role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map(value => <button key={value} type="button" role="radio" aria-label={`${value} of 5`} aria-checked={ratingStars === value} data-on={value <= ratingStars} onClick={() => setRatingStars(value)}><Star size={30} weight="fill" /></button>)}</div>
        <p className={styles.ratingWord}>{["", "Poor", "Below what was promised", "Fine", "Good", "Delivered as promised"][ratingStars]}</p>
        <textarea aria-label="Tell other donors more" maxLength={280} placeholder="Tell other donors more (optional)" value={ratingText} onChange={event => setRatingText(event.target.value)} />
        <button className={styles.reportPrimary} type="button" onClick={() => { setRatingOpen(false); setTab("Proof"); }}>Send rating</button><button className={styles.reportSecondary} type="button" onClick={() => setRatingOpen(false)}>Not now</button>
      </section>
    </div>, layer) : null}
  </>;
}
