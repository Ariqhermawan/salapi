"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/I18nProvider";
import { formatLocal } from "@/lib/ui/currency";
import { Ico, T } from "@/components/ui/kit";
import { workspaceFollow, workspaceReview, workspaceSupport } from "@/app/circle-workspace-actions";
import { CATEGORY_LABEL } from "@/lib/circles/types";
import { workspaceReviewEligibility, type WorkspaceReview, type WorkspaceSnapshot } from "@/lib/circles/workspace";
import { actorFor, mediaFor, useWorkspace, useWorkspaceCopy, WorkspaceFrame, WorkspaceIdentity, WorkspaceImage, workspaceDate } from "./WorkspaceCommon";
import styles from "./Workspace.module.css";

export function WorkspaceReviews({ reviews, mode }: { reviews: WorkspaceReview[]; mode: "local" | "testnet" }) {
  const c = useWorkspaceCopy();
  return <div className={styles.reviews}>{reviews.length === 0 ? <p>{c("No donor review yet. Ratings are not pre-filled.", "Belum ada review donatur. Rating tidak diisi otomatis.")}</p> : reviews.map(review => <article key={review.id} className={styles.review}>
    <header><strong>{review.donorName}</strong><span aria-label={`${review.stars}/5`}>{Ico.star({ size: 15, c: T.action })}{review.stars}/5</span></header><p>{review.comment}</p><small>{mode === "local" ? c("Simulation review", "Review simulasi") : c("Testnet donor review", "Review donatur Testnet")} · <time dateTime={review.createdAt}>{workspaceDate(review.createdAt)}</time></small>
  </article>)}</div>;
}

