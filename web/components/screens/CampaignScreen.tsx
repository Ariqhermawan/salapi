"use client";
import SuccessMotion from "@/components/ui/SuccessMotion";
import D4CampaignGallery from "@/components/D4CampaignGallery";
import CampaignDonorActivity from "@/components/CampaignDonorActivity";
import CampaignUpdateSubscription from "@/components/CampaignUpdateSubscription";
import CampaignOrganizerUpdates from "@/components/CampaignOrganizerUpdates";

import Link from "next/link";
import Image from "next/image";
import { Heart } from "@phosphor-icons/react/dist/csr/Heart";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Btn, Card, Ico, PoweredByStellar, T } from "@/components/ui/kit";
import { campaignApprove, campaignCloseEmpty, campaignCreate, campaignDonate, campaignEvents, campaignRefund,
  campaignRelease, campaignState, campaignSubmitProof } from "@/app/campaign-actions";
import { campaignAmount, campaignSplit, creatorCutBps } from "@/lib/campaign-money";
import { formatStroops } from "@/lib/disaster";
import { publicProofUrl, type Campaign } from "@/lib/campaign";
import { campaignEvidence } from "@/lib/campaign-evidence";
import { isLocalPreview, normalizePreviewCampaigns, previewEvidenceUrl, PREVIEW_CAMPAIGNS, PREVIEW_WALLET as PREVIEW_ACCOUNT } from "@/lib/local-preview";
import baseStyles from "./CampaignArisan.module.css";
import detailStyles from "./CampaignDetailRevamp.module.css";
import { useUnresolvedSubmission } from "@/lib/ui/useUnresolvedSubmission";
import SubmissionStatusPanel from "@/components/ui/SubmissionStatusPanel";
import { saveCampaignPreview } from "@/lib/campaign-preview-storage";
import { useT } from "@/components/I18nProvider";
import type { Locale } from "@/lib/i18n/config";
import { vaultCampaignMedia } from "@/lib/vault-campaign-media";
import { campaignDiscoveryCopy } from "@/lib/i18n/revamp-campaign-discovery";
import { accountCopy } from "@/lib/i18n/revamp-account";
import { useGoBack } from "@/lib/ui/useGoBack";
import { campaignDonorBadge } from "@/lib/ui/testnet-donor";
import { circlesCopy } from "@/lib/i18n/revamp-circles";
const styles = { ...baseStyles, ...detailStyles };
const PREVIEW_WALLET = PREVIEW_ACCOUNT.address;
const previewCopy: Record<Locale, { failed: string; unavailable: string; saved: string; title: string }> = {
  en: {
    failed: "Could not verify browser storage. This demo change was not confirmed. Your inputs are unchanged. No transaction was sent.",
    unavailable: "Browser storage is unavailable. This demo change was not confirmed. No transaction was sent.",
    saved: "Local preview saved for this browser session. Example data only, no transaction was sent.",
    title: "Local campaign demo complete",
  },
  id: {
    failed: "Penyimpanan browser tidak dapat dipastikan. Perubahan simulasi belum terkonfirmasi. Input kamu tetap utuh. Tidak ada transaksi yang dikirim.",
    unavailable: "Penyimpanan browser tidak tersedia. Perubahan simulasi belum terkonfirmasi. Tidak ada transaksi yang dikirim.",
    saved: "Pratinjau lokal tersimpan untuk sesi browser ini. Hanya data contoh, tidak ada transaksi yang dikirim.",
    title: "Simulasi campaign lokal selesai",
  },
  tl: {
    failed: "Hindi matiyak ang browser storage. Hindi nakumpirma ang pagbabago sa demo. Hindi nabago ang mga input mo. Walang transaksyong ipinadala.",
    unavailable: "Hindi magamit ang browser storage. Hindi nakumpirma ang pagbabago sa demo. Walang transaksyong ipinadala.",
    saved: "Na-save ang lokal na preview para sa browser session na ito. Halimbawa lamang, walang transaksyong ipinadala.",
    title: "Tapos ang lokal na campaign demo",
  },
  vi: {
    failed: "Không thể xác nhận bộ nhớ trình duyệt. Thay đổi mô phỏng chưa được xác nhận. Dữ liệu nhập vẫn giữ nguyên. Không gửi giao dịch nào.",
    unavailable: "Không thể dùng bộ nhớ trình duyệt. Thay đổi mô phỏng chưa được xác nhận. Không gửi giao dịch nào.",
    saved: "Đã lưu bản xem trước cục bộ cho phiên trình duyệt này. Chỉ là dữ liệu mẫu, không gửi giao dịch nào.",
    title: "Hoàn tất mô phỏng chiến dịch cục bộ",
  },
};

