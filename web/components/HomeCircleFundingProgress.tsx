"use client";

import { useT } from "@/components/I18nProvider";
import { Users } from "@phosphor-icons/react/dist/csr/Users";
import { useMarketPrices } from "@/components/MarketPricesProvider";
import { useCircleTestnet } from "@/lib/ui/useCircleTestnet";
import { validateMarketPrices } from "@/lib/market-prices";
import { exampleGoalUsd, fundingUsdProgress } from "@/lib/home-circle-funding";
import { formatStroops } from "@/lib/format-stroops";
import type { CampaignDonorSummaryResult } from "@/lib/campaign-donor";
import { progressPct, type Circle } from "@/lib/circles/types";
import { homeCatalogCopy } from "@/lib/i18n/revamp-home-catalog";
import type { Locale } from "@/lib/i18n/config";
import { isLocalPreview } from "@/lib/local-preview";
import styles from "./HomeCircleFundingProgress.module.css";

const COPY = {
  en: { loading: "Checking Testnet funding", inactive: "View campaign for funding", unavailable: "Testnet funding unavailable", marketUnavailable: "USD estimate unavailable", confirmed: "Confirmed Testnet contributions", collected: "Total collected · USD estimate", goal: "Example goal", stale: "Last known price", contributors: "contributors", wallets: "contributor wallets", contributorsUnavailable: "Contributors unavailable", contributorBasis: "Based on confirmed donor records. Counts unique accounts, with wallets used when an account is unavailable, not verified people. Includes anonymous donations.", incomplete: "Some confirmed contributions have no donor record, so this is a minimum recorded count.", exampleAmount: "Illustrative amount", exampleContributors: "example contributors" },
  id: { loading: "Memeriksa pendanaan Testnet", inactive: "Lihat pendanaan di campaign", unavailable: "Pendanaan Testnet belum tersedia", marketUnavailable: "Estimasi USD belum tersedia", confirmed: "Kontribusi Testnet terkonfirmasi", collected: "Total terkumpul · estimasi USD", goal: "Target contoh", stale: "Harga terakhir diketahui", contributors: "kontributor", wallets: "dompet kontributor", contributorsUnavailable: "Kontributor belum tersedia", contributorBasis: "Berdasarkan catatan donasi terkonfirmasi. Menghitung akun unik, dengan dompet sebagai pengganti jika akun tidak tersedia, bukan jumlah orang terverifikasi. Termasuk donasi anonim.", incomplete: "Sebagian kontribusi terkonfirmasi belum memiliki catatan donatur, sehingga ini jumlah minimum yang tercatat.", exampleAmount: "Nominal ilustrasi", exampleContributors: "kontributor contoh" },
  tl: { loading: "Sinusuri ang Testnet funding", inactive: "Tingnan ang campaign para sa funding", unavailable: "Hindi available ang Testnet funding", marketUnavailable: "Hindi available ang USD estimate", confirmed: "Kumpirmadong Testnet contributions", collected: "Kabuuang nakolekta · USD estimate", goal: "Halimbawang goal", stale: "Huling alam na presyo", contributors: "contributors", wallets: "contributor wallets", contributorsUnavailable: "Hindi available ang contributors", contributorBasis: "Batay sa kumpirmadong donor records. Natatanging accounts ang binibilang, o wallets kapag walang account, hindi verified na tao. Kasama ang anonymous donations.", incomplete: "May kumpirmadong contributions na walang donor record; ito ang minimum na naitalang bilang.", exampleAmount: "Halimbawang halaga", exampleContributors: "halimbawang contributors" },
  vi: { loading: "Đang kiểm tra đóng góp Testnet", inactive: "Xem đóng góp trong chiến dịch", unavailable: "Chưa có dữ liệu đóng góp Testnet", marketUnavailable: "Chưa có ước tính USD", confirmed: "Đóng góp Testnet đã xác nhận", collected: "Tổng đóng góp · ước tính USD", goal: "Mục tiêu minh họa", stale: "Giá gần nhất đã biết", contributors: "người đóng góp", wallets: "ví đóng góp", contributorsUnavailable: "Chưa có số người đóng góp", contributorBasis: "Dựa trên hồ sơ đóng góp đã xác nhận. Đếm tài khoản riêng biệt, thay bằng ví khi không có tài khoản; không phải số người đã xác minh. Bao gồm đóng góp ẩn danh.", incomplete: "Một số đóng góp đã xác nhận chưa có hồ sơ; đây là số lượng tối thiểu đã ghi nhận.", exampleAmount: "Số tiền minh họa", exampleContributors: "người đóng góp minh họa" },
} satisfies Record<Locale, Record<string, string>>;
const NUMBER_LOCALES: Record<Locale, string> = { en: "en-US", id: "id-ID", tl: "fil-PH", vi: "vi-VN" };

