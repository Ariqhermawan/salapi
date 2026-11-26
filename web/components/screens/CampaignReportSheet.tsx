"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelReportUploads, createReportUploadTickets, feedbackIdentity, submitFeedback } from "@/app/feedback-actions";
import { publicCampaignForFeedback } from "@/app/campaign-actions";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import styles from "./CampaignReportSheet.module.css";

const reasons = [
  ["fraud", "Fraud"],
  ["scam", "Scam"],
  ["misleading_story", "Misleading story"],
  ["money_not_used", "Money not used as promised"],
  ["other", "Something else"],
] as const;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

export default function CampaignReportSheet({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [identity, setIdentity] = useState<{ loading: boolean; ownerId: string | null; unavailable: boolean }>({ loading: true, ownerId: null, unavailable: false });
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState<string>("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const [uploadProgress, setUploadProgress] = useState("");
  const previews = useMemo(() => files.map(file => URL.createObjectURL(file)), [files]);

  useEffect(() => () => previews.forEach(url => URL.revokeObjectURL(url)), [previews]);
  useEffect(() => {
    let active = true;
    void Promise.all([feedbackIdentity(), publicCampaignForFeedback(campaignId)]).then(([auth, target]) => {
      if (!active) return;
      setIdentity({ loading: false, ownerId: auth.ok && auth.signedIn ? auth.ownerId ?? null : null, unavailable: !auth.ok });
      if (target.ok) setTitle(target.campaign.title);
      else setError(target.error);
    }).catch(() => { if (active) setIdentity({ loading: false, ownerId: null, unavailable: true }); });
    return () => { active = false; };
  }, [campaignId]);

  function addFiles(input: FileList | null) {
    if (!input?.length) return;
    const selected = Array.from(input);
    const next = [...files, ...selected];
    const total = next.reduce((sum, file) => sum + file.size, 0);
    if (next.length > 5) { setError("You can attach up to 5 photos."); return; }
    if (selected.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size <= 0 || file.size > MAX_PHOTO_BYTES)) {
      setError("Choose JPG, PNG, or WebP photos. Each photo must be 2 MB or smaller."); return;
    }
    if (total > MAX_TOTAL_BYTES) { setError("Keep the total photo size under 5 MB."); return; }
    setFiles(next); setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles(current => current.filter((_, currentIndex) => currentIndex !== index));
    setError("");
  }

  function close() { router.back(); }

  function send() {
    if (!identity.ownerId) { setError("Sign in to send a report."); return; }
    if (!reason) { setError("Choose a reason for your report."); return; }
    if (message.trim().length < 10) { setError("Tell us what happened (at least 10 characters)."); return; }
    if (files.length < 1) { setError("Add at least one photo."); return; }
    if (pending) return;
    const ownerId = identity.ownerId;
    start(async () => {
      setError(""); setUploadProgress("Preparing private photo upload…");
      let paths: string[] = [];
      try {
        const prepared = await createReportUploadTickets(ownerId, campaignId, files.map(file => ({ type: file.type, size: file.size })));
        if (!prepared.ok) { setError(prepared.error); setUploadProgress(""); return; }
        paths = prepared.tickets.map(ticket => ticket.path);
        const supabase = createSupabaseBrowser();
        for (const [index, ticket] of prepared.tickets.entries()) {
          setUploadProgress(`Uploading photo ${index + 1} of ${prepared.tickets.length}…`);
          const file = files[index];
          const { error: uploadError } = await supabase.storage.from("campaign-report-evidence")
            .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type, upsert: false });
          if (uploadError) throw new Error("One of the photos could not be uploaded.");
        }
        setUploadProgress("Saving your report…");
        const result = await submitFeedback({ expectedOwnerId: ownerId, kind: "campaign_report", category: reason,
          campaignId, message, evidencePaths: paths });
        if (!result.ok) { await cancelReportUploads(ownerId, campaignId, paths); setError(result.error); setUploadProgress(""); return; }
        setSaved(true); setUploadProgress("");
      } catch (caught) {
        if (paths.length) await cancelReportUploads(ownerId, campaignId, paths);
        setError(caught instanceof Error ? caught.message : "Your report could not be saved. Try again later.");
        setUploadProgress("");
      }
    });
  }

  return <div className={styles.overlay} role="presentation" onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="cause-report-title">
      <span className={styles.handle} aria-hidden="true" />
      {saved ? <div className={styles.success}>
        <span aria-hidden="true">✓</span><h2>Report sent</h2>
        <p>Thanks for taking the time to help keep Salapi safe. The Salapi team will review your report privately.</p>
        <button type="button" onClick={close}>Done</button>
      </div> : <>
        <h2 id="cause-report-title">Report this cause</h2>
        <p className={styles.causeName}>{title || `Campaign #${campaignId}`}</p>
        <p className={styles.intro}>All fields are required. Add at least one photo.</p>
        {identity.loading ? <p role="status" className={styles.notice}>Checking your account…</p> : identity.unavailable ? <p role="alert" className={styles.notice}>Reports are unavailable right now. Nothing was saved.</p>
          : !identity.ownerId ? <div className={styles.guest}><p>Sign in to report this cause.</p><Link href="/signin">Sign in →</Link></div> : null}
        <fieldset className={styles.reasons} disabled={pending || !identity.ownerId}>
          <legend>Reason <span>*</span></legend>
          {reasons.map(([value, label]) => <label className={styles.reason} key={value}>
            <span>{label}</span><input type="radio" name="cause-report-reason" value={value} checked={reason === value} onChange={() => { setReason(value); setError(""); }} />
          </label>)}
        </fieldset>
        <label className={styles.field}>What happened? <span>*</span>
          <textarea value={message} onChange={event => { setMessage(event.target.value.slice(0, 3000)); setError(""); }} maxLength={3000} rows={4}
            placeholder="Tell us what you saw" disabled={pending || !identity.ownerId} />
        </label>
        <div className={styles.photos}>
          <div className={styles.photoLabel}><strong>Photos · {files.length} of 5</strong><span>*</span></div>
          <div className={styles.photoGrid}>
            {files.map((file, index) => <div className={styles.photo} key={`${file.name}:${index}`}>
              {/* Preview uses a local object URL; image bytes are uploaded only after Send report. */}
              <img src={previews[index]} alt={`Selected report photo ${index + 1}`} />
              <button type="button" aria-label={`Remove photo ${index + 1}`} disabled={pending} onClick={() => removeFile(index)}>×</button>
            </div>)}
            {files.length < 5 ? <button type="button" className={styles.addPhoto} disabled={pending || !identity.ownerId} onClick={() => fileRef.current?.click()}><span>＋</span>Photo</button> : null}
          </div>
          <input ref={fileRef} className={styles.fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple
            onChange={event => addFiles(event.target.files)} />
          <small>JPG, PNG, or WebP · up to 2 MB each · private to the Salapi team</small>
        </div>
        {uploadProgress ? <p className={styles.notice} role="status">{uploadProgress}</p> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} disabled={pending} onClick={close}>Cancel</button>
          <button type="button" className={styles.submit} disabled={pending || !identity.ownerId} onClick={send}>{pending ? "Sending…" : "Send report"}</button>
        </div>
      </>}
    </section>
  </div>;
}
