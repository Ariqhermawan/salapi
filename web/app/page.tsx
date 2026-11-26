"use client";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { myHandle, walletState } from "@/app/actions";
import { requireWalletState } from "@/lib/wallet-state";
import { readPublicCampaigns } from "@/lib/ui/public-read";
import { Ico } from "@/components/ui/kit";
import { useT } from "@/components/I18nProvider";
import type { Campaign } from "@/lib/campaign";
import { isLocalPreview, PREVIEW_WALLET } from "@/lib/local-preview";
import s from "./home.module.css";
import { homeCopy } from "@/lib/i18n/revamp-home";
import HomeCirclesCatalog from "@/components/HomeCirclesCatalog";
import { useAccountPhoto } from "@/components/useAccountPhoto";
import MarketValue from "@/components/MarketValue";
import { Bell, Moon, Question, Sun } from "@phosphor-icons/react";

// Preview uses its declared native token quantity, never its demo fiat balance.
const [previewWhole, previewFraction = ""] = PREVIEW_WALLET.xlm.split(".");
const previewNativeStroops = `${previewWhole}${previewFraction.padEnd(7, "0")}`;

export default function Home() {
  const { locale } = useT();
  const copy = (phrase: string) => homeCopy(locale, phrase);
  const photo = useAccountPhoto();
  const guest = !isLocalPreview && photo.code === "unauthenticated";
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
    <header className={s.greeting}>
      <Link href="/settings" className={s.mark} aria-label={copy("Your account")}>
        <Image src="/icon.svg" alt="" width={28} height={28} />
      </Link>
      <h1>{copy("Welcome to Salapi")}{handle ? `, @${handle}` : ""}</h1>
      <Link href="/learn" className={s.round} aria-label={copy("Help and learning")}><Question size={24} aria-hidden /></Link>
      <Link href="/notifications" className={s.round} aria-label={copy("Notifications")}><Bell size={24} aria-hidden /></Link>
    </header>
    <section className={s.wallet} aria-label={copy("Your Testnet wallet")}>
      <div className={s.walletHeader}>
        <div><span>{copy(guest ? "Wallet" : "Total balance")}</span><span className={s.walletPill}>Testnet</span></div>
        <Image src="/stellar-white.png" alt="Stellar" width={68} height={17} />
      </div>
      <div className={s.walletContent}>
        {guest ? <div className={s.guest}>
          <strong>{copy("Guest account")}</strong>
          <Link href="/signin">{copy("Sign in to see your balance")}</Link>
        </div> : <div className={s.amount} data-preview-balance={isLocalPreview || undefined}>
          <MarketValue
            nativeStroops={walletError ? undefined : wallet?.nativeStroops ?? (isLocalPreview && wallet ? previewNativeStroops : undefined)}
            size={40} color="#fff" compact showNative dashboard
            balanceLoading={!wallet && !walletError}
            dashboardBalanceError={walletError ? <button className={s.walletRetry} onClick={loadWallet}>{copy(walletError)} {copy("Retry")}</button> : undefined}
            dashboardCaption={copy("Testnet · no real money")}
          />
        </div>}
      </div>
    </section>
    <nav className={s.walletActions} aria-label={copy("Wallet actions")}>
      {[
        { href: "/topup", label: "Top up", icon: Ico.arrowDown },
        { href: "/withdraw", label: "Withdraw", icon: Ico.arrowUp },
        { href: "/send", label: "Send", icon: Ico.send },
        { href: "/receive", label: "Receive", icon: Ico.qr },
      ].map(({ href, label, icon }) => (
        <Link key={href} href={guest ? `/signin?next=${encodeURIComponent(href)}` : href} className={s.walletAction} aria-label={copy(label)}>
          <span className={s.walletActionIcon} aria-hidden="true">{icon({ size: 20, c: "currentColor" })}</span>
          <span className={s.walletActionLabel}>{copy(label)}</span>
        </Link>
      ))}
    </nav>
    <HomeCirclesCatalog campaigns={campaigns} circleLinks={circleLinks} loading={loading} error={error} onRetry={loadCampaigns} />
    <section className={s.quick} aria-label={copy("QUICK ACTIONS")}><div className={s.quickGrid}>
      <Link href="/vaults" className={s.tile}>
        <Image src="/illustrations/tile-arisan.png" alt="" width={44} height={32} />
        <strong>{copy("Arisan")}</strong>
      </Link>
      <Link href="/transparency" className={s.tile}>
        <Image src="/illustrations/tile-vault.png" alt="" width={44} height={32} />
        <strong>{copy("Disaster Vault")}</strong>
      </Link>
      <button type="button" disabled data-testid="social-feed-coming-soon" className={s.tile}>
        <Image src="/illustrations/tile-feed.png" alt="" width={44} height={32} />
        <strong>{copy("Social feed")}</strong>
        <span className={s.coming}>{copy("Coming soon")}</span>
      </button>
    </div></section>
    <footer className={s.stellar}>
      <Link href="/docs">{copy("How Salapi works")}</Link>
      <button className={s.round} type="button" onClick={() => {
        const root = document.documentElement;
        const theme = root.dataset.theme === "dark" ? "light" : "dark";
        root.dataset.theme = theme;
        document.cookie = `salapi-theme=${theme}; Path=/; SameSite=Lax; Max-Age=31536000`;
      }}>
        <span className="sl-show-light"><Moon size={20} aria-hidden /><span className="sr-only">{copy("Dark theme")}</span></span>
        <span className="sl-show-dark"><Sun size={20} aria-hidden /><span className="sr-only">{copy("Light theme")}</span></span>
      </button>
    </footer>
  </div>;
}
