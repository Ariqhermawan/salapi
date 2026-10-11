"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/I18nProvider";
import { isLocalPreview } from "@/lib/local-preview";
import { ARISAN_SCHEDULE_TIME_ZONES, formatArisanScheduleTime, parseArisanZonedDateTime } from "@/lib/arisan-schedule";
import { validateArisanGatheringSave, validArisanMapsUrl, validArisanOnlineUrl, type ArisanGathering, type ArisanGatheringKind, type ArisanGatheringMode, type ArisanGatheringResult, type ArisanGatheringRsvpResponse, type ArisanGatheringSave, type ArisanGatheringSaveResult } from "@/lib/arisan-gatherings";
import styles from "./ArisanGatheringPanel.module.css";

const texts = {
  en: { title: "Meet with your circle", lead: "Agree where and when to gather. These plans do not change the contract's draw schedule or move funds.", local: "Meeting persistence and member inbox notifications are unavailable in local preview. No notification has been sent.", loading: "Checking the saved meeting...", refresh: "Refresh meeting", edit: "Plan or edit gathering", mode: "Meeting format", person: "In person", online: "Online", hybrid: "In person + online", venue: "Place name", address: "Full address", maps: "Google Maps link", call: "Google Meet, Zoom or Teams link", date: "Meeting date (optional)", time: "Meeting time", zone: "Meeting timezone", save: "Save and notify member inboxes", retry: "Retry the same save", cancel: "Cancel editing", none: "No gathering planned yet. The host can add a place and time.", unscheduled: "Date not agreed yet", privacy: "Visible to verified members of this room only. No automatic payment or email, SMS or push delivery is authorized.", notification: "Room inbox", inbox: "Open all notifications", yes: "Going", no: "Not going", maybe: "Maybe", rsvp: "Your attendance", unknown: "The save result is unknown. Refresh to inspect the current plan or retry this exact request. No delivery is claimed.", invalid: "Check the date, timezone and approved links. Repeated or skipped daylight-saving times cannot be used.", mismatch: "The room deployment changed. Reload this room before editing.", saved: "Meeting saved. Update added to member inboxes:", delivery: "In-app inbox only. This is not proof that a member read it or received an email, SMS or push message.", rsvpSaved: "Attendance response saved.", replies: "Attendance responses", noNotifications: "No room inbox updates yet.", noEdits: "Only the verified host can update this plan.", past: "This gathering has started; attendance responses are closed." },
  id: { title: "Berkumpul dengan anggota", lead: "Sepakati tempat dan waktu berkumpul. Rencana ini tidak mengubah jadwal kocokan kontrak atau memindahkan dana.", local: "Penyimpanan pertemuan dan notifikasi inbox anggota tidak tersedia di preview lokal. Tidak ada notifikasi dikirim.", loading: "Memeriksa pertemuan tersimpan...", refresh: "Perbarui pertemuan", edit: "Atur atau ubah pertemuan", mode: "Format pertemuan", person: "Tatap muka", online: "Online", hybrid: "Tatap muka + online", venue: "Nama tempat", address: "Alamat lengkap", maps: "Tautan Google Maps", call: "Tautan Google Meet, Zoom, atau Teams", date: "Tanggal pertemuan (opsional)", time: "Jam pertemuan", zone: "Zona waktu pertemuan", save: "Simpan dan beri tahu inbox anggota", retry: "Ulangi penyimpanan yang sama", cancel: "Batal mengedit", none: "Belum ada rencana pertemuan. Host bisa mengisi tempat dan waktu.", unscheduled: "Tanggal belum disepakati", privacy: "Hanya terlihat oleh anggota ruang terverifikasi. Tidak mengizinkan pembayaran otomatis atau pengiriman email, SMS, maupun push.", notification: "Inbox ruang", inbox: "Buka semua notifikasi", yes: "Hadir", no: "Tidak hadir", maybe: "Mungkin", rsvp: "Kehadiranmu", unknown: "Hasil penyimpanan belum diketahui. Perbarui untuk memeriksa rencana saat ini atau ulangi permintaan yang sama. Pengiriman belum diklaim.", invalid: "Periksa tanggal, zona waktu, dan tautan yang diizinkan. Jam daylight saving yang berulang atau terlewat tidak bisa dipakai.", mismatch: "Deployment ruang berubah. Muat ulang ruang sebelum mengedit.", saved: "Pertemuan disimpan. Update ditambahkan ke inbox anggota:", delivery: "Hanya inbox di aplikasi. Ini bukan bukti anggota sudah membaca atau menerima email, SMS, maupun push.", rsvpSaved: "Jawaban kehadiran disimpan.", replies: "Jawaban kehadiran", noNotifications: "Belum ada update inbox ruang.", noEdits: "Hanya host terverifikasi yang bisa mengubah rencana.", past: "Pertemuan sudah dimulai; jawaban kehadiran ditutup." },
  tl: { title: "Magkita bilang isang circle", lead: "Pagkasunduan ang lugar at oras. Hindi nito binabago ang draw schedule o naglilipat ng pondo.", local: "Hindi available ang saved meeting at member inbox sa lokal na preview. Walang notification na ipinadala.", loading: "Sinusuri ang meeting...", refresh: "I-refresh ang meeting", edit: "Ayusin ang pagtitipon", mode: "Uri ng meeting", person: "Personal", online: "Online", hybrid: "Personal + online", venue: "Pangalan ng lugar", address: "Buong address", maps: "Google Maps link", call: "Google Meet, Zoom o Teams link", date: "Petsa (opsyonal)", time: "Oras", zone: "Timezone", save: "I-save at i-update ang member inbox", retry: "Ulitin ang parehong save", cancel: "Kanselahin ang edit", none: "Wala pang meeting. Maaaring magtakda ang host.", unscheduled: "Wala pang petsang napagkasunduan", privacy: "Para lang sa verified room members. Walang awtomatikong bayad, email, SMS o push na inaawtorisa.", notification: "Inbox ng room", inbox: "Lahat ng notification", yes: "Dadalo", no: "Hindi dadalo", maybe: "Siguro", rsvp: "Pagdalo mo", unknown: "Hindi alam ang resulta. I-refresh o ulitin ang parehong request. Hindi ito delivery claim.", invalid: "Suriin ang petsa, timezone at pinapayagang links. Hindi puwede ang ambiguous DST time.", mismatch: "Nagbago ang deployment. I-reload ang room.", saved: "Na-save. Na-update na member inbox:", delivery: "In-app inbox lang. Hindi patunay ng pagbabasa, email, SMS o push delivery.", rsvpSaved: "Na-save ang tugon.", replies: "Mga tugon", noNotifications: "Wala pang inbox update.", noEdits: "Verified host lang ang makakapag-edit.", past: "Nagsimula na ang meeting; sarado na ang RSVP." },
  vi: { title: "Gặp gỡ cùng nhóm", lead: "Thống nhất địa điểm và thời gian. Kế hoạch không thay đổi lịch hợp đồng hay chuyển tiền.", local: "Lưu cuộc gặp và thông báo hộp thư không có trong bản xem trước. Chưa gửi thông báo.", loading: "Đang kiểm tra cuộc gặp...", refresh: "Làm mới cuộc gặp", edit: "Lên lịch hoặc sửa cuộc gặp", mode: "Hình thức gặp", person: "Trực tiếp", online: "Trực tuyến", hybrid: "Trực tiếp + trực tuyến", venue: "Tên địa điểm", address: "Địa chỉ đầy đủ", maps: "Liên kết Google Maps", call: "Liên kết Google Meet, Zoom hoặc Teams", date: "Ngày gặp (tùy chọn)", time: "Giờ gặp", zone: "Múi giờ", save: "Lưu và cập nhật hộp thư thành viên", retry: "Thử lại cùng yêu cầu", cancel: "Hủy chỉnh sửa", none: "Chưa có cuộc gặp. Chủ phòng có thể thêm địa điểm và giờ.", unscheduled: "Chưa thống nhất ngày", privacy: "Chỉ thành viên đã xác minh. Không cho phép thanh toán tự động hay gửi email, SMS hoặc push.", notification: "Hộp thư phòng", inbox: "Mở mọi thông báo", yes: "Tham dự", no: "Không tham dự", maybe: "Có thể", rsvp: "Phản hồi của bạn", unknown: "Chưa rõ kết quả lưu. Làm mới hoặc thử lại đúng yêu cầu. Chưa xác nhận gửi thành công.", invalid: "Kiểm tra ngày, múi giờ và liên kết. Không dùng giờ DST mơ hồ.", mismatch: "Triển khai phòng thay đổi. Tải lại trước khi sửa.", saved: "Đã lưu. Số hộp thư được cập nhật:", delivery: "Chỉ hộp thư trong ứng dụng. Không chứng minh đã đọc hay nhận email, SMS hoặc push.", rsvpSaved: "Đã lưu phản hồi.", replies: "Phản hồi tham dự", noNotifications: "Chưa có cập nhật hộp thư.", noEdits: "Chỉ chủ phòng đã xác minh được sửa.", past: "Cuộc gặp đã bắt đầu; đóng phản hồi tham dự." },
} as const;

