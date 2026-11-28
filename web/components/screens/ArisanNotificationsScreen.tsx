"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppBar, Ico, IconButton } from "@/components/ui/kit";
import { useT } from "@/components/I18nProvider";
import { useGoBack } from "@/lib/ui/useGoBack";
import { useOwnedAccountRead } from "@/lib/ui/useOwnedAccountRead";
import { isLocalPreview } from "@/lib/local-preview";
import { ARISAN_GATHERING_UUID, arisanGatheringScope, arisanRoomHref, type ArisanGatheringFailure, type ArisanGatheringInboxResult, type ArisanGatheringNotification } from "@/lib/arisan-gatherings";
import { activityStroopsToXlm, USDC_TESTNET_ISSUER, USDC_TESTNET_SAC, type WalletActivityContext, type WalletActivityItem } from "@/lib/wallet-activity";
import { activityCopy } from "@/lib/i18n/wallet-activity";
import styles from "./ArisanNotificationsScreen.module.css";

const labels = {
  en: { title: "Notifications", disclosure: "Confirmed XLM and Circle-issued Testnet USDC movements from your saved wallet. Testnet tokens have no monetary value.", roomDisclosure: "Room updates stay in this in-app inbox. They do not prove email, SMS or push delivery.", today: "Today", earlier: "Earlier", refresh: "Refresh", loading: "Checking your notifications...", activityLoading: "Checking confirmed wallet activity...", activityError: "Wallet activity is temporarily unavailable.", allActivity: "View all activity", donation: "Your {amount} donation was confirmed", sent: "You sent {amount}", received: "You received {amount}", empty: "No notifications yet.", emptyHelp: "Confirmed payments and room updates will appear here.", signIn: "Sign in with your saved wallet", unread: "Unread", read: "Read", mark: "Mark read", markAll: "Mark loaded updates read", open: "Open room", failure: "Notifications could not be verified. Refresh to try again.", unknown: "Read status could not be confirmed. Refresh before trying again.", saved: "Read status saved.", local: "Persistent notifications are unavailable in local preview. No delivery has been simulated.", roomBound: "Showing up to the 50 latest room updates. The unread count may include older updates.", activityBound: "Showing up to 30 recent confirmed transfers. View activity for the full history.", back: "Back to arisan" },
  id: { title: "Notifikasi", disclosure: "Transfer XLM dan USDC Testnet dari Circle yang terkonfirmasi untuk wallet tersimpanmu. Token Testnet tidak bernilai uang.", roomDisclosure: "Update ruang hanya tersimpan di inbox aplikasi. Ini bukan bukti pengiriman email, SMS, atau push.", today: "Hari ini", earlier: "Sebelumnya", refresh: "Perbarui", loading: "Memeriksa notifikasimu...", activityLoading: "Memeriksa aktivitas wallet terkonfirmasi...", activityError: "Aktivitas wallet sementara tidak tersedia.", allActivity: "Lihat semua aktivitas", donation: "Donasi {amount}-mu dikonfirmasi", sent: "Kamu mengirim {amount}", received: "Kamu menerima {amount}", empty: "Belum ada notifikasi.", emptyHelp: "Transfer terkonfirmasi dan update ruang akan muncul di sini.", signIn: "Masuk dengan wallet tersimpan", unread: "Belum dibaca", read: "Dibaca", mark: "Tandai dibaca", markAll: "Tandai update yang dimuat dibaca", open: "Buka ruang", failure: "Notifikasi belum bisa diverifikasi. Perbarui untuk mencoba lagi.", unknown: "Status baca belum terkonfirmasi. Perbarui sebelum mencoba lagi.", saved: "Status baca disimpan.", local: "Notifikasi tersimpan tidak tersedia di preview lokal. Pengiriman tidak disimulasikan.", roomBound: "Menampilkan maksimal 50 update ruang terbaru. Jumlah belum dibaca dapat mencakup update lebih lama.", activityBound: "Menampilkan maksimal 30 transfer terkonfirmasi. Buka aktivitas untuk riwayat lengkap.", back: "Kembali ke arisan" },
  tl: { title: "Mga notification", disclosure: "Mga kumpirmadong XLM at Circle-issued na Testnet USDC mula sa saved wallet mo. Walang halagang pera ang Testnet tokens.", roomDisclosure: "Sa in-app inbox lang ang mga room update. Hindi ito patunay ng email, SMS o push delivery.", today: "Ngayon", earlier: "Mas maaga", refresh: "I-refresh", loading: "Sinusuri ang notification...", activityLoading: "Sinusuri ang kumpirmadong aktibidad sa wallet...", activityError: "Pansamantalang hindi available ang aktibidad sa wallet.", allActivity: "Tingnan ang lahat ng aktibidad", donation: "Kumpirmado ang donasyon mong {amount}", sent: "Nagpadala ka ng {amount}", received: "Nakatanggap ka ng {amount}", empty: "Wala pang notification.", emptyHelp: "Dito lalabas ang kumpirmadong transfer at mga room update.", signIn: "Mag-sign in gamit ang saved wallet", unread: "Hindi pa nababasa", read: "Nabasa", mark: "Markahang nabasa", markAll: "Markahang nabasa ang loaded updates", open: "Buksan ang room", failure: "Hindi ma-verify ang inbox. I-refresh upang ulitin.", unknown: "Hindi kumpirmado ang read status. I-refresh muna.", saved: "Na-save ang status ng pagbasa.", local: "Hindi available ang persistent inbox sa lokal na preview. Walang simulated delivery.", roomBound: "Hanggang 50 pinakabagong room update. Maaaring kasama sa unread count ang mas lumang update.", activityBound: "Hanggang 30 kumpirmadong transfer. Tingnan ang activity para sa buong history.", back: "Bumalik sa arisan" },
  vi: { title: "Thông báo", disclosure: "Giao dịch XLM và USDC Testnet của Circle đã xác nhận cho ví đã lưu. Token Testnet không có giá trị tiền tệ.", roomDisclosure: "Cập nhật phòng chỉ có trong hộp thư ứng dụng. Đây không phải bằng chứng gửi email, SMS hoặc push.", today: "Hôm nay", earlier: "Trước đó", refresh: "Làm mới", loading: "Đang kiểm tra thông báo...", activityLoading: "Đang kiểm tra hoạt động ví đã xác nhận...", activityError: "Hoạt động ví tạm thời không khả dụng.", allActivity: "Xem toàn bộ hoạt động", donation: "Khoản quyên góp {amount} đã xác nhận", sent: "Bạn đã gửi {amount}", received: "Bạn đã nhận {amount}", empty: "Chưa có thông báo.", emptyHelp: "Giao dịch đã xác nhận và cập nhật phòng sẽ xuất hiện tại đây.", signIn: "Đăng nhập bằng ví đã lưu", unread: "Chưa đọc", read: "Đã đọc", mark: "Đánh dấu đã đọc", markAll: "Đánh dấu các cập nhật đã tải", open: "Mở phòng", failure: "Chưa xác minh được thông báo. Hãy làm mới.", unknown: "Chưa xác nhận trạng thái đọc. Làm mới trước khi thử lại.", saved: "Đã lưu trạng thái đọc.", local: "Không có hộp thư lưu trữ trong bản xem trước. Không mô phỏng gửi thông báo.", roomBound: "Hiển thị tối đa 50 cập nhật phòng gần nhất. Số chưa đọc có thể gồm cập nhật cũ hơn.", activityBound: "Hiển thị tối đa 30 giao dịch đã xác nhận. Xem hoạt động để biết lịch sử đầy đủ.", back: "Trở lại arisan" },
} as const;

