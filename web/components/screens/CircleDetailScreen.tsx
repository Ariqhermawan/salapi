"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useGoBack } from "@/lib/ui/useGoBack";
import { Ico, T, Progress, PoweredByStellar } from "@/components/ui/kit";
import OrganizerVerification from "@/components/ui/OrganizerVerification";
import ExampleOrganizerAvatar from "@/components/ui/ExampleOrganizerAvatar";
import CircleGallery from "@/components/CircleGallery";
import CircleDonorExamples from "@/components/CircleDonorExamples";
import { CURRENCY, formatLocal } from "@/lib/ui/currency";
import { useT } from "@/components/I18nProvider";
import { progressPct, type CircleCategory, type Circle, type CircleUpdate } from "@/lib/circles/types";
import { localePreviewSplit } from "@/lib/circles/allowance";
import { getOrganizerForCircle } from "@/lib/circles/organizers";
import { readLocalSupports, markCircleUpdatesSeen, unreadSupportUpdates, type LocalSupportRecord } from "@/lib/circles/local-support";
import type { Locale } from "@/lib/i18n/config";
import { isLocalPreview } from "@/lib/local-preview";
import styles from "./CirclesDetailRevamp.module.css";
import { circlesCopy } from "@/lib/i18n/revamp-circles";

const photos: Partial<Record<CircleCategory, string>> = {
  disaster: "/circles/disaster.jpg", medical: "/circles/medical.jpg", education: "/circles/education.jpg",
};
type Tab = "story" | "updates" | "proof";
const updateLabels = {
  milestone: "Example planning milestone", spend: "Example spending", delivery: "Example delivery",
} as const satisfies Record<CircleUpdate["kind"], string>;

