"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useT } from "@/components/I18nProvider";
import { arisanFundingReminderKey, buildArisanFundingCalendar, formatFundingDeadlineUtc, formatFundingReminderXlm, fundingReminderPhase, readArisanFundingReminder, saveArisanFundingReminder, type ArisanFundingReminderScope, type ArisanFundingReminderStatus, type FundingReminderRead, type FundingReminderStorage } from "@/lib/arisan-funding-reminders";
import styles from "./ArisanFundingReminder.module.css";

const copy = {
  en: {
    title: "Deposit reminders", optIn: "Show my remaining deposit when I open this room", limits: "In-app only on this browser while you open the room. Email and push aren't enabled. No automatic debit.", loading: "Checking this browser's reminder preference…", unavailable: "The reminder preference could not be verified or saved. It is not confirmed as enabled. Browser storage may be blocked.", retry: "Retry browser storage", invalid: "The current deposit or deadline could not be verified. Refresh the room before setting a reminder.", pending: "Reminder: your remaining deposit is", deadline: "Funding deadline", clock: "Times are shown in UTC. The contract determines whether a payment is accepted; a browser reminder does not extend the deadline.", overdue: "The displayed funding deadline has passed. Refresh the room and review cancellation or refund options. Do not submit a late deposit.", calendar: "Download calendar reminder", calendarHelp: "Import the .ics file into your calendar to request an alert before the deadline. Salapi cannot verify that you imported it or that your calendar will notify you. Remove the event yourself after funding or cancellation.", calendarFailure: "The calendar file could not be prepared. Refresh the room and check its deadline.", calendarPrepared: "Calendar file prepared. Import it yourself; no alert has been scheduled by Salapi.", remainingUnit: "Testnet XLM.", review: "Review the room terms before each voluntary installment. Testnet tokens have no monetary value.",
  },
  id: {
    title: "Pengingat deposit", optIn: "Tampilkan sisa deposit saat saya membuka room ini", limits: "Hanya di dalam aplikasi, di browser ini saat room dibuka. Email dan push belum aktif. Tidak ada autodebit.", loading: "Memeriksa preferensi pengingat di browser ini…", unavailable: "Preferensi pengingat belum dapat diverifikasi atau disimpan. Pengingat belum terkonfirmasi aktif. Penyimpanan browser mungkin diblokir.", retry: "Coba ulang penyimpanan browser", invalid: "Deposit atau tenggat saat ini belum dapat diverifikasi. Muat ulang room sebelum mengatur pengingat.", pending: "Pengingat: sisa deposit kamu", deadline: "Batas pelunasan", clock: "Waktu ditampilkan dalam UTC. Kontrak menentukan apakah pembayaran diterima; pengingat browser tidak memperpanjang batas waktu.", overdue: "Batas pelunasan yang ditampilkan telah lewat. Muat ulang room dan periksa opsi pembatalan atau refund. Jangan mengirim deposit terlambat.", calendar: "Unduh pengingat kalender", calendarHelp: "Impor file .ics ke kalender untuk meminta alarm sebelum tenggat. Salapi tidak dapat memastikan file sudah diimpor atau kalender akan mengingatkanmu. Hapus acara sendiri setelah lunas atau dibatalkan.", calendarFailure: "File kalender belum dapat disiapkan. Muat ulang room dan periksa tenggatnya.", calendarPrepared: "File kalender disiapkan. Impor sendiri; Salapi belum menjadwalkan alarm apa pun.", remainingUnit: "Testnet XLM.", review: "Periksa ketentuan room sebelum setiap cicilan sukarela. Token Testnet tidak memiliki nilai uang.",
  },
  tl: {
    title: "Mga paalala sa deposit", optIn: "Ipakita ang natitirang deposit kapag binuksan ko ang room na ito", limits: "Sa app lamang, sa browser na ito habang bukas ang room. Hindi pa aktibo ang email at push. Walang automatic debit.", loading: "Sinusuri ang reminder preference ng browser…", unavailable: "Hindi ma-verify o mai-save ang reminder preference. Hindi pa kumpirmadong aktibo. Maaaring naka-block ang browser storage.", retry: "Subukan muli ang browser storage", invalid: "Hindi ma-verify ang kasalukuyang deposit o deadline. I-refresh ang room bago magtakda ng paalala.", pending: "Paalala: ang natitirang deposit mo ay", deadline: "Deadline ng pagpondo", clock: "UTC ang oras. Ang kontrata ang magpapasya kung tatanggapin ang bayad; hindi pinapahaba ng paalala ang deadline.", overdue: "Lumipas na ang ipinapakitang deadline. I-refresh ang room at suriin ang cancellation o refund. Huwag magpadala ng late deposit.", calendar: "I-download ang calendar reminder", calendarHelp: "I-import ang .ics file sa calendar para humiling ng alert bago ang deadline. Hindi ma-verify ng Salapi ang import o notification. Burahin ang event pagkatapos makumpleto ang deposit o makansela ang room.", calendarFailure: "Hindi maihanda ang calendar file. I-refresh ang room at suriin ang deadline.", calendarPrepared: "Naihanda ang calendar file. I-import ito; walang alert na na-schedule ng Salapi.", remainingUnit: "Testnet XLM.", review: "Suriin ang terms bago ang bawat kusang hulog. Walang halaga sa pera ang Testnet tokens.",
  },
  vi: {
    title: "Nhắc nộp tiền", optIn: "Hiện khoản còn thiếu khi tôi mở phòng này", limits: "Chỉ trong ứng dụng trên trình duyệt này khi mở phòng. Email và push chưa được bật. Không tự động trừ tiền.", loading: "Đang kiểm tra tùy chọn nhắc trên trình duyệt…", unavailable: "Không thể xác minh hoặc lưu tùy chọn nhắc. Chưa xác nhận là đã bật. Bộ nhớ trình duyệt có thể bị chặn.", retry: "Thử lại bộ nhớ trình duyệt", invalid: "Không thể xác minh khoản tiền hoặc hạn hiện tại. Tải lại phòng trước khi đặt nhắc.", pending: "Nhắc nhở: khoản còn thiếu của bạn là", deadline: "Hạn góp đủ", clock: "Thời gian theo UTC. Hợp đồng quyết định nhận thanh toán; nhắc trên trình duyệt không gia hạn.", overdue: "Hạn được hiển thị đã qua. Tải lại phòng và kiểm tra hủy hoặc hoàn tiền. Đừng gửi tiền quá hạn.", calendar: "Tải nhắc lịch", calendarHelp: "Nhập tệp .ics vào lịch để yêu cầu thông báo trước hạn. Salapi không xác minh việc nhập hoặc thông báo. Tự xóa sự kiện khi đã góp đủ hoặc phòng bị hủy.", calendarFailure: "Không thể tạo tệp lịch. Tải lại phòng và kiểm tra hạn.", calendarPrepared: "Đã chuẩn bị tệp lịch. Hãy tự nhập; Salapi chưa lên lịch thông báo.", remainingUnit: "Testnet XLM.", review: "Xem điều khoản trước mỗi lần góp tự nguyện. Token Testnet không có giá trị tiền tệ.",
  },
};

