"use client";

import Link from "next/link";
import { useT } from "@/components/I18nProvider";
import { useWorkspaceAvailability } from "./WorkspaceAvailabilityProvider";
import styles from "./WorkspaceEntry.module.css";

/** User-authored campaigns are separate from the fictional fixture catalog. */
export default function WorkspaceEntry({ create = false }: { create?: boolean }) {
  const available = useWorkspaceAvailability();
  const { locale } = useT();
  if (!available) return null;
  const id = locale === "id";
  return <Link className={styles.entry} href={create ? "/circles/workspace/create" : "/circles/workspace"}>
    <span className={styles.icon} aria-hidden="true">{create ? "+" : "↗"}</span>
    <span><strong>{create ? id ? "Buka campaign dengan foto" : "Publish a campaign with photos" : id ? "Campaign komunitas & donasi saya" : "Community campaigns & my support"}</strong><small>{id ? "Upload, update penyaluran, dan review. Terpisah dari contoh fiktif." : "Uploads, delivery updates and reviews. Separate from fictional examples."}</small></span>
    <span className={styles.chevron} aria-hidden="true">›</span>
  </Link>;
}
