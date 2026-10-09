"use client";

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { useT } from "@/components/I18nProvider";
import { Ico } from "@/components/ui/icons";
import { SEED_CIRCLES } from "@/lib/circles/seed";
import { getOrganizerForCircle } from "@/lib/circles/organizers";
import { homeCircleExamples, homeStandaloneCampaigns, isHomeCauseCategory, parseCauseViewState } from "@/lib/home-circles";
import type { Campaign } from "@/lib/campaign";
import { useNavigationViewState } from "@/lib/ui/useNavigationViewState";
import { getNavigationEntrySnapshot, subscribeNavigationViewState, writeNavigationViewState } from "@/lib/ui/app-navigation";
import { homeCopy } from "@/lib/i18n/revamp-home";
import { circlesCopy, circlesCategory } from "@/lib/i18n/revamp-circles";
import { circleDisplayContent } from "@/lib/i18n/circles-content";
import { homeCatalogCopy, type HomeCatalogKey } from "@/lib/i18n/revamp-home-catalog";
import ExampleOrganizerAvatar from "@/components/ui/ExampleOrganizerAvatar";
import OrganizerTrustSummary from "@/components/ui/OrganizerTrustSummary";
import CauseCategoryPicker from "@/components/CauseCategoryPicker";
import CauseCategoryDoodle from "@/components/ui/CauseCategoryDoodle";
import styles from "./HomeCirclesCatalog.module.css";
import { isLocalPreview } from "@/lib/local-preview";
import HomeCircleFundingProgress, { ConfirmedFundingProgress } from "@/components/HomeCircleFundingProgress";
import CampaignDonationBadge from "@/components/CampaignDonationBadge";
import { useOwnedAccountRead } from "@/lib/ui/useOwnedAccountRead";
import { validCampaignSupport } from "@/lib/campaign-support";

