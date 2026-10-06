"use client";

import { useState } from "react";
import Image from "next/image";
import type { CircleOrganizer } from "@/lib/circles/organizers";
import styles from "./ExampleOrganizerAvatar.module.css";

type Profile = Pick<CircleOrganizer, "name" | "kind" | "initials" | "avatarSrc" | "avatarAlt">;

/** Fictional identity imagery, not a verified person's photograph or NGO mark. */
export default function ExampleOrganizerAvatar({ organizer, size = 42, decorative = true }: {
  organizer: Profile; size?: number; decorative?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = organizer.avatarSrc;
  const hasImage = source && failedSource !== source;
  return <span className={`${styles.avatar} ${organizer.kind === "ngo" ? styles.logo : styles.person}`}
    style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * .32)) }}
    aria-hidden={decorative || undefined}>
    {hasImage ? <Image src={source} width={size} height={size} sizes={`${size}px`}
      alt={decorative ? "" : organizer.avatarAlt ?? organizer.name}
      onError={() => setFailedSource(source)} /> : <span>{organizer.initials}</span>}
  </span>;
}
