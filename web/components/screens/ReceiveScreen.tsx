"use client";

// The QR shows the saved Stellar Testnet address. Salapi links use @username.
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { accountDetails } from "@/app/account-details-actions";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { receiveDestination, receiveShareData, type ReceiveDestination } from "@/lib/receive";
import { drawReceivePoster } from "@/lib/receive-poster";
import { receiveCopy } from "@/lib/i18n/receive";
import { xlmDepositCopy } from "@/lib/i18n/xlm-deposit";
import { useT } from "@/components/I18nProvider";
import { moneyCopy, moneyMessage } from "@/lib/i18n/revamp-money";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Btn,
} from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import { isLocalPreview, localPreviewUsername } from "@/lib/local-preview";
import styles from "./ReceiveScreen.module.css";
import PrototypeDoodle from "./PrototypeDoodle";

const SITE = "https://salapi.app";

// Share glyph (upload tray + up arrow), matched to the kit's stroke style.
function ShareGlyph({ c = "#fff", size = 18 }: { c?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={c}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </svg>
  );
}

function CopyGlyph({ size = 16 }: { size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
  </svg>;
}

const PREVIEW_RECEIVE_ADDRESS = "GCUBZ4SAR4LELX2YPLHN4IYU5L4VGVQNGVVZCHYSQECPBPBK6AB7GHY7";
const PREVIEW_RECEIVE_MEMO = "7302418659";

export default function ReceiveScreen({ previewUsername }: { previewUsername?: string } = {}) {
  const { t, locale } = useT();
  const m = moneyCopy(locale);
  const c = receiveCopy(locale);
  const deposit = xlmDepositCopy(locale);
  const goBack = useGoBack("/");
  const [identity, setIdentity] = useState<{ address: string | null; username: string | null }>(isLocalPreview
    ? { address: PREVIEW_RECEIVE_ADDRESS, username: previewUsername ?? null } : { address: null, username: null });
  const [status, setStatus] = useState<"loading" | "ready" | "guest" | "error">(isLocalPreview ? "ready" : "loading");
  const [copied, setCopied] = useState(false);
  const [copiedMemo, setCopiedMemo] = useState(false);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [posterOpen, setPosterOpen] = useState(false);
  const [base, setBase] = useState(SITE);
  const [shareError, setShareError] = useState("");
  const owner = useRef<string | null | undefined>(undefined);
  const revision = useRef(0);
  const active = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLocalPreview) return;
    const username = localPreviewUsername();
    if (username) setIdentity(current => ({ ...current, username }));
  }, []);

  useEffect(() => {
    active.current = true;
    const sequence = revision;
    const timer = copyTimer;
    let alive = true;
    let authRevision = 0;
    let unsubscribe = () => {};
    function unavailable() {
      setStatus("error");
      setShareError("Your wallet could not be loaded. Reload this page before sharing a receive link.");
    }
    function applyOwner(nextOwner: string | null) {
      if (!alive || !active.current) return;
      owner.current = nextOwner;
      const request = ++revision.current;
      setIdentity({ address: null, username: null });
      setCopied(false);
      setPosterOpen(false);
      setShareError("");
      setStatus(nextOwner ? "loading" : "guest");
      if (timer.current !== null) clearTimeout(timer.current);
      if (!nextOwner) return;
      // Auth callbacks stay synchronous; server reads run after the SDK lock.
      queueMicrotask(async () => {
        if (!alive || !active.current || revision.current !== request) return;
        try {
          const result = await accountDetails(nextOwner);
          if (!alive || !active.current || request !== revision.current || owner.current !== nextOwner) return;
          if (!result.ok || result.account.ownerId !== nextOwner) { unavailable(); return; }
          const { address, handle: username, identityUnavailable } = result.account;
          if (address && !receiveDestination(address, username, SITE) || !address && identityUnavailable) { unavailable(); return; }
          setIdentity({ address, username });
          setStatus("ready");
        } catch { if (alive && active.current && request === revision.current) unavailable(); }
      });
    }
    if (isLocalPreview) {
      Promise.resolve(window.location.origin).then(origin => { if (alive && active.current) setBase(origin); });
    } else if (!supabaseConfigured()) {
      queueMicrotask(() => applyOwner(null));
    } else {
      try {
        const supabase = createSupabaseBrowser();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          ++authRevision;
          applyOwner(event === "SIGNED_OUT" ? null : session?.user.id ?? null);
        });
        unsubscribe = () => subscription.unsubscribe();
        const initialRevision = authRevision;
        void supabase.auth.getUser().then(({ data, error }) => {
          if (!alive || !active.current || authRevision !== initialRevision) return;
          if (error && error.name !== "AuthSessionMissingError") { unavailable(); return; }
          applyOwner(data.user?.id ?? null);
        }).catch(() => { if (alive && active.current && authRevision === initialRevision) unavailable(); });
      } catch { queueMicrotask(() => { if (alive && active.current) unavailable(); }); }
    }
    return () => {
      alive = false;
      active.current = false;
      ++sequence.current;
      unsubscribe();
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const usernameLink = status === "ready" && identity.username
    ? receiveDestination(identity.address, identity.username, base)
    : null;
  const destination = isLocalPreview ? receiveDestination(identity.address, null, base)
    : status === "ready" ? receiveDestination(identity.address, null, base) : null;
  const qrLabel = isLocalPreview && identity.username ? `QR code for @${identity.username}` : c.addressScan;

  async function shareDestination(target: ReceiveDestination | null, copyOnly = false) {
    if (!target || !active.current) return;
    const request = revision.current;
    const current = () => active.current && revision.current === request;
    setShareError("");
    const data = receiveShareData(target, target.kind === "username" ? c.usernameCaption : c.addressCaption);
    try {
      if (!copyOnly && typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(data);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Unsupported sharing falls back to copying the exact destination.
    }
    if (!current()) return;
    try {
      await navigator.clipboard.writeText(target.value);
      if (!current()) return;
      setCopied(true);
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => { if (current()) setCopied(false); }, 1800);
    } catch {
      if (current()) setShareError(c.shareUnavailable);
    }
  }

  async function copyPreviewMemo() {
    try {
      await navigator.clipboard.writeText(PREVIEW_RECEIVE_MEMO);
      setCopiedMemo(true);
      setTimeout(() => setCopiedMemo(false), 1800);
    } catch { setShareError(c.shareUnavailable); }
  }

  return (
    <div className={styles.screen}>
      <AppBar
        leading={<IconButton ariaLabel={m("Back")} onClick={goBack}>{Ico.back({})}</IconButton>}
        title={t("receive.title")}
      />
      <section className={styles.card} aria-label={qrLabel}>
        {destination ? <>
          <div className={styles.qr}>
            <QRCodeSVG
              value={destination.value}
              size={232}
              level="M"
              marginSize={4}
              fgColor={T.ink}
              bgColor="#ffffff"
              title={qrLabel}
            />
          </div>
          {usernameLink?.kind === "username" && <h2>{usernameLink.display}</h2>}
          {destination.kind === "address" && isLocalPreview ? <div className={styles.receiveRows}>
            <div className={styles.receiveRow}>
              <span className={styles.receiveValue}><span className={styles.receiveLabel}>Stellar address</span><span className={styles.fullAddress} aria-label={destination.value}><span>{destination.value.slice(0, 28)}</span><span>{destination.value.slice(28)}</span></span></span>
              <button className={styles.rowCopy} type="button" aria-label="Copy address" onClick={() => shareDestination(destination, true)}>{copied ? Ico.check({ size: 16 }) : <CopyGlyph />}</button>
            </div>
            <div className={styles.receiveRow}>
              <span className={styles.receiveValue}><span className={styles.receiveLabel}>Memo · <strong>Required</strong></span><span className={styles.memoValue}>{PREVIEW_RECEIVE_MEMO}</span></span>
              <button className={styles.rowCopy} type="button" aria-label="Copy memo" onClick={() => void copyPreviewMemo()}>{copiedMemo ? Ico.check({ size: 16 }) : <CopyGlyph />}</button>
            </div>
            <span className="sr-only" aria-live="polite">{copied ? "Address copied" : copiedMemo ? "Memo copied" : ""}</span>
          </div> : destination.kind === "address" && <button className={styles.copy} type="button" title={destination.value}
            aria-label={deposit.copy} aria-describedby="receive-address" data-copy-error={Boolean(shareError) || undefined}
            onClick={() => shareDestination(destination, true)}>
            <span id="receive-address">{isLocalPreview ? `${destination.value.slice(0, 4).toLowerCase()}…${destination.value.slice(-4).toLowerCase()}` : destination.value}</span>
            {copied ? Ico.check({ size: 16 }) : isLocalPreview ? <CopyGlyph /> : Ico.link({ size: 16 })}
            <span className="sr-only" aria-live="polite">{copied ? t("receive.copied") : ""}</span>
          </button>}
          <p className={styles.note}>{isLocalPreview ? "Send only XLM or USDC on the Stellar network to this address, with the memo." : deposit.warning}</p>
          {!identity.username && !isLocalPreview && <p className={styles.note}>{c.addressHint}</p>}
          <button className={styles.link} type="button" aria-haspopup="dialog"
            onClick={() => setGuidanceOpen(true)}>{deposit.stepsTitle}</button>
          {!isLocalPreview && usernameLink?.kind === "username" && <button className={styles.link} type="button"
            onClick={() => shareDestination(usernameLink)}>{c.shareUsername}</button>}
        </> : <>
          <p className={styles.status} role="status">{status === "loading" ? m("Loading receive code…") : m("Receive code unavailable")}</p>
          {status === "guest" && <p className={styles.note}>{c.guest} <Link href="/signin?next=%2Freceive">{c.signIn}</Link></p>}
          {status === "ready" && <p className={styles.note}>{c.noWallet}</p>}
        </>}
        {!isLocalPreview && !destination && <p className={styles.note}>{m("Testnet only · no real money")}</p>}
        {shareError && <p className={styles.error} role="alert">{moneyMessage(locale, shareError)}</p>}
      </section>
      {isLocalPreview ? <PrototypeDoodle variant="receive" /> : <div className={styles.pattern} aria-hidden="true" />}
      <div className={styles.actions}>
        <Btn kind="secondary" onClick={goBack}>{t("send.done")}</Btn>
        <Btn kind="primary" disabled={!destination} onClick={() => setPosterOpen(true)}
          leading={copied ? Ico.check({ c: "#fff" }) : <ShareGlyph />}>
          {t("receive.share")}
        </Btn>
      </div>
      {guidanceOpen && <ReceiveGuidanceSheet copy={deposit} closeLabel={c.close} onClose={() => setGuidanceOpen(false)} />}
      {posterOpen && destination && identity.address && <ReceivePosterSheet
        address={identity.address}
        username={usernameLink?.kind === "username" ? identity.username : null}
        preview={isLocalPreview}
        memo={isLocalPreview ? PREVIEW_RECEIVE_MEMO : null}
        copy={c}
        copiedLabel={t("receive.copied")}
        closeLabel={c.close}
        onClose={() => setPosterOpen(false)}
      />}
    </div>
  );
}

