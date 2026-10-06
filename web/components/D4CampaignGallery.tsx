"use client";

import Image from "next/image";
import { startTransition, useEffect, useRef, useState } from "react";
import { useT } from "@/components/I18nProvider";
import { campaignGalleryCopy } from "@/lib/i18n/campaign-gallery";
import { CAMPAIGN_MEDIA_MIN_PHOTOS, CAMPAIGN_MEDIA_MAX_PHOTOS } from "@/lib/campaign-media";
import { CampaignPhotoPreparationError, prepareCampaignPhotos, type CampaignPhotoPreparationCode } from "@/lib/ui/campaign-photo-preparation";
import { useD4CampaignMedia } from "./useD4CampaignMedia";
import styles from "./D4CampaignGallery.module.css";

type ExamplePhoto = { src: string; alt?: string; caption?: string };
type Props = { campaignId: string; creatorWallet: string; viewer: string | null; localPreview: boolean; examplePhotos?: readonly ExamplePhoto[] };
type Selection = { scope: string; files: File[]; urls: string[] };

export default function D4CampaignGallery(props: Props) {
  const { locale } = useT(), copy = campaignGalleryCopy(locale);
  const media = useD4CampaignMedia(props);
  const photos: readonly ExamplePhoto[] = props.localPreview ? props.examplePhotos ?? [] : media.result?.photos ?? [];
  const [index, setIndex] = useState(0), [failed, setFailed] = useState<string[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [acknowledged, setAcknowledged] = useState(false), [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<CampaignPhotoPreparationCode | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const preparation = useRef(0), preparingLock = useRef(false), urls = useRef<string[]>([]), active = useRef(false);
  const scope = JSON.stringify([props.campaignId, props.creatorWallet, props.viewer, media.editOwner, props.localPreview]);
  const currentScope = useRef(scope);
  const displayedIndex = Math.min(index, Math.max(0, photos.length - 1));
  const selectedPhoto = photos[displayedIndex];
  const currentSelection = selection?.scope === scope ? selection : null;
  const validSelection = !!currentSelection && currentSelection.files.length >= CAMPAIGN_MEDIA_MIN_PHOTOS && currentSelection.files.length <= CAMPAIGN_MEDIA_MAX_PHOTOS;
  const busy = preparing || media.pending;
  const move = (delta: number) => { if (photos.length) setIndex((displayedIndex + delta + photos.length) % photos.length); };

  useEffect(() => {
    active.current = true;
    const preparationVersion = preparation;
    return () => { active.current = false; preparationVersion.current++; for (const url of urls.current) URL.revokeObjectURL(url); urls.current = []; };
  }, []);
  useEffect(() => {
    currentScope.current = scope;
    // Route/identity changes never retain a different organizer's selected files.
    preparation.current++; preparingLock.current = false;
    for (const url of urls.current) URL.revokeObjectURL(url); urls.current = [];
    // Render is already scope-bound before this reset runs. Reset selection UI
    // outside the effect body after revoking the previous browser resources.
    let current = true;
    queueMicrotask(() => {
      if (!active.current || !current) return;
      setSelection(null); setAcknowledged(false); setPreparing(false); setError(null); setIndex(0); setFailed([]);
    });
    return () => { current = false; };
  }, [scope]);

  async function choose(files: File[]) {
    const requestedScope = currentScope.current;
    if (!media.editOwner || busy || preparingLock.current) return;
    const request = ++preparation.current; preparingLock.current = true; setPreparing(true); setError(null); setAcknowledged(false);
    for (const url of urls.current) URL.revokeObjectURL(url); urls.current = []; setSelection(null);
    try {
      const prepared = await prepareCampaignPhotos(files);
      if (!active.current || preparation.current !== request || currentScope.current !== requestedScope) return;
      const previews = prepared.map(file => URL.createObjectURL(file)); urls.current = previews;
      setSelection({ scope: requestedScope, files: prepared, urls: previews });
    } catch (failure) {
      if (active.current && preparation.current === request && currentScope.current === requestedScope)
        setError(failure instanceof CampaignPhotoPreparationError ? failure.code : "preparation_failed");
    } finally {
      if (preparation.current === request) { preparingLock.current = false; if (active.current) setPreparing(false); }
    }
  }
  async function publish() {
    if (!validSelection || !acknowledged || busy || !currentSelection) return;
    const requestedScope = scope;
    const saved = await media.publish(currentSelection.files, acknowledged);
    if (!saved || !active.current || currentScope.current !== requestedScope) return;
    for (const url of urls.current) URL.revokeObjectURL(url); urls.current = [];
    setSelection(null); setAcknowledged(false); setIndex(0);
    if (input.current) input.current.value = "";
  }

  return <section className={styles.root} aria-label={copy.region}>
    <div className={styles.heading}><h3>{copy.title}</h3><span className={styles.label}>{props.localPreview && photos.length ? copy.demoLabel : copy.publicLabel}</span></div>
    {selectedPhoto ? <>
      <div className={styles.hero} tabIndex={0} role="group" aria-label={`${copy.photo} ${displayedIndex + 1} / ${photos.length}`}
        onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          if (event.key === "ArrowLeft") move(-1); else if (event.key === "ArrowRight") move(1);
          else setIndex(event.key === "Home" ? 0 : photos.length - 1);
        }}>
        {failed.includes(selectedPhoto.src) ? <p className={styles.empty}>{copy.missing}</p>
          : <Image key={selectedPhoto.src} src={selectedPhoto.src} alt={selectedPhoto.alt || `${copy.photo} ${displayedIndex + 1}`} fill sizes="(max-width: 600px) 100vw, 600px" unoptimized
            onError={() => setFailed(value => value.includes(selectedPhoto.src) ? value : [...value, selectedPhoto.src])} className={styles.image} />}
        {photos.length > 1 && <><button type="button" className={`${styles.arrow} ${styles.left}`} aria-label={copy.previous} onClick={() => move(-1)}>‹</button>
          <button type="button" className={`${styles.arrow} ${styles.right}`} aria-label={copy.next} onClick={() => move(1)}>›</button></>}
        <span className={styles.counter} aria-live="polite">{displayedIndex + 1} / {photos.length}</span>
      </div>
      <div className={styles.thumbnails}>{photos.map((photo, position) => <button key={`${position}:${photo.src}`} type="button" aria-label={`${copy.thumbnail} ${position + 1}`}
        aria-pressed={position === displayedIndex} className={`${styles.thumbnail} ${position === displayedIndex ? styles.selected : ""}`} onClick={() => setIndex(position)}>
        {failed.includes(photo.src) ? <span>{position + 1}</span> : <Image src={photo.src} alt="" fill sizes="72px" unoptimized className={styles.image}
          onError={() => setFailed(value => value.includes(photo.src) ? value : [...value, photo.src])} />}
      </button>)}</div>
      {selectedPhoto.caption && <p className={styles.caption}>{selectedPhoto.caption}</p>}
    </> : <div className={styles.empty} role="status">{!props.localPreview && media.status === "loading" ? copy.loading : copy.empty}</div>}
    <p className={styles.hint}>{props.localPreview && photos.length ? copy.demoHint : copy.publicHint}</p>
    {!props.localPreview && media.code && <div className={styles.notice}><p role="alert">{copy[media.code]}</p>
      <button type="button" className={styles.retry} disabled={media.pending} onClick={() => startTransition(() => { void media.reload(); })}>{copy.retry}</button></div>}
    {!props.localPreview && !media.code && !media.editOwner && props.viewer === props.creatorWallet && media.result?.permissionCode
      && <p className={styles.hint}>{copy[media.result.permissionCode]}</p>}
    {props.localPreview && <p className={styles.hint}>{copy.localOnly}</p>}
    {media.editOwner && !props.localPreview && <div className={styles.editor}>
      <h4>{copy.editor}</h4><p className={styles.hint}>{copy.hint}</p>
      <label className={styles.choose}>{copy.choose}<input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy}
        onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; if (files.length) void choose(files); }} /></label>
      {currentSelection && <div className={styles.previews} aria-label={copy.selected}>{currentSelection.urls.map((src, position) =>
        <div className={styles.preview} key={src}><Image src={src} alt={`${copy.photo} ${position + 1}`} fill sizes="80px" unoptimized className={styles.image} /></div>)}</div>}
      <label className={styles.consent}><input type="checkbox" checked={acknowledged} disabled={busy || !validSelection} onChange={event => setAcknowledged(event.currentTarget.checked)} /><span>{copy.consent}</span></label>
      <button type="button" className={styles.publish} disabled={busy || !validSelection || !acknowledged}
        onClick={() => startTransition(() => { void publish(); })}>{media.pending ? copy.saving : preparing ? copy.preparing : copy.editor}</button>
      {preparing && <p role="status">{copy.preparing}</p>}
      {error && <p role="alert" className={styles.error}>{copy[error]}</p>}
    </div>}
    {media.message && <p role={media.message === "saved" ? "status" : "alert"} className={media.message === "saved" ? styles.success : styles.error}>{copy[media.message]}</p>}
  </section>;
}
