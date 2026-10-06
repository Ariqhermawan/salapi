"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Avatar, Ico, T, PoweredByStellar } from "@/components/ui/kit";
import OrganizerVerification from "@/components/ui/OrganizerVerification";
import { useT } from "@/components/I18nProvider";
import { formatLocal } from "@/lib/ui/currency";
import { CATEGORY_LABEL, type Circle, type CircleCategory } from "@/lib/circles/types";
import type { CircleOrganizer } from "@/lib/circles/organizers";
import { useGoBack } from "@/lib/ui/useGoBack";
import { circlesCopy } from "@/lib/i18n/revamp-circles";
import styles from "./CirclesOrganizerRevamp.module.css";

const photos: Partial<Record<CircleCategory, string>> = {
  disaster: "/circles/disaster.jpg", medical: "/circles/medical.jpg", education: "/circles/education.jpg",
};

function exampleDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : value;
}

function CauseCard({ cause, history = false }: { cause: Circle; history?: boolean }) {
  const { currency } = useT();
  const [failed, setFailed] = useState(false);
  const fallback = photos[cause.category] ?? "/illustrations/giving.png";
  const source = failed ? fallback : cause.coverImage ?? fallback;
  return <Link href={`/circles/${cause.id}`} className={`${styles.causeCard} ${history ? styles.historyCard : styles.activeCard}`}
    aria-label={`View ${history ? "completed " : ""}example cause: ${cause.title}`}>
    <div className={styles.cover}>
      <Image src={source} alt={cause.imageAlt ?? `${CATEGORY_LABEL[cause.category]} fictional example`} fill
        sizes="(max-width: 370px) 90px, 116px" onError={() => setFailed(true)}
        className={source === "/illustrations/giving.png" ? styles.doodleCover : undefined} />
      <span className={styles.aiLabel}>{cause.coverImage ? "AI illustration" : "Example cover"}</span>
    </div>
    <div className={styles.causeCopy}>
      <small>{CATEGORY_LABEL[cause.category]} · {history ? "completed example" : "current example"}</small>
      <h3>{cause.title}</h3>
      {history ? <>
        {cause.completedOn && <p className={styles.historyDate}>Example completed {exampleDate(cause.completedOn)}</p>}
        <p className={styles.historyAmount}>Example raised {formatLocal(cause.pesoRaised, currency)}</p>
      </> : <>
        {cause.summary && <p className={styles.causeSummary}>{cause.summary}</p>}
        <div className={styles.causeFee}><span>Proposed organizer allowance</span><strong>{cause.allowance?.percentage ?? 0}%</strong></div>
      </>}
      <span className={styles.viewCause}>{history ? "View details" : "View cause"}{Ico.chev({ size: 14, c: T.action })}</span>
    </div>
  </Link>;
}

