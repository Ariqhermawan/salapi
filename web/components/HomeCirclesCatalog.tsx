"use client";

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart } from "@phosphor-icons/react/dist/csr/Heart";
import { useT } from "@/components/I18nProvider";
import { Ico } from "@/components/ui/icons";
import { SEED_CIRCLES } from "@/lib/circles/seed";
import { getOrganizerForCircle } from "@/lib/circles/organizers";
import { HOME_CAUSE_CATEGORIES, homeCircleExamples, homeStandaloneCampaigns, isHomeCauseCategory, parseCauseViewState } from "@/lib/home-circles";
import type { Campaign } from "@/lib/campaign";
import { formatStroops } from "@/lib/format-stroops";
import { useNavigationViewState } from "@/lib/ui/useNavigationViewState";
import { getNavigationEntrySnapshot, subscribeNavigationViewState, writeNavigationViewState } from "@/lib/ui/app-navigation";
import { homeCopy } from "@/lib/i18n/revamp-home";
import { circlesCopy, circlesCategory } from "@/lib/i18n/revamp-circles";
import { homeCatalogCopy, type HomeCatalogKey } from "@/lib/i18n/revamp-home-catalog";
import ExampleOrganizerAvatar from "@/components/ui/ExampleOrganizerAvatar";
import styles from "./HomeCirclesCatalog.module.css";
import { isLocalPreview } from "@/lib/local-preview";
import HomeCircleFundingProgress from "@/components/HomeCircleFundingProgress";

// Native selects can be changed before React attaches their handlers. Keep
// interactive controls disabled in SSR/hydration, then enable at client commit.
// Stable snapshots avoid a state-setting effect or a hydration mismatch.
function subscribeCatalogReady() { return () => {}; }
function catalogReadySnapshot() { return true; }
function catalogServerReadySnapshot() { return false; }
function catalogServerEntrySnapshot() { return ""; }

