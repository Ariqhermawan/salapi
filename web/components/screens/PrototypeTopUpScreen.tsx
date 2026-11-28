"use client";

import { useRouter } from "next/navigation";
import { AppBar, IconButton, Ico, PoweredByStellar } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import { isLocalPreview } from "@/lib/local-preview";
import PrototypeDoodle from "./PrototypeDoodle";
import styles from "./PrototypeTopUpScreen.module.css";

type Currency = "IDR" | "PHP" | "USDC";
const CURRENCIES: { id: Currency; name: string; description: string }[] = [
  { id: "IDR", name: "Indonesian rupiah", description: "QRIS, virtual account or card" },
  { id: "PHP", name: "Philippine peso", description: "Bank transfer or card" },
  { id: "USDC", name: "USDC", description: "From a crypto wallet on Stellar" },
];

function BankGlyph() {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2.5 7 7.5-4 7.5 4M4 8.5h12M5.5 8.5v7m4.5-7v7m4.5-7v7M3 16.5h14M2.5 18h15" /></svg>;
}

function CardGlyph() {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="4" width="15" height="12" rx="2" /><path d="M3 8h14m-11 4h3" /></svg>;
}

function WalletGlyph() {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12" rx="2" /><path d="M3 7h14m-5 4h2" /></svg>;
}

function DropGlyph() {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 2.5c-1.8 2.7-5 6.4-5 9.7a5 5 0 1 0 10 0c0-3.3-3.2-7-5-9.7Z" /><path d="M7.5 12.5a2.5 2.5 0 0 0 2.5 2" /></svg>;
}

function Brand({ name, label }: { name: string; label?: string }) {
  return <span className={styles.brand} aria-label={label ?? name}><img src={`/prototype-payment-logos/${name.toLowerCase()}.svg`} alt="" /></span>;
}

function Marks({ names, label }: { names: string[]; label: string }) {
  return <span className={styles.markLine} role="img" aria-label={`${label} ${names.join(", ")}`}>
    {names.map(name => <Brand key={name} name={name} />)}{names.includes("ShopeePay") ? <span className={styles.wordMark}>ShopeePay</span> : null}
  </span>;
}

function Method({ badge, title, description, tag, mark, extra, onClick, disabled = false }: {
  badge: React.ReactNode; title: string; description?: string; tag?: string; mark?: string; extra?: React.ReactNode;
  onClick?: () => void; disabled?: boolean;
}) {
  return <button className={styles.method} type="button" onClick={onClick} disabled={disabled}>
    <span className={styles.badge}>{badge}</span>
    <span className={styles.copy}>
      <span className={styles.name}>{title}{mark ? <Brand name={mark} /> : null}</span>
      {description ? <span className={styles.note}>{description}</span> : null}
      {extra}
    </span>
    {tag ? <span className={styles.tag}>{tag}</span> : null}
  </button>;
}

