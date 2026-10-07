"use client";

import Link from "next/link";
import { useT } from "@/components/I18nProvider";
import { useMarketPrices } from "@/components/MarketPricesProvider";
import { estimateUsdc, marketGoalProgress, validateMarketPrices } from "@/lib/market-prices";
import { useCircleTestnet } from "@/lib/ui/useCircleTestnet";
import type { CircleTestnetCampaignResult } from "@/lib/circles/testnet";
import type { Locale } from "@/lib/i18n/config";
import styles from "./CircleTestnetSummary.module.css";

const COPY = {
  en: { title: "Testnet donation exercise", badge: "QA · fictional cause", notice: "Actual Testnet XLM can move. The cause, organizer and AI photos remain fictional; tokens have no monetary value.",
    loading: "Checking the configured on-chain campaign…", setup: "Testnet donations are not configured for this cause yet.",
    unmapped: "This fictional cause has no reviewed Testnet campaign yet.", unavailable: "The Testnet campaign could not be verified. No recipient or balance is assumed.",
    local: "Local preview does not read or move live Testnet funds.", invalid: "This cause is not in the supported Testnet QA catalog.",
    raised: "Confirmed contributions", escrow: "Held in escrow", separation: "These on-chain amounts are separate from example donor entries.",
    goal: "QA goal", progress: "of QA goal", marketNote: "USDC estimates and progress follow CoinGecko prices. Donations remain Testnet XLM.", marketUnavailable: "USDC estimate unavailable", stale: "Last known price", progressUnavailable: "Progress unavailable until a price is available",
    open: "Funding open", expired: "Funding deadline passed", closed: "Not accepting donations", deadline: "Funding deadline", rawTime: "Ledger timestamp", creator: "QA campaign creator", beneficiary: "QA beneficiary wallet", reviewers: "Three QA reviewer wallets",
    terms: "Inspect the exact recipient and terms before confirming. These wallets do not verify the fictional organizer's identity.",
    controls: "Recipient and review controls", proof: "On-chain proof reference", proofEmpty: "No proof reference has been submitted.", proofNotice: "A recorded hash or approval is not independent verification of delivery.", approvals: "Approvals", donate: "Donate Testnet XLM", details: "Open on-chain campaign", retry: "Check again" },
  id: { title: "Latihan donasi Testnet", badge: "QA · tujuan fiktif", notice: "Testnet XLM benar-benar bisa berpindah. Tujuan, organizer dan foto AI tetap fiktif; token tidak bernilai uang.",
    loading: "Memeriksa campaign on-chain yang dikonfigurasi…", setup: "Donasi Testnet untuk tujuan ini belum dikonfigurasi.",
    unmapped: "Tujuan fiktif ini belum memiliki campaign Testnet yang direview.", unavailable: "Campaign Testnet belum bisa diverifikasi. Penerima dan saldo tidak diasumsikan.",
    local: "Preview lokal tidak membaca atau memindahkan dana Testnet live.", invalid: "Tujuan ini tidak ada dalam katalog QA Testnet yang didukung.",
    raised: "Kontribusi terkonfirmasi", escrow: "Ditahan di escrow", separation: "Nominal on-chain ini terpisah dari entri donor contoh.",
    goal: "Target QA", progress: "dari target QA", marketNote: "Estimasi USDC dan progres mengikuti harga CoinGecko. Donasi tetap berupa Testnet XLM.", marketUnavailable: "Estimasi USDC belum tersedia", stale: "Harga terakhir diketahui", progressUnavailable: "Progres belum tersedia sampai harga tersedia",
    open: "Pendanaan terbuka", expired: "Batas pendanaan sudah lewat", closed: "Tidak menerima donasi", deadline: "Batas pendanaan", rawTime: "Timestamp ledger", creator: "Pembuat campaign QA", beneficiary: "Wallet penerima QA", reviewers: "Tiga wallet reviewer QA",
    terms: "Periksa penerima dan ketentuan persis sebelum konfirmasi. Wallet ini tidak membuktikan identitas organizer fiktif.",
    controls: "Penerima dan kontrol review", proof: "Referensi bukti on-chain", proofEmpty: "Belum ada referensi bukti yang dikirim.", proofNotice: "Hash atau approval tercatat bukan verifikasi independen atas penyaluran.", approvals: "Approval", donate: "Donasi Testnet XLM", details: "Buka campaign on-chain", retry: "Periksa lagi" },
  tl: { title: "Pagsubok ng donasyong Testnet", badge: "QA · kathang-isip na layunin", notice: "Maaaring lumipat ang aktuwal na Testnet XLM. Kathang-isip pa rin ang layunin, organizer at AI photos; walang halagang pera ang mga token.",
    loading: "Sinusuri ang naka-configure na on-chain campaign…", setup: "Hindi pa naka-configure ang Testnet donation para rito.",
    unmapped: "Wala pang na-review na Testnet campaign ang kathang-isip na layuning ito.", unavailable: "Hindi ma-verify ang Testnet campaign. Walang ipinapalagay na tatanggap o balanse.",
    local: "Hindi bumabasa o naglilipat ng live Testnet funds ang local preview.", invalid: "Wala ang layuning ito sa suportadong Testnet QA catalog.",
    raised: "Kumpirmadong kontribusyon", escrow: "Nasa escrow", separation: "Hiwalay ang on-chain amounts na ito sa halimbawang donor entries.",
    goal: "QA goal", progress: "ng QA goal", marketNote: "Sumusunod sa presyo ng CoinGecko ang USDC estimate at progress. Testnet XLM pa rin ang mga donasyon.", marketUnavailable: "Hindi available ang USDC estimate", stale: "Huling alam na presyo", progressUnavailable: "Hindi available ang progress hangga't walang presyo",
    open: "Bukas ang pagpopondo", expired: "Lumipas ang funding deadline", closed: "Hindi tumatanggap ng donasyon", deadline: "Funding deadline", rawTime: "Ledger timestamp", creator: "QA campaign creator", beneficiary: "QA beneficiary wallet", reviewers: "Tatlong QA reviewer wallet",
    terms: "Suriin ang eksaktong tatanggap at terms bago kumpirmahin. Hindi pinatutunayan ng wallets ang pagkakakilanlan ng kathang-isip na organizer.",
    controls: "Tatanggap at review controls", proof: "On-chain proof reference", proofEmpty: "Wala pang naisumiteng proof reference.", proofNotice: "Hindi independiyenteng patunay ng delivery ang naitalang hash o approval.", approvals: "Mga approval", donate: "Mag-donate ng Testnet XLM", details: "Buksan ang on-chain campaign", retry: "Suriin muli" },
  vi: { title: "Thử nghiệm quyên góp Testnet", badge: "QA · mục tiêu hư cấu", notice: "Testnet XLM thực sự có thể được chuyển. Mục tiêu, người tổ chức và ảnh AI vẫn là hư cấu; token không có giá trị tiền tệ.",
    loading: "Đang kiểm tra chiến dịch on-chain đã cấu hình…", setup: "Chưa cấu hình quyên góp Testnet cho mục tiêu này.",
    unmapped: "Mục tiêu hư cấu này chưa có chiến dịch Testnet được xem xét.", unavailable: "Không thể xác minh chiến dịch Testnet. Không giả định người nhận hay số dư.",
    local: "Bản xem trước cục bộ không đọc hay chuyển tiền Testnet trực tiếp.", invalid: "Mục tiêu này không có trong danh mục QA Testnet được hỗ trợ.",
    raised: "Đóng góp đã xác nhận", escrow: "Giữ trong escrow", separation: "Số tiền on-chain này tách biệt với các mục nhà tài trợ mẫu.",
    goal: "Mục tiêu QA", progress: "của mục tiêu QA", marketNote: "Ước tính USDC và tiến độ thay đổi theo giá CoinGecko. Khoản quyên góp vẫn là Testnet XLM.", marketUnavailable: "Chưa có ước tính USDC", stale: "Giá gần nhất đã biết", progressUnavailable: "Chưa có tiến độ cho đến khi có giá",
    open: "Đang nhận đóng góp", expired: "Đã qua hạn đóng góp", closed: "Không nhận quyên góp", deadline: "Hạn đóng góp", rawTime: "Dấu thời gian ledger", creator: "Người tạo chiến dịch QA", beneficiary: "Ví người nhận QA", reviewers: "Ba ví xét duyệt QA",
    terms: "Kiểm tra chính xác người nhận và điều khoản trước khi xác nhận. Các ví không xác minh danh tính người tổ chức hư cấu.",
    controls: "Người nhận và kiểm soát xét duyệt", proof: "Tham chiếu bằng chứng on-chain", proofEmpty: "Chưa gửi tham chiếu bằng chứng.", proofNotice: "Hash hoặc phê duyệt được ghi nhận không xác minh độc lập việc bàn giao.", approvals: "Phê duyệt", donate: "Quyên góp Testnet XLM", details: "Mở chiến dịch on-chain", retry: "Kiểm tra lại" },
} satisfies Record<Locale, Record<string, string>>;