const field: CSSProperties = { width: "100%", border: `1px solid ${T.hairline}`, borderRadius: 10, padding: 10, fontSize: 14, background: "white", boxSizing: "border-box" };
const group: CSSProperties = { display: "grid", gap: 10 };
const wordBreak: CSSProperties = { overflowWrap: "anywhere", fontFamily: T.fontMono, fontSize: 11 };
const stamp = (seconds: string) => `${new Date(Number(seconds) * 1000).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} UTC`;
const safeProof = (url: string) => { const local = previewEvidenceUrl(url); if (local) return local; try { return publicProofUrl(url); } catch { return null; } };
type State = Awaited<ReturnType<typeof campaignState>>;
type Result = Awaited<ReturnType<typeof campaignCreate>>;
type Run = (label: string, action: () => Promise<Result>, created?: boolean, preview?: () => boolean) => void;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={styles.field}>{label}{children}</label>;
}
function AddressLink({ address }: { address: string }) {
  return <a style={wordBreak} href={`https://stellar.expert/explorer/testnet/account/${address}`} target="_blank" rel="noreferrer">{address}</a>;
}

function CreateCampaign({ run, busy, onPreviewCreate, initialCreate = false }: { run: Run; busy: boolean; onPreviewCreate?: (campaign: Campaign) => boolean; initialCreate?: boolean }) {
  const [values, setValues] = useState({ title: "", beneficiary: "", creatorCut: "5", funding: "", review: "", a: "", b: "", c: "" });
  const [error, setError] = useState("");
  const input = (key: keyof typeof values, label: string, type = "text") => <Field label={label}><input className={styles.input} type={type} autoFocus={key === "title" && initialCreate}
    value={values[key]} onChange={e => { const value = e.target.value; setValues(previous => ({ ...previous, [key]: value })); }} disabled={busy} step={type === "datetime-local" ? "60" : undefined} /></Field>;
  function submit() {
    try {
      setError("");
      creatorCutBps(values.creatorCut);
      const fundingDeadline = String(new Date(values.funding).getTime() / 1000);
      const reviewDeadline = String(new Date(values.review).getTime() / 1000);
      if (!values.title.trim() || !/^\d+$/.test(fundingDeadline) || !/^\d+$/.test(reviewDeadline)) throw new Error("Enter a title and both deadlines");
      if (Number(fundingDeadline) <= Date.now() / 1000 || Number(reviewDeadline) <= Number(fundingDeadline)) throw new Error("Funding must end in the future. Review must end after funding.");
      if (![values.beneficiary, values.a, values.b, values.c].every(value => /^G[A-Z2-7]{55}$/.test(value.trim()))) throw new Error("Enter complete Stellar public wallet addresses beginning with G.");
      if (new Set([values.a.trim(), values.b.trim(), values.c.trim()]).size !== 3) throw new Error("Choose three different approver wallets.");
      run(`Create “${values.title}” with a ${values.creatorCut}% creator share. Funding closes ${new Date(values.funding).toLocaleString()}; review closes ${new Date(values.review).toLocaleString()}. The three approvers, recipients, share and deadlines cannot be changed.`,
        () => campaignCreate({ title: values.title, beneficiary: values.beneficiary, creatorCut: values.creatorCut,
          fundingDeadline, reviewDeadline, approvers: [values.a, values.b, values.c] }), true, () => {
            const saved = onPreviewCreate?.({ id: String(Date.now()), title: values.title, state: "Funding", config: { creator: PREVIEW_WALLET, beneficiary: values.beneficiary, creator_cut_bps: Number(creatorCutBps(values.creatorCut)), funding_deadline: fundingDeadline, review_deadline: reviewDeadline, approvers: [values.a, values.b, values.c], token: "Local preview Testnet XLM" }, total: "0", escrow: "0", proofHash: null, proofUrl: "", approvals: [], contribution: { amount: "0", refunded: false } });
            if (!saved) return false;
            setValues({ title: "", beneficiary: "", creatorCut: "5", funding: "", review: "", a: "", b: "", c: "" });
            return true;
          });
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid campaign"); }
  }
  return <details className={`${styles.card} ${styles.creation}`} open={initialCreate || undefined}><summary className={styles.createSummary}><div><strong>Start a campaign</strong><span>Bring your cause to the community.</span></div>{Ico.plus({ c: T.action, size: 20 })}</summary>
    <div className={styles.formSection}>
      <p className={styles.muted}>Set the terms, then review before creating. Recipients, share, reviewers and deadlines lock at creation.</p>
      <p className={styles.muted}>After creation, open the campaign to add a public gallery of 3 to 6 organizer photos. Photos are stored separately from the locked financial terms and are not delivery proof.</p>
      {input("title", "1. Name your cause")}{input("beneficiary", "Beneficiary public wallet")}{input("creatorCut", "Creator share, 0 to 10%")}
      <p className={styles.muted}>This share goes to the creator. It is not a Salapi platform fee.</p>
      <div className={styles.dateGrid}>{input("funding", "2. Funding closes", "datetime-local")}{input("review", "Review closes", "datetime-local")}</div>
      <p className={styles.muted}>Dates use your local timezone. Proof review starts after funding closes.</p>
      {input("a", "3. Approver 1 public wallet")}{input("b", "Approver 2 public wallet")}{input("c", "Approver 3 public wallet")}
      {error && <p className={styles.error} role="alert">{error}</p>}<Btn disabled={busy} onClick={submit}>Review campaign terms</Btn>
    </div>
  </details>;
}

function CampaignCard({ c, viewer, now, run, busy, detail, onPreviewUpdate }: { c: Campaign; viewer: string | null; now: bigint; run: Run; busy: boolean; detail: boolean; onPreviewUpdate: (campaign: Campaign) => boolean }) {
  const { locale } = useT();
  const donorCopy = circlesCopy(locale);
  const donorBadge = campaignDonorBadge(c, viewer, isLocalPreview);
  const photoCopy = campaignDiscoveryCopy(locale);
  const media = vaultCampaignMedia(c, isLocalPreview);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("XLM");
  const [hash, setHash] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const active = c.state === "Funding" || c.state === "PendingProof" || c.state === "Refundable";
  const fundingOpen = c.state === "Funding" && now < BigInt(c.config.funding_deadline);
  const reviewOpen = now >= BigInt(c.config.funding_deadline) && now < BigInt(c.config.review_deadline);
  const quorum = c.approvals.length >= 2;
  const refundOpen = active && now >= BigInt(c.config.review_deadline) && !quorum;
  const split = campaignSplit(BigInt(c.total), BigInt(c.config.creator_cut_bps));
  const status = refundOpen ? (c.total === "0" ? "Ready to close" : "Refund available")
    : c.state === "Funding" && !fundingOpen ? "Awaiting proof" : c.state;
  const currentStep = c.state === "Released" ? 3 : c.proofHash ? 2 : fundingOpen ? 0 : 1;
  const role = viewer === c.config.creator ? "Creator" : viewer && c.config.approvers.includes(viewer) ? "Approver" : "Supporter";
  function donate() {
    try {
      setError(""); const stroops = campaignAmount({ amount, currency });
      run(`Donate ${formatStroops(stroops)} Testnet XLM to campaign #${c.id}. Funds remain escrowed pending proof review.`, () => campaignDonate(c.id, { amount, currency }), false, () => { const saved = onPreviewUpdate({ ...c, total: String(BigInt(c.total) + stroops), escrow: String(BigInt(c.escrow) + stroops), contribution: { amount: String(BigInt(c.contribution.amount) + stroops), refunded: false } }); if (saved) setAmount(""); return saved; });
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid amount"); }
  }
  return <section className={`${styles.card} ${media ? styles.photoCard : ""}`} aria-label={`Campaign #${c.id}`}>
    {media && !detail ? <header className={styles.campaignPhoto}>
      <Image src={media.coverSrc} fill sizes="(max-width: 500px) 100vw, 460px" alt="" />
      <div><span>{photoCopy("Illustrative campaign photo")}</span><Link href={`/campaigns?id=${c.id}`}><h2>{c.title}</h2></Link></div>
    </header> : null}
    <div className={`${styles.stack} ${media ? styles.photoCardBody : ""}`}>
    {media ? <Link className={styles.organizerProfile} href={media.organizerHref} aria-label={`${photoCopy("View example organizer profile")}: ${media.organizerName}`}>
      <Image src={media.organizerPhotoSrc} width={44} height={44} alt={photoCopy("Illustrative profile photo, not a verified identity")} />
      <span><small>{photoCopy("Fictional organizer example")}</small><strong>{media.organizerName}</strong></span>{Ico.chev({size:16,c:T.action})}
    </Link> : null}
    <div><div className={styles.row}><span className={styles.eyebrow}>Campaign #{c.id.length > 8 ? "Local draft" : c.id}</span><span className={styles.badge}>{status}</span></div>{(!media || detail) && <Link href={`/campaigns?id=${c.id}`}><h2>{c.title}</h2></Link>}
      <p className={styles.muted}>Funding closes {stamp(c.config.funding_deadline)}{viewer ? ` · ${role}` : ""}</p></div>
    {detail && <D4CampaignGallery key={c.id} campaignId={c.id} creatorWallet={c.config.creator} viewer={viewer}
      localPreview={isLocalPreview} examplePhotos={media?.gallery} />}
    <div className={styles.metrics}>
      <div><small>Total donated</small><strong>{formatStroops(c.total)} <span>Testnet XLM</span></strong></div>
      <div><small>Remaining escrow</small><strong>{formatStroops(c.escrow)} <span>Testnet XLM</span></strong></div>
    </div>
    {viewer && fundingOpen && <div className={styles.donationForm}>
      <div className={styles.formGrid}><Field label="Donation amount"><input className={`${styles.input} ${styles.amountInput}`} placeholder="0.00" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} disabled={busy} /></Field>
      <Field label="Display currency"><select aria-label="Display currency" className={styles.input} value={currency} onChange={e => setCurrency(e.target.value)} disabled={busy}><option value="XLM">Testnet XLM</option><option value="tl">PHP (illustrative)</option><option value="id">IDR (illustrative)</option></select></Field></div>
      <div className={styles.presets}>{(currency === "id" ? ["20000","50000","100000","200000"] : currency === "tl" ? ["50","100","200","500"] : ["5","10","25","50"]).map(value => <button key={value} type="button" disabled={busy} aria-pressed={amount === value} onClick={() => setAmount(value)}>{currency === "id" ? "Rp " : currency === "tl" ? "₱" : ""}{Number(value).toLocaleString(currency === "id" ? "id-ID" : "en-US")}{currency === "XLM" ? " XLM" : ""}</button>)}</div>
      <small>Only valueless Testnet XLM moves. Currency displays do not represent a fiat payment.</small>
      <Btn disabled={busy || !amount.trim()} onClick={donate} leading={<Heart size={18} weight="fill" aria-hidden="true" />}>Donate · Review amount</Btn>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>}
    <div className={styles.steps}>{["Fund", "Submit proof", "2 approvals", "Release"].map((label, i) => <div key={label} className={`${styles.step} ${i <= currentStep ? styles.stepCurrent : ""}`}>{i + 1}. {label}</div>)}</div>
    {!detail && <Link href={`/campaigns?id=${c.id}`} className={styles.textButton}>View campaign and terms →</Link>}
    <p className={styles.muted}>On release: {formatStroops(split.beneficiary)} XLM to beneficiary, {formatStroops(split.creator)} XLM to creator ({c.config.creator_cut_bps / 100}%).</p>
    <details className={styles.terms}><summary>Locked terms and recipients</summary><div style={{ ...group, marginTop: 8 }}>
      <div>Creator<br /><AddressLink address={c.config.creator} /></div>
      <div>Beneficiary<br /><AddressLink address={c.config.beneficiary} /></div>
      <div style={{ fontSize: 12 }}>Funding closes: {stamp(c.config.funding_deadline)}<br />Review closes: {stamp(c.config.review_deadline)}</div>
      <div style={wordBreak}>Token: {c.config.token}</div>
      {c.config.approvers.map((address, i) => <div key={address}>Approver {i + 1}: {c.approvals.includes(address) ? "Approved" : "Not approved"}<br /><AddressLink address={address} /></div>)}
    </div></details>
    <div><strong style={{ fontSize: 13 }}>{c.approvals.length}/3 wallet approvals</strong><p className={styles.muted}>Two configured wallets must approve the same proof before review closes. Approval does not prove real-world delivery.</p></div>
    {c.proofHash && <div><h3>{isLocalPreview ? "Example proof" : "Submitted proof"}</h3>{safeProof(c.proofUrl) && <a href={safeProof(c.proofUrl)!} target="_blank" rel="noreferrer">{isLocalPreview ? "Open example document" : "Open public proof document"}</a>}
      <p style={wordBreak}>SHA-256: {c.proofHash}</p><small>A hash identifies the document; it does not verify that its claims are true.</small></div>}
    {viewer && <div className={styles.donorRecord}>
      {donorBadge && <span className={donorBadge === "testnet" ? styles.testnetDonor : styles.exampleDonor} data-testid="campaign-donor-badge" data-evidence={donorBadge}>{donorCopy(donorBadge === "testnet" ? "Testnet donor" : "Example donor")}</span>}
      <p>{isLocalPreview ? donorCopy("Your example contribution") : donorCopy("Your wallet's recorded contribution")}: {formatStroops(c.contribution.amount)} XLM{c.contribution.refunded ? " · Refunded" : ""}</p>
      {donorBadge === "testnet" && <small>{donorCopy("Confirmed by this wallet's D4 contract record. Not a fiat donation, KYC check or proof of delivery.")}</small>}
      {donorBadge === "example" && <small>{donorCopy("Browser-only example. No confirmed Testnet donation or donor badge.")}</small>}
    </div>}
    {viewer === c.config.creator && c.state === "Funding" && reviewOpen && <div style={group}>
      <h3>Submit proof once</h3>
      <Field label="Public proof URL"><input style={field} type="url" value={url} onChange={e => setUrl(e.target.value)} disabled={busy} /></Field>
      <Field label="Proof SHA-256"><input style={field} value={hash} onChange={e => setHash(e.target.value)} maxLength={64} disabled={busy} /></Field>
      <Field label="Calculate hash from proof file (optional)"><input type="file" disabled={busy} onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        if (file.size > 10 * 1024 * 1024) { setError("Proof file must be under 10 MB"); return; }
        const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        setHash(Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join(""));
      }} /></Field>
      <small>The file stays on this device. Publish it separately and supply its public HTTPS link. Do not include private information.</small>
      <Btn disabled={busy} onClick={() => { if (!safeProof(url) || !/^[a-fA-F0-9]{64}$/.test(hash) || /^0+$/.test(hash)) { setError("Enter a public HTTPS proof link and a non-zero SHA-256 hash."); return; } run(`Submit proof ${hash} for campaign #${c.id}. It cannot be replaced.`, () => campaignSubmitProof(c.id, hash, url), false, () => onPreviewUpdate({ ...c, state: "PendingProof", proofHash: hash.toLowerCase(), proofUrl: url })); }}>Review proof submission</Btn>
    </div>}
    {viewer && c.config.approvers.includes(viewer) && c.state === "PendingProof" && reviewOpen && <Btn disabled={busy || c.approvals.includes(viewer)}
      onClick={() => run(`Approve the submitted proof ${c.proofHash} for campaign #${c.id}. Confirm you have reviewed the document.`, () => campaignApprove(c.id, c.proofHash!), false, () => onPreviewUpdate({ ...c, approvals: [...c.approvals, viewer] }))}>Approve proof</Btn>}
    {viewer && c.state === "PendingProof" && quorum && <Btn disabled={busy} onClick={() => run(`Release campaign #${c.id}: ${formatStroops(split.creator)} XLM to creator and ${formatStroops(split.beneficiary)} XLM to beneficiary. This completes the campaign.`, () => campaignRelease(c.id), false, () => onPreviewUpdate({ ...c, state: "Released", escrow: "0" }))}>Release funds</Btn>}
    {viewer && refundOpen && BigInt(c.contribution.amount) > 0n && !c.contribution.refunded && <Btn disabled={busy} onClick={() => run(`Return your full ${formatStroops(c.contribution.amount)} XLM donation from campaign #${c.id} to your original wallet.`, () => campaignRefund(c.id), false, () => onPreviewUpdate({ ...c, escrow: String(BigInt(c.escrow) - BigInt(c.contribution.amount)), contribution: { ...c.contribution, refunded: true } }))}>Claim full refund</Btn>}
    {viewer && refundOpen && c.total === "0" && <Btn kind="secondary" disabled={busy} onClick={() => run(`Close empty campaign #${c.id}.`, () => campaignCloseEmpty(c.id), false, () => onPreviewUpdate({ ...c, state: "Closed" }))}>Close empty campaign</Btn>}
    {error && !(viewer && fundingOpen) && <p className={styles.error} role="alert">{error}</p>}
    {detail && !isLocalPreview && c.title.startsWith("QA Circles: ") && <>
      <CampaignDonorActivity campaignId={c.id} refreshKey={`${c.total}:${c.escrow}`} />
      <CampaignUpdateSubscription campaignId={c.id} />
      <CampaignOrganizerUpdates campaignId={c.id} />
    </>}
  </div></section>;
}