export default function PrototypeTopUpScreen({ onFaucet, initialCurrency, initialAmount, localPreview = isLocalPreview }: { onFaucet: () => void; initialCurrency?: Currency; initialAmount?: string; localPreview?: boolean }) {
  const router = useRouter();
  const goBack = useGoBack("/");
  const currency = initialCurrency ?? null;
  const amountQuery = initialAmount ? `&amount=${Math.round(Number(initialAmount) * 100)}` : "";
  const chooseCurrency = (next: Currency) => router.replace(`/topup?cur=${next.toLowerCase()}${amountQuery}`);
  const openProvider = (via: "qris" | "card" | "va", cur: Currency) =>
    router.push(`/topup?method=provider&channel=${via}&cur=${cur.toLowerCase()}${amountQuery}`);

  return <div className={styles.screen}>
    <AppBar leading={<IconButton ariaLabel="Back" onClick={goBack}>{Ico.back({})}</IconButton>} title="Add money" />
    {!currency ? <section className={styles.currencyChooser}>
      <h2>Choose a currency</h2>
      <div role="radiogroup" aria-label="Currency">
        {CURRENCIES.map(item => <button key={item.id} type="button" role="radio" aria-checked={false} className={styles.currencyOption} onClick={() => chooseCurrency(item.id)}>
          <img src={`/prototype-money/${item.id.toLowerCase()}.svg`} alt="" width="32" height="32" />
          <span><strong>{item.id} · {item.name}</strong><small>{item.description}</small></span><i />
        </button>)}
      </div>
      <PrototypeDoodle />
    </section> : <>
      <nav className={styles.currencyTabs} role="tablist" aria-label="Currency">
        {CURRENCIES.map(item => <button key={item.id} type="button" role="tab" aria-selected={currency === item.id} onClick={() => chooseCurrency(item.id)}>{item.id}</button>)}
      </nav>
      <div className={styles.methods}>
        {currency === "IDR" && <>
          <Method badge="QR" title="QRIS" mark="qris" description={localPreview ? "Instant · No fee" : "Payment provider not connected yet"} tag={localPreview ? undefined : "Coming soon"} extra={<><Marks names={["GoPay", "OVO", "DANA", "ShopeePay"]} label="E-wallets:"/><Marks names={["BCA", "Mandiri", "BNI", "BRI"]} label="Bank apps:"/></>} onClick={() => openProvider("qris", currency)} disabled={!localPreview} />
          <Method badge={<BankGlyph />} title="Virtual account" description={localPreview ? "Bank transfer to a virtual account number" : "Payment provider not connected yet"} tag={localPreview ? undefined : "Coming soon"} extra={<Marks names={["BCA", "Mandiri", "BNI", "BRI"]} label="Banks:"/>} onClick={() => openProvider("va", currency)} disabled={!localPreview} />
          <Method badge={<CardGlyph />} title="Debit or credit card" description={localPreview ? "Visa or Mastercard" : "Payment provider not connected yet"} tag={localPreview ? undefined : "Coming soon"} extra={<Marks names={["Visa", "Mastercard"]} label="Card networks:"/>} onClick={() => openProvider("card", currency)} disabled={!localPreview} />
        </>}
        {currency === "PHP" && <>
          <Method badge="G" title="GCash" mark="gcash" tag="Coming soon" disabled />
          <Method badge={<BankGlyph />} title="Bank transfer" description={localPreview ? "From a Philippine bank account" : "Payment provider not connected yet"} tag={localPreview ? undefined : "Coming soon"} extra={<Marks names={["BDO", "BPI", "Metrobank", "UnionBank"]} label="Banks:"/>} onClick={() => openProvider("va", currency)} disabled={!localPreview} />
          <Method badge={<CardGlyph />} title="Debit or credit card" description={localPreview ? "Visa or Mastercard" : "Payment provider not connected yet"} tag={localPreview ? undefined : "Coming soon"} extra={<Marks names={["Visa", "Mastercard"]} label="Card networks:"/>} onClick={() => openProvider("card", currency)} disabled={!localPreview} />
        </>}
        {currency === "USDC" && <>
          <Method badge={<img className={styles.coinBadge} src="/prototype-money/xlm.svg" alt="" />} title="From another wallet" description={localPreview ? "Send USDC to your Stellar address" : "Deposit Testnet XLM to your Stellar address"} onClick={() => router.push("/receive")} />
          <div className={styles.infoRows}><div><span>Network</span><strong>Stellar only</strong></div><div><span>Network fee</span><strong>{localPreview ? "$0.25" : "Testnet"}</strong></div><div><span>Memo</span><strong>{localPreview ? "Required" : "Check Receive"}</strong></div></div>
          <Method badge={<DropGlyph />} title={localPreview ? "Faucet" : "Testnet faucet"} description={localPreview ? "Adds $10 to your balance" : "Request native XLM from Stellar Friendbot"} onClick={onFaucet} />
        </>}
      </div>
      <div className={styles.footer}><PoweredByStellar /></div>
    </>}
  </div>;
}
