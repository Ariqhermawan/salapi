"use client";

import { useState } from "react";
import Link from "next/link";
import { T, Ico, Btn, PoweredByStellar } from "@/components/ui/kit";
import { formatLocal } from "@/lib/ui/currency";
import { useT } from "@/components/I18nProvider";
import type { Circle } from "@/lib/circles/types";
import { isLocalPreview } from "@/lib/local-preview";
import styles from "./CirclesPreview.module.css";
import { circlesCopy } from "@/lib/i18n/revamp-circles";

export default function CircleManageScreen({ circle }: { circle: Circle }) {
  const { currency, locale } = useT();
  const c = circlesCopy(locale);
  const [note, setNote] = useState("");
  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <Link href={`/circles/${circle.id}`} className={styles.back}>
          {Ico.back({ size: 14, c: T.action })}{c("Example cause")}</Link>
        <span className={styles.badge}>{c("Organizer prototype")}</span>
      </div>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>{c("Tools for community organizers")}</span>
          <h1>{c("Care for the cause.")}</h1>
          <p>{circle.title}</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/illustrations/giving.png" alt={c("People sharing a heart")} />
      </header>
      <Link href="/campaigns?mode=testnet" className={styles.liveLink}>
        <div>
          <strong>{isLocalPreview ? c("Explore D4 example campaigns") : c("Manage live Testnet campaigns")}</strong>
          <span>
            {isLocalPreview ? c("Explore simulated escrow and proof review. No transactions.") : c("Create campaigns, submit proof and review actual D4 escrow.")}
          </span>
        </div>
        {Ico.chev({ size: 17, c: T.action })}
      </Link>
      <div className={styles.notice}>{c("This organizer view is a future concept. No real allowance, custody, reputation score or dispute window is shown here.")}</div>
      <section className={styles.warmCard}>
        <span className={styles.eyebrow}>{c("Example campaign summary")}</span>
        <h2>{circle.title}</h2>
        <div className={styles.metrics}>
          <div>
            <small>{c("Illustrative raised amount")}</small>
            <strong>{formatLocal(circle.pesoRaised, currency)}</strong>
          </div>
          <div>
            <small>{c("Proposed organizer allowance")}</small>
            <strong>{circle.allowance?.percentage ?? 0}%</strong>
          </div>
        </div>
        <p>{c("Example values only. These are not claimable funds.")}</p>
      </section>
      <section className={styles.card}>
        <h3>{c("Proof of delivery")}</h3>
        <p>{c("The concept would collect evidence from organizers. In live D4 campaigns, the creator submits a public proof URL and hash, then two configured wallets approve that proof.")}</p>
        <div className={styles.action}>
          <Btn
            kind="quiet"
            size="md"
            onClick={() =>
              setNote(
                c("Proof upload is a prototype placeholder. No file was uploaded and no approval was recorded."),
              )
            }
          >{c("Explore proof upload")}</Btn>
        </div>
        {note && (
          <p role="status" className={styles.notice} style={{ marginTop: 12 }}>
            {note}
          </p>
        )}
      </section>
      <section className={styles.card}>
        <h3>{c("Future trust tools")}</h3>
        <div className={styles.mutedRow}>
          <span>{c("Organizer verification")}</span>
          <span className={styles.statusChip}>{c("Planned")}</span>
        </div>
        <div className={styles.mutedRow}>
          <span>{c("Reputation from completed causes")}</span>
          <span className={styles.statusChip}>{c("Planned")}</span>
        </div>
        <div className={styles.mutedRow}>
          <span>{c("Dispute review and allowance escrow")}</span>
          <span className={styles.statusChip}>{c("Planned")}</span>
        </div>
        <p>{c("No simulated score or countdown is presented as a current result.")}</p>
      </section>
      <Link href="/you/kyc-tier" className={styles.cardLink}>{c("Read about proposed trust tiers")}{Ico.chev({ size: 14, c: T.action })}
      </Link>
      <footer className={styles.footer}>
        <PoweredByStellar />
        <span>{c("Circles prototype · No transactions.")}</span>
      </footer>
    </div>
  );
}