function ExampleProgress({ circle }: { circle: Circle }) {
  const { locale } = useT();
  const copy = COPY[locale];
  const percent = progressPct(circle);
  const format = (amount: number) => amount.toLocaleString(NUMBER_LOCALES[locale], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const goal = exampleGoalUsd(circle.pesoTarget);
  const amount = Number.isFinite(circle.pesoRaised) && circle.pesoRaised >= 0 ? circle.pesoRaised / 58 : null;
  return <div className={styles.progress} data-funding-kind="example" aria-label={homeCatalogCopy(locale, "{percent}% example progress. No donations collected.", { percent })}>
    <div className={styles.amounts}><span>{copy.exampleAmount}</span>{amount !== null ? <strong>${format(amount)} <small>USD</small></strong> : null}</div>
    <div className={styles.secondary}><span>{homeCatalogCopy(locale, "Example progress")}</span>
      {Number.isSafeInteger(circle.donorCount) && circle.donorCount >= 0 ? <span className={styles.contributors}><Users size={17} aria-hidden="true" />{circle.donorCount.toLocaleString(NUMBER_LOCALES[locale])} {copy.exampleContributors}</span> : null}</div>
    <progress value={percent} max={100} aria-hidden="true" />
    <span className={styles.goal}>{goal !== null ? <span>{copy.goal}: ${format(goal)} USD</span> : <span>{copy.goal}</span>}<strong>{percent}%</strong></span>
  </div>;
}

/** Reusable for a native D4 campaign too, where no fictional goal is supplied. */
export function ConfirmedFundingProgress({ totalStroops, goalUsd = null, donorSummary }: {
  totalStroops: string; goalUsd?: number | null; donorSummary?: CampaignDonorSummaryResult;
}) {
  const { locale } = useT();
  const copy = COPY[locale];
  const { prices } = useMarketPrices();
  const quote = validateMarketPrices(prices);
  const progress = fundingUsdProgress(totalStroops, quote, goalUsd);
  const format = (amount: number) => amount.toLocaleString(NUMBER_LOCALES[locale], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const percentage = progress?.percentage?.toLocaleString(NUMBER_LOCALES[locale], { maximumFractionDigits: 2 });
  const summary = donorSummary?.ok && donorSummary.confirmedTotalStroops === totalStroops && Number.isSafeInteger(donorSummary.count)
    && donorSummary.count >= 0 && (donorSummary.count > 0 || donorSummary.coverage === "complete") ? donorSummary : null;
  return <div className={styles.progress} data-funding-kind="testnet" data-market-status={quote.status} aria-label={copy.confirmed}>
    <div className={styles.amounts}><span>{copy.collected}</span>
      {progress ? <strong>≈ ${format(progress.usd)} <small>USD</small></strong> : <span className={styles.unknown}>{copy.marketUnavailable}</span>}
      {progress && quote.status === "stale" ? <span className={styles.stale}>{copy.stale}</span> : null}</div>
    <div className={styles.secondary}><span data-confirmed-stroops={totalStroops}>{formatStroops(totalStroops)} XLM <small>· Testnet</small></span>
      <span className={styles.contributors} title={summary ? `${copy.contributorBasis}${summary.coverage === "recorded" ? ` ${copy.incomplete}` : ""}` : undefined}>
        <Users size={17} aria-hidden="true" />{summary ? <>{summary.count.toLocaleString(NUMBER_LOCALES[locale])}{summary.coverage === "recorded" ? "+" : ""} {summary.basis === "wallets" ? copy.wallets : copy.contributors}</> : copy.contributorsUnavailable}
      </span></div>
    {progress?.percentage !== null && progress?.percentage !== undefined ? <progress value={Math.min(100, progress.percentage)} max={100} aria-label={copy.goal} aria-valuetext={`${percentage}%`} /> : null}
    {goalUsd !== null ? <span className={styles.goal}><span>{copy.goal}: ${format(goalUsd)} USD</span>{percentage !== undefined ? <strong>{percentage}%</strong> : null}</span> : null}
  </div>;
}

function ActiveFundingProgress({ circle }: { circle: Circle }) {
  const { locale } = useT();
  const copy = COPY[locale];
  const { result: value, loading } = useCircleTestnet(circle.id, true);
  const result = value?.circleId === circle.id ? value : null;
  if (loading || !result) return <p className={styles.status} role="status">{copy.loading}</p>;
  if (!result.ok) return result.code === "unmapped" ? <ExampleProgress circle={circle} />
    : <p className={styles.status} role="status">{copy.unavailable}</p>;
  return <ConfirmedFundingProgress totalStroops={result.campaign.total} goalUsd={exampleGoalUsd(circle.pesoTarget)} donorSummary={result.donorSummary} />;
}

/** Only the selected card mounts a reader. Leaving it unmounts pending results. */
export default function HomeCircleFundingProgress({ circle, active }: { circle: Circle; active: boolean }) {
  const { locale } = useT();
  if (isLocalPreview || circle.status === "completed") return <ExampleProgress circle={circle} />;
  if (!active) return <p className={styles.status}>{COPY[locale].inactive}</p>;
  return <ActiveFundingProgress key={circle.id} circle={circle} />;
}
