"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useT } from "@/components/I18nProvider";
import { Ico, T, PoweredByStellar } from "@/components/ui/kit";
import { CURRENCY, formatLocalAmount } from "@/lib/ui/currency";
import { isLocalPreview } from "@/lib/local-preview";
import { getCircle } from "@/lib/circles/seed";
import { circleDisplayContent } from "@/lib/i18n/circles-content";
import { circlesCopy } from "@/lib/i18n/revamp-circles";
import type { Circle, CircleCategory } from "@/lib/circles/types";
import { readLocalSupports, markCircleUpdatesSeen, unreadSupportUpdates, type LocalSupportRecord } from "@/lib/circles/local-support";
import styles from "./SupportedCirclesRevamp.module.css";

const photos: Partial<Record<CircleCategory, string>> = { disaster: "/circles/disaster.jpg", medical: "/circles/medical.jpg", education: "/circles/education.jpg" };

function supportAmount(record: LocalSupportRecord, field: "totalMinor" | "beneficiaryMinor" | "organizerMinor" = "totalMinor") {
  return formatLocalAmount(Number(record[field]) / 10 ** CURRENCY[record.currency].dp, record.currency);
}

function formattedDate(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(parsed)) : value;
}

export default function SupportedCirclesScreen() {
  const { locale } = useT();
  const c = circlesCopy(locale);
  const [supports, setSupports] = useState<LocalSupportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ circleId: string; text: string; ok: boolean } | null>(null);
  useEffect(() => {
    Promise.resolve().then(() => { setSupports(readLocalSupports()); setLoading(false); });
  }, []);

  const grouped = new Map<string, LocalSupportRecord[]>();
  supports.forEach((support) => { grouped.set(support.circleId, [...(grouped.get(support.circleId) ?? []), support]); });
  const causes = [...grouped].flatMap(([id, records]) => {
    const circle = getCircle(id);
    return circle ? [{ circle, records, latest: records[0], unread: unreadSupportUpdates(records[0], circle.updates ?? []) }] : [];
  });
  const unreadTotal = causes.reduce((sum, cause) => sum + cause.unread, 0);

  function markSeen(circle: Circle) {
    const ok = markCircleUpdatesSeen(circle.id, (circle.updates ?? []).map((update) => update.id));
    setNotice({ circleId: circle.id, ok, text: ok ? "Example updates marked as seen in this browser tab." : "Browser session storage could not save the seen state. No update was marked as saved." });
    if (ok) setSupports(readLocalSupports());
  }

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <Link className={styles.back} href="/circles">{Ico.back({ size: 18, c: T.action })} Circles</Link>
        <span className={styles.badge}>Local demo</span>
      </div>
      <header className={styles.header}>
        <div><h1>My supported causes</h1><p>Keep a clearer view of what happens next.</p></div>
        <Image src="/illustrations/giving.png" width={95} height={85} alt="Two people sharing a blue heart" />
      </header>
      <p className={styles.notice}>Browser-tab donation demos only. No payment, verified delivery or on-chain receipt. Closing this session can remove its local history.</p>
      {!loading && isLocalPreview ? <div className={styles.summary}><span><strong>{causes.length}</strong> followed {causes.length === 1 ? "cause" : "causes"}</span><span><strong>{unreadTotal}</strong> unread example updates</span><button type="button" onClick={() => setSupports(readLocalSupports())} aria-label="Refresh local supported causes">{Ico.refresh({ size: 17, c: T.action })}</button></div> : null}
      {loading ? <p className={styles.loading} role="status">Loading local demos for this browser tab...</p> : causes.length === 0 ? <section className={styles.empty}>
        <span className={styles.emptyIcon}>{Ico.vault({ size: 29, c: T.action })}</span>
        <h2>{isLocalPreview ? "No local support demo saved yet." : "Local support history is preview-only."}</h2>
        <p>{isLocalPreview ? "Explore a fictional cause, review its amount and confirm a local demo. A saved demo will appear here. Browser storage may be unavailable." : "This screen does not claim a personal donation history. Explore the separate Testnet campaigns instead."}</p>
        <Link className={styles.primaryLink} href={isLocalPreview ? "/circles" : "/campaigns?mode=testnet"}>{isLocalPreview ? "Explore example causes" : "Explore Testnet campaigns"}{Ico.chev({ size: 17, c: "#fff" })}</Link>
      </section> : <section className={styles.list} aria-label="Locally supported example causes">
        {causes.map(({ circle, records, latest, unread }) => {
          const display = circleDisplayContent(circle, locale);
          const cover = circle.coverImage ?? photos[circle.category] ?? "/illustrations/giving.png";
          const latestUpdate = [...(display.updates ?? [])].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
          return <article className={styles.causeCard} key={circle.id}>
            <div className={styles.causeTop}>
              <div className={styles.imageWrap}><Image className={cover === "/illustrations/giving.png" ? styles.doodle : styles.photo} src={cover} width={88} height={80} alt={display.imageAlt ?? c("AI-generated fictional campaign illustration")} /><span>AI image</span></div>
              <div><span className={styles.causeLabel}>Example cause · {circle.status === "completed" ? "Completed example" : "Active example"}</span><h2><Link href={`/circles/${circle.id}`}>{display.title}</Link></h2><span className={styles.organizer}>{circle.organizer} · {circle.organizerLocation}</span></div>
            </div>
            <div className={styles.supportLine}><div><span>Latest local demo</span><strong>{supportAmount(latest)}</strong></div><div><span>{records.length} local {records.length === 1 ? "demo" : "demos"}</span><time dateTime={latest.confirmedAt}>{formattedDate(latest.confirmedAt)}</time></div></div>
            <section className={styles.allocation} aria-label="Latest local demo allocation"><div className={styles.allocationBar} aria-hidden="true"><span style={{width:`${latest.beneficiaryPct}%`}}/><span style={{width:`${latest.organizerPct}%`}}/></div><div><span><strong>{latest.beneficiaryPct}%</strong> beneficiary<br/>{supportAmount(latest,"beneficiaryMinor")}</span><span><strong>{latest.organizerPct}%</strong> organizer<br/>{supportAmount(latest,"organizerMinor")}</span></div></section>
            <div className={styles.updateSummary}><span>{unread > 0 ? `${unread} unread example ${unread === 1 ? "update" : "updates"}` : "No unread example updates"}</span>{latestUpdate ? <><h3>{latestUpdate.title}</h3><time dateTime={latestUpdate.date}>Example update · {formattedDate(latestUpdate.date)}</time></> : <p>No example update has been added to this cause yet.</p>}</div>
            <div className={styles.links}><Link href={`/circles/${circle.id}?tab=updates`}>Follow updates {Ico.chev({ size: 15, c: T.action })}</Link><Link href={`/circles/${circle.id}?tab=proof`}>Example proof {Ico.link({ size: 15, c: T.action })}</Link></div>
            <button type="button" className={styles.markSeen} disabled={unread === 0} onClick={() => markSeen(circle)}>{unread === 0 ? "Current example updates seen" : "Mark example updates as seen"}</button>
            {notice?.circleId === circle.id ? <p className={notice.ok ? styles.success : styles.error} role={notice.ok ? "status" : "alert"}>{notice.text}</p> : null}
            <details className={styles.history}><summary>Local demo details {Ico.chev({ size: 15, c: T.slate })}</summary><ol>{records.map((record) => <li key={record.id}><strong>{supportAmount(record)} · {CURRENCY[record.currency].code}</strong><time dateTime={record.confirmedAt}>{new Date(record.confirmedAt).toLocaleString("en-GB")}</time><span>Beneficiary {record.beneficiaryPct}%: {supportAmount(record, "beneficiaryMinor")}</span><span>Organizer operations {record.organizerPct}%: {supportAmount(record, "organizerMinor")}</span><small>Browser-only record. No money moved.</small></li>)}</ol></details>
          </article>;
        })}
      </section>}
      <footer className={styles.footer}><PoweredByStellar /><span>Fictional cause updates, not verified receipts.</span></footer>
    </div>
  );
}