export default function WorkspaceDetail({ initialSnapshot, campaignId }: { initialSnapshot: WorkspaceSnapshot; campaignId: string }) {
  const state = useWorkspace(initialSnapshot, campaignId);
  const { snapshot, busy, run } = state;
  const c = useWorkspaceCopy();
  const router = useRouter();
  const { currency } = useT();
  const [amount, setAmount] = useState("10");
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [tab, setTab] = useState<"story" | "updates" | "reviews">("updates");
  const campaign = snapshot.campaigns.find(item => item.id === campaignId);
  if (!campaign) return <WorkspaceFrame {...state} backHref="/circles/workspace"><section className={styles.empty}><h1>{c("Campaign unavailable", "Campaign tidak tersedia")}</h1><p>{c("This campaign does not exist in the current workspace or cannot be loaded.", "Campaign ini tidak ada di workspace saat ini atau gagal dimuat.")}</p><Link href="/circles/workspace">{c("Back to campaigns", "Kembali ke campaign")}</Link></section></WorkspaceFrame>;
  const organizer = actorFor(snapshot, campaign);
  const updates = snapshot.updates.filter(update => update.campaignId === campaign.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const reviews = snapshot.reviews.filter(review => review.campaignId === campaign.id);
  const owner = snapshot.actor?.id === campaign.organizerId;
  const support = snapshot.supports.find(item => item.campaignId === campaign.id && item.userId === snapshot.actor?.id);
  const following = snapshot.following.includes(campaign.id);
  const blockedReview = workspaceReviewEligibility(snapshot.actor, campaign, support, reviews);
  const path = `/circles/workspace/${campaign.id}`;
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.stars, 0) / reviews.length : null;

  async function supportCampaign(event: FormEvent) {
    event.preventDefault();
    await run(() => workspaceSupport(campaignId, amount), c("Local support saved. No XLM or money moved. Updates are available below.", "Dukungan lokal tersimpan. Tidak ada XLM atau uang berpindah. Update tersedia di bawah."));
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    const saved = await run(() => workspaceReview({ campaignId, stars, comment }), c("Your review was saved to this organizer's profile.", "Review tersimpan di profil organizer ini."));
    if (saved) { setComment(""); setStars(0); }
  }

  async function openFunding() {
    if (!campaign?.contractCampaignId) return;
    const followed = await run(() => workspaceFollow(campaignId, true), c("Following campaign updates. Opening D4 terms.", "Update campaign diikuti. Membuka ketentuan D4."));
    if (followed) router.push(`/campaigns?mode=testnet&id=${encodeURIComponent(campaign.contractCampaignId)}`);
  }

  return <WorkspaceFrame {...state} backHref="/circles/workspace" backLabel={c("Workspace", "Workspace")}>
    <header className={styles.detailHero}><WorkspaceImage media={mediaFor(snapshot, campaign.coverMediaId)} alt={campaign.title} className={styles.heroPhoto} /><div className={styles.heroCopy}><span>{CATEGORY_LABEL[campaign.category]}</span><h1>{campaign.title}</h1><p>{campaign.location}</p></div></header>
    <WorkspaceIdentity actor={organizer} href={`${path}/organizer`} />
    <section className={styles.warmCard} aria-label={c("Campaign terms", "Ketentuan campaign")}><dl className={styles.miniMetrics}><div><dt>{c("Display goal", "Target tampilan")}</dt><dd>{formatLocal(campaign.goalPHP, currency)}</dd></div><div><dt>{c("Campaign status", "Status campaign")}</dt><dd>{campaign.status === "completed" ? c("Completed", "Selesai") : c("Published", "Dipublikasikan")}</dd></div></dl>
      <div className={styles.allocation}><span>{c("Beneficiary", "Penerima manfaat")}<strong>{100 - campaign.allowancePct}%</strong></span><span>{c("Organizer allowance", "Imbalan organizer")}<strong>{campaign.allowancePct}%</strong></span></div>
      <p>{c("The displayed split is campaign information, not an escrow guarantee. A linked D4 contract controls its own immutable terms. Organizer completion is not third-party proof approval.", "Pembagian ini adalah informasi campaign, bukan jaminan escrow. Kontrak D4 yang terhubung memiliki ketentuan tetapnya sendiri. Status selesai oleh organizer bukan persetujuan bukti pihak ketiga.")}</p>
    </section>
    <div className={styles.actions}><button className={styles.secondary} type="button" disabled={busy || !snapshot.actor || Boolean(snapshot.unavailable)} onClick={() => void run(() => workspaceFollow(campaign.id, !following), following ? c("Campaign unfollowed.", "Campaign tidak lagi diikuti.") : c("Campaign followed. Its updates appear in your Following view.", "Campaign diikuti. Update akan muncul pada bagian Saya ikuti."))}>{Ico.bell({ size: 18, c: T.action })}{following ? c("Following updates", "Mengikuti update") : c("Follow updates", "Ikuti update")}</button>{owner ? <Link className={styles.primary} href={`${path}/manage`}>{c("Manage campaign", "Kelola campaign")}{Ico.chev({ size: 17, c: "#fff" })}</Link> : null}</div>
    {!owner && snapshot.mode === "local" ? <form className={styles.card} onSubmit={supportCampaign}><h2>{c("Try a local support", "Coba dukungan lokal")}</h2><p>{c("This creates a simulation record only. It does not debit a wallet, fund escrow or confirm a donation.", "Ini hanya membuat catatan simulasi. Tidak mendebit wallet, mendanai escrow atau mengonfirmasi donasi.")}</p><label className={styles.field}>{c("Simulation amount · XLM", "Jumlah simulasi · XLM")}<input inputMode="decimal" value={support ? support.amount : amount} onChange={event => setAmount(event.target.value)} maxLength={16} required disabled={busy || !snapshot.actor || campaign.status === "completed" || Boolean(support)} /></label><button className={styles.primary} type="submit" disabled={busy || !snapshot.actor || campaign.status === "completed" || Boolean(support) || Boolean(snapshot.unavailable)}>{support ? c("Local support already recorded", "Dukungan lokal sudah tercatat") : c("Save simulated support", "Simpan dukungan simulasi")}</button>{support ? <p className={styles.hint}>{support.amount} XLM · {c("Simulation, no funds moved", "Simulasi, tidak ada dana berpindah")}</p> : null}</form> : !owner && snapshot.mode === "testnet" ? <section className={styles.card}><h2>{c("Support on Stellar Testnet", "Dukung di Stellar Testnet")}</h2>{campaign.contractCampaignId ? <><p>{c("Follow this campaign's updates, then review the linked D4 amount, recipients and contract terms before signing. This page saves the follow preference only and does not submit a transaction.", "Ikuti update campaign, lalu tinjau jumlah, penerima dan ketentuan kontrak D4 sebelum menandatangani. Halaman ini hanya menyimpan pilihan mengikuti dan tidak mengirim transaksi.")}</p><button className={styles.primary} type="button" onClick={openFunding} disabled={busy || !snapshot.actor || Boolean(snapshot.unavailable)}>{c("Follow updates & open D4", "Ikuti update & buka D4")}{Ico.chev({ size: 17, c: "#fff" })}</button>{!snapshot.actor ? <Link className={styles.textLink} href="/signin">{c("Sign in to follow and open funding", "Masuk untuk mengikuti dan membuka pendanaan")}</Link> : null}<button className={styles.secondary} type="button" onClick={() => void state.refresh()} disabled={busy}>{c("Refresh confirmed contribution", "Muat ulang kontribusi terkonfirmasi")}</button></> : <p>{c("No D4 funding contract is linked. You can follow updates, but this campaign cannot receive funds from this screen.", "Belum ada kontrak pendanaan D4 terhubung. Anda dapat mengikuti update, tetapi campaign ini tidak dapat menerima dana dari halaman ini.")}</p>}</section> : null}
    <nav className={styles.tabs} aria-label={c("Campaign sections", "Bagian campaign")}>{([{ id: "story", label: c("Story", "Cerita") }, { id: "updates", label: `${c("Updates", "Update")} (${updates.length})` }, { id: "reviews", label: c("Reviews", "Review") }] as const).map(item => <button type="button" key={item.id} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
    {tab === "story" ? <section className={styles.card}><h2>{c("About this campaign", "Tentang campaign ini")}</h2><div className={styles.story}>{campaign.story.split(/\n\n+/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div><small>{c("Published", "Dipublikasikan")} <time dateTime={campaign.createdAt}>{workspaceDate(campaign.createdAt)}</time></small></section> : null}
    {tab === "updates" ? <section className={styles.timeline} aria-label={c("Organizer campaign updates", "Update campaign dari organizer")}>
      {updates.length === 0 ? <div className={styles.empty}><h2>{c("Waiting for the first update.", "Menunggu update pertama.")}</h2><p>{c("Follow this campaign and revisit the Following view. Organizers can publish progress, spending and delivery photos.", "Ikuti campaign ini dan buka bagian Saya ikuti. Organizer dapat mempublikasikan progres, pengeluaran dan foto penyaluran.")}</p></div> : updates.map(update => <article key={update.id} className={styles.update}>
        <header><span className={styles.updateKind}>{update.kind === "delivery" ? c("Delivery evidence", "Bukti penyaluran") : update.kind === "spend" ? c("Spending update", "Update pengeluaran") : c("Progress update", "Update progres")}</span><time dateTime={update.createdAt}>{workspaceDate(update.createdAt)}</time></header><h2>{update.title}</h2><p className={styles.updateBody}>{update.body}</p>
        <div className={styles.mediaGrid}>{update.mediaIds.map(id => { const media = mediaFor(snapshot, id); return <figure key={id}><WorkspaceImage media={media} alt={`${update.title}: ${media?.name ?? c("Organizer photo", "Foto organizer")}`} />{media ? <figcaption><a href={media.url} target="_blank" rel="noopener noreferrer">{c("Open stored photo", "Buka foto tersimpan")}{Ico.link({ size: 14, c: T.action })}</a><details><summary>SHA-256</summary><code>{media.sha256}</code></details></figcaption> : null}</figure>; })}</div>
        <small>{c("Organizer supplied. Not independently verified or approved for D4 release.", "Disediakan organizer. Belum diverifikasi independen atau disetujui untuk pencairan D4.")}</small>
      </article>)}
    </section> : null}
    {tab === "reviews" ? <section className={styles.card}><div className={styles.sectionHeader}><h2>{c("Donor reviews", "Review donatur")}</h2><span>{average === null ? c("Not rated", "Belum dinilai") : `${average.toFixed(1)}/5 · ${reviews.length}`}</span></div><p>{snapshot.mode === "local" ? c("Local simulation reviews only. These are not verified donor testimonials.", "Review simulasi lokal saja. Ini bukan testimoni donatur terverifikasi.") : c("One review per campaign from a donor with a confirmed, non-refunded D4 contribution after the linked contract is Released and delivery is completed.", "Satu review per campaign dari donatur dengan kontribusi D4 terkonfirmasi dan tidak direfund, setelah kontrak terhubung Released dan penyaluran selesai.")}</p><WorkspaceReviews reviews={reviews} mode={snapshot.mode} />
      {blockedReview ? <p className={styles.hint}>{blockedReview}</p> : <form className={styles.reviewForm} onSubmit={submitReview}><h3>{c("Your experience with this organizer", "Pengalaman Anda dengan organizer")}</h3><fieldset className={styles.stars} disabled={busy}><legend>{c("Rating · 1 to 5 stars", "Rating · 1 sampai 5 bintang")}</legend>{[1, 2, 3, 4, 5].map(value => <label key={value} data-selected={stars === value}><input type="radio" name="rating" value={value} checked={stars === value} required onChange={() => setStars(value)} aria-label={`${value} ${c(value === 1 ? "star" : "stars", "bintang")}`} /><span aria-hidden="true">{Ico.star({ size: 23, c: value <= stars ? T.action : "#91a0b6" })}</span><span>{value}</span></label>)}</fieldset><label className={styles.field}>{c("Review comment", "Komentar review")}<textarea minLength={10} maxLength={1000} required rows={4} value={comment} onChange={event => setComment(event.target.value)} disabled={busy} /></label><p className={styles.hint}>{c("Review the delivery and organizer's updates. Do not share private beneficiary information.", "Nilai penyaluran dan update organizer. Jangan bagikan informasi pribadi penerima.")}</p><button type="submit" className={styles.primary} disabled={busy || Boolean(snapshot.unavailable)}>{c("Publish review", "Publikasikan review")}</button></form>}
    </section> : null}
  </WorkspaceFrame>;
}
