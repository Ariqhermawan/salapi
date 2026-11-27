"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppBar, Btn, Ico, IconButton } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import PrototypeDoodle from "./PrototypeDoodle";
import styles from "./PrototypeWithdrawScreen.module.css";

const COUNTRIES = [
  { id: "ID", name: "Indonesia", banks: ["BCA", "Bank Mandiri", "BNI", "BRI", "CIMB Niaga", "Permata Bank", "Bank Syariah Indonesia", "Bank Danamon"] },
  { id: "PH", name: "Philippines", banks: ["BDO Unibank", "BPI", "Metrobank", "UnionBank", "Landbank", "Security Bank", "RCBC"] },
  { id: "VN", name: "Vietnam", banks: ["Vietcombank", "Techcombank", "BIDV", "VietinBank", "MB Bank", "ACB"] },
] as const;

function PickerField({ id, value, placeholder, options, searchable = false, onChange }: {
  id: string;
  value: string;
  placeholder: string;
  options: readonly string[];
  searchable?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const filtered = options.filter(option => option.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div className={styles.picker} ref={root}>
    <button id={id} type="button" className={styles.pickerTrigger} data-empty={!value || undefined} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-options`} onClick={() => { setQuery(""); setOpen(value => !value); }}>
      <span>{value || placeholder}</span>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open && <div id={`${id}-options`} className={styles.pickerMenu} role="listbox" aria-label={placeholder}>
      {searchable && <input className={styles.pickerSearch} type="search" autoFocus aria-label="Search banks" placeholder="Search banks" value={query} onChange={event => setQuery(event.target.value)} />}
      <div className={styles.pickerOptions}>
        {filtered.map(option => <button key={option} type="button" role="option" aria-selected={option === value} className={styles.pickerOption} onClick={() => { onChange(option); setOpen(false); setQuery(""); }}>
          {option}{option === value ? <span aria-hidden="true">✓</span> : null}
        </button>)}
        {!filtered.length && <p className={styles.pickerEmpty}>No bank matches “{query.trim()}”.</p>}
      </div>
    </div>}
  </div>;
}

export default function PrototypeWithdrawScreen({ initialCurrency }: { initialCurrency?: "IDR" | "PHP" | "USDC" } = {}) {
  const router = useRouter();
  const goBack = useGoBack("/");
  const currency = initialCurrency ?? null;
  const crypto = currency === "USDC";
  const countryId = currency === "PHP" ? "PH" : "ID";
  const [bank, setBank] = useState("");
  const [address, setAddress] = useState("");
  const [memo, setMemo] = useState("");
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [amountText, setAmountText] = useState("");
  const [review, setReview] = useState(false);
  const [done, setDone] = useState(false);
  const balance = 2412.26;
  const digits = number.replace(/\D/g, "");
  const numberOk = digits.length >= 6;
  const wallet = address.trim().toUpperCase();
  const walletOk = /^G[A-Z2-7]{55}$/.test(wallet);
  const destinationOk = crypto ? walletOk : bank !== "" && numberOk && holder.trim().length >= 2;
  const accountOk = destinationOk;
  const amount = Number(amountText);
  const amountCents = Number.isFinite(amount) ? Math.round(amount * 100) : null;
  const amountError = amountText !== "" && (amountCents === null || amountCents < 100 || amountCents > 241226);
  const valid = amountCents !== null && amountCents >= 100 && amountCents <= 241226;
  const country = COUNTRIES.find(entry => entry.id === countryId) ?? COUNTRIES[0];
  const presets = [["25%", .25], ["50%", .5], ["75%", .75], ["Max", 1]] as const;
  const back = () => review ? setReview(false) : goBack();
  const fee = 0.25;
  const destination = crypto ? `Stellar wallet · ${wallet.slice(0, 4)}…${wallet.slice(-4)}` : `${bank} · •••• ${digits.slice(-4)}`;
  const selectCurrency = (next: "IDR" | "PHP" | "USDC") => router.replace(`/withdraw?cur=${next.toLowerCase()}`);

  return <div className={styles.screen}>
    <AppBar leading={<IconButton ariaLabel="Back" onClick={back}>{Ico.back({})}</IconButton>} title="Withdraw" />
    {!currency ? <section className={styles.currencyChooser}>
      <h2>Choose a currency</h2>
      <div role="radiogroup" aria-label="Currency">
        {([
          ["IDR", "Indonesian rupiah", "To an Indonesian bank account"],
          ["PHP", "Philippine peso", "To a Philippine bank account"],
          ["USDC", "USDC", "To a crypto wallet on Stellar"],
        ] as const).map(([id, name, description]) => <button key={id} type="button" role="radio" aria-checked={false} className={styles.currencyOption} onClick={() => selectCurrency(id)}>
          <img src={`/prototype-money/${id.toLowerCase()}.svg`} alt="" width="32" height="32" />
          <span><strong>{id} · {name}</strong><small>{description}</small></span><i />
        </button>)}
      </div>
      <PrototypeDoodle />
    </section> : <>
    <nav className={styles.currencyTabs} role="tablist" aria-label="Currency">
      {(["IDR", "PHP", "USDC"] as const).map(id => <button key={id} type="button" role="tab" aria-selected={currency === id} onClick={() => selectCurrency(id)}>{id}</button>)}
    </nav>
    {done ? <>
      <section className={styles.done} aria-label="Withdrawal preview">
        <span className={styles.badge} aria-hidden="true">✓</span>
        <h1>Withdrawal request saved</h1>
        <p>This is a local preview. No money moved and no bank details were sent.</p>
        <div className={styles.row}><span>To</span><strong>{destination}</strong></div>
        <div className={styles.row}><span>Amount</span><strong>${amount.toFixed(2)}</strong></div>
        <div className={styles.row}><span>{crypto ? "Network fee" : "Fee"}</span><strong>${fee.toFixed(2)}</strong></div>
        <div className={styles.row}><span>You&apos;ll receive</span><strong>${Math.max(0, amount - fee).toFixed(2)}</strong></div>
      </section>
      <div className={styles.actions}>
        <div className={styles.cta}><Btn onClick={() => router.push("/")}>Home</Btn></div>
        <Btn kind="ghost" onClick={() => { setDone(false); setReview(false); setAmountText(""); setNumber(""); setHolder(""); setBank(""); }}>Try another withdrawal</Btn>
      </div>
    </> : <>
      {!crypto ? <div className={styles.method}>
        <span className={styles.badge}><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2.5 7 7.5-4 7.5 4M4 8.5h12M5.5 8.5v7m4.5-7v7m4.5-7v7M3 16.5h14M2.5 18h15" /></svg></span>
        <span className={styles.methodCopy}><span className={styles.methodName}>Bank account</span><span className={styles.methodNote}>{currency === "PHP" ? "Same day · $0.25 fee" : "Same day · $0.25 fee"}</span></span>
      </div> : <div className={styles.method}>
        <span className={styles.badge}><img width="30" height="30" src="/prototype-money/xlm.svg" alt="" /></span>
        <span className={styles.methodCopy}><span className={styles.methodName}>Stellar wallet</span><span className={styles.methodNote}>Stellar network only · $0.25 network fee</span></span>
      </div>}
      {!crypto ? <section className={styles.form} aria-label="Bank account details">
        <div className={styles.field}><label htmlFor="prototype-withdraw-bank">Bank name</label><PickerField id="prototype-withdraw-bank" value={bank} placeholder="Search for a bank" options={country.banks} searchable onChange={setBank} /></div>
        <div className={styles.field}><label htmlFor="prototype-withdraw-number">Account number</label><input id="prototype-withdraw-number" inputMode="numeric" autoComplete="off" placeholder="Bank account number" value={number} onChange={event => setNumber(event.target.value)} /></div>
        <div className={styles.field}><label htmlFor="prototype-withdraw-legal-name">Legal name</label><input id="prototype-withdraw-legal-name" autoComplete="name" placeholder="Name on the bank account" value={holder} onChange={event => setHolder(event.target.value)} /></div>
        <p className={styles.hint}><span aria-hidden="true">ⓘ</span>Check the number and the name. A withdrawal can&apos;t be reversed.</p>
      </section> : <section className={styles.form} aria-label="Stellar wallet details">
        <div className={styles.field}><label htmlFor="prototype-withdraw-address">Wallet address</label><input id="prototype-withdraw-address" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Starts with G, 56 characters" value={address} onChange={event => setAddress(event.target.value)} aria-invalid={address.trim() !== "" && !walletOk || undefined} /></div>
        {address.trim() !== "" && !walletOk ? <p className={styles.error}>A Stellar address starts with G and has 56 characters.</p> : null}
        <div className={styles.field}><label htmlFor="prototype-withdraw-memo">Memo</label><input id="prototype-withdraw-memo" autoComplete="off" placeholder="Only if the receiving wallet asks for one" maxLength={28} value={memo} onChange={event => setMemo(event.target.value)} /></div>
        <p className={styles.hint}><span aria-hidden="true">ⓘ</span>Check the address and the memo. A withdrawal can&apos;t be reversed.</p>
      </section>}
      <section className={styles.amount} data-disabled={!destinationOk} aria-label="Withdrawal amount">
        <label htmlFor="prototype-withdraw-amount" className={styles.amountLabel}>Amount · USD · ${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} available</label>
        <input id="prototype-withdraw-amount" className={styles.amountInput} inputMode="decimal" value={amountText} onChange={event => setAmountText(event.target.value)} placeholder="$0" disabled={!destinationOk} aria-invalid={!!amountError} />
        <div className={styles.presets} aria-label="Withdrawal amounts">
          {presets.map(([label, share]) => <button className={styles.preset} key={label} type="button" disabled={!destinationOk} onClick={() => setAmountText((Math.floor(balance * share * 100) / 100).toFixed(2))}>{label}</button>)}
        </div>
        {amountError ? <p className={styles.hint} role="status">Enter $1 or more, up to your available balance.</p> : null}
      </section>
      {!destinationOk ? <p className={styles.instruction}>Enter the {crypto ? "wallet address" : "account number"} to set an amount.</p> : null}
      <PrototypeDoodle />
      <div className={styles.cta}><Btn trailing={Ico.chev({ c: "#fff" })} disabled={!accountOk || !valid} onClick={() => setReview(true)}>Continue</Btn></div>
      {review ? <div className={styles.backdrop} role="presentation" onClick={event => { if (event.target === event.currentTarget) setReview(false); }}>
        <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="withdraw-review-title">
          <div className={styles.handle} aria-hidden="true" />
          <h2 id="withdraw-review-title">Review withdrawal</h2>
          <div className={styles.row}><span>To</span><strong>{destination}</strong></div>
          {crypto ? <><div className={styles.row}><span>Network</span><strong>Stellar</strong></div>{memo.trim() ? <div className={styles.row}><span>Memo</span><strong>{memo.trim()}</strong></div> : null}</> : <div className={styles.row}><span>Legal name</span><strong>{holder.trim()}</strong></div>}
          <div className={styles.row}><span>Amount</span><strong>${amount.toFixed(2)}</strong></div>
          <div className={styles.row}><span>{crypto ? "Network fee" : "Fee"}</span><strong>${fee.toFixed(2)}</strong></div>
          <div className={styles.row}><span>You&apos;ll receive</span><strong>${Math.max(0, amount - fee).toFixed(2)}</strong></div>
          <div className={styles.row}><span>Arrives</span><strong>{crypto ? "Within minutes" : "Same day"}</strong></div>
          <p className={styles.sheetNote}>Local preview only. No bank details are saved or sent, and no funds will move.</p>
          <Btn onClick={() => { setReview(false); setDone(true); }}>Withdraw</Btn>
        </section>
      </div> : null}
    </>}
    </>}
  </div>;
}
