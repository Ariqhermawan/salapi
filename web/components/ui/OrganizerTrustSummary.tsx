"use client";

import { Star } from "@phosphor-icons/react/dist/csr/Star";
import { useT } from "@/components/I18nProvider";
import type { CircleOrganizer } from "@/lib/circles/organizers";
import type { Locale } from "@/lib/i18n/config";
import { homeCatalogCopy } from "@/lib/i18n/revamp-home-catalog";
import styles from "./OrganizerTrustSummary.module.css";

const trustCopy: Record<Locale, { noReviews: string; kycUnverified: string }> = {
  en: { noReviews: "No reviews yet", kycUnverified: "KYC not verified" },
  tl: { noReviews: "Wala pang review", kycUnverified: "Hindi pa beripikado ang KYC" },
  id: { noReviews: "Belum ada ulasan", kycUnverified: "KYC belum terverifikasi" },
  vi: { noReviews: "Chưa có nhận xét", kycUnverified: "KYC chưa được xác minh" },
};

/**
 * Fixture ratings are always labelled as examples. There is no public organizer
 * review or server-verified KYC source yet. Account email confirmation, mock KYC
 * outcomes and user-editable metadata must never grant a verified badge here.
 */
export default function OrganizerTrustSummary({ exampleOrganizer }: {
  exampleOrganizer?: Pick<CircleOrganizer, "rating" | "reviewCount">;
}) {
  const { locale } = useT();
  const copy = trustCopy[locale];
  const hasExampleRating = !!exampleOrganizer
    && Number.isFinite(exampleOrganizer.rating) && exampleOrganizer.rating >= 1 && exampleOrganizer.rating <= 5
    && Number.isSafeInteger(exampleOrganizer.reviewCount) && exampleOrganizer.reviewCount > 0;

  return <div className={styles.summary} data-testid="organizer-trust-summary" data-rating-source={hasExampleRating ? "example" : "none"} data-kyc-status="unverified">
    <div className={styles.rating}>
      <Star size={13} weight={hasExampleRating ? "fill" : "regular"} className={hasExampleRating ? styles.star : styles.emptyStar} aria-hidden="true" />
      {hasExampleRating ? <>
        <strong>{exampleOrganizer.rating.toFixed(1)}<span>/5</span></strong>
        <span>{homeCatalogCopy(locale, "Example rating")}</span>
        <small>{homeCatalogCopy(locale, "{count} example reviews", { count: exampleOrganizer.reviewCount })}</small>
      </> : <span>{copy.noReviews}</span>}
    </div>
    <span className={styles.verification}>{copy.kycUnverified}</span>
  </div>;
}