export function CampaignEvidence() {
  const [events, setEvents] = useState<Awaited<ReturnType<typeof campaignEvents>> | null>(isLocalPreview ? { ok: true, events: [] } : null);
  useEffect(() => { if (isLocalPreview) return; void campaignEvents().then(setEvents).catch(() => setEvents({ ok: false, error: "Recent events unavailable" })); }, []);
  return <section aria-label="Donation campaign transparency" style={{ padding: 16 }}><Card>
    <h2 style={{ fontWeight: 700 }}>Donation campaign transactions</h2><Link href="/campaigns?mode=testnet">Open Testnet campaigns</Link>
    <p style={{ fontSize: 12 }}>Recent successful on-chain events (bounded live feed).</p>
    {!events && <p>Loading campaign events…</p>}
    {events && !events.ok && <p>{events.error}</p>}
    {events?.ok && events.events.length === 0 && <p>No campaign events in the recent window.</p>}
    {events?.ok && events.events.map(e => <div key={e.id} style={{ padding: "8px 0", borderBottom: `1px solid ${T.hairline}` }}>
      <a href={e.link} target="_blank" rel="noreferrer">Campaign #{e.campaignId} · {e.action}</a><div style={wordBreak}>{e.hash}</div>
    </div>)}
    <h3 style={{ marginTop: 20 }}>Archived D4 acceptance</h3>
    <p style={{ fontSize: 12 }}>Real Testnet transactions submitted by the SDK acceptance runner. These are separate from the live feed and are not browser-test claims.</p>
    <p style={wordBreak}>Recorded contract: {campaignEvidence.contractId}</p>
    {campaignEvidence.transactions.map(e => <div key={e.hash} style={{ padding: "8px 0", borderBottom: `1px solid ${T.hairline}` }}>
      <a href={`https://stellar.expert/explorer/testnet/tx/${e.hash}`} target="_blank" rel="noreferrer">{e.label}</a><div style={wordBreak}>{e.hash}</div>
    </div>)}
    <h3 style={{ marginTop: 20 }}>Production browser acceptance</h3>
    <p style={{ fontSize: 12 }}>Campaign #5 was created, funded, proof-submitted, approved by two different signed-in wallets, and released through salapi.app. Campaigns #3/#4 are archived refund tests.</p>
    {campaignEvidence.browserTransactions.map(e => <div key={e.hash} style={{ padding: "8px 0", borderBottom: `1px solid ${T.hairline}` }}>
      <a href={`https://stellar.expert/explorer/testnet/tx/${e.hash}`} target="_blank" rel="noreferrer">{e.label}</a><div style={wordBreak}>{e.hash}</div>
    </div>)}
    <p><a href={campaignEvidence.report} target="_blank" rel="noreferrer">Full report, raw RPC and transaction archive</a></p>
  </Card></section>;
}