type NotificationActivityItem = Pick<WalletActivityItem, "id" | "hash" | "createdAt" | "direction" | "amountStroops" | "asset" | "counterparty"> & { context?: Pick<WalletActivityContext, "type" | "referenceId" | "title"> };
type WalletActivity = { ok: true; ownerId: string; address: string | null; items: NotificationActivityItem[]; identities?: { address: string; handle: string | null }[] };
type NotificationEntry =
  | { kind: "room"; id: string; createdAt: string; notification: ArisanGatheringNotification }
  | { kind: "activity"; id: string; createdAt: string; item: NotificationActivityItem };

const ACTIVITY_CONTEXT_TYPES: readonly WalletActivityContext["type"][] = ["campaign-donation", "campaign-refund", "campaign-payout", "arisan-funding", "arisan-win", "arisan-refund", "paluwagan-funding", "paluwagan-payout", "disaster-contribution", "disaster-payout", "savings-deposit", "savings-withdrawal"];
const isPublicAddress = (value: unknown): value is string => typeof value === "string" && /^[GC][A-Z2-7]{55}$/.test(value);

function validActivityContext(value: unknown): value is NonNullable<NotificationActivityItem["context"]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const context = value as Partial<WalletActivityContext>;
  return ACTIVITY_CONTEXT_TYPES.includes(context.type as WalletActivityContext["type"])
    && (context.referenceId === null || typeof context.referenceId === "string" && /^[1-9]\d{0,19}$/.test(context.referenceId))
    && (context.title === null || typeof context.title === "string" && context.title.length <= 160);
}

