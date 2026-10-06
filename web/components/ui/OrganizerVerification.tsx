"use client";

import { useT } from "@/components/I18nProvider";
import { Ico } from "@/components/ui/icons";
import styles from "./OrganizerVerification.module.css";
import type { Locale } from "@/lib/i18n/config";

const verificationCopy: Record<Locale, { ngo: string; individual: string; disclaimer: string }> = {
  en: { ngo: "NGO verified · demo", individual: "KYC checked · demo", disclaimer: "Demo verification, not an identity check." },
  id: { ngo: "NGO terverifikasi · simulasi", individual: "Sudah KYC · simulasi", disclaimer: "Verifikasi simulasi, bukan pemeriksaan identitas." },
  tl: { ngo: "Beripikadong NGO · demo", individual: "Nasuri ang KYC · demo", disclaimer: "Demo na beripikasyon, hindi pagsusuri ng pagkakakilanlan." },
  vi: { ngo: "NGO đã xác minh · mô phỏng", individual: "Đã kiểm tra KYC · mô phỏng", disclaimer: "Xác minh mô phỏng, không phải kiểm tra danh tính." },
};

/** A fictional profile attribute, never evidence of a real identity check. */
export default function OrganizerVerification({
  kind,
  compact = false,
}: {
  kind: "individual" | "ngo";
  compact?: boolean;
}) {
  const { locale } = useT();
  const copy = verificationCopy[locale] ?? verificationCopy.en;
  const label = kind === "ngo" ? copy.ngo : copy.individual;
  const color = kind === "ngo" ? "#8a6422" : "#2563eb";

  return (
    <span
      className={`${styles.badge} ${kind === "ngo" ? styles.ngo : styles.individual} ${compact ? styles.compact : ""}`}
      role="img"
      aria-label={`${label}. ${copy.disclaimer}`}
      title={copy.disclaimer}
    >
      <span aria-hidden="true">
        {kind === "ngo"
          ? Ico.verify({ size: compact ? 14 : 17, c: color })
          : Ico.shield({ size: compact ? 14 : 17, c: color })}
      </span>
      <span>{label}</span>
    </span>
  );
}
