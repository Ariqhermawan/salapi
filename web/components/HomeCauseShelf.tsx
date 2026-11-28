"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ImageSquare } from "@phosphor-icons/react";
import type { Campaign } from "@/lib/campaign";
import { campaignDiscoveryCopy } from "@/lib/i18n/revamp-campaign-discovery";
import { formatStroops } from "@/lib/format-stroops";
import { formatIllustrativeUsd } from "@/lib/money";
import { vaultCampaignMedia } from "@/lib/vault-campaign-media";
import { homeCopy } from "@/lib/i18n/revamp-home";
import { useT } from "@/components/I18nProvider";
import styles from "./HomeCauseShelf.module.css";

type CampaignRow = Omit<Campaign, "contribution">;

export default function HomeCauseShelf({
  campaigns,
  now,
  loading,
  error,
  onRetry,
  localPreview,
}: {
  campaigns: CampaignRow[];
  now: string;
  loading: boolean;
  error: string;
  onRetry: () => void;
  localPreview: boolean;
}) {
  const { locale } = useT();
  let ledgerNow = 0n;
  try { ledgerNow = BigInt(now); } catch { /* No trusted ledger clock yet. */ }
  const active = campaigns.filter(campaign =>
    campaign.state === "Funding" && ledgerNow < BigInt(campaign.config.funding_deadline),
  );
  const featured = active[0];
  const rows = featured ? [featured, ...active.filter(campaign => campaign.id !== featured.id)].slice(0, 8) : [];

  return <section className={styles.shelf} aria-labelledby="home-causes-title">
    <div className={styles.heading}>
      <h2 id="home-causes-title">{homeCopy(locale, "Causes")}</h2>
      <Link href="/causes" className={styles.seeAll}>
        {homeCopy(locale, "See all")} <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </div>

    {loading && rows.length === 0 ? <div className={styles.skeletonRow} aria-label={homeCopy(locale, "Loading causes")}>
      <span /><span /><span />
    </div> : error ? <div className={styles.notice} role="status">
      <span>{homeCopy(locale, error)}</span>
      <button type="button" onClick={onRetry}>{homeCopy(locale, "Try again")}</button>
    </div> : rows.length ? <div className={styles.row} aria-label={homeCopy(locale, "Campaign carousel")}>
      {rows.map((campaign, index) => <CauseCard key={campaign.id} campaign={campaign} featured={index === 0}
        localPreview={localPreview} />)}
    </div> : <div className={styles.empty}>
      <ImageSquare size={36} aria-hidden="true" />
      <strong>{homeCopy(locale, "No causes yet")}</strong>
      <Link href="/create">{homeCopy(locale, "Start a campaign")} <ArrowRight size={16} aria-hidden="true" /></Link>
    </div>}
  </section>;
}

function CauseCard({ campaign, featured, localPreview }: {
  campaign: CampaignRow;
  featured: boolean;
  localPreview: boolean;
}) {
  const { locale } = useT();
  const media = vaultCampaignMedia(campaign, localPreview);
  const status = campaignDiscoveryCopy(locale)("Open");
  const total = formatIllustrativeUsd(campaign.total);
  const xlm = formatStroops(campaign.total);
  return <Link href={`/campaigns?id=${encodeURIComponent(campaign.id)}`} className={styles.card}
    aria-label={`${campaign.title}, campaign ${campaign.id}, ${total}, ${xlm} XLM`} data-featured={featured || undefined}>
    <span className={styles.cover}>
      {media ? <Image src={media.coverSrc} alt="" fill sizes="156px" /> : <ImageSquare size={24} aria-hidden="true" />}
      <span className={styles.tags}><span>{homeCopy(locale, "Cause")}</span>{featured && <span className={styles.status}>{status}</span>}</span>
      {featured && <span className={styles.ribbon}>Featured</span>}
    </span>
    <span className={styles.body}>
      <strong className={styles.title}>{campaign.title}</strong>
      <span className={styles.amount}>{total}</span>
      <span className={styles.xlm}>{xlm} XLM</span>
    </span>
  </Link>;
}
