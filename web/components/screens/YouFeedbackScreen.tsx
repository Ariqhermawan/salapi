"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bug, CaretRight, Lightbulb, Star, X } from "@phosphor-icons/react";
import SettingsScreen from "@/components/screens/SettingsScreen";
import { feedbackIdentity, submitFeedback } from "@/app/feedback-actions";
import { useT } from "@/components/I18nProvider";
import { Btn } from "@/components/ui/kit";
import styles from "./YouFeedbackScreen.module.css";
const PREVIEW = process.env.NEXT_PUBLIC_LOCAL_PREVIEW === "1";

type Choice = "bug" | "idea" | "rate";
type Copy = {
  title: string; intro: string; bug: string; bugHint: string; idea: string; ideaHint: string;
  rate: string; rateHint: string; close: string; cancel: string; back: string; message: string; placeholder: string;
  send: string; sending: string; loading: string; guest: string; signIn: string; unavailable: string;
  saved: string; failed: string; previewUnavailable: string; rating: string; thanks: string;
};

const COPY: Record<string, Copy> = {
  en: { title: "Send feedback", intro: "Pick one, then tell us more. It goes straight to the Salapi team.", bug: "Report a bug", bugHint: "Something looks wrong or does not work", idea: "Suggest an idea", ideaHint: "What would make Salapi better for you?", rate: "Rate Salapi", rateHint: "Tell us how it has been so far", close: "Close feedback", cancel: "Cancel", back: "Back to feedback choices", message: "Tell us more", placeholder: "Write a few details…", send: "Send to the Salapi team", sending: "Sending…", loading: "Checking your account…", guest: "Sign in to send feedback to the Salapi team.", signIn: "Sign in", unavailable: "Feedback is unavailable right now. Nothing was saved.", saved: "Thanks. Your feedback was sent to the Salapi team.", failed: "Feedback could not be sent. Try again later.", previewUnavailable: "Local preview only. Feedback was not sent.", rating: "Your rating", thanks: "Thank you for the rating." },
  id: { title: "Kirim masukan", intro: "Pilih satu, lalu ceritakan lebih lanjut. Masukan langsung dikirim ke tim Salapi.", bug: "Laporkan bug", bugHint: "Ada yang terlihat salah atau tidak berfungsi", idea: "Usulkan ide", ideaHint: "Apa yang bisa membuat Salapi lebih baik untukmu?", rate: "Beri nilai Salapi", rateHint: "Ceritakan pengalamanmu sejauh ini", close: "Tutup masukan", cancel: "Batal", back: "Kembali ke pilihan masukan", message: "Ceritakan lebih lanjut", placeholder: "Tulis beberapa detail…", send: "Kirim ke tim Salapi", sending: "Mengirim…", loading: "Memeriksa akun…", guest: "Masuk untuk mengirim masukan ke tim Salapi.", signIn: "Masuk", unavailable: "Masukan belum tersedia. Tidak ada yang disimpan.", saved: "Terima kasih. Masukanmu sudah dikirim ke tim Salapi.", failed: "Masukan belum bisa dikirim. Coba lagi nanti.", previewUnavailable: "Ini hanya pratinjau. Masukan tidak dikirim.", rating: "Nilai kamu", thanks: "Terima kasih atas nilainya." },
  tl: { title: "Magpadala ng feedback", intro: "Pumili muna, saka sabihin ang detalye. Diretso ito sa Salapi team.", bug: "Mag-ulat ng bug", bugHint: "May mukhang mali o hindi gumagana", idea: "Magmungkahi ng ideya", ideaHint: "Ano ang makakabuti pa sa Salapi para sa iyo?", rate: "I-rate ang Salapi", rateHint: "Sabihin kung kumusta ito sa ngayon", close: "Isara ang feedback", cancel: "Kanselahin", back: "Bumalik sa mga pagpipilian", message: "Sabihin pa", placeholder: "Magdagdag ng detalye…", send: "Ipadala sa Salapi team", sending: "Ipinapadala…", loading: "Sinusuri ang account…", guest: "Mag-sign in para magpadala ng feedback sa Salapi team.", signIn: "Mag-sign in", unavailable: "Hindi available ang feedback ngayon. Walang na-save.", saved: "Salamat. Naipadala na ang feedback sa Salapi team.", failed: "Hindi naipadala ang feedback. Subukan ulit mamaya.", previewUnavailable: "Preview lamang ito. Hindi ipinadala ang feedback.", rating: "Rating mo", thanks: "Salamat sa rating." },
  vi: { title: "Gửi phản hồi", intro: "Chọn một mục rồi chia sẻ thêm. Phản hồi sẽ gửi thẳng đến nhóm Salapi.", bug: "Báo lỗi", bugHint: "Có gì đó không ổn hoặc không hoạt động", idea: "Đề xuất ý tưởng", ideaHint: "Điều gì sẽ giúp Salapi tốt hơn cho bạn?", rate: "Đánh giá Salapi", rateHint: "Chia sẻ trải nghiệm của bạn đến lúc này", close: "Đóng phản hồi", cancel: "Hủy", back: "Quay lại lựa chọn", message: "Chia sẻ thêm", placeholder: "Viết thêm chi tiết…", send: "Gửi cho nhóm Salapi", sending: "Đang gửi…", loading: "Đang kiểm tra tài khoản…", guest: "Đăng nhập để gửi phản hồi cho nhóm Salapi.", signIn: "Đăng nhập", unavailable: "Hiện không thể gửi phản hồi. Chưa có nội dung nào được lưu.", saved: "Cảm ơn bạn. Phản hồi đã được gửi cho nhóm Salapi.", failed: "Không thể gửi phản hồi. Vui lòng thử lại sau.", previewUnavailable: "Đây chỉ là bản xem trước. Phản hồi chưa được gửi.", rating: "Đánh giá của bạn", thanks: "Cảm ơn bạn đã đánh giá." },
};

