"use client";

import Link from "next/link";
import { useT } from "@/components/I18nProvider";
import { useCircleTestnet } from "@/lib/ui/useCircleTestnet";
import type { CircleTestnetCampaignResult } from "@/lib/circles/testnet";
import type { Locale } from "@/lib/i18n/config";
import styles from "./CircleTestnetSummary.module.css";

const COPY = {
  en: { title: "Testnet donation exercise", badge: "QA · fictional cause", notice: "Actual Testnet XLM can move. The cause, organizer and AI photos remain fictional; tokens have no monetary value.",
    loading: "Checking the configured on-chain campaign…", setup: "Testnet donations are not configured for this cause yet.",
    unmapped: "This fictional cause has no reviewed Testnet campaign yet.", unavailable: "The Testnet campaign could not be verified. No recipient or balance is assumed.",
    local: "Local preview does not read or move live Testnet funds.", invalid: "This cause is not in the supported Testnet QA catalog.",
    raised: "Confirmed contributions", escrow: "Held in escrow", separation: "These on-chain amounts are separate from the example goal, progress and donor entries.",
    open: "Funding open", expired: "Funding deadline passed", closed: "Not accepting donations", deadline: "Funding deadline", rawTime: "Ledger timestamp", creator: "QA campaign creator", beneficiary: "QA beneficiary wallet", reviewers: "Three QA reviewer wallets",
    terms: "Inspect the exact recipient and terms before confirming. These wallets do not verify the fictional organizer's identity.",
    controls: "Recipient and review controls", proof: "On-chain proof reference", proofEmpty: "No proof reference has been submitted.", proofNotice: "A recorded hash or approval is not independent verification of delivery.", approvals: "Approvals", donate: "Donate Testnet XLM", details: "Open on-chain campaign", retry: "Check again" },
  id: { title: "Latihan donasi Testnet", badge: "QA · tujuan fiktif", notice: "Testnet XLM benar-benar bisa berpindah. Tujuan, organizer dan foto AI tetap fiktif; token tidak bernilai uang.",
    loading: "Memeriksa campaign on-chain yang dikonfigurasi…", setup: "Donasi Testnet untuk tujuan ini belum dikonfigurasi.",
    unmapped: "Tujuan fiktif ini belum memiliki campaign Testnet yang direview.", unavailable: "Campaign Testnet belum bisa diverifikasi. Penerima dan saldo tidak diasumsikan.",
    local: "Preview lokal tidak membaca atau memindahkan dana Testnet live.", invalid: "Tujuan ini tidak ada dalam katalog QA Testnet yang didukung.",
    raised: "Kontribusi terkonfirmasi", escrow: "Ditahan di escrow", separation: "Nominal on-chain ini terpisah dari target, progres dan donor contoh.",
    open: "Pendanaan terbuka", expired: "Batas pendanaan sudah lewat", closed: "Tidak menerima donasi", deadline: "Batas pendanaan", rawTime: "Timestamp ledger", creator: "Pembuat campaign QA", beneficiary: "Wallet penerima QA", reviewers: "Tiga wallet reviewer QA",
    terms: "Periksa penerima dan ketentuan persis sebelum konfirmasi. Wallet ini tidak membuktikan identitas organizer fiktif.",
    controls: "Penerima dan kontrol review", proof: "Referensi bukti on-chain", proofEmpty: "Belum ada referensi bukti yang dikirim.", proofNotice: "Hash atau approval tercatat bukan verifikasi independen atas penyaluran.", approvals: "Approval", donate: "Donasi Testnet XLM", details: "Buka campaign on-chain", retry: "Periksa lagi" },
  tl: { title: "Pagsubok ng donasyong Testnet", badge: "QA · kathang-isip na layunin", notice: "Maaaring lumipat ang aktuwal na Testnet XLM. Kathang-isip pa rin ang layunin, organizer at AI photos; walang halagang pera ang mga token.",
    loading: "Sinusuri ang naka-configure na on-chain campaign…", setup: "Hindi pa naka-configure ang Testnet donation para rito.",
    unmapped: "Wala pang na-review na Testnet campaign ang kathang-isip na layuning ito.", unavailable: "Hindi ma-verify ang Testnet campaign. Walang ipinapalagay na tatanggap o balanse.",
    local: "Hindi bumabasa o naglilipat ng live Testnet funds ang local preview.", invalid: "Wala ang layuning ito sa suportadong Testnet QA catalog.",
    raised: "Kumpirmadong kontribusyon", escrow: "Nasa escrow", separation: "Hiwalay ang on-chain amounts na ito sa halimbawang goal, progress at donor entries.",
    open: "Bukas ang pagpopondo", expired: "Lumipas ang funding deadline", closed: "Hindi tumatanggap ng donasyon", deadline: "Funding deadline", rawTime: "Ledger timestamp", creator: "QA campaign creator", beneficiary: "QA beneficiary wallet", reviewers: "Tatlong QA reviewer wallet",
    terms: "Suriin ang eksaktong tatanggap at terms bago kumpirmahin. Hindi pinatutunayan ng wallets ang pagkakakilanlan ng kathang-isip na organizer.",
    controls: "Tatanggap at review controls", proof: "On-chain proof reference", proofEmpty: "Wala pang naisumiteng proof reference.", proofNotice: "Hindi independiyenteng patunay ng delivery ang naitalang hash o approval.", approvals: "Mga approval", donate: "Mag-donate ng Testnet XLM", details: "Buksan ang on-chain campaign", retry: "Suriin muli" },
  vi: { title: "Thử nghiệm quyên góp Testnet", badge: "QA · mục tiêu hư cấu", notice: "Testnet XLM thực sự có thể được chuyển. Mục tiêu, người tổ chức và ảnh AI vẫn là hư cấu; token không có giá trị tiền tệ.",
    loading: "Đang kiểm tra chiến dịch on-chain đã cấu hình…", setup: "Chưa cấu hình quyên góp Testnet cho mục tiêu này.",
    unmapped: "Mục tiêu hư cấu này chưa có chiến dịch Testnet được xem xét.", unavailable: "Không thể xác minh chiến dịch Testnet. Không giả định người nhận hay số dư.",
    local: "Bản xem trước cục bộ không đọc hay chuyển tiền Testnet trực tiếp.", invalid: "Mục tiêu này không có trong danh mục QA Testnet được hỗ trợ.",
    raised: "Đóng góp đã xác nhận", escrow: "Giữ trong escrow", separation: "Số tiền on-chain này tách biệt với mục tiêu, tiến độ và nhà tài trợ mẫu.",
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

export default function CircleTestnetSummary({ circleId, result: supplied, loading: suppliedLoading, onRefresh, hideDonate = false, hideDetailsLink = false, compact = false }: {
  circleId: string;
  result?: CircleTestnetCampaignResult | null;
  loading?: boolean;
  onRefresh?: () => void;
  hideDonate?: boolean;
  hideDetailsLink?: boolean;
  compact?: boolean;
}) {
  const { locale } = useT();
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

  return <section className={styles.card} aria-labelledby={`circle-testnet-title-${circleId}`} data-testid="circle-testnet-summary">
    <header className={styles.heading}>
      <span className={styles.badge}>{copy.badge}</span>
      <h2 id={`circle-testnet-title-${circleId}`}>{copy.title}</h2>
    </header>
    <p className={styles.notice}>{copy.notice}</p>
    {loading ? <p className={styles.state} role="status">{copy.loading}</p>
      : result?.ok ? <>
        <div className={styles.metrics}>
          <div><small>{copy.raised}</small><strong>{exactXlm(result.campaign.total, locale)}</strong></div>
          <div><small>{copy.escrow}</small><strong>{exactXlm(result.campaign.escrow, locale)}</strong></div>
        </div>
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
