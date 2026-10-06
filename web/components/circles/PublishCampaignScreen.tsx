"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useT } from "@/components/I18nProvider";
import { CATEGORY_LABEL, type CircleCategory } from "@/lib/circles/types";
import type { WorkspaceMedia, WorkspaceSnapshot } from "@/lib/circles/workspace";
import { workspacePublish } from "@/app/circle-workspace-actions";
import { CURRENCY, formatLocal, pesoFromLocal } from "@/lib/ui/currency";
import { circlesCategory } from "@/lib/i18n/revamp-circles";
import styles from "./PublishCampaign.module.css";

const categories = Object.keys(CATEGORY_LABEL) as CircleCategory[];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export default function PublishCampaignScreen({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const router = useRouter();
  const { locale, currency } = useT();
  const copy = (id: string, en: string) => locale === "id" ? id : en;
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<CircleCategory>("community");
  const [goal, setGoal] = useState("");
  const [fee, setFee] = useState(0);
  const [media, setMedia] = useState<WorkspaceMedia | null>(null);
  const [consent, setConsent] = useState(false);
  const [uploadConsent, setUploadConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const submitting = useRef(false);
  const requestId = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // Metadata/display conversion only. Real D4 amounts use exact stroops in its own flow.
  const goalPHP = Math.round(pesoFromLocal(Number(goal), currency) * 100) / 100;
  const blocked = Boolean(snapshot.unavailable || !snapshot.actor);

  function go(next: number) {
    setError("");
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function validateDetails() {
    if (title.trim().length < 6 || title.trim().length > 90 || new TextEncoder().encode(title.trim()).length > 120) return copy("Judul harus 6-90 karakter dan maksimal 120 byte UTF-8 agar cocok dengan D4.", "Use a title with 6-90 characters, up to 120 UTF-8 bytes for D4 compatibility.");
    if (story.trim().length < 40 || story.trim().length > 5000) return copy("Ceritakan kebutuhan dan rencana penyaluran, minimal 40 karakter.", "Describe the need and delivery plan in at least 40 characters.");
    if (location.trim().length < 2 || location.trim().length > 100) return copy("Isi lokasi campaign, maksimal 100 karakter.", "Enter a campaign location, up to 100 characters.");
    if (!/^\d+(\.\d{1,2})?$/.test(goal) || !Number.isFinite(goalPHP) || goalPHP < 1 || goalPHP > 1e8) return copy("Isi target setara PHP 1-100 juta, maksimal dua angka desimal.", "Enter a goal equivalent to PHP 1-100 million, with up to two decimal places.");
    return "";
  }
  async function upload(file: File | undefined) {
    if (!file || uploading || pending) return;
    setMedia(null);
    setUploadError("");
    if (!uploadConsent) { setUploadError(copy("Setujui publikasi foto terlebih dahulu.", "Consent to public campaign media first.")); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > MAX_IMAGE_BYTES || file.size === 0) {
      setUploadError(copy("Pilih JPG, PNG, atau WebP, maksimal 4 MB. SVG dan dokumen tidak diterima.", "Choose JPG, PNG or WebP, up to 4 MB. SVG and documents are not accepted."));
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("publicMediaConsent", "true");
      const response = await fetch("/api/circles/media", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.media?.id) throw new Error(result.error || copy("Foto gagal diunggah. Coba lagi.", "The photo could not be uploaded. Try again."));
      setMedia(result.media);
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : copy("Upload gagal. Periksa koneksi Anda.", "Upload failed. Check your connection."));
    } finally { setUploading(false); }
  }
  async function publish() {
    if (submitting.current || blocked) return;
    const invalid = validateDetails();
    if (invalid) { go(0); setError(invalid); return; }
    if (!media || !consent) { setError(copy("Foto dan persetujuan publikasi wajib diisi.", "A photo and publication consent are required.")); return; }
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      requestId.current ??= crypto.randomUUID();
      const result = await workspacePublish({ requestId: requestId.current, title, story, location, category, goalPHP, allowancePct: fee, coverMediaId: media.id, publicMediaConsent: true });
      if (!result.ok) { setError(result.error); return; }
      if (!result.value?.id) { setError(copy("Status publikasi belum terkonfirmasi. Periksa daftar campaign sebelum mencoba lagi.", "Publication was not confirmed. Check the campaign list before retrying.")); return; }
      router.push(`/circles/workspace/${result.value.id}/manage`);
    } catch {
      setError(copy("Status publikasi belum terkonfirmasi. Periksa daftar campaign sebelum mencoba lagi.", "Publication was not confirmed. Check the campaign list before retrying."));
    } finally { setPending(false); submitting.current = false; }
  }

  return <div className={styles.screen}>
    <nav className={styles.top}><Link href="/circles/workspace">{copy("← Campaign komunitas", "← Community campaigns")}</Link><span>{snapshot.mode === "local" ? copy("Workspace lokal", "Local workspace") : "Testnet"}</span></nav>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>{copy("Dari niat baik, menjadi rencana nyata", "Turn care into a clear plan")}</p>
      <h1>{copy("Buka campaign Anda.", "Start your campaign.")}</h1>
      <p>{copy("Unggah foto, jelaskan pembagian, lalu kabarkan progres kepada donatur.", "Upload a photo, explain the allocation, then keep donors informed.")}</p>
      <p className={styles.boundary}>{snapshot.mode === "local" ? copy("Tersimpan di server localhost, bukan dipublikasikan ke salapi.app. Tidak ada pembayaran atau KYC nyata.", "Saved on the localhost server, not published to salapi.app. No real payment or KYC.") : copy("Publikasi cerita tidak otomatis membuka donasi. Hubungkan campaign D4 Testnet yang sah dari dashboard organizer.", "Publishing a story does not open funding automatically. Bind a valid D4 Testnet campaign from the organizer dashboard.")}</p>
    </header>
    {blocked ? <section className={styles.notice} role="status"><h2>{copy("Publikasi belum tersedia", "Publication unavailable")}</h2><p>{snapshot.unavailable || copy("Masuk dengan akun Anda untuk membuka campaign.", "Sign in with your account to open a campaign.")}</p><Link href="/signin">{copy("Buka halaman masuk", "Open sign in")}</Link></section> : <>
      <ol className={styles.steps} aria-label={copy("Langkah publikasi", "Publication steps")}>
        {[copy("Cerita & target", "Story & goal"), copy("Foto campaign", "Campaign photo"), copy("Tinjau & publish", "Review & publish")].map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} data-active={step >= index}><span>{index + 1}</span>{label}</li>)}
      </ol>
      <section className={styles.card}>
        <h2 ref={heading} tabIndex={-1}>{step === 0 ? copy("Apa yang ingin Anda bantu?", "What would you like to help?") : step === 1 ? copy("Beri wajah pada campaign Anda.", "Give your campaign a face.") : copy("Jelas sebelum dipublikasikan.", "Clear before publication.")}</h2>
        {step === 0 ? <div key="details" className={styles.form}>
          <label>{copy("Judul campaign", "Campaign title")}<input maxLength={90} value={title} onChange={event => setTitle(event.target.value)} autoComplete="off" placeholder={copy("Perawatan kucing rescue di Bandung", "Care for rescued cats in Bandung")} /></label>
          <label>{copy("Cerita dan rencana penyaluran", "Story and delivery plan")}<textarea rows={6} maxLength={5000} value={story} onChange={event => setStory(event.target.value)} placeholder={copy("Siapa penerima manfaat, apa kebutuhannya, dan bagaimana Anda membuktikan penyalurannya?", "Who benefits, what do they need, and how will you document delivery?")} /></label>
          <label>{copy("Lokasi", "Location")}<input maxLength={100} value={location} onChange={event => setLocation(event.target.value)} placeholder="Bandung, Indonesia" /></label>
          <label>{copy("Kategori", "Category")}<select value={category} onChange={event => setCategory(event.target.value as CircleCategory)}>{categories.map(item => <option key={item} value={item}>{circlesCategory(locale, item)}</option>)}</select></label>
          <label>{copy("Target tampilan", "Display goal")} · {CURRENCY[currency].code}<input inputMode="decimal" autoComplete="off" value={goal} onChange={event => setGoal(event.target.value)} placeholder="500000" /><small>{copy("Konversi ilustratif, bukan tagihan pembayaran.", "Illustrative conversion, not a payment quote.")}</small></label>
          <label>{copy("Alokasi operasional organizer", "Organizer operations allocation")}<select value={fee} onChange={event => setFee(Number(event.target.value))}>{Array.from({ length: 11 }, (_, value) => <option key={value} value={value}>{value}%</option>)}</select></label>
          <div className={styles.allocation}><div><span>{copy("Untuk penerima", "To beneficiary")}</span><strong>{100 - fee}%</strong></div><div><span>{copy("Operasional organizer", "Organizer operations")}</span><strong>{fee}%</strong></div><small>{copy("Pembagian dikunci setelah publish. Tidak ada fee platform tambahan di model ini. Ketentuan D4 harus cocok sebelum donasi dibuka.", "Allocation is locked after publication. This model adds no platform fee. D4 terms must match before funding is available.")}</small></div>
        </div> : step === 1 ? <div key="photo" className={styles.form}>
          <p>{copy("Gunakan foto yang Anda berhak publikasikan. Jangan unggah KTP, rekam medis, data rekening, atau wajah anak tanpa izin.", "Use a photo you have permission to publish. Do not upload identity documents, medical records, bank details, or children without consent.")}</p>
          <label className={styles.check}><input type="checkbox" checked={uploadConsent} onChange={event => setUploadConsent(event.target.checked)} disabled={uploading} />{copy("Saya berhak mengunggah dan mempublikasikan foto ini.", "I have permission to upload and publish this photo.")}</label>
          <label className={styles.upload}>{copy("Unggah foto campaign", "Upload campaign photo")}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!uploadConsent || uploading || pending} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} /><small>JPG, PNG, WebP · {copy("maksimal 4 MB", "up to 4 MB")}</small></label>
          {uploading ? <p role="status">{copy("Mengunggah dan memeriksa foto…", "Uploading and checking photo…")}</p> : null}
          {uploadError ? <p className={styles.error} role="alert">{uploadError}</p> : null}
          {media ? <figure className={styles.photo}><Image unoptimized src={media.url} width={768} height={480} alt={copy("Foto campaign yang diunggah", "Uploaded campaign photo")} /><figcaption><strong>{copy("Upload tersimpan", "Upload saved")}</strong> · {media.name}<small>SHA-256: {media.sha256}</small></figcaption></figure> : null}
        </div> : <div key="review" className={styles.form}>
          {media ? <figure className={styles.photo}><Image unoptimized src={media.url} width={768} height={480} alt={title} /></figure> : null}
          <h3>{title}</h3><p>{location} · {circlesCategory(locale, category)}</p><p className={styles.story}>{story}</p>
          <dl className={styles.summary}><div><dt>{copy("Organizer", "Organizer")}</dt><dd>{snapshot.actor?.name}</dd></div><div><dt>{copy("Target tampilan", "Display goal")}</dt><dd>{formatLocal(goalPHP, currency)}</dd></div><div><dt>{copy("Penerima / organizer", "Beneficiary / organizer")}</dt><dd>{100 - fee}% / {fee}%</dd></div></dl>
          <p className={styles.boundary}>{copy("Identitas belum diverifikasi. Upload bukan persetujuan bukti D4. Setelah penyaluran, donatur yang memenuhi syarat dapat memberikan review.", "Identity is unverified. Uploading is not D4 proof approval. After delivery, eligible donors can leave a review.")}</p>
          <label className={styles.check}><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={pending} />{copy("Saya menyetujui publikasi cerita dan foto serta pembagian yang tercantum.", "I consent to publishing this story and photo with the stated allocation.")}</label>
        </div>}
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        <div className={styles.actions}>{step > 0 ? <button type="button" disabled={pending || uploading} onClick={() => go(step - 1)}>{copy("Kembali", "Back")}</button> : null}<button type="button" className={styles.primary} disabled={pending || uploading || (step === 1 && !media) || (step === 2 && !consent)} onClick={() => {
          if (step === 2) { void publish(); return; }
          if (step === 0) { const invalid = validateDetails(); if (invalid) { setError(invalid); return; } }
          go(step + 1);
        }}>{pending ? copy("Menyimpan…", "Saving…") : step === 2 ? (snapshot.mode === "local" ? copy("Publish ke workspace lokal", "Publish to local workspace") : copy("Publish campaign", "Publish campaign")) : copy("Lanjut", "Continue")}</button></div>
      </section>
    </>}
    <footer className={styles.footer}><Link href="/circles/create">{copy("Hanya ingin menyiapkan draft?", "Only preparing a draft?")}</Link></footer>
  </div>;
}
