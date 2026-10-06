"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/components/I18nProvider";
import { formatLocal } from "@/lib/ui/currency";
import { Ico, T } from "@/components/ui/kit";
import { CATEGORY_LABEL, type CircleCategory } from "@/lib/circles/types";
import type { WorkspaceCampaign, WorkspaceSnapshot } from "@/lib/circles/workspace";
import { actorFor, mediaFor, useWorkspace, useWorkspaceCopy, WorkspaceFrame, WorkspaceIdentity, WorkspaceImage, workspaceDate } from "./WorkspaceCommon";
import styles from "./Workspace.module.css";

export function WorkspaceCampaignCard({ campaign, snapshot }: { campaign: WorkspaceCampaign; snapshot: WorkspaceSnapshot }) {
  const c = useWorkspaceCopy();
  const { currency } = useT();
  const latest = snapshot.updates.filter(update => update.campaignId === campaign.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const path = `/circles/workspace/${campaign.id}`;
  return <article className={styles.campaignCard}>
    <Link href={path} className={styles.cardCover}><WorkspaceImage media={mediaFor(snapshot, campaign.coverMediaId)} alt={campaign.title} /><span className={styles.coverLabel}>{CATEGORY_LABEL[campaign.category]}</span></Link>
    <div className={styles.cardBody}><div className={styles.cardMeta}><span>{campaign.location}</span><span className={styles.status}>{campaign.status === "completed" ? c("Organizer completed", "Diselesaikan organizer") : c("Published", "Dipublikasikan")}</span></div>
      <h2><Link href={path}>{campaign.title}</Link></h2>
      <WorkspaceIdentity actor={actorFor(snapshot, campaign)} href={`${path}/organizer`} />
      <dl className={styles.miniMetrics}><div><dt>{c("Display goal", "Target tampilan")}</dt><dd>{formatLocal(campaign.goalPHP, currency)}</dd></div><div><dt>{c("Organizer allowance", "Imbalan organizer")}</dt><dd>{campaign.allowancePct}%</dd></div></dl>
      {latest ? <p className={styles.latest}><strong>{c("Latest update", "Update terbaru")}</strong>{latest.title}<time dateTime={latest.createdAt}>{workspaceDate(latest.createdAt)}</time></p> : <p className={styles.latest}>{c("No update published yet.", "Belum ada update yang dipublikasikan.")}</p>}
      <Link className={styles.cardLink} href={path}>{c("View campaign and updates", "Lihat campaign dan update")}{Ico.chev({ size: 17, c: T.action })}</Link>
    </div>
  </article>;
}

type Filter = "all" | "mine" | "supported" | "following" | "completed";

export default function WorkspaceList({ initialSnapshot }: { initialSnapshot: WorkspaceSnapshot }) {
  const state = useWorkspace(initialSnapshot);
  const { snapshot } = state;
  const c = useWorkspaceCopy();
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<"all" | CircleCategory>("all");
  const actorId = snapshot.actor?.id;
  const supported = new Set(snapshot.supports.filter(support => support.userId === actorId).map(support => support.campaignId));
  const following = new Set(snapshot.following);
  const filtered = snapshot.campaigns.filter(campaign => (category === "all" || campaign.category === category) && (
    filter === "all" || filter === "mine" && campaign.organizerId === actorId || filter === "supported" && supported.has(campaign.id) || filter === "following" && following.has(campaign.id) || filter === "completed" && campaign.status === "completed"
  )).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const filters: { id: Filter; label: string }[] = [{ id: "all", label: c("All", "Semua") }, { id: "mine", label: c("My campaigns", "Campaign saya") }, { id: "supported", label: c("Supported", "Saya dukung") }, { id: "following", label: c("Following", "Saya ikuti") }, { id: "completed", label: c("Completed", "Selesai") }];
  return <WorkspaceFrame {...state}>
    <header className={styles.pageHeader}><span className={styles.eyebrow}>{c("Create. Deliver. Stay accountable.", "Buat. Salurkan. Tetap transparan.")}</span><h1>{c("Campaign workspace", "Workspace campaign")}</h1><p>{c("Publish your own cause, share delivery updates and read donor reviews. This dataset is separate from fictional example campaigns.", "Publish campaign sendiri, bagikan update penyaluran dan baca review donatur. Data ini terpisah dari campaign contoh fiktif.")}</p></header>
    <Link className={styles.primary} href="/circles/workspace/create">{Ico.plus({ size: 19, c: "#fff" })}{c("Publish a campaign", "Publish campaign baru")}</Link>
    <div className={styles.summary}><span><strong>{snapshot.campaigns.length}</strong>{c("Published campaigns", "Campaign dipublikasikan")}</span><span><strong>{snapshot.updates.length}</strong>{c("Organizer updates", "Update organizer")}</span></div>
    {snapshot.mode === "testnet" ? <p className={styles.hint}>{c("The Supported view checks up to 20 followed, linked D4 campaigns per refresh. It is not your complete wallet donation history. Follow a campaign before funding it so its updates stay in this workspace.", "Bagian Saya dukung memeriksa maksimal 20 campaign D4 terhubung yang diikuti setiap muat ulang. Ini bukan seluruh riwayat donasi wallet. Ikuti campaign sebelum mendanainya agar update tetap muncul di workspace.")}</p> : null}
    <nav className={styles.filters} aria-label={c("Campaign filters", "Filter campaign")}>{filters.map(item => <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}</nav>
    <label className={styles.field}>{c("Category", "Kategori")}<select value={category} onChange={event => setCategory(event.target.value as "all" | CircleCategory)}><option value="all">{c("All categories", "Semua kategori")}</option>{Object.entries(CATEGORY_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <section className={styles.list} aria-label={c("Published user campaigns", "Campaign pengguna yang dipublikasikan")}>
      {filtered.map(campaign => <WorkspaceCampaignCard key={campaign.id} campaign={campaign} snapshot={snapshot} />)}
      {filtered.length === 0 ? <div className={styles.empty}><span aria-hidden="true">{Ico.globe({ size: 30, c: T.action })}</span><h2>{c("No campaigns in this view yet.", "Belum ada campaign di bagian ini.")}</h2><p>{c("Publish a campaign, follow a cause, or change your filters. Fictional examples are not counted here.", "Publish campaign, ikuti suatu campaign, atau ubah filter. Campaign contoh fiktif tidak dihitung di sini.")}</p>{filter !== "all" || category !== "all" ? <button className={styles.secondary} type="button" onClick={() => { setFilter("all"); setCategory("all"); }}>{c("Clear filters", "Hapus filter")}</button> : null}</div> : null}
    </section>
    <Link className={styles.textLink} href="/circles">{c("Explore separate fictional examples", "Jelajahi contoh fiktif yang terpisah")}{Ico.chev({ size: 17, c: T.action })}</Link>
  </WorkspaceFrame>;
}
