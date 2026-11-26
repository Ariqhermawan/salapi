"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppBar, Btn, Ico, IconButton } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import styles from "./PrototypeWithdrawScreen.module.css";

const COUNTRIES = [
  { id: "ID", name: "Indonesia", banks: ["BCA", "Bank Mandiri", "BNI", "BRI", "CIMB Niaga", "Permata Bank", "Bank Syariah Indonesia", "Bank Danamon"] },
  { id: "PH", name: "Philippines", banks: ["BDO Unibank", "BPI", "Metrobank", "UnionBank", "Landbank", "Security Bank", "RCBC"] },
  { id: "VN", name: "Vietnam", banks: ["Vietcombank", "Techcombank", "BIDV", "VietinBank", "MB Bank", "ACB"] },
] as const;

export default function PrototypeWithdrawScreen() {
  const router = useRouter();
  const goBack = useGoBack("/");
  const [countryId, setCountryId] = useState<(typeof COUNTRIES)[number]["id"]>("ID");
  const [bank, setBank] = useState("");
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [amountText, setAmountText] = useState("");
  const [review, setReview] = useState(false);
  const [done, setDone] = useState(false);
  const balance = 2412.26;
  const digits = number.replace(/\D/g, "");
  const numberOk = digits.length >= 6;
  const accountOk = bank !== "" && numberOk && holder.trim().length >= 2;
  const amount = Number(amountText);
  const amountCents = Number.isFinite(amount) ? Math.round(amount * 100) : null;
  const amountError = amountText !== "" && (amountCents === null || amountCents < 100 || amountCents > 241226);
  const valid = amountCents !== null && amountCents >= 100 && amountCents <= 241226;
  const country = COUNTRIES.find(entry => entry.id === countryId) ?? COUNTRIES[0];
  const presets = [["25%", .25], ["50%", .5], ["75%", .75], ["Max", 1]] as const;
  const back = () => review ? setReview(false) : goBack();

  return <div className={styles.screen}>
    <AppBar leading={<IconButton ariaLabel="Back" onClick={back}>{Ico.back({})}</IconButton>} title="Withdraw" />
    {done ? <>
      <section className={styles.done} aria-label="Withdrawal preview">
        <span className={styles.badge} aria-hidden="true">✓</span>
        <h1>Withdrawal request saved</h1>
        <p>This is a local preview. No money moved and no bank details were sent.</p>
        <div className={styles.row}><span>To</span><strong>{bank} · •••• {digits.slice(-4)}</strong></div>
        <div className={styles.row}><span>Amount</span><strong>${amount.toFixed(2)}</strong></div>
        <div className={styles.row}><span>Fee</span><strong>$0.25</strong></div>
        <div className={styles.row}><span>You'll receive</span><strong>${Math.max(0, amount - 0.25).toFixed(2)}</strong></div>
      </section>
      <div className={styles.actions}>
        <div className={styles.cta}><Btn onClick={() => router.push("/")}>Home</Btn></div>
        <Btn kind="ghost" onClick={() => { setDone(false); setReview(false); setAmountText(""); setNumber(""); setHolder(""); setBank(""); }}>Try another withdrawal</Btn>
      </div>
    </> : <>
      <div className={styles.method}>
        <span className={styles.badge}><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2.5 7 7.5-4 7.5 4M4 8.5h12M5.5 8.5v7m4.5-7v7m4.5-7v7M3 16.5h14M2.5 18h15" /></svg></span>
        <span className={styles.methodCopy}><span className={styles.methodName}>Bank account</span><span className={styles.methodNote}>Same day · $0.25 fee</span></span>
      </div>
      <section className={styles.form} aria-label="Bank account details">
        <label className={styles.field}><span>Country</span><select value={countryId} onChange={event => { setCountryId(event.target.value as typeof countryId); setBank(""); }}>
          {COUNTRIES.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select></label>
        <label className={styles.field}><span>Bank name</span><select value={bank} onChange={event => setBank(event.target.value)}>
          <option value="">Search for a bank</option>{country.banks.map(name => <option key={name} value={name}>{name}</option>)}
        </select></label>
        <label className={styles.field}><span>Account number</span><input inputMode="numeric" autoComplete="off" placeholder="Bank account number" value={number} onChange={event => setNumber(event.target.value)} /></label>
        <label className={styles.field}><span>Legal name</span><input autoComplete="name" placeholder="Name on the bank account" value={holder} onChange={event => setHolder(event.target.value)} /></label>
        <p className={styles.hint}><span aria-hidden="true">ⓘ</span>Check the number and the name. A withdrawal can't be reversed.</p>
      </section>
      <section className={styles.amount} data-disabled={!numberOk} aria-label="Withdrawal amount">
        <label htmlFor="prototype-withdraw-amount" className={styles.amountLabel}>Amount · USD · ${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} available</label>
        <input id="prototype-withdraw-amount" className={styles.amountInput} inputMode="decimal" value={amountText} onChange={event => setAmountText(event.target.value)} placeholder="$0" disabled={!numberOk} aria-invalid={!!amountError} />
        <div className={styles.presets} aria-label="Withdrawal amounts">
          {presets.map(([label, share]) => <button className={styles.preset} key={label} type="button" disabled={!numberOk} onClick={() => setAmountText((Math.floor(balance * share * 100) / 100).toFixed(2))}>{label}</button>)}
        </div>
        {amountError ? <p className={styles.hint} role="status">Enter $1 or more, up to your available balance.</p> : null}
      </section>
      {!numberOk ? <p className={styles.instruction}>Enter the account number to set an amount.</p> : null}
      <div className={styles.cta}><Btn trailing={Ico.chev({ c: "#fff" })} disabled={!accountOk || !valid} onClick={() => setReview(true)}>Continue</Btn></div>
      {review ? <div className={styles.backdrop} role="presentation" onClick={event => { if (event.target === event.currentTarget) setReview(false); }}>
        <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="withdraw-review-title">
          <div className={styles.handle} aria-hidden="true" />
          <h2 id="withdraw-review-title">Review withdrawal</h2>
          <div className={styles.row}><span>To</span><strong>{bank} · •••• {digits.slice(-4)}</strong></div>
          <div className={styles.row}><span>Legal name</span><strong>{holder.trim()}</strong></div>
          <div className={styles.row}><span>Amount</span><strong>${amount.toFixed(2)}</strong></div>
          <div className={styles.row}><span>Fee</span><strong>$0.25</strong></div>
          <div className={styles.row}><span>You'll receive</span><strong>${Math.max(0, amount - 0.25).toFixed(2)}</strong></div>
          <div className={styles.row}><span>Arrives</span><strong>Same day</strong></div>
          <p className={styles.sheetNote}>Local preview only. No bank details are saved or sent, and no funds will move.</p>
          <Btn onClick={() => { setReview(false); setDone(true); }}>Withdraw</Btn>
        </section>
      </div> : null}
    </>}
  </div>;
}
