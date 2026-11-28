"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookmarkSimple, CaretDown, Check, GridFour, ImageSquare, ListBullets, MagnifyingGlass, X } from "@phosphor-icons/react";
import { campaignState } from "@/app/campaign-actions";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { SEED_CIRCLES } from "@/lib/circles/seed";
import type { CircleCategory } from "@/lib/circles/types";
import { circlesCategory } from "@/lib/i18n/revamp-circles";
import { circleDisplayTitle } from "@/lib/i18n/circles-content";
import { useT } from "@/components/I18nProvider";
import type { Campaign } from "@/lib/campaign";
import { isLocalPreview, PREVIEW_CAMPAIGNS, PREVIEW_TIME, PREVIEW_WALLET } from "@/lib/local-preview";
import { campaignDiscoveryCopy } from "@/lib/i18n/revamp-campaign-discovery";
import { readAccountSavedCampaigns, setAccountSavedCampaign } from "@/app/campaign-saved-actions";
import { useCirclesSignupIdentity } from "@/lib/ui/useCirclesSignupIdentity";
import { d4CampaignStatus, d4CampaignStatusFilterLabel, d4CampaignStatusPresentation, filterD4Campaigns, type D4CampaignLayout } from "@/lib/campaign-discovery";
import { formatStroops } from "@/lib/format-stroops";
import { formatIllustrativeUsd } from "@/lib/money";
import { useGoBack } from "@/lib/ui/useGoBack";
import { useNavigationViewState } from "@/lib/ui/useNavigationViewState";
import { getNavigationViewStateSnapshot, writeNavigationViewState } from "@/lib/ui/app-navigation";
import { vaultCampaignMedia } from "@/lib/vault-campaign-media";
import CauseCategoryDoodle from "@/components/ui/CauseCategoryDoodle";
import PrototypeCausesScreen from "@/components/screens/PrototypeCausesScreen";
import styles from "./CampaignCausesScreen.module.css";

type State = Awaited<ReturnType<typeof campaignState>>;
type CampaignRow = Campaign;
const SAVED_KEY = "salapi.d4.saved-campaigns.v1";
const ALL = "All";
const CATEGORY_ORDER: readonly CircleCategory[] = [
  "disaster", "medical", "care", "education", "community", "family", "creator", "volunteer", "animals",
];
const PREVIEW_CIRCLE_LINKS: Record<string, string> = {
  "101": "tino-relief",
  "102": "ate-mei-dialysis",
  "103": "barangay-library",
};
const TESTNET_CAMPAIGNS_VIEW = "testnet-campaigns" as const;
const MAX_RESTORABLE_CAMPAIGN_PAGES = 100;

function parseLoadedCampaignPages(snapshot: string): number {
  try {
    const value: unknown = JSON.parse(snapshot);
    if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
    const pages = (value as { pages?: unknown }).pages;
    return typeof pages === "number" && Number.isInteger(pages) && pages >= 0 && pages <= MAX_RESTORABLE_CAMPAIGN_PAGES ? pages : 0;
  } catch { return 0; }
}

type LoadedCampaignState = Extract<State, { ok: true }>;
function appendCampaignPage(previous: LoadedCampaignState, next: LoadedCampaignState): LoadedCampaignState {
  const ids = new Set(previous.campaigns.map(campaign => campaign.id));
  const campaigns = [...previous.campaigns, ...next.campaigns.filter(campaign => !ids.has(campaign.id))];
  const circleLinks = { ...(previous.circleLinks ?? {}), ...(next.circleLinks ?? {}) };
  return { ...next, campaigns, ...(Object.keys(circleLinks).length ? { circleLinks } : {}) };
}

function categoryFor(campaign: Campaign, circleLinks: Record<string, string> | undefined): string {
  const circleId = circleLinks?.[campaign.id];
  return circleId ? SEED_CIRCLES.find(circle => circle.id === circleId)?.category ?? "" : "";
}

