"use client";

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart } from "@phosphor-icons/react/dist/csr/Heart";
import { Star } from "@phosphor-icons/react/dist/csr/Star";
import { useT } from "@/components/I18nProvider";
import { Ico } from "@/components/ui/icons";
import { SEED_CIRCLES } from "@/lib/circles/seed";
import { getOrganizerForCircle } from "@/lib/circles/organizers";
import { progressPct } from "@/lib/circles/types";
import { HOME_CAUSE_CATEGORIES, homeCircleExamples, isHomeCauseCategory, parseCauseViewState } from "@/lib/home-circles";
import { useNavigationViewState } from "@/lib/ui/useNavigationViewState";
import { getNavigationEntrySnapshot, subscribeNavigationViewState, writeNavigationViewState } from "@/lib/ui/app-navigation";
import { homeCopy } from "@/lib/i18n/revamp-home";
import { circlesCopy, circlesCategory } from "@/lib/i18n/revamp-circles";
import { homeCatalogCopy, type HomeCatalogKey } from "@/lib/i18n/revamp-home-catalog";
import ExampleOrganizerAvatar from "@/components/ui/ExampleOrganizerAvatar";
import styles from "./HomeCirclesCatalog.module.css";

// Native selects can be changed before React attaches their handlers. Keep
// interactive controls disabled in SSR/hydration, then enable at client commit.
// Stable snapshots avoid a state-setting effect or a hydration mismatch.
function subscribeCatalogReady() { return () => {}; }
function catalogReadySnapshot() { return true; }
function catalogServerReadySnapshot() { return false; }
function catalogServerEntrySnapshot() { return ""; }

