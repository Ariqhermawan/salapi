"use client";

import { useRouter } from "next/navigation";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { AppBar, Card, IconButton, PoweredByStellar, Ico } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import styles from "./PrototypeLearnScreen.module.css";

const GUIDES = [
  {
    title: "How do causes work?",
    body: "Each cause keeps its donations in its own escrow. When it ends, the organizer posts proof and two of three reviewers check it. Once approved, the money goes to the recipients set at launch. If it isn't approved in time, every donor can claim a full refund.",
    link: "Browse causes",
    href: "/causes",
  },
  {
    title: "How does the Disaster Vault work?",
    body: "A shared relief pool. A payout needs two of three signers, then a short wait before it is sent. No more than 20% of the pool can leave in 24 hours.",
    link: "Open Disaster Vault",
    href: "/vault",
  },
  {
    title: "How does Arisan work?",
    body: "Every member pays for all rounds up front. Each round, one member is drawn to receive the pot. Rooms pay no interest.",
    link: "See rooms",
    href: "/vaults",
  },
  {
    title: "How will Smart Savings work?",
    body: "You'll set a goal and lock money toward it. The money unlocks when you reach the goal.",
  },
  {
    title: "How do receipts work?",
    body: "Every donation, payout and draw leaves a public receipt on Stellar that anyone can check.",
    link: "See your receipts",
    href: "/activity",
  },
];

export default function PrototypeLearnScreen() {
  const router = useRouter();
  const back = useGoBack("/");

  return <div className={styles.screen}>
    <AppBar leading={<IconButton ariaLabel="Back" onClick={back}>{Ico.back({})}</IconButton>} title="How Salapi works" />
    <Card p={0} className={styles.card}>
      {GUIDES.map((guide, index) => <details className={styles.guide} key={guide.title} open={index === 0}>
        <summary>{guide.title}<CaretDown size={20} aria-hidden="true" /></summary>
        <p>{guide.body}</p>
        {guide.href ? <button type="button" className={styles.link} onClick={() => router.push(guide.href!)}>{guide.link}<CaretRight size={18} aria-hidden="true" /></button> : null}
      </details>)}
    </Card>
    <div className={styles.legal}>
      <button type="button" onClick={() => router.push("/you/privacy")}>Privacy</button>
      <button type="button" onClick={() => router.push("/you/terms")}>Terms</button>
    </div>
    <div className={styles.powered}><PoweredByStellar /></div>
  </div>;
}
