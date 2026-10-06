"use client";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Heart } from "@phosphor-icons/react/dist/csr/Heart";
import { Pause } from "@phosphor-icons/react/dist/csr/Pause";
import { Play } from "@phosphor-icons/react/dist/csr/Play";
import { myHandle, walletState } from "@/app/actions";
import { campaignState } from "@/app/campaign-actions";
import { Ico, Peso } from "@/components/ui/kit";
import { useT } from "@/components/I18nProvider";
import { formatStroops } from "@/lib/disaster";
import type { Campaign } from "@/lib/campaign";
import { isLocalPreview, normalizePreviewCampaigns, PREVIEW_CAMPAIGNS, PREVIEW_WALLET, PREVIEW_TIME } from "@/lib/local-preview";
import s from "./home.module.css";
import { homeCopy } from "@/lib/i18n/revamp-home";
import { homeCatalogCopy, type HomeCatalogKey } from "@/lib/i18n/revamp-home-catalog";
import HomeCirclesCatalog from "@/components/HomeCirclesCatalog";

function scrollHomeCard(strip: HTMLDivElement | null, next: number, count: number, reduceMotion: boolean): number | null {
  if (!strip || !count) return null;
  const current = (next + count) % count;
  const card = strip.children[current] as HTMLElement | undefined;
  const first = strip.children[0] as HTMLElement | undefined;
  if (!card || !first) return null;
  strip.scrollTo({ left: card.offsetLeft - first.offsetLeft, behavior: reduceMotion ? "instant" : "smooth" });
  return current;
}
export default function Home() {
  const { currency, locale } = useT();
  const copy = (phrase: string) => homeCopy(locale, phrase);
  const catalogCopy = (phrase: HomeCatalogKey, vars?: Record<string, string | number>) => homeCatalogCopy(locale, phrase, vars);
  const balanceSize = currency === "id" || currency === "vi" ? 23 : currency === "tl" ? 29 : 32;
  const [wallet, setWallet] = useState<{ pesos: number; address: string } | null>(isLocalPreview ? PREVIEW_WALLET : null);
  const [handle, setHandle] = useState<string | null>(isLocalPreview ? PREVIEW_WALLET.handle : null);
  const [campaigns, setCampaigns] = useState<Campaign[]>(isLocalPreview ? PREVIEW_CAMPAIGNS : []);
  const [loading, setLoading] = useState(!isLocalPreview);
  const [clock, setClock] = useState(isLocalPreview ? PREVIEW_TIME : 0);
  const [walletError, setWalletError] = useState("");
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  const strip = useRef<HTMLDivElement>(null);
  const loadWallet = useCallback(async () => {
    if (isLocalPreview) return;
    setWalletError("");
    try { const [state, name] = await Promise.all([walletState(), myHandle()]); setWallet(state); setHandle(name); }
    catch { setWalletError("Your wallet balance is unavailable."); }
  }, []);
  const loadCampaigns = useCallback(async () => {
    if (isLocalPreview) {
      try { const saved = JSON.parse(sessionStorage.getItem("salapi.preview.campaigns") || "null"); if (Array.isArray(saved) && saved.length) setCampaigns(normalizePreviewCampaigns(saved)); } catch { /* Keep the labeled sample when browser storage is unavailable. */ }
      return;
    }
    setLoading(true); setError("");
    try {
      let before = "0"; const rows: Campaign[] = [];
      for (let page = 0; page < 100; page++) {
        const state = await campaignState("", before);
        if (!state.ok) throw new Error(state.error);
        setClock(Number(state.now));
        rows.push(...state.campaigns);
        if (state.campaigns.length < 10) break;
        const next = state.campaigns.at(-1)?.id;
        if (!next || next === before) break;
        before = next;
      }
      setCampaigns(rows);
    } catch { setError("Campaigns could not be loaded. Please try again."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const task = setTimeout(() => { void loadWallet(); void loadCampaigns(); }, 0); return () => clearTimeout(task); }, [loadWallet, loadCampaigns]);
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(q.matches); update();
    q.addEventListener("change", update); return () => q.removeEventListener("change", update);
  }, []);
  const open = campaigns.filter(c => c.state === "Funding" && Number(c.config.funding_deadline) > clock);
  const shown = open.length ? open : campaigns;
  const cardCount = isLocalPreview ? 0 : shown.length;
  const move = (next: number) => {
    const current = scrollHomeCard(strip.current, next, cardCount, reduceMotion);
    if (current !== null) setIndex(current);
  };
  useEffect(() => {
    if (paused || reduceMotion || cardCount < 2) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      const current = scrollHomeCard(strip.current, index + 1, cardCount, reduceMotion);
      if (current !== null) setIndex(current);
    }, 6000);
    return () => clearInterval(timer);
  }, [paused, reduceMotion, cardCount, index]);
  return <div className={s.home}>
    <section className={s.wallet} aria-label={copy("Your Testnet wallet")}>
      <div className={s.identity}>
        <Link href="/settings" className={s.avatar} aria-label={copy("Your account")}>{handle?.charAt(0).toUpperCase() || "S"}</Link>
        <div className={s.name}><span>{copy("Hi there")}</span><strong>{handle ? handle.charAt(0).toUpperCase() + handle.slice(1) : copy("Welcome to Salapi")}</strong><small>{handle ? `@${handle}` : copy("Your community money, together.")}</small></div>
        <Link href="/learn" className={s.round} aria-label={copy("Help and learning")}>{Ico.bulb({ size: 20, c: "#fff" })}</Link>
        <Link href="/receive" className={s.round} aria-label={copy("Receive by QR")}>{Ico.qr({ size: 20, c: "#fff" })}</Link>
      </div>
      <div className={s.walletContent}><div><div className={s.balanceLabel}><span>{copy("TESTNET BALANCE")}</span></div>
        {wallet ? <div className={s.amount}><span>≈ </span><Peso value={wallet.pesos} size={balanceSize} color="#fff" /></div> : <div className="sl-skel" style={{ height: 40, width: "80%", marginTop: 12 }} />}
        <p>{isLocalPreview ? `${PREVIEW_WALLET.xlm} ${copy("test XLM · no real money")}` : copy("Native Testnet XLM · indicative value · no real money")}</p>
        {walletError && <button className={s.walletRetry} onClick={loadWallet}>{copy(walletError)} {copy("Retry")}</button>}
      </div>
        <nav className={s.walletActions} aria-label={copy("Wallet actions")}>
          <Link href="/topup" className={s.walletAction} aria-label={copy("Top up")}>
            <span className={s.walletActionIcon} aria-hidden="true">{Ico.arrowDown({ size: 18, c: "currentColor" })}</span>
            <span className={s.walletActionLabel}>{copy("Top up")}</span>
          </Link>
          <Link href="/withdraw" className={s.walletAction} aria-label={copy("Withdraw")}>
            <span className={s.walletActionIcon} aria-hidden="true">{Ico.arrowUp({ size: 18, c: "currentColor" })}</span>
            <span className={s.walletActionLabel}>{copy("Withdraw")}</span>
          </Link>
        </nav>
      </div>
    </section>
    <HomeCirclesCatalog />
    {!isLocalPreview && <section className={s.crowdfunding} aria-labelledby="testnet-campaign-title">
      <header className={s.giveHeader}><div><span className={s.eyebrow}>{copy("CROWDFUNDING · TESTNET")}</span><h2 id="testnet-campaign-title">{catalogCopy("D4 Testnet campaigns")}</h2><p>{catalogCopy("Separate on-chain escrow and proof-review flow. Not the fictional examples above.")}</p></div></header>
      <div className={s.stripLabel}><span>{copy(open.length ? "Open campaigns" : "Recent campaigns")}</span><Link href="/campaigns?mode=testnet">{copy("See all")} {Ico.chev({ size: 12 })}</Link></div>
      {loading ? <div className={s.skeletonCards}><div className="sl-skel" /><div className="sl-skel" /></div>
        : error ? <div className={s.empty} role="alert"><p>{copy(error)}</p><button onClick={loadCampaigns}>{copy("Try again")}</button></div>
        : !cardCount ? <div className={s.empty}><strong>{copy("Every cause starts with someone.")}</strong><p>{copy("No campaigns yet. Start one and invite your community.")}</p></div>
        : <div className={s.strip} ref={strip} onPointerDown={() => setPaused(true)} onFocusCapture={() => setPaused(true)} onScroll={() => {
          if (!strip.current) return; const first = strip.current.children[0] as HTMLElement;
          setIndex(Math.min(cardCount - 1, Math.round(strip.current.scrollLeft / (first.offsetWidth + 14))));
        }} aria-label={copy("Campaign carousel")}>
          {shown.map((c, i) => <article key={c.id} className={s.campaign}><div className={s.photo}>
            <Image src="/illustrations/giving.png" alt="Illustration of community giving, not campaign evidence" style={{ objectFit: "contain", background: "#eef3ff" }} width="420" height="220" sizes="(max-width: 500px) 82vw, 400px" loading={i === 0 ? "eager" : "lazy"} />
            <span>DONATION CAMPAIGN</span></div>
            <div className={s.campaignBody}><span className={s.example}>{`CAMPAIGN #${c.id} · ${c.state}`}</span><h2>{c.title}</h2>
              <p>Funds remain in escrow until the campaign proof receives two wallet approvals.</p>
              <div className={s.raised}><strong>{formatStroops(c.total)} XLM</strong><span> {copy("funded on Testnet")}</span></div>
              <Link className={s.donate} href={`/campaigns?id=${c.id}`}><Heart size={18} weight="fill" />{copy(c.state === "Funding" ? "Donate" : "View campaign")}</Link>
            </div></article>)}
        </div>}
      <div className={s.carouselFooter}>
        <Link href="/campaigns?create=1" className={s.start}><span className={s.plus}>{Ico.plus({ size: 18 })}</span><strong>{copy("Start a campaign")}</strong></Link>
        <div className={s.controls}><button aria-label={copy("Previous campaign")} onClick={() => move(index - 1)} disabled={cardCount < 2}>{Ico.back({ size: 16 })}</button><span>{String(Math.min(index + 1, cardCount)).padStart(2, "0")} / {String(cardCount).padStart(2, "0")}</span><button aria-label={copy("Next campaign")} onClick={() => move(index + 1)} disabled={cardCount < 2}>{Ico.chev({ size: 16 })}</button></div>
        <button className={s.pause} aria-label={copy(paused ? "Play campaign carousel" : "Pause campaign carousel")} onClick={() => setPaused(!paused)} disabled={reduceMotion || cardCount < 2}>{paused ? <Play size={15} weight="fill" /> : <Pause size={15} weight="fill" />}</button>
      </div>
    </section>}
    {isLocalPreview && <Link href="/campaigns?mode=testnet" className={s.testnetBridge}><span>{Ico.vault({ size: 20 })}</span><span><strong>{catalogCopy("D4 Testnet campaigns")}</strong><small>{catalogCopy("Separate escrow and proof-review flow. Local sample data here, not these example causes.")}</small></span>{Ico.chev({ size: 16 })}</Link>}
    <section className={s.quick} aria-label={copy("QUICK ACTIONS")}><div className={s.sectionTitle}>{copy("QUICK ACTIONS")}<span /></div><div className={s.quickGrid}>
      {[
        { title: "Smart Savings", sub: isLocalPreview ? "Create a local saving goal" : "Lock toward a goal", art: "savings", demo: isLocalPreview, to: "/savings", tone: "mint" },
        { title: "Arisan", sub: "Fund together, upfront", art: "arisan", to: "/arisan", tone: "blue" },
        { title: "Send by @", sub: "Send to anyone by name", art: "send", to: "/send", tone: "blue" },
        { title: "Disaster Vault", sub: "Shared payout approvals", art: "disaster", to: "/transparency", tone: "cream" },
      ].map(tile => <Link key={tile.art} href={tile.to} className={`${s.tile} ${s[tile.tone]}`}>
        <Image src={`/illustrations/${tile.art}.png`} alt="" width="78" height="78" /><div><strong>{copy(tile.title)}</strong><small>{copy(tile.sub)}</small>{tile.demo && <span className={s.coming}>{copy("Local demo")}</span>}</div><span className={s.tileArrow}>{Ico.chev({ size: 14 })}</span>
      </Link>)}
    </div></section>
    <footer className={s.stellar}><div><span>Powered by</span><Image src="/stellar.png" width="90" height="27" alt="Stellar" /></div><small>{copy("Public proof on Stellar Testnet")}</small><Link href="/docs">{copy("How Salapi works")}</Link></footer>
  </div>;
}
