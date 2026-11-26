"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookmarkSimple, CaretDown, GridFour, ListBullets, MagnifyingGlass, X } from "@phosphor-icons/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useGoBack } from "@/lib/ui/useGoBack";
import { PROTOTYPE_CAUSES, PROTOTYPE_CATEGORY_ASSETS, type PrototypeCause } from "@/lib/prototype-causes";
import styles from "./PrototypeCausesScreen.module.css";

const SAVED_KEY = "salapi.local-preview.prototype-causes.v1";
const ALL = "All";
const categoryId = (category: string) => category.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, "");
const money = (cents: number) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = (cause: PrototypeCause) => cause.target ? Math.round((cause.raised / cause.target) * 10000) / 100 : 0;
const statusTone = (status: PrototypeCause["status"]) => status === "Funding" ? "funding"
  : status === "Released" ? "released" : status === "In review" ? "review" : status === "Awaiting proof" ? "waiting" : "paused";

function CausePhoto({ cause, featured = false }: { cause: PrototypeCause; featured?: boolean }) {
  return <span className={`${styles.photo} ${featured ? styles.featuredPhoto : styles.smallPhoto}`}>
    {cause.image ? <Image src={cause.image} fill sizes={featured ? "(max-width: 500px) 100vw, 480px" : "(max-width: 500px) 50vw, 230px"} alt="" /> : <span className={styles.photoEmpty} aria-hidden="true" />}
  </span>;
}

function Progress({ cause }: { cause: PrototypeCause }) {
  const value = Math.min(100, percent(cause));
  return <span className={styles.progress} role="img" aria-label={`${percent(cause)}% of goal`}>
    <span style={{ width: `${value}%` }} />
  </span>;
}

function Status({ cause }: { cause: PrototypeCause }) {
  return <span className={`${styles.status} ${styles[`status_${statusTone(cause.status)}`]}`}>{cause.status}</span>;
}

function SaveButton({ cause, saved, onClick }: { cause: PrototypeCause; saved: boolean; onClick: () => void }) {
  return <button type="button" className={styles.save} aria-pressed={saved}
    aria-label={saved ? `Remove ${cause.title} from saved causes` : `Save ${cause.title}`} onClick={onClick}>
    <BookmarkSimple size={19} weight={saved ? "fill" : "regular"} aria-hidden="true" />
  </button>;
}

function CategoryPill({ name, count }: { name: string; count?: number }) {
  return <span className={styles.categoryPill} data-category={categoryId(name)}>
    <span>{name}</span>
    {count ? <small>+{count}</small> : null}
  </span>;
}

function FeaturedCard({ cause, saved, onSave }: { cause: PrototypeCause; saved: boolean; onSave: () => void }) {
  return <article className={styles.featuredWrap}>
    <Link className={styles.featured} href={`/cause/${cause.id}`} aria-label={`${cause.title}, ${money(cause.raised)} USDC raised`}>
      <span className={styles.featuredImage}>
        <CausePhoto cause={cause} featured />
        <span className={styles.photoTags}>
          <CategoryPill name={cause.category} />
          <Status cause={cause} />
        </span>
        <span className={styles.ribbon}>Featured</span>
      </span>
      <span className={styles.featuredBody}>
        <strong className={styles.featuredTitle}>{cause.title}</strong>
        <span className={styles.organizer}>{cause.organizer} · {cause.place}</span>
        <Progress cause={cause} />
        <span className={styles.featureAmount}>
          <span><b>≈ {money(cause.raised)} USDC</b> raised of {money(cause.target)}</span>
          <strong>{percent(cause)}%</strong>
        </span>
        <span className={styles.reach}>{cause.donors} donors · {cause.daysLeft} days left</span>
      </span>
    </Link>
    <SaveButton cause={cause} saved={saved} onClick={onSave} />
  </article>;
}

function SmallCard({ cause, list = false }: { cause: PrototypeCause; list?: boolean }) {
  const [category, ...more] = [cause.category, ...(cause.alsoIn ?? [])];
  return <Link href={`/cause/${cause.id}`} className={styles.smallCard} data-list={list || undefined}>
    <span className={styles.smallImage}>
      <CausePhoto cause={cause} />
      <span className={styles.smallTop}><CategoryPill name={category} count={more.length} /></span>
      <span className={styles.smallBottom}><Status cause={cause} /></span>
    </span>
    <span className={styles.smallBody}>
      <strong>{cause.title}</strong>
      <Progress cause={cause} />
      <b className={styles.smallRaised}>{cause.raised === 0 ? "0 USDC" : `≈ ${money(cause.raised)} USDC`}</b>
      <span className={styles.smallSub}>raised of {money(cause.target)}</span>
    </span>
  </Link>;
}

