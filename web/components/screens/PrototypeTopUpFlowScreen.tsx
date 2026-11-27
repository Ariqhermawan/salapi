"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { AppBar, Btn, Card, Ico, IconButton, PoweredByStellar } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import PrototypeDoodle from "./PrototypeDoodle";
import styles from "./PrototypeTopUpFlowScreen.module.css";

type Currency = "IDR" | "PHP";
type Via = "qris" | "card" | "va";
const PRESETS = [200, 500, 1000, 2000];
const localEquivalent = (cents: number, currency: Currency) => currency === "PHP"
  ? `₱${((cents / 100) * 58.2).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : `Rp ${Math.round((cents / 100) * 16_500).toLocaleString("en-US")}`;

export default function PrototypeTopUpFlowScreen({ currency, via, step = "amount", initialAmount = "5" }: {
  currency: Currency; via: Via; step?: "amount" | "pay"; initialAmount?: string;
}) {
  const router = useRouter();
  const goBack = useGoBack(`/topup?cur=${currency.toLowerCase()}`);
  const [amountText, setAmountText] = useState(initialAmount);
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "", name: "" });
  const [complete, setComplete] = useState(false);
  const [frame, setFrame] = useState<HTMLElement | null>(null);
  useEffect(() => setFrame(document.querySelector<HTMLElement>(".sl-app-frame")), []);
  const cents = /^\d{1,6}(\.\d{1,2})?$/.test(amountText) ? Math.round(Number(amountText) * 100) : null;
  const valid = cents !== null && cents >= 100;
  const cardValid = card.number.replace(/\D/g, "").length >= 15 && /^\d{2}\s*\/\s*\d{2}$/.test(card.expiry.trim()) && /^\d{3,4}$/.test(card.cvc.trim()) && card.name.trim().length >= 2;
  const methodName = via === "qris" ? "QRIS" : via === "card" ? "Debit or credit card" : currency === "PHP" ? "Bank transfer" : "Virtual account";
  const back = () => step === "pay" ? router.push(`/topup?method=provider&channel=${via}&cur=${currency.toLowerCase()}`) : goBack();
  const openPay = () => {
    if (!valid) return;
    router.push(`/topup?method=provider&channel=${via}&cur=${currency.toLowerCase()}&step=pay&amount=${cents}`);
  };

  return <div className={styles.screen}>
    <AppBar leading={<IconButton ariaLabel="Back" onClick={back}>{Ico.back({})}</IconButton>} title="Add money" />
    <div className={styles.body}>
      {!complete ? <>
        <Card className={styles.amountCard}>
          {step === "amount" ? <>
            <label htmlFor="preview-topup-amount">Amount · USD</label>
            <input id="preview-topup-amount" inputMode="decimal" value={amountText} onChange={event => setAmountText(event.target.value)} aria-invalid={amountText !== "" && !valid || undefined} />
            {cents !== null && cents > 0 ? <p>≈ {localEquivalent(cents, currency)}</p> : null}
            {!valid && amountText !== "" ? <small className={styles.error}>Enter $1 or more.</small> : null}
            <div className={styles.presets}>{PRESETS.map(value => <button key={value} type="button" aria-pressed={amountText === String(value / 100)} onClick={() => setAmountText(String(value / 100))}>${value / 100}</button>)}</div>
          </> : <>
            <h1>{via === "qris" ? "Scan to pay" : via === "va" ? "Transfer this amount" : "Pay by card"}</h1>
            <strong className={styles.payAmount}>${((cents ?? 0) / 100).toFixed(2)}</strong>
            {via === "qris" ? <div className={styles.qr}><QRCodeSVG value={`salapi:topup/qris?amount=${cents}`} size={208} level="M" title="QR code for local payment preview" /></div> : null}
            {via === "va" ? <div className={styles.infoRows}><div><span>Bank</span><strong>{currency === "PHP" ? "BDO Unibank" : "BCA Virtual Account"}</strong></div><div><span>Account number</span><strong>8808 0812 3456 7890</strong></div><div><span>Account name</span><strong>Salapi top up</strong></div></div> : null}
            {via === "card" ? <div className={styles.cardForm}>
              <label>Card number<input autoComplete="cc-number" inputMode="numeric" placeholder="1234 5678 9012 3456" value={card.number} onChange={event => setCard({ ...card, number: event.target.value })} /></label>
              <div><label>Expiry<input autoComplete="cc-exp" placeholder="MM / YY" value={card.expiry} onChange={event => setCard({ ...card, expiry: event.target.value })} /></label><label>CVC<input autoComplete="cc-csc" inputMode="numeric" placeholder="123" value={card.cvc} onChange={event => setCard({ ...card, cvc: event.target.value })} /></label></div>
              <label>Name on card<input autoComplete="cc-name" placeholder="As printed on the card" value={card.name} onChange={event => setCard({ ...card, name: event.target.value })} /></label>
            </div> : null}
            {via !== "card" ? <p className={styles.waiting}><i /> Waiting for payment · local preview</p> : null}
          </>}
        </Card>
        <div className={styles.methodCard}><span>{via === "qris" ? "QR" : via === "card" ? "▣" : "⌂"}</span><div><strong>{methodName}</strong><small>{via === "qris" ? "Pay with any QRIS app" : via === "card" ? "Visa or Mastercard" : currency === "PHP" ? "From a Philippine bank account" : "Bank transfer to a virtual account number"}</small></div><b>{currency}</b></div>
        {step === "amount" ? <div className={styles.infoRows}><div><span>Fee</span><strong>Free</strong></div><div><span>Arrives</span><strong>Instantly</strong></div></div> : <p className={styles.localNote}>Local preview only. This page does not contact a payment provider or change your balance.</p>}
        {step === "pay" && via !== "card" ? <PrototypeDoodle /> : null}
      </> : <section className={styles.complete}>
        <span>✓</span><h1>Payment preview complete</h1><p>No payment was sent and no balance changed. This is a local demonstration only.</p>
        <div className={styles.infoRows}><div><span>Method</span><strong>{methodName}</strong></div><div><span>Amount</span><strong>${((cents ?? 0) / 100).toFixed(2)}</strong></div><div><span>Provider request</span><strong>Not sent</strong></div></div>
        <Btn onClick={() => router.push(`/topup?cur=${currency.toLowerCase()}`)}>Back to methods</Btn>
      </section>}
      {step === "amount" ? <PrototypeDoodle /> : null}
      <div className={styles.powered}><PoweredByStellar /></div>
    </div>
    {frame && !complete ? createPortal(<div className={styles.cta}>{step === "amount" ? <Btn disabled={!valid} onClick={openPay}>Continue</Btn> : <Btn disabled={via === "card" && !cardValid} onClick={() => setComplete(true)}>Simulate payment result</Btn>}</div>, frame) : null}
  </div>;
}
