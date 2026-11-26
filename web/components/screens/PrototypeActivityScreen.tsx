"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, HandHeart, PaperPlaneTilt, Receipt, ArrowsLeftRight } from "@phosphor-icons/react";
import { listPreviewTransfers, type PreviewTransfer } from "@/lib/local-preview-history";
import { useT } from "@/components/I18nProvider";
import { formatLocal } from "@/lib/ui/currency";
import styles from "./PrototypeActivityScreen.module.css";

type Kind = "donated" | "sent" | "received" | "topup" | "withdraw";
type Sample = { id: string; title: string; detail: string; amount: string; kind: Kind; day: string };

const SAMPLE: Sample[] = [
  { id: "a1", title: "Ate Mei needs dialysis", detail: "Donated · 9:41", amount: "−$5.00", kind: "donated", day: "Today" },
  { id: "a2", title: "@jamamam", detail: "Sent · 8:41", amount: "−$5.00", kind: "sent", day: "Today" },
  { id: "a3", title: "Top up", detail: "QRIS · 16:20", amount: "+$5.00", kind: "topup", day: "Yesterday" },
  { id: "a4", title: "@jamal_r", detail: "Received · 11:05", amount: "+$12.00", kind: "received", day: "Yesterday" },
  { id: "a5", title: "Withdraw", detail: "GCash · 14:32", amount: "−$439.94", kind: "withdraw", day: "12 Nov" },
];
const FILTERS: { id: Kind | "all"; label: string }[] = [
  { id: "all", label: "All" }, { id: "donated", label: "Donated" }, { id: "sent", label: "Sent" },
  { id: "received", label: "Received" }, { id: "topup", label: "Top up" }, { id: "withdraw", label: "Withdraw" },
];
const PROOF = [
  { title: "Deploy disaster vault", detail: "A test contract deployed on Stellar Testnet.", hash: "1bed6a16e6b6b2a8fddf3c8e247764f77f80bc18f58cd019bec225e60d891d12" },
  { title: "Register @juandelacruz", detail: "A human-readable username registered.", hash: "00d0861463b124d7ec83b1cb5ef65f4b13579167127b8acede5c01362f8bf913" },
  { title: "Contribute 5 XLM", detail: "Testnet funds contributed to the project pool.", hash: "618dedd72dd1ba49f7432dc33e237007da5280c857d00e4eff6164247ad0cd66" },
  { title: "Disburse 2 XLM", detail: "Testnet funds released from the pool.", hash: "1115f685287faf7b508e97d378df5f4ccb1ccc302d007b2190776ad0c986a837" },
];

function Icon({ kind }: { kind: Kind }) {
  const IconComponent = kind === "donated" ? HandHeart : kind === "sent" ? PaperPlaneTilt : kind === "received" ? ArrowDownLeft : kind === "withdraw" ? ArrowUpRight : ArrowsLeftRight;
  return <IconComponent size={20} aria-hidden="true" />;
}

export default function PrototypeActivityScreen() {
  const { currency } = useT();
  const [tab, setTab] = useState<"personal" | "proof">("personal");
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [transfers, setTransfers] = useState<PreviewTransfer[]>([]);
  useEffect(() => { setTransfers(listPreviewTransfers()); }, []);

  const visible = useMemo(() => SAMPLE.filter(item => filter === "all" || item.kind === filter), [filter]);
  const days = ["Today", "Yesterday", "12 Nov"];

  return <div className={styles.screen}>
    <header className={styles.header}><h1>Activity</h1></header>
    <div className={styles.tabs} role="tablist" aria-label="Activity source">
      <button type="button" role="tab" aria-selected={tab === "personal"} onClick={() => setTab("personal")}>My activity</button>
      <button type="button" role="tab" aria-selected={tab === "proof"} onClick={() => setTab("proof")}>Public proof</button>
    </div>
    {tab === "personal" ? <>
      <div className={styles.filters} role="group" aria-label="Filter activity">
        {FILTERS.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
      </div>
      {days.map(day => {
        const items = visible.filter(item => item.day === day);
        if (!items.length) return null;
        return <section className={styles.day} key={day}>
          <h2>{day}</h2>
          <div className={styles.card}>{items.map(item => <Link className={styles.row} href={`/activity/${item.id}`} key={item.id}>
            <span className={styles.icon}><Icon kind={item.kind} /></span>
            <span className={styles.copy}><strong>{item.title}</strong><small>{item.detail}</small></span>
            <strong className={`${styles.amount} ${item.amount.startsWith("+") ? styles.incoming : ""}`}>{item.amount}</strong>
          </Link>)}</div>
        </section>;
      })}
      {transfers.length ? <section className={styles.day}>
        <h2>This browser</h2>
        <div className={styles.card}>{transfers.map(item => <div className={styles.row} key={item.id}>
          <span className={styles.icon}><Receipt size={20} aria-hidden="true" /></span>
          <span className={styles.copy}><strong>Send demo to @{item.recipientHandle}</strong><small>Local demo · no tokens moved</small></span>
          <strong className={styles.amount}>−{formatLocal(item.pesos, currency)}</strong>
        </div>)}</div>
      </section> : null}
    </> : <section className={styles.proof}>
      <p>Project receipts, not your transactions.</p>
      <div className={styles.card}>{PROOF.map(item => <a className={styles.proofRow} key={item.hash} href={`https://stellar.expert/explorer/testnet/tx/${item.hash}`} target="_blank" rel="noopener noreferrer">
        <span className={styles.icon}><Receipt size={20} aria-hidden="true" /></span>
        <span className={styles.copy}><strong>{item.title}</strong><small>{item.detail}</small></span>
        <span className={styles.link}>View</span>
      </a>)}</div>
      <p className={styles.note}>These public project receipts are separate from your personal activity.</p>
    </section>}
  </div>;
}
