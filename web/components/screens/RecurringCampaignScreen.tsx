"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Btn, Card, Ico, PoweredByStellar, T } from "@/components/ui/kit";
import SubmissionStatusPanel from "@/components/ui/SubmissionStatusPanel";
import { useT } from "@/components/I18nProvider";
import { useUnresolvedSubmission } from "@/lib/ui/useUnresolvedSubmission";
import { useGoBack } from "@/lib/ui/useGoBack";
import { PREVIEW_RECIPIENT, PREVIEW_WALLET } from "@/lib/local-preview";
import { isLocalPreview } from "@/lib/local-preview";
import { formatStroops } from "@/lib/format-stroops";
import { parseXlmStroops, recurringProofFileHash, recurringStageRefundable, type RecurringCampaign } from "@/lib/recurring-campaign";
import {
  cancelRecurringCampaignConfirmation, prepareRecurringCampaignConfirmation, recurringCampaignState,
  recurringCampaignCreate, recurringCampaignDonate, recurringCampaignSubmitProof, recurringCampaignApprove,
  recurringCampaignRelease, recurringCampaignRefund, recurringCampaignCloseEmpty,
} from "@/app/recurring-campaign-actions";

type Result = Awaited<ReturnType<typeof recurringCampaignCreate>>;
type Request =
  | { kind: "create"; input: unknown }
  | { kind: "donate"; campaignId: string; amountStroops: string }
  | { kind: "submit_proof"; campaignId: string; hash: string; url: string }
  | { kind: "approve" | "release" | "refund" | "close_empty"; campaignId: string };
type Action = (intentId: string) => Promise<Result>;
type ViewState = { ok: true; contractId: string; viewer: string | null; now: string; campaigns: RecurringCampaign[] }
  | { ok: false; error: string };
type StageInput = { amount: string; dueDate: string };

