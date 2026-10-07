"use client";

import { useT } from "@/components/I18nProvider";
import { useMarketPrices } from "@/components/MarketPricesProvider";
import { useCircleTestnet } from "@/lib/ui/useCircleTestnet";
import { marketGoalProgress, validateMarketPrices } from "@/lib/market-prices";
import { pesoToUsdc } from "@/lib/ui/currency";
import { progressPct, type Circle } from "@/lib/circles/types";
import { homeCatalogCopy } from "@/lib/i18n/revamp-home-catalog";
import type { Locale } from "@/lib/i18n/config";
import { isLocalPreview } from "@/lib/local-preview";
import styles from "./HomeCircleFundingProgress.module.css";

const COPY = {
  en: { loading: "Checking Testnet funding", inactive: "View campaign for funding", unavailable: "Testnet funding unavailable", marketUnavailable: "USDC estimate unavailable", confirmed: "Confirmed Testnet contributions", goal: "QA goal", stale: "Last known price" },
  id: { loading: "Memeriksa pendanaan Testnet", inactive: "Lihat pendanaan di campaign", unavailable: "Pendanaan Testnet belum tersedia", marketUnavailable: "Estimasi USDC belum tersedia", confirmed: "Kontribusi Testnet terkonfirmasi", goal: "Target QA", stale: "Harga terakhir diketahui" },
  tl: { loading: "Sinusuri ang Testnet funding", inactive: "Tingnan ang campaign para sa funding", unavailable: "Hindi available ang Testnet funding", marketUnavailable: "Hindi available ang USDC estimate", confirmed: "Kumpirmadong Testnet contributions", goal: "QA goal", stale: "Huling alam na presyo" },
  vi: { loading: "Đang kiểm tra đóng góp Testnet", inactive: "Xem đóng góp trong chiến dịch", unavailable: "Chưa có dữ liệu đóng góp Testnet", marketUnavailable: "Chưa có ước tính USDC", confirmed: "Đóng góp Testnet đã xác nhận", goal: "Mục tiêu QA", stale: "Giá gần nhất đã biết" },
} satisfies Record<Locale, Record<string, string>>;
const NUMBER_LOCALES: Record<Locale, string> = { en: "en-US", id: "id-ID", tl: "fil-PH", vi: "vi-VN" };

function exactXlm(stroops: string): string {
  const value = BigInt(stroops);
  const fraction = (value % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return `${value / 10_000_000n}${fraction ? `.${fraction}` : ""} XLM`;
}

function ExampleProgress({ circle }: { circle: Circle }) {
  const { locale } = useT();
  const percent = progressPct(circle);
  return <div className={styles.progress} data-funding-kind="example" aria-label={homeCatalogCopy(locale, "{percent}% example progress. No donations collected.", { percent })}>
    <span>{homeCatalogCopy(locale, "Example progress")}<strong>{percent}%</strong></span>
    <progress value={percent} max={100} aria-hidden="true" />
  </div>;
}

function ActiveFundingProgress({ circle }: { circle: Circle }) {
  const { locale } = useT();
  const copy = COPY[locale];
  const { result: value, loading } = useCircleTestnet(circle.id, true);
  const { prices } = useMarketPrices();
  const result = value?.circleId === circle.id ? value : null;
  if (loading || !result) return <p className={styles.status} role="status">{copy.loading}</p>;
  if (!result.ok) return result.code === "unmapped" ? <ExampleProgress circle={circle} />
    : <p className={styles.status} role="status">{copy.unavailable}</p>;
  const quote = validateMarketPrices(prices);
  const goal = pesoToUsdc(circle.pesoTarget);
  const progress = marketGoalProgress(result.campaign.total, quote, goal);
  const format = (amount: number) => amount.toLocaleString(NUMBER_LOCALES[locale], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const percentage = progress?.percentage.toLocaleString(NUMBER_LOCALES[locale], { maximumFractionDigits: 2 });
  return <div className={styles.progress} data-funding-kind="testnet" data-market-status={quote.status} aria-label={copy.confirmed}>
    <div className={styles.amounts}><strong data-confirmed-stroops={result.campaign.total}>{exactXlm(result.campaign.total)}</strong>
      <span>{progress ? <>≈ {format(progress.usdc)} USDC{quote.status === "stale" ? <small> · {copy.stale}</small> : null}</> : copy.marketUnavailable}</span></div>
    <span>{copy.goal}: {format(goal)} USDC{progress ? <strong>{percentage}%</strong> : null}</span>
    {progress ? <progress value={Math.min(100, progress.percentage)} max={100} aria-label={copy.goal} aria-valuetext={`${percentage}%`} /> : null}
  </div>;
}

/** Only the selected card mounts a reader. Leaving it unmounts pending results. */
export default function HomeCircleFundingProgress({ circle, active }: { circle: Circle; active: boolean }) {
  const { locale } = useT();
  if (isLocalPreview || circle.status === "completed") return <ExampleProgress circle={circle} />;
  if (!active) return <p className={styles.status}>{COPY[locale].inactive}</p>;
  return <ActiveFundingProgress key={circle.id} circle={circle} />;
}
