"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, UsersThree } from "@phosphor-icons/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DISASTER_NGO_CATEGORIES,
  DISASTER_NGOS,
  disasterNgoCategoryFromLink,
  disasterNgosIn,
  type DisasterNgoCategoryId,
} from "@/lib/disaster-ngos";
import styles from "./VaultsRevamp.module.css";

export default function DisasterNgoDirectory() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const section = useRef<HTMLElement>(null);
  const rawCategory = params.get("cat");
  const scrolledToLinkedCategory = useRef(false);
  const category = disasterNgoCategoryFromLink(rawCategory);
  const ngos = disasterNgosIn(category);

  useEffect(() => {
    if (rawCategory === null || scrolledToLinkedCategory.current) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        section.current?.scrollIntoView({ block: "start" });
        scrolledToLinkedCategory.current = true;
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [rawCategory]); // A category URL is a deep link to this section.

  function selectCategory(nextCategory: DisasterNgoCategoryId | null) {
    const next = new URLSearchParams(params.toString());
    if (nextCategory) next.set("cat", nextCategory);
    else next.delete("cat");
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }

  return (
    <section ref={section} className={styles.vaultNgoDirectory} aria-label="All NGOs">
      <header>
        <span className={styles.vaultNgoMark} aria-hidden="true"><UsersThree size={19} /></span>
        <span className={styles.vaultNgoTitle}>
          <strong>All NGOs</strong>
          <small>Who the vault pays out through</small>
        </span>
        <span className={styles.vaultNgoCount}>{category ? `${ngos.length} of ${DISASTER_NGOS.length}` : DISASTER_NGOS.length}</span>
      </header>

      <p className={styles.vaultNgoNote}>Illustrative Testnet profiles only. These are not real or verified organizations; no real-world aid is represented.</p>

      <div className={styles.vaultNgoCategories} role="group" aria-label="NGO category">
        <button type="button" aria-pressed={category === null} onClick={() => selectCategory(null)}>All</button>
        {DISASTER_NGO_CATEGORIES.map((item) => (
          <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => selectCategory(item.id)}>
            <Image src={item.art} alt="" width={20} height={20} />
            {item.name}
          </button>
        ))}
      </div>

      <div className={styles.vaultNgoList}>
        {ngos.map((ngo) => {
          const ngoCategory = DISASTER_NGO_CATEGORIES.find((item) => item.id === ngo.category)!;
          return (
            <Link key={ngo.id} href={`/ngo/${ngo.id}`} className={styles.vaultNgoRow}>
              <span className={styles.vaultNgoIcon} aria-hidden="true"><Image src={ngoCategory.art} alt="" width={34} height={34} /></span>
              <span className={styles.vaultNgoCopy}>
                <strong>{ngo.name}</strong>
                <small>{ngoCategory.name} · {ngo.place}</small>
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