type Draft = { mode: ArisanGatheringMode; venueName: string; address: string; mapsUrl: string; onlineUrl: string; date: string; time: string; timeZone: string };
const emptyDraft = (): Draft => ({ mode: "in_person", venueName: "", address: "", mapsUrl: "", onlineUrl: "", date: "", time: "19:00", timeZone: "UTC" });
function draftOf(gathering: ArisanGathering | null): Draft {
  if (!gathering) return emptyDraft();
  const draft = { ...emptyDraft(), ...gathering, timeZone: gathering.timeZone ?? "UTC" };
  if (!gathering.startsAt) return draft;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: draft.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(gathering.startsAt));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return { ...draft, date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export default function ArisanGatheringPanel({ kind, roomId, contractId, watchVersion = "" }: { kind: ArisanGatheringKind; roomId: number; contractId: string; watchVersion?: string }) {
  const { locale } = useT();
  const copy = texts[locale];
  const [state, setState] = useState<Extract<ArisanGatheringResult, { ok: true }> | null>(null);
  const [loading, setLoading] = useState(!isLocalPreview);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [unresolved, setUnresolved] = useState(false);
  const [clock, setClock] = useState(0);
  const request = useRef({ version: 0 });
  const mutation = useRef<ArisanGatheringSave | null>(null);
  const draftRevision = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const watchers = useRef({ verified: new Set<string>(), pending: new Set<string>() });
  const load = useCallback(async () => {
    if (isLocalPreview) return;
    const token = ++request.current.version;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    setLoading(true);
    try {
      const response = await fetch(`/api/arisan/gatherings?kind=${kind}&roomId=${roomId}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json() as ArisanGatheringResult;
      if (!mounted.current || token !== request.current.version) return;
      if (!response.ok || !result.ok) { setError(result.ok ? "Meeting unavailable." : result.error); setState(null); return; }
      if (result.contractId !== contractId || result.gathering && (result.gathering.contractId !== contractId || result.gathering.kind !== kind || result.gathering.roomId !== roomId)) { setError(texts[locale].mismatch); setState(null); return; }
      setState(result); setError(mutation.current ? texts[locale].unknown : ""); setClock(Date.now());
      // Register only after the server verifies this wallet's membership. This
      // failure must not hide the meeting or claim that any notification arrived.
      const watcherKey = `${kind}:${roomId}:${contractId}:${result.viewer}:${watchVersion}`;
      if (!watchers.current.verified.has(watcherKey) && !watchers.current.pending.has(watcherKey)) {
        watchers.current.pending.add(watcherKey);
        const registration = new AbortController();
        const registrationTimeout = setTimeout(() => registration.abort(), 12000);
        void fetch("/api/arisan/gatherings/watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, roomId }), signal: registration.signal }).then(async response => {
          const registered = await response.json() as { ok: boolean; delivery?: string };
          if (response.ok && registered.ok && registered.delivery === "in_app") watchers.current.verified.add(watcherKey);
        }).catch(() => { /* A later verified refresh can retry registration. */ }).finally(() => { clearTimeout(registrationTimeout); watchers.current.pending.delete(watcherKey); });
      }
    } catch { if (mounted.current && token === request.current.version) { setError("Meeting data could not be verified. Refresh before continuing."); setState(null); } }
    finally { clearTimeout(timeout); if (mounted.current && token === request.current.version) setLoading(false); }
  }, [kind, roomId, contractId, watchVersion, locale]);
  useEffect(() => {
    mounted.current = true;
    const pendingRead = request.current;
    const timer = setTimeout(() => void load(), 0);
    const tick = setInterval(() => { if (document.visibilityState === "visible") setClock(Date.now()); }, 30000);
    const onVisibility = () => { if (document.visibilityState === "visible" && !inFlight.current) void load(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { mounted.current = false; pendingRead.version++; clearTimeout(timer); clearInterval(tick); document.removeEventListener("visibilitychange", onVisibility); };
  }, [load]);

  async function save() {
    if (isLocalPreview || !draft || !state?.canEdit || inFlight.current || loading) return;
    let body = mutation.current;
    if (!body) {
      const date = draft.date ? parseArisanZonedDateTime(draft.date, draft.time, draft.timeZone) : null;
      if (draft.date && date === null) { setError(copy.invalid); return; }
      try {
        body = { kind, roomId, expectedRevision: draftRevision.current, mutationId: crypto.randomUUID(), mode: draft.mode,
          venueName: draft.mode === "online" ? "" : draft.venueName.trim(), address: draft.mode === "online" ? "" : draft.address.trim(), mapsUrl: draft.mode === "online" ? "" : draft.mapsUrl.trim(), onlineUrl: draft.mode === "in_person" ? "" : draft.onlineUrl.trim(),
          startsAt: date === null ? null : new Date(date * 1000).toISOString(), timeZone: date === null ? null : draft.timeZone };
      } catch { setError(copy.invalid); return; }
      const checked = validateArisanGatheringSave(body);
      if (!checked.ok) { setError(checked.error); return; }
      body = checked.value;
      mutation.current = body;
    }
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/arisan/gatherings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      const result = await response.json() as ArisanGatheringSaveResult;
      if (!mounted.current) return;
      if (!response.ok || !result.ok) {
        if (response.status >= 500) { setUnresolved(true); setError(copy.unknown); return; }
        mutation.current = null; setUnresolved(false); if (!result.ok && result.code === "conflict") setDraft(null); await load(); setError(result.ok ? copy.invalid : result.error); return;
      }
      if (result.gathering.contractId !== contractId || result.gathering.kind !== kind || result.gathering.roomId !== roomId) { setError(copy.mismatch); setUnresolved(true); return; }
      mutation.current = null; setUnresolved(false); setDraft(null);
      setNotice(`${copy.saved} ${result.notifiedMembers}. ${copy.delivery}`);
      await load();
    } catch { if (mounted.current) { setUnresolved(true); setError(copy.unknown); } }
    finally { clearTimeout(timeout); inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function rsvp(response: ArisanGatheringRsvpResponse) {
    if (!state?.gathering?.startsAt || inFlight.current || isLocalPreview || loading) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await fetch("/api/arisan/gatherings/rsvp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, roomId, revision: state.gathering.revision, response }), signal: controller.signal });
      const value = await result.json() as { ok: boolean; error?: string };
      if (!mounted.current) return;
      await load();
      if (!result.ok || !value.ok) setError(value.error ?? copy.unknown);
      else setNotice(copy.rsvpSaved);
    } catch { if (mounted.current) setError(copy.unknown); }
    finally { clearTimeout(timeout); inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  const meeting = state?.gathering;
  const response = state?.rsvps.find(value => value.wallet === state.viewer)?.response;
  const past = meeting?.startsAt ? Date.parse(meeting.startsAt) <= clock : false;
  const modeLabel = (mode: ArisanGatheringMode) => mode === "in_person" ? copy.person : mode === "online" ? copy.online : copy.hybrid;
  const change = (key: keyof Draft, value: string) => { setDraft(previous => previous ? { ...previous, [key]: value } : null); setError(""); };

  return <section className={styles.panel} aria-label={copy.title}>
    <header><div><span className={styles.eyebrow}>ARISAN · TOGETHER</span><h2>{copy.title}</h2></div><span className={styles.icon} aria-hidden="true">◎</span></header>
    <p>{copy.lead}</p>
    {isLocalPreview ? <p className={styles.notice}>{copy.local}</p> : <>
      {loading ? <p role="status">{copy.loading}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      <button type="button" className={styles.quiet} onClick={() => void load()} disabled={busy || loading}>{copy.refresh}</button>
      {state ? <>
        {meeting ? <div className={styles.meeting}><span className={styles.badge}>{modeLabel(meeting.mode)}</span><strong>{meeting.startsAt ? formatArisanScheduleTime(Math.floor(Date.parse(meeting.startsAt) / 1000), meeting.timeZone ?? "UTC") : copy.unscheduled}</strong>{meeting.venueName ? <h3>{meeting.venueName}</h3> : null}{meeting.address ? <p className={styles.address}>{meeting.address}</p> : null}<div className={styles.links}>{meeting.mapsUrl && validArisanMapsUrl(meeting.mapsUrl) ? <a href={meeting.mapsUrl} target="_blank" rel="noopener noreferrer">{copy.maps} ↗</a> : null}{meeting.onlineUrl && validArisanOnlineUrl(meeting.onlineUrl) ? <a href={meeting.onlineUrl} target="_blank" rel="noopener noreferrer">{copy.call} ↗</a> : null}</div>
          {meeting.startsAt ? <div className={styles.attendance}><span>{copy.rsvp}</span><div>{(["yes", "maybe", "no"] as const).map(value => <button key={value} type="button" aria-pressed={response === value} disabled={busy || loading || past || unresolved} onClick={() => void rsvp(value)}>{copy[value]}</button>)}</div><small>{copy.replies}: {state.rsvps.length}{past ? ` · ${copy.past}` : ""}</small></div> : null}
        </div> : <p>{copy.none}</p>}
        {state.canEdit && !draft ? <button className={styles.primary} type="button" onClick={() => { draftRevision.current = meeting?.revision ?? 0; setDraft(draftOf(meeting ?? null)); setError(""); }} disabled={busy || loading}>{copy.edit}</button> : !state.canEdit ? <small>{copy.noEdits}</small> : null}
        {draft && state.canEdit ? <form className={styles.form} onSubmit={event => { event.preventDefault(); void save(); }}>
          <fieldset disabled={busy || loading || unresolved}><label>{copy.mode}<select value={draft.mode} onChange={event => change("mode", event.target.value)}><option value="in_person">{copy.person}</option><option value="online">{copy.online}</option><option value="hybrid">{copy.hybrid}</option></select></label>
            {draft.mode !== "online" ? <><label>{copy.venue}<input value={draft.venueName} maxLength={120} onChange={event => change("venueName", event.target.value)} /></label><label>{copy.address}<textarea value={draft.address} maxLength={500} rows={2} onChange={event => change("address", event.target.value)} /></label><label>{copy.maps}<input type="url" value={draft.mapsUrl} maxLength={1200} placeholder="https://maps.app.goo.gl/..." onChange={event => change("mapsUrl", event.target.value)} /></label></> : null}
            {draft.mode !== "in_person" ? <label>{copy.call}<input type="url" value={draft.onlineUrl} maxLength={1200} placeholder="https://meet.google.com/..." onChange={event => change("onlineUrl", event.target.value)} /></label> : null}
            <div className={styles.grid}><label>{copy.date}<input type="date" value={draft.date} onChange={event => change("date", event.target.value)} /></label><label>{copy.time}<input type="time" value={draft.time} onChange={event => change("time", event.target.value)} /></label></div><label>{copy.zone}<input list={`gathering-timezones-${kind}-${roomId}`} value={draft.timeZone} spellCheck={false} onChange={event => change("timeZone", event.target.value)} /></label><datalist id={`gathering-timezones-${kind}-${roomId}`}>{ARISAN_SCHEDULE_TIME_ZONES.map(zone => <option key={zone} value={zone} />)}</datalist>
          </fieldset><p>{copy.privacy}</p><button className={styles.primary} type="submit" disabled={busy || loading}>{unresolved ? copy.retry : copy.save}</button>{!unresolved ? <button className={styles.quiet} type="button" onClick={() => setDraft(null)} disabled={busy}>{copy.cancel}</button> : null}
        </form> : null}
        <details className={styles.inbox}><summary>{copy.notification} <span>{state.unreadCount}</span></summary>{state.notifications.length ? <ul>{state.notifications.map(notification => <li key={notification.id}><strong>{notification.title}</strong><p>{notification.body}</p></li>)}</ul> : <p>{copy.noNotifications}</p>}<Link href="/notifications">{copy.inbox} →</Link><p>{copy.delivery}</p></details>
      </> : null}
    </>}
  </section>;
}