export default function CampaignScreen({ id, initialCreate = false }: { id: string; initialCreate?: boolean }) {
  const goBack = useGoBack(id || initialCreate ? "/campaigns?mode=testnet" : "/vaults");
  const { locale } = useT();
  const copy = previewCopy[locale] ?? previewCopy.en;
  const submission = useUnresolvedSubmission("campaign:d4");
  const [loadedState, setState] = useState<State | null>(null);
  const [before, setBefore] = useState("0");
  const [submittingBusy, setBusy] = useState(false);
  const busy = submittingBusy || submission.locked;
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ link: string; id?: string } | null>(null);
  const [localDone, setLocalDone] = useState("");
  const [filter, setFilter] = useState("All");
  const [previewCampaigns, setPreviewCampaigns] = useState<Campaign[]>(PREVIEW_CAMPAIGNS);
  useEffect(() => {
    if (!isLocalPreview) return;
    const timer = setTimeout(() => {
      try {
        const saved = JSON.parse(sessionStorage.getItem("salapi.preview.campaigns") || "null");
        if (Array.isArray(saved) && saved.every(c => typeof c.id === "string" && typeof c.title === "string" && /^\d+$/.test(c.total) && /^\d+$/.test(c.escrow) && c.config && /^\d+$/.test(c.config.funding_deadline) && /^\d+$/.test(c.config.review_deadline) && Array.isArray(c.config.approvers) && Array.isArray(c.approvals) && c.contribution)) setPreviewCampaigns(normalizePreviewCampaigns(saved));
      } catch { /* Restore the original examples if a local preview draft is unreadable. */ }
    },0);
    return () => clearTimeout(timer);
  },[]);
  const [previewTime, setPreviewTime] = useState(() => Math.floor(Date.now() / 1000));
  const state: State | null = isLocalPreview ? { ok: true, contractId: "Local example, no deployed contract", viewer: PREVIEW_WALLET, now: String(previewTime), campaigns: id ? previewCampaigns.filter(c => c.id === id) : previewCampaigns } : loadedState;
  const [confirm, setConfirm] = useState<{ label: string; action: () => Promise<Result>; created?: boolean; preview?: () => boolean } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!confirm) return;
    const previousFocus = openerRef.current;
    const dialog = dialogRef.current;
    dialog?.focus({ preventScroll: true });
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) { setConfirm(null); setError(""); return; }
      if (event.key !== "Tab" || !dialog) return;
      const buttons = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]'));
      const first = buttons[0]; const last = buttons.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown",handleKey);
    return () => { document.removeEventListener("keydown",handleKey); previousFocus?.focus({ preventScroll: true }); };
  },[confirm,busy]);
  const refresh = useCallback(async () => {
    if (isLocalPreview) { setPreviewTime(Math.floor(Date.now()/1000)); return; }
    try { setState(await campaignState(id, before)); }
    catch { setState({ ok: false, error: "Could not read campaign state. Refresh to retry." }); }
  }, [id, before]);
  useEffect(() => { if (isLocalPreview) return; const initialLoad = setTimeout(() => void refresh(), 0); const interval = setInterval(() => { void refresh(); }, 15000); return () => { clearTimeout(initialLoad); clearInterval(interval); }; }, [refresh]);
  const run: Run = (label, action, created, preview) => {
    if (submission.locked) return;
    // The modal commit disables its opener and can blur it before the effect.
    openerRef.current = typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDone(null); setLocalDone(""); setError(""); setConfirm({ label, action, created, preview });
  };
  async function execute() {
    if (!confirm || busy || submission.locked) return;
    if (isLocalPreview) {
      setError(""); setLocalDone("");
      try {
        if (!confirm.preview?.()) {
          setError(copy.failed);
          return;
        }
        setConfirm(null);
        setLocalDone(copy.saved);
      } catch {
        setError(copy.unavailable);
      }
      return;
    }
    setBusy(true); setError("");
    try {
      const result = await submission.run(confirm.action);
      if (!result) { setConfirm(null); return; }
      if (!result.ok) { setError(result.error); if (result.pending) setConfirm(null); }
      else { setDone({ link: result.link, id: confirm.created ? result.value : undefined }); setConfirm(null); await refresh(); }
    } catch { setError("Confirmation interrupted. Refresh and check campaign state before retrying."); }
    finally { setBusy(false); }
  }
  const savePreview = (campaigns: Campaign[]) => {
    try { if (!saveCampaignPreview(sessionStorage, campaigns)) return false; }
    catch { return false; }
    setPreviewCampaigns(campaigns);
    return true;
  };
  const updatePreview = (campaign: Campaign) => savePreview(previewCampaigns.map(c => c.id === campaign.id ? campaign : c));
  const visibleCampaigns = state?.ok ? state.campaigns.filter(c => filter === "All" || filter === "My campaigns" && c.config.creator === state.viewer || filter === "Funding" && c.state === "Funding" && BigInt(state.now) < BigInt(c.config.funding_deadline) || filter === "In review" && (c.state === "PendingProof" || c.state === "Funding" && BigInt(state.now) >= BigInt(c.config.funding_deadline)) || filter === "Completed" && (c.state === "Released" || c.state === "Closed")) : [];
  return <div className={styles.screen} style={{ fontFamily: T.fontSans }}>
    <SubmissionStatusPanel guard={submission} onRefresh={refresh} />
    <header className={styles.appBar}><button type="button" onClick={goBack} aria-label={accountCopy(locale).back}>{Ico.back({ size: 20 })}</button><strong>Donation campaigns</strong><span>Testnet</span></header>
    <div className={styles.body}>
      <header className={`${styles.hero} ${id ? styles.detailHero : ""}`}><div><span className={styles.eyebrow}>Crowdfunding · Testnet</span><h1>Give with clarity.</h1><p>{id ? "Funds stay in escrow until proof receives two wallet approvals." : "Choose a cause. See the terms before you give. Funds stay in escrow until proof receives two wallet approvals."}</p></div><Image className={styles.doodle} width={112} height={112} src="/illustrations/giving.png" alt="Two people sharing a heart" /></header>
      <p className={styles.previewNote}>{isLocalPreview ? "Example data · Local preview · No real donations" : "Valueless Testnet XLM · Managed Salapi wallets"}</p>
      <div className={styles.toolbar}><Link href="/transparency">{Ico.link({ size: 15 })} Public proof</Link>{id && <Link href="/campaigns?mode=testnet">All campaigns</Link>}<button className={styles.textButton} onClick={() => void refresh()} disabled={busy}>{Ico.refresh({ size: 15 })} Refresh</button></div>
      {!state && <div aria-label="Loading campaigns" className={styles.skeleton} />}
      {state && !state.ok && <div className={styles.error} role="alert"><strong>Campaigns could not load.</strong><p>{state.error}</p><button className={styles.textButton} onClick={() => void refresh()}>Try again</button></div>}
      {state?.ok && <>
        {state.viewer ? (!id || initialCreate) && <CreateCampaign run={run} busy={busy || !!confirm} initialCreate={initialCreate} onPreviewCreate={campaign => savePreview([campaign,...previewCampaigns])} />
          : <div className={styles.notice}><p>Explore campaign terms and proof publicly. Sign in to give or manage a campaign.</p><Link className={styles.textButton} href={`/signin?next=${encodeURIComponent(initialCreate ? "/campaigns?create=1" : `/campaigns${id ? `?id=${id}` : "?mode=testnet"}`)}`}>Sign in →</Link></div>}
        {!id && <nav aria-label="Filter campaigns" className={styles.filters}>{["All", "Funding", "In review", "My campaigns", "Completed"].map(label => <button key={label} aria-pressed={filter === label} className={`${styles.filter} ${filter === label ? styles.filterActive : ""}`} onClick={() => setFilter(label)}>{label}</button>)}</nav>}
        {visibleCampaigns.length === 0 && <div className={styles.empty}><h2>{id ? "Campaign not found" : "No campaigns in this view"}</h2><p className={styles.muted}>{id ? "Return to all campaigns to choose another cause." : "Choose another filter, or start a cause with clear terms."}</p></div>}
        {visibleCampaigns.map(c => <CampaignCard key={c.id} c={c} now={BigInt(state.now)} viewer={state.viewer} busy={busy || !!confirm} run={run} detail={!!id} onPreviewUpdate={updatePreview} />)}
        {id && !initialCreate && state.viewer && <Link className={styles.startLink} href="/campaigns?create=1">{Ico.plus({ size: 18 })}<span>Start a campaign</span>{Ico.chev({ size: 17 })}</Link>}
        {!id && <div style={{ display: "flex", gap: 12 }}>{before !== "0" && <button onClick={() => setBefore("0")}>Newest campaigns</button>}
          {state.campaigns.length === 10 && <button onClick={() => setBefore(state.campaigns.at(-1)!.id)}>Older campaigns</button>}</div>}
        {!isLocalPreview && <details className={styles.terms}><summary>View the D4 Testnet contract</summary><a className={styles.address} href={`https://stellar.expert/explorer/testnet/contract/${state.contractId}`} target="_blank" rel="noreferrer">{state.contractId}</a></details>}
      </>}
      {localDone && <SuccessMotion key={localDone} title={copy.title}>{localDone}</SuccessMotion>}
      {done && <SuccessMotion title="Testnet transaction confirmed"><a href={done.link} target="_blank" rel="noreferrer">View transaction</a>{done.id && <Link href={`/campaigns?id=${done.id}`}>Open created campaign #{done.id}</Link>}</SuccessMotion>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <p className={styles.muted}>If timely approval is incomplete, each donor can claim their full recorded donation after review closes. These campaigns have their own rules, separate from Disaster Vault.</p>
      <footer className={styles.footer}><PoweredByStellar /><small>Public proof on Stellar Testnet.</small></footer>
    </div>
    {confirm && <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Confirm campaign transaction" style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(11,18,32,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, boxSizing: "border-box", overflowY: "auto" }}>
      <Card style={{ maxWidth: 420, width: "100%", minHeight: 0, maxHeight: "100%", boxSizing: "border-box", overflowY: "auto", overscrollBehavior: "contain" }}><div style={group}><span className={styles.eyebrow}>{isLocalPreview ? "Local preview" : "Testnet transaction"}</span><h2 style={{ fontSize: 24, fontWeight: 750, letterSpacing: "-.04em" }}>Review before confirming</h2><p className={styles.muted} style={{ overflowWrap: "anywhere" }}>{confirm.label}</p>
        {error && <p role="alert">{error}</p>}<Btn disabled={busy} loading={busy} onClick={() => void execute()}>{busy ? "Confirming…" : isLocalPreview ? "Confirm local example" : "Confirm transaction"}</Btn>
        <Btn kind="secondary" disabled={busy} onClick={() => { setConfirm(null); setError(""); }}>Cancel</Btn>
      </div></Card>
    </div>}
  </div>;
}
