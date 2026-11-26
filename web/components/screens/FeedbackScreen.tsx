"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useT } from "@/components/I18nProvider";
import { feedbackIdentity, submitFeedback } from "@/app/feedback-actions";
import { AppBar, Btn, Card, IconButton, Ico } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import styles from "./FeedbackScreen.module.css";

type Kind = "app_feedback" | "campaign_feedback" | "campaign_report";
type Copy = {
  title: string; intro: string; category: string; message: string; placeholder: string;
  send: string; sending: string; saved: string; guest: string; signIn: string; loading: string;
  unavailable: string; reportIntro: string; campaign: string; min: string;
  errors: { [key: string]: string };
  categories: Record<string, string>;
};

const COPY: Record<string, Copy> = {
  en: {
    title: "Send feedback", intro: "Tell us what would make Salapi clearer or easier to use.", category: "What is this about?", message: "Your message", placeholder: "Share a suggestion, question, or problem…", send: "Send feedback", sending: "Sending…", saved: "Thanks. Your feedback was saved for the Salapi team.", guest: "Sign in to send feedback. Your message will be linked to your account so the team can follow up if needed.", signIn: "Sign in", loading: "Checking your account…", unavailable: "Feedback is unavailable right now. Nothing has been saved.", reportIntro: "Tell us what seems wrong. The campaign ID is checked against the public Testnet contract before your report is saved.", campaign: "Campaign", min: "10–3,000 characters", errors: { suggestion: "Suggestion", bug: "Something is not working", question: "Question", misleading: "Misleading information", inappropriate: "Inappropriate content", suspicious: "Suspicious activity", other: "Other", sendFailed: "Feedback could not be saved. Try again later." }, categories: { suggestion: "Suggestion", bug: "Something is not working", question: "Question", misleading: "Misleading information", inappropriate: "Inappropriate content", suspicious: "Suspicious activity", other: "Other" },
  },
  id: {
    title: "Kirim masukan", intro: "Beri tahu kami apa yang bisa membuat Salapi lebih jelas atau mudah digunakan.", category: "Tentang apa masukan ini?", message: "Pesan kamu", placeholder: "Tulis saran, pertanyaan, atau kendala…", send: "Kirim masukan", sending: "Mengirim…", saved: "Terima kasih. Masukanmu sudah disimpan untuk tim Salapi.", guest: "Masuk dulu untuk mengirim masukan. Pesan akan terhubung ke akunmu agar tim bisa menindaklanjuti bila perlu.", signIn: "Masuk", loading: "Memeriksa akun…", unavailable: "Fitur masukan sedang tidak tersedia. Tidak ada yang disimpan.", reportIntro: "Ceritakan hal yang menurutmu bermasalah. ID campaign akan dicek ke kontrak Testnet publik sebelum laporan disimpan.", campaign: "Campaign", min: "10–3.000 karakter", errors: { suggestion: "Saran", bug: "Ada yang tidak berfungsi", question: "Pertanyaan", misleading: "Informasi menyesatkan", inappropriate: "Konten tidak pantas", suspicious: "Aktivitas mencurigakan", other: "Lainnya", sendFailed: "Masukan belum bisa disimpan. Coba lagi nanti." }, categories: { suggestion: "Saran", bug: "Ada yang tidak berfungsi", question: "Pertanyaan", misleading: "Informasi menyesatkan", inappropriate: "Konten tidak pantas", suspicious: "Aktivitas mencurigakan", other: "Lainnya" },
  },
  tl: {
    title: "Magpadala ng feedback", intro: "Sabihin sa amin kung paano gawing mas malinaw at mas madaling gamitin ang Salapi.", category: "Tungkol saan ito?", message: "Mensahe mo", placeholder: "Magbahagi ng mungkahi, tanong, o problema…", send: "Ipadala", sending: "Ipinapadala…", saved: "Salamat. Na-save na ang feedback para sa Salapi team.", guest: "Mag-sign in para makapagpadala ng feedback.", signIn: "Mag-sign in", loading: "Sinusuri ang account…", unavailable: "Hindi available ang feedback ngayon. Walang na-save.", reportIntro: "Ilarawan ang problema. Susuriin ang campaign ID sa pampublikong Testnet contract bago i-save ang ulat.", campaign: "Campaign", min: "10–3,000 character", errors: { suggestion: "Mungkahi", bug: "May hindi gumagana", question: "Tanong", misleading: "Mapanlinlang na impormasyon", inappropriate: "Hindi angkop na content", suspicious: "Kahina-hinalang aktibidad", other: "Iba pa", sendFailed: "Hindi na-save ang feedback. Subukan ulit mamaya." }, categories: { suggestion: "Mungkahi", bug: "May hindi gumagana", question: "Tanong", misleading: "Mapanlinlang na impormasyon", inappropriate: "Hindi angkop na content", suspicious: "Kahina-hinalang aktibidad", other: "Iba pa" },
  },
  vi: {
    title: "Gửi phản hồi", intro: "Hãy cho chúng tôi biết cách giúp Salapi rõ ràng và dễ dùng hơn.", category: "Nội dung phản hồi", message: "Tin nhắn của bạn", placeholder: "Chia sẻ đề xuất, câu hỏi hoặc vấn đề…", send: "Gửi phản hồi", sending: "Đang gửi…", saved: "Cảm ơn bạn. Phản hồi đã được lưu cho nhóm Salapi.", guest: "Đăng nhập để gửi phản hồi.", signIn: "Đăng nhập", loading: "Đang kiểm tra tài khoản…", unavailable: "Hiện không thể gửi phản hồi. Chưa có nội dung nào được lưu.", reportIntro: "Mô tả vấn đề. ID chiến dịch sẽ được kiểm tra với hợp đồng Testnet công khai trước khi lưu báo cáo.", campaign: "Chiến dịch", min: "10–3.000 ký tự", errors: { suggestion: "Đề xuất", bug: "Có lỗi", question: "Câu hỏi", misleading: "Thông tin gây hiểu lầm", inappropriate: "Nội dung không phù hợp", suspicious: "Hoạt động đáng ngờ", other: "Khác", sendFailed: "Không thể lưu phản hồi. Vui lòng thử lại sau." }, categories: { suggestion: "Đề xuất", bug: "Có lỗi", question: "Câu hỏi", misleading: "Thông tin gây hiểu lầm", inappropriate: "Nội dung không phù hợp", suspicious: "Hoạt động đáng ngờ", other: "Khác" },
  },
};