export default function CirclesOrganizerScreen({ circle, organizer, causes, history }: {
  circle: Circle; organizer: CircleOrganizer; causes: Circle[]; history: Circle[];
}) {
  const { locale } = useT();
  const c = circlesCopy(locale);
  const causePath = `/circles/${circle.id}`;
  const goBack = useGoBack(causePath);
  const [allCauses, setAllCauses] = useState(false);
  const [allReviews, setAllReviews] = useState(false);
  const featured = causes.find(cause => cause.id === circle.id) ?? causes[0];
  const visibleCauses = allCauses ? causes : featured ? [featured] : [];
  const visibleReviews = allReviews ? organizer.reviews : organizer.reviews.slice(0, 1);

  function viewReviews() {
    setAllReviews(true);
    window.requestAnimationFrame(() => document.getElementById("organizer-reviews")?.scrollIntoView({ block: "start" }));
  }

  return <div className={styles.screen}>
    <div className={styles.top}><button type="button" className={styles.back} onClick={goBack}><span aria-hidden="true">{Ico.back({ size: 19, c: T.action })}</span>{c("Back")}</button>
      <span className={styles.badge}>Example profile</span></div>

    <section className={styles.identity} aria-labelledby="organizer-name">
      <div className={styles.identityHeader}>
        <div className={styles.identityRow}><span className={styles.monogram} aria-hidden="true">{organizer.initials}</span>
          <div><h1 id="organizer-name">{organizer.name}</h1><p className={styles.location}>{organizer.location} · {organizer.kind === "ngo" ? "NGO organizer" : "Individual organizer"}</p>
            <OrganizerVerification kind={organizer.kind} /></div></div>
        <div className={styles.rating}><span>Example rating</span><strong>{organizer.rating.toFixed(1)}<small>/5</small></strong>
          <button type="button" onClick={viewReviews}>{organizer.reviewCount} example reviews</button></div>
      </div>
      <p className={styles.identityNotice}>Fictional profile. Verification, histories and ratings are simulated. Demo verification, not an identity check.</p>
      <details className={styles.bio}><summary>About this example organizer</summary><p>{organizer.bio}</p></details>
    </section>

    <section className={styles.causes} aria-labelledby="organizer-causes">
      <header className={styles.sectionHeader}><div><h2 id="organizer-causes">Current causes</h2><span>{causes.length} fictional example{causes.length !== 1 ? "s" : ""}</span></div>
        {causes.length > 1 && <button type="button" aria-expanded={allCauses} aria-controls="organizer-current-list" onClick={() => setAllCauses(!allCauses)}>{allCauses ? "Show less" : "View all"}</button>}</header>
      <div id="organizer-current-list" className={styles.causeList}>
        {visibleCauses.map(cause => <CauseCard key={cause.id} cause={cause} />)}
        {causes.length === 0 && <p className={styles.empty}>No current example causes are available.</p>}
      </div>
    </section>

    <section className={styles.causes} aria-labelledby="organizer-history">
      <header className={styles.sectionHeader}><div><h2 id="organizer-history">Example completed history</h2><span>Synthetic scenarios, not verified delivery.</span></div></header>
      <div className={styles.causeList}>{history.map(cause => <CauseCard key={cause.id} cause={cause} history />)}
        {history.length === 0 && <p className={styles.empty}>No completed example histories are available.</p>}</div>
    </section>

    <section id="organizer-reviews" className={styles.causes} aria-labelledby="organizer-reviews-title">
      <header className={styles.sectionHeader}><div><h2 id="organizer-reviews-title">Example reviews</h2><span>Synthetic reviews, not real donor testimony.</span></div>
        {organizer.reviews.length > 1 && <button type="button" aria-expanded={allReviews} aria-controls="organizer-review-list" onClick={() => setAllReviews(!allReviews)}>{allReviews ? "Show less" : "View all"}</button>}</header>
      <div id="organizer-review-list" className={styles.reviewList}>{visibleReviews.map(review => <article key={review.id} className={styles.review}>
        <div className={styles.reviewTop}><Avatar name={review.reviewer} size={34} /><div><h3>{review.reviewer}</h3><time dateTime={review.date}>{exampleDate(review.date)}</time></div>
          <span className={styles.reviewScore} aria-label={`Example review score ${review.score} out of 5`}>{Ico.star({ size: 14, c: T.action })}{review.score}/5</span></div>
        <p>{review.body}</p><Link href={`/circles/${review.causeId}`} className={styles.reviewCauseLink}>View reviewed example cause<span aria-hidden="true">{Ico.chev({ size: 14, c: T.action })}</span></Link>
      </article>)}</div>
    </section>

    <div className={styles.demoNotice}><OrganizerVerification kind="ngo" compact /><p>NGO examples use gold demo verification. Individual examples use blue. Neither confirms a real identity, registration or donation.</p></div>
    <div className={styles.actions}><Link className={styles.primary} href={causePath}>View example cause<span aria-hidden="true">{Ico.chev({ size: 17, c: "#fff" })}</span></Link>
      <Link className={styles.secondary} href="/circles">Browse Circles<span aria-hidden="true">{Ico.chev({ size: 17, c: T.action })}</span></Link></div>
    <footer className={styles.footer}><PoweredByStellar /><span>Prototype · No real donations.</span></footer>
  </div>;
}
