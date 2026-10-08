"use client";

import Image from "next/image";
import Link from "next/link";
import { useT } from "@/components/I18nProvider";
import { homeCopy } from "@/lib/i18n/revamp-home";
import { PoweredByStellarV2 } from "@/components/ui/brand";
import styles from "./SavingsComingSoon.module.css";

/** Product placeholder only. Do not mount the experimental savings flow or its reads. */
export default function SavingsComingSoonScreen() {
  const { locale } = useT();
  const copy = (phrase: string) => homeCopy(locale, phrase);
  return <section className={styles.screen} aria-labelledby="savings-heading">
    <Link href="/vaults" className={styles.back}>{copy("Back to Vaults")}</Link>
    <div className={styles.card}>
      <Image src="/illustrations/savings.png" alt="" width={96} height={108} />
      <span className={styles.badge}>{copy("Coming soon")}</span>
      <h1 id="savings-heading">Smart Savings</h1>
      <p>{copy("Smart Savings is not available yet. No savings deposits can be made here.")}</p>
    </div>
    <footer className={styles.footer}><PoweredByStellarV2 /></footer>
  </section>;
}
