"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookmarkSimple, CaretDown, GridFour, ImageSquare, ListBullets, MagnifyingGlass, X } from "@phosphor-icons/react";
import { campaignState } from "@/app/campaign-actions";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { SEED_CIRCLES } from "@/lib/circles/seed";
import type { CircleCategory } from "@/lib/circles/types";
import { circlesCategory } from "@/lib/i18n/revamp-circles";
import { useT } from "@/components/I18nProvider";
import type { Campaign } from "@/lib/campaign";
import { isLocalPreview, PREVIEW_CAMPAIGNS, PREVIEW_TIME, PREVIEW_WALLET } from "@/lib/local-preview";
import { campaignDiscoveryCopy } from "@/lib/i18n/revamp-campaign-discovery";
import { d4CampaignStatus, filterD4Campaigns, type D4CampaignLayout } from "@/lib/campaign-discovery";
import { formatStroops } from "@/lib/format-stroops";
import { formatIllustrativeUsd } from "@/lib/money";
import { useGoBack } from "@/lib/ui/useGoBack";
import { vaultCampaignMedia } from "@/lib/vault-campaign-media";
import CauseCategoryDoodle from "@/components/ui/CauseCategoryDoodle";
import PrototypeCausesScreen from "@/components/screens/PrototypeCausesScreen";
import styles from "./CampaignCausesScreen.module.css";

type State = Awaited<ReturnType<typeof campaignState>>;
type CampaignRow = Campaign;
type Category = { id: string; label: string; count: number };
const SAVED_KEY = "salapi.d4.saved-campaigns.v1";
const ALL = "All";
const PREVIEW_CIRCLE_LINKS: Record<string, string> = {
  "101": "tino-relief",
  "102": "ate-mei-dialysis",
  "103": "barangay-library",
};

function categoryFor(campaign: Campaign, circleLinks: Record<string, string> | undefined): string {
  const circleId = circleLinks?.[campaign.id];
  return circleId ? SEED_CIRCLES.find(circle => circle.id === circleId)?.category ?? "" : "";
}

function Cover({ category, mediaSrc }: { category: string; mediaSrc?: string }) {
  if (mediaSrc) return <Image src={mediaSrc} fill sizes="(max-width: 500px) 100vw, 500px" alt="" className={styles.coverImage} />;
  return <span className={styles.coverEmpty} data-category={category || "general"} aria-hidden="true"><ImageSquare size={28} /></span>;
}

function StatusChip({ status, overPhoto = false }: { status: string; overPhoto?: boolean }) {
  const tone = status === "Released" ? "success" : status === "Funding" ? "info"
    : status === "In review" || status === "PendingProof" ? "info"
      : status === "Refund available" || status === "Ready to close" || status === "Awaiting proof" ? "warning" : "faded";
  return <span className={`${styles.status} ${styles[`status_${tone}`]} ${overPhoto ? styles.statusPhoto : ""}`}>{status}</span>;
}

function CategoryChip({ label, category }: { label: string; category: string }) {
  return <span className={styles.categoryChip} data-category={category}>{label}</span>;
}

