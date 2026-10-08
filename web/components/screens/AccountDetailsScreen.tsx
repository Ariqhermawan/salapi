"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { accountDetails, setReceiptPhotoConsent, setTransferPreviewPhotoConsent } from "@/app/account-details-actions";
import type { AccountDetails } from "@/lib/account-details";
import { accountDetailsCopy } from "@/lib/i18n/account-details";
import { useT } from "@/components/I18nProvider";
import { useAccountPhoto } from "@/components/useAccountPhoto";
import AccountPhotoEditor from "@/components/AccountPhotoEditor";
import { useGoBack } from "@/lib/ui/useGoBack";
import styles from "./AccountDetailsScreen.module.css";

export default function AccountDetailsScreen() {
  const { locale } = useT();
  const c = accountDetailsCopy(locale);
  const back = useGoBack("/settings");
  const photo = useAccountPhoto();
  const ownerId = photo.profile?.ownerId ?? null;
  const owner = useRef(ownerId);
  const version = useRef(0);
  const writeInFlight = useRef(false);
  const [pending, start] = useTransition();
  const [state, setState] = useState<{ account: AccountDetails | null; error: boolean }>({ account: null, error: false });
  const [feedback, setFeedback] = useState<"saved" | "saveError" | null>(null);
  const load = useCallback(async () => {
    const expectedOwner = owner.current;
    const request = ++version.current;
    setState({ account: null, error: false }); setFeedback(null);
    if (!expectedOwner) return;
    try {
      const result = await accountDetails(expectedOwner);
      if (version.current !== request || owner.current !== expectedOwner) return;
      setState(result.ok && result.account.ownerId === expectedOwner
        ? { account: result.account, error: false } : { account: null, error: true });
    } catch { if (version.current === request && owner.current === expectedOwner) setState({ account: null, error: true }); }
  }, []);
  useEffect(() => {
    owner.current = ownerId;
    start(() => { void load(); });
    const requestVersion = version;
    return () => { owner.current = null; requestVersion.current++; };
  }, [ownerId, load]);
  const account = state.account?.ownerId === ownerId ? state.account : null;
  const ready = !!account && photo.status === "ready";

  function toggle(enabled: boolean, preview = false) {
    const expectedOwner = owner.current;
    if (!expectedOwner || !ready || pending || photo.pending || writeInFlight.current) return;
    writeInFlight.current = true;
    const request = ++version.current;
    setFeedback(null);
    start(async () => {
      try {
        const result = await (preview ? setTransferPreviewPhotoConsent : setReceiptPhotoConsent)(expectedOwner, enabled);
        if (version.current !== request || owner.current !== expectedOwner) return;
        if (!result.ok || result.ownerId !== expectedOwner || result.enabled !== enabled) { setFeedback("saveError"); return; }
        setState(previous => previous.account?.ownerId === expectedOwner
          ? { ...previous, account: { ...previous.account, [preview ? "transferPreviewPhotoConsent" : "receiptPhotoConsent"]: result.enabled } } : previous);
        setFeedback("saved");
      } catch { if (version.current === request && owner.current === expectedOwner) setFeedback("saveError"); }
      finally { writeInFlight.current = false; }
    });
  }

  return <div className={styles.screen}>
    <header className={styles.header}>
      <button type="button" onClick={back} aria-label={c.back}>‹</button>
      <div><h1>{c.title}</h1><p>{c.sub}</p></div>
    </header>
    {photo.status === "loading" || ownerId && !account && !state.error ? <p role="status" className={styles.notice}>{c.loading}</p> : null}
    {photo.status === "ready" && !ownerId ? <section className={styles.card}><p>{c.guest}</p><Link href="/signin">{c.signIn}</Link></section> : null}
    {photo.status === "error" || state.error ? <section className={styles.card}>
      <p role="alert">{c.unavailable}</p><button type="button" onClick={() => start(() => { if (ownerId) void load(); else void photo.reload(); })}>{c.retry}</button>
    </section> : null}
    {ownerId ? <AccountPhotoEditor photo={photo} disabled={pending} /> : null}
    {ready && account ? <>
      <section className={styles.card} aria-label={c.title}>
        <dl className={styles.details}>
          <div><dt>{c.email}</dt><dd>{account.email || photo.profile?.email}</dd></div>
          <div><dt>{c.username}</dt><dd>{account.identityUnavailable && !account.handle ? c.unavailable : account.handle ? `@${account.handle}` : c.noUsername}</dd></div>
          <div><dt>{c.wallet}</dt><dd className={styles.address}>{account.address ?? (account.identityUnavailable ? c.unavailable : c.noWallet)}</dd></div>
        </dl>
        {account.identityUnavailable ? <p role="status">{c.identityUnavailable}</p> : null}
        <div className={styles.links}><Link href="/settings">{c.manage}</Link>
          {account.address ? <a href={`https://stellar.expert/explorer/testnet/account/${account.address}`} target="_blank" rel="noopener noreferrer">{c.explorer} ↗</a> : null}</div>
      </section>
      <section className={styles.card} aria-labelledby="receipt-privacy">
        <h2 id="receipt-privacy">{c.privacy}</h2>
        <label className={styles.preference}><input type="checkbox" checked={account.receiptPhotoConsent}
          disabled={pending || photo.pending} onChange={event => toggle(event.target.checked)} /> <span>{c.share}</span></label>
        <p>{c.shareHint}</p>
        <label className={styles.preference}><input type="checkbox" checked={account.transferPreviewPhotoConsent === true}
          disabled={pending || photo.pending} onChange={event => toggle(event.target.checked, true)} /> <span>{c.previewShare}</span></label>
        <p>{c.previewShareHint}</p>
        {pending ? <p role="status">{c.saving}</p> : null}
        {feedback ? <p role={feedback === "saved" ? "status" : "alert"}>{c[feedback]}</p> : null}
        {feedback === "saveError" ? <button type="button" onClick={() => start(() => { void load(); })}>{c.retry}</button> : null}
      </section>
    </> : null}
    <section className={styles.card}><h2>{c.verification}</h2><p>{c.verificationHint}</p><Link href="/you/kyc-tier">{c.verification} ›</Link></section>
  </div>;
}