const categoryValues: Record<Kind, string[]> = {
  app_feedback: ["suggestion", "bug", "question", "other"],
  campaign_feedback: ["suggestion", "question", "other"],
  campaign_report: ["misleading", "inappropriate", "suspicious", "other"],
};

export default function FeedbackScreen({ kind, campaignId }: { kind: Kind; campaignId?: string }) {
  const { locale } = useT();
  const copy = COPY[locale] ?? COPY.en;
  const back = useGoBack(kind === "app_feedback" ? "/you" : campaignId ? `/cause/${campaignId}` : "/causes");
  const [identity, setIdentity] = useState<{ status: "loading" | "ready" | "unavailable"; ownerId: string | null }>({ status: "loading", ownerId: null });
  const [category, setCategory] = useState(categoryValues[kind][0]);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const isReport = kind === "campaign_report";

  useEffect(() => {
    let current = true;
    void feedbackIdentity().then(result => {
      if (!current) return;
      setIdentity(result.ok ? { status: "ready", ownerId: result.ownerId ?? null } : { status: "unavailable", ownerId: null });
    }).catch(() => { if (current) setIdentity({ status: "unavailable", ownerId: null }); });
    return () => { current = false; };
  }, []);

  function send() {
    if (!identity.ownerId || message.trim().length < 10 || message.trim().length > 3000 || pending) return;
    const ownerId = identity.ownerId;
    start(async () => {
      setNotice(null);
      try {
        const result = await submitFeedback({ expectedOwnerId: ownerId, kind, category, message,
          ...(campaignId ? { campaignId } : {}) });
        if (!result.ok) { setNotice({ tone: "error", text: result.error }); return; }
        setMessage("");
        setNotice({ tone: "success", text: copy.saved });
      } catch { setNotice({ tone: "error", text: copy.errors.sendFailed }); }
    });
  }

  return <div className={styles.screen}>
    <AppBar leading={<IconButton ariaLabel="Back" onClick={back}>{Ico.back({})}</IconButton>} title={isReport ? "Report cause" : copy.title} />
    <main className={styles.body}>
      <section className={styles.hero}>
        <div><span className={styles.eyebrow}>{isReport ? "HELP KEEP SALAPI SAFE" : "YOUR VOICE MATTERS"}</span>
          <h1>{isReport ? "Report this cause" : copy.title}</h1>
          <p>{isReport ? copy.reportIntro : copy.intro}</p>
        </div><span className={styles.illustration} aria-hidden="true">{isReport ? "⚑" : "✉"}</span>
      </section>
      {campaignId ? <Card className={styles.campaign}><small>{copy.campaign}</small><strong>#{campaignId}</strong></Card> : null}
      {identity.status === "loading" ? <Card><p role="status">{copy.loading}</p></Card> : null}
      {identity.status === "unavailable" ? <Card><p role="alert">{copy.unavailable}</p></Card> : null}
      {identity.status === "ready" && !identity.ownerId ? <Card className={styles.guest}>
        <p>{copy.guest}</p><Link href="/signin" className={styles.signIn}>{copy.signIn} →</Link>
      </Card> : null}
      {identity.status === "ready" && identity.ownerId ? <Card className={styles.form}>
        <label className={styles.field}>{copy.category}
          <select value={category} onChange={event => setCategory(event.target.value)} disabled={pending}>
            {categoryValues[kind].map(value => <option key={value} value={value}>{copy.categories[value]}</option>)}
          </select>
        </label>
        <label className={styles.field}>{copy.message}
          <textarea value={message} onChange={event => { setMessage(event.target.value.slice(0, 3000)); setNotice(null); }}
            placeholder={copy.placeholder} minLength={10} maxLength={3000} rows={6} disabled={pending} />
          <small>{message.trim().length}/3,000 · {copy.min}</small>
        </label>
        {notice ? <p className={notice.tone === "success" ? styles.success : styles.error} role={notice.tone === "success" ? "status" : "alert"}>{notice.text}</p> : null}
        <Btn disabled={pending || message.trim().length < 10} loading={pending} onClick={send}>{pending ? copy.sending : copy.send}</Btn>
        <p className={styles.private}>Only the Salapi team can read this message. It is not shown publicly.</p>
      </Card> : null}
    </main>
  </div>;
}
