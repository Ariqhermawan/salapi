"use client";

import Link from "next/link";
import Image from "next/image";
import { Ico, T, PoweredByStellar } from "@/components/ui/kit";
import { useT } from "@/components/I18nProvider";
import { SEED_CIRCLES } from "@/lib/circles/seed";
import { progressPct, type Circle, type CircleCategory } from "@/lib/circles/types";
import { isLocalPreview } from "@/lib/local-preview";
import styles from "./CirclesDiscoverRevamp.module.css";
import { getOrganizerForCircle } from "@/lib/circles/organizers";
import OrganizerVerification from "@/components/ui/OrganizerVerification";
import ExampleOrganizerAvatar from "@/components/ui/ExampleOrganizerAvatar";
import { circlesCopy, circlesCategory } from "@/lib/i18n/revamp-circles";
import { campaignDiscoveryCopy } from "@/lib/i18n/revamp-campaign-discovery";
import CauseCategoryPicker from "@/components/CauseCategoryPicker";
import { parseCauseViewState } from "@/lib/home-circles";
import { useNavigationViewState } from "@/lib/ui/useNavigationViewState";
import { writeNavigationViewState } from "@/lib/ui/app-navigation";
import { useGoBack } from "@/lib/ui/useGoBack";
import CampaignDonationBadge from "@/components/CampaignDonationBadge";
import { useOwnedAccountRead } from "@/lib/ui/useOwnedAccountRead";
import { validCampaignSupport } from "@/lib/campaign-support";

const photos: Partial<Record<CircleCategory, string>> = {
  disaster: "/circles/disaster.jpg",
  medical: "/circles/medical.jpg",
  education: "/circles/education.jpg",
};

// Purpose summaries describe fictional examples, not verified needs, funding
// progress, platform economics or promises about a future release.
const examplePurpose: Record<string, string> = {
  "tino-relief": "A fictional fishing-community recovery cause, exploring shared support for boats and rebuilding materials.",
  "ate-mei-dialysis": "A sample medical-support cause. This prototype does not collect donations or verify medical needs.",
  "arisan-banjir-jakarta": "A fictional community-kitchen cause for flood recovery in North Jakarta.",
  "barangay-library": "An example school-library idea for books, shelves and learning materials.",
  "ofw-family-tuition": "A fictional family education-support cause, not a verified fundraiser.",
  "creator-baybayin": "An example zine-printing project, exploring how people could support a creative cause.",
};

type Sort = "all" | "trending" | "closeToGoal" | "justLaunched";
export function selectCircleExamples(circles: readonly Circle[], category: CircleCategory | "all", sort: Sort): Circle[] {
  const visible = circles.filter(circle => category === "all" || circle.category === category);
  if (sort === "trending") visible.sort((a, b) => b.donorCount - a.donorCount);
  else if (sort === "closeToGoal") visible.sort((a, b) => progressPct(b) - progressPct(a));
  else if (sort === "justLaunched") visible.sort((a, b) => b.daysRemaining - a.daysRemaining);
  return visible;
}