const WORDS = {
  en: { heading: "Recurring campaigns", create: "Create recurring campaign", regular: "Create one-time campaign", back: "Back", testnet: "Testnet", local: "Local fixture · no Testnet transaction", intro: "Contributions fill payout stages in order. Each payout requires public proof and approval from two of the three configured reviewer wallets.", stages: "Payout stages", stage: "Stage", target: "Target (Testnet XLM)", due: "Due date", fundingClose: "Funding closes", finalReview: "Final review deadline", title: "Campaign title", beneficiary: "Beneficiary public wallet", creatorShare: "Creator share (0–10%)", reviewers: "Three distinct reviewer wallets", addStage: "Add payout stage", removeStage: "Remove stage", review: "Review recurring terms", amount: "Contribution (Testnet XLM)", contribute: "Review contribution", proofHash: "Proof SHA-256 hash", proofUrl: "Public HTTPS proof link", submitProof: "Review proof submission", approve: "Review approval", release: "Review stage payout", refund: "Review unspent-stage refund", close: "Close empty campaign", noCampaigns: "No recurring campaigns yet.", guest: "Sign in with a Salapi account to create, contribute, or manage a recurring Testnet campaign.", state: "Current stage status", funded: "Funded", released: "Released", pending: "Awaiting proof review", future: "Not reached", remaining: "Unspent refundable allocation", reviewersList: "Configured reviewers", proof: "Submitted proof", approvals: "Approvals", confirm: "Review before confirming", confirmButton: "Confirm Testnet transaction", localConfirm: "Confirm local example", cancel: "Cancel", fee: "Maximum network fee", refreshed: "Refresh", funding: "Open for contributions", scheduled: "Waiting for stage due date", proofReview: "Proof review in progress", refundable: "Unspent stages refundable after final review", complete: "All stages released", closed: "Closed", balanceNote: "Only Testnet XLM moves. No fiat payment is involved.", dueRule: "Stage dates must be ordered, on or after funding close, and before final review.", proofRule: "Released stages cannot be refunded. Only allocations to stages that have not released can be returned after final review." },
  id: { heading: "Campaign berulang", create: "Buat campaign berulang", regular: "Buat campaign satu kali", back: "Kembali", testnet: "Testnet", local: "Fixture lokal · tidak ada transaksi Testnet", intro: "Kontribusi mengisi target tahap secara berurutan. Setiap pencairan memerlukan bukti publik dan persetujuan dua dari tiga wallet reviewer yang ditetapkan.", stages: "Tahap pencairan", stage: "Tahap", target: "Target (XLM Testnet)", due: "Tanggal jatuh tempo", fundingClose: "Pendanaan ditutup", finalReview: "Batas review akhir", title: "Judul campaign", beneficiary: "Wallet publik penerima", creatorShare: "Bagian kreator (0–10%)", reviewers: "Tiga wallet reviewer berbeda", addStage: "Tambah tahap pencairan", removeStage: "Hapus tahap", review: "Tinjau aturan berulang", amount: "Kontribusi (XLM Testnet)", contribute: "Tinjau kontribusi", proofHash: "Hash SHA-256 bukti", proofUrl: "Tautan HTTPS bukti publik", submitProof: "Tinjau pengiriman bukti", approve: "Tinjau persetujuan", release: "Tinjau pencairan tahap", refund: "Tinjau pengembalian tahap tersisa", close: "Tutup campaign kosong", noCampaigns: "Belum ada campaign berulang.", guest: "Masuk dengan akun Salapi untuk membuat, berkontribusi, atau mengelola campaign Testnet berulang.", state: "Status tahap saat ini", funded: "Terkumpul", released: "Dicairkan", pending: "Menunggu review bukti", future: "Belum dimulai", remaining: "Alokasi tahap yang dapat dikembalikan", reviewersList: "Reviewer yang ditetapkan", proof: "Bukti yang dikirim", approvals: "Persetujuan", confirm: "Tinjau sebelum konfirmasi", confirmButton: "Konfirmasi transaksi Testnet", localConfirm: "Konfirmasi contoh lokal", cancel: "Batal", fee: "Biaya jaringan maksimum", refreshed: "Muat ulang", funding: "Terbuka untuk kontribusi", scheduled: "Menunggu tanggal tahap", proofReview: "Review bukti berlangsung", refundable: "Tahap tersisa dapat dikembalikan setelah review akhir", complete: "Semua tahap sudah dicairkan", closed: "Ditutup", balanceNote: "Hanya XLM Testnet yang berpindah. Tidak ada pembayaran fiat.", dueRule: "Tanggal tahap harus berurutan, pada/setelah penutupan pendanaan, dan sebelum review akhir.", proofRule: "Tahap yang sudah cair tidak dapat dikembalikan. Hanya alokasi ke tahap yang belum cair yang bisa dikembalikan setelah review akhir." },
  tl: { heading: "Mga paulit-ulit na campaign", create: "Gumawa ng paulit-ulit na campaign", regular: "Gumawa ng isang beses na campaign", back: "Bumalik", testnet: "Testnet", local: "Lokal na fixture · walang Testnet transaction", intro: "Pinupunan ng mga ambag ang mga target ng payout stage ayon sa pagkakasunod. Kailangan ng pampublikong patunay at pag-apruba ng dalawa sa tatlong nakatalagang reviewer wallet sa bawat payout.", stages: "Mga payout stage", stage: "Stage", target: "Target (Testnet XLM)", due: "Takdang petsa", fundingClose: "Pagsasara ng pondo", finalReview: "Huling takdang review", title: "Pamagat ng campaign", beneficiary: "Pampublikong wallet ng benepisyaryo", creatorShare: "Bahagi ng creator (0–10%)", reviewers: "Tatlong magkaibang reviewer wallet", addStage: "Magdagdag ng payout stage", removeStage: "Alisin ang stage", review: "Suriin ang paulit-ulit na mga tuntunin", amount: "Ambag (Testnet XLM)", contribute: "Suriin ang ambag", proofHash: "SHA-256 hash ng patunay", proofUrl: "Pampublikong HTTPS link ng patunay", submitProof: "Suriin ang pagpapadala ng patunay", approve: "Suriin ang pag-apruba", release: "Suriin ang payout ng stage", refund: "Suriin ang refund ng hindi nagastos na stage", close: "Isara ang walang lamang campaign", noCampaigns: "Wala pang paulit-ulit na campaign.", guest: "Mag-sign in sa Salapi para gumawa, mag-ambag, o mamahala ng paulit-ulit na Testnet campaign.", state: "Status ng kasalukuyang stage", funded: "Napondohan", released: "Nailabas", pending: "Naghihintay ng review ng patunay", future: "Hindi pa naaabot", remaining: "Maaaring i-refund na alokasyon ng hindi pa nailalabas na stage", reviewersList: "Mga nakatalagang reviewer", proof: "Isinumiteng patunay", approvals: "Mga pag-apruba", confirm: "Suriin bago kumpirmahin", confirmButton: "Kumpirmahin ang Testnet transaction", localConfirm: "Kumpirmahin ang lokal na halimbawa", cancel: "Kanselahin", fee: "Pinakamataas na bayad sa network", refreshed: "I-refresh", funding: "Bukas para sa mga ambag", scheduled: "Naghihintay sa takdang petsa ng stage", proofReview: "Isinasagawa ang review ng patunay", refundable: "Maaaring i-refund ang natitirang stage pagkatapos ng huling review", complete: "Nailabas na ang lahat ng stage", closed: "Sarado", balanceNote: "Testnet XLM lang ang ililipat. Walang fiat payment.", dueRule: "Dapat sunod-sunod ang mga petsa ng stage, sa/pagkatapos ng pagsasara ng pondo, at bago ang huling review.", proofRule: "Hindi mare-refund ang nailabas na stage. Pagkatapos ng huling review, alokasyon lang sa hindi pa nailalabas na stage ang maibabalik." },
  vi: { heading: "Chiến dịch định kỳ", create: "Tạo chiến dịch định kỳ", regular: "Tạo chiến dịch một lần", back: "Quay lại", testnet: "Testnet", local: "Fixture cục bộ · không có giao dịch Testnet", intro: "Đóng góp được phân bổ lần lượt vào các mục tiêu giải ngân. Mỗi lần giải ngân cần bằng chứng công khai và sự chấp thuận của hai trong ba ví đánh giá đã cấu hình.", stages: "Các giai đoạn giải ngân", stage: "Giai đoạn", target: "Mục tiêu (Testnet XLM)", due: "Ngày đến hạn", fundingClose: "Đóng góp đóng vào", finalReview: "Hạn đánh giá cuối", title: "Tên chiến dịch", beneficiary: "Ví công khai của người thụ hưởng", creatorShare: "Phần của người tạo (0–10%)", reviewers: "Ba ví đánh giá riêng biệt", addStage: "Thêm giai đoạn giải ngân", removeStage: "Xóa giai đoạn", review: "Xem lại điều khoản định kỳ", amount: "Đóng góp (Testnet XLM)", contribute: "Xem lại khoản đóng góp", proofHash: "Mã băm SHA-256 của bằng chứng", proofUrl: "Liên kết HTTPS công khai đến bằng chứng", submitProof: "Xem lại việc gửi bằng chứng", approve: "Xem lại phê duyệt", release: "Xem lại giải ngân giai đoạn", refund: "Xem lại hoàn tiền giai đoạn chưa chi", close: "Đóng chiến dịch trống", noCampaigns: "Chưa có chiến dịch định kỳ.", guest: "Đăng nhập tài khoản Salapi để tạo, đóng góp hoặc quản lý chiến dịch Testnet định kỳ.", state: "Trạng thái giai đoạn hiện tại", funded: "Đã góp", released: "Đã giải ngân", pending: "Đang chờ xem xét bằng chứng", future: "Chưa đến", remaining: "Khoản phân bổ chưa chi có thể hoàn lại", reviewersList: "Người đánh giá đã cấu hình", proof: "Bằng chứng đã gửi", approvals: "Phê duyệt", confirm: "Xem lại trước khi xác nhận", confirmButton: "Xác nhận giao dịch Testnet", localConfirm: "Xác nhận ví dụ cục bộ", cancel: "Hủy", fee: "Phí mạng tối đa", refreshed: "Làm mới", funding: "Đang mở nhận đóng góp", scheduled: "Chờ đến ngày của giai đoạn", proofReview: "Đang xem xét bằng chứng", refundable: "Có thể hoàn các giai đoạn chưa chi sau lần đánh giá cuối", complete: "Đã giải ngân mọi giai đoạn", closed: "Đã đóng", balanceNote: "Chỉ chuyển Testnet XLM. Không có thanh toán tiền pháp định.", dueRule: "Ngày giai đoạn phải theo thứ tự, từ lúc đóng góp trở đi và trước lần đánh giá cuối.", proofRule: "Giai đoạn đã giải ngân không thể hoàn lại. Sau lần đánh giá cuối, chỉ phân bổ cho giai đoạn chưa giải ngân mới được hoàn." },
} as const;