export default function PrototypeCausesScreen({ initialSavedOnly = false }: { initialSavedOnly?: boolean }) {
  const params = useSearchParams();
  const pathname = usePathname() ?? "/campaigns";
  const router = useRouter();
  const backHome = useGoBack("/");
  const backToYou = useGoBack("/you");
  const query = params.get("q") ?? "";
  const selectedCategory = params.get("c") ?? ALL;
  const selectedStatus = params.get("s") ?? ALL;
  const list = params.get("view") === "list";
  const savedOnly = initialSavedOnly || params.get("saved") === "1";
  const [saved, setSaved] = useState<string[]>([]);
  const [saveError, setSaveError] = useState(false);

  const updateParams = useCallback((updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) value ? next.set(key, value) : next.delete(key);
    const queryString = next.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const value: unknown = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
        if (Array.isArray(value) && value.every(id => typeof id === "string" && /^[a-z0-9-]+$/.test(id))) setSaved(value);
      } catch { setSaveError(true); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const categories = useMemo(() => [...new Set(PROTOTYPE_CAUSES.flatMap(cause => [cause.category, ...(cause.alsoIn ?? [])]))], []);
  const statuses = useMemo(() => ["Funding", "Awaiting proof", "In review", "Released"]
    .filter(status => PROTOTYPE_CAUSES.some(cause => (cause.status === "Paused" ? "Funding" : cause.status) === status)), []);
  const validCategory = selectedCategory === ALL || categories.some(item => categoryId(item) === selectedCategory) ? selectedCategory : ALL;
  const matching = PROTOTYPE_CAUSES.filter(cause => {
    const searchable = `${cause.title} ${cause.organizer} ${cause.place} ${cause.category} ${(cause.alsoIn ?? []).join(" ")} ${cause.status}`.toLocaleLowerCase();
    const matchesText = !query.trim() || searchable.includes(query.trim().toLocaleLowerCase());
    const causeStatus = cause.status === "Paused" ? "Funding" : cause.status;
    const matchesStatus = selectedStatus === ALL || causeStatus === selectedStatus;
    const matchesCategory = validCategory === ALL || [cause.category, ...(cause.alsoIn ?? [])].some(item => categoryId(item) === validCategory);
    const matchesSaved = !savedOnly || saved.includes(cause.id);
    return matchesText && matchesStatus && matchesCategory && matchesSaved;
  });
  const featured = !savedOnly ? matching.find(cause => cause.id === "bantayan") : undefined;
  const cards = matching.filter(cause => cause.id !== featured?.id);

  function toggleSaved(cause: PrototypeCause) {
    const next = saved.includes(cause.id) ? saved.filter(id => id !== cause.id) : [cause.id, ...saved];
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      setSaved(next);
      setSaveError(false);
    } catch { setSaveError(true); }
  }

  const title = savedOnly ? "Saved causes" : "Causes";
  const selectedStatusLabel = selectedStatus === ALL ? "Status" : selectedStatus;

  return <div className={styles.screen}>
    <header className={styles.header}>
      <button type="button" className={styles.back} onClick={savedOnly ? backToYou : backHome} aria-label="Back">‹</button>
      <h1>{title}</h1>
    </header>

    {!savedOnly && <label className={styles.search}>
      <MagnifyingGlass size={18} aria-hidden="true" />
      <input type="search" aria-label="Search causes" placeholder="Search causes" autoComplete="off" value={query}
        onChange={event => updateParams({ q: event.target.value || null })} />
      {query && <button type="button" aria-label="Clear search" onClick={() => updateParams({ q: null })}><X size={18} aria-hidden="true" /></button>}
    </label>}

    {!savedOnly && <div className={styles.filters}>
      <div className={styles.chips} role="group" aria-label="Filters">
        <label className={styles.statusPicker}>
          <span>{selectedStatusLabel}</span>
          <select aria-label="Status" value={selectedStatus} onChange={event => updateParams({ s: event.target.value === ALL ? null : event.target.value })}>
            <option value={ALL}>Status</option>
            {statuses.map(status => <option key={status} value={status}>{status}</option>)}
          </select>
          <CaretDown size={16} aria-hidden="true" />
        </label>
        <span className={styles.filterRule} aria-hidden="true" />
        <button type="button" className={styles.categoryFilter} aria-pressed={validCategory === ALL}
          onClick={() => updateParams({ c: null })}>All</button>
        {categories.map(category => <button type="button" key={category} className={styles.categoryFilter}
          aria-pressed={validCategory === categoryId(category)} onClick={() => updateParams({ c: validCategory === categoryId(category) ? null : categoryId(category) })}>
          {PROTOTYPE_CATEGORY_ASSETS[category] ? <Image src={PROTOTYPE_CATEGORY_ASSETS[category]} alt="" width={24} height={24} /> : null}{category}
        </button>)}
      </div>
    </div>}

    {saveError && <p className={styles.error} role="status">Saved causes could not be updated in this browser.</p>}
    {featured && <FeaturedCard cause={featured} saved={saved.includes(featured.id)} onSave={() => toggleSaved(featured)} />}
    {cards.length > 0 && <>
      <div className={styles.collectionHead}>
        {featured && <h2>All causes</h2>}
        {!savedOnly && <div className={styles.layout} role="group" aria-label="Cause layout">
          <button type="button" aria-label="Grid view" title="Grid view" aria-pressed={!list} onClick={() => updateParams({ view: list ? null : "grid" })}><GridFour size={18} aria-hidden="true" /></button>
          <button type="button" aria-label="List view" title="List view" aria-pressed={list} onClick={() => updateParams({ view: list ? null : "list" })}><ListBullets size={18} aria-hidden="true" /></button>
        </div>}
      </div>
      <div className={styles.grid} data-layout={savedOnly || list ? "list" : "grid"} aria-label="Causes">
        {cards.map(cause => <SmallCard key={cause.id} cause={cause} list={savedOnly || list} />)}
      </div>
    </>}
    {cards.length === 0 && !featured && <div className={styles.empty} role="status">
      <h2>{savedOnly ? "No saved causes" : query ? `No results for “${query.trim()}”` : "No causes match"}</h2>
      <p>{savedOnly ? "Tap the bookmark on a cause to keep it here." : "Try all causes, another category, or another status."}</p>
      {savedOnly
        ? <Link href="/campaigns?mode=testnet" className={styles.browse}>Browse causes</Link>
        : (query || validCategory !== ALL || selectedStatus !== ALL) && <button type="button" onClick={() => updateParams({ q: null, c: null, s: null })}>Clear filters</button>}
    </div>}
  </div>;
}
