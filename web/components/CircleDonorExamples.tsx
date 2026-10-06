"use client";

import Image from "next/image";
import { useT } from "@/components/I18nProvider";
import { circlesCopy } from "@/lib/i18n/revamp-circles";
import { CURRENCY, formatLocal, formatLocalAmount } from "@/lib/ui/currency";
import { circleDonorExamples } from "@/lib/ui/circle-media";
import type { Circle } from "@/lib/circles/types";
import type { LocalSupportRecord } from "@/lib/circles/local-support";
import type { Locale } from "@/lib/i18n/config";
import styles from "./CircleDonorExamples.module.css";

function dateLabel(value: string, locale: Locale): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(
    { en: "en-GB", tl: "fil-PH", id: "id-ID", vi: "vi-VN" }[locale],
    { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" },
  ) : value;
}

export default function CircleDonorExamples({ circle, supports = [] }: {
  circle: Circle; supports?: LocalSupportRecord[];
}) {
  const { locale, currency } = useT();
  const c = circlesCopy(locale);
  const examples = circleDonorExamples(circle);
  return <section className={styles.feed} aria-labelledby="circle-example-donors-title">
    <header className={styles.heading}><h2 id="circle-example-donors-title">{c("Example donor activity")}</h2>
      <span>{c("{count} sample entries", { count: examples.length })}</span></header>
    <p className={styles.notice}>{c("Fictional supporters, amounts, dates and comments. No real donations or public donor records.")}</p>
    {examples.length ? <ul className={styles.list}>{examples.map(donor => {
      const name = donor.anonymous ? c("Anonymous (example)") : donor.displayName || c("Supporter (example)");
      return <li key={donor.id} className={styles.entry}>
        <span className={styles.avatar} aria-hidden="true">
          {!donor.anonymous && donor.avatarSrc ? <Image src={donor.avatarSrc} alt="" width={38} height={38} /> : donor.anonymous ? "A" : name[0]}
        </span>
        <div className={styles.body}><strong>{name}</strong>
          {donor.createdAt ? <time dateTime={donor.createdAt}>{dateLabel(donor.createdAt, locale)}</time> : donor.whenLabel ? <span className={styles.date}>{donor.whenLabel}</span> : null}
          {donor.comment && <p>{donor.comment}</p>}
        </div>
        <div className={styles.amount}><small>{c("Example amount")}</small><strong>{formatLocal(donor.amountPesos, currency)}</strong></div>
      </li>;
    })}</ul> : <p className={styles.empty}>{c("No example donor entries are available.")}</p>}
    {supports.length > 0 && <div className={styles.local}>
      <h3>{c("Your browser-only demo entries")}</h3>
      <p className={styles.notice}>{c("Local confirmations are separate from fictional donor examples and do not change example progress.")}</p>
      <ul className={styles.list}>{supports.map(record => <li key={record.id} className={styles.entry}>
        <span className={styles.avatar} aria-hidden="true">{record.anonymous ? "A" : "Y"}</span>
        <div className={styles.body}><strong>{c(record.anonymous ? "Anonymous (local demo)" : "You (local demo)")}</strong>
          <time dateTime={record.confirmedAt}>{dateLabel(record.confirmedAt, locale)}</time>
          {record.comment && <p>{record.comment}</p>}</div>
        <div className={styles.amount}><small>{c("Local demo amount")}</small><strong>{formatLocalAmount(Number(record.displayValue), record.currency)}</strong><span>{CURRENCY[record.currency].code}</span></div>
      </li>)}</ul>
    </div>}
  </section>;
}
