"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppBar, Ico, IconButton } from "@/components/ui/kit";
import { useT } from "@/components/I18nProvider";
import { useGoBack } from "@/lib/ui/useGoBack";
import { isLocalPreview } from "@/lib/local-preview";
import { ARISAN_GATHERING_UUID, arisanGatheringScope, arisanRoomHref, type ArisanGatheringFailure, type ArisanGatheringInboxResult, type ArisanGatheringNotification } from "@/lib/arisan-gatherings";
import styles from "./ArisanNotificationsScreen.module.css";

const labels = {
  en: { title: "Notifications", eyebrow: "YOUR ARISAN INBOX", heading: "Stay in the circle.", intro: "Meeting plans, funding progress and draw updates for your saved wallet.", disclosure: "In-app inbox only. An update here is not proof of email, SMS or push delivery, or that another member read it.", refresh: "Refresh inbox", loading: "Checking your notifications...", empty: "No arisan updates yet.", emptyHelp: "Updates appear here when a room event or gathering update is recorded for your wallet.", signIn: "Sign in with your saved wallet", unread: "Unread", read: "Read", mark: "Mark read", markAll: "Mark loaded updates read", open: "Open room", failure: "Notifications could not be verified. Refresh to try again.", unknown: "Read status could not be confirmed. Refresh before trying again.", saved: "Read status saved.", local: "Persistent notifications are unavailable in local preview. No delivery has been simulated.", bound: "Showing up to the 50 latest updates. The unread count may include older updates.", back: "Back to arisan" },
  id: { title: "Notifikasi", eyebrow: "INBOX ARISANMU", heading: "Tetap terhubung dengan anggota.", intro: "Rencana pertemuan, kemajuan pendanaan, dan update kocokan untuk wallet tersimpanmu.", disclosure: "Hanya inbox di aplikasi. Update bukan bukti pengiriman email, SMS, atau push, maupun bukti anggota lain sudah membaca.", refresh: "Perbarui inbox", loading: "Memeriksa notifikasimu...", empty: "Belum ada update arisan.", emptyHelp: "Update muncul setelah peristiwa ruang atau perubahan pertemuan dicatat untuk walletmu.", signIn: "Masuk dengan wallet tersimpan", unread: "Belum dibaca", read: "Dibaca", mark: "Tandai dibaca", markAll: "Tandai update yang dimuat dibaca", open: "Buka ruang", failure: "Notifikasi belum bisa diverifikasi. Perbarui untuk mencoba lagi.", unknown: "Status baca belum terkonfirmasi. Perbarui sebelum mencoba lagi.", saved: "Status baca disimpan.", local: "Notifikasi tersimpan tidak tersedia di preview lokal. Pengiriman tidak disimulasikan.", bound: "Menampilkan maksimal 50 update terbaru. Jumlah belum dibaca dapat mencakup update lebih lama.", back: "Kembali ke arisan" },
  tl: { title: "Mga notification", eyebrow: "IYONG ARISAN INBOX", heading: "Manatiling konektado.", intro: "Mga meeting, pagpondo at bunutan para sa naka-save mong wallet.", disclosure: "In-app inbox lang. Hindi ito patunay ng email, SMS, push delivery o pagbabasa ng ibang miyembro.", refresh: "I-refresh ang inbox", loading: "Sinusuri ang notification...", empty: "Wala pang arisan update.", emptyHelp: "Dito lalabas ang naitalang room at meeting update para sa wallet mo.", signIn: "Mag-sign in gamit ang saved wallet", unread: "Hindi pa nababasa", read: "Nabasa", mark: "Markahang nabasa", markAll: "Markahang nabasa ang loaded updates", open: "Buksan ang room", failure: "Hindi ma-verify ang inbox. I-refresh upang ulitin.", unknown: "Hindi kumpirmado ang read status. I-refresh muna.", saved: "Na-save ang read status.", local: "Hindi available ang persistent inbox sa lokal na preview. Walang simulated delivery.", bound: "Hanggang 50 pinakabagong update. Maaaring kasama sa unread count ang mas lumang update.", back: "Bumalik sa arisan" },
  vi: { title: "Thông báo", eyebrow: "HỘP THƯ ARISAN", heading: "Luôn kết nối với nhóm.", intro: "Lịch gặp, tiến độ góp và cập nhật lượt quay cho ví đã lưu.", disclosure: "Chỉ hộp thư ứng dụng. Không chứng minh gửi email, SMS, push hoặc thành viên khác đã đọc.", refresh: "Làm mới hộp thư", loading: "Đang kiểm tra thông báo...", empty: "Chưa có cập nhật arisan.", emptyHelp: "Cập nhật phòng và cuộc gặp dành cho ví của bạn sẽ xuất hiện tại đây.", signIn: "Đăng nhập bằng ví đã lưu", unread: "Chưa đọc", read: "Đã đọc", mark: "Đánh dấu đã đọc", markAll: "Đánh dấu các cập nhật đã tải", open: "Mở phòng", failure: "Chưa xác minh được thông báo. Hãy làm mới.", unknown: "Chưa xác nhận trạng thái đọc. Làm mới trước khi thử lại.", saved: "Đã lưu trạng thái đọc.", local: "Không có hộp thư lưu trữ trong bản xem trước. Không mô phỏng gửi thông báo.", bound: "Hiển thị tối đa 50 cập nhật mới nhất. Số chưa đọc có thể gồm cập nhật cũ hơn.", back: "Trở lại arisan" },
} as const;