// Discovery never signs or pays. Only the selected card reads its public QA
// funding total; the rest of the catalog does not fan out ledger requests.
export default function HomeCirclesCatalog({ campaigns = [], circleLinks = {}, loading = false, error = "", onRetry }: {
  campaigns?: Omit<Campaign, "contribution">[]; circleLinks?: Record<string, string>; loading?: boolean; error?: string; onRetry?: () => void;
}) {
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
  const standalone = !isLocalPreview && category === "all" ? homeStandaloneCampaigns(SEED_CIRCLES, campaigns, circleLinks) : [];
  const cardCount = examples.length + standalone.length;
  const index = Math.min(savedIndex, Math.max(0, cardCount - 1));

  useLayoutEffect(() => {
    const element = strip.current;
    if (!ready || !element || (restoredView.current?.entry === entry && restoredView.current.category === category)) return;
    // A saved trailing D4 card may not have arrived yet. Do not mark a clamped
    // story card restored, or the counter and visible card would diverge.
    if (loading && savedIndex >= cardCount) return;
    const card = element.children[index] as HTMLElement | undefined;
    const first = element.children[0] as HTMLElement | undefined;
    if (!card || !first) return;
    element.scrollTo({ left: card.offsetLeft - first.offsetLeft, behavior: "instant" });
    // A same-path history traversal can retain this component and DOM. Restore
    // the new entry/category once, not on index writes from manual scrolling.
    restoredView.current = { entry, category };
  }, [ready, entry, category, index, savedIndex, cardCount, loading]);

  function setIndex(next: number) {
    writeNavigationViewState("home-circles", { category, index: next });
  }

  function move(next: number) {
    const element = strip.current;
    if (!ready || !element || !cardCount) return;
    const current = (next + cardCount) % cardCount;
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
        <span className={styles.eyebrow}>{isLocalPreview ? copy("CROWDFUNDING · PROTOTYPE") : homeCopy(locale, "CROWDFUNDING · TESTNET")}</span>
        <h1 id="home-circles-title">{homeCopy(locale, "Give with clarity.")}</h1>
      </div>
      <Image src="/illustrations/giving.png" alt="" width={90} height={90} />
    </header>
    <p className={styles.notice}>{copy(isLocalPreview ? "Fictional causes · no payment." : "Fictional causes · Testnet XLM only.")}</p>
    <div className={styles.tools}>
      <label htmlFor="home-cause-category">
        <span className={styles.srOnly}>{copy("Category")}</span>
        <select id="home-cause-category" value={category} disabled={!ready} onChange={event => {
          if (!ready || !isHomeCauseCategory(event.target.value)) return;
          writeNavigationViewState("home-circles", { category: event.target.value, index: 0 });
        }}>
          {HOME_CAUSE_CATEGORIES.map(value => <option key={value} value={value}>{value === "all" ? copy("All campaigns") : circlesCategory(locale, value)}</option>)}
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
        return <article key={circle.id} className={styles.card} data-example-cause={circle.id}>
          <Link href={`/circles/${circle.id}`} prefetch={false} className={styles.photo} aria-label={copy("View example cause: {title}", { title: circle.title })}>
            <Image src={circle.coverImage ?? "/illustrations/giving.png"} alt={circle.imageAlt ?? c("AI-generated fictional campaign illustration")} width={600} height={340} sizes="(max-width: 500px) 82vw, 384px" loading={position === 0 ? "eager" : "lazy"} />
            <span className={styles.category}>{circlesCategory(locale, circle.category)}</span>
            <span className={styles.example}>{c("Example cause")}</span>
            <small className={styles.ai}>{c("AI illustration")}</small>
          </Link>
          <div className={styles.body}>
            <h2><Link href={`/circles/${circle.id}`} prefetch={false} title={circle.title}><span>{circle.title}</span></Link></h2>
            <div className={styles.organizer} data-testid="home-campaign-organizer">
              {organizer ? <ExampleOrganizerAvatar organizer={organizer} size={34} /> : <span className={styles.avatar} aria-hidden="true">{circle.organizer.charAt(0)}</span>}
              <span className={styles.identity}><strong>{circle.organizer}</strong><small>{circle.organizerLocation}{" "}{c("· Example organizer")}</small></span>
            </div>
            <HomeCircleFundingProgress circle={circle} active={ready && position === index} />
            <Link href={`/circles/${circle.id}`} prefetch={ready && position === index} className={styles.pledge}><Heart size={18} aria-hidden="true" />{c("View campaign")}</Link>
          </div>
        </article>;
      })}
      {standalone.map(campaign => <article key={`d4-${campaign.id}`} className={styles.card} data-standalone-campaign={campaign.id}>
        <Link href={`/campaigns?id=${campaign.id}`} prefetch={false} className={`${styles.photo} ${styles.testnetPhoto}`} aria-label={campaign.title}>
          <Image src="/illustrations/giving.png" alt="" width={600} height={340} sizes="(max-width: 500px) 82vw, 384px" loading="lazy" />
          <span className={styles.category}>{copy("D4 Testnet campaigns")}</span>
        </Link>
        <div className={styles.body}>
          <h2><Link href={`/campaigns?id=${campaign.id}`} prefetch={false} title={campaign.title}><span>{campaign.title}</span></Link></h2>
          <span className={styles.testnetState}>#{campaign.id} · {campaign.state}</span>
          <p className={styles.testnetNote}>{homeCopy(locale, "test XLM · no real money")}</p>
          <div className={styles.testnetTotal}><strong>{formatStroops(campaign.total)} XLM</strong><small>{homeCopy(locale, "funded on Testnet")}</small></div>
          <Link href={`/campaigns?id=${campaign.id}`} prefetch={false} className={styles.pledge}><Heart size={18} aria-hidden="true" />{c("View campaign")}</Link>
        </div>
      </article>)}
    </div>
    <div className={styles.footer}>
      <details className={styles.campaignTools}>
        <summary>{copy("Campaign tools")}</summary>
        <nav className={styles.otherActions} aria-label={copy("Campaign tools")}>
          <Link href="/circles/create" prefetch={false} className={styles.explore}>{c("Sketch your own cause")}{Ico.chev({ size: 15 })}</Link>
          <Link href="/campaigns?mode=testnet" prefetch={false}>{copy("D4 Testnet campaigns")}{Ico.chev({ size: 12 })}</Link>
          {!isLocalPreview ? <Link href="/campaigns?create=1" prefetch={false}>{copy("Start a campaign")}</Link> : null}
        </nav>
      </details>
      <div className={styles.controls}>
        <button type="button" aria-label={copy("Previous example cause")} onClick={() => move(index - 1)} disabled={!ready || cardCount < 2}>{Ico.back({ size: 17 })}</button>
        <span aria-label={copy("{current} of {count} example causes", { current: Math.min(index + 1, cardCount), count: cardCount })}>{String(Math.min(index + 1, cardCount)).padStart(2, "0")} / {String(cardCount).padStart(2, "0")}</span>
        <button type="button" aria-label={copy("Next example cause")} onClick={() => move(index + 1)} disabled={!ready || cardCount < 2}>{Ico.chev({ size: 17 })}</button>
      </div>
    </div>
    {/* Background discovery must not push the primary carousel controls below
        the persistent navigation when it is slow or needs a retry. */}
    {!isLocalPreview && loading ? <p className={styles.discoveryStatus} role="status">{copy("Checking other Testnet campaigns")}</p> : null}
    {!isLocalPreview && error ? <div className={styles.discoveryStatus} role="alert"><span>{homeCopy(locale, error)}</span>{onRetry ? <button type="button" onClick={onRetry}>{homeCopy(locale, "Try again")}</button> : null}</div> : null}
  </section>;
}
