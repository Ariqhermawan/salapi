"use client";

import Link from "next/link";
import { useT } from "./I18nProvider";
import type { CampaignDiscoveryView } from "@/lib/campaign-discovery";
import { campaignDiscoveryCopy } from "@/lib/i18n/revamp-campaign-discovery";
import styles from "./CampaignDiscoveryNav.module.css";

export default function CampaignDiscoveryNav({ view }: { view: CampaignDiscoveryView }) {
  const { locale } = useT();
  const c = campaignDiscoveryCopy(locale);
  return <div className={styles.discovery}>
    <nav aria-label={c("Donation discovery")} className={styles.modes}>
      <Link href="/campaigns?mode=examples" aria-current={view === "examples" ? "page" : undefined}>{c("Browse examples")}</Link>
      <Link href="/campaigns?mode=testnet" aria-current={view === "testnet" ? "page" : undefined}>{c("Testnet campaigns")}</Link>
    </nav>
    <p>{c(view === "examples" ? "Categories, organizer profiles and updates. Fictional examples, no payments." : "Separate D4 escrow in valueless Testnet XLM. Circles example totals are not contract balances.")}</p>
  </div>;
}
