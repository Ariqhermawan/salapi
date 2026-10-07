"use client";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { myHandle, walletState } from "@/app/actions";
import { requireWalletState } from "@/lib/wallet-state";
import { readPublicCampaigns } from "@/lib/ui/public-read";
import { Ico, Peso } from "@/components/ui/kit";
import { useT } from "@/components/I18nProvider";
import type { Campaign } from "@/lib/campaign";
import { isLocalPreview, PREVIEW_WALLET } from "@/lib/local-preview";
import s from "./home.module.css";
import { homeCopy } from "@/lib/i18n/revamp-home";
import HomeCirclesCatalog from "@/components/HomeCirclesCatalog";
import AccountAvatar from "@/components/AccountAvatar";
import { useAccountPhoto } from "@/components/useAccountPhoto";
import { accountPhotoCopy } from "@/lib/i18n/account-photo";
import MarketValue from "@/components/MarketValue";
import { PoweredByStellarV2 } from "@/components/ui/brand";

export default function Home() {
  const { currency, locale } = useT();
  const copy = (phrase: string) => homeCopy(locale, phrase);
  const balanceSize = currency === "id" || currency === "vi" ? 23 : currency === "tl" ? 29 : 32;
  const photo = useAccountPhoto();
  const photoCopy = accountPhotoCopy(locale);
  const [wallet, setWallet] = useState<{ pesos: number; address: string; nativeStroops?: string } | null>(isLocalPreview ? PREVIEW_WALLET : null);
  const [handle, setHandle] = useState<string | null>(isLocalPreview ? PREVIEW_WALLET.handle : null);
  const [campaigns, setCampaigns] = useState<Omit<Campaign, "contribution">[]>([]);
  const [circleLinks, setCircleLinks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!isLocalPreview);
  const [walletError, setWalletError] = useState("");
  const [error, setError] = useState("");
  const walletRequest = useRef(0);
  const campaignLoadRevision = useRef(0);
  const loadWallet = useCallback(async () => {
    if (isLocalPreview) return;
    const request = ++walletRequest.current;
    setWalletError("");
    // Client Server Actions dispatch sequentially. Update each independent
    // display as soon as its own result settles, not after the slower reader.
    const balance = async () => {
      try {
        const state = requireWalletState(await walletState());
        if (request === walletRequest.current) setWallet(state);
      } catch {
        if (request === walletRequest.current) setWalletError("Your wallet balance is unavailable.");
      }
    };
    const identity = async () => {
      try {
        const name = await myHandle();
        if (request === walletRequest.current) setHandle(name);
      } catch {
        if (request === walletRequest.current) setHandle(null);
      }
    };
    await Promise.all([balance(), identity()]);
  }, []);
  const loadCampaigns = useCallback(async () => {
    if (isLocalPreview) return;
    const request = ++campaignLoadRevision.current;
    setLoading(true); setError("");
    try {
      let before = "0"; const rows: Omit<Campaign, "contribution">[] = [];
      const links: Record<string, string> = Object.create(null);
      for (let page = 0; page < 100; page++) {
        const state = await readPublicCampaigns(before);
        if (request !== campaignLoadRevision.current) return;
        if (!state.ok) throw new Error(state.error);
        rows.push(...state.campaigns);
        Object.assign(links, state.circleLinks ?? {});
        // Show usable discovery after page one, not after the whole catalog.
        setCampaigns([...rows]); setCircleLinks({ ...links });
        if (state.campaigns.length < 10) break;
        const next = state.campaigns.at(-1)?.id;
        if (!next || next === before) break;
        before = next;
      }
    } catch { if (request === campaignLoadRevision.current) setError("Campaigns could not be loaded. Please try again."); }
    finally { if (request === campaignLoadRevision.current) setLoading(false); }
  }, []);
  useEffect(() => {
    const requestVersion = walletRequest;
    const campaignVersion = campaignLoadRevision;
    const task = setTimeout(() => { void loadWallet(); void loadCampaigns(); }, 0);
    return () => { clearTimeout(task); requestVersion.current++; campaignVersion.current++; };
  }, [loadWallet, loadCampaigns]);
  return <div className={s.home} data-testid="home-dashboard">
    <section className={s.wallet} aria-label={copy("Your Testnet wallet")}>
      <div className={s.identity}>
        <Link href="/settings" className={s.avatar} aria-label={copy("Your account")}><AccountAvatar name={handle || photo.profile?.email || "Salapi"} photoUrl={photo.profile?.photoUrl ?? null} size={44} alt={photoCopy.alt} loading={photo.status === "loading"} /></Link>
        <div className={s.name}><span>{copy("Hi there")}</span><strong>{handle ? handle.charAt(0).toUpperCase() + handle.slice(1) : photo.profile?.email || copy("Welcome to Salapi")}</strong><small>{handle ? `@${handle}` : copy("Your community money, together.")}</small></div>
        <Link href="/learn" className={s.round} aria-label={copy("Help and learning")}>{Ico.bulb({ size: 20, c: "#fff" })}</Link>
        <Link href="/receive" className={s.round} aria-label={copy("Receive by QR")}>{Ico.qr({ size: 20, c: "#fff" })}</Link>
      </div>
      <div className={`${s.walletContent} ${s.walletMinimal}`}><div><div className={s.balanceLabel}><span>{copy("TESTNET BALANCE")}</span></div>
        {walletError ? <button className={s.walletRetry} onClick={loadWallet}>{copy(walletError)} {copy("Retry")}</button>
          : wallet ? <div className={s.amount} data-preview-balance={isLocalPreview || undefined}>{isLocalPreview ? <><span>≈ </span><Peso value={wallet.pesos} size={balanceSize} color="#fff" /></> : <MarketValue nativeStroops={wallet.nativeStroops} size={balanceSize} color="#fff" compact showNative dashboard />}</div>
          : <div className="sl-skel" style={{ height: balanceSize, width: "calc(100% - var(--wallet-actions-width) - 8px)", marginTop: 5 }} />}
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
      <p className={s.walletCaption}>{isLocalPreview ? `${PREVIEW_WALLET.xlm} ${copy("test XLM · no real money")}` : copy("Testnet · no real money")}</p>
    </section>
    <HomeCirclesCatalog campaigns={campaigns} circleLinks={circleLinks} loading={loading} error={error} onRetry={loadCampaigns} />
    <section className={s.quick} aria-label={copy("QUICK ACTIONS")}><div className={s.quickGrid}>
      {[
        { title: "Smart Savings", sub: isLocalPreview ? "Create a local saving goal" : "Lock toward a goal", art: "savings", demo: isLocalPreview, to: "/savings", tone: "mint" },
        { title: "Arisan", sub: "Fund together, upfront", art: "arisan", to: "/arisan", tone: "blue" },
        { title: "Send by @", sub: "Send to anyone by name", art: "send", to: "/send", tone: "blue" },
        { title: "Disaster Vault", sub: "Shared payout approvals", art: "disaster", to: "/transparency", tone: "cream" },
      ].map(tile => <Link key={tile.art} href={tile.to} className={`${s.tile} ${s[tile.tone]}`}>
        <Image src={`/illustrations/${tile.art}.png`} alt="" width="78" height="78" /><div><strong>{copy(tile.title)}</strong><small>{copy(tile.sub)}</small>{tile.demo && <span className={s.coming}>{copy("Local demo")}</span>}</div>
      </Link>)}
    </div></section>
    <footer className={s.stellar}><PoweredByStellarV2 /><small>{copy("Public proof on Stellar Testnet")}</small><Link href="/docs">{copy("How Salapi works")}</Link></footer>
  </div>;
}