export default function CirclesDiscoverScreen({ campaignEntry = false }: { campaignEntry?: boolean } = {}) {
  const goBack = useGoBack(campaignEntry ? "/" : "/vaults");
  const { t, locale } = useT();
  const c = circlesCopy(locale);
  const discovery = campaignDiscoveryCopy(locale);
  const { category: filter, sort } = parseCauseViewState(useNavigationViewState("circles-discovery"));
  const setFilter = (category: CircleCategory | "all") => writeNavigationViewState("circles-discovery", { category, sort });
  const setSort = (nextSort: Sort) => writeNavigationViewState("circles-discovery", { category: filter, sort: nextSort });
  const visible = selectCircleExamples(SEED_CIRCLES, filter, sort);
  const support = useOwnedAccountRead(`/api/account/campaign-support?circles=${SEED_CIRCLES.map(circle => circle.id).join(",")}`, validCampaignSupport);
  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <button type="button" onClick={goBack} className={styles.back}>
          {Ico.back({ size: 17, c: T.action })}{c("Back")}</button>
        {campaignEntry ? <strong>{discovery("Donation campaigns")}</strong> : null}
        <span className={styles.badge}>{c("Circles prototype")}</span>
      </div>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>{c("Ideas for giving together")}</span>
          <h1>{c("A cause can bring us closer.")}</h1>
          <p>{c("Explore the original Circles concept. Every cause shown below is an example.")}</p>
        </div>
        <Image src="/illustrations/giving.png" width={130} height={110} alt={c("Two people sharing a blue heart")} />
      </header>
      {!campaignEntry && <Link href="/campaigns?mode=testnet" className={styles.liveLink}>
        <span className={styles.bridgeIcon}>{Ico.vault({ size: 27, c: "#a8c8ff" })}</span>
        <div>
          <strong>{c("Open donation campaigns")}</strong>
          <span>
            {isLocalPreview
              ? c("Explore escrow and proof review with local sample data. No transactions.")
              : c("Explore Testnet campaign escrow, proof review and two wallet approvals.")}
          </span>
        </div>
        {Ico.chev({ size: 19, c: "#a8c8ff" })}
      </Link>}
      <p className={styles.notice}>{c("Fictional causes, AI photos and example ratings. Verification badges are simulated. No live donations or on-chain receipts.")}</p>
      {isLocalPreview ? <Link href="/circles/supported" className={styles.supportedLink}><span>{Ico.vault({size:18,c:T.action})}{" "}{c("My supported causes")}</span><span>{c("Follow local demo updates")}{" "}{Ico.chev({size:16,c:T.action})}</span></Link> : null}
      <div className={styles.sectionHeading}>
        <h2>{c("Explore causes")}</h2>
        <span role="status">{c(visible.length === 1 ? "{count} example" : "{count} examples", { count: visible.length })}</span>
      </div>
      <CauseCategoryPicker circles={SEED_CIRCLES} selected={filter} locale={locale} onSelect={setFilter}/>
      <label className={styles.sort} htmlFor="circles-sort">{c("Sort causes")}<select id="circles-sort" value={sort} onChange={event => setSort(event.target.value as Sort)}>
          <option value="all">{t("circles.filterAll")}</option>
          <option value="trending">{t("circles.filterTrending")}</option>
          <option value="closeToGoal">{t("circles.filterCloseToGoal")}</option>
          <option value="justLaunched">{t("circles.filterJustLaunched")}</option>
        </select>
      </label>
      <section key={`${filter}:${sort}`} className={`${styles.list} sl-state-enter`} aria-label={c("Example circles")}>
        {visible.map((circle) => {
          const organizer = getOrganizerForCircle(circle);
          return (
          <article key={circle.id} className={styles.exampleCard}>
            <div className={styles.photo}>
              <Image
                src={circle.coverImage ?? photos[circle.category] ?? "/illustrations/giving.png"}
                width={600}
                height={220}
                className={circle.coverImage || photos[circle.category] ? styles.photoCover : styles.illustratedCover}
                alt={
                  circle.coverImage ? circle.imageAlt ?? c("AI-generated fictional campaign illustration") : photos[circle.category]
                    ? c("AI-generated fictional campaign illustration")
                    : c("Two people sharing a blue heart")
                }
              />
              <span className={styles.photoLabel}>
                {circlesCategory(locale, circle.category)}
              </span>
              <span className={styles.aiLabel}>{c("AI illustration")}</span>
              <span className={styles.donationMark}><CampaignDonationBadge support={support.value?.contributions[support.value.circleCampaigns?.[circle.id] ?? ""]} /></span>
            </div>
            <div className={styles.cardBody}>
              <span className={styles.exampleLabel}>{c("Example cause")}</span>
              <h2>{circle.title}</h2>
              <Link className={styles.organizerLink} href={`/circles/${circle.id}/organizer`}>{organizer && <ExampleOrganizerAvatar organizer={organizer} size={36} />}<strong>{circle.organizer}</strong>{Ico.chev({size:15,c:T.action})}</Link>
              {organizer ? <OrganizerVerification kind={organizer.kind} compact /> : null}
              <span className={styles.location}>{circle.organizerLocation}{" "}{c("· Example organizer")}</span>
              <p>{circle.summary ?? examplePurpose[circle.id] ?? c("A fictional cause for exploring the Circles prototype.")}</p>
              <div className={styles.feeLine}><span>{c("Beneficiary")}{" "}<strong>{100-(circle.allowance?.percentage ?? 0)}%</strong></span><span>{c("Organizer operations")}{" "}<strong>{circle.allowance?.percentage ?? 0}%</strong></span></div>
              <Link href={`/circles/${circle.id}`} className={styles.cardLink}>{c("Explore this concept")}{Ico.chev({ size: 16, c: T.action })}
              </Link>
            </div>
          </article>
        );})}
      </section>
      {visible.length === 0 && (
        <div className={styles.empty}>
          <h3>{c("No example in this category yet.")}</h3>
          <p>{c("Choose another category to explore the concept.")}</p>
        </div>
      )}
      <Link href="/circles/create" className={styles.cta}>
        <span className={styles.ctaIcon}>{Ico.plus({ size: 22, c: T.action })}</span>
        <div>
          <strong>{c("Sketch your own cause")}</strong>
          <span>{c("Save a complete draft in this browser.")}</span>
        </div>
        {Ico.chev({ size: 17, c: T.action })}
      </Link>
      <footer className={styles.footer}>
        <PoweredByStellar />
        <span>{t("circles.previewNotOnChain")}</span>
      </footer>
    </div>
  );
}
