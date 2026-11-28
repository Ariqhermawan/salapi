"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CheckCircle, HandHeart, Info, Wallet } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { PROTOTYPE_CAUSES } from "@/lib/prototype-causes";
import { isLocalPreview, previewUsdcBalanceCents } from "@/lib/local-preview";
import PrototypeFeeStory, { donorFeeStory, donorStoryStart, type DonorStoryKey } from "./PrototypeFeeStory";
import styles from "./PrototypeDonationScreen.module.css";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortMoney = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const amountToCents = (value: string) => /^\d{1,6}(?:\.\d{0,2})?$/.test(value) ? Math.round(Number(value) * 100) : null;
const DONATIONS_KEY = "salapi.local-preview.prototype-donations.v1";

type Split = { contribution: number; creator: number; beneficiary: number };
function splitDonation(contribution: number, creatorShareBps: number): Split {
  const creator = Math.round(contribution * creatorShareBps / 10_000);
  return { contribution, creator, beneficiary: contribution - creator };
}

export default function PrototypeDonationScreen({ id, step, amount: initialAmount = "" }: {
  id: string;
  step: "amount" | "review" | "success";
  amount?: string;
}) {
  const cause = PROTOTYPE_CAUSES.find(item => item.id === id);
  const router = useRouter();
  const [amount, setAmount] = useState(initialAmount || "5");
  const [confirming, setConfirming] = useState(false);
  const [help, setHelp] = useState<string | null>(null);
  const [story, setStory] = useState<DonorStoryKey | null>(null);
  const [vaultInfo, setVaultInfo] = useState(false);
  const [copied, setCopied] = useState(false);
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const overlayWasOpen = useRef(false);
  const [balanceCents, setBalanceCents] = useState(241_226);
  const cents = amountToCents(amount);
  const error = cents === null || cents < 100 ? "Enter $1 or more." : cents > balanceCents ? `That is more than your preview balance of ${money(balanceCents)}.` : "";
  const split = useMemo(() => splitDonation(cents ?? 0, cause?.organizerFeeBps ?? 0), [cents, cause?.organizerFeeBps]);
  const donorSlides = useMemo(() => donorFeeStory(cents ?? 0, cause?.organizerFeeBps ?? 0), [cents, cause?.organizerFeeBps]);

  useEffect(() => setLayer(document.querySelector<HTMLElement>(".sl-app-frame")), []);
  useEffect(() => setPortalHost(document.getElementById("phone-layer") ?? document.body), []);
  useEffect(() => { if (isLocalPreview) setBalanceCents(previewUsdcBalanceCents()); }, []);
  const closeOverlays = useCallback(() => { setHelp(null); setStory(null); setVaultInfo(false); }, []);
  useEffect(() => {
    if (!help && !story && !vaultInfo) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeOverlays(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeOverlays, help, story, vaultInfo]);
  useLayoutEffect(() => {
    const isOpen = Boolean(help || story || vaultInfo);
    if (isOpen) { overlayWasOpen.current = true; return; }
    if (overlayWasOpen.current) {
      overlayWasOpen.current = false;
      const target = focusReturnRef.current;
      focusReturnRef.current = null;
      target?.focus({ preventScroll: true });
    }
  }, [help, story, vaultInfo]);
  useEffect(() => { if (step === "review") setAmount(initialAmount || "5"); }, [initialAmount, step]);

  function openStory(key: DonorStoryKey, trigger: HTMLButtonElement) {
    focusReturnRef.current = trigger;
    setStory(key);
  }
  function openVaultInfo(trigger: HTMLButtonElement) {
    focusReturnRef.current = trigger;
    setVaultInfo(true);
  }

  if (!cause) return <div className={styles.missing}><h1>Cause not found</h1><Link href="/causes">Browse causes</Link></div>;
  if (!isLocalPreview) return <div className={styles.screen}>
    <header className={styles.header}><Link href={`/cause/${id}`} aria-label="Back"><ArrowLeft size={20} /></Link><h1>Example only</h1></header>
    <section className={`${styles.empty} ${styles.exampleOnly}`} data-testid="example-donation-blocked">
      <span className={styles.exampleBadge}>EXAMPLE · NO TRANSACTION</span>
      <h2>This sample can’t accept donations</h2>
      <p>This campaign and its figures are illustrative. No funds will be sent. Browse the Testnet directory to see campaigns with an on-chain donation flow.</p>
      <Link href="/campaigns?mode=testnet">Browse Testnet campaigns</Link>
    </section>
  </div>;
  if (cause.status === "Paused" || cause.status !== "Funding" || cause.raised >= cause.target) return <div className={styles.screen}>
    <header className={styles.header}><Link href={`/cause/${id}`} aria-label="Back"><ArrowLeft size={20} /></Link><h1>Donate</h1></header>
    <section className={styles.empty}><h2>{cause.status === "Paused" ? "Donations are paused" : "This cause has ended"}</h2><p>{cause.status === "Paused" ? "The organizer isn't taking donations right now." : "It no longer takes donations."}</p><Link href={`/cause/${id}`}>View cause</Link></section>
  </div>;

  const confirmDonation = () => {
    if (!isLocalPreview) return;
    setConfirming(true);
    window.setTimeout(() => {
      try {
        const existing: unknown = JSON.parse(localStorage.getItem(DONATIONS_KEY) || "[]");
        const rows = Array.isArray(existing) ? existing : [];
        localStorage.setItem(DONATIONS_KEY, JSON.stringify([...rows, { id, amountCents: cents, savedAt: Date.now() }]));
        sessionStorage.setItem(`salapi.local-preview.prototype-receipt.${id}`, JSON.stringify({ amountCents: cents }));
        router.replace(`/donate/${id}/success?amount=${encodeURIComponent(amount)}`);
      } catch {
        setConfirming(false);
        setHelp("Your browser could not save this local preview. No donation was made.");
      }
    }, 420);
  };
  const shareReceipt = async () => {
    const url = `${window.location.origin}/cause/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: `I gave to ${cause.title}`, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    } catch { /* Share sheet dismissed. */ }
  };

  return <>
    <div className={`${styles.screen} ${step === "review" ? styles.review : ""}`}>
      {step !== "success" && <header className={styles.header}>
        <Link href={step === "review" ? `/donate/${id}?amount=${encodeURIComponent(amount)}` : `/cause/${id}`} aria-label="Back"><ArrowLeft size={20} /></Link>
        <div className={styles.headerText}><h1>{step === "review" ? "Review preview" : "Preview donation"}</h1>{step === "review" ? <p>{cause.title.split(" - ")[0]}</p> : null}</div>
      </header>}

      {step !== "success" && <p className={styles.previewNotice} role="note" data-testid="donation-preview-disclosure">Local donation preview · no real or Testnet funds move.</p>}

      {step === "amount" && <>
        <section className={styles.causeCard}>
          {cause.image && <Image src={cause.image} width={72} height={72} alt="" />}
          <div><strong>{cause.title}</strong><small>{cause.organizer}</small><span className={styles.miniProgress}><i style={{ width: `${Math.min(100, Math.round(cause.raised / cause.target * 100))}%` }} /></span><small>{shortMoney(cause.raised)} raised of {shortMoney(cause.target)}</small></div>
        </section>
        <section className={styles.amountCard}>
          <label htmlFor="donation-amount">Amount · USD</label>
          <div className={styles.amountInput}><span>$</span><input id="donation-amount" inputMode="decimal" autoComplete="off" placeholder="0" value={amount} style={{ width: `${Math.max(1, amount.length)}ch` }} onChange={event => setAmount(event.target.value)} /></div>
          <p>{cents && cents > 0 ? `≈ ${(cents / 100 * 8.92307692).toLocaleString("en-US", { maximumFractionDigits: 2 })} XLM` : ""}</p>
          {error && amount && <small className={styles.error} role="status">{error}</small>}
          <div className={styles.presets}>{[200, 500, 1000, 2000].map(value => <button type="button" key={value} aria-pressed={cents === value} onClick={() => setAmount((value / 100).toFixed(0))}>{shortMoney(value)}</button>)}</div>
        </section>
        <section className={styles.payFrom}><span>Pay from</span><strong>Preview balance · {money(balanceCents)}</strong></section>
      </>}

      {step === "review" && <>
        <div className={styles.total}><strong>{money(split.contribution)}</strong><span>Contribution preview · held in D4 escrow</span></div>
        <p className={styles.escrowNote}>Example terms only. If two of the three configured wallets approve proof, the creator share is {money(split.creator)} and the beneficiary receives {money(split.beneficiary)}. No funds move in this preview.</p>
        <h2 className={styles.groupLabel}>From</h2>
        <section className={styles.breakdown}><div className={styles.row}><span className={styles.rowIcon}><Wallet size={20} /></span><span className={styles.rowMain}><strong>Preview balance</strong><small>{money(balanceCents)} in this browser preview</small></span></div></section>
        <h2 className={styles.groupLabel}>If proof is approved</h2>
        <section className={styles.breakdown}>
          <div className={styles.row}><span className={styles.person}>{cause.avatar ? <Image src={cause.avatar} width={40} height={40} alt="" /> : cause.organizer.slice(1, 2).toUpperCase()}</span><span className={styles.rowMain}><span className={styles.rowName}><strong>{cause.organizer}</strong>{cause.verified ? <span className={styles.verified}>Verified</span> : null}</span><small>Creator share · fixed in campaign terms</small></span><strong className={styles.value}>{money(split.creator)}<small>{(cause.organizerFeeBps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%</small></strong><button type="button" aria-label="What is the creator share?" aria-haspopup="dialog" onClick={event => openStory("organizer", event.currentTarget)}><Info size={18} /></button></div>
        </section>
        <section className={styles.breakdown}>
          <div className={styles.row}><span className={`${styles.rowIcon} ${styles.vaultIcon}`}><Image src="/prototype-ui/tile-vault.png" width={28} height={28} alt="" /></span><span className={styles.rowMain}><strong>Disaster Vault</strong><small>Separate contribution · not automatic</small></span><strong className={styles.value}>Separate<small>not included</small></strong><button type="button" aria-label="What is the Disaster Vault?" aria-haspopup="dialog" onClick={event => openVaultInfo(event.currentTarget)}><Info size={18} /></button></div>
          <div className={styles.row}><span className={styles.rowIcon}>%</span><span className={styles.rowMain}><strong>Platform fee</strong><small>Not deducted by D4</small></span><strong className={styles.value}>$0.00<small>0%</small></strong><button type="button" aria-label="What is the platform fee?" aria-haspopup="dialog" onClick={event => openStory("platform", event.currentTarget)}><Info size={18} /></button></div>
        </section>
        <section className={`${styles.breakdown} ${styles.causeReceives}`}><div className={styles.row}><span className={`${styles.rowIcon} ${styles.receiveIcon}`}><HandHeart size={22} /></span><span className={styles.rowMain}><strong>Beneficiary on release</strong><small>After two of three wallet approvals</small></span><strong className={styles.value}>{money(split.beneficiary)}<small>{Math.round(split.beneficiary / Math.max(split.contribution, 1) * 100)}%</small></strong><button type="button" aria-label="What does the beneficiary receive?" aria-haspopup="dialog" onClick={event => openStory("cause", event.currentTarget)}><Info size={18} /></button></div></section>
      </>}

      {step === "success" && <section className={styles.success}>
        <CheckCircle size={66} weight="fill" />
        <h2>Preview saved</h2>
        <p>This browser saved an example donation. No real or Testnet funds moved.</p>
        <div className={styles.receipt}>
          {cause.image && <Image src={cause.image} width={370} height={150} alt="" />}
          <strong>{money(split.contribution)}</strong><span>Example contribution to {cause.title}</span><small>If released: {money(split.beneficiary)} beneficiary · {money(split.creator)} creator share. Disaster Vault is separate.</small>
        </div>
        <p className={styles.disclaimer}>Local preview receipt · no money moved.</p>
      </section>}
    </div>

    {layer ? createPortal(<div className={styles.actionBar}>
      {step === "amount" ? <Link className={styles.primaryButton} aria-disabled={!!error || !amount || undefined}
        href={`/donate/${id}/review?amount=${encodeURIComponent(amount)}`} onClick={event => { if (error || !amount) event.preventDefault(); }}>Review preview <span>›</span></Link>
        : step === "review" ? <><button type="button" className={styles.primaryButton} disabled={confirming} onClick={confirmDonation}>{confirming ? "Saving preview…" : "Save preview"}</button><p className={styles.arrives}>Local browser preview · no funds move.</p></>
          : <><button type="button" className={styles.shareSuccess} onClick={() => void shareReceipt()}>{copied ? "Copied" : "Share"}</button><Link className={styles.primaryButton} href={`/cause/${id}`}>Done</Link></>}
    </div>, layer) : null}

    {portalHost && (help || story || vaultInfo) && createPortal(<div className={styles.sheetBackdrop} role="presentation" onClick={closeOverlays}>
      {story && <section className={styles.storySheet} role="dialog" aria-modal="true" aria-label="D4 campaign contribution" onClick={event => event.stopPropagation()}>
        <div className={styles.sheetHandle} /><PrototypeFeeStory key={story} slides={donorSlides} start={donorStoryStart[story]} ariaLabel="D4 campaign contribution" onDone={closeOverlays} />
      </section>}
      {vaultInfo && <section className={styles.helpSheet} role="dialog" aria-modal="true" aria-label="Disaster Vault" onClick={event => event.stopPropagation()}>
        <div className={styles.sheetHandle} /><figure className={styles.vaultStory}><img src="/prototype-fee-story/illo-vault.png" alt="" /><figcaption>A shared pool with its own rules.</figcaption></figure>
        <p>The Disaster Vault is a separate D3 contract. This D4 campaign contribution does not add to it automatically. Anyone can make a separate contribution from the Vault page; that action has its own review and confirmation.</p>
        <div className={styles.vaultRows}><div><span>From this campaign</span><strong>Not included</strong></div><div><span>Funding rule</span><strong>Separate D3 action</strong></div><div><span>Network</span><strong>Stellar Testnet</strong></div></div>
        <button type="button" className={styles.primaryButton} onClick={closeOverlays}>Got it</button><Link href="/vault" className={styles.vaultLink}>See the vault</Link>
      </section>}
      {help && <section className={styles.helpSheet} role="dialog" aria-modal="true" aria-label="Local preview not saved" onClick={event => event.stopPropagation()}><h2>Local preview not saved</h2><p>{help}</p><button type="button" className={styles.primaryButton} onClick={closeOverlays}>Got it</button></section>}
    </div>, portalHost)}
  </>;
}
