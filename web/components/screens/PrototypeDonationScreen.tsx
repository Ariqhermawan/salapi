"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CheckCircle, Info, Wallet } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { PROTOTYPE_CAUSES } from "@/lib/prototype-causes";
import styles from "./PrototypeDonationScreen.module.css";

const BALANCE_CENTS = 241_226;
const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const amountToCents = (value: string) => /^\d{1,6}(?:\.\d{0,2})?$/.test(value) ? Math.round(Number(value) * 100) : null;
const DONATIONS_KEY = "salapi.local-preview.prototype-donations.v1";

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
  const [amount, setAmount] = useState(initialAmount);
  const [confirming, setConfirming] = useState(false);
  const [help, setHelp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const cents = amountToCents(amount);
  const error = cents === null || cents < 100 ? "Enter $1 or more." : cents > BALANCE_CENTS ? `That is more than your Salapi balance of ${money(BALANCE_CENTS)}.` : "";
  const split = useMemo(() => splitDonation(cents ?? 0, cause?.organizerFeeBps ?? 0), [cents, cause?.organizerFeeBps]);

  useEffect(() => setLayer(document.querySelector<HTMLElement>(".sl-app-frame")), []);
  useEffect(() => { if (step === "review") setAmount(initialAmount); }, [initialAmount, step]);

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
    <div className={styles.screen}>
      {step !== "success" && <header className={styles.header}>
        <Link href={step === "review" ? `/donate/${id}?amount=${encodeURIComponent(amount)}` : `/cause/${id}`} aria-label="Back"><ArrowLeft size={20} /></Link>
        <h1>{step === "review" ? "Review donation" : "Donate"}</h1>
        {step === "review" && <span className={styles.step}>2 · Review</span>}
      </header>}

      {step === "amount" && <>
        <section className={styles.causeCard}>
          {cause.image && <Image src={cause.image} width={72} height={72} alt="" />}
          <div><strong>{cause.title}</strong><small>{cause.organizer}</small><span className={styles.miniProgress}><i style={{ width: `${Math.min(100, Math.round(cause.raised / cause.target * 100))}%` }} /></span><small>{money(cause.raised)} raised of {money(cause.target)}</small></div>
        </section>
        <section className={styles.amountCard}>
          <label htmlFor="donation-amount">Amount · USD</label>
          <div className={styles.amountInput}><span>$</span><input id="donation-amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={event => setAmount(event.target.value)} /></div>
          <p>{cents && cents > 0 ? `≈ ${(cents / 100 * 8.92307692).toLocaleString("en-US", { maximumFractionDigits: 2 })} XLM` : ""}</p>
          {error && amount && <small className={styles.error} role="status">{error}</small>}
          <div className={styles.presets}>{[200, 500, 1000, 2000].map(value => <button type="button" key={value} aria-pressed={cents === value} onClick={() => setAmount((value / 100).toFixed(0))}>{money(value)}</button>)}</div>
        </section>
        <section className={styles.payFrom}><span>Pay from</span><strong>Salapi balance · {money(BALANCE_CENTS)}</strong></section>
      </>}

      {step === "review" && <>
        <div className={styles.total}><strong>{money(split.donation)}</strong><span>You pay</span></div>
        <h2 className={styles.groupLabel}>From</h2>
        <section className={styles.breakdown}><div className={styles.row}><span className={styles.rowIcon}><Wallet size={20} /></span><span className={styles.rowMain}><strong>Salapi balance</strong><small>{money(BALANCE_CENTS)} available</small></span></div></section>
        <h2 className={styles.groupLabel}>To</h2>
        <section className={styles.breakdown}>
          <div className={styles.row}><span className={styles.person}>{cause.avatar ? <Image src={cause.avatar} width={40} height={40} alt="" /> : cause.organizer.slice(1, 2).toUpperCase()}</span><span className={styles.rowMain}><strong>{cause.organizer}</strong><small>Organizer fee</small></span><strong className={styles.value}>{money(split.organizer)}<small>{(cause.organizerFeeBps / 100).toFixed(0)}%</small></strong><button type="button" aria-label="What is the organizer fee?" onClick={() => setHelp("This sample cause sets an organizer fee. In a live Testnet campaign, actual contract terms are shown on the campaign page.")}><Info size={18} /></button></div>
          <div className={styles.row}><span className={styles.rowIcon}>◇</span><span className={styles.rowMain}><strong>Disaster Vault</strong><small>Shared emergency pool</small></span><strong className={styles.value}>{money(split.vault)}<small>1%</small></strong><button type="button" aria-label="What is the Disaster Vault?" onClick={() => setHelp("This is the prototype's sample split only. The live Disaster Vault follows its own deployed contract rules.")}><Info size={18} /></button></div>
          <div className={styles.row}><span className={styles.rowIcon}>%</span><span className={styles.rowMain}><strong>Platform fee</strong></span><strong className={styles.value}>{money(split.salapi)}<small>1%</small></strong><button type="button" aria-label="What is the platform fee?" onClick={() => setHelp("This is an illustrative prototype line item. It is not a charge or a Testnet contract operation.")}><Info size={18} /></button></div>
        </section>
        <section className={`${styles.breakdown} ${styles.causeReceives}`}><div className={styles.row}><span className={styles.rowIcon}>♥</span><span className={styles.rowMain}><strong>Cause receives</strong></span><strong className={styles.value}>{money(split.receives)}<small>{Math.round(split.receives / Math.max(split.donation, 1) * 100)}%</small></strong><button type="button" aria-label="What does the cause receive?" onClick={() => setHelp("The displayed amounts belong to the no-transaction prototype flow. Live campaign terms and on-chain results are different.")}><Info size={18} /></button></div></section>
        <p className={styles.disclaimer}>Local preview only. This confirmation records a browser sample; no wallet, payment provider or Stellar transaction is used.</p>
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
        : step === "review" ? <button type="button" className={styles.primaryButton} disabled={confirming} onClick={confirmDonation}>{confirming ? "Confirming…" : "Confirm donation"}</button>
          : <><button type="button" className={styles.shareSuccess} onClick={() => void shareReceipt()}>{copied ? "Copied" : "Share"}</button><Link className={styles.primaryButton} href={`/cause/${id}`}>Done</Link></>}
    </div>, layer) : null}

    {help && <div className={styles.sheetBackdrop} role="presentation" onClick={() => setHelp(null)}><section className={styles.helpSheet} role="dialog" aria-modal="true" aria-label="Donation details" onClick={event => event.stopPropagation()}><h2>Where your donation goes</h2><p>{help}</p><button type="button" className={styles.primaryButton} onClick={() => setHelp(null)}>Got it</button></section></div>}
  </>;
}