function CauseCard({ campaign, status, category, featured, saved, onSave, localPreview }: {
  campaign: CampaignRow; status: string; category: string; featured?: boolean; saved: boolean;
  onSave: () => void; localPreview: boolean;
}) {
  const href = `/campaigns?id=${encodeURIComponent(campaign.id)}`;
  const categoryId = category.toLowerCase().replace(/[^a-z]+/g, "-");
  const raised = formatIllustrativeUsd(campaign.total);
  const amount = formatStroops(campaign.total);
  const media = vaultCampaignMedia(campaign, localPreview);
  return <span className={styles.cardWrap} data-featured={featured || undefined} data-short={featured || undefined}>
    <Link href={href} className={`${styles.causeCard} ${featured ? styles.featuredCard : styles.smallCard}`} data-featured={featured || undefined}>
      <span className={styles.cover}>
        <Cover category={categoryId} mediaSrc={media?.coverSrc} />
        <span className={styles.coverTags}>
          <span>{category ? <CategoryChip label={category} category={categoryId} /> : <CategoryChip label="Stellar Testnet" category="general" />}</span>
          <StatusChip status={status} overPhoto />
        </span>
        {featured && <span className={styles.featuredRibbon}>Featured</span>}
      </span>
      <span className={styles.cardBody}>
        {featured ? <>
          <span className={styles.causeTitle}>{campaign.title}</span>
          <span className={styles.causeSub}>{category || "Stellar Testnet campaign"}</span>
        </> : <>
          <span className={styles.causeTitleSmall}>{campaign.title}</span>
          <span className={styles.causeSub}>{category || "Stellar Testnet campaign"}</span>
        </>}
        <span className={styles.amountRow}>
          <span><strong>{raised}</strong><small> raised · {amount} XLM total</small></span>
          {!featured && <span className={styles.openIcon} aria-hidden="true">↗</span>}
        </span>
      </span>
    </Link>
    <button type="button" className={styles.saveButton} aria-pressed={saved}
      aria-label={saved ? `Remove ${campaign.title} from saved causes` : `Save ${campaign.title}`}
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
  const [saveError, setSaveError] = useState(false);

  const updateParams = useCallback((updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) value ? next.set(key, value) : next.delete(key);
    const queryString = next.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`, { scroll: false });
  }, [params, pathname, router]);

  const refresh = useCallback(async () => {
    if (isLocalPreview) return;
    setLoading(true);
    try {
      const first = await campaignState("", "0");
      setState(first);
      setNextCursor(first.ok && first.campaigns.length === 10 ? first.campaigns.at(-1)!.id : "0");
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
    const initialLoad = setTimeout(() => {
      try {
        const value: unknown = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
        if (Array.isArray(value) && value.every(id => typeof id === "string" && /^\d{1,20}$/.test(id))) setSaved(value);
      } catch { setSaveError(true); }
    }, 0);
    return () => clearTimeout(initialLoad);
  }, []);

  const loadOlder = async () => {
    if (!nextCursor || nextCursor === "0" || olderLoading) return;
    setOlderLoading(true);
    setOlderError(false);
    try {
      const next = await campaignState("", nextCursor);
      if (!next.ok) throw new Error(next.error);
      setState(previous => {
        if (!previous?.ok) return next;
        const ids = new Set(previous.campaigns.map(campaign => campaign.id));
        const campaigns = [...previous.campaigns, ...next.campaigns.filter(campaign => !ids.has(campaign.id))];
        const circleLinks = { ...("circleLinks" in previous ? previous.circleLinks : {}), ...(next.circleLinks ?? {}) };
        return { ...next, campaigns, ...(Object.keys(circleLinks).length ? { circleLinks } : {}) };
      });
      setNextCursor(next.campaigns.length === 10 ? next.campaigns.at(-1)!.id : "0");
    } catch { setOlderError(true); }
    finally { setOlderLoading(false); }
  };

  const campaigns = state?.ok ? state.campaigns : [];
  const now = state?.ok ? BigInt(state.now) : 0n;
  const circleLinks = state?.ok && "circleLinks" in state
    ? state.circleLinks
    : isLocalPreview ? PREVIEW_CIRCLE_LINKS : undefined;
  const availableCategories: Category[] = useMemo(() => {
    const categories = new Map<string, number>();
    for (const campaign of campaigns) {
      const category = categoryFor(campaign, circleLinks);
      if (category) categories.set(category, (categories.get(category) ?? 0) + 1);
    }
    return [...categories].map(([id, count]) => ({ id, count, label: circlesCategory(locale, id as CircleCategory) }));
  }, [campaigns, circleLinks, locale]);
  const availableStatuses = useMemo(() => [...new Set(campaigns.map(campaign => d4CampaignStatus(campaign, now)))], [campaigns, now]);
  const validStatus = statusFilter || ALL;
  const validCategory = selectedCategory === ALL || availableCategories.some(category => category.id === selectedCategory) ? selectedCategory : ALL;
  const statusCampaigns = filterD4Campaigns(campaigns, statusFilter === ALL ? validStatus : statusFilter, query, state?.ok ? state.viewer : null, now);
  const visible = statusCampaigns.filter(campaign => !savedOnly || saved.includes(campaign.id))
    .filter(campaign => validCategory === ALL || categoryFor(campaign, circleLinks) === validCategory);
  const featuredCampaign = campaigns.find(campaign => campaign.state === "Funding" && now < BigInt(campaign.config.funding_deadline));
  const featured = !savedOnly && featuredCampaign && visible.some(campaign => campaign.id === featuredCampaign.id) ? featuredCampaign : undefined;
  const rest = visible.filter(campaign => campaign.id !== featured?.id);

  function toggleSaved(campaignId: string) {
    const next = saved.includes(campaignId) ? saved.filter(id => id !== campaignId) : [campaignId, ...saved];
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      setSaved(next); setSaveError(false);
    } catch { setSaveError(true); }
  }

  const statusOptions = [...new Set([ALL, ...availableStatuses, ...(selectedStatus !== ALL ? [selectedStatus] : []), ...(state?.ok && state.viewer ? ["My campaigns"] : [])])];
  const searchLabel = copy("Search campaigns");
  const searchPlaceholder = copy("Search causes");
  const cardCampaign = (campaign: Campaign) => <CauseCard key={campaign.id} campaign={campaign}
    status={d4CampaignStatus(campaign, now)} category={categoryFor(campaign, circleLinks) ? circlesCategory(locale, categoryFor(campaign, circleLinks) as CircleCategory) : ""}
    featured={campaign.id === featured?.id} saved={saved.includes(campaign.id)} onSave={() => toggleSaved(campaign.id)} localPreview={isLocalPreview} />;

  return <div className={styles.screen}>
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

    {!savedOnly && campaigns.length > 0 && <div className={styles.filters}>
      <div className={styles.chips} role="group" aria-label={copy("Campaign filters")}>
        {statusOptions.length > 1 && <label className={styles.statusPicker}>
          <span className={styles.srOnly}>{copy("Status")}</span>
          <span className={styles.statusPickerLabel}>{validStatus === ALL ? copy("Status") : validStatus}</span>
          <select aria-label={copy("Status")} value={validStatus} onChange={event => updateParams({ s: event.target.value === ALL ? null : event.target.value })}>
            {statusOptions.map(status => <option key={status} value={status}>{status === ALL ? copy("Status") : status}</option>)}
          </select>
          <CaretDown size={16} aria-hidden="true" />
        </label>}
        {statusOptions.length > 1 && availableCategories.length > 0 && <span className={styles.filterRule} aria-hidden="true" />}
        <button type="button" className={styles.categoryFilter} aria-pressed={validCategory === ALL}
          onClick={() => updateParams({ c: null })}><span className={styles.categoryArt}><CauseCategoryDoodle category="all" /></span>{copy("All")}</button>
        {availableCategories.map(category => <button type="button" key={category.id} className={styles.categoryFilter}
          aria-pressed={validCategory === category.id} onClick={() => updateParams({ c: validCategory === category.id ? null : category.id })}>
          <span className={styles.categoryArt}><CauseCategoryDoodle category={category.id as CircleCategory} /></span>{category.label}
        </button>)}
      </div>
    </div>}

    {loading && <div className={styles.loading} role="status">{copy("Loading causes")}…</div>}
    {state && !state.ok && <div className={styles.empty} role="alert"><h2>{copy("Causes could not load")}</h2><p>{state.error}</p><button type="button" onClick={() => void refresh()}>{copy("Try again")}</button></div>}
    {saveError && <p className={styles.saveError} role="status">{copy("Saved causes could not be updated in this browser.")}</p>}
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
      {visible.length === 0 && (!mineOnly || !!state.viewer) && <div className={styles.empty} role="status">
        {savedOnly && <Image src="/illustrations/empty-causes.png" alt="" width={96} height={96} />}
        <h2>{savedOnly ? copy("No saved causes") : mineOnly ? copy("No causes yet") : query ? `${copy("No results for")} “${query.trim()}”` : copy("No causes match")}</h2>
        <p>{savedOnly ? copy("Tap the bookmark on a cause to keep it here.") : mineOnly ? "Create a campaign with fixed recipients, deadlines, and reviewers." : copy("Try all causes, another category, or load older causes.")}</p>
        {savedOnly
          ? <Link href="/campaigns?mode=testnet" className={styles.browse}>{copy("Browse causes")}</Link>
          : mineOnly ? <Link href="/campaigns?create=1" className={styles.browse}>{copy("Create a cause")}</Link>
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
