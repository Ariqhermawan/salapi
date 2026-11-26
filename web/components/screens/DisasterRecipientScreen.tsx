"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Flag } from "@phosphor-icons/react/dist/csr/Flag";
import { useGoBack } from "@/lib/ui/useGoBack";
import { disasterEvents } from "@/app/disaster-actions";
import { formatStroops } from "@/lib/format-stroops";
import { isLocalPreview } from "@/lib/local-preview";
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

  const previewNgo = slug ? ({
    "tulong-cebu": { name: "Tulong Cebu Relief", initials: "TC", place: "Cebu City, PH", focus: "Typhoon and flood relief", about: "Volunteers who bring food packs, tarps and clean water to coastal barangays in the first week after a storm.", verified: true, reached: "1,240", payout: "$500.00", payoutCount: "1" },
    "bangon-marikina": { name: "Bangon Marikina", initials: "BM", place: "Marikina, PH", focus: "Flood response", about: "A riverside volunteer group that runs evacuation boats and a community kitchen when the water rises.", verified: true, reached: "0", payout: "$0.00", payoutCount: "0" },
    "dapur-siaga": { name: "Dapur Siaga Jakarta", initials: "DS", place: "Jakarta Utara, ID", focus: "Emergency kitchens", about: "Neighborhood cooks who open a shared kitchen within a day of a flood or a fire.", verified: false, reached: "0", payout: "$0.00", payoutCount: "0" },
  } as const)[slug as "tulong-cebu" | "bangon-marikina" | "dapur-siaga"] : undefined;

  if (isLocalPreview && previewNgo) return <main className={styles.screen}>
    <header className={styles.header}>
      <button type="button" aria-label="Back to Disaster Vault" className={styles.back} onClick={back}>{Ico.back({ size: 20 })}</button>
      <h1>NGO</h1><span className={styles.spacer} aria-hidden="true" />
    </header>
    <section className={styles.previewNgoCard}>
      <div className={styles.previewNgoTop}>
        <span className={styles.previewNgoAvatar}>{previewNgo.initials}</span>
        <div className={styles.previewNgoTitle}>
          {previewNgo.verified ? <span className={styles.verified}>{Ico.check({ size: 12 })} Verified NGO</span> : <span className={styles.unverified}>Community NGO</span>}
          <h2>{previewNgo.name}</h2>
          <p>{previewNgo.place} · {previewNgo.focus}</p>
        </div>
      </div>
      <p className={styles.previewNgoAbout}>{previewNgo.about}</p>
      <div className={styles.previewNgoActions}>
        <button type="button" className={styles.donateButton} onClick={() => router.push("/vault/contribute")}>Donate</button>
        <button type="button" className={styles.reportButton} aria-label="Send feedback about this NGO" onClick={() => router.push("/you/feedback")}><Flag size={17} aria-hidden="true" /></button>
      </div>
      <p className={styles.sharedVaultNote}>Donations go to the shared Disaster Vault.</p>
      <div className={styles.vaultTotal}><span>From the vault</span><strong>{previewNgo.payout}</strong></div>
      <div className={styles.previewNgoStats}>
        <div><span>Payouts</span><strong>{previewNgo.payoutCount}</strong></div>
        <div><span>People reached</span><strong>{previewNgo.reached}</strong></div>
      </div>
    </section>
    <section className={styles.previewActivity}>
      <h2>Vault activity · {previewNgo.payoutCount}</h2>
      {previewNgo.payoutCount === "1" ? <Link href="/vault?tab=activity" className={styles.previewActivityRow}>
        <span><strong>Typhoon relief, Cebu</strong><small>12 Oct 2026</small></span><strong>{previewNgo.payout}</strong>
      </Link> : <p>No sample payouts yet.</p>}
    </section>
  </main>;

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
