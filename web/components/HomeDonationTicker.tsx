"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CampaignDonorEntry } from "@/lib/campaign-donor";
import { readPublicCampaignDonors } from "@/lib/ui/public-read";
import { activityStroopsToXlm } from "@/lib/wallet-activity";
import type { Campaign } from "@/lib/campaign";
import styles from "./HomeDonationTicker.module.css";

type CampaignRow = Omit<Campaign, "contribution">;
type TickerItem = { key: string; donor: string; amount: string; campaignId: string; title: string; createdAt: number };

const LOCAL_EXAMPLES = [
  { donor: "@jamal_r", amount: "$25", campaignId: "101", createdAt: 4 },
  { donor: "@ana.reyes", amount: "$5", campaignId: "101", createdAt: 3 },
  { donor: "@jamal_r", amount: "$25", campaignId: "102", createdAt: 2 },
  { donor: "@ana.reyes", amount: "$5", campaignId: "102", createdAt: 1 },
];

function fromConfirmedDonation(item: CampaignDonorEntry, campaign: CampaignRow): TickerItem {
  return {
    key: `${campaign.id}:${item.id}`,
    donor: item.anonymous ? "Anonymous" : item.donor?.handle ? `@${item.donor.handle}` : "A donor",
    amount: `${activityStroopsToXlm(item.amountStroops)} XLM`,
    campaignId: campaign.id,
    title: campaign.title,
    createdAt: Date.parse(item.createdAt),
  };
}

export default function HomeDonationTicker({ campaigns, loading, localPreview = false }: { campaigns: CampaignRow[]; loading: boolean; localPreview: boolean }) {
  const [items, setItems] = useState<TickerItem[]>(() => localPreview
    ? LOCAL_EXAMPLES.flatMap(example => {
      const campaign = campaigns.find(row => row.id === example.campaignId);
      return campaign ? [{ ...example, key: `${example.campaignId}:${example.donor}`, title: campaign.title }] : [];
    })
    : []);

  useEffect(() => {
    if (localPreview || loading || campaigns.length === 0) return;
    let active = true;
    const current = campaigns.slice(0, 8);
    void Promise.allSettled(current.map(campaign => readPublicCampaignDonors(campaign.id))).then(results => {
      if (!active) return;
      const donations = results.flatMap((result, index) => {
        if (result.status !== "fulfilled" || !result.value.ok || result.value.campaignId !== current[index].id) return [];
        return result.value.entries.map(entry => fromConfirmedDonation(entry, current[index]));
      });
      donations.sort((a, b) => b.createdAt - a.createdAt);
      setItems(donations.slice(0, 12));
    });
    return () => { active = false; };
  }, [campaigns, loading, localPreview]);

  if (items.length === 0) return null;
  const track = [...items, ...items];
  return <section className={styles.ticker} aria-label={localPreview ? "Sample donation activity" : "Recent confirmed donations"}>
    <span className={styles.live}>{localPreview ? "SAMPLE" : "LIVE"}</span>
    <div className={styles.viewport}>
      <div className={styles.track} aria-live="off">
        {track.map((item, index) => <Link
          key={`${item.key}:${index}`}
          className={styles.item}
          href={`/campaigns?id=${encodeURIComponent(item.campaignId)}`}
          tabIndex={index >= items.length ? -1 : undefined}
          aria-hidden={index >= items.length || undefined}
        >
          <strong>{item.donor}</strong><span>gave</span><strong>{item.amount}</strong><span>to</span><span>{item.title}</span>
        </Link>)}
      </div>
    </div>
  </section>;
}