// Native controls can be changed before React attaches their handlers. Keep
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
  const categoryPicker = useRef<HTMLDetailsElement>(null);
  const restoredView = useRef<{ entry: string; category: string } | null>(null);
  const examples = homeCircleExamples(SEED_CIRCLES, category);
  const standalone = !isLocalPreview && category === "all" ? homeStandaloneCampaigns(SEED_CIRCLES, campaigns, circleLinks) : [];
  const cardCount = examples.length + standalone.length;
  const index = Math.min(savedIndex, Math.max(0, cardCount - 1));
  // Load private evidence independently from public discovery. Keep the
  // selected card first so a large catalog never excludes its donation mark.
  const activeCampaign = index < examples.length
    ? Object.keys(circleLinks).find(id => circleLinks[id] === examples[index]?.id) : standalone[index - examples.length]?.id;
  const supportIds = [...new Set(campaigns.map(c => c.id))].slice(0, 40);
  // Keep the query stable when a slide changes inside the same batch. Only
  // fetch a new subset when its selected campaign falls outside the bound.
  if (activeCampaign && !supportIds.includes(activeCampaign)) {
    if (supportIds.length === 40) supportIds.pop();
    supportIds.push(activeCampaign);
  }
  const support = useOwnedAccountRead(supportIds.length ? `/api/account/campaign-support?ids=${supportIds.join(",")}` : null, validCampaignSupport);
  const forCircle = (slug: string) => support.value?.contributions[Object.keys(circleLinks).find(id => circleLinks[id] === slug) ?? ""];

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
    // Only the active slide reserves height. Page directly to it so the user
    // never sees an empty, collapsed neighbouring slot during a smooth pan.
    element.scrollTo({ left: card.offsetLeft - first.offsetLeft, behavior: "instant" });
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

  return <section className={styles.catalog} aria-labelledby="home-circles-title" data-testid="home-circles-catalog" data-crowdfunding-catalog="true" data-catalog-ready={ready}>
    <header className={styles.header}>
      <div className={styles.heading}>
        <span className={styles.eyebrow}>{isLocalPreview ? copy("CROWDFUNDING · PROTOTYPE") : homeCopy(locale, "CROWDFUNDING · TESTNET")}</span>
        <h1 id="home-circles-title">{homeCopy(locale, "Give with clarity.")}</h1>
      </div>
      <Link href={isLocalPreview ? "/circles/create" : "/campaigns?create=1"} prefetch={false} className={styles.startCampaign}>{Ico.plus({ size: 17 })}<span>{copy("Start a campaign")}</span></Link>
      <Image className={styles.givingArt} src="/illustrations/crowdfund-together.png" alt="" width={160} height={100} />
      <details className={styles.campaignTools}>
        <summary title={copy("Campaign tools")}><span className={styles.srOnly}>{copy("Campaign tools")}</span><span aria-hidden="true">···</span></summary>
        <nav className={styles.otherActions} aria-label={copy("Campaign tools")}>
          <Link href="/circles/create" prefetch={false} className={styles.explore}>{c("Sketch your own cause")}{Ico.chev({ size: 15 })}</Link>
          <Link href="/campaigns?mode=testnet" prefetch={false}>{copy("D4 Testnet campaigns")}{Ico.chev({ size: 12 })}</Link>
          {!isLocalPreview ? <Link href="/campaigns?create=1" prefetch={false}>{copy("Start a campaign")}</Link> : null}
        </nav>
      </details>
    </header>
    <p className={styles.notice}>{copy(isLocalPreview ? "Fictional causes · no payment." : "Fictional causes · Testnet XLM only. No real money.")}</p>
    <div className={styles.tools}>
      <details className={styles.categoryPicker} ref={categoryPicker}>
        <summary id="home-cause-category" aria-label={copy("Category")} aria-disabled={!ready} onClick={event => { if (!ready) event.preventDefault(); }}>
          <span className={styles.categoryArt}><CauseCategoryDoodle category={category} /></span>
          <span>{category === "all" ? copy("All campaigns") : circlesCategory(locale, category)}</span>
          {Ico.chev({ size: 16 })}
        </summary>
        <fieldset className={styles.categoryChoices} disabled={!ready}>
          <legend className={styles.srOnly}>{copy("Category")}</legend>
          <CauseCategoryPicker circles={homeCircleExamples(SEED_CIRCLES, "all")} selected={category} locale={locale} onSelect={next => {
            if (!ready || !isHomeCauseCategory(next)) return;
            writeNavigationViewState("home-circles", { category: next, index: 0 });
            if (categoryPicker.current) categoryPicker.current.open = false;
          }} />
        </fieldset>
      </details>
      <Link href="/campaigns?mode=examples" prefetch={false} aria-label={copy("Browse all example causes")}>{homeCopy(locale, "See all")}<ArrowRight size={17} aria-hidden="true" /></Link>
    </div>
    {/* Announce filter results without adding another full dashboard row. */}
    <div className={styles.srOnly} role="status">{c(examples.length === 1 ? "{count} example" : "{count} examples", { count: examples.length })}</div>
    <div className={styles.carousel}>
    <div key={category} className={styles.strip} ref={strip} onScroll={syncScrollPosition} aria-label={copy("Example causes carousel")}>
      {examples.map((circle, position) => {
        const organizer = getOrganizerForCircle(circle);
        const display = circleDisplayContent(circle, locale);
        return <article key={circle.id} className={styles.card} data-testid="home-crowdfunding-card" data-example-cause={circle.id} data-active-card={position === index} inert={position !== index}>
          <div className={styles.hero} data-testid="home-campaign-hero">
            <Link href={`/circles/${circle.id}`} prefetch={false} className={styles.photo} data-testid="home-campaign-cover" aria-label={copy("View example cause: {title}", { title: display.title })}>
              <Image src={circle.coverImage ?? "/illustrations/giving.png"} alt={display.imageAlt ?? c("AI-generated fictional campaign illustration")} width={600} height={340} sizes="(max-width: 500px) 90vw, 700px" loading={position === 0 ? "eager" : "lazy"} />
            </Link>
            <div className={styles.cardMeta}>
              <span className={styles.example}>{c("Example cause")}</span>
              <span className={styles.category}>{circlesCategory(locale, circle.category)}</span>
            </div>
            <span className={styles.donationMark}><CampaignDonationBadge support={forCircle(circle.id)} /></span>
            <div className={styles.heroCaption}>
              <small className={styles.ai}>{c("AI illustration")}</small>
              <h2><Link href={`/circles/${circle.id}`} prefetch={false} title={display.title}><span>{display.title}</span></Link></h2>
            </div>
          </div>
          <div className={styles.body}>
            <div className={styles.organizer} data-testid="home-campaign-organizer">
              {organizer ? <ExampleOrganizerAvatar organizer={organizer} size={40} /> : <span className={styles.avatar} aria-hidden="true">{circle.organizer.charAt(0)}</span>}
              <div className={styles.identity}><strong>{circle.organizer}</strong><small>{circle.organizerLocation}{" "}{c("· Example organizer")}</small><OrganizerTrustSummary exampleOrganizer={organizer} /></div>
            </div>
            <HomeCircleFundingProgress circle={circle} active={ready && position === index} />
            <Link href={`/circles/${circle.id}`} prefetch={ready && position === index} className={styles.pledge}>{c("View campaign")}<ArrowRight size={19} aria-hidden="true" /></Link>
          </div>
        </article>;
      })}
      {standalone.map((campaign, position) => <article key={`d4-${campaign.id}`} className={styles.card} data-testid="home-crowdfunding-card" data-standalone-campaign={campaign.id} data-active-card={examples.length + position === index} inert={examples.length + position !== index}>
        <div className={`${styles.hero} ${styles.testnetHero}`} data-testid="home-campaign-hero">
          <Link href={`/campaigns?id=${campaign.id}`} prefetch={false} className={`${styles.photo} ${styles.testnetPhoto}`} data-testid="home-campaign-cover" aria-label={campaign.title}>
            <Image src="/illustrations/giving.png" alt="" width={600} height={340} sizes="(max-width: 500px) 90vw, 700px" loading="lazy" />
          </Link>
          <div className={styles.cardMeta}>
            <span className={styles.category}>{copy("D4 Testnet campaigns")}</span>
          </div>
          <span className={styles.donationMark}><CampaignDonationBadge support={support.value?.contributions[campaign.id]} /></span>
          <div className={styles.heroCaption}>
            <h2><Link href={`/campaigns?id=${campaign.id}`} prefetch={false} title={campaign.title}><span>{campaign.title}</span></Link></h2>
          </div>
        </div>
        <div className={styles.body}>
          <span className={styles.testnetState}>#{campaign.id} · {campaign.state}</span>
          <OrganizerTrustSummary />
          <p className={styles.testnetNote}>{homeCopy(locale, "test XLM · no real money")}</p>
          <ConfirmedFundingProgress totalStroops={campaign.total} />
          <Link href={`/campaigns?id=${campaign.id}`} prefetch={false} className={styles.pledge}>{c("View campaign")}<ArrowRight size={19} aria-hidden="true" /></Link>
        </div>
      </article>)}
    </div>
      <div className={styles.controls}>
        <button type="button" aria-label={copy("Previous example cause")} onClick={() => move(index - 1)} disabled={!ready || cardCount < 2}>{Ico.back({ size: 17 })}</button>
        <span className={styles.srOnly} aria-label={copy("{current} of {count} example causes", { current: Math.min(index + 1, cardCount), count: cardCount })}>{String(Math.min(index + 1, cardCount)).padStart(2, "0")} / {String(cardCount).padStart(2, "0")}</span>
        <button type="button" aria-label={copy("Next example cause")} onClick={() => move(index + 1)} disabled={!ready || cardCount < 2}>{Ico.chev({ size: 17 })}</button>
      </div>
    </div>
    {/* Background discovery must not push the primary carousel controls below
        the persistent navigation when it is slow or needs a retry. */}
    {!isLocalPreview && loading ? <p className={styles.discoveryStatus} role="status">{copy("Checking other Testnet campaigns")}</p> : null}
    {!isLocalPreview && error ? <div className={styles.discoveryStatus} role="alert"><span>{homeCopy(locale, error)}</span>{onRetry ? <button type="button" onClick={onRetry}>{homeCopy(locale, "Try again")}</button> : null}</div> : null}
  </section>;
}
