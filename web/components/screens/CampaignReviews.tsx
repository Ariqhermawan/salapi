"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { campaignRatingState, feedbackIdentity, submitCampaignRating } from "@/app/feedback-actions";
import { useT } from "@/components/I18nProvider";
import { Btn, Card } from "@/components/ui/kit";
import styles from "./CampaignReviews.module.css";

type State = Awaited<ReturnType<typeof campaignRatingState>>;

export default function CampaignReviews({ campaignId, title }: { campaignId: string; title?: string }) {
  const { locale } = useT();
  const [state, setState] = useState<State | null>(null);
  const [selected, setSelected] = useState(0);
  const [comment, setComment] = useState("");
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();

  const c = locale === "id" ? {
    title: "Ulasan donor", rate: "Nilai campaign ini", empty: "Belum ada ulasan donor.",
    login: "Masuk untuk memberi rating.", donor: "Hanya wallet yang punya kontribusi terkonfirmasi yang dapat memberi rating.",
    proof: "Kamu bisa memberi rating setelah penyelenggara mengirim bukti.", opening: "Bagaimana campaign ini berjalan?",
    share: "Ceritakan pengalamanmu (opsional)", send: "Kirim rating", close: "Nanti saja", star: "bintang",
    saved: "Rating kamu tersimpan.", note: "Rating adalah masukan donor. Rating tidak menyetujui bukti atau mencairkan dana.",
    author: "Donor Salapi", already: "Rating kamu", unavailable: "Rating campaign belum tersedia.",
  } : {
    title: "Donor reviews", rate: "Rate this cause", empty: "No donor reviews yet.",
    login: "Sign in to leave a rating.", donor: "Only wallets with a confirmed contribution can rate this cause.",
    proof: "You can rate after the organizer submits proof.", opening: "How did this cause do?",
    share: "Tell other donors more (optional)", send: "Send rating", close: "Not now", star: "stars",
    saved: "Your rating was saved.", note: "Ratings are donor feedback. They do not approve proof or release funds.",
    author: "Salapi donor", already: "Your rating", unavailable: "Campaign ratings are unavailable.",
  };

  async function refresh() {
    const value = await campaignRatingState(campaignId);
    setState(value);
    if (value.ok && value.viewer.rating !== null) {
      setSelected(value.viewer.rating);
      setComment(value.viewer.comment);
    }
  }
  useEffect(() => {
    let active = true;
    void campaignRatingState(campaignId).then(value => { if (active) setState(value); }).catch(() => {
      if (active) setState({ ok: false, error: "Campaign ratings could not be loaded." });
    });
    return () => { active = false; };
  }, [campaignId]);

  function saveRating() {
    if (!state?.ok || !state.viewer.canRate || !selected || pending) return;
    start(async () => {
      setNotice("");
      const identity = await feedbackIdentity();
      if (!identity.ok || !identity.signedIn || !identity.ownerId) { setNotice(c.login); return; }
      const result = await submitCampaignRating({ expectedOwnerId: identity.ownerId, campaignId, rating: selected, comment });
      if (!result.ok) { setNotice(result.error); return; }
      setOpen(false);
      setNotice(c.saved);
      await refresh();
    });
  }

  return <section id="campaign-reviews" className={styles.section} aria-labelledby="campaign-reviews-heading">
    {state === null ? <Card className={styles.loading} p={16}><p role="status">Loading donor reviews…</p></Card> : !state.ok ? <Card p={16}><p role="status">{c.unavailable}</p></Card> : <>
      <Card className={styles.summary} p={16}>
        <div className={styles.summaryHead}><h3 id="campaign-reviews-heading">{c.title} · {state.totalRatings}</h3>
          <strong><span aria-hidden="true">★</span> {state.totalRatings ? state.average.toFixed(1) : "—"}</strong></div>
        {state.ratings.length ? <div className={styles.reviews}>
          {state.ratings.map((review, index) => <article key={`${review.createdAt}:${index}`} className={styles.review}>
            <div><strong>{c.author}</strong><span className={styles.stars} aria-label={`${review.rating} ${c.star}`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span></div>
            {review.comment ? <p>{review.comment}</p> : <p className={styles.noComment}>—</p>}
          </article>)}
        </div> : <p className={styles.empty}>{c.empty}</p>}
        {state.viewer.canRate ? <button type="button" className={styles.rateButton} onClick={() => {
          setSelected(state.viewer.rating ?? 0); setComment(state.viewer.comment); setNotice(""); setOpen(true);
        }}><span aria-hidden="true">★</span> {state.viewer.rating === null ? c.rate : c.already}</button>
          : <p className={styles.eligibility}>{!state.viewer.signedIn ? <>{c.login} <Link href="/signin">Sign in →</Link></>
            : !state.viewer.hasDonated ? c.donor : c.proof}</p>}
        {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      </Card>
      <p className={styles.disclosure}>{c.note}</p>
      {open ? <div className={styles.overlay} role="presentation" onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
        <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="rating-sheet-title">
          <span className={styles.handle} aria-hidden="true" />
          <h3 id="rating-sheet-title">{c.opening}</h3>
          <p className={styles.causeName}>{title ?? state.campaign.title}</p>
          <p className={styles.disclosure}>{c.note}</p>
          <div className={styles.starsPicker} role="group" aria-label={c.opening}>
            {[1, 2, 3, 4, 5].map(rating => <button key={rating} type="button" aria-label={`${rating} ${c.star}`} aria-pressed={selected === rating}
              className={selected >= rating ? styles.starSelected : styles.star} onClick={() => setSelected(rating)}>★</button>)}
          </div>
          <label className={styles.comment}>{c.share}
            <textarea value={comment} maxLength={500} onChange={event => setComment(event.target.value)} rows={3} disabled={pending} />
            <small>{comment.length}/500</small>
          </label>
          {notice && <p className={styles.error} role="alert">{notice}</p>}
          <Btn disabled={pending || selected < 1} loading={pending} onClick={saveRating}>{pending ? "Saving…" : c.send}</Btn>
          <button type="button" className={styles.close} disabled={pending} onClick={() => setOpen(false)}>{c.close}</button>
        </section>
      </div> : null}
    </>}
  </section>;
}