const CONTRACT_LINK_LABEL = {
  en: "Verify D5 contract",
  tl: "I-verify ang D5 contract",
  id: "Verifikasi kontrak D5",
  vi: "Xác minh hợp đồng D5",
} as const;

const PROOF_COPY = {
  en: { file: "Local proof file (hash only)", hashing: "Calculating SHA-256 on this device…", ready: (name: string) => `Hash calculated for ${name}. The file was not uploaded. Upload this same file to a public HTTPS location, then paste its URL below.`, failed: "Could not calculate the hash. Choose a non-empty file no larger than 10 MB.", publicUrl: "This HTTPS link is public and recorded on the Testnet contract. Do not include private information." },
  tl: { file: "Lokal na proof file (hash lang)", hashing: "Kinakalkula ang SHA-256 sa device na ito…", ready: (name: string) => `Nakalkula ang hash para sa ${name}. Hindi in-upload ang file. I-upload ang mismong file sa pampublikong HTTPS location, saka ilagay ang URL dito.`, failed: "Hindi makalkula ang hash. Pumili ng file na may laman at hindi lalampas sa 10 MB.", publicUrl: "Pampubliko ang HTTPS link na ito at itatala sa Testnet contract. Huwag magsama ng pribadong impormasyon." },
  id: { file: "File bukti lokal (hanya hitung hash)", hashing: "Menghitung SHA-256 di perangkat ini…", ready: (name: string) => `Hash untuk ${name} sudah dihitung. File tidak diunggah. Unggah file yang sama ke alamat HTTPS publik, lalu tempel URL-nya di bawah.`, failed: "Hash tidak bisa dihitung. Pilih file bukti yang tidak kosong dan maksimal 10 MB.", publicUrl: "Tautan HTTPS ini bersifat publik dan dicatat di kontrak Testnet. Jangan sertakan informasi pribadi." },
  vi: { file: "Tệp bằng chứng cục bộ (chỉ tính mã băm)", hashing: "Đang tính SHA-256 trên thiết bị này…", ready: (name: string) => `Đã tính mã băm cho ${name}. Tệp chưa được tải lên. Hãy tải chính tệp này lên địa chỉ HTTPS công khai rồi dán URL bên dưới.`, failed: "Không thể tính mã băm. Hãy chọn tệp bằng chứng không rỗng và tối đa 10 MB.", publicUrl: "Liên kết HTTPS này là công khai và được ghi vào hợp đồng Testnet. Không đưa thông tin riêng tư vào đây." },
} as const;

