"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
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
import { previewReferralNoticeIsNew, previewUsdcBalanceCents } from "@/lib/local-preview";
import { useT } from "@/components/I18nProvider";
import { homeCopy } from "@/lib/i18n/revamp-home";
import MarketValue from "@/components/MarketValue";
import HomeDonationTicker from "@/components/HomeDonationTicker";
import type { Campaign } from "@/lib/campaign";
import styles from "./PrototypeHomeScreen.module.css";

const BALANCE_KEY = "salapi.prototype-home.hide-balance.v1";
const LIVE_BALANCE_KEY = "salapi.security.hide-home-balance.v1";
const DONORS = [
  { handle: "@jamal_r", amount: "$25" },
  { handle: "@ana.reyes", amount: "$5" },
];
const CAMPAIGN_ORDER = ["bantayan", "mei", "jakarta-kitchen", "bohol-library", "tita-ana", "baybayin-zines", "water-point", "river-cleanup"];
const USD = (cents: number) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const XLM_PER_USD = 8.92307692;

export type PrototypeHomeLiveData = {
  guest: boolean;
  handle: string | null;
  wallet: { address: string; pesos: number; nativeStroops?: string } | null;
  walletLoading: boolean;
  walletError: string;
  campaigns: Omit<Campaign, "contribution">[];
  campaignsLoading: boolean;
  onRetryWallet: () => void;
};