function exampleDate(value: string, locale: Locale): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString({ en: "en-GB", tl: "fil-PH", id: "id-ID", vi: "vi-VN" }[locale], { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : value;
}

function supportTotals(records: LocalSupportRecord[]): string[] {
  const sums = new Map<Locale, bigint>();
  for (const record of records) sums.set(record.currency, (sums.get(record.currency) ?? 0n) + BigInt(record.totalMinor));
  return [...sums].map(([locale, total]) => {
    const meta = CURRENCY[locale];
    const scale = 10n ** BigInt(meta.dp);
    const whole = new Intl.NumberFormat(meta.intl).format(total / scale);
    const fraction = meta.dp ? "." + (total % scale).toString().padStart(meta.dp, "0") : "";
    return `${meta.symbol}${whole}${fraction} ${meta.code}`;
  });
}

function ExampleImage({ circle, src, className, priority = false }: {
  circle: Circle; src?: string; className?: string; priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const { locale } = useT();
  const c = circlesCopy(locale);
  const fallback = photos[circle.category] ?? "/illustrations/giving.png";
  const source = failed ? fallback : src ?? circle.coverImage ?? fallback;
  const alt = failed ? c("AI-generated fictional campaign illustration")
    : src ? circle.gallery?.find(photo => photo.src === src)?.alt ?? c("AI-generated fictional campaign illustration")
      : circle.imageAlt ?? c("AI-generated fictional campaign illustration");
  return <Image src={source} alt={alt} fill
    sizes="(max-width: 500px) 100vw, 500px" priority={priority}
    className={`${className ?? ""} ${source === "/illustrations/giving.png" ? styles.doodleCover : ""}`}
    onError={() => setFailed(true)} />;
}

export default function CircleDetailScreen({ circle, initialTab = "story" }: {
  circle: Circle; initialTab?: Tab;
}) {
  const goBack = useGoBack("/circles");
  const { currency, locale } = useT();
  const c = circlesCopy(locale);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [supports, setSupports] = useState<LocalSupportRecord[]>([]);
  const [seenNotice, setSeenNotice] = useState("");
  const organizer = getOrganizerForCircle(circle);
  const completed = circle.status === "completed";
  const allowance = circle.allowance?.percentage ?? 0;
  const split = localePreviewSplit(currency, allowance);
  const percent = progressPct(circle);
  const updates = circle.updates ?? [];
  const currentSupports = supports.filter(record => record.circleId === circle.id);
  const totals = supportTotals(currentSupports);
  const unseen = updates.filter(update => currentSupports.some(record => unreadSupportUpdates(record, [update]) > 0)).length;
  const tabs: { id: Tab; label: string }[] = [
    { id: "story", label: c("Story") }, { id: "updates", label: c("Updates") }, { id: "proof", label: c("Public proof") },
  ];

  useEffect(() => {
    // Read browser-only demo state after hydration. Viewing never writes seen IDs.
    const refresh = () => setSupports(readLocalSupports());
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener("focus", refresh);
    return () => { window.clearTimeout(timer); window.removeEventListener("focus", refresh); };
  }, [circle.id]);

  function selectTab(next: Tab) {
    setTab(next);
    window.requestAnimationFrame(() => document.getElementById("circle-details-tabs")?.scrollIntoView({ block: "start" }));
  }

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(tabs[next].id);
    document.getElementById(`circle-tab-${tabs[next].id}`)?.focus();
  }

  function markSeen() {
    const saved = markCircleUpdatesSeen(circle.id, updates.map(update => update.id));
    setSeenNotice(saved ? c("Example updates marked as seen on this browser. No notification or network write.") : c("Could not save seen state. Your local support has not changed."));
    if (saved) setSupports(readLocalSupports());
  }

  function organizerLink(compact = false) {
    return <Link className={`${styles.organizerProfile} ${compact ? styles.organizerFooter : ""}`}
      data-testid="circle-organizer-card" data-organizer-kind={organizer?.kind}
      href={`/circles/${circle.id}/organizer`} aria-label={c("View example organizer profile: {name}", { name: circle.organizer })}>
      <span className={styles.organizerAvatar}>
        {organizer ? <ExampleOrganizerAvatar organizer={organizer} size={compact ? 40 : 48} /> : <span aria-hidden="true">{Ico.user({ size: 22, c: T.action })}</span>}
      </span>
      <div className={styles.organizerIdentity}>
        <span className={styles.organizerLabel}>{compact ? c("View organizer") : c("Example organizer")}</span>
        <strong className={styles.organizerName}>{circle.organizer}</strong>
        <div className={styles.organizerMeta}>
          <span className={styles.organizerLocation}>{circle.organizerLocation}</span>
          {organizer && <OrganizerVerification kind={organizer.kind} compact />}
        </div>
      </div>
      <span className={styles.organizerChevron} aria-hidden="true">{Ico.chev({ size: 16, c: T.action })}</span>
    </Link>;
  }

  return <div className={styles.screen}>
    <div className={styles.top}>
      <button type="button" className={styles.back} onClick={goBack}>{Ico.back({ size: 18, c: T.action })}{" "}{c("Back")}</button>
      <span className={styles.badge}>{completed ? c("Example completed cause") : c("Prototype · example cause")}</span>
    </div>

    {tab === "story" ? <>
      <section className={styles.hero} aria-labelledby="circle-title">
        <CircleGallery key={circle.id} circle={circle} />
        <header className={styles.heroBody}>
          <span className={styles.eyebrow}>{completed ? c("Fictional completed history") : c("Circles concept")}</span>
          <h1 id="circle-title">{circle.title}</h1>
          {organizerLink()}
        </header>
      </section>
      <section className={styles.progressCard} aria-label={c("Illustrative progress")}>
        <div className={styles.metrics}>
          <div><small>{c("Example raised")}</small><strong>{formatLocal(circle.pesoRaised, currency)}</strong></div>
          <div><small>{c("Example goal")}</small><strong>{formatLocal(circle.pesoTarget, currency)}</strong></div>
          <div className={styles.percentage}><strong>{percent}%</strong><small>{c("of goal")}</small></div>
        </div>
        <div role="progressbar" aria-label={c("Example progress, not collected donations")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <Progress pct={percent} h={8} color={T.action} />
        </div>
        <div className={styles.feeLine}><span>{c("Proposed organizer allowance")}</span><strong>{allowance}%</strong></div>
        <p className={styles.progressNotice}><span aria-hidden="true">{Ico.bulb({ size: 16, c: T.slate })}</span>{c("Illustrative only. No real donations collected.")}</p>
      </section>
      <div className={styles.action}>
        <Link className={styles.primaryLink} href={completed ? `/circles/${circle.id}/organizer` : `/circles/${circle.id}/donate`}>
          <span aria-hidden="true">{completed ? Ico.user({ size: 20, c: "#fff" }) : Ico.plus({ size: 20, c: "#fff" })}</span>
          {completed ? c("View organizer") : c("Preview a pledge")}
        </Link>
        <p className={styles.actionNotice}>{completed ? c("Completed only in the fictional example. No pledge is available.") : isLocalPreview ? c("No payment. Confirm a browser-only donation demo.") : c("No payment. Optional launch notification only.")}
          {isLocalPreview && !completed && <span>{c("Saved only after your explicit local confirmation.")}</span>}
        </p>
      </div>
      <Link href="/campaigns?mode=testnet" className={styles.campaignLink}>
        <span className={styles.linkIcon} aria-hidden="true">{Ico.link({ size: 20, c: T.action })}</span>
        <div><strong>{isLocalPreview ? c("Explore D4 example campaigns") : c("Explore Testnet campaigns")}</strong>
          <span>{isLocalPreview ? c("Try the separate funding flow in local example mode.") : c("Separate D4 escrow and proof-approval flow on Stellar Testnet.")}</span></div>
        <span aria-hidden="true">{Ico.chev({ size: 18, c: T.slate })}</span>
      </Link>
    </> : <header className={styles.compactHero}>
      <h1>{circle.title}</h1><p>{c("Prototype · All updates, scenes and proof notes are fictional examples.")}</p>
    </header>}

    {currentSupports.length > 0 && <section className={styles.supportBanner} aria-label={c("Your local demo support")}>
      <div><strong>{c("Your local demo support")}</strong><p>{c(currentSupports.length === 1 ? "No money moved · {count} local confirmation" : "No money moved · {count} local confirmations", { count: currentSupports.length })}</p>
        {unseen > 0 && <span>{c(unseen === 1 ? "{count} unseen example update" : "{count} unseen example updates", { count: unseen })}</span>}</div>
      <div className={styles.supportAmounts}>{totals.map(total => <strong key={total}>{total}</strong>)}</div>
    </section>}

    <div id="circle-details-tabs" role="tablist" aria-label={c("Circle prototype details")} className={styles.tabs}>
      {tabs.map((item, index) => <button key={item.id} id={`circle-tab-${item.id}`} type="button" role="tab"
        aria-selected={tab === item.id} aria-controls={`circle-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1}
        className={styles.tab} onClick={() => selectTab(item.id)} onKeyDown={event => navigateTabs(event, index)}>
        {item.label}{item.id === "updates" && updates.length > 0 && <span className={styles.tabCount}>{updates.length}</span>}
      </button>)}
    </div>

    {tab === "story" && <section key="story" id="circle-panel-story" role="tabpanel" tabIndex={0} aria-labelledby="circle-tab-story" className={`${styles.panel} sl-state-enter`}>
      <div className={styles.storyHeading}><div><span className={styles.eyebrow}>{c("People helping people")}</span><h2>{c("About this example")}</h2></div>
        <Image src="/illustrations/giving.png" width={86} height={78} alt="" className={styles.storyDoodle} /></div>
      {circle.summary && <p className={styles.storySummary}>{circle.summary}</p>}
      {circle.story.split("\n\n").filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      {completed && circle.completedOn && <p className={styles.localNotice}>{c("Example completed date: {date}. This is a synthetic history entry, not verified delivery.", { date: exampleDate(circle.completedOn, locale) })}</p>}
      <p className={styles.hint}>{c("Demo verification, not an identity check. Names, goals, ratings, dates and scenes are fictional.")}</p>
    </section>}

    {tab === "story" && <CircleDonorExamples circle={circle} supports={currentSupports} />}

    {tab === "updates" && <section key="updates" id="circle-panel-updates" role="tabpanel" tabIndex={0} aria-labelledby="circle-tab-updates" className={`${styles.updatesPanel} sl-state-enter`}>
      <div className={styles.updatesHeading}><div><span className={styles.eyebrow}>{c("Example timeline")}</span><h2>{c("Follow the work")}</h2></div>
        {currentSupports.length > 0 && <button type="button" className={styles.markSeen} onClick={markSeen}>{c("Mark updates as seen")}</button>}</div>
      <p className={styles.timelineNotice}>{c("Synthetic updates and AI illustrations. No spending, donation or delivery is verified.")}</p>
      {seenNotice && <p className={styles.seenNotice} role="status">{seenNotice}</p>}
      {updates.length === 0 ? <div className={styles.panel}><h2>{c("No example updates yet")}</h2><p>{c("This cause has no seeded updates. No activity is being invented.")}</p></div> : <ol className={styles.timeline}>
        {updates.map(update => <li key={update.id} className={styles.timelineItem}>
          <div className={styles.updateDate}><time dateTime={update.date}>{exampleDate(update.date, locale)}</time></div>
          <article className={styles.updateBody}>
            <h3>{update.title}</h3><p className={styles.updateKind}>{c(updateLabels[update.kind])}{update.amountPHP !== undefined && ` · ${formatLocal(update.amountPHP, currency)}`}</p>
            {update.image && <figure className={styles.updateFigure}><div className={styles.updatePhoto}><ExampleImage circle={circle} src={update.image} />
              <span className={styles.aiLabel}>{c("AI illustration")}</span></div><figcaption>{c("Generated illustrative scene for a fictional example.")}</figcaption></figure>}
            <p>{update.body}</p>
            {update.proofLabel && <details className={styles.exampleProof}><summary>{c("View example proof")}<span aria-hidden="true">{Ico.chev({ size: 14, c: T.action })}</span></summary>
              <div><strong>{update.proofLabel}</strong><p>{c("Mock document note. This is not a receipt, blockchain transaction or confirmed evidence.")}</p>
                {update.amountPHP !== undefined && <p>{c("Illustrative amount:")}{" "}{formatLocal(update.amountPHP, currency)}</p>}</div></details>}
          </article>
        </li>)}
      </ol>}
      <p className={styles.localNotice}>{c("Example timeline, not receipts from real donations. Viewed updates are marked only when you use the explicit button.")}</p>
    </section>}

    {tab === "proof" && <section key="proof" id="circle-panel-proof" role="tabpanel" tabIndex={0} aria-labelledby="circle-tab-proof" className={`${styles.panel} sl-state-enter`}>
      <div className={styles.proofHeading}><div><span className={styles.eyebrow}>{c("Public proof")}</span><h2>{c("Trace the evidence, step by step")}</h2></div>
        <span className={styles.proofStatus}>{c("Not verified")}</span></div>
      <p>{c("This fictional cause has no on-chain receipt. Its planning, spending and delivery notes are synthetic examples.")}</p>
      <div className={styles.proofBoundary}><strong>{c("No on-chain campaign linked")}</strong>
        <p>{c("A real D4 campaign ID, locked recipients and confirmed transactions must be linked before this cause can accept Testnet donations or award a donor badge.")}</p></div>
      <ol className={styles.proofPipeline} aria-label={c("Evidence and approval pipeline")}>
        <li><span className={styles.proofNumber} aria-hidden="true">1</span><div><h3>{c("Campaign photos")}</h3><p>{c("Available as AI illustrations only. Not organizer uploads or delivery evidence.")}</p><span>{c("Example only")}</span></div></li>
        <li><span className={styles.proofNumber} aria-hidden="true">2</span><div><h3>{c("Receipts and delivery documents")}</h3><p>{c("No actual receipt or beneficiary confirmation has been submitted for this concept.")}</p><span>{c("Not submitted")}</span></div></li>
        <li><span className={styles.proofNumber} aria-hidden="true">3</span><div><h3>{c("Public proof URL and hash")}</h3><p>{c("No evidence hash or confirmed transaction exists. A launch signup is not an on-chain receipt.")}</p><span>{c("Not anchored on-chain")}</span></div></li>
        <li><span className={styles.proofNumber} aria-hidden="true">4</span><div><h3>{c("Wallet approvals and release")}</h3><p>{c("No approval request or payout exists for this concept. D4 separately requires its configured wallets to approve submitted proof before release.")}</p><span>{c("Not requested")}</span></div></li>
      </ol>
      {circle.gallery && circle.gallery.length > 0 && <section className={styles.proofPhotos} aria-labelledby="circle-proof-photos-title">
        <h3 id="circle-proof-photos-title">{c("Illustrative photo context")}</h3>
        <div>{circle.gallery.map(photo => <figure key={photo.src}><div><ExampleImage circle={circle} src={photo.src} /></div><figcaption>{c("AI illustration · not proof")}</figcaption></figure>)}</div>
      </section>}
      <h3 className={styles.separateHeading}>{c("Mock documents, not verified evidence")}</h3>
      <div className={styles.documentList}>{updates.filter(update => update.proofLabel).map(update => <details key={update.id} className={styles.document}>
        <summary><span aria-hidden="true">{Ico.link({ size: 18, c: T.action })}</span><div><strong>{update.proofLabel}</strong><small>{exampleDate(update.date, locale)} {c("· Example document")}</small></div>
          <span className={styles.expandIcon} aria-hidden="true">{Ico.chev({ size: 16, c: T.slate })}</span></summary>
        <div className={styles.documentBody}><p>{update.body}</p><p className={styles.hint}>{c("No real receipt or transaction exists for this note.")}</p></div>
      </details>)}</div>
      {updates.length === 0 && <p className={styles.localNotice}>{c("No sample document notes are available for this cause.")}</p>}
      <h3 className={styles.separateHeading}>{c("Separate Testnet evidence flows")}</h3>
      <p>{c("D4 donation campaigns and the D3 Disaster Vault are different products. Their records are not proof for this example cause.")}</p>
      {isLocalPreview && <p className={styles.localNotice}>{c("Local example mode: these destinations show simulated records, not network evidence.")}</p>}
      <Link href="/campaigns?mode=testnet" className={styles.proofLink}><span className={styles.proofIcon} aria-hidden="true">{Ico.vault({ size: 22, c: T.action })}</span>
        <div><strong>{c("D4 donation campaigns")}</strong><span>{c("Per-campaign escrow and proof approvals.")}</span></div><span aria-hidden="true">{Ico.chev({ size: 16, c: T.slate })}</span></Link>
      <Link href="/transparency" className={styles.proofLink}><span className={styles.proofIcon} aria-hidden="true">{Ico.shield({ size: 22, c: T.action })}</span>
        <div><strong>{c("D3 Disaster Vault public proof")}</strong><span>{c("Shared-pool approvals and payout controls.")}</span></div><span aria-hidden="true">{Ico.chev({ size: 16, c: T.slate })}</span></Link>
    </section>}

    <details className={styles.allowance}><summary><span className={styles.allowanceIcon} aria-hidden="true">{Ico.vault({ size: 23, c: "#8b6c36" })}</span>
      <div><strong>{c("Proposed organizer allowance")}</strong><span>{c("{percent}% in this concept. Not an enforced contract.", { percent: allowance })}</span></div><span className={styles.expandIcon} aria-hidden="true">{Ico.chev({ size: 17, c: T.ink })}</span></summary>
      <div className={styles.allowanceBody}><p>{c("Illustrative split from {amount}:", { amount: split.fmtSample })}</p><dl className={styles.split}>
        <div><dt>{c("Beneficiary")}</dt><dd>{split.fmtBeneficiary}</dd></div><div><dt>{c("Operations ({percent}%)", { percent: allowance })}</dt><dd>{split.fmtAllowance}</dd></div></dl>
        <p className={styles.hint}>{c("Proposed Circles allocation only. No payment or allocation contract, and no platform fee is established. D4 campaigns separately lock a creator share of 0 to 10% at creation.")}</p></div>
    </details>
    {tab !== "story" && organizerLink(true)}
    <Link href={`/circles/${circle.id}/manage`} className={styles.organizerLink}>{c("Explore organizer tools")}<span aria-hidden="true">{Ico.chev({ size: 15, c: T.action })}</span></Link>
    <footer className={styles.footer}><PoweredByStellar /><span>{c("Circles prototype · No real donations.")}</span></footer>
  </div>;
}
