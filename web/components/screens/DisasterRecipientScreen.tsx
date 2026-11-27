"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Flag } from "@phosphor-icons/react/dist/csr/Flag";
import { useGoBack } from "@/lib/ui/useGoBack";
import { disasterEvents } from "@/app/disaster-actions";
import { formatStroops } from "@/lib/format-stroops";
import { DISASTER_NGO_CATEGORIES, findDisasterNgo } from "@/lib/disaster-ngos";
import { Ico } from "@/components/ui/kit";
import styles from "./DisasterRecipientScreen.module.css";

type Feed = Awaited<ReturnType<typeof disasterEvents>>;
const EXPLORER = "https://stellar.expert/explorer/testnet";

export default function DisasterRecipientScreen({ address, slug }: { address?: string; slug?: string }) {
  const back = useGoBack("/vault");
  const router = useRouter();
  const [feed, setFeed] = useState<Feed | null>(null);

  useEffect(() => {
    if (!address) return;
    let active = true;
    disasterEvents().then(value => { if (active) setFeed(value); })
      .catch(() => { if (active) setFeed({ ok: false, error: "Recent activity could not be loaded." }); });
    return () => { active = false; };
  }, [address]);

  const payouts = feed?.ok
    ? feed.events.filter(event => event.kind === "payout" && event.counterparty === address)
    : [];

  const previewNgo = findDisasterNgo(slug);

  if (previewNgo) {
    const category = DISASTER_NGO_CATEGORIES.find((item) => item.id === previewNgo.category)!;
    return <main className={styles.screen}>
    <header className={styles.header}>
      <button type="button" aria-label="Back to Disaster Vault" className={styles.back} onClick={back}>{Ico.back({ size: 20 })}</button>
      <h1>NGO</h1><span className={styles.spacer} aria-hidden="true" />
    </header>
    <section className={styles.previewNgoCard}>
      <div className={styles.previewNgoTop}>
        <span className={styles.previewNgoAvatar}><Image src={category.art} alt="" width={42} height={42} /></span>
        <div className={styles.previewNgoTitle}>
          <span className={styles.unverified}>Testnet example profile</span>
          <h2>{previewNgo.name}</h2>
          <p>{category.name} · {previewNgo.place} · {previewNgo.focus}</p>
        </div>
      </div>
      <p className={styles.previewNgoAbout}>{previewNgo.about}</p>
      <div className={styles.previewNgoActions}>
        <button type="button" className={styles.donateButton} onClick={() => router.push("/vault/contribute")}>Contribute to the vault</button>
        <button type="button" className={styles.reportButton} aria-label="Send feedback about this NGO" onClick={() => router.push("/you/feedback")}><Flag size={17} aria-hidden="true" /></button>
      </div>
      <p className={styles.sharedVaultNote}>This sample is not a real or verified organization. Testnet contributions go to the shared Disaster Vault, not directly to this profile.</p>
      <div className={styles.vaultTotal}><span>On-chain payouts linked</span><strong>None</strong></div>
      <div className={styles.previewNgoStats}>
        <div><span>Testnet payouts</span><strong>0</strong></div>
        <div><span>People reached</span><strong>Not tracked</strong></div>
      </div>
    </section>
    <section className={styles.previewActivity}>
      <h2>Vault activity · 0</h2>
      <p>No on-chain payouts are linked to this example profile.</p>
      <Link href="/vault?tab=activity" className={styles.previewActivityRow}>View Disaster Vault activity {Ico.chev({ size: 16 })}</Link>
    </section>
  </main>;
  }

  return <main className={styles.screen}>
    <header className={styles.header}>
      <button type="button" aria-label="Back to Disaster Vault" className={styles.back} onClick={back}>{Ico.back({ size: 20 })}</button>
      <h1>NGO profile</h1>
      <span className={styles.spacer} aria-hidden="true" />
    </header>

    <section className={styles.profile}>
      <span className={styles.avatar} aria-hidden="true">{Ico.user({ size: 28 })}</span>
      <div className={styles.profileCopy}>
        <h2 className={slug ? styles.slugTitle : undefined}>{slug ? slug.replaceAll("-", " ") : "Disaster Vault recipient"}</h2>
        <p>{address ? "Organization details have not been published for this wallet." : "No verified Testnet wallet or organization details are linked to this profile yet."}</p>
      </div>
      {address ? <a className={styles.external} href={`${EXPLORER}/account/${address}`} target="_blank" rel="noopener noreferrer" aria-label="View wallet on Stellar Expert">{Ico.link({ size: 17 })}</a> : null}
    </section>

    <section className={styles.addressCard} aria-label="Recipient wallet address">
      <h2>{address ? "Recipient wallet" : "Wallet status"}</h2>
      {address ? <><p>{address}</p><a href={`${EXPLORER}/account/${address}`} target="_blank" rel="noopener noreferrer">View on Stellar Expert {Ico.link({ size: 14 })}</a></>
        : <p>No verified public wallet is available to inspect for this profile.</p>}
    </section>

    <section className={styles.activity} aria-labelledby="recipient-activity-title">
      <div className={styles.sectionHeading}>
        <h2 id="recipient-activity-title">Disaster Vault payouts</h2>
        <span>Recent on-chain activity</span>
      </div>
      {!address ? <p className={styles.message}>Payouts will appear here after a verified recipient wallet is linked.</p>
        : feed === null ? <p className={styles.message} role="status">Loading payout activity…</p>
        : !feed.ok ? <p className={styles.message} role="alert">{feed.error}</p>
          : payouts.length === 0 ? <p className={styles.message}>No recent Disaster Vault payouts to this wallet.</p>
            : <ul className={styles.rows}>{payouts.map(event => <li key={event.id}>
              <span><strong>{formatStroops(event.amount ?? "0")} XLM</strong><small>{event.time ? new Date(event.time).toLocaleString() : `Ledger ${event.ledger}`}</small></span>
              <a href={event.link} target="_blank" rel="noopener noreferrer" aria-label="Open payout transaction">{Ico.link({ size: 16 })}</a>
            </li>)}</ul>}
      <p className={styles.note}>This activity covers the recent ledger window available from Stellar RPC. It does not verify an organization’s identity or the real-world delivery of aid.</p>
    </section>
  </main>;
}