function Cover({ category, mediaSrc }: { category: string; mediaSrc?: string }) {
  if (mediaSrc) return <Image src={mediaSrc} fill sizes="(max-width: 500px) 100vw, 500px" alt="" className={styles.coverImage} />;
  return <span className={styles.coverEmpty} data-category={category || "general"} aria-hidden="true"><ImageSquare size={28} /></span>;
}

function CampaignStatusSummary({ campaign, now }: { campaign: CampaignRow; now: bigint }) {
  const { locale } = useT();
  const lifecycle = d4CampaignStatusPresentation(campaign, now, locale);
  return <span className={styles.lifecycleStatus} data-tone={lifecycle.tone} data-testid="campaign-lifecycle-status" aria-label={lifecycle.accessibleLabel}>
    <strong>{lifecycle.label}</strong>
    {lifecycle.detail && <small>{lifecycle.detail}</small>}
  </span>;
}

function CategoryChip({ label, category }: { label: string; category: string }) {
  return <span className={styles.categoryChip} data-category={category}>{label}</span>;
}

function CauseCard({ campaign, circleId, now, category, featured, saved, onSave, localPreview, saveDisabled = false }: {
  campaign: CampaignRow; circleId?: string; now: bigint; category: string; featured?: boolean; saved: boolean;
  onSave: () => void; localPreview: boolean; saveDisabled?: boolean;
}) {
  const { locale } = useT();
  // A verified catalog link shows the cause's own title, photo and page, not the
  // immutable on-chain QA title ("QA Circles: <slug>").
  const circle = circleId ? SEED_CIRCLES.find(item => item.id === circleId) : undefined;
  const title = circle ? circleDisplayTitle(circle.id, locale) ?? campaign.title : campaign.title;
  const href = circle ? `/circles/${encodeURIComponent(circle.id)}` : `/campaigns?id=${encodeURIComponent(campaign.id)}`;
  const categoryId = category.toLowerCase().replace(/[^a-z]+/g, "-");
  const raised = formatIllustrativeUsd(campaign.total);
  const amount = formatStroops(campaign.total);
  const media = vaultCampaignMedia(campaign, localPreview);
  const coverSrc = media?.coverSrc ?? circle?.coverImage;
  return <span className={styles.cardWrap} data-featured={featured || undefined} data-short={featured || undefined}>
    <Link href={href} className={`${styles.causeCard} ${featured ? styles.featuredCard : styles.smallCard}`} data-featured={featured || undefined}>
      <span className={styles.cover}>
        <Cover category={categoryId} mediaSrc={coverSrc} />
        <span className={styles.coverTags}>
          <span>{category ? <CategoryChip label={category} category={categoryId} /> : <CategoryChip label="Stellar Testnet" category="general" />}</span>
        </span>
        {featured && <span className={styles.featuredRibbon}>Featured</span>}
      </span>
      <span className={styles.cardBody}>
        {featured ? <>
          <span className={styles.causeTitle}>{title}</span>
          <span className={styles.causeSub}>{category || "Stellar Testnet campaign"}</span>
        </> : <>
          <span className={styles.causeTitleSmall}>{title}</span>
          <span className={styles.causeSub}>{category || "Stellar Testnet campaign"}</span>
        </>}
        <CampaignStatusSummary campaign={campaign} now={now} />
        <span className={styles.amountRow}>
          <span><strong>{raised}</strong><small> raised · {amount} XLM total</small></span>
          {!featured && <span className={styles.openIcon} aria-hidden="true">↗</span>}
        </span>
      </span>
    </Link>
    <button type="button" className={styles.saveButton} aria-pressed={saved} disabled={saveDisabled}
      aria-label={saved ? `Remove ${title} from saved causes` : `Save ${title}`}
      title={saved ? "Remove from saved causes" : "Save this cause"} onClick={onSave}>
      <BookmarkSimple size={19} weight={saved ? "fill" : "regular"} aria-hidden="true" />
    </button>
  </span>;
}

