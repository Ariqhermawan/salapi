"use client";

import Link from "next/link";
import { useWorkspace, useWorkspaceCopy, WorkspaceFrame, WorkspaceIdentity, actorFor } from "./WorkspaceCommon";
import { WorkspaceCampaignCard } from "./WorkspaceList";
import { WorkspaceReviews } from "./WorkspaceDetail";
import type { WorkspaceSnapshot } from "@/lib/circles/workspace";
import styles from "./Workspace.module.css";

export default function WorkspaceOrganizer({ initialSnapshot, campaignId }: { initialSnapshot: WorkspaceSnapshot; campaignId: string }) {
  const state = useWorkspace(initialSnapshot, campaignId);
  const { snapshot } = state;
  const c = useWorkspaceCopy();
  const campaign = snapshot.campaigns.find(item => item.id === campaignId);
  if (!campaign) return <WorkspaceFrame {...state} backHref="/circles/workspace"><section className={styles.empty}><h1>{c("Organizer unavailable", "Organizer tidak tersedia")}</h1><Link href="/circles/workspace">{c("Back to campaigns", "Kembali ke campaign")}</Link></section></WorkspaceFrame>;
  const organizer = actorFor(snapshot, campaign);
  const campaigns = snapshot.campaigns.filter(item => item.organizerId === organizer.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const completed = campaigns.filter(item => item.status === "completed");
  const active = campaigns.filter(item => item.status !== "completed");
  const reviews = snapshot.reviews.filter(review => review.organizerId === organizer.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.stars, 0) / reviews.length : null;
  return <WorkspaceFrame {...state} backHref={`/circles/workspace/${campaign.id}`} backLabel={c("Campaign", "Campaign")}>
    <header className={styles.profileHeader}><span className={styles.eyebrow}>{c("Organizer profile", "Profil organizer")}</span><WorkspaceIdentity actor={organizer} heading /><p>{c("Identity not verified. A person or organization label does not establish KYC or NGO registration.", "Identitas belum diverifikasi. Label individu atau organisasi tidak membuktikan KYC atau pendaftaran NGO.")}</p></header>
    <div className={styles.summary}><span><strong>{completed.length}</strong>{c("Completed campaigns", "Campaign selesai")}</span><span><strong>{average === null ? "-" : average.toFixed(1)}<small>{average === null ? "" : "/5"}</small></strong>{reviews.length} {snapshot.mode === "local" ? c("simulation reviews", "review simulasi") : c("donor reviews", "review donatur")}</span></div>
    <p className={styles.modeNotice}>{snapshot.mode === "local" ? c("These histories and ratings come from records created in this local simulation. No invented history or pre-filled rating is mixed in.", "Riwayat dan rating ini berasal dari catatan yang dibuat dalam simulasi lokal ini. Tidak dicampur dengan riwayat rekaan atau rating yang diisi otomatis.") : c("Ratings are calculated from saved eligible donor reviews. Campaign completion is the organizer's statement, not independently verified delivery.", "Rating dihitung dari review donatur yang memenuhi syarat. Penyelesaian campaign adalah pernyataan organizer, bukan penyaluran yang diverifikasi independen.")}</p>
    <section><div className={styles.sectionHeader}><h2>{c("Current campaigns", "Campaign berjalan")}</h2><span>{active.length}</span></div><div className={styles.list}>{active.map(item => <WorkspaceCampaignCard key={item.id} campaign={item} snapshot={snapshot} />)}{active.length === 0 ? <p className={styles.empty}>{c("No active campaign.", "Tidak ada campaign berjalan.")}</p> : null}</div></section>
    <section><div className={styles.sectionHeader}><h2>{c("Completed history", "Riwayat selesai")}</h2><span>{completed.length}</span></div><div className={styles.list}>{completed.map(item => <WorkspaceCampaignCard key={item.id} campaign={item} snapshot={snapshot} />)}{completed.length === 0 ? <p className={styles.empty}>{c("No completed campaign yet. History is not invented.", "Belum ada campaign selesai. Riwayat tidak dibuat-buat.")}</p> : null}</div></section>
    <section className={styles.card}><h2>{c("Organizer reviews", "Review organizer")}</h2><WorkspaceReviews reviews={reviews} mode={snapshot.mode} />{reviews.length > 0 ? <ul className={styles.reviewCampaignLinks}>{reviews.map(review => <li key={review.id}><Link href={`/circles/workspace/${review.campaignId}`}>{c("View reviewed campaign", "Lihat campaign yang direview")}</Link></li>)}</ul> : null}</section>
  </WorkspaceFrame>;
}