function ReceiveGuidanceSheet({ copy, closeLabel, onClose }: {
  copy: ReturnType<typeof xlmDepositCopy>;
  closeLabel: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const clickedBackdrop = useRef(false);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = node.closest(".sl-app-frame");
    const align = () => {
      const bounds = frame?.getBoundingClientRect();
      if (!bounds) return;
      node.style.setProperty("--guidance-center", `${bounds.left + bounds.width / 2}px`);
      node.style.setProperty("--guidance-bottom", `${Math.max(0, window.innerHeight - bounds.bottom)}px`);
      node.style.setProperty("--guidance-frame-width", `${bounds.width}px`);
      node.style.setProperty("--guidance-frame-height", `${bounds.height}px`);
    };
    align();
    window.addEventListener("resize", align);
    node.showModal();
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("resize", align);
      node.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return <dialog
    ref={dialog}
    className={styles.guidanceDialog}
    aria-labelledby="receive-guidance-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onPointerDown={event => { clickedBackdrop.current = event.target === event.currentTarget; }}
    onClick={event => {
      if (clickedBackdrop.current && event.target === event.currentTarget) onClose();
      clickedBackdrop.current = false;
    }}
  >
    <div className={styles.guidanceSheet}>
      <header className={styles.guidanceHeader}>
        <h2 id="receive-guidance-title">{copy.stepsTitle}</h2>
        <button ref={closeButton} className={styles.guidanceClose} type="button" aria-label={closeLabel} onClick={onClose}>
          {Ico.x({ size: 20 })}
        </button>
      </header>
      <ol className={styles.guidanceSteps}>
        <li>{copy.step1}</li>
        <li>{copy.step2}</li>
        <li>{copy.step3}</li>
        <li>{copy.inactive}</li>
      </ol>
      <footer className={styles.guidanceFooter}>
        <Btn kind="primary" onClick={onClose}>{copy.gotIt}</Btn>
      </footer>
    </div>
  </dialog>;
}

function ReceivePosterSheet({ address, username, preview, memo, copy, copiedLabel, closeLabel, onClose }: {
  address: string;
  username: string | null;
  preview: boolean;
  memo: string | null;
  copy: ReturnType<typeof receiveCopy>;
  copiedLabel: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const qr = useRef<HTMLCanvasElement>(null);
  const clickedBackdrop = useRef(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [poster, setPoster] = useState<Blob | null>(null);
  const [status, setStatus] = useState<"making" | "ready" | "error" | "saved" | "fallback" | "copied" | "copyFailed">("making");
  const filename = username && /^[a-z0-9_]{3,32}$/.test(username) ? `salapi-${username}.png` : "salapi-receive.png";

  useEffect(() => {
    const source = qr.current;
    if (!source) return;
    let active = true;
    let objectUrl: string | null = null;
    void drawReceivePoster(source, address, username, preview, copy, memo).then(blob => {
      if (!active) return;
      if (!blob) { setStatus("error"); return; }
      objectUrl = URL.createObjectURL(blob);
      setPoster(blob);
      setPosterUrl(objectUrl);
      setStatus("ready");
    }).catch(() => { if (active) setStatus("error"); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [address, copy, memo, preview, username]);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = node.closest(".sl-app-frame");
    const align = () => {
      const bounds = frame?.getBoundingClientRect();
      if (!bounds) return;
      node.style.setProperty("--poster-center", `${bounds.left + bounds.width / 2}px`);
      node.style.setProperty("--poster-bottom", `${Math.max(0, window.innerHeight - bounds.bottom)}px`);
      node.style.setProperty("--poster-frame-width", `${bounds.width}px`);
      node.style.setProperty("--poster-frame-height", `${bounds.height}px`);
    };
    align();
    window.addEventListener("resize", align);
    node.showModal();
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("resize", align);
      node.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  function download() {
    if (!poster || !posterUrl) return;
    const link = document.createElement("a");
    link.href = posterUrl;
    link.download = filename;
    link.click();
    setStatus("saved");
  }

  async function share() {
    if (!poster) return;
    const file = new File([poster], filename, { type: "image/png" });
    const shareData: ShareData = { files: [file], title: copy.posterEyebrow, text: username ? `@${username}` : address };
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share(shareData);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
    download();
    setStatus("fallback");
  }

  async function copyValue(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("copyFailed");
    }
  }

  const statusText = status === "making" ? copy.makingPoster
    : status === "error" ? copy.posterUnavailable
      : status === "saved" ? copy.posterSaved
        : status === "fallback" ? copy.posterSavedFallback
          : status === "copied" ? copiedLabel
            : status === "copyFailed" ? copy.copyFailed : "";

  return <dialog
    ref={dialog}
    className={styles.posterDialog}
    aria-labelledby="receive-poster-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onPointerDown={event => { clickedBackdrop.current = event.target === event.currentTarget; }}
    onClick={event => {
      if (clickedBackdrop.current && event.target === event.currentTarget) onClose();
      clickedBackdrop.current = false;
    }}
  >
    <div className={styles.posterSheet}>
      <header className={styles.posterHeader}>
        <h2 id="receive-poster-title">{copy.sharePoster}</h2>
        <button ref={closeButton} className={styles.guidanceClose} type="button" aria-label={closeLabel} onClick={onClose}>
          {Ico.x({ size: 20 })}
        </button>
      </header>
      <div className={styles.posterContent}>
        <div className={styles.posterPreview}>
          {posterUrl ? <Image src={posterUrl} alt={`${copy.posterEyebrow} ${username ? `@${username}` : copy.addressPosterTitle}`} width={270} height={480} unoptimized />
            : <p role="status">{statusText}</p>}
        </div>
        {status === "error" ? <p className={styles.error} role="alert">{statusText}</p> : null}
        <p className={styles.posterStatus} role="status" aria-live="polite">{status !== "making" && status !== "ready" && status !== "error" ? statusText : ""}</p>
        <div className={styles.posterActions}>
          <Btn kind="secondary" disabled={!poster} onClick={download}>{copy.downloadPoster}</Btn>
          <Btn kind="primary" disabled={!poster} leading={<ShareGlyph />} onClick={() => void share()}>{copy.sharePoster}</Btn>
        </div>
        <div className={styles.posterCopies}>
          {username ? <Btn kind="secondary" onClick={() => void copyValue(`@${username}`)}>{copy.copyUsername}</Btn> : null}
          <Btn kind="secondary" onClick={() => void copyValue(address)}>{copy.copyAddress}</Btn>
        </div>
      </div>
      <div className={styles.qrSource} aria-hidden="true">
        <QRCodeCanvas ref={qr} value={address} size={680} level="M" marginSize={4} />
      </div>
    </div>
  </dialog>;
}
