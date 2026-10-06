"use client";

import { useRef } from "react";
import { useT } from "@/components/I18nProvider";
import { accountPhotoCopy } from "@/lib/i18n/account-photo";
import type { useAccountPhoto } from "./useAccountPhoto";
import AccountAvatar from "./AccountAvatar";
import styles from "./AccountPhotoEditor.module.css";

export default function AccountPhotoEditor({ photo, disabled = false }: { photo: ReturnType<typeof useAccountPhoto>; disabled?: boolean }) {
  const { locale } = useT();
  const c = accountPhotoCopy(locale);
  const input = useRef<HTMLInputElement>(null);
  if (!photo.profile) {
    return photo.status === "error" ? <div className={styles.error} role="alert">{c.unavailable}<button type="button" onClick={() => void photo.reload()}>{c.retry}</button></div> : null;
  }
  const busy = disabled || photo.pending;
  const message = photo.message ?? photo.code;
  return <section className={styles.editor} aria-labelledby="account-photo-title" aria-busy={photo.pending}>
    <div className={styles.heading}>
      <AccountAvatar name={photo.profile.email || "?"} photoUrl={photo.profile.photoUrl} size={48} alt={c.alt} />
      <div><h2 id="account-photo-title">{c.title}</h2><p>{c.description}</p></div>
    </div>
    <input ref={input} className={styles.file} type="file" accept="image/jpeg,image/png,image/webp" aria-label={c.upload}
      disabled={busy} onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void photo.upload(file);
      }} />
    <div className={styles.actions}>
      <button type="button" disabled={busy} onClick={() => input.current?.click()}>{photo.pending ? c.saving : c.upload}</button>
      {photo.profile.source === "custom" && photo.profile.googlePhotoUrl ? <button type="button" disabled={busy} onClick={() => void photo.restore()}>{c.restore}</button> : null}
    </div>
    <p className={styles.hint}>{c.hint}</p>
    {message ? <p className={message === "saved" || message === "restored" ? styles.success : styles.error}
      role={message === "saved" || message === "restored" ? "status" : "alert"}>{c[message]}</p> : null}
  </section>;
}
