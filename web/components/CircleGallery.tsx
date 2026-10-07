"use client";

import { useState, useSyncExternalStore, type KeyboardEvent } from "react";
import Image from "next/image";
import { useT } from "@/components/I18nProvider";
import { circlesCopy, circlesCategory } from "@/lib/i18n/revamp-circles";
import type { Circle } from "@/lib/circles/types";
import { circlePhotos, galleryIndex } from "@/lib/ui/circle-media";
import styles from "./CircleGallery.module.css";

const subscribeToClient = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export default function CircleGallery({ circle }: { circle: Circle }) {
  const { locale } = useT();
  const c = circlesCopy(locale);
  const photos = circlePhotos(circle);
  // The SSR photo remains visible, but controls must wait for their handlers.
  // A stable server snapshot also preserves identical initial hydration markup.
  const ready = useSyncExternalStore(subscribeToClient, clientReady, serverReady);
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const index = Math.min(selected, Math.max(0, photos.length - 1));
  const active = photos[index];
  const available = active && !failed.includes(active.src);
  const change = (key: string) => { if (ready) setSelected(current => galleryIndex(current, photos.length, key)); };
  const imageError = (src: string) => setFailed(current => current.includes(src) ? current : [...current, src]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!ready || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || photos.length < 2) return;
    event.preventDefault();
    change(event.key);
  }

  return <div className={styles.gallery} role="region" aria-roledescription={c("Photo gallery")}
    aria-label={c("Fictional campaign photo gallery")} aria-busy={!ready}
    tabIndex={ready && photos.length > 1 ? 0 : undefined} onKeyDown={onKeyDown}>
    <figure className={styles.figure}>
      <div className={styles.photo}>
        {available ? <Image key={active.src} src={active.src} alt={active.alt || c("AI-generated fictional campaign illustration")}
          fill sizes="(max-width: 500px) 100vw, 500px" priority={index === 0} onError={() => imageError(active.src)} />
          : <div className={styles.unavailable}><span>{c("Photo unavailable")}</span><small>{c("This example does not provide a verified campaign photo.")}</small></div>}
        <span className={styles.category}>{circlesCategory(locale, circle.category)}</span>
        <span className={styles.ai}>{c("AI illustration")}</span>
        {photos.length > 1 && <>
          <button type="button" className={`${styles.arrow} ${styles.previous}`} aria-label={c("Previous photo")} disabled={!ready} onClick={() => change("ArrowLeft")}><span aria-hidden="true">‹</span></button>
          <button type="button" className={`${styles.arrow} ${styles.next}`} aria-label={c("Next photo")} disabled={!ready} onClick={() => change("ArrowRight")}><span aria-hidden="true">›</span></button>
        </>}
      </div>
      <figcaption className={styles.caption} aria-live="polite" aria-atomic="true">
        {active && <strong>{c("Photo {index} of {count}", { index: index + 1, count: photos.length })}</strong>}
        <span>{active?.caption || c("AI-generated concept scene. Not proof of a real campaign or delivery.")}</span>
      </figcaption>
    </figure>
    {photos.length > 1 && <div className={styles.thumbnails} aria-label={c("Choose a campaign photo")}>
      {photos.map((photo, position) => <button key={photo.src} type="button" className={styles.thumbnail}
        aria-label={c("Show photo {index} of {count}", { index: position + 1, count: photos.length })}
        aria-pressed={position === index} disabled={!ready} onClick={() => { if (ready) setSelected(position); }}>
        {!failed.includes(photo.src) ? <Image src={photo.src} alt="" fill sizes="64px" onError={() => imageError(photo.src)} /> : <span aria-hidden="true">{position + 1}</span>}
      </button>)}
    </div>}
  </div>;
}
