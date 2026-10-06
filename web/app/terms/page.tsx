import type { Metadata } from "next";
import Link from "next/link";
import { PoweredByStellarV2 } from "@/components/ui/brand";
import styles from "@/components/screens/CampaignArisan.module.css";

export const metadata: Metadata = {
  title: "Draft Testnet terms · Salapi",
  description: "An informational draft explaining the scope and limits of Salapi's Testnet preview.",
};

export default function TermsPage() {
  return <article className={styles.body} style={{ paddingBottom: 45 }}>
    <nav className={styles.toolbar} aria-label="Terms navigation"><Link href="/settings">← Back to your account</Link><Link href="/privacy">Privacy notice</Link></nav>
    <header className={styles.hero} style={{ gridTemplateColumns: "1fr" }}><div><span className={styles.eyebrow}>Salapi by Catatu · Informational draft</span><h1>Know the scope<br />before you try.</h1><p>These draft Testnet terms explain the current product experience. Legal operator details, effective date and jurisdiction remain pending review.</p></div></header>
    <aside className={styles.notice}><strong>No real funds.</strong> The current release uses valueless Stellar Testnet XLM. Example currency displays do not represent fiat deposits, withdrawals or redeemable money.</aside>
    <section className={styles.card}><h2 style={{ fontSize: 23 }}>The Testnet experience</h2><p className={styles.muted}>Salapi provides an experimental interface for donation campaigns, rotating community pools, username transfers and public network evidence. The local design preview simulates these interactions with example data and sends no transactions.</p><p className={styles.muted}>GCash, QRIS and other fiat cash-in/cash-out connections are not active payment integrations. Testnet availability, account data and network history can change or be reset. Mainnet access and real-world payment services are outside this release.</p></section>
    <section className={styles.card}><h2 style={{ fontSize: 23 }}>Check the terms of each pool</h2><p className={styles.muted}>Donation campaigns lock their recipients, creator share, approvers and deadlines at creation. Two configured wallets must approve the same proof before review closes. If timely approval is incomplete, donors claim their own refunds after review closes. Approval is not evidence that a real-world promise was fulfilled.</p><p className={styles.muted}>Disaster Vault has separate signer, waiting-period and spending-limit rules. Arisan Rooms require full upfront funding and member participation in the draw process. Read the applicable rules before confirming an action.</p><Link className={styles.textButton} href="/docs#rules">Read the pool rules →</Link></section>
    <section className={styles.card}><h2 style={{ fontSize: 23 }}>Wallets, confirmation and evidence</h2><p className={styles.muted}>Current Testnet signing keys are managed by Salapi. Public receipts confirm network activity, not independent custody, an external audit or a guarantee of safety. Use only Testnet assets in this experience.</p><p className={styles.muted}>Review the recipient, amount, deadlines and role before confirming. Network transactions can be irreversible once accepted. After an interruption, check state and the receipt before retrying.</p><p className={styles.muted}>Do not submit private documents, credentials or another person&apos;s sensitive information as public campaign proof. Do not represent example campaigns or Testnet payouts as real donations.</p></section>
    <section className={styles.card}><h2 style={{ fontSize: 23 }}>Draft status and contact</h2><p className={styles.muted}>Contact the Salapi team through the project&apos;s existing communication channel for questions about this preview. A dedicated legal contact has not been specified in this draft.</p><div className={styles.notice} style={{ marginTop: 15 }}>Before publication, complete the legal operator, effective date, contact details, jurisdiction, dispute process and any applicable participant restrictions. This page describes the Testnet product and does not present those unresolved terms as finalized.</div></section>
    <footer className={styles.stack}><Link className={styles.textButton} href="/transparency">Open public proof →</Link><PoweredByStellarV2 size={12} /></footer>
  </article>;
}
