"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CheckCircle, HandHeart, Info, Wallet } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { PROTOTYPE_CAUSES } from "@/lib/prototype-causes";
import { previewUsdcBalanceCents } from "@/lib/local-preview";
import PrototypeFeeStory, { donorFeeStory, donorStoryStart, type DonorStoryKey } from "./PrototypeFeeStory";
import styles from "./PrototypeDonationScreen.module.css";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortMoney = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const amountToCents = (value: string) => /^\d{1,6}(?:\.\d{0,2})?$/.test(value) ? Math.round(Number(value) * 100) : null;
const DONATIONS_KEY = "salapi.local-preview.prototype-donations.v1";
const VAULT_BALANCE_CENTS = 128_420;

type Split = { donation: number; vault: number; salapi: number; organizer: number; receives: number };
function splitDonation(donation: number, organizerFeeBps: number): Split {
  const part = (bps: number) => Math.round(donation * bps / 10_000);
  const vault = part(100);
  const salapi = part(100);
  const organizer = part(organizerFeeBps);
  return { donation, vault, salapi, organizer, receives: donation - vault - salapi - organizer };
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
  const [balanceCents, setBalanceCents] = useState(241_226);
  const cents = amountToCents(amount);
  const error = cents === null || cents < 100 ? "Enter $1 or more." : cents > balanceCents ? `That is more than your Salapi balance of ${money(balanceCents)}.` : "";
  const split = useMemo(() => splitDonation(cents ?? 0, cause?.organizerFeeBps ?? 0), [cents, cause?.organizerFeeBps]);
  const donorSlides = useMemo(() => donorFeeStory(false), []);

  useEffect(() => setLayer(document.querySelector<HTMLElement>(".sl-app-frame")), []);
  useEffect(() => setPortalHost(document.getElementById("phone-layer") ?? document.body), []);
  useEffect(() => setBalanceCents(previewUsdcBalanceCents()), []);
  useEffect(() => {
    if (!help && !story && !vaultInfo) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setHelp(null); setStory(null); setVaultInfo(false); } };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [help, story, vaultInfo]);
  useEffect(() => { if (step === "review") setAmount(initialAmount || "5"); }, [initialAmount, step]);

  if (!cause) return <div className={styles.missing}><h1>Cause not found</h1><Link href="/causes">Browse causes</Link></div>;
  if (cause.status === "Paused" || cause.status !== "Funding" || cause.raised >= cause.target) return <div className={styles.screen}>
    <header className={styles.header}><Link href={`/cause/${id}`} aria-label="Back"><ArrowLeft size={20} /></Link><h1>Donate</h1></header>
    <section className={styles.empty}><h2>{cause.status === "Paused" ? "Donations are paused" : "This cause has ended"}</h2><p>{cause.status === "Paused" ? "The organizer isn't taking donations right now." : "It no longer takes donations."}</p><Link href={`/cause/${id}`}>View cause</Link></section>
  </div>;

  const confirmDonation = () => {
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
        <div className={styles.headerText}><h1>{step === "review" ? "Review donation" : "Donate"}</h1>{step === "review" ? <p>{cause.title.split(" - ")[0]}</p> : null}</div>
      </header>}

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
        <section className={styles.payFrom}><span>Pay from</span><strong>Salapi balance · {money(balanceCents)}</strong></section>
      </>}

      {step === "review" && <>
        <div className={styles.total}><strong>{money(split.donation)}</strong><span>You pay</span></div>
        <h2 className={styles.groupLabel}>From</h2>
        <section className={styles.breakdown}><div className={styles.row}><span className={styles.rowIcon}><Wallet size={20} /></span><span className={styles.rowMain}><strong>Salapi balance</strong><small>{money(balanceCents)} available</small></span></div></section>
        <h2 className={styles.groupLabel}>To</h2>
        <section className={styles.breakdown}>
          <div className={styles.row}><span className={styles.person}>{cause.avatar ? <Image src={cause.avatar} width={40} height={40} alt="" /> : cause.organizer.slice(1, 2).toUpperCase()}</span><span className={styles.rowMain}><span className={styles.rowName}><strong>{cause.organizer}</strong>{cause.verified ? <span className={styles.verified}>Verified</span> : null}</span><small>Organizer fee</small></span><strong className={styles.value}>{money(split.organizer)}<small>{(cause.organizerFeeBps / 100).toFixed(0)}%</small></strong><button type="button" aria-label="What is the organizer fee?" aria-haspopup="dialog" onClick={() => setStory("organizer")}><Info size={18} /></button></div>
        </section>
        <section className={styles.breakdown}>
          <div className={styles.row}><span className={`${styles.rowIcon} ${styles.vaultIcon}`}><Image src="/prototype-ui/tile-vault.png" width={28} height={28} alt="" /></span><span className={styles.rowMain}><strong>Disaster Vault</strong></span><strong className={styles.value}>{money(split.vault)}<small>1%</small></strong><button type="button" aria-label="What is the Disaster Vault?" aria-haspopup="dialog" onClick={() => setVaultInfo(true)}><Info size={18} /></button></div>
          <div className={styles.row}><span className={styles.rowIcon}>%</span><span className={styles.rowMain}><strong>Platform fee</strong></span><strong className={styles.value}>{money(split.salapi)}<small>1%</small></strong><button type="button" aria-label="What is the platform fee?" aria-haspopup="dialog" onClick={() => setStory("platform")}><Info size={18} /></button></div>
        </section>
        <section className={`${styles.breakdown} ${styles.causeReceives}`}><div className={styles.row}><span className={`${styles.rowIcon} ${styles.receiveIcon}`}><HandHeart size={22} /></span><span className={styles.rowMain}><strong>Cause receives</strong></span><strong className={styles.value}>{money(split.receives)}<small>{Math.round(split.receives / Math.max(split.donation, 1) * 100)}%</small></strong><button type="button" aria-label="What does the cause receive?" aria-haspopup="dialog" onClick={() => setStory("cause")}><Info size={18} /></button></div></section>
      </>}

      {step === "success" && <section className={styles.success}>
        <CheckCircle size={66} weight="fill" />
        <h2>Thank you</h2>
        <p>Your gift is on its way. Share it and bring one more person along.</p>
        <div className={styles.receipt}>
          {cause.image && <Image src={cause.image} width={370} height={150} alt="" />}
          <strong>{money(split.donation)}</strong><span>to {cause.title}</span><small>{cause.organizer} · {money(split.vault)} to the Disaster Vault</small>
        </div>
        <p className={styles.disclaimer}>Local preview receipt · no money moved.</p>
      </section>}
    </div>

    {layer ? createPortal(<div className={styles.actionBar}>
      {step === "amount" ? <Link className={styles.primaryButton} aria-disabled={!!error || !amount || undefined}
        href={`/donate/${id}/review?amount=${encodeURIComponent(amount)}`} onClick={event => { if (error || !amount) event.preventDefault(); }}>Review donation <span>›</span></Link>
        : step === "review" ? <><button type="button" className={styles.primaryButton} disabled={confirming} onClick={confirmDonation}>{confirming ? "Confirming…" : "Confirm donation"}</button><p className={styles.arrives}>Arrives instantly.</p></>
          : <><button type="button" className={styles.shareSuccess} onClick={() => void shareReceipt()}>{copied ? "Copied" : "Share"}</button><Link className={styles.primaryButton} href={`/cause/${id}`}>Done</Link></>}
    </div>, layer) : null}

    {portalHost && (help || story || vaultInfo) && createPortal(<div className={styles.sheetBackdrop} role="presentation" onClick={() => { setHelp(null); setStory(null); setVaultInfo(false); }}>
      {story && <section className={styles.storySheet} role="dialog" aria-modal="true" aria-label="Where your donation goes" onClick={event => event.stopPropagation()}>
        <div className={styles.sheetHandle} /><PrototypeFeeStory key={story} slides={donorSlides} start={donorStoryStart[story]} ariaLabel="Where your donation goes" onDone={() => setStory(null)} />
      </section>}
      {vaultInfo && <section className={styles.helpSheet} role="dialog" aria-modal="true" aria-label="Disaster Vault" onClick={event => event.stopPropagation()}>
        <div className={styles.sheetHandle} /><figure className={styles.vaultStory}><img src="/prototype-fee-story/illo-vault.png" alt="" /><figcaption>A shared pool for the next disaster.</figcaption></figure>
        <p>1% of every donation goes into the Disaster Vault, a shared pool for disaster relief. Every amount in and out is public on Stellar.</p>
        <div className={styles.vaultRows}><div><span>From this donation</span><strong>{money(split.vault)}</strong></div><div><span>Vault balance</span><strong>{money(VAULT_BALANCE_CENTS)}</strong></div><div><span>Network</span><strong>Stellar</strong></div></div>
        <button type="button" className={styles.primaryButton} onClick={() => setVaultInfo(false)}>Got it</button><Link href="/vault" className={styles.vaultLink}>See the vault</Link>
      </section>}
      {help && <section className={styles.helpSheet} role="dialog" aria-modal="true" aria-label="Local preview not saved" onClick={event => event.stopPropagation()}><h2>Local preview not saved</h2><p>{help}</p><button type="button" className={styles.primaryButton} onClick={() => setHelp(null)}>Got it</button></section>}
    </div>, portalHost)}
  </>;
}