const PREVIEW_NOW = 1_800_000_000n;
const PREVIEW_BENEFICIARY = "GAXPCCZD3AKYIRCI5CCX2TRIMVGQ45XEUEZPF5RBUZHYFRRZGN64ZNO3";
const LOCAL_CAMPAIGN: RecurringCampaign = {
  id: "1", title: "Sample recurring relief campaign", state: "Funding",
  config: { creator: PREVIEW_WALLET.address, beneficiary: PREVIEW_BENEFICIARY, token: "Testnet XLM", creator_cut_bps: 500,
    funding_deadline: String(PREVIEW_NOW + 86_400n), review_deadline: String(PREVIEW_NOW + 500_000n),
    approvers: [PREVIEW_WALLET.address, PREVIEW_RECIPIENT, PREVIEW_BENEFICIARY] },
  total: "5000000", escrow: "5000000", current_stage: 0, proofHash: null, proofUrl: "", approvals: [],
  stages: [
    { amount: "10000000", due_date: String(PREVIEW_NOW + 86_400n), funded: "5000000", released: false },
    { amount: "20000000", due_date: String(PREVIEW_NOW + 172_800n), funded: "0", released: false },
  ], contribution: { amount: "0", stages: ["0", "0"], refunded: false },
};

const field: React.CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 650 };
const input: React.CSSProperties = { width: "100%", border: `1px solid ${T.hairline}`, borderRadius: 10, padding: 11, font: "inherit", boxSizing: "border-box", background: "white" };
const grid: React.CSSProperties = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))" };
const panel: React.CSSProperties = { border: `1px solid ${T.hairline}`, borderRadius: 14, padding: 16, display: "grid", gap: 12, background: "white" };
const small: React.CSSProperties = { color: T.ink60, fontSize: 13, lineHeight: 1.5 };

function previewState(id = ""): ViewState {
  return { ok: true, contractId: "Local fixture", viewer: PREVIEW_WALLET.address,
    now: PREVIEW_NOW.toString(), campaigns: id ? [LOCAL_CAMPAIGN].filter(campaign => campaign.id === id.replace(/^r/, "")) : [LOCAL_CAMPAIGN] };
}