// Discovery fixtures are independent of wallet state and D4 escrow. These
// routes preview the existing Circles concept; this component cannot pay.
export default function HomeCirclesCatalog() {
  const { locale } = useT();
  const c = circlesCopy(locale);
  const copy = (key: HomeCatalogKey, vars?: Record<string, string | number>) => homeCatalogCopy(locale, key, vars);
  const hydrated = useSyncExternalStore(subscribeCatalogReady, catalogReadySnapshot, catalogServerReadySnapshot);
  const entry = useSyncExternalStore(subscribeNavigationViewState, getNavigationEntrySnapshot, catalogServerEntrySnapshot);
  const ready = hydrated && entry !== "";
  const { category, index: savedIndex } = parseCauseViewState(useNavigationViewState("home-circles"));
  const strip = useRef<HTMLDivElement>(null);
  const restoredView = useRef<{ entry: string; category: string } | null>(null);
  const examples = homeCircleExamples(SEED_CIRCLES, category);
  const index = Math.min(savedIndex, Math.max(0, examples.length - 1));

  useLayoutEffect(() => {
    const element = strip.current;
    if (!ready || !element || (restoredView.current?.entry === entry && restoredView.current.category === category)) return;
    const card = element.children[index] as HTMLElement | undefined;
    const first = element.children[0] as HTMLElement | undefined;
    if (!card || !first) return;
    element.scrollTo({ left: card.offsetLeft - first.offsetLeft, behavior: "instant" });
    // A same-path history traversal can retain this component and DOM. Restore
    // the new entry/category once, not on index writes from manual scrolling.
    restoredView.current = { entry, category };
  }, [ready, entry, category, index]);

  function setIndex(next: number) {
    writeNavigationViewState("home-circles", { category, index: next });
  }

  function move(next: number) {
    const element = strip.current;
    if (!ready || !element || !examples.length) return;
    const current = (next + examples.length) % examples.length;
    const card = element.children[current] as HTMLElement | undefined;
    const first = element.children[0] as HTMLElement | undefined;
    if (!card || !first) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollTo({ left: card.offsetLeft - first.offsetLeft, behavior: reducedMotion ? "instant" : "smooth" });
    setIndex(current);
  }

  function syncScrollPosition() {
    const element = strip.current;
    const first = element?.children[0] as HTMLElement | undefined;
    if (!ready || !element || !first) return;
    let nearest = 0;
    let distance = Infinity;
    for (let current = 0; current < element.children.length; current++) {
      const card = element.children[current] as HTMLElement;
      const delta = Math.abs(card.offsetLeft - first.offsetLeft - element.scrollLeft);
      if (delta < distance) { distance = delta; nearest = current; }
    }
    if (nearest !== index) setIndex(nearest);
  }

  return <section className={styles.catalog} aria-labelledby="home-circles-title" data-testid="home-circles-catalog" data-catalog-ready={ready}>
    <header className={styles.header}>
      <div>
        <span className={styles.eyebrow}>{copy("CROWDFUNDING · PROTOTYPE")}</span>
        <h1 id="home-circles-title">{homeCopy(locale, "Give with clarity.")}</h1>
      </div>
      <Image src="/illustrations/giving.png" alt="" width={90} height={90} />
    </header>
    <p className={styles.notice}>{copy("Fictional causes · AI photos · example ratings · no payment.")}</p>
    <div className={styles.tools}>
      <label htmlFor="home-cause-category">
        <span className={styles.srOnly}>{copy("Category")}</span>
        <select id="home-cause-category" value={category} disabled={!ready} onChange={event => {
          if (!ready || !isHomeCauseCategory(event.target.value)) return;
          writeNavigationViewState("home-circles", { category: event.target.value, index: 0 });
        }}>
          {HOME_CAUSE_CATEGORIES.map(value => <option key={value} value={value}>{value === "all" ? c("All examples") : circlesCategory(locale, value)}</option>)}
        </select>
      </label>
      <Link href="/campaigns?mode=examples" prefetch={false} aria-label={copy("Browse all example causes")}>{homeCopy(locale, "See all")}{Ico.chev({ size: 15 })}</Link>
    </div>
    {/* The visible carousel counter already gives the total. Announce filter
        results without adding another full row to the first viewport. */}
    <div className={styles.srOnly} role="status">{c(examples.length === 1 ? "{count} example" : "{count} examples", { count: examples.length })}</div>
    <div key={category} className={styles.strip} ref={strip} onScroll={syncScrollPosition} aria-label={copy("Example causes carousel")}>
      {examples.map((circle, position) => {
        const organizer = getOrganizerForCircle(circle);
        const percent = progressPct(circle);
        return <article key={circle.id} className={styles.card} data-example-cause={circle.id}>
          <Link href={`/circles/${circle.id}`} prefetch={false} className={styles.photo} aria-label={copy("View example cause: {title}", { title: circle.title })}>
            <Image src={circle.coverImage ?? "/illustrations/giving.png"} alt={circle.imageAlt ?? c("AI-generated fictional campaign illustration")} width={600} height={340} sizes="(max-width: 500px) 82vw, 384px" loading={position === 0 ? "eager" : "lazy"} />
            <span className={styles.category}>{circlesCategory(locale, circle.category)}</span>
            <span className={styles.example}>{c("Example cause")}</span>
            <small className={styles.ai}>{c("AI illustration")}</small>
          </Link>
          <div className={styles.body}>
            <h2><Link href={`/circles/${circle.id}`} prefetch={false} title={circle.title}><span>{circle.title}</span></Link></h2>
            <Link href={`/circles/${circle.id}/organizer`} prefetch={false} className={styles.organizer} aria-label={c("View example organizer profile: {name}", { name: circle.organizer })}>
              {organizer ? <ExampleOrganizerAvatar organizer={organizer} size={34} /> : <span className={styles.avatar} aria-hidden="true">{circle.organizer.charAt(0)}</span>}
              <span className={styles.identity}><strong>{circle.organizer}</strong><small>{circle.organizerLocation}{" "}{c("· Example organizer")}</small></span>
              {Ico.chev({ size: 15 })}
            </Link>
            {organizer ? <div className={styles.rating}>
              <span><span>{copy("Example rating")}</span><Star size={13} weight="fill" aria-hidden="true" /><strong>{organizer.rating.toFixed(1)}/5</strong></span>
              <small>{copy("{count} example reviews", { count: organizer.reviewCount })}</small>
            </div> : null}
            <div className={styles.progress} aria-label={copy("{percent}% example progress. No donations collected.", { percent })}>
              <span>{copy("Example progress")}<strong>{percent}%</strong></span>
              <progress value={percent} max={100} aria-hidden="true" />
            </div>
            <Link href={`/circles/${circle.id}/donate`} prefetch={false} className={styles.pledge}><Heart size={18} aria-hidden="true" />{c("Preview a pledge")}</Link>
          </div>
        </article>;
      })}
    </div>
    <div className={styles.footer}>
      <Link href="/circles/create" prefetch={false} className={styles.explore}>{c("Sketch your own cause")}{Ico.chev({ size: 15 })}</Link>
      <div className={styles.controls}>
        <button type="button" aria-label={copy("Previous example cause")} onClick={() => move(index - 1)} disabled={!ready || examples.length < 2}>{Ico.back({ size: 17 })}</button>
        <span aria-label={copy("{current} of {count} example causes", { current: Math.min(index + 1, examples.length), count: examples.length })}>{String(Math.min(index + 1, examples.length)).padStart(2, "0")} / {String(examples.length).padStart(2, "0")}</span>
        <button type="button" aria-label={copy("Next example cause")} onClick={() => move(index + 1)} disabled={!ready || examples.length < 2}>{Ico.chev({ size: 17 })}</button>
      </div>
    </div>
  </section>;
}
