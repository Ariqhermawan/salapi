"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useT } from "@/components/I18nProvider";
import { readCampaignUpdateSubscription, setCampaignUpdateSubscription } from "@/app/campaign-update-actions";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { isLocalPreview } from "@/lib/local-preview";
import type { CampaignUpdateSubscriptionState } from "@/lib/campaign-updates";
import styles from "./CampaignUpdateSubscription.module.css";

const COPY = {
  en: { title: "Organizer email updates", intro: "Optional updates for this QA Testnet campaign, sent to your verified account email.",
    loading: "Checking your account and subscription…", consent: "Email me when this campaign organizer publishes an update.",
    save: "Save email preference", unsubscribe: "Stop email updates", busy: "Saving…", saved: "Email preference saved.", stopped: "Email updates stopped.",
    disabled: "Email delivery is not configured yet. Your preference can be saved, but no emails are being sent.",
    unavailable: "Your account or this campaign subscription could not be loaded. Nothing was changed.", retry: "Try again", signin: "Sign in to choose email updates",
    privacy: "Your email is private. This choice does not authorize a payment or verify the organizer's claims." },
  id: { title: "Update organizer lewat email", intro: "Update opsional campaign QA Testnet ini memakai email akunmu yang terverifikasi.",
    loading: "Memeriksa akun dan langganan…", consent: "Kirim email saat organizer campaign ini menerbitkan update.",
    save: "Simpan pilihan email", unsubscribe: "Hentikan update email", busy: "Menyimpan…", saved: "Pilihan email tersimpan.", stopped: "Update email dihentikan.",
    disabled: "Pengiriman email belum dikonfigurasi. Pilihanmu dapat disimpan, tetapi belum ada email yang dikirim.",
    unavailable: "Akun atau langganan campaign belum dapat dimuat. Tidak ada perubahan.", retry: "Coba lagi", signin: "Login untuk memilih update email",
    privacy: "Emailmu tetap privat. Pilihan ini tidak mengizinkan pembayaran atau memverifikasi klaim organizer." },
  tl: { title: "Mga update sa email mula sa organizer", intro: "Opsyonal na update sa QA Testnet campaign gamit ang verified email ng account mo.",
    loading: "Sinusuri ang account at subscription…", consent: "Mag-email kapag may bagong update ang organizer ng campaign na ito.",
    save: "I-save ang pagpili sa email", unsubscribe: "Itigil ang mga email update", busy: "Sine-save…", saved: "Na-save ang pagpili sa email.", stopped: "Itinigil ang mga email update.",
    disabled: "Hindi pa naka-configure ang pagpapadala ng email. Maaaring i-save ang pagpili, pero walang email na ipinapadala.",
    unavailable: "Hindi ma-load ang account o subscription. Walang binago.", retry: "Subukan muli", signin: "Mag-sign in para pumili ng email update",
    privacy: "Pribado ang email mo. Hindi ito pahintulot sa pagbabayad o pag-verify ng mga pahayag ng organizer." },
  vi: { title: "Cập nhật qua email từ nhà tổ chức", intro: "Cập nhật tùy chọn của chiến dịch QA Testnet qua email tài khoản đã xác minh.",
    loading: "Đang kiểm tra tài khoản và đăng ký…", consent: "Gửi email khi nhà tổ chức chiến dịch đăng cập nhật.",
    save: "Lưu tùy chọn email", unsubscribe: "Dừng cập nhật email", busy: "Đang lưu…", saved: "Đã lưu tùy chọn email.", stopped: "Đã dừng cập nhật email.",
    disabled: "Chưa cấu hình gửi email. Bạn có thể lưu tùy chọn nhưng chưa có email nào được gửi.",
    unavailable: "Không tải được tài khoản hoặc đăng ký. Không có thay đổi.", retry: "Thử lại", signin: "Đăng nhập để chọn cập nhật email",
    privacy: "Email của bạn được giữ riêng tư. Lựa chọn này không cho phép thanh toán hoặc xác minh tuyên bố của nhà tổ chức." },
};
type State = CampaignUpdateSubscriptionState | { status: "loading" };