function timestamp(value: string, locale: string) {
  return new Date(Number(value) * 1000).toLocaleString(locale, { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC";
}

export default function RecurringCampaignScreen({ id = "", standaloneCreate = false }: { id?: string; standaloneCreate?: boolean }) {
  const { locale } = useT();
  const copy = WORDS[locale] ?? WORDS.en;
  const goBack = useGoBack(id || standaloneCreate ? "/campaigns?mode=recurring" : "/create");
  const submission = useUnresolvedSubmission("campaign:recurring-v5");
  const [view, setView] = useState<ViewState | null>(isLocalPreview ? previewState(id) : null);
  const [busy, setBusy] = useState(false);
  const locked = busy || submission.locked;
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ link: string; value?: string } | null>(null);
  const [dialog, setDialog] = useState<{ label: string; action: Action; intentId: string; kind: string; fee: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancel = useCallback(() => {
    if (locked || !dialog) return;
    void cancelRecurringCampaignConfirmation(dialog.intentId, dialog.kind);
    setDialog(null); setError("");
  }, [locked, dialog]);
  const [title, setTitle] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [creatorShare, setCreatorShare] = useState("0");
  const [fundingClose, setFundingClose] = useState("");
  const [finalReview, setFinalReview] = useState("");
  const [reviewers, setReviewers] = useState(["", "", ""]);
  const [stages, setStages] = useState<StageInput[]>([{ amount: "", dueDate: "" }, { amount: "", dueDate: "" }]);
  const [contribution, setContribution] = useState("");
  const [proof, setProof] = useState({ hash: "", url: "" });
  const [proofFile, setProofFile] = useState<{ name: string; status: "hashing" | "ready" | "failed" } | null>(null);
  const proofFileRevision = useRef(0);

  const refresh = useCallback(async () => {
    if (isLocalPreview) { setView(previewState(id)); return; }
    try { setView(await recurringCampaignState(id, "0")); }
    catch { setView({ ok: false, error: "Could not read recurring campaign state. Refresh to retry." }); }
  }, [id]);
  useEffect(() => {
    if (isLocalPreview) return;
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 15_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [refresh]);
  useEffect(() => {
    if (!dialog) return;
    const root = dialogRef.current;
    root?.focus({ preventScroll: true });
    function trap(event: KeyboardEvent) {
      if (event.key === "Escape" && !locked) { cancel(); return; }
      if (event.key !== "Tab" || !root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]'));
      const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root)) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", trap);
    return () => document.removeEventListener("keydown", trap);
  }, [dialog, locked, cancel]);

  async function prepare(request: Request, action: Action) {
    if (locked || dialog || isLocalPreview) return;
    setError(""); setDone(null); setBusy(true);
    try {
      const result = await prepareRecurringCampaignConfirmation(request);
      if (!result.ok) { setError(result.error); return; }
      setDialog({ label: result.summary, action, intentId: result.intentId, kind: result.action, fee: result.feeStroops });
    } catch { setError("Recurring campaign confirmation could not be prepared. No transaction was submitted."); }
    finally { setBusy(false); }
  }
  async function hashProofFile(file?: File) {
    const revision = ++proofFileRevision.current;
    if (!file) { setProofFile(null); return; }
    setProof(value => ({ ...value, hash: "" }));
    setProofFile({ name: file.name, status: "hashing" });
    try {
      const hash = await recurringProofFileHash(file);
      if (revision !== proofFileRevision.current) return;
      setProof(value => ({ ...value, hash }));
      setProofFile({ name: file.name, status: "ready" });
    } catch {
      if (revision !== proofFileRevision.current) return;
      setProofFile({ name: file.name, status: "failed" });
    }
  }
  async function confirm() {
    if (!dialog || locked) return;
    const current = dialog; setBusy(true); setError("");
    try {
      const result = await submission.run(() => current.action(current.intentId));
      if (!result) { setDialog(null); return; }
      if (!result.ok) {
        setError(result.error);
        setDialog(null);
        if (result.pending && result.link) setDone({ link: result.link });
      } else {
        setDone({ link: result.link, value: result.value }); setDialog(null);
        await refresh();
      }
    } catch { setDialog(null); setError("Confirmation was interrupted. Refresh and check the transaction before retrying."); }
    finally { setBusy(false); }
  }
  function create() {
    try {
      const epoch = (value: string) => {
        const time = new Date(value).getTime();
        if (!Number.isFinite(time)) throw new Error("Choose a valid date and time.");
        return String(Math.floor(time / 1000));
      };
      const input = { title, beneficiary, creatorCut: creatorShare, fundingDeadline: epoch(fundingClose),
        reviewDeadline: epoch(finalReview), approvers: reviewers,
        stages: stages.map(stage => ({ amountStroops: parseXlmStroops(stage.amount).toString(), dueDate: epoch(stage.dueDate) })) };
      const action = recurringCampaignCreate;
      void prepare({ kind: "create", input }, action);
    } catch (e) { setError(e instanceof Error ? e.message : "Enter valid recurring campaign terms."); }
  }

  const campaigns = view?.ok ? view.campaigns : [];
  const campaign = id ? campaigns[0] : null;
  const viewer = view?.ok ? view.viewer : null;
  const now = view?.ok ? BigInt(view.now) : PREVIEW_NOW;
  const activeStage = campaign?.stages[campaign.current_stage];
  const refundable = campaign?.contribution ? recurringStageRefundable(campaign.contribution, campaign.current_stage) : 0n;
  const fundingOpen = !!campaign && campaign.state === "Funding" && now < BigInt(campaign.config.funding_deadline);
  const creatorCanProve = !!campaign && viewer === campaign.config.creator && campaign.state === "Scheduled" && !!activeStage
    && now >= BigInt(activeStage.due_date) && BigInt(activeStage.funded) === BigInt(activeStage.amount) && !campaign.proofHash;
  const canApprove = !!campaign && !!viewer && campaign.config.approvers.includes(viewer) && campaign.state === "PendingProof"
    && !!campaign.proofHash && !campaign.approvals.includes(viewer) && now < BigInt(campaign.config.review_deadline);
  const canRelease = !!campaign && campaign.state === "PendingProof" && !!campaign.proofHash && campaign.approvals.length >= 2;
  const canRefund = !!campaign && campaign.state === "Refundable" && refundable > 0n && !campaign.contribution?.refunded;
  const canCloseEmpty = !!campaign && campaign.state === "Refundable" && campaign.total === "0";
  const stateLabel = campaign ? campaign.state === "Funding" ? copy.funding : campaign.state === "Scheduled" ? copy.scheduled
    : campaign.state === "PendingProof" ? copy.proofReview : campaign.state === "Refundable" ? copy.refundable
      : campaign.state === "Released" ? copy.complete : copy.closed : "";

  return <main style={{ width: "min(100% - 28px, 720px)", margin: "0 auto", padding: "16px 0 40px", color: T.ink, fontFamily: T.fontSans }}>
    <SubmissionStatusPanel guard={submission} onRefresh={refresh} />
    <header style={{ display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${T.hairline}`, padding: "6px 0 14px" }}>
      <button type="button" onClick={goBack} aria-label={copy.back} style={{ border: 0, background: "transparent", padding: 4 }}>{Ico.back({ size: 20 })}</button>
      <strong style={{ flex: 1, fontSize: 16 }}>{copy.heading}</strong><span style={{ fontSize: 12, color: T.ink60 }}>{copy.testnet}</span>
    </header>
    <section style={{ display: "grid", gap: 10, padding: "22px 0" }}>
      <h1 style={{ margin: 0, fontSize: "clamp(26px, 6vw, 38px)", letterSpacing: "-.04em" }}>{standaloneCreate ? copy.create : copy.heading}</h1>
      <p style={{ ...small, margin: 0 }}>{copy.intro}</p>
      <p style={{ ...small, margin: 0 }}>{copy.balanceNote}</p>
      {isLocalPreview && <p role="status" style={{ borderRadius: 10, padding: 12, background: "#f1f6ff", margin: 0 }}>{copy.local}</p>}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link href="/campaigns?mode=recurring" style={{ color: T.action }}>{copy.heading}</Link>
        <Link href="/campaigns?mode=testnet" style={{ color: T.action }}>{copy.regular}</Link>
        {view?.ok && view.contractId !== "Local fixture" && <a href={`https://stellar.expert/explorer/testnet/contract/${view.contractId}`} target="_blank" rel="noreferrer" style={{ color: T.action }}>{CONTRACT_LINK_LABEL[locale]}</a>}
        <button type="button" onClick={() => void refresh()} disabled={locked} style={{ color: T.action, border: 0, background: "transparent" }}>{copy.refreshed}</button>
      </div>
    </section>

    {standaloneCreate && <Card style={panel}>
      <h2 style={{ margin: 0, fontSize: 20 }}>{copy.create}</h2>
      {!viewer && !isLocalPreview ? <><p style={small}>{copy.guest}</p><Link href={`/signin?next=${encodeURIComponent("/create?kind=recurring")}`} style={{ color: T.action }}>Sign in →</Link></> : <>
        <label style={field}>{copy.title}<input style={input} maxLength={120} value={title} onChange={e => setTitle(e.target.value)} disabled={locked} /></label>
        <div style={grid}>
          <label style={field}>{copy.beneficiary}<input style={input} value={beneficiary} onChange={e => setBeneficiary(e.target.value)} disabled={locked} autoCapitalize="characters" /></label>
          <label style={field}>{copy.creatorShare}<input style={input} inputMode="decimal" value={creatorShare} onChange={e => setCreatorShare(e.target.value)} disabled={locked} /></label>
        </div>
        <p style={{ ...small, margin: 0 }}>The creator share is fixed at creation. It is paid from each released stage; it is not a platform fee.</p>
        <div style={grid}>
          <label style={field}>{copy.fundingClose}<input style={input} type="datetime-local" value={fundingClose} onChange={e => setFundingClose(e.target.value)} disabled={locked} /></label>
          <label style={field}>{copy.finalReview}<input style={input} type="datetime-local" value={finalReview} onChange={e => setFinalReview(e.target.value)} disabled={locked} /></label>
        </div>
        <fieldset style={{ ...panel, padding: 12 }}><legend style={{ padding: "0 6px", fontWeight: 700 }}>{copy.stages}</legend>
          <p style={{ ...small, margin: 0 }}>{copy.dueRule}</p>
          {stages.map((stage, index) => <div key={index} style={{ ...panel, padding: 12 }}>
            <strong>{copy.stage} {index + 1}</strong>
            <div style={grid}>
              <label style={field}>{copy.target}<input style={input} inputMode="decimal" placeholder="1.0000000" value={stage.amount} onChange={e => setStages(values => values.map((item, i) => i === index ? { ...item, amount: e.target.value } : item))} disabled={locked} /></label>
              <label style={field}>{copy.due}<input style={input} type="datetime-local" value={stage.dueDate} onChange={e => setStages(values => values.map((item, i) => i === index ? { ...item, dueDate: e.target.value } : item))} disabled={locked} /></label>
            </div>
            {stages.length > 2 && <button type="button" disabled={locked} onClick={() => setStages(values => values.filter((_, i) => i !== index))} style={{ justifySelf: "start", color: T.action, background: "transparent", border: 0 }}>{copy.removeStage}</button>}
          </div>)}
          {stages.length < 6 && <button type="button" disabled={locked} onClick={() => setStages(values => [...values, { amount: "", dueDate: "" }])} style={{ justifySelf: "start", color: T.action, background: "transparent", border: 0 }}>{copy.addStage}</button>}
        </fieldset>
        <fieldset style={{ ...panel, padding: 12 }}><legend style={{ padding: "0 6px", fontWeight: 700 }}>{copy.reviewers}</legend>
          <div style={grid}>{reviewers.map((address, index) => <label key={index} style={field}>Reviewer {index + 1}<input style={input} value={address} onChange={e => setReviewers(values => values.map((item, i) => i === index ? e.target.value : item))} disabled={locked} autoCapitalize="characters" /></label>)}</div>
        </fieldset>
        {error && <p role="alert" style={{ color: "#b42318", margin: 0 }}>{error}</p>}
        {isLocalPreview ? <p style={small}>Use the production Testnet build to submit this form. Local preview does not create campaigns.</p>
          : <Btn disabled={locked} loading={busy} onClick={create}>{copy.review}</Btn>}
      </>}
    </Card>}

    {!standaloneCreate && view && !view.ok && <Card style={panel}><h2>Recurring campaigns unavailable</h2><p role="alert" style={small}>{view.error}</p></Card>}
    {!standaloneCreate && view?.ok && !id && campaigns.length === 0 && <Card style={panel}><p style={{ margin: 0 }}>{copy.noCampaigns}</p>{viewer ? <Link href="/create?kind=recurring" style={{ color: T.action }}>{copy.create}</Link>
      : !isLocalPreview && <Link href={`/signin?next=${encodeURIComponent("/create?kind=recurring")}`} style={{ color: T.action }}>Sign in to create →</Link>}</Card>}
    {!standaloneCreate && view?.ok && !id && campaigns.map(item => {
      const status = item.state === "Funding" ? copy.funding : item.state === "Scheduled" ? copy.scheduled
        : item.state === "PendingProof" ? copy.proofReview : item.state === "Refundable" ? copy.refundable
          : item.state === "Released" ? copy.complete : copy.closed;
      return <Link key={item.id} href={`/campaigns?id=r${item.id}`} style={{ ...panel, marginTop: 12, color: T.ink, textDecoration: "none" }}>
        <span style={{ color: T.ink60, fontSize: 12 }}>Recurring campaign #{item.id}</span><strong style={{ fontSize: 18 }}>{item.title}</strong>
        <span>{status} · {item.current_stage < item.stages.length ? `${copy.stage} ${item.current_stage + 1} of ${item.stages.length}` : copy.complete}</span>
        <span style={small}>{item.stages.length} {copy.stages.toLowerCase()} · {formatStroops(item.total)} Testnet XLM contributed</span>
      </Link>;
    })}
    {!standaloneCreate && view?.ok && id && !campaign && <Card style={panel}><p style={{ margin: 0 }}>Recurring campaign not found.</p><Link href="/campaigns?mode=recurring" style={{ color: T.action }}>{copy.heading}</Link></Card>}
    {!standaloneCreate && campaign && <Card style={{ ...panel, marginTop: 12 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "start", justifyContent: "space-between" }}>
        <div><span style={{ color: T.ink60, fontSize: 12 }}>Recurring campaign #{campaign.id}</span><h2 style={{ margin: "4px 0 0", fontSize: 22 }}>{campaign.title}</h2></div>
        <strong aria-label={copy.state}>{stateLabel}</strong>
      </div>
      <p style={{ ...small, margin: 0 }}>{copy.fundingClose}: {timestamp(campaign.config.funding_deadline, locale)} · {copy.finalReview}: {timestamp(campaign.config.review_deadline, locale)}</p>
      <div style={{ ...panel, background: "#fafafa" }}><strong>{copy.stages}</strong>
        {campaign.stages.map((stage, index) => {
          const isCurrent = index === campaign.current_stage;
          const stageStatus = stage.released ? copy.released : isCurrent && campaign.state === "PendingProof" ? copy.pending
            : isCurrent ? stateLabel : copy.future;
          const percent = Number(BigInt(stage.funded) * 100n / BigInt(stage.amount));
          return <div key={index} style={{ borderTop: `1px solid ${T.hairline}`, paddingTop: 10, display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><strong>{copy.stage} {index + 1} · {stageStatus}</strong><span>{copy.due}: {timestamp(stage.due_date, locale)}</span></div>
            <div>{copy.funded}: {formatStroops(stage.funded)} / {formatStroops(stage.amount)} Testnet XLM</div>
            <div role="progressbar" aria-label={`${copy.stage} ${index + 1} funding`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} style={{ height: 8, borderRadius: 99, background: "#e9edf4", overflow: "hidden" }}><span style={{ display: "block", width: `${percent}%`, height: "100%", background: T.action }} /></div>
          </div>;
        })}
      </div>
      <div style={grid}><div><strong>Total contributed</strong><p style={small}>{formatStroops(campaign.total)} Testnet XLM</p></div><div><strong>Current escrow</strong><p style={small}>{formatStroops(campaign.escrow)} Testnet XLM</p></div></div>
      <p style={{ ...small, margin: 0 }}>{copy.reviewersList}: {campaign.config.approvers.join(" · ")}</p>
      {campaign.proofHash && <div style={panel}><strong>{copy.proof} · {copy.stage} {campaign.current_stage + 1}</strong><code style={{ overflowWrap: "anywhere" }}>{campaign.proofHash}</code><a href={campaign.proofUrl} target="_blank" rel="noreferrer">{campaign.proofUrl}</a><p style={{ ...small, margin: 0 }}>{copy.approvals}: {campaign.approvals.length} / 2</p></div>}

      {viewer && <div style={{ display: "grid", gap: 12 }}>
        {fundingOpen && <div style={panel}><label style={field}>{copy.amount}<input style={input} inputMode="decimal" placeholder="1.0000000" value={contribution} onChange={e => setContribution(e.target.value)} disabled={locked} /></label>
          <p style={{ ...small, margin: 0 }}>Donations fill each stage target in order and stop at the campaign goal.</p>
          {isLocalPreview ? <p style={small}>{copy.local}</p> : <Btn disabled={locked || !contribution.trim()} onClick={() => {
            try { const amountStroops = parseXlmStroops(contribution).toString(); void prepare({ kind: "donate", campaignId: `r${campaign.id}`, amountStroops }, recurringCampaignDonate); }
            catch (e) { setError(e instanceof Error ? e.message : "Enter a valid Testnet XLM amount"); }
          }}>{copy.contribute}</Btn>}
        </div>}
        {creatorCanProve && <div style={panel}><label style={field}>{PROOF_COPY[locale].file}<input style={input} type="file" accept="image/*,.pdf" onChange={event => void hashProofFile(event.currentTarget.files?.[0])} disabled={locked} /></label>
          {proofFile?.status === "hashing" && <p role="status" style={small}>{PROOF_COPY[locale].hashing}</p>}
          {proofFile?.status === "ready" && <p role="status" style={small}>{PROOF_COPY[locale].ready(proofFile.name)}</p>}
          {proofFile?.status === "failed" && <p role="alert" style={{ ...small, color: "#b42318" }}>{PROOF_COPY[locale].failed}</p>}
          <label style={field}>{copy.proofHash}<input style={input} value={proof.hash} onChange={e => { proofFileRevision.current++; setProofFile(null); setProof(value => ({ ...value, hash: e.target.value })); }} disabled={locked} /></label>
          <label style={field}>{copy.proofUrl}<input style={input} type="url" value={proof.url} onChange={e => setProof(value => ({ ...value, url: e.target.value }))} disabled={locked} /></label>
          <p style={{ ...small, margin: 0 }}>{PROOF_COPY[locale].publicUrl}</p>
          {isLocalPreview ? <p style={small}>{copy.local}</p> : <Btn disabled={locked || proofFile?.status === "hashing"} onClick={() => void prepare({ kind: "submit_proof", campaignId: `r${campaign.id}`, ...proof }, recurringCampaignSubmitProof)}>{copy.submitProof}</Btn>}
        </div>}
        {canApprove && <Btn disabled={locked || isLocalPreview} onClick={() => void prepare({ kind: "approve", campaignId: `r${campaign.id}` }, recurringCampaignApprove)}>{copy.approve}</Btn>}
        {canRelease && <Btn disabled={locked || isLocalPreview} onClick={() => void prepare({ kind: "release", campaignId: `r${campaign.id}` }, recurringCampaignRelease)}>{copy.release}</Btn>}
        {canRefund && <div style={panel}><strong>{copy.remaining}: {formatStroops(refundable)} Testnet XLM</strong><p style={{ ...small, margin: 0 }}>{copy.proofRule}</p>
          {!isLocalPreview && <Btn disabled={locked} onClick={() => void prepare({ kind: "refund", campaignId: `r${campaign.id}` }, recurringCampaignRefund)}>{copy.refund}</Btn>}</div>}
        {canCloseEmpty && !isLocalPreview && <Btn kind="secondary" disabled={locked} onClick={() => void prepare({ kind: "close_empty", campaignId: `r${campaign.id}` }, recurringCampaignCloseEmpty)}>{copy.close}</Btn>}
      </div>}
      {!viewer && !isLocalPreview && <p style={small}>{copy.guest} <Link href={`/signin?next=${encodeURIComponent(`/campaigns?id=r${campaign.id}`)}`} style={{ color: T.action }}>Sign in →</Link></p>}
      {error && <p role="alert" style={{ color: "#b42318", margin: 0 }}>{error}</p>}
    </Card>}

    {done && <Card style={{ ...panel, marginTop: 12 }}><strong>Testnet transaction confirmed</strong><a href={done.link} target="_blank" rel="noreferrer">View transaction</a>
      {done.value && <Link href={`/campaigns?id=r${done.value}`} style={{ color: T.action }}>Open recurring campaign #{done.value}</Link>}</Card>}
    <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 24, color: T.ink60 }}><PoweredByStellar /><small>Stellar Testnet XLM</small></footer>

    {dialog && <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={copy.confirm} style={{ position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", background: "rgba(11,18,32,.55)", padding: 20 }}>
      <Card style={{ ...panel, width: "min(100%, 430px)", maxHeight: "calc(100dvh - 40px)", overflow: "auto" }}><span style={{ color: T.ink60, fontSize: 12 }}>{copy.testnet}</span><h2 style={{ margin: 0 }}>{copy.confirm}</h2><p style={{ ...small, overflowWrap: "anywhere", margin: 0 }}>{dialog.label}</p>
        <p style={{ ...small, margin: 0 }}>{copy.fee}: {formatStroops(dialog.fee)} Testnet XLM</p><p style={{ ...small, margin: 0 }}>This review expires in two minutes.</p>
        {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
        <Btn disabled={locked} loading={busy} onClick={() => void confirm()}>{copy.confirmButton}</Btn><Btn kind="secondary" disabled={locked} onClick={cancel}>{copy.cancel}</Btn>
      </Card>
    </div>}
  </main>;
}