export default function PrototypeHomeScreen({ liveData }: { liveData?: PrototypeHomeLiveData }) {
  const { locale } = useT();
  const copy = (phrase: string) => homeCopy(locale, phrase);
  const greetingRef = useRef<HTMLHeadingElement>(null);
  const [currency, setCurrency] = useState<"USDC" | "XLM">("USDC");
  const [balanceCents, setBalanceCents] = useState(241_226);
  const [newNotification, setNewNotification] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [pricesOpen, setPricesOpen] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState("Nov 6, 2026, 8:10:04 PM");
  const pathname = usePathname();
  const search = useSearchParams();
  const causes = useMemo(() => CAMPAIGN_ORDER
    .map(id => PROTOTYPE_CAUSES.find(cause => cause.id === id))
    .filter((cause): cause is PrototypeCause => cause !== undefined), []);
  const causesLayout = search.get("causes") === "b" || search.get("causes") === "c" ? search.get("causes") : "a";

  useLayoutEffect(() => {
    const heading = greetingRef.current;
    if (!heading) return;
    const fit = () => {
      for (const size of [20, 18, 16, 14]) {
        heading.style.fontSize = `${size}px`;
        if (heading.scrollWidth <= heading.clientWidth) break;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(heading);
    document.fonts.addEventListener("loadingdone", fit);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", fit);
    };
  }, []);

  const isLive = Boolean(liveData);

  useEffect(() => {
    try { setHidden(window.localStorage.getItem(isLive ? LIVE_BALANCE_KEY : BALANCE_KEY) === "1"); }
    catch { setHidden(false); }
  }, [isLive]);

  useEffect(() => {
    if (isLive) return;
    setBalanceCents(previewUsdcBalanceCents());
    setNewNotification(previewReferralNoticeIsNew());
  }, [isLive]);

  useEffect(() => {
    if (!currencyOpen && !pricesOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setCurrencyOpen(false); setPricesOpen(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currencyOpen, pricesOpen]);

  const updateReady = pathname === "/" && search.get("update") === "ready";
  const balanceUsd = USD(balanceCents);
  const balanceXlm = ((balanceCents / 100) * XLM_PER_USD).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const toggleHidden = () => setHidden(current => {
    const next = !current;
    try { window.localStorage.setItem(isLive ? LIVE_BALANCE_KEY : BALANCE_KEY, next ? "1" : "0"); }
    catch { /* The visibility control still works for this visit. */ }
    return next;
  });
  const showComingSoon = () => window.dispatchEvent(new CustomEvent("salapi:success-motion", { detail: "Social feed is coming soon" }));
  const walletHref = (href: string) => liveData?.guest ? `/signin?next=${encodeURIComponent(href)}` : href;

  return <div className={styles.home} data-testid={liveData ? "home-dashboard" : "prototype-home"}>
    <header className={styles.greeting}>
      <Link href="/you" className={styles.mark} aria-label={copy("Your account")}>
        <Image src="/salapi-mark-prototype.svg" alt="Salapi" width={28} height={28} priority />
      </Link>
      <h1 ref={greetingRef}>{copy("Welcome to Salapi")}{liveData?.handle ? `, @${liveData.handle}` : ""}</h1>
      <Link href="/learn" className={styles.round} aria-label={copy("Help")}><Question size={24} aria-hidden="true" /></Link>
      <Link href="/notifications" className={`${styles.round} ${newNotification ? styles.hasNotification : ""}`} aria-label={copy("Notifications")}>
        <Bell size={24} aria-hidden="true" />{newNotification && <span className={styles.notificationDot} aria-hidden="true" />}
      </Link>
    </header>

    <section className={styles.balance} aria-label={liveData ? "Your Testnet wallet" : "Total balance"}>
      <div className={styles.balanceHeader}>
        <span>{liveData?.guest ? copy("Wallet") : copy("Total balance")} <span className={styles.testnet}>Testnet</span></span>
        <Image src="/stellar-white.png" alt="Powered by Stellar" width={68} height={17} />
      </div>
      {liveData ? liveData.guest ? <div className={styles.liveGuest}>
        <strong>{copy("Guest account")}</strong><Link href="/signin">{copy("Sign in to see your balance")}</Link>
      </div> : hidden ? <div className={styles.hiddenBalance}>
        <strong aria-label="Balance hidden">••••••</strong><button type="button" onClick={toggleHidden}>{copy("Show balance")}</button>
      </div> : <div className={styles.liveBalance}>
        <MarketValue nativeStroops={liveData.wallet?.nativeStroops} size={40} color="#fff" compact showNative dashboard
          balanceLoading={liveData.walletLoading}
          dashboardBalanceError={liveData.walletError ? <button type="button" className={styles.walletRetry} onClick={liveData.onRetryWallet}>{liveData.walletError} Retry</button> : undefined}
          dashboardCaption="" />
      </div> : <>
        <div className={styles.balanceAmount}>
          <strong>{hidden ? "••••••" : currency === "USDC" ? balanceUsd : balanceXlm}</strong>
          {!hidden && <button type="button" className={styles.currency} aria-label={`Balance shown in ${currency}. Change`} onClick={() => setCurrencyOpen(true)}>
            {currency}<CaretDown size={16} aria-hidden="true" />
          </button>}
        </div>
        {hidden ? <button type="button" className={styles.priceLine} onClick={toggleHidden}>{copy("Hidden. Show it in Security")}</button> :
          <button type="button" className={styles.priceLine} aria-label={copy("Price details")} onClick={() => setPricesOpen(true)}>
            <span>≈ {currency === "USDC" ? balanceXlm + " XLM" : "$" + balanceUsd + " USDC"}</span><Info size={15} aria-hidden="true" />
          </button>}
      </>}
    </section>

    <nav className={styles.actions} aria-label={copy("Wallet actions")}>
      <Action href={walletHref("/topup")} label={copy("Top up")}><ArrowDown size={20} aria-hidden="true" /></Action>
      <Action href={walletHref("/withdraw")} label={copy("Withdraw")}><ArrowUp size={20} aria-hidden="true" /></Action>
      <Action href={walletHref("/send")} label={copy("Send")}><PaperPlaneTilt size={20} aria-hidden="true" /></Action>
      <Action href={walletHref("/receive")} label={copy("Receive")}><QrCode size={20} aria-hidden="true" /></Action>
    </nav>

    {liveData ? <HomeDonationTicker campaigns={liveData.campaigns} loading={liveData.campaignsLoading} localPreview={false} /> :
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
      </section>}

    <section className={styles.causes} aria-labelledby="prototype-home-causes">
      <div className={styles.sectionHeading}>
        <h2 id="prototype-home-causes">{copy("Causes")}</h2>
        {liveData ? <span className={styles.exampleLabel}>{copy("EXAMPLES")}</span> : null}
        <Link href="/campaigns?mode=testnet">{copy("See all")}</Link>
      </div>
      {causesLayout === "b" ? <div className={styles.causeLayoutB} aria-label="Featured cause and more causes">
        {causes.slice(0, 3).map((cause, index) => index === 0 ? <Link key={cause.id} href={`/cause/${cause.id}`} className={styles.featuredCause}>
          <span className={styles.featuredPhoto}>{cause.image ? <Image src={cause.image} alt="" fill sizes="150px" /> : <span className={styles.coverFallback}>♡</span>}{index === 0 && <span className={styles.ribbon}>FEATURED</span>}</span>
          <span className={styles.featuredBody}><strong>{cause.title}</strong><span className={styles.featuredProgress}><i style={{ width: `${Math.min(100, Math.round(cause.raised / cause.target * 100))}%` }} /></span><span className={styles.featuredMoney}>≈ {USD(cause.raised)} USDC</span><small>raised of {USD(cause.target)}</small></span>
        </Link> : null)}
        <div className={styles.featuredList}>{causes.slice(1, 3).map(cause => <Link key={cause.id} href={`/cause/${cause.id}`} className={styles.featuredRow}>
          {cause.image ? <Image src={cause.image} alt="" width={32} height={32} /> : <span className={styles.rowFallback}>♡</span>}
          <span><strong>{cause.title}</strong><i><b style={{ width: `${Math.min(100, Math.round(cause.raised / cause.target * 100))}%` }} /></i></span>
          <small>{Math.round(cause.raised / cause.target * 100)}%</small>
        </Link>)}</div>
      </div> : causesLayout === "c" ? <div className={styles.causeLayoutC} aria-label="Causes grid">
        {causes.slice(0, 4).map((cause, index) => <Link key={cause.id} href={`/cause/${cause.id}`} className={styles.causeTile} data-featured={index === 0 || undefined}>
          {cause.image ? <Image src={cause.image} alt="" fill sizes="156px" /> : <span className={styles.coverFallback}>♡</span>}
          <span className={styles.causeTileShade} />{index === 0 ? <span className={styles.ribbon}>FEATURED</span> : null}
          <span className={styles.causeTileCopy}><strong>{cause.title}</strong><span><i><b style={{ width: `${Math.min(100, Math.round(cause.raised / cause.target * 100))}%` }} /></i><small>{Math.round(cause.raised / cause.target * 100)}%</small></span></span>
        </Link>)}
      </div> : <div className={styles.causeRow} aria-label="Featured causes">
        {causes.map((cause, index) => <CauseCard key={cause.id} cause={cause} featured={index === 0} />)}
      </div>}
    </section>

    <section className={styles.tiles} aria-label="More from Salapi">
      <Link href="/vaults" className={styles.tile}>
        <Image src="/illustrations/tile-arisan.png" alt="" width={44} height={32} />
        <strong>{copy("Arisan")}</strong>
      </Link>
      <Link href="/vault" className={styles.tile}>
        <span className={styles.vaultPig} aria-hidden="true"><img src="/prototype-ui/disaster-vault-funded.webp" alt="" /></span>
        <strong>{copy("Disaster Vault")}</strong><span>{liveData ? copy("View vault") : "$1,284.20"}</span>
      </Link>
      <button type="button" className={styles.tile} data-coming-soon data-testid={liveData ? "social-feed-coming-soon" : undefined} disabled={Boolean(liveData)} onClick={showComingSoon}>
        <Image src="/illustrations/tile-feed.png" alt="" width={44} height={32} />
        <strong>{copy("Social feed")}</strong><span>{copy("Coming soon")}</span>
      </button>
    </section>

    {updateReady ? <div className={styles.update} role="status">
      <span aria-hidden="true">↓</span><strong>Update ready</strong>
      <button type="button" onClick={() => window.location.assign("/")}>Update</button>
      <button type="button" aria-label="Dismiss update notice" onClick={() => window.history.replaceState(null, "", "/")}>×</button>
    </div> : null}

    {!liveData && currencyOpen ? <BottomSheet title="Show balance in" onClose={() => setCurrencyOpen(false)}>
      <div className={styles.currencyOptions} role="radiogroup" aria-label="Balance currency">
        {(["USDC", "XLM"] as const).map(option => <button key={option} type="button" role="radio" aria-checked={currency === option} onClick={() => { setCurrency(option); setCurrencyOpen(false); }}>
          <span><i className={option === "USDC" ? styles.usdcIcon : styles.xlmIcon}>{option === "USDC" ? "$" : "✦"}</i>{option} · {option === "USDC" ? "USD Coin" : "Stellar Lumens"}</span><i className={styles.radio} />
        </button>)}
      </div>
    </BottomSheet> : null}

    {!liveData && pricesOpen ? <BottomSheet title="Prices" onClose={() => setPricesOpen(false)}>
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
  const progress = Math.round(cause.raised / cause.target * 10_000) / 100;
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
      <span className={styles.progress} role="img" aria-label={`${progress}% of goal`}><i style={{ width: `${Math.min(100, progress)}%` }} /></span>
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
