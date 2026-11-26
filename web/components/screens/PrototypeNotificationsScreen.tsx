"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { AppBar, Ico, IconButton } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import styles from "./PrototypeNotificationsScreen.module.css";

type Notice = { title: string; subtitle?: string; time: string; icon: ReactNode; href: string };

function NoticeGroup({ title, notices }: { title: string; notices: Notice[] }) {
  const router = useRouter();
  return <section className={styles.group} aria-label={title}>
    <h2>{title}</h2>
    <div className={styles.list}>
      {notices.map((notice, index) => <button className={styles.item} key={`${title}-${index}`} type="button" onClick={() => router.push(notice.href)}>
        <span className={styles.icon}>{notice.icon}</span>
        <span className={styles.itemText}><span className={styles.title}>{notice.title}</span>{notice.subtitle ? <span className={styles.subtitle}>{notice.subtitle}</span> : null}</span>
        <span className={styles.time}>{notice.time}</span>
        <span className={styles.chev} aria-hidden="true">›</span>
      </button>)}
    </div>
  </section>;
}

const TODAY: Notice[] = [
  { title: "Santos family roof is finished. Rate the proof", time: "Just now", icon: Ico.bulb({ size: 17 }), href: "/cause/santos-roof/feedback" },
  { title: "Your $5 donation was confirmed", subtitle: "Donated · Ate Mei needs dialysis", time: "2m", icon: Ico.arrowDown({ size: 17 }), href: "/activity/a1" },
  { title: "@jamamam received your $5", subtitle: "Sent · @jamamam", time: "1h", icon: Ico.send({ size: 17 }), href: "/activity/a2" },
];

const EARLIER: Notice[] = [
  { title: "Top up of $5 credited", subtitle: "Top up · QRIS", time: "Yesterday", icon: Ico.arrowDown({ size: 17 }), href: "/activity/a5" },
  { title: "$0.05 went to the Disaster Vault", subtitle: "Donated · Ate Mei needs dialysis", time: "Yesterday", icon: Ico.shield({ size: 16 }), href: "/vault?tab=activity" },
];

export default function PrototypeNotificationsScreen() {
  const goBack = useGoBack("/");
  return <div className={styles.screen}>
    <AppBar leading={<IconButton ariaLabel="Back" onClick={goBack}>{Ico.back({})}</IconButton>} title="Notifications" />
    <NoticeGroup title="Today" notices={TODAY} />
    <NoticeGroup title="Earlier" notices={EARLIER} />
    <Image className={styles.doodle} src="/prototype-ui/doodle-coins.png" alt="" width={250} height={250} unoptimized />
  </div>;
}