export default function ArisanNotificationsScreen() {
  const { locale } = useT();
  const copy = labels[locale];
  const goBack = useGoBack("/arisan");
  const [state, setState] = useState<Extract<ArisanGatheringInboxResult, { ok: true }> | null>(null);
  const [loading, setLoading] = useState(!isLocalPreview);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [notice, setNotice] = useState("");
  const request = useRef({ version: 0 });
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const load = useCallback(async () => {
    if (isLocalPreview) return;
    const token = ++request.current.version;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    setLoading(true);
    try {
      const response = await fetch("/api/arisan/gatherings/inbox", { cache: "no-store", signal: controller.signal });
      const result = await response.json() as ArisanGatheringInboxResult;
      if (!mounted.current || token !== request.current.version) return false;
      if (!response.ok || !result.ok) { setState(null); setUnauthorized(!result.ok && result.code === "unauthorized"); setError(result.ok ? labels[locale].failure : result.error); return false; }
      if (!Array.isArray(result.notifications) || result.notifications.length > 50 || !Number.isSafeInteger(result.unreadCount) || result.unreadCount < 0 || result.delivery !== "in_app") throw Error("Invalid inbox");
      setState(result); setUnauthorized(false); setError(""); return true;
    } catch { if (mounted.current && token === request.current.version) { setState(null); setError(labels[locale].failure); } return false; }
    finally { clearTimeout(timeout); if (mounted.current && token === request.current.version) setLoading(false); }
  }, [locale]);
  useEffect(() => {
    mounted.current = true;
    const pendingRead = request.current;
    const first = setTimeout(() => void load(), 0);
    const refresh = () => { if (document.visibilityState === "visible" && !inFlight.current) void load(); };
    const poll = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { mounted.current = false; pendingRead.version++; clearTimeout(first); clearInterval(poll); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);

  async function markRead(ids: string[]) {
    if (isLocalPreview || inFlight.current || loading || !state || !ids.length || ids.length > 50 || ids.some(id => !ARISAN_GATHERING_UUID.test(id))) return;
    const ownIds = new Set(state.notifications.filter(value => !value.readAt).map(value => value.id));
    if (ids.some(id => !ownIds.has(id))) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/arisan/gatherings/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }), signal: controller.signal });
      const result = await response.json() as { ok: true; marked: number } | ArisanGatheringFailure;
      if (!mounted.current) return;
      const refreshed = await load();
      if (!response.ok || !result.ok) setError(result.ok ? copy.unknown : result.error);
      else if (refreshed && Number.isSafeInteger(result.marked) && result.marked >= 0 && result.marked <= ids.length) setNotice(copy.saved);
      else setError(copy.unknown);
    } catch { if (mounted.current) setError(copy.unknown); }
    finally { clearTimeout(timeout); inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  const roomHref = (notification: ArisanGatheringNotification) => arisanGatheringScope(notification) ? arisanRoomHref(notification) : null;
  const unread = state?.notifications.filter(notification => !notification.readAt).map(notification => notification.id) ?? [];
  const dateLocale = { en: "en-US", id: "id-ID", tl: "fil-PH", vi: "vi-VN" }[locale];

  return <div className={styles.screen}>
    <AppBar title={copy.title} leading={<IconButton ariaLabel={copy.back} onClick={goBack}>{Ico.back({})}</IconButton>} />
    <main className={styles.body}><header className={styles.hero}><span>{copy.eyebrow}</span><h1>{copy.heading}</h1><p>{copy.intro}</p>{state ? <strong>{state.unreadCount} {copy.unread.toLowerCase()}</strong> : null}</header>
      <p className={styles.disclosure}>{copy.disclosure}</p>
      {isLocalPreview ? <p className={styles.notice}>{copy.local}</p> : <>
        <div className={styles.toolbar}><button type="button" onClick={() => void load()} disabled={loading || busy}>{copy.refresh}</button>{unread.length > 0 ? <button type="button" onClick={() => void markRead(unread)} disabled={loading || busy}>{copy.markAll}</button> : null}</div>
        {loading ? <p role="status">{copy.loading}</p> : null}{error ? <p className={styles.error} role="alert">{error}</p> : null}{notice ? <p className={styles.notice} role="status">{notice}</p> : null}
        {unauthorized ? <Link className={styles.signIn} href="/signin?next=%2Fnotifications">{copy.signIn} →</Link> : null}
        {state?.notifications.length === 0 ? <section className={styles.empty}><h2>{copy.empty}</h2><p>{copy.emptyHelp}</p></section> : null}
        {state && state.notifications.length > 0 ? <><ul className={styles.list}>{state.notifications.map(notification => <li key={notification.id} className={!notification.readAt ? styles.unread : undefined}><div className={styles.itemTop}><span>{notification.roomName}</span><span>{notification.readAt ? copy.read : copy.unread}</span></div><h2>{notification.title}</h2><p>{notification.body}</p><time dateTime={notification.createdAt}>{Number.isFinite(Date.parse(notification.createdAt)) ? new Date(notification.createdAt).toLocaleString(dateLocale, { dateStyle: "medium", timeStyle: "short" }) : ""}</time><div className={styles.itemActions}>{roomHref(notification) ? <Link href={roomHref(notification)!}>{copy.open} →</Link> : null}{!notification.readAt ? <button type="button" onClick={() => void markRead([notification.id])} disabled={loading || busy}>{copy.mark}</button> : null}</div></li>)}</ul><p className={styles.disclosure}>{copy.bound}</p></> : null}
      </>}
      <Link className={styles.backLink} href="/arisan">{copy.back} →</Link>
    </main>
  </div>;
}
