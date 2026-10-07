"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useT } from "@/components/I18nProvider";
import { readCampaignOrganizerUpdates, publishCampaignUpdate, dispatchCampaignUpdateEmails } from "@/app/campaign-update-actions";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { isLocalPreview } from "@/lib/local-preview";
import { CAMPAIGN_UPDATE_UUID, campaignUpdateText, type CampaignUpdateDispatchResult } from "@/lib/campaign-updates";
import styles from "./CampaignOrganizerUpdates.module.css";

const COPY = {
  en: { title: "Organizer updates", intro: "Public updates from the verified QA campaign creator. They are not independently verified delivery proof.",
    loading: "Loading public updates…", empty: "No organizer update has been published yet.", unavailable: "Public campaign updates could not be loaded.",
    editor: "Publish a QA update", subject: "Update title", body: "What changed?", ack: "I understand this update is public and describes a QA Testnet exercise, not a verified real-world delivery.",
    publish: "Publish public update", retryPublish: "Confirm the same update request", publishing: "Confirming…", published: "Public update confirmed. Email delivery is a separate step.",
    uncertain: "Publication is not confirmed. Keep this draft and retry the same request. Do not publish a duplicate.", another: "Write another update", reload: "Refresh updates",
    emailUnavailable: "Email delivery is not configured. Public updates still work once the campaign service is available; no emails are being sent.",
    dispatch: "Dispatch opted-in emails", dispatching: "Checking dispatch…", emailNote: "Only active, verified email opt-ins are eligible. Provider acceptance is not inbox delivery or proof that someone read the email.",
    dispatchUnknown: "Dispatch could not be confirmed. Retry this same update, not a new publication.", accepted: "Provider accepted", unknown: "Uncertain", rejected: "Rejected", remaining: "Remaining", review: "Needs reconciliation", notDelivered: "Inbox delivery has not been verified." },
  id: { title: "Update organizer", intro: "Update publik dari kreator campaign QA yang terverifikasi. Bukan bukti pengiriman yang diverifikasi independen.",
    loading: "Memuat update publik…", empty: "Belum ada update organizer yang diterbitkan.", unavailable: "Update publik campaign belum dapat dimuat.",
    editor: "Terbitkan update QA", subject: "Judul update", body: "Apa yang berubah?", ack: "Saya memahami update ini publik dan menjelaskan uji QA Testnet, bukan pengiriman nyata yang terverifikasi.",
    publish: "Terbitkan update publik", retryPublish: "Konfirmasi permintaan update yang sama", publishing: "Mengonfirmasi…", published: "Update publik terkonfirmasi. Pengiriman email adalah langkah terpisah.",
    uncertain: "Penerbitan belum terkonfirmasi. Simpan draft ini dan ulangi permintaan yang sama. Jangan buat update duplikat.", another: "Tulis update lain", reload: "Muat ulang update",
    emailUnavailable: "Pengiriman email belum dikonfigurasi. Update publik dapat digunakan saat layanan campaign tersedia; belum ada email yang dikirim.",
    dispatch: "Kirim email ke yang memilih berlangganan", dispatching: "Memeriksa pengiriman…", emailNote: "Hanya pilihan berlangganan aktif dengan email terverifikasi. Diterima provider bukan berarti tiba di inbox atau sudah dibaca.",
    dispatchUnknown: "Status pengiriman belum terkonfirmasi. Ulangi update yang sama, bukan penerbitan baru.", accepted: "Diterima provider", unknown: "Belum pasti", rejected: "Ditolak", remaining: "Tersisa", review: "Perlu rekonsiliasi", notDelivered: "Pengiriman ke inbox belum terverifikasi." },
  tl: { title: "Mga update ng organizer", intro: "Pampublikong update mula sa verified QA campaign creator. Hindi ito independiyenteng patunay ng paghahatid.",
    loading: "Nilo-load ang mga update…", empty: "Wala pang inilathalang update ang organizer.", unavailable: "Hindi ma-load ang mga update ng campaign.",
    editor: "Maglathala ng QA update", subject: "Pamagat ng update", body: "Ano ang nagbago?", ack: "Nauunawaan kong pampubliko ang QA Testnet update na ito at hindi patunay ng totoong paghahatid.",
    publish: "Ilathala ang public update", retryPublish: "Kumpirmahin ang parehong request", publishing: "Kinukumpirma…", published: "Nakumpirma ang public update. Hiwalay ang pagpapadala ng email.",
    uncertain: "Hindi pa kumpirmado ang publikasyon. Panatilihin ang draft at ulitin ang parehong request. Huwag gumawa ng duplicate.", another: "Sumulat ng bagong update", reload: "I-refresh ang mga update",
    emailUnavailable: "Hindi pa naka-configure ang email. Maaaring gamitin ang public updates kapag handa ang campaign service; walang email na ipinapadala.",
    dispatch: "Magpadala sa mga email opt-in", dispatching: "Sinusuri ang pagpapadala…", emailNote: "Aktibo at verified email opt-in lang. Ang pagtanggap ng provider ay hindi patunay na naihatid o nabasa ang email.",
    dispatchUnknown: "Hindi makumpirma ang pagpapadala. Ulitin ang parehong update, hindi bagong publikasyon.", accepted: "Tinanggap ng provider", unknown: "Hindi tiyak", rejected: "Tinanggihan", remaining: "Natitira", review: "Kailangang suriin", notDelivered: "Hindi pa verified ang inbox delivery." },
  vi: { title: "Cập nhật của nhà tổ chức", intro: "Cập nhật công khai từ người tạo chiến dịch QA đã xác minh. Không phải bằng chứng giao nhận được xác minh độc lập.",
    loading: "Đang tải cập nhật công khai…", empty: "Chưa có cập nhật nào của nhà tổ chức.", unavailable: "Không tải được cập nhật của chiến dịch.",
    editor: "Đăng cập nhật QA", subject: "Tiêu đề cập nhật", body: "Điều gì đã thay đổi?", ack: "Tôi hiểu cập nhật QA Testnet này là công khai, không phải bằng chứng giao nhận thực tế đã xác minh.",
    publish: "Đăng cập nhật công khai", retryPublish: "Xác nhận lại cùng yêu cầu", publishing: "Đang xác nhận…", published: "Đã xác nhận cập nhật công khai. Gửi email là bước riêng.",
    uncertain: "Chưa xác nhận việc đăng. Giữ bản nháp và thử lại cùng yêu cầu. Không đăng bản trùng lặp.", another: "Viết cập nhật khác", reload: "Tải lại cập nhật",
    emailUnavailable: "Chưa cấu hình gửi email. Cập nhật công khai hoạt động khi dịch vụ chiến dịch sẵn sàng; chưa có email nào được gửi.",
    dispatch: "Gửi email cho người đã đăng ký", dispatching: "Đang kiểm tra gửi email…", emailNote: "Chỉ dành cho đăng ký email đã xác minh và còn hiệu lực. Nhà cung cấp tiếp nhận không có nghĩa email đã đến hộp thư hoặc được đọc.",
    dispatchUnknown: "Không xác nhận được trạng thái gửi. Thử lại cùng cập nhật, không đăng mới.", accepted: "Nhà cung cấp tiếp nhận", unknown: "Chưa rõ", rejected: "Bị từ chối", remaining: "Còn lại", review: "Cần đối soát", notDelivered: "Chưa xác minh email đến hộp thư." },
};
type ReadState = Awaited<ReturnType<typeof readCampaignOrganizerUpdates>>;
type Draft = { id: string; title: string; body: string; ownerId: string };
function draftKey(campaignId: string, ownerId: string) { return `salapi.qa-campaign-update.v1/${campaignId}/${ownerId}`; }
function storedDraft(campaignId: string, ownerId: string): Draft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(campaignId, ownerId));
    if (!raw || raw.length > 10_000) return null;
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || value.campaignId !== campaignId || value.ownerId !== ownerId ||
      typeof value.id !== "string" || !CAMPAIGN_UPDATE_UUID.test(value.id) || value.publicAcknowledged !== true) return null;
    return { id: value.id, ownerId, title: campaignUpdateText(value.title, 120), body: campaignUpdateText(value.body, 4000) };
  } catch { return null; }
}
function persistDraft(campaignId: string, value: Draft): boolean {
  try {
    const key = draftKey(campaignId, value.ownerId);
    const raw = JSON.stringify({ version: 1, campaignId, ...value, publicAcknowledged: true });
    sessionStorage.setItem(key, raw);
    return sessionStorage.getItem(key) === raw;
  } catch { return false; }
}
function clearStoredDraft(campaignId: string, ownerId: string) {
  try { sessionStorage.removeItem(draftKey(campaignId, ownerId)); } catch { /* Confirmed public IDs still deduplicate retries server-side. */ }
}

