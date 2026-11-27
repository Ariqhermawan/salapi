"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookmarkSimple, Flag, Info, UsersThree, X } from "@phosphor-icons/react";
import { AppBar, Btn, Ico, IconButton, PoweredByStellar } from "@/components/ui/kit";
import { PROTOTYPE_CAUSES } from "@/lib/prototype-causes";
import { useGoBack } from "@/lib/ui/useGoBack";
import styles from "./PrototypeOrganizerScreen.module.css";

const COMPLETED = [
  { title: "Clinic transport for neighbors", category: "Medical", raised: 72414, when: "25 Jun 2026" },
  { title: "A family learning corner", category: "Education", raised: 48276, when: "23 Jul 2026" },
  { title: "Storm-damaged roof repair", category: "Family", raised: 98276, when: "20 Aug 2026" },
  { title: "After-class learning kits", category: "Education", raised: 34080, when: "18 Sep 2026" },
];
const REVIEWS = [
  ["@jamal_r", "5", "The receipts match what was promised.", "Santos family roof"],
  ["@ana.reyes", "5", "Photos every week. Clear.", "Santos family roof"],
  ["@jamal_r", "5", "The receipts match what was promised.", "After-class learning kits"],
  ["@ana.reyes", "5", "Photos every week. Clear.", "After-class learning kits"],
  ["@mika_t", "4", "Delivered, a few days late.", "After-class learning kits"],
  ["@maria_s", "5", "Receipts and photos came the same week. I would give again.", "Storm-damaged roof repair"],
  ["@jamamam", "5", "Clear updates the whole way.", "A family learning corner"],
  ["@jamal_r", "4", "The proof took a few days, and it was complete.", "Clinic transport for neighbors"],
];
const completedMoney = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PrototypeOrganizerScreen({ totalOpen = false }: { totalOpen?: boolean }) {
  const back = useGoBack("/causes");
  const [tab, setTab] = useState<"Running" | "Completed">("Running");
  const [following, setFollowing] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [causeIndex, setCauseIndex] = useState(0);
  const [totalInfo, setTotalInfo] = useState(totalOpen);
  const running = PROTOTYPE_CAUSES.filter(cause => cause.organizer === "@meis_family" && ["Funding", "Awaiting proof", "In review"].includes(cause.status));
  const raisedCents = running.reduce((sum, cause) => sum + cause.raised, 0) + COMPLETED.reduce((sum, cause) => sum + cause.raised, 0);
  const figures = [
    { label: "Causes finished", value: "4", short: "4", sub: "Each one is listed below" },
    { label: "Total raised", value: completedMoney(raisedCents), short: completedMoney(raisedCents), sub: "Across every cause on this page" },
    { label: "Proofs documented", value: "4", short: "4", sub: "Receipts and photos, reviewed" },
    { label: "Rating", value: "4.9", short: "4.9", sub: "From 133 donor ratings" },
  ];
  const totalRows = [
    ...running.map(cause => ({ title: cause.title, state: "Running", cents: cause.raised })),
    ...COMPLETED.map(cause => ({ title: cause.title, state: `Completed · ${cause.when}`, cents: cause.raised })),
  ];

  return <div className={styles.screen}>
    <AppBar leading={<IconButton ariaLabel="Back" onClick={back}>{Ico.back({})}</IconButton>} title="Organizer" />
    <section className={styles.profile}>
      <Image className={styles.avatar} src="/prototype-causes/avatar-mei.png" width={56} height={56} alt="" priority unoptimized />
      <div className={styles.identity}>
        <span className={styles.verified}>● VERIFIED · LEVEL 2</span>
        <h1>Mei's family</h1><p>@meis_family | Quezon City, PH</p>
      </div>
      <p className={styles.bio}>We look after Ate Mei and help neighbors in Quezon City reach care. Every cause ends with receipts and photos.</p>
      <p className={styles.followers}><UsersThree size={16} />{following ? "1,205" : "1,204"} followers</p>
      <div className={styles.actions}>
        <Btn size="md" kind={following ? "secondary" : "primary"} onClick={() => setFollowing(value => !value)}>{following ? "Following" : "Follow"}</Btn>
        <Link href="/donate/mei" className={styles.donate}>Donate</Link>
        <button type="button" aria-label="Report this organizer" onClick={() => { setReportSent(false); setReportOpen(true); }}><Flag size={17} /></button>
      </div>
      <div className={styles.figuresB}>
        <div className={styles.leadFigure}><span>{figures[1].label}<button type="button" aria-label="How Total raised adds up" onClick={() => setTotalInfo(true)}><Info size={16} weight="fill" aria-hidden="true" /></button></span><strong>{figures[1].value}</strong><small>{figures[1].sub}</small></div>
        {figures.filter((_, index) => index !== 1).map(item => <div key={item.label}><strong>{item.label === "Rating" && <span className={styles.star}>★</span>}{item.value}</strong><span>{item.label}</span></div>)}
      </div>
    </section>


    <div className={styles.tabs} role="tablist" aria-label="Causes">
      {(["Running", "Completed"] as const).map(item => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item} · {item === "Running" ? running.length : 4}</button>)}
    </div>
    {tab === "Running" ? <>
      <header className={styles.sectionHeader}><h2>Work being supported now</h2><p>Funds, the organizer benefit, proof and donor comments can be read before you give.</p></header>
      <div className={styles.runningRail}>
        {running.map((cause, index) => <article className={styles.causeWrap} key={cause.id}>
          <Link href={`/cause/${cause.id}`} className={styles.causeCard} onClick={() => setCauseIndex(index)}>
            <div className={styles.causeImage}><Image src={cause.image ?? "/prototype-causes/cause-santos-roof.jpg"} fill sizes="260px" alt="" unoptimized /><span>{cause.category}</span><em>{cause.status}</em></div>
            <div className={styles.causeBody}><strong>{cause.title}</strong><small>{cause.organizer} · {cause.place}</small><span className={styles.raisedLine}>{completedMoney(cause.raised)} USDC raised of {completedMoney(cause.target)} <b>{Math.round(cause.raised / cause.target * 100)}%</b></span><span className={styles.progress}><i style={{ width: `${Math.min(100, cause.raised / cause.target * 100)}%` }} /></span></div>
          </Link>
          <button type="button" aria-label={saved.includes(cause.id) ? "Remove from saved causes" : "Save this cause"} aria-pressed={saved.includes(cause.id)} onClick={() => setSaved(current => current.includes(cause.id) ? current.filter(item => item !== cause.id) : [...current, cause.id])}><BookmarkSimple size={19} weight={saved.includes(cause.id) ? "fill" : "regular"} /></button>
        </article>)}
      </div>
      {running.length > 1 && <div className={styles.dots}>{running.map((cause, index) => <button key={cause.id} type="button" aria-label={`Cause ${index + 1} of ${running.length}`} aria-current={causeIndex === index || undefined} onClick={() => setCauseIndex(index)} />)}</div>}
    </> : <section className={styles.completedGrid}>
      {COMPLETED.map(item => <article key={item.title}><span className={styles.completedImage}>{item.category}</span><strong>{item.title}</strong><b>Raised {completedMoney(item.raised)}</b><small>Completed {item.when}</small></article>)}
    </section>}

    <section className={styles.trust}>
      <h2>Why this profile can be trusted</h2>
      {[["Identity and payout account reviewed", "The identity check passed before any payout."], ["4 proofs documented", "Receipts and photos are reviewed before money is released."], ["Rated 4.9 by 133 donors", "Only people who gave to a finished cause can rate it."], ["No open disputes", "Reports on a cause or an organizer are counted here."]].map(([title, sub]) => <article key={title}><span>✓</span><div><strong>{title}</strong><small>{sub}</small></div><ArrowRight size={16} /></article>)}
    </section>
    <h2 className={styles.reviewsTitle}>Reviews · 8</h2>
    <section className={styles.reviews}>{REVIEWS.map(([by, stars, text, cause]) => <article key={`${by}-${cause}`}><strong>{by}<span>★ {stars}</span></strong><p>{text}</p><small>{cause}</small></article>)}</section>
    <div className={styles.powered}><PoweredByStellar /></div>

    {totalInfo && <div className={styles.backdrop} role="presentation" onClick={event => { if (event.target === event.currentTarget) setTotalInfo(false); }}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="total-raised-title">
        <div className={styles.handle} /><header><h2 id="total-raised-title">Total raised</h2><button type="button" aria-label="Close" onClick={() => setTotalInfo(false)}><X size={20} /></button></header>
        <p>What each cause on this page has raised, and the sum.</p>
        <div className={styles.totalRows}>{totalRows.map((row, index) => <div key={`${row.title}-${index}`}><span><strong>{row.title}</strong><small>{row.state}</small></span><b>{completedMoney(row.cents)}</b></div>)}<div className={styles.totalSum}><strong>Total · {totalRows.length} causes</strong><b>{completedMoney(raisedCents)}</b></div></div>
        <Btn onClick={() => setTotalInfo(false)}>Got it</Btn>
      </section>
    </div>}

    {reportOpen && <div className={styles.backdrop} role="presentation" onClick={event => { if (event.target === event.currentTarget) setReportOpen(false); }}><section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="organizer-report-title"><div className={styles.handle} /><h2 id="organizer-report-title">{reportSent ? "Report sent" : "Report this organizer"}</h2><p>{reportSent ? "We review every report. You can follow what happens to it in Notifications." : "This local preview does not send your report."}</p><Btn onClick={() => reportSent ? setReportOpen(false) : setReportSent(true)}>{reportSent ? "Done" : "Send report"}</Btn><button type="button" onClick={() => setReportOpen(false)}>Cancel</button></section></div>}
  </div>;
}