function Subscription({ campaignId }: { campaignId: string }) {
  const { locale } = useT();
  const c = COPY[locale];
  const enabled = supabaseConfigured() && !isLocalPreview;
  const [state, setState] = useState<State>(enabled ? { status: "loading" } : { ok: false, status: "guest", error: c.signin });
  const [notify, setNotify] = useState(false);
  const [message, setMessage] = useState<"saved" | "stopped" | "failed" | null>(null);
  const [pending, startTransition] = useTransition();
  const sequence = useRef(0), authOwner = useRef<string | null>(null), active = useRef(false);
  const reload = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;
    const version = sequence;
    active.current = true;
    if (!enabled) return () => { alive = false; active.current = false; version.current++; };
    async function read(requestedOwner: string) {
      const request = ++version.current;
      setState({ status: "loading" });
      setNotify(false); setMessage(null);
      try {
        const result = await readCampaignUpdateSubscription(campaignId);
        if (!alive || request !== version.current || authOwner.current !== requestedOwner) return;
        if (result.ok && result.ownerId !== requestedOwner) {
          setState({ ok: false, status: "unavailable", error: c.unavailable }); return;
        }
        setState(result); setNotify(result.ok && result.subscribed);
      } catch {
        if (alive && request === version.current) setState({ ok: false, status: "unavailable", error: c.unavailable });
      }
    }
    reload.current = () => { const current = authOwner.current; if (alive && current) void read(current); };
    let unsubscribe = () => {};
    try {
      const { data } = createSupabaseBrowser().auth.onAuthStateChange((event, session) => {
        if (!alive) return;
        const next = event === "SIGNED_OUT" ? null : session?.user.id ?? null;
        version.current++; authOwner.current = next;
        setNotify(false); setMessage(null);
        setState(next ? { status: "loading" } : { ok: false, status: "guest", error: c.signin });
        if (next) queueMicrotask(() => { if (alive) void read(next); });
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      queueMicrotask(() => { if (alive) setState({ ok: false, status: "unavailable", error: c.unavailable }); });
    }
    const focus = () => reload.current();
    window.addEventListener("focus", focus);
    return () => { alive = false; active.current = false; version.current++; authOwner.current = null; unsubscribe(); window.removeEventListener("focus", focus); };
  }, [campaignId, enabled, c.unavailable, c.signin]);

  function save(subscribed: boolean) {
    if (!("ok" in state) || !state.ok || pending || authOwner.current !== state.ownerId || (subscribed && !notify)) return;
    const requestedOwner = state.ownerId, request = sequence.current;
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await setCampaignUpdateSubscription({ campaignId, expectedOwnerId: requestedOwner, subscribed, notifyOk: subscribed && notify });
        if (!active.current || sequence.current !== request || authOwner.current !== requestedOwner) return;
        if (!result.ok) { setMessage("failed"); return; }
        setState({ ...state, subscribed: result.subscribed, providerConfigured: result.providerConfigured });
        setNotify(result.subscribed); setMessage(result.subscribed ? "saved" : "stopped");
      } catch {
        if (active.current && sequence.current === request) setMessage("failed");
      }
    });
  }
  const verified = "ok" in state && state.ok;
  return <section className={styles.card} aria-labelledby={`campaign-email-${campaignId}`} aria-busy={pending || state.status === "loading"}>
    <div className={styles.heading}><span aria-hidden="true" className={styles.icon}>@</span><div><h3 id={`campaign-email-${campaignId}`}>{c.title}</h3><p>{c.intro}</p></div></div>
    {state.status === "loading" ? <p role="status" className={styles.loading}>{c.loading}</p>
      : verified ? <>
        <div className={styles.email}><span>{state.email}</span><span className={styles.verified}>✓</span></div>
        <label className={styles.choice}><input type="checkbox" checked={notify} disabled={pending || state.subscribed} onChange={event => { setNotify(event.target.checked); setMessage(null); }} /><span>{c.consent}</span></label>
        {!state.providerConfigured ? <p className={styles.warning}>{c.disabled}</p> : null}
        <div className={styles.actions}>{state.subscribed
          ? <button type="button" disabled={pending} onClick={() => save(false)}>{pending ? c.busy : c.unsubscribe}</button>
          : <button type="button" disabled={pending || !notify} onClick={() => save(true)}>{pending ? c.busy : c.save}</button>}</div>
      </> : state.status === "guest" ? <Link className={styles.signin} href={`/signin?next=${encodeURIComponent(`/campaigns?id=${campaignId}`)}`}>{c.signin}</Link>
        : <div role="status"><p>{c.unavailable}</p><button type="button" className={styles.retry} onClick={() => reload.current()}>{c.retry}</button></div>}
    {message ? <p role={message === "failed" ? "alert" : "status"} className={message === "failed" ? styles.warning : styles.success}>{message === "failed" ? c.unavailable : c[message]}</p> : null}
    <p className={styles.privacy}>{c.privacy}</p>
  </section>;
}

export default function CampaignUpdateSubscription({ campaignId }: { campaignId: string }) {
  // Route changes remount private identity state immediately, before a new effect.
  return <Subscription key={campaignId} campaignId={campaignId} />;
}
