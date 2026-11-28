"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { readPublicCampaigns } from "@/lib/ui/public-read";
import type { Campaign } from "@/lib/campaign";
import { d4CampaignStatus, d4CampaignStatusFilterLabel } from "@/lib/campaign-discovery";
import { formatStroops } from "@/lib/format-stroops";
import { formatIllustrativeUsd } from "@/lib/money";
import { useGoBack } from "@/lib/ui/useGoBack";
import { useT } from "@/components/I18nProvider";
import { Ico } from "@/components/ui/kit";
import styles from "./OrganizerProfileScreen.module.css";

type PublicCampaign = Omit<Campaign, "contribution">;
type Data = Awaited<ReturnType<typeof readPublicCampaigns>>;

export default function OrganizerProfileScreen({ handle, address }: { handle: string; address: string | null }) {
  const back = useGoBack("/campaigns?mode=testnet");
  const { locale } = useT();
  const [campaigns, setCampaigns] = useState<PublicCampaign[]>([]);
  const [now, setNow] = useState("0");
  const [cursor, setCursor] = useState("0");
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (before: string) => {
    if (before === "0") setLoading(true);
    setError("");
    if (!address) {
      setComplete(true);
      setLoading(false);
      return;
    }
    try {
      const result: Data = await readPublicCampaigns(before);
      if (!result.ok) throw new Error(result.error);
      setNow(result.now);
      setCampaigns(previous => before === "0" ? result.campaigns.filter(c => c.config.creator === address)
        : [...previous, ...result.campaigns.filter(c => c.config.creator === address)]);
      const last = result.campaigns.at(-1)?.id;
      setCursor(last ?? "0");
      setComplete(result.campaigns.length < 10 || !last || last === before);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Organizer campaigns could not be loaded.");
    } finally { setLoading(false); }
  }, [address]);

  useEffect(() => { void load("0"); }, [load]);
  const open = campaigns.filter(c => c.state === "Funding" || c.state === "PendingProof" || c.state === "Refundable");
  const ended = campaigns.filter(c => !open.includes(c));

  return <main className={styles.screen}>
    <header className={styles.header}>
      <button type="button" aria-label="Back to Causes" className={styles.back} onClick={back}>{Ico.back({ size: 20 })}</button>
      <h1>Organizer profile</h1>
      <span className={styles.spacer} aria-hidden="true" />
    </header>

    <section className={styles.identity}>
      <div className={styles.avatar} aria-hidden="true">@</div>
      <div className={styles.identityCopy}>
        <h2>@{handle}</h2>
        <p>{address ? "Campaign creator on Stellar Testnet" : "No public Testnet wallet is linked to this username."}</p>
      </div>
      {address ? <a href={`https://stellar.expert/explorer/testnet/account/${address}`} target="_blank" rel="noopener noreferrer" aria-label="View organizer wallet on Stellar Expert">{Ico.link({ size: 17 })}</a> : null}
    </section>

    <section className={styles.section} aria-labelledby="organizer-current-title">
      <div className={styles.sectionHeader}><h2 id="organizer-current-title">Current causes</h2><span>{open.length}</span></div>
      {loading && <p className={styles.message} role="status">Loading organizer campaigns…</p>}
      {!loading && open.length === 0 && !error && <p className={styles.message}>{address ? "No active causes were found in the campaigns loaded so far." : "There are no campaigns linked to a verified wallet for this profile yet."}</p>}
      <ul className={styles.campaigns}>{open.map(c => <li key={c.id}>
        <Link href={`/campaigns?id=${encodeURIComponent(c.id)}`}>
          <span className={styles.campaignTop}><span>Campaign #{c.id}</span><span>{d4CampaignStatusFilterLabel(d4CampaignStatus(c, BigInt(now || "0")), locale)}</span></span>
          <strong>{c.title}</strong>
          <span className={styles.raised}>≈ {formatIllustrativeUsd(c.total)} · {formatStroops(c.total)} XLM</span>
        </Link>
      </li>)}</ul>
    </section>

    <section className={styles.section} aria-labelledby="organizer-history-title">
      <div className={styles.sectionHeader}><h2 id="organizer-history-title">Campaign history</h2><span>{ended.length}</span></div>
      {ended.length === 0 && !loading && !error && <p className={styles.message}>{address ? "No completed campaigns were found in the campaigns loaded so far." : "Public campaign history will appear here when a wallet is linked."}</p>}
      <ul className={styles.campaigns}>{ended.map(c => <li key={c.id}>
        <Link href={`/campaigns?id=${encodeURIComponent(c.id)}`}>
          <span className={styles.campaignTop}><span>Campaign #{c.id}</span><span>{d4CampaignStatusFilterLabel(d4CampaignStatus(c, BigInt(now || "0")), locale)}</span></span>
          <strong>{c.title}</strong>
          <span className={styles.raised}>≈ {formatIllustrativeUsd(c.total)} · {formatStroops(c.total)} XLM</span>
        </Link>
      </li>)}</ul>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!complete && !loading && <button className={styles.loadMore} type="button" onClick={() => void load(cursor)}>Load older campaigns</button>}
    </section>
    <p className={styles.note}>Only public campaign terms and contract totals are shown here. The profile does not contain ratings, identity verification, or delivery claims.</p>
  </main>;
}