function Updates({ campaignId }: { campaignId: string }) {
  const { locale } = useT(), c = COPY[locale];
  const [state, setState] = useState<ReadState | null>(null);
  const [title, setTitle] = useState(""), [body, setBody] = useState(""), [ack, setAck] = useState(false);
  const [publishStatus, setPublishStatus] = useState<"idle" | "unknown" | "confirmed">("idle");
  const [draftLocked, setDraftLocked] = useState(false);
  const [dispatchState, setDispatchState] = useState<{ updateId: string; result: CampaignUpdateDispatchResult } | null>(null);
  const [pending, startTransition] = useTransition();
  const draft = useRef<Draft | null>(null), owner = useRef<string | null>(null), revision = useRef(0), active = useRef(false);
  const reload = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;
    const versions = revision;
    active.current = true;
    async function read(requestedOwner: string | null) {
      const request = ++versions.current;
      try {
        const result = await readCampaignOrganizerUpdates(campaignId);
        if (!alive || request !== versions.current || owner.current !== requestedOwner) return;
        if (result.subscription.ok && result.subscription.ownerId !== requestedOwner) {
          result.subscription = { ok: false, status: "unavailable", error: c.unavailable };
        }
        setState(result);
        if (result.subscription.ok && result.subscription.canPublish && !draft.current) {
          const restored = storedDraft(campaignId, result.subscription.ownerId);
          if (restored) {
            draft.current = restored; setTitle(restored.title); setBody(restored.body); setAck(true); setDraftLocked(true); setPublishStatus("unknown");
          }
        }
        if (draft.current && result.updates.ok && result.updates.updates.some(update => update.id === draft.current!.id)) {
          setPublishStatus("confirmed"); clearStoredDraft(campaignId, draft.current.ownerId);
        }
      } catch {
        if (alive && request === versions.current) setState({ subscription: { ok: false, status: "unavailable", error: c.unavailable }, updates: { ok: false, error: c.unavailable } });
      }
    }
    reload.current = () => { if (alive) void read(owner.current); };
    if (!supabaseConfigured() || isLocalPreview) {
      queueMicrotask(() => { if (alive) void read(null); });
      return () => { alive = false; active.current = false; versions.current++; };
    }
    let unsubscribe = () => {};
    try {
      const { data } = createSupabaseBrowser().auth.onAuthStateChange((event, session) => {
        if (!alive) return;
        const next = event === "SIGNED_OUT" ? null : session?.user.id ?? null;
        if (next !== owner.current) {
          draft.current = null; setTitle(""); setBody(""); setAck(false); setDraftLocked(false); setPublishStatus("idle"); setDispatchState(null);
        }
        versions.current++; owner.current = next; setState(null);
        queueMicrotask(() => { if (alive) void read(next); });
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch { queueMicrotask(() => { if (alive) void read(null); }); }
    return () => { alive = false; active.current = false; versions.current++; owner.current = null; unsubscribe(); };
  }, [campaignId, c.unavailable]);

  const identity = state?.subscription.ok ? state.subscription : null;
  // The read response was already correlated with the active owner in its
  // effect. Keep render state in state, and recheck transient identity on clicks.
  const canPublish = identity?.canPublish === true;
  function publish() {
    if (!canPublish || !identity || owner.current !== identity.ownerId || pending || !ack || !title.trim() || !body.trim() || publishStatus === "confirmed") return;
    if (!draft.current) draft.current = { id: crypto.randomUUID(), title: title.trim(), body: body.trim(), ownerId: identity.ownerId };
    const request = draft.current, version = revision.current;
    setDraftLocked(true);
    // Persist only after explicit public acknowledgement, before the first
    // mutation. A reload must keep the SAME request ID after an uncertain result.
    // Draft content contains no recipient email, wallet secret or auth token.
    if (!persistDraft(campaignId, request)) { setPublishStatus("unknown"); return; }
    startTransition(async () => {
      try {
        const result = await publishCampaignUpdate({ campaignId, expectedOwnerId: request.ownerId, idempotencyKey: request.id,
          title: request.title, body: request.body, publicAcknowledged: true });
        if (!active.current || version !== revision.current || owner.current !== request.ownerId) return;
        setPublishStatus(result.ok && result.updateId === request.id ? "confirmed" : "unknown");
        if (result.ok && result.updateId === request.id) { clearStoredDraft(campaignId, request.ownerId); reload.current(); }
      } catch {
        if (active.current && version === revision.current) setPublishStatus("unknown");
      }
    });
  }
  function dispatch(updateId: string) {
    if (!canPublish || !identity || owner.current !== identity.ownerId || identity.providerConfigured !== true || pending) return;
    const ownerId = identity.ownerId, version = revision.current;
    setDispatchState(null);
    startTransition(async () => {
      try {
        const result = await dispatchCampaignUpdateEmails({ campaignId, updateId, expectedOwnerId: ownerId });
        if (active.current && version === revision.current && owner.current === ownerId) setDispatchState({ updateId, result });
      } catch {
        if (active.current && version === revision.current) setDispatchState({ updateId, result: { ok: false, error: c.dispatchUnknown } });
      }
    });
  }
  const publicUpdates = state?.updates.ok ? state.updates.updates : [];
  return <section className={styles.card} aria-labelledby={`organizer-updates-${campaignId}`} aria-busy={pending || state === null}>
    <div className={styles.header}><div><span className={styles.badge}>QA Testnet</span><h3 id={`organizer-updates-${campaignId}`}>{c.title}</h3></div>
      <button type="button" className={styles.refresh} disabled={pending} onClick={() => reload.current()}>{c.reload}</button></div>
    <p className={styles.intro}>{c.intro}</p>
    {state === null ? <p role="status">{c.loading}</p> : !state.updates.ok ? <p role="status" className={styles.notice}>{c.unavailable}</p>
      : publicUpdates.length === 0 ? <p className={styles.empty}>{c.empty}</p>
        : <ol className={styles.feed}>{publicUpdates.map(update => <li key={update.id} data-update-id={update.id}>
          <time dateTime={update.publishedAt}>{new Date(update.publishedAt).toLocaleDateString(locale)}</time><h4>{update.title}</h4><p>{update.body}</p>
          {canPublish ? <><button type="button" className={styles.secondary} disabled={pending || !identity?.providerConfigured} onClick={() => dispatch(update.id)}>{pending ? c.dispatching : c.dispatch}</button>
            {dispatchState?.updateId === update.id ? <div className={styles.notice} role="status">{dispatchState.result.ok
              ? <>{c.accepted}: {dispatchState.result.accepted}. {c.unknown}: {dispatchState.result.unknown}. {c.rejected}: {dispatchState.result.rejected}. {c.remaining}: {dispatchState.result.remaining}. {c.review}: {dispatchState.result.needsReview}.<p>{c.notDelivered}</p></>
              : c.dispatchUnknown}</div> : null}</> : null}
        </li>)}</ol>}
    {canPublish && identity ? <div className={styles.editor}>
      <h4>{c.editor}</h4><label>{c.subject}<input maxLength={120} value={title} disabled={pending || draftLocked} onChange={event => setTitle(event.target.value)} /></label>
      <label>{c.body}<textarea maxLength={4000} rows={5} value={body} disabled={pending || draftLocked} onChange={event => setBody(event.target.value)} /></label>
      <label className={styles.ack}><input type="checkbox" checked={ack} disabled={pending || draftLocked} onChange={event => setAck(event.target.checked)} /><span>{c.ack}</span></label>
      <button type="button" className={styles.primary} disabled={pending || !ack || !title.trim() || !body.trim() || publishStatus === "confirmed"} onClick={publish}>
        {pending ? c.publishing : publishStatus === "unknown" ? c.retryPublish : c.publish}</button>
      {publishStatus !== "idle" ? <p className={publishStatus === "confirmed" ? styles.success : styles.notice} role="status">{publishStatus === "confirmed" ? c.published : c.uncertain}</p> : null}
      {publishStatus === "confirmed" ? <button type="button" className={styles.secondary} disabled={pending} onClick={() => {
        draft.current = null; setTitle(""); setBody(""); setAck(false); setDraftLocked(false); setPublishStatus("idle");
      }}>{c.another}</button> : null}
      {!identity.providerConfigured ? <p className={styles.notice}>{c.emailUnavailable}</p> : null}
      <p className={styles.intro}>{c.emailNote}</p>
    </div> : null}
  </section>;
}

export default function CampaignOrganizerUpdates({ campaignId }: { campaignId: string }) {
  return <Updates key={campaignId} campaignId={campaignId} />;
}
