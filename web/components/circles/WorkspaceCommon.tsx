"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useT } from "@/components/I18nProvider";
import { Ico, T, PoweredByStellar } from "@/components/ui/kit";
import { workspaceLocalRole, workspaceSnapshot } from "@/app/circle-workspace-actions";
import type { WorkspaceActor, WorkspaceCampaign, WorkspaceMedia, WorkspaceSnapshot } from "@/lib/circles/workspace";
import styles from "./Workspace.module.css";

export function useWorkspaceCopy() {
  const { locale } = useT();
  return (english: string, indonesian: string) => locale === "id" ? indonesian : english;
}

type ActionResult = { ok: true; value: unknown } | { ok: false; error: string };

export function useWorkspace(initial: WorkspaceSnapshot, campaignId?: string) {
  const [snapshot, setSnapshot] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const c = useWorkspaceCopy();

  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try { setSnapshot(await workspaceSnapshot(campaignId)); }
    catch { setError(c("The workspace could not be refreshed. Please try again.", "Workspace gagal dimuat ulang. Coba lagi.")); }
    finally { lock.current = false; setBusy(false); }
  }

  async function run(action: () => Promise<ActionResult>, success: string): Promise<boolean> {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await action();
      if (!result.ok) { setError(result.error); return false; }
      try { setSnapshot(await workspaceSnapshot(campaignId)); setNotice(success); }
      catch { setNotice(success); setError(c("Saved, but refresh failed. Refresh before doing this again.", "Tersimpan, tetapi muat ulang gagal. Muat ulang sebelum mengulang tindakan ini.")); }
      return true;
    } catch {
      setError(c("The result could not be confirmed. Refresh before retrying to avoid a duplicate.", "Hasil belum dapat dikonfirmasi. Muat ulang sebelum mencoba lagi agar tidak membuat duplikat."));
      return false;
    } finally { lock.current = false; setBusy(false); }
  }
  return { snapshot, busy, error, notice, setError, setNotice, refresh, run };
}

export function workspaceDate(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(parsed)) : "";
}

export function mediaFor(snapshot: WorkspaceSnapshot, id: string | undefined) {
  return snapshot.media.find(media => media.id === id);
}

export function actorFor(snapshot: WorkspaceSnapshot, campaign: WorkspaceCampaign): WorkspaceActor {
  return snapshot.profiles.find(profile => profile.id === campaign.organizerId) ?? {
    id: campaign.organizerId, name: campaign.organizerName, kind: campaign.organizerKind, verification: "unverified",
  };
}

export function WorkspaceImage({ media, alt, className }: { media: WorkspaceMedia | undefined; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const c = useWorkspaceCopy();
  return media && !failed ? /* eslint-disable-next-line @next/next/no-img-element */
    <img className={className} src={media.url} alt={alt} onError={() => setFailed(true)} />
    : <div className={`${styles.imageMissing} ${className ?? ""}`}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="2" /><path d="m3 17 6-6 4 4 3-3 5 5" /></svg><span>{c("Photo unavailable", "Foto tidak tersedia")}</span></div>;
}

export function WorkspaceIdentity({ actor, href, heading = false }: { actor: WorkspaceActor; href?: string; heading?: boolean }) {
  const c = useWorkspaceCopy();
  const contents = <><span className={styles.avatar} aria-hidden="true">{actor.name.slice(0, 1).toUpperCase()}</span><div>{heading ? <h1>{actor.name}</h1> : <strong>{actor.name}</strong>}<small>{actor.kind === "ngo" ? c("Organization profile", "Profil organisasi") : c("Individual organizer", "Organizer individu")} · {c("Identity not verified", "Identitas belum diverifikasi")}</small></div>{href ? <span aria-hidden="true">{Ico.chev({ size: 17, c: T.action })}</span> : null}</>;
  return href ? <Link className={styles.identity} href={href}>{contents}</Link> : <div className={styles.identity}>{contents}</div>;
}

export function WorkspaceFrame({ snapshot, busy, error, notice, refresh, run, children, backHref = "/circles", backLabel }: {
  snapshot: WorkspaceSnapshot; busy: boolean; error: string; notice: string; refresh: () => Promise<void>;
  run: (action: () => Promise<ActionResult>, success: string) => Promise<boolean>;
  children: ReactNode; backHref?: string; backLabel?: string;
}) {
  const c = useWorkspaceCopy();
  const role = snapshot.localRole ?? (snapshot.actor ? "organizer" : "visitor");
  return <div className={styles.screen}>
    <nav className={styles.top} aria-label={c("Workspace navigation", "Navigasi workspace")}><Link href={backHref}>{Ico.back({ size: 17, c: T.action })}{backLabel ?? "Circles"}</Link><button type="button" className={styles.refresh} onClick={() => void refresh()} disabled={busy} aria-label={c("Refresh campaign workspace", "Muat ulang workspace campaign")}>{Ico.refresh({ size: 18, c: T.action })}</button></nav>
    <aside className={styles.modeNotice}>
      <strong>{snapshot.mode === "local" ? c("Local workspace", "Workspace lokal") : c("Testnet workspace", "Workspace Testnet")}</strong>
      <p>{snapshot.mode === "local" ? c("Saved on this localhost server. Role switching and support are simulations, not login, KYC or payments. Other devices cannot access this local dataset.", "Tersimpan di server localhost ini. Pergantian peran dan dukungan adalah simulasi, bukan login, KYC atau pembayaran. Perangkat lain tidak dapat mengakses data lokal ini.") : c("User-created campaigns. Identity is unverified. Funding only happens through a separately linked D4 Testnet contract.", "Campaign buatan pengguna. Identitas belum diverifikasi. Pendanaan hanya melalui kontrak D4 Testnet yang terhubung terpisah.")}</p>
      {snapshot.mode === "local" ? <label className={styles.roleLabel}>{c("Simulation role", "Peran simulasi")}<select aria-label={c("Simulation role", "Peran simulasi")} disabled={busy} value={role} onChange={event => { const selected = event.target.value as "organizer" | "donor" | "visitor"; void run(() => workspaceLocalRole(selected), c("Simulation role changed. No real identity verification.", "Peran simulasi berubah. Tidak ada verifikasi identitas nyata.")); }}><option value="organizer">{c("Organizer simulation", "Simulasi organizer")}</option><option value="donor">{c("Donor simulation", "Simulasi donatur")}</option><option value="visitor">{c("Visitor simulation", "Simulasi pengunjung")}</option></select></label> : snapshot.actor ? <p>{c("Signed in as", "Masuk sebagai")} <strong>{snapshot.actor.name}</strong></p> : <Link href="/signin">{c("Sign in to publish, follow or review", "Masuk untuk publish, mengikuti atau memberi review")}</Link>}
    </aside>
    {snapshot.unavailable ? <section className={styles.error} role="alert"><strong>{c("Workspace unavailable", "Workspace belum tersedia")}</strong><p>{snapshot.unavailable}</p></section> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {notice ? <p className={styles.success} role="status">{notice}</p> : null}
    {busy ? <p className={styles.busy} role="status">{c("Saving or refreshing…", "Menyimpan atau memuat ulang…")}</p> : null}
    {children}
    <footer className={styles.footer}><PoweredByStellar /><span>{c("Campaign content is organizer supplied, not verified delivery.", "Konten berasal dari organizer, bukan bukti pengiriman terverifikasi.")}</span></footer>
  </div>;
}