function validWalletActivityItem(value: unknown): value is NotificationActivityItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<NotificationActivityItem>;
  const asset = item.asset;
  const knownAsset = asset?.code === "XLM"
    ? asset.network === "testnet" && asset.decimals === 7 && asset.issuer === null && asset.contractId === null
    : asset?.code === "USDC" && asset.network === "testnet" && asset.decimals === 7
      && asset.issuer === USDC_TESTNET_ISSUER && asset.contractId === USDC_TESTNET_SAC;
  return typeof item.id === "string" && item.id.length > 0 && item.id.length <= 256
    && typeof item.hash === "string" && /^[a-f0-9]{64}$/i.test(item.hash)
    && typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt))
    && typeof item.amountStroops === "string" && /^\d{1,40}$/.test(item.amountStroops)
    && (item.direction === "sent" || item.direction === "received") && knownAsset
    && (item.counterparty === null || isPublicAddress(item.counterparty))
    && (item.context === undefined || validActivityContext(item.context));
}

function validWalletActivity(value: unknown): value is WalletActivity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<WalletActivity>;
  return result.ok === true && typeof result.ownerId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.ownerId)
    && (result.address === null || typeof result.address === "string" && /^G[A-Z2-7]{55}$/.test(result.address))
    && Array.isArray(result.items) && result.items.length <= 30 && result.items.every(validWalletActivityItem)
    && Array.isArray(result.identities ?? []) && (result.identities ?? []).length <= 12
    && (result.identities ?? []).every(identity => !!identity && typeof identity.address === "string"
      && /^[G][A-Z2-7]{55}$/.test(identity.address)
      && (identity.handle === null || typeof identity.handle === "string" && /^[a-z0-9_]{3,32}$/.test(identity.handle)));
}

function activityContextName(item: NotificationActivityItem, copy: ReturnType<typeof activityCopy>): string | null {
  const context = item.context;
  if (!context || typeof context.type !== "string") return null;
  if (context.title) return context.title;
  if (!context.referenceId) return null;
  if (context.type.startsWith("campaign-")) return copy("campaignName", { id: context.referenceId });
  if (context.type.startsWith("arisan-")) return copy("arisanName", { id: context.referenceId });
  return null;
}

function activityTitle(item: NotificationActivityItem, copy: (typeof labels)[keyof typeof labels]) {
  const amount = `${activityStroopsToXlm(item.amountStroops)} ${item.asset.code}`;
  if (item.context?.type === "campaign-donation" || item.context?.type === "disaster-contribution")
    return copy.donation.replace("{amount}", amount);
  return (item.direction === "sent" ? copy.sent : copy.received).replace("{amount}", amount);
}

