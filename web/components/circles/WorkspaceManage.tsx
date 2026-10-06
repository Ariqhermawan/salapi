"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { workspaceBindD4, workspaceComplete, workspacePostUpdate } from "@/app/circle-workspace-actions";
import { WORKSPACE_MEDIA_LIMIT, type WorkspaceMedia, type WorkspaceSnapshot, type WorkspaceUpdate } from "@/lib/circles/workspace";
import { mediaFor, useWorkspace, useWorkspaceCopy, WorkspaceFrame, WorkspaceImage, workspaceDate } from "./WorkspaceCommon";
import styles from "./Workspace.module.css";

export default function WorkspaceManage({ initialSnapshot, campaignId }: { initialSnapshot: WorkspaceSnapshot; campaignId: string }) {
  const state = useWorkspace(initialSnapshot, campaignId);
  const { snapshot, busy, run, setError } = state;
  const c = useWorkspaceCopy();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<WorkspaceUpdate["kind"]>("progress");
  const [consent, setConsent] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploaded, setUploaded] = useState<WorkspaceMedia[]>([]);
  const [uploadText, setUploadText] = useState("");
  const [contractId, setContractId] = useState("");
  const [completionConfirmed, setCompletionConfirmed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef<string | null>(null);
  const campaign = snapshot.campaigns.find(item => item.id === campaignId);
  const path = `/circles/workspace/${campaignId}`;
  const owner = campaign && snapshot.actor?.id === campaign.organizerId;
  const updates = snapshot.updates.filter(update => update.campaignId === campaignId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const delivery = updates.some(update => update.kind === "delivery" && update.mediaIds.length > 0);

  function chooseFiles(selected: FileList | null) {
    const next = Array.from(selected ?? []);
    if (next.length > 4 || next.some(file => file.size > WORKSPACE_MEDIA_LIMIT || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setError(c("Choose at most four JPEG, PNG or WebP images, each at most 4 MB.", "Pilih maksimal empat foto JPEG, PNG atau WebP, masing-masing maksimal 4 MB."));
      if (inputRef.current) inputRef.current.value = "";
      setFiles([]); return;
    }
    setFiles(next);
    setUploaded([]);
    setError("");
  }

  async function publishUpdate(event: FormEvent) {
    event.preventDefault();
    if (!consent) { setError(c("Confirm permission to publish these updates and photos.", "Konfirmasi izin publikasi update dan foto.")); return; }
    if (kind === "delivery" && files.length === 0 && uploaded.length === 0) { setError(c("Delivery evidence needs at least one photo.", "Bukti penyaluran memerlukan minimal satu foto.")); return; }
    const saved = await run(async () => {
      const media = [...uploaded];
      for (let index = media.length; index < files.length; index += 1) {
        setUploadText(c(`Uploading photo ${index + 1} of ${files.length}…`, `Mengunggah foto ${index + 1} dari ${files.length}…`));
        const data = new FormData(); data.append("file", files[index]); data.append("publicMediaConsent", "true");
        const response = await fetch("/api/circles/media", { method: "POST", body: data });
        const result = await response.json() as { ok: true; media: WorkspaceMedia } | { ok: false; error: string };
        if (!response.ok || !result.ok) return { ok: false as const, error: !result.ok ? result.error : c("The photo could not be uploaded.", "Foto gagal diunggah.") };
        media.push(result.media); setUploaded([...media]);
      }
      setUploadText(c("Publishing organizer update…", "Mempublikasikan update organizer…"));
      requestIdRef.current ??= crypto.randomUUID();
      return workspacePostUpdate({ campaignId, title, body, kind, mediaIds: media.map(item => item.id), publicMediaConsent: true, requestId: requestIdRef.current });
    }, c("Update published. Followers can now read it in this workspace.", "Update dipublikasikan. Pengikut dapat membacanya di workspace ini."));
    setUploadText("");
    if (saved) { requestIdRef.current = null; setTitle(""); setBody(""); setFiles([]); setUploaded([]); setConsent(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  async function bindContract(event: FormEvent) {
    event.preventDefault();
    await run(() => workspaceBindD4(campaignId, contractId), c("D4 campaign linked after server verification. No transaction was submitted.", "Campaign D4 dihubungkan setelah verifikasi server. Tidak ada transaksi dikirim."));
  }

  return <WorkspaceFrame {...state} backHref={path} backLabel={c("Campaign", "Campaign")}>
    {!campaign ? <section className={styles.empty}><h1>{c("Campaign unavailable", "Campaign tidak tersedia")}</h1><Link href="/circles/workspace">{c("Back to workspace", "Kembali ke workspace")}</Link></section> : !owner ? <section className={styles.empty}><h1>{c("Organizer access required", "Akses organizer diperlukan")}</h1><p>{c("Only the organizer who published this campaign can post updates, upload delivery evidence or mark it complete. Switch to the organizer simulation locally, or sign in with the real owner's account.", "Hanya organizer yang mempublikasikan campaign ini dapat menambah update, mengunggah bukti penyaluran atau menyelesaikannya. Gunakan peran simulasi organizer di lokal, atau masuk dengan akun pemilik yang sebenarnya.")}</p><Link href={path}>{c("View public campaign", "Lihat campaign publik")}</Link></section> : <>
      <header className={styles.pageHeader}><span className={styles.eyebrow}>{c("Organizer workspace", "Workspace organizer")}</span><h1>{c("Keep donors informed.", "Kabari para donatur.")}</h1><p>{campaign.title}</p></header>
      <WorkspaceImage media={mediaFor(snapshot, campaign.coverMediaId)} alt={campaign.title} className={styles.manageCover} />
      <section className={styles.warmCard}><div className={styles.sectionHeader}><h2>{c("Delivery checklist", "Tahapan penyaluran")}</h2><span className={styles.status}>{campaign.status === "completed" ? c("Completed by organizer", "Diselesaikan organizer") : c("In progress", "Berjalan")}</span></div><ol className={styles.checklist}><li>{c("Campaign published with a cover photo", "Campaign dipublikasikan dengan foto sampul")}</li><li>{updates.length > 0 ? `${updates.length} ${c("update(s) published", "update dipublikasikan")}` : c("Publish progress and spending updates", "Publikasikan update progres dan pengeluaran")}</li><li>{delivery ? c("Delivery photos published", "Foto penyaluran dipublikasikan") : c("Add delivery evidence with at least one photo", "Tambahkan bukti penyaluran dengan minimal satu foto")}</li><li>{campaign.status === "completed" ? c("Eligible donors can now leave a review", "Donatur yang memenuhi syarat dapat memberi review") : c("Complete the campaign to open donor reviews", "Selesaikan campaign untuk membuka review donatur")}</li></ol><p>{c("These are organizer records. They do not replace D4's proof hash, configured wallet approvals or release transaction.", "Ini adalah catatan organizer. Tidak menggantikan hash bukti D4, persetujuan wallet yang ditentukan atau transaksi pencairan.")}</p></section>
      {snapshot.mode === "testnet" ? <p className={styles.modeNotice}>{c("Testnet completion additionally requires a matching D4 contract in Released state. Submit its immutable proof, obtain the configured approvals and release through D4 first. The server verifies this before opening donor reviews.", "Penyelesaian Testnet juga memerlukan kontrak D4 yang cocok dan berstatus Released. Kirim bukti tetapnya, dapatkan persetujuan yang ditentukan dan lakukan pencairan lewat D4 terlebih dahulu. Server memverifikasinya sebelum membuka review donatur.")}</p> : null}
      {campaign.status === "completed" ? <section className={styles.card}><h2>{c("Campaign completed", "Campaign selesai")}</h2><p>{c("Published updates remain readable. Completion does not transfer funds or confirm third-party approval. Eligible donors can leave one review each.", "Update tetap dapat dibaca. Penyelesaian tidak memindahkan dana atau mengonfirmasi persetujuan pihak ketiga. Donatur yang memenuhi syarat dapat memberi satu review.")}</p><Link className={styles.primary} href={`${path}/organizer`}>{c("View organizer history and ratings", "Lihat riwayat dan rating organizer")}</Link></section> : <form className={styles.card} onSubmit={publishUpdate}>
        <h2>{c("Publish a campaign update", "Publikasikan update campaign")}</h2><p>{c("Explain what happened, how contributions were used and what comes next. Photos become public campaign content.", "Jelaskan kegiatan, penggunaan dukungan dan langkah berikutnya. Foto menjadi konten campaign publik.")}</p>
        <label className={styles.field}>{c("Update type", "Jenis update")}<select value={kind} onChange={event => setKind(event.target.value as WorkspaceUpdate["kind"])} disabled={busy}><option value="progress">{c("Progress", "Progres")}</option><option value="spend">{c("Spending", "Pengeluaran")}</option><option value="delivery">{c("Delivery evidence", "Bukti penyaluran")}</option></select></label>
        <label className={styles.field}>{c("Update title", "Judul update")}<input value={title} onChange={event => setTitle(event.target.value)} minLength={3} maxLength={100} required disabled={busy} /></label>
        <label className={styles.field}>{c("What happened?", "Apa yang telah dilakukan?")}<textarea value={body} onChange={event => setBody(event.target.value)} minLength={10} maxLength={4000} rows={5} required disabled={busy} /></label>
        <label className={styles.field}>{c("Update photos · up to 4", "Foto update · maksimal 4")}<input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => chooseFiles(event.target.files)} disabled={busy} /><span>{c("JPEG, PNG or WebP. Maximum 4 MB each. Delivery evidence requires a photo.", "JPEG, PNG atau WebP. Maksimal 4 MB per foto. Bukti penyaluran wajib memiliki foto.")}</span></label>
        {files.length ? <ul className={styles.fileList}>{files.map((file, index) => <li key={`${file.name}-${index}`}><span>{file.name}</span><small>{uploaded[index] ? c("Uploaded, ready to publish", "Diunggah, siap dipublikasikan") : `${Math.ceil(file.size / 1024)} KB`}</small></li>)}</ul> : null}
        <label className={styles.checkbox}><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy} required /><span>{c("I have permission to publish these photos and updates. I have removed identity documents and private beneficiary information.", "Saya memiliki izin mempublikasikan foto dan update ini. Saya telah menghapus dokumen identitas dan informasi pribadi penerima.")}</span></label>
        {uploadText ? <p role="status" className={styles.hint}>{uploadText}</p> : null}
        <button className={styles.primary} type="submit" disabled={busy || !consent || Boolean(snapshot.unavailable)}>{c("Publish update", "Publikasikan update")}</button>
      </form>}
      {campaign.status !== "completed" ? <section className={styles.card}><h2>{c("Finish delivery", "Selesaikan penyaluran")}</h2><p>{delivery ? c("Delivery evidence has been published. Completion opens reviews to eligible donors and is final for this workspace campaign.", "Bukti penyaluran sudah dipublikasikan. Penyelesaian membuka review bagi donatur yang memenuhi syarat dan bersifat final untuk campaign workspace ini.") : c("Publish delivery evidence with a photo first. The completion button stays disabled until that record exists.", "Publikasikan bukti penyaluran dengan foto terlebih dahulu. Tombol penyelesaian aktif setelah catatan itu ada.")}</p><label className={styles.checkbox}><input type="checkbox" checked={completionConfirmed} onChange={event => setCompletionConfirmed(event.target.checked)} disabled={busy || !delivery} /><span>{c("I confirm that this campaign's delivery is complete. This statement is mine, not a verified D4 approval.", "Saya menyatakan penyaluran campaign ini selesai. Ini adalah pernyataan saya, bukan persetujuan D4 terverifikasi.")}</span></label><button type="button" className={styles.primary} disabled={busy || !delivery || !completionConfirmed || Boolean(snapshot.unavailable)} onClick={() => void run(() => workspaceComplete(campaignId), c("Campaign completed. Eligible donors can now publish a rating and review.", "Campaign selesai. Donatur yang memenuhi syarat dapat mempublikasikan rating dan review."))}>{c("Mark delivery complete", "Tandai penyaluran selesai")}</button></section> : null}
      <section className={styles.card}><h2>{c("D4 funding connection", "Hubungan pendanaan D4")}</h2>{campaign.contractCampaignId ? <><p>{c("Linked contract campaign ID", "ID campaign kontrak terhubung")}: <strong>{campaign.contractCampaignId}</strong></p><Link className={styles.textLink} href={`/campaigns?mode=testnet&id=${encodeURIComponent(campaign.contractCampaignId)}`}>{c("Open D4 proof and release flow", "Buka alur bukti dan pencairan D4")}</Link></> : snapshot.mode === "local" ? <p>{c("No contract can be linked in this local simulation. Local support does not fund on-chain escrow.", "Kontrak tidak dapat dihubungkan di simulasi lokal ini. Dukungan lokal tidak mendanai escrow on-chain.")}</p> : <form onSubmit={bindContract}><p>{c("Create a D4 campaign separately with the exact same title and organizer allowance, then link its ID here. The server checks ownership and immutable terms before accepting it. Linking does not submit or sign a transaction.", "Buat campaign D4 secara terpisah dengan judul dan imbalan organizer yang sama persis, lalu hubungkan ID-nya di sini. Server memeriksa kepemilikan dan ketentuan tetap sebelum menerimanya. Menghubungkan tidak mengirim atau menandatangani transaksi.")}</p><Link className={styles.textLink} href="/campaigns?mode=testnet&create=1">{c("Open D4 campaign creation", "Buka pembuatan campaign D4")}</Link><label className={styles.field}>{c("D4 contract campaign ID", "ID campaign kontrak D4")}<input value={contractId} onChange={event => setContractId(event.target.value)} inputMode="numeric" required disabled={busy} /></label><button className={styles.secondary} type="submit" disabled={busy || Boolean(snapshot.unavailable)}>{c("Verify and link D4 campaign", "Verifikasi dan hubungkan campaign D4")}</button></form>}</section>
      <section className={styles.card}><h2>{c("Published updates", "Update yang dipublikasikan")}</h2>{updates.length ? <ul className={styles.updateList}>{updates.map(update => <li key={update.id}><strong>{update.title}</strong><small>{update.kind} · {workspaceDate(update.createdAt)} · {update.mediaIds.length} {c("photo(s)", "foto")}</small></li>)}</ul> : <p>{c("No update yet.", "Belum ada update.")}</p>}<Link className={styles.textLink} href={path}>{c("See the donor view", "Lihat tampilan donatur")}</Link></section>
    </>}
  </WorkspaceFrame>;
}