const resetCopy = { en: "Turn off and reset this room's reminder", id: "Matikan dan reset pengingat room ini", tl: "I-off at i-reset ang paalala ng room", vi: "Tắt và đặt lại nhắc cho phòng này" };

function browserStorage(): FundingReminderStorage | null {
  try { return window.localStorage; } catch { return null; }
}

export type ArisanFundingReminderProps = ArisanFundingReminderScope & {
  deadline: number;
  remainingStroops: string;
  status: ArisanFundingReminderStatus;
};

export default function ArisanFundingReminder({ contractId, roomId, viewer, deadline, remainingStroops, status }: ArisanFundingReminderProps) {
  const { locale } = useT();
  const c = copy[locale];
  const inputId = useId();
  const calendarResources = useRef(new Map<string, number>());
  const scope = { contractId, roomId, viewer };
  const key = arisanFundingReminderKey(scope);
  const [preference, setPreference] = useState<{ key: string | null; value: FundingReminderRead } | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [calendarResult, setCalendarResult] = useState<{ key: string | null; success: boolean } | null>(null);
  const visible = status === "Open" && remainingStroops !== "0";
  const currentPreference = preference?.key === key ? preference.value : null;
  const phase = now === null ? "invalid" : fundingReminderPhase(status, remainingStroops, deadline, now);
  const enabled = currentPreference?.ok === true && currentPreference.enabled;
  const utcDeadline = formatFundingDeadlineUtc(deadline);
  const remaining = formatFundingReminderXlm(remainingStroops);

  useEffect(() => {
    if (!visible) return;
    // Scope changes render a loading state before this read. A previous
    // account's opt-in can never be displayed for the new wallet.
    const reload = () => setPreference({ key, value: readArisanFundingReminder(browserStorage(), { contractId, roomId, viewer }) });
    const initialRead = window.setTimeout(reload, 0);
    const storageChanged = (event: StorageEvent) => { if (event.key === key || event.key === null) reload(); };
    window.addEventListener("storage", storageChanged);
    window.addEventListener("focus", reload);
    return () => {
      window.clearTimeout(initialRead);
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener("focus", reload);
    };
  }, [contractId, roomId, viewer, key, visible]);

  useEffect(() => {
    if (!visible) return;
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    const initialTick = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(initialTick); window.clearInterval(interval); };
  }, [visible]);

  useEffect(() => {
    const resources = calendarResources.current;
    return () => {
      for (const [url, timer] of resources) {
        window.clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      resources.clear();
    };
  }, []);

  if (!visible || phase === "suppressed") return null;

  function toggle(enabled: boolean) {
    const storage = browserStorage();
    const saved = saveArisanFundingReminder(storage, scope, enabled);
    // A failed write/read-back must never produce an enabled success state.
    setPreference({ key, value: saved ? { ok: true, enabled } : { ok: false, reason: "storage_unavailable" } });
  }

  function downloadCalendar() {
    const calendar = buildArisanFundingCalendar(scope, { deadline, remainingStroops, now: Math.floor(Date.now() / 1000), status });
    if (!calendar) { setCalendarResult({ key, success: false }); return; }
    let url: string | null = null;
    try {
      url = URL.createObjectURL(new Blob([calendar.contents], { type: "text/calendar;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = calendar.filename;
      document.body.appendChild(anchor);
      try { anchor.click(); } finally { anchor.remove(); }
      const fileUrl = url;
      // Let the browser start reading the object URL before revoking it.
      // Every retained URL is also released if this component unmounts.
      const cleanup = window.setTimeout(() => {
        URL.revokeObjectURL(fileUrl);
        calendarResources.current.delete(fileUrl);
      }, 1000);
      calendarResources.current.set(fileUrl, cleanup);
      setCalendarResult({ key, success: true });
    } catch { setCalendarResult({ key, success: false }); }
    finally { if (url && !calendarResources.current.has(url)) URL.revokeObjectURL(url); }
  }

  return (
    <section className={styles.panel} aria-label={c.title}>
      <h2>{c.title}</h2>
      <label className={styles.toggle} htmlFor={inputId}>
        <input id={inputId} type="checkbox" checked={enabled} disabled={!key || currentPreference?.ok !== true || now === null || phase === "invalid"} onChange={event => toggle(event.currentTarget.checked)} />
        <span>{c.optIn}</span>
      </label>
      <p>{c.limits}</p>
      {!currentPreference ? <p role="status">{c.loading}</p> : !currentPreference.ok ? <p role="alert" className={styles.error}>{c.unavailable}</p> : null}
      {now !== null && phase === "invalid" ? <p role="alert" className={styles.error}>{c.invalid}</p> : null}
      {phase === "overdue" ? <div className={`${styles.notice} ${styles.overdue}`} role="status"><p>{c.overdue}</p></div> : enabled && phase === "pending" ? <div className={styles.notice} role="status"><p>{c.pending} <strong>{remaining} {c.remainingUnit}</strong></p></div> : null}
      {utcDeadline ? <p>{c.deadline}: <strong>{utcDeadline}</strong></p> : null}
      <p>{c.clock}</p>
      <div className={styles.actions}>
        {currentPreference?.ok === false && key ? <button type="button" onClick={() => setPreference({ key, value: readArisanFundingReminder(browserStorage(), scope) })}>{c.retry}</button> : null}
        {currentPreference?.ok === false && key ? <button type="button" onClick={() => toggle(false)}>{resetCopy[locale]}</button> : null}
        <button type="button" onClick={downloadCalendar} disabled={!key || phase !== "pending"}>{c.calendar}</button>
      </div>
      <p>{c.calendarHelp}</p>
      {calendarResult?.key === key ? <p role={calendarResult.success ? "status" : "alert"} className={calendarResult.success ? undefined : styles.error}>{calendarResult.success ? c.calendarPrepared : c.calendarFailure}</p> : null}
      <p>{c.review}</p>
    </section>
  );
}
