"use client";

import { useRouter } from "next/navigation";
import { AppBar, IconButton, Ico, PoweredByStellar } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import styles from "./PrototypeTopUpScreen.module.css";

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

function Method({ badge, title, description, tag, wallets, onClick, disabled = false }: {
  badge: React.ReactNode; title: string; description?: string; tag?: string; wallets?: string[];
  onClick?: () => void; disabled?: boolean;
}) {
  return <button className={styles.method} type="button" onClick={onClick} disabled={disabled}>
    <span className={styles.badge}>{badge}</span>
    <span className={styles.copy}>
      <span className={styles.name}>{title}</span>
      {description ? <span className={styles.note}>{description}</span> : null}
      {wallets ? <span className={styles.wallets} aria-label={`Works with ${wallets.join(", ")}`}>{wallets.map(name => <span key={name}>{name}</span>)}</span> : null}
    </span>
    {tag ? <span className={styles.tag}>{tag}</span> : null}
  </button>;
}

export default function PrototypeTopUpScreen({ onFaucet }: { onFaucet: () => void }) {
  const router = useRouter();
  const goBack = useGoBack("/");
  return <div className={styles.screen}>
    <AppBar leading={<IconButton ariaLabel="Back" onClick={goBack}>{Ico.back({})}</IconButton>} title="Add money" />
    <div className={styles.methods}>
      <Method badge="QR" title="QRIS" description="Instant · No fee" tag="IDR" wallets={["GoPay", "OVO", "DANA", "ShopeePay"]} onClick={() => router.push("/topup/qris")} />
      <Method badge={<CardGlyph />} title="Debit or credit card" description="Visa or Mastercard" onClick={() => router.push("/topup/card")} />
      <Method badge={<BankGlyph />} title="Virtual account" description="Bank transfer to a virtual account number" tag="IDR" onClick={() => router.push("/topup/va")} />
      <Method badge={<WalletGlyph />} title="From another wallet" description="Transfer to your Stellar address" onClick={() => router.push("/receive")} />
      <Method badge={<DropGlyph />} title="Faucet" description="Adds $10 to your balance" onClick={onFaucet} />
      <Method badge="G" title="GCash" tag="Coming soon" disabled />
    </div>
    <div className={styles.footer}><PoweredByStellar /></div>
  </div>;
}