export default function CampaignCausesScreen({ initialSavedOnly = false }: { initialSavedOnly?: boolean }) {
  if (isLocalPreview) return <PrototypeCausesScreen initialSavedOnly={initialSavedOnly} />;
  return <LiveCampaignCausesScreen initialSavedOnly={initialSavedOnly} />;
}

function LiveCampaignCausesScreen({ initialSavedOnly = false }: { initialSavedOnly?: boolean }) {
  const { locale } = useT();
  const copy = campaignDiscoveryCopy(locale);
  const params = useSearchParams();
  const pathname = usePathname() ?? "/campaigns";
  const router = useRouter();
  const backHome = useGoBack("/");
  const backToYou = useGoBack("/settings");
  const query = params.get("q") ?? "";
  const campaignPageSnapshot = useNavigationViewState(TESTNET_CAMPAIGNS_VIEW);
  const initialCampaignPageCount = parseLoadedCampaignPages(campaignPageSnapshot);
  const loadedCampaignPages = useRef(initialCampaignPageCount);
  const [loadedCampaignPageCount, setLoadedCampaignPageCount] = useState(initialCampaignPageCount);
  const [restoreCampaignPageCount, setRestoreCampaignPageCount] = useState(0);
  const selectedCategory = params.get("c") ?? ALL;
  const selectedStatus = params.get("s") ?? ALL;
  const layout: D4CampaignLayout = params.get("view") === "list" ? "list" : "grid";
  const savedOnly = initialSavedOnly || params.get("saved") === "1";
  const mineOnly = params.get("mine") === "1";
  const statusFilter = mineOnly && selectedStatus === ALL ? "My campaigns" : selectedStatus;
  const [state, setState] = useState<State | null>(() => isLocalPreview ? {
    ok: true, contractId: "Local preview, no deployed contract", viewer: PREVIEW_WALLET.address,
    now: String(PREVIEW_TIME), campaigns: PREVIEW_CAMPAIGNS,
  } : null);
  const [loading, setLoading] = useState(!isLocalPreview);
  const [olderLoading, setOlderLoading] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const [nextCursor, setNextCursor] = useState("0");
  const [saved, setSaved] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<"browser" | "account" | null>(null);
  const [savedStatus, setSavedStatus] = useState<"loading" | "device" | "account" | "failed">("loading");
  const [savedMutation, setSavedMutation] = useState<string | null>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusTriggerRef = useRef<HTMLButtonElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const statusOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { identity, captureOwnerRevision, isCurrentOwner } = useCirclesSignupIdentity(() => {
    setSaved([]);
    setSaveError(null);
    setSavedStatus("loading");
  });
  const updateParams = useCallback((updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) value ? next.set(key, value) : next.delete(key);
    const queryString = next.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`, { scroll: false });
  }, [params, pathname, router]);

  const refresh = useCallback(async () => {
    if (isLocalPreview) return;
    setLoading(true);
    setOlderError(false);
    try {
      // Read from the active history entry before the first await or reset.
      // On Back, this component can mount before its snapshot hook rerenders.
      const pagesToRestore = parseLoadedCampaignPages(getNavigationViewStateSnapshot(TESTNET_CAMPAIGNS_VIEW));
      setRestoreCampaignPageCount(pagesToRestore);
      const first = await campaignState("", "0");
      if (!first.ok) throw new Error(first.error);
      let accumulated = first;
      let cursor = first.campaigns.length === 10 ? first.campaigns.at(-1)!.id : "0";
      loadedCampaignPages.current = 0;
      setLoadedCampaignPageCount(0);
      setState(first);
      setNextCursor(cursor);
      writeNavigationViewState(TESTNET_CAMPAIGNS_VIEW, { pages: 0 });

      for (let page = 0; page < pagesToRestore && cursor !== "0"; page++) {
        const older = await campaignState("", cursor);
        if (!older.ok) { setOlderError(true); break; }
        accumulated = appendCampaignPage(accumulated, older);
        cursor = older.campaigns.length === 10 ? older.campaigns.at(-1)!.id : "0";
        loadedCampaignPages.current = page + 1;
        setLoadedCampaignPageCount(page + 1);
        setState(accumulated);
        setNextCursor(cursor);
        writeNavigationViewState(TESTNET_CAMPAIGNS_VIEW, { pages: page + 1 });
      }
      setNextCursor(cursor);
    } catch { setState({ ok: false, error: copy("Campaigns could not load. Refresh to retry.") }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!isLocalPreview) {
      const initialLoad = setTimeout(() => void refresh(), 0);
      return () => clearTimeout(initialLoad);
    }
  }, [refresh]);

  useEffect(() => {
    let active = true;
    const current = identity;
    const localKey = current.status === "verified" ? `${SAVED_KEY}:${current.ownerId}` : SAVED_KEY;
    const readDeviceCopy = () => {
      const value: unknown = JSON.parse(localStorage.getItem(localKey) || "[]");
      return Array.isArray(value) && value.every(id => typeof id === "string" && /^[1-9]\d{0,19}$/.test(id)) ? value as string[] : [];
    };
    if (current.status === "loading") {
      setSaved([]); setSavedStatus("loading"); setSaveError(null);
      return () => { active = false; };
    }
    if (current.status === "unavailable") {
      setSaved([]); setSavedStatus("failed"); setSaveError("account");
      return () => { active = false; };
    }
    if (current.status !== "verified") {
      try { setSaved(readDeviceCopy()); setSavedStatus("device"); setSaveError(null); }
      catch { setSaved([]); setSavedStatus("failed"); setSaveError("browser"); }
      return () => { active = false; };
    }
    let deviceCopy: string[] = [];
    try { deviceCopy = readDeviceCopy(); setSaved(deviceCopy); }
    catch { setSaveError("browser"); }
    setSavedStatus("loading");
    const ownerRevision = captureOwnerRevision();
    void readAccountSavedCampaigns(current.ownerId).then(result => {
      if (!active || !isCurrentOwner(ownerRevision)) return;
      if (!result.ok) { setSaved(deviceCopy); setSavedStatus("failed"); setSaveError("account"); return; }
      setSaved(result.campaignIds); setSavedStatus("account"); setSaveError(null);
      try { localStorage.setItem(localKey, JSON.stringify(result.campaignIds)); } catch { /* The account copy remains authoritative. */ }
    }).catch(() => {
      if (!active || !isCurrentOwner(ownerRevision)) return;
      setSaved(deviceCopy); setSavedStatus("failed"); setSaveError("account");
    });
    return () => { active = false; };
  }, [identity, captureOwnerRevision, isCurrentOwner]);

  const loadOlder = async () => {
    if (!nextCursor || nextCursor === "0" || olderLoading) return;
    setOlderLoading(true);
    setOlderError(false);
    try {
      const next = await campaignState("", nextCursor);
      if (!next.ok) throw new Error(next.error);
      setState(previous => previous?.ok ? appendCampaignPage(previous, next) : next);
      const cursor = next.campaigns.length === 10 ? next.campaigns.at(-1)!.id : "0";
      setNextCursor(cursor);
      const pages = Math.min(MAX_RESTORABLE_CAMPAIGN_PAGES, loadedCampaignPages.current + 1);
      loadedCampaignPages.current = pages;
      setLoadedCampaignPageCount(pages);
      writeNavigationViewState(TESTNET_CAMPAIGNS_VIEW, { pages });
    } catch { setOlderError(true); }
    finally { setOlderLoading(false); }
  };

  const campaigns = state?.ok ? state.campaigns : [];
  const now = state?.ok ? BigInt(state.now) : 0n;
  const circleLinks = state?.ok && "circleLinks" in state
    ? state.circleLinks
    : isLocalPreview ? PREVIEW_CIRCLE_LINKS : undefined;
  const categoryFilters = useMemo(() => CATEGORY_ORDER.map(id => ({ id, label: circlesCategory(locale, id) })), [locale]);
  const availableStatuses = useMemo(() => [...new Set(campaigns.map(campaign => d4CampaignStatus(campaign, now)))], [campaigns, now]);
  const validStatus = statusFilter || ALL;
  const validCategory = selectedCategory === ALL || CATEGORY_ORDER.includes(selectedCategory as CircleCategory) ? selectedCategory : ALL;
  const statusCampaigns = filterD4Campaigns(campaigns, statusFilter === ALL ? validStatus : statusFilter, query, state?.ok ? state.viewer : null, now);
  const visible = statusCampaigns.filter(campaign => !savedOnly || saved.includes(campaign.id))
    .filter(campaign => validCategory === ALL || categoryFor(campaign, circleLinks) === validCategory);
  const campaignPagesResolved = loadedCampaignPageCount >= restoreCampaignPageCount || olderError
    || state?.ok === false || !loading && nextCursor === "0";
  const featuredCampaign = campaigns.find(campaign => campaign.state === "Funding" && now < BigInt(campaign.config.funding_deadline));
  const featured = !savedOnly && featuredCampaign && visible.some(campaign => campaign.id === featuredCampaign.id) ? featuredCampaign : undefined;
  const rest = visible.filter(campaign => campaign.id !== featured?.id);

  function toggleSaved(campaignId: string) {
    if (savedMutation) return;
    const current = identity;
    const nextSaved = saved.includes(campaignId) ? saved.filter(id => id !== campaignId) : [campaignId, ...saved];
    const savedNow = nextSaved.includes(campaignId);
    const localKey = current.status === "verified" ? `${SAVED_KEY}:${current.ownerId}` : SAVED_KEY;
    if (current.status === "verified") {
      setSavedMutation(campaignId);
      const ownerRevision = captureOwnerRevision();
      try { localStorage.setItem(localKey, JSON.stringify(nextSaved)); } catch { /* The server action remains authoritative. */ }
      void setAccountSavedCampaign(campaignId, savedNow, current.ownerId).then(result => {
        if (!isCurrentOwner(ownerRevision)) return;
        if (!result.ok) { setSaved(nextSaved); setSavedStatus("failed"); setSaveError("account"); return; }
        setSaved(nextSaved); setSavedStatus("account"); setSaveError(null);
        try { localStorage.setItem(localKey, JSON.stringify(nextSaved)); } catch { /* The account copy remains saved. */ }
      }).catch(() => {
        if (!isCurrentOwner(ownerRevision)) return;
        setSaved(nextSaved); setSavedStatus("failed"); setSaveError("account");
      }).finally(() => setSavedMutation(null));
      return;
    }
    if (current.status !== "guest" && current.status !== "unverified") return;
    try {
      localStorage.setItem(localKey, JSON.stringify(nextSaved));
      setSaved(nextSaved); setSavedStatus("device"); setSaveError(null);
    } catch { setSaveError("browser"); }
  }

  const statusOptions = [...new Set([ALL, ...availableStatuses, ...(selectedStatus !== ALL ? [selectedStatus] : []), ...(state?.ok && state.viewer ? ["My campaigns"] : [])])];
  const statusLabel = (status: string) => status === ALL ? copy("Status") : d4CampaignStatusFilterLabel(status, locale);
  const statusOptionLabel = (status: string) => status === ALL ? copy("All") : d4CampaignStatusFilterLabel(status, locale);
  useEffect(() => {
    if (!statusMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!statusTriggerRef.current?.contains(target) && !statusMenuRef.current?.contains(target)) setStatusMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setStatusMenuOpen(false);
      statusTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    statusOptionRefs.current.find(option => option?.getAttribute("aria-checked") === "true")?.focus();
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [statusMenuOpen]);
  const chooseStatus = (status: string) => {
    updateParams({ s: status === ALL ? null : status });
    setStatusMenuOpen(false);
    statusTriggerRef.current?.focus();
  };
  const onStatusMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = statusOptions.findIndex(option => option === validStatus);
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % statusOptions.length;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + statusOptions.length) % statusOptions.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = statusOptions.length - 1;
    if (nextIndex !== null) {
      event.preventDefault();
      statusOptionRefs.current[nextIndex]?.focus();
    }
  };
  const searchLabel = copy("Search campaigns");
  const searchPlaceholder = copy("Search causes");
  const cardCampaign = (campaign: Campaign) => <CauseCard key={campaign.id} campaign={campaign} circleId={circleLinks?.[campaign.id]}
    now={now} category={categoryFor(campaign, circleLinks) ? circlesCategory(locale, categoryFor(campaign, circleLinks) as CircleCategory) : ""}
    featured={campaign.id === featured?.id} saved={saved.includes(campaign.id)} onSave={() => toggleSaved(campaign.id)} localPreview={isLocalPreview}
    saveDisabled={identity.status === "loading" || identity.status === "unavailable" || savedStatus === "loading" || savedMutation === campaign.id} />;

  return <div className={styles.screen}
    data-testnet-campaign-list-ready={!loading && campaignPagesResolved ? "true" : "false"}>
    <header className={styles.header}>
      <button type="button" className={styles.back} onClick={savedOnly ? backToYou : backHome} aria-label={copy("Back")}>‹</button>
      <h1>{savedOnly ? copy("Saved causes") : mineOnly ? copy("Your causes") : copy("Causes")}</h1>
    </header>

    {!savedOnly && !mineOnly && <section className={styles.search} aria-label={copy("Campaign search")}>
      <MagnifyingGlass size={18} aria-hidden="true" />
      <input type="search" aria-label={searchLabel} placeholder={searchPlaceholder} autoComplete="off" value={query}
        onChange={event => updateParams({ q: event.target.value || null })} />
      {query && <button type="button" aria-label={copy("Clear search")} onClick={() => updateParams({ q: null })}><X size={18} aria-hidden="true" /></button>}
    </section>}

    {!savedOnly && !mineOnly && state?.ok && <div className={styles.filters}>
      <div className={styles.chips} role="group" aria-label={copy("Campaign filters")}>
        {statusOptions.length > 1 && <button ref={statusTriggerRef} type="button" className={styles.statusPicker}
          aria-label={`${copy("Status")}: ${statusLabel(validStatus)}`} aria-haspopup="menu" aria-expanded={statusMenuOpen}
          aria-controls="campaign-status-menu" onClick={() => setStatusMenuOpen(open => !open)}>
          <span className={styles.statusPickerLabel}>{statusLabel(validStatus)}</span>
          <CaretDown size={16} aria-hidden="true" className={statusMenuOpen ? styles.statusCaretOpen : undefined} />
        </button>}
        {statusOptions.length > 1 && <span className={styles.filterRule} aria-hidden="true" />}
        <button type="button" className={styles.categoryFilter} aria-pressed={validCategory === ALL}
          onClick={() => updateParams({ c: null })}><span className={styles.categoryArt}><CauseCategoryDoodle category="all" /></span>{copy("All")}</button>
        {categoryFilters.map(category => <button type="button" key={category.id} className={styles.categoryFilter}
          aria-pressed={validCategory === category.id} onClick={() => updateParams({ c: validCategory === category.id ? null : category.id })}>
          <span className={styles.categoryArt}><CauseCategoryDoodle category={category.id as CircleCategory} /></span>{category.label}
        </button>)}
      </div>
      {statusMenuOpen && statusOptions.length > 1 && <div ref={statusMenuRef} id="campaign-status-menu" className={styles.statusMenu}
        role="menu" aria-label={copy("Status")} onKeyDown={onStatusMenuKeyDown}>
        {statusOptions.map((status, index) => <button key={status} ref={node => { statusOptionRefs.current[index] = node; }}
          type="button" role="menuitemradio" aria-checked={validStatus === status} className={styles.statusMenuOption}
          onClick={() => chooseStatus(status)}>
          <span>{statusOptionLabel(status)}</span>
          {validStatus === status && <Check size={20} weight="bold" aria-hidden="true" />}
        </button>)}
      </div>}
    </div>}

    {loading && <div className={styles.loading} role="status">{copy("Loading causes")}…</div>}
    {state && !state.ok && <div className={styles.empty} role="alert"><h2>{copy("Causes could not load")}</h2><p>{state.error}</p><button type="button" onClick={() => void refresh()}>{copy("Try again")}</button></div>}
    {saveError && <p className={styles.saveError} role="status">{saveError === "browser"
      ? copy("Saved causes could not be updated in this browser.")
      : copy("Saved causes could not be synced to your account. This device copy may differ.")}</p>}
    {savedOnly && savedStatus === "loading" && <div className={styles.loading} role="status">{copy("Loading saved causes")}…</div>}
    {state?.ok && !loading && <>
      {mineOnly && !state.viewer ? <div className={styles.empty} role="status">
        <h2>{copy("Your causes")}</h2><p>{copy("Sign in to manage your causes.")}</p>
        <Link href={`/signin?next=${encodeURIComponent("/manage")}`} className={styles.browse}>{copy("Create a cause")}</Link>
      </div> : null}
      {featured && cardCampaign(featured)}
      {rest.length > 0 && <>
        {!savedOnly && <div className={styles.collectionHead}>
          {featured && <h2>{copy("All causes")}</h2>}
          <div className={styles.layout} role="group" aria-label={copy("Cause layout")}>
            <button type="button" aria-label={copy("Grid view")} title={copy("Grid view")} aria-pressed={layout === "grid"}
              onClick={() => updateParams({ view: layout === "grid" ? null : "grid" })}><GridFour size={18} aria-hidden="true" /></button>
            <button type="button" aria-label={copy("List view")} title={copy("List view")} aria-pressed={layout === "list"}
              onClick={() => updateParams({ view: layout === "list" ? null : "list" })}><ListBullets size={18} aria-hidden="true" /></button>
          </div>
        </div>}
        <div className={styles.grid} data-layout={savedOnly ? "list" : layout} aria-label={copy("Campaign results")}>
          {rest.map(cardCampaign)}
        </div>
      </>}
      {visible.length === 0 && (!savedOnly || savedStatus !== "loading") && (!mineOnly || !!state.viewer) && <div className={styles.empty} role="status">
        {savedOnly && <Image src="/illustrations/empty-causes.png" alt="" width={96} height={96} />}
        <h2>{savedOnly ? copy("No saved causes") : mineOnly ? copy("No causes yet") : query ? `${copy("No results for")} “${query.trim()}”` : copy("No causes match")}</h2>
        <p>{savedOnly ? copy("Tap the bookmark on a cause to keep it here.") : mineOnly ? "Create a campaign with fixed recipients, deadlines, and reviewers." : copy("Try all causes, another category, or load older causes.")}</p>
        {savedOnly
          ? <Link href="/campaigns?mode=testnet" className={styles.browse}>{copy("Browse causes")}</Link>
          : mineOnly ? <Link href="/create" className={styles.browse}>{copy("Create a cause")}</Link>
            : (query || validCategory !== ALL || validStatus !== ALL) && <button type="button" onClick={() => updateParams({ q: null, c: null, s: null, saved: null })}>{copy("Clear filters")}</button>}
      </div>}
      {nextCursor !== "0" && <button type="button" className={styles.loadOlder} disabled={olderLoading} onClick={() => void loadOlder()}>
        {olderLoading ? copy("Loading older campaigns") : copy("Load older campaigns")}
      </button>}
      {olderError && <p className={styles.saveError} role="alert">{copy("Older campaigns could not load. Try again.")}</p>}
      {!isLocalPreview && <p className={styles.disclosure}>{copy("Campaign terms and balances are read from the Stellar Testnet D4 contract. Category labels are Salapi discovery metadata; they are not contract fields.")}</p>}
    </>}
  </div>;
}
