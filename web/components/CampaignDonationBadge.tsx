"use client";
import type { CampaignSupport } from "@/lib/campaign-support";
import { useT } from "@/components/I18nProvider";
import styles from "./CampaignDonationBadge.module.css";
const COPY = {
  en: { donated: "Already donated", refunded: "Donation refunded" },
  id: { donated: "Sudah donasi", refunded: "Donasi dikembalikan" },
  tl: { donated: "Nakapag-donate na", refunded: "Na-refund ang donasyon" },
  vi: { donated: "Đã quyên góp", refunded: "Đã hoàn quyên góp" },
};
export default function CampaignDonationBadge({ support }: { support?: CampaignSupport }) {
  const { locale } = useT();
  if (!support || support.status !== "donated" && support.status !== "refunded") return null;
  return <span className={`${styles.badge} ${support.status === "refunded" ? styles.refunded : ""}`} data-testid="campaign-donated-badge" data-evidence="testnet">
    {support.status === "donated" ? "✓ " : "↩ "}{COPY[locale][support.status]}
  </span>;
}