export default function ArisanNotificationsScreen() {
  const { locale } = useT();
  const copy = labels[locale];
  const activityText = activityCopy(locale);
  const goBack = useGoBack("/arisan");
  const walletActivity = useOwnedAccountRead("/api/account/activity", validWalletActivity);
  const refreshWalletActivity = walletActivity.refresh;
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
    const refresh = () => {
      if (document.visibilityState !== "visible" || inFlight.current) return;
      void load();
      refreshWalletActivity();
    };
    const poll = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { mounted.current = false; pendingRead.version++; clearTimeout(first); clearInterval(poll); document.removeEventListener("visibilitychange", refresh); };
  }, [load, refreshWalletActivity]);

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
  function markOneRead(event: React.MouseEvent<HTMLButtonElement>) {
    const id = event.currentTarget.dataset.notificationId;
    if (id) void markRead([id]);
  }
  function refreshAll() {
    void load();
    refreshWalletActivity();
  }
  const roomHref = (notification: ArisanGatheringNotification) => arisanGatheringScope(notification) ? arisanRoomHref(notification) : null;
  const unread = state?.notifications.filter(notification => !notification.readAt).map(notification => notification.id) ?? [];
  const activityIdentities = new Map((walletActivity.value?.identities ?? []).map(identity => [identity.address, identity]));
  const entries: NotificationEntry[] = [
    ...(state?.notifications ?? []).map(notification => ({ kind: "room" as const, id: notification.id, createdAt: notification.createdAt, notification })),
    ...(walletActivity.value?.items ?? []).map(item => ({ kind: "activity" as const, id: item.id, createdAt: item.createdAt, item })),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const dateLocale = { en: "en-US", id: "id-ID", tl: "fil-PH", vi: "vi-VN" }[locale];
  const today = new Date().toDateString();
  const groups = [
    { title: copy.today, notifications: entries.filter(item => new Date(item.createdAt).toDateString() === today) },
    { title: copy.earlier, notifications: entries.filter(item => new Date(item.createdAt).toDateString() !== today) },
  ].filter(group => group.notifications.length > 0);
  const formatNotificationTime = (value: string) => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toDateString() === today
      ? date.toLocaleTimeString(dateLocale, { hour: "numeric", minute: "2-digit" })
      : date.toLocaleDateString(dateLocale, { month: "short", day: "numeric" });
  };

  return <div className={styles.screen}>
    <AppBar title={copy.title} leading={<IconButton ariaLabel={copy.back} onClick={goBack}>{Ico.back({})}</IconButton>} />
    <main className={styles.body}>
      {!isLocalPreview ? <p className={styles.disclosure}>{copy.disclosure}</p> : null}
      {isLocalPreview ? <p className={styles.notice}>{copy.local}</p> : <>
        <p className={styles.disclosure}>{copy.roomDisclosure}</p>
        <div className={styles.toolbar}><button type="button" onClick={refreshAll} disabled={loading || busy}>{copy.refresh}</button><Link href="/activity">{copy.allActivity} →</Link>{unread.length > 0 ? <button type="button" onClick={() => void markRead(unread)} disabled={loading || busy}>{copy.markAll}</button> : null}</div>
        {loading ? <p role="status">{copy.loading}</p> : null}{error ? <p className={styles.error} role="alert">{error}</p> : null}{notice ? <p className={styles.notice} role="status">{notice}</p> : null}
        {walletActivity.status === "loading" ? <p role="status">{copy.activityLoading}</p> : null}
        {walletActivity.status === "unavailable" ? <p className={styles.error} role="status">{copy.activityError}</p> : null}
        {unauthorized ? <Link className={styles.signIn} href="/signin?next=%2Fnotifications">{copy.signIn} →</Link> : null}
        {!loading && state?.notifications.length === 0 && walletActivity.status === "ready" && (walletActivity.value?.items.length ?? 0) === 0 ? <section className={styles.empty}><h2>{copy.empty}</h2><p>{copy.emptyHelp}</p></section> : null}
        {groups.map(group => <section className={styles.group} aria-label={group.title} key={group.title}>
          <h2>{group.title}</h2>
          <ul className={styles.list}>{group.notifications.map(entry => entry.kind === "room" ? <li key={entry.id} className={`${styles.item} ${!entry.notification.readAt ? styles.unread : ""}`}>
            <span className={styles.icon} aria-hidden="true">{Ico.bell({ size: 20 })}</span>
            <span className={styles.itemText}>
              <strong className={styles.title}>{entry.notification.title}</strong>
              <span className={styles.subtitle}>{entry.notification.roomName} · {entry.notification.body}</span>
              <span className={styles.itemActions}>
                {roomHref(entry.notification) ? <Link href={roomHref(entry.notification)!}>{copy.open} →</Link> : null}
                {!entry.notification.readAt ? <button type="button" data-notification-id={entry.notification.id} onClick={markOneRead} disabled={loading || busy}>{copy.mark}</button> : null}
              </span>
            </span>
            <span className={styles.time}><time dateTime={entry.createdAt}>{formatNotificationTime(entry.createdAt)}</time>{!entry.notification.readAt ? <b>{copy.unread}</b> : null}</span>
            <span className={styles.chev} aria-hidden="true">›</span>
          </li> : <li key={entry.id} className={styles.item}>
            <Link href={`/tx/${entry.item.hash}`} className={styles.activityLink} aria-label={`${activityTitle(entry.item, copy)}. ${activityText("viewDetails")}`}>
              <span className={styles.icon} aria-hidden="true">{entry.item.direction === "sent" ? Ico.send({ size: 20 }) : Ico.arrowDown({ size: 20 })}</span>
              <span className={styles.itemText}>
                <strong className={styles.title}>{activityTitle(entry.item, copy)}</strong>
                <span className={styles.subtitle}>{activityContextName(entry.item, activityText) ?? (entry.item.counterparty && activityIdentities.get(entry.item.counterparty)?.handle ? `@${activityIdentities.get(entry.item.counterparty)!.handle}` : activityText("recordedOnStellar"))}</span>
              </span>
              <span className={styles.time}><time dateTime={entry.createdAt}>{formatNotificationTime(entry.createdAt)}</time></span>
              <span className={styles.chev} aria-hidden="true">›</span>
            </Link>
          </li>)}</ul>
        </section>)}
        {state && state.notifications.length > 0 ? <p className={styles.disclosure}>{copy.roomBound}</p> : null}
        {walletActivity.value?.items.length ? <p className={styles.disclosure}>{copy.activityBound}</p> : null}
      </>}
      <Link className={styles.backLink} href="/arisan">{copy.back} →</Link>
    </main>
  </div>;
}