export default function YouFeedbackScreen() {
  const { locale } = useT();
  const copy = COPY[locale] ?? COPY.en;
  const router = useRouter();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [identity, setIdentity] = useState<{ ready: boolean; ownerId: string | null; failed: boolean }>({ ready: false, ownerId: null, failed: false });
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let active = true;
    if (PREVIEW) setIdentity({ ready: true, ownerId: "local-preview", failed: false });
    else void feedbackIdentity().then(result => {
      if (active) setIdentity({ ready: true, ownerId: result.ok ? result.ownerId ?? null : null, failed: !result.ok });
    }).catch(() => { if (active) setIdentity({ ready: true, ownerId: null, failed: true }); });
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") router.replace("/you"); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { active = false; window.removeEventListener("keydown", closeOnEscape); };
  }, [router]);

  function close() { router.replace("/you"); }
  function send() {
    if (!choice || !identity.ownerId || pending || choice === "rate" && rating === 0) return;
    const category = choice === "bug" ? "bug" : "suggestion";
    const finalMessage = choice === "rate" ? `Rating: ${rating}/5. ${message.trim()}` : message.trim();
    if (choice !== "rate" && finalMessage.length < 10 || finalMessage.length > 3000) return;
    if (PREVIEW) { setNotice({ tone: "error", text: copy.previewUnavailable }); return; }
    const expectedOwnerId = identity.ownerId;
    start(async () => {
      setNotice(null);
      try {
        const result = await submitFeedback({ expectedOwnerId, kind: "app_feedback", category, message: finalMessage });
        if (!result.ok) { setNotice({ tone: "error", text: result.error }); return; }
        setMessage("");
        setNotice({ tone: "success", text: copy.saved });
      } catch { setNotice({ tone: "error", text: copy.failed }); }
    });
  }

  const title = choice === "bug" ? copy.bug : choice === "idea" ? copy.idea : choice === "rate" ? copy.rate : copy.title;
  return <div className={styles.page}>
    <SettingsScreen />
    <div className={styles.layer}>
      <button type="button" className={styles.scrim} onClick={close} aria-label={copy.close} />
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="feedback-sheet-title">
        <div className={styles.handle} aria-hidden="true" />
        <header className={styles.header}>
          {choice ? <button type="button" className={styles.back} onClick={() => { setChoice(null); setNotice(null); }} aria-label={copy.back}>‹</button> : null}
          <h2 id="feedback-sheet-title">{choice ? title : copy.title}</h2>
          <button type="button" className={styles.close} onClick={close} aria-label={copy.close}><X size={20} /></button>
        </header>

        {!choice ? <>
          <p className={styles.intro}>{copy.intro}</p>
          <div className={styles.options}>
            {([
              ["bug", Bug, copy.bug, copy.bugHint],
              ["idea", Lightbulb, copy.idea, copy.ideaHint],
              ["rate", Star, copy.rate, copy.rateHint],
            ] as const).map(([value, Icon, label, hint]) => <button key={value} type="button" className={styles.option} onClick={() => { setChoice(value); setNotice(null); }}>
              <span className={styles.optionIcon}><Icon size={19} weight="regular" /></span>
              <span className={styles.optionCopy}><strong>{label}</strong><small>{hint}</small></span>
              <CaretRight size={17} className={styles.chevron} />
            </button>)}
          </div>
        </> : <div className={styles.form}>
          {!identity.ready ? <p role="status" className={styles.status}>{copy.loading}</p>
            : identity.failed ? <p role="alert" className={styles.status}>{copy.unavailable}</p>
            : !identity.ownerId ? <div className={styles.guest}><p>{copy.guest}</p><button type="button" onClick={() => router.push(`/signin?next=${encodeURIComponent("/you/feedback")}`)}>{copy.signIn} <CaretRight size={16} /></button></div>
            : <>
              {choice === "rate" ? <div className={styles.rateBlock}>
                <span>{copy.rating}</span>
                <div role="radiogroup" aria-label={copy.rating} className={styles.stars}>{[1, 2, 3, 4, 5].map(value => <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} / 5`} onClick={() => setRating(value)}><Star size={27} weight={rating >= value ? "fill" : "regular"} /></button>)}</div>
                <small>{copy.thanks}</small>
              </div> : null}
              <label className={styles.field}>{copy.message}
                <textarea value={message} maxLength={choice === "rate" ? 2950 : 3000} rows={4} placeholder={copy.placeholder} onChange={event => { setMessage(event.target.value); setNotice(null); }} disabled={pending} />
                <small>{message.trim().length}/3,000 {choice !== "rate" ? "· 10–3,000 characters" : "· Optional"}</small>
              </label>
              {notice ? <p className={notice.tone === "success" ? styles.success : styles.error} role={notice.tone === "success" ? "status" : "alert"}>{notice.text}</p> : null}
              <Btn loading={pending} disabled={pending || (choice === "rate" ? rating === 0 : message.trim().length < 10)} onClick={send}>{pending ? copy.sending : copy.send}</Btn>
              <p className={styles.privacy}>Only the Salapi team can read this message.</p>
            </>}
        </div>}
        <button type="button" className={styles.cancel} onClick={close}>{copy.cancel}</button>
      </section>
    </div>
  </div>;
}