function exactXlm(stroops: string, locale: Locale): string {
  const amount = BigInt(stroops);
  const fraction = (amount % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  const whole = (amount / 10_000_000n).toLocaleString({ en: "en-US", id: "id-ID", tl: "fil-PH", vi: "vi-VN" }[locale]);
  return `${whole}${fraction ? (locale === "id" || locale === "vi" ? "," : ".") + fraction : ""} XLM`;
}

function formatUsdc(amount: number, locale: Locale): string {
  return amount.toLocaleString({ en: "en-US", id: "id-ID", tl: "fil-PH", vi: "vi-VN" }[locale], {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }) + " USDC";
}

export default function CircleTestnetSummary({ circleId, result: supplied, loading: suppliedLoading, onRefresh, hideDonate = false, hideDetailsLink = false, compact = false, goalUsdc }: {
  circleId: string;
  result?: CircleTestnetCampaignResult | null;
  loading?: boolean;
  onRefresh?: () => void;
  hideDonate?: boolean;
  hideDetailsLink?: boolean;
  compact?: boolean;
  goalUsdc?: number;
}) {
  const { locale } = useT();
  const { prices } = useMarketPrices();
  const quote = validateMarketPrices(prices);
  const copy = COPY[locale];
  const external = supplied !== undefined;
  const own = useCircleTestnet(circleId, !external);
  const value = external ? supplied : own.result;
  const result = value?.circleId === circleId ? value : null;
  const loading = external ? (suppliedLoading ?? supplied === null) : own.loading;
  const retry = onRefresh ?? (external ? null : () => { void own.refresh(); });
  const explanation = !result?.ok ? result?.code === "not_configured" ? copy.setup : result?.code === "unmapped" ? copy.unmapped
    : result?.code === "local_preview" ? copy.local : result?.code === "invalid_circle" ? copy.invalid : copy.unavailable : null;
  const deadline = result?.ok ? new Date(Number(result.mapping.fundingDeadline) * 1000) : null;
  const deadlineText = deadline && Number.isFinite(deadline.getTime())
    ? deadline.toLocaleString({ en: "en-GB", id: "id-ID", tl: "fil-PH", vi: "vi-VN" }[locale], { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC"
    : result?.ok ? `${copy.rawTime}: ${result.mapping.fundingDeadline}` : "";
  const raisedUsdc = result?.ok ? estimateUsdc(result.campaign.total, quote) : null;
  const escrowUsdc = result?.ok ? estimateUsdc(result.campaign.escrow, quote) : null;
  const hasGoal = typeof goalUsdc === "number" && Number.isFinite(goalUsdc) && goalUsdc > 0;
  const progress = result?.ok && hasGoal ? marketGoalProgress(result.campaign.total, quote, goalUsdc) : null;
  const percentage = progress?.percentage.toLocaleString({ en: "en-US", id: "id-ID", tl: "fil-PH", vi: "vi-VN" }[locale], { maximumFractionDigits: 2 });

  return <section className={styles.card} aria-labelledby={`circle-testnet-title-${circleId}`} data-testid="circle-testnet-summary">
    <header className={styles.heading}>
      <span className={styles.badge}>{copy.badge}</span>
      <h2 id={`circle-testnet-title-${circleId}`}>{copy.title}</h2>
    </header>
    <p className={styles.notice}>{copy.notice}</p>
    {loading ? <p className={styles.state} role="status">{copy.loading}</p>
      : result?.ok ? <>
        <div className={styles.metrics}>
          <div><small>{copy.raised}</small><strong>{exactXlm(result.campaign.total, locale)}</strong>
            {raisedUsdc !== null ? <span className={styles.estimate}>≈ {formatUsdc(raisedUsdc, locale)}</span> : null}</div>
          <div><small>{copy.escrow}</small><strong>{exactXlm(result.campaign.escrow, locale)}</strong>
            {escrowUsdc !== null ? <span className={styles.estimate}>≈ {formatUsdc(escrowUsdc, locale)}</span> : null}</div>
        </div>
        {hasGoal ? <div className={styles.goal}>
          <div className={styles.goalRow}><span>{copy.goal}<strong>{formatUsdc(goalUsdc, locale)}</strong></span>
            {progress ? <span className={styles.percentage}><strong>{percentage}%</strong>{copy.progress}</span> : null}</div>
          {progress ? <div className={styles.progress} role="progressbar" aria-label={copy.goal} aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.min(100, progress.percentage)} aria-valuetext={`${percentage}% ${copy.progress}`}>
            <span style={{ width: `${Math.min(100, progress.percentage)}%` }} /></div> : <p className={styles.progressUnavailable}>{copy.progressUnavailable}</p>}
        </div> : null}
        <p className={styles.marketNote}>{quote.status === "unavailable" ? copy.marketUnavailable : <>
          {quote.status === "stale" ? <span className={styles.stale}>{copy.stale}. </span> : null}{copy.marketNote}</>}</p>
        {!compact && <p className={styles.separation}>{copy.separation}</p>}
        <div className={styles.phase}>
          <strong className={result.donationOpen ? styles.open : styles.closed}>{result.status === "ready" ? copy.open : result.status === "expired" ? copy.expired : copy.closed}</strong>
          <span>{result.campaign.state} · #{result.mapping.campaignId}</span>
        </div>
        <div className={styles.deadline}><small>{copy.deadline}</small><time>{deadlineText}</time></div>
        <details className={styles.controls}>
          <summary>{copy.controls}</summary>
          <p>{copy.terms}</p>
          <dl>
            <dt>{copy.creator}</dt><dd><code>{result.mapping.creatorWallet}</code></dd>
            <dt>{copy.beneficiary}</dt><dd><code>{result.mapping.beneficiaryWallet}</code></dd>
            <dt>{copy.reviewers}</dt><dd><ol>{result.mapping.approverWallets.map(wallet => <li key={wallet}><code>{wallet}</code></li>)}</ol></dd>
          </dl>
        <div className={styles.proof}>
          <h3>{copy.proof}</h3>
          {result.campaign.proofHash ? <code>{result.campaign.proofHash}</code> : <p>{copy.proofEmpty}</p>}
          <span>{copy.approvals}: {result.campaign.approvals.length} / 3</span>
          <p>{copy.proofNotice}</p>
        </div>
        </details>
        <div className={styles.actions}>
          {result.donationOpen && !hideDonate ? <Link className={styles.primary} href={`/circles/${circleId}/donate`}>{copy.donate}</Link> : null}
          {!hideDetailsLink && <Link className={styles.secondary} href={`/campaigns?id=${result.mapping.campaignId}`}>{copy.details}</Link>}
        </div>
      </> : <div className={styles.unavailable}>
        <p role="status">{explanation}</p>
        {retry ? <button type="button" onClick={retry}>{copy.retry}</button> : null}
      </div>}
  </section>;
}
