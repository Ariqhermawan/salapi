"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowsClockwise,
  Bell,
  CaretDown,
  Info,
  PaperPlaneTilt,
  QrCode,
  Question,
  X,
} from "@phosphor-icons/react";
import { usePathname, useSearchParams } from "next/navigation";
import { PROTOTYPE_CAUSES, type PrototypeCause } from "@/lib/prototype-causes";
import styles from "./PrototypeHomeScreen.module.css";

const BALANCE_KEY = "salapi.prototype-home.hide-balance.v1";
const DONORS = [
  { handle: "@jamal_r", amount: "$25" },
  { handle: "@ana.reyes", amount: "$5" },
];
const CAMPAIGN_ORDER = ["bantayan", "mei", "jakarta-kitchen", "bohol-library", "tita-ana", "baybayin-zines", "water-point", "river-cleanup"];
const USD = (cents: number) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PrototypeHomeScreen() {
  const [currency, setCurrency] = useState<"USDC" | "XLM">("USDC");
  const [hidden, setHidden] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [pricesOpen, setPricesOpen] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState("Nov 6, 2026, 8:10:04 PM");
  const pathname = usePathname();
  const search = useSearchParams();
  const causes = useMemo(() => CAMPAIGN_ORDER
    .map(id => PROTOTYPE_CAUSES.find(cause => cause.id === id))
    .filter((cause): cause is PrototypeCause => cause !== undefined), []);

  useEffect(() => {
    try { setHidden(window.localStorage.getItem(BALANCE_KEY) === "1"); }
    catch { setHidden(false); }
  }, []);

  useEffect(() => {
    if (!currencyOpen && !pricesOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setCurrencyOpen(false); setPricesOpen(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currencyOpen, pricesOpen]);

  const updateReady = pathname === "/" && search.get("update") === "ready";
  const toggleHidden = () => setHidden(current => {
    const next = !current;
    try { window.localStorage.setItem(BALANCE_KEY, next ? "1" : "0"); }
    catch { /* The visibility control still works for this visit. */ }
    return next;
  });
  const showComingSoon = () => window.dispatchEvent(new CustomEvent("salapi:success-motion", { detail: "Social feed is coming soon" }));

  return <div className={styles.home} data-testid="prototype-home">
    <header className={styles.greeting}>
      <Link href="/you" className={styles.mark} aria-label="Your account">
        <Image src="/salapi-mark-prototype.svg" alt="Salapi" width={28} height={28} priority />
      </Link>
      <h1>Welcome to Salapi</h1>
      <Link href="/learn" className={styles.round} aria-label="Help"><Question size={24} aria-hidden="true" /></Link>
      <Link href="/notifications" className={styles.round} aria-label="Notifications"><Bell size={24} aria-hidden="true" /></Link>
    </header>

    <section className={styles.balance} aria-label="Total balance">
      <div className={styles.balanceHeader}>
        <span>Total balance <span className={styles.testnet}>Testnet</span></span>
        <Image src="/stellar-white.png" alt="Powered by Stellar" width={68} height={17} />
      </div>
      <div className={styles.balanceAmount}>
        <strong>{hidden ? "••••••" : currency === "USDC" ? "2,412.26" : "21,524.78"}</strong>
        {!hidden && <button type="button" className={styles.currency} aria-label={`Balance shown in ${currency}. Change`} onClick={() => setCurrencyOpen(true)}>
          {currency}<CaretDown size={16} aria-hidden="true" />
        </button>}
      </div>
      {hidden ? <button type="button" className={styles.priceLine} onClick={toggleHidden}>Hidden. Show it in Security</button> :
        <button type="button" className={styles.priceLine} aria-label="Price details" onClick={() => setPricesOpen(true)}>
          <span>≈ {currency === "USDC" ? "21,524.78 XLM" : "$2,412.26 USDC"}</span><Info size={15} aria-hidden="true" />
        </button>}
    </section>

    <nav className={styles.actions} aria-label="Wallet actions">
      <Action href="/topup" label="Top up"><ArrowDown size={20} aria-hidden="true" /></Action>
      <Action href="/withdraw" label="Withdraw"><ArrowUp size={20} aria-hidden="true" /></Action>
      <Action href="/send" label="Send"><PaperPlaneTilt size={20} aria-hidden="true" /></Action>
      <Action href="/receive" label="Receive"><QrCode size={20} aria-hidden="true" /></Action>
    </nav>

    <section className={styles.ticker} aria-label="Sample donation activity">
      <span className={styles.live}><i />SAMPLE</span>
      <div className={styles.tickerWindow}>
        <div className={styles.tickerTrack}>
          {[...causes, ...causes].flatMap((cause, index) => DONORS.map((donor, donorIndex) => {
            const copy = index >= causes.length;
            return <Link key={`${index}-${cause.id}-${donorIndex}`} href={`/cause/${cause.id}`} className={styles.tickerItem} aria-hidden={copy || undefined} tabIndex={copy ? -1 : undefined}>
              <strong>{donor.handle}</strong><span>gave</span><strong>{donor.amount}</strong><span>to</span><span>{cause.id === "bantayan" ? "Bantayan Island school roofs" : cause.id === "mei" ? "Ate Mei needs dialysis" : cause.id === "jakarta-kitchen" ? "North Jakarta community kitchen" : cause.id === "bohol-library" ? "Barangay library in Bohol" : cause.title}</span>
            </Link>;
          }))}
        </div>
      </div>
    </section>

    <section className={styles.causes} aria-labelledby="prototype-home-causes">
      <div className={styles.sectionHeading}>
        <h2 id="prototype-home-causes">Causes</h2>
        <Link href="/campaigns?mode=testnet">See all</Link>
      </div>
      <div className={styles.causeRow} aria-label="Featured causes">
        {causes.map((cause, index) => <CauseCard key={cause.id} cause={cause} featured={index === 0} />)}
      </div>
    </section>

    <section className={styles.tiles} aria-label="More from Salapi">
      <Link href="/vaults" className={styles.tile}>
        <Image src="/illustrations/tile-arisan.png" alt="" width={44} height={32} />
        <strong>Arisan</strong>
      </Link>
      <Link href="/vault" className={styles.tile}>
        <Image src="/illustrations/tile-vault.png" alt="" width={44} height={32} />
        <strong>Disaster Vault</strong><span>$1,284.20</span>
      </Link>
      <button type="button" className={styles.tile} data-coming-soon onClick={showComingSoon}>
        <Image src="/illustrations/tile-feed.png" alt="" width={44} height={32} />
        <strong>Social feed</strong><span>Coming soon</span>
      </button>
    </section>

    {updateReady ? <div className={styles.update} role="status">
      <span aria-hidden="true">↓</span><strong>Update ready</strong>
      <button type="button" onClick={() => window.location.assign("/")}>Update</button>
      <button type="button" aria-label="Dismiss update notice" onClick={() => window.history.replaceState(null, "", "/")}>×</button>
    </div> : null}

    {currencyOpen ? <BottomSheet title="Show balance in" onClose={() => setCurrencyOpen(false)}>
      <div className={styles.currencyOptions} role="radiogroup" aria-label="Balance currency">
        {(["USDC", "XLM"] as const).map(option => <button key={option} type="button" role="radio" aria-checked={currency === option} onClick={() => { setCurrency(option); setCurrencyOpen(false); }}>
          <span><i className={option === "USDC" ? styles.usdcIcon : styles.xlmIcon}>{option === "USDC" ? "$" : "✦"}</i>{option} · {option === "USDC" ? "USD Coin" : "Stellar Lumens"}</span><i className={styles.radio} />
        </button>)}
      </div>
    </BottomSheet> : null}

    {pricesOpen ? <BottomSheet title="Prices" onClose={() => setPricesOpen(false)}>
      <dl className={styles.priceRows}>
        <div><dt><i className={styles.xlmIcon}>✦</i>XLM</dt><dd>$0.1120489</dd></div>
        <div><dt><i className={styles.usdcIcon}>$</i>USDC</dt><dd>$0.999532</dd></div>
        <div><dt>Updated</dt><dd>{refreshedAt}</dd></div>
      </dl>
      <p className={styles.priceSource}>Prices by <span><b>◉</b> CoinGecko</span></p>
      <button className={styles.refresh} type="button" onClick={() => setRefreshedAt(new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" }))}>
        <ArrowsClockwise size={18} aria-hidden="true" />Refresh prices
      </button>
    </BottomSheet> : null}
  </div>;
}

function Action({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return <Link href={href} className={styles.action} aria-label={label}>
    <span>{children}</span>{label}
  </Link>;
}

function CauseCard({ cause, featured }: { cause: PrototypeCause; featured: boolean }) {
  const progress = Math.min(100, Math.round(cause.raised / cause.target * 10_000) / 100);
  const category = cause.category;
  const raised = USD(cause.raised);
  const target = USD(cause.target);
  return <Link href={`/cause/${cause.id}`} className={styles.causeCard} aria-label={`${category} ${featured ? "Featured " : ""}${cause.title} ${progress}% of goal, ${raised} USDC raised of ${target}`} data-featured={featured || undefined}>
    <span className={styles.cover}>
      {cause.image ? <Image src={cause.image} alt="" fill sizes="156px" /> : <span className={styles.coverFallback} aria-hidden="true">♡</span>}
      <span className={styles.category}>{category}</span>
      {cause.alsoIn?.length ? <span className={styles.extra}>+{cause.alsoIn.length}</span> : null}
      {featured ? <span className={styles.ribbon}>FEATURED</span> : null}
      {cause.status !== "Funding" ? <span className={styles.status}>{cause.status}</span> : null}
    </span>
    <span className={styles.cardBody}>
      <strong>{cause.title}</strong>
      <span className={styles.progress} role="img" aria-label={`${progress}% of goal`}><i style={{ width: `${progress}%` }} /></span>
      <span className={styles.raised}>≈ {raised} USDC</span>
      <span className={styles.goal}>raised of {target}</span>
    </span>
  </Link>;
}

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className={styles.backdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={styles.sheet} role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button type="button" aria-label="Close" onClick={onClose}><X size={21} aria-hidden="true" /></button></header>
      {children}
    </section>
  </div>;
}
