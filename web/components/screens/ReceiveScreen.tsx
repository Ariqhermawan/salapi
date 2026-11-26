"use client";

// The QR shows the saved Stellar Testnet address. Salapi links use @username.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { accountDetails } from "@/app/account-details-actions";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { receiveDestination, receiveShareData, type ReceiveDestination } from "@/lib/receive";
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
import { isLocalPreview, PREVIEW_WALLET } from "@/lib/local-preview";
import styles from "./ReceiveScreen.module.css";

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

export default function ReceiveScreen() {
  const { t, locale } = useT();
  const m = moneyCopy(locale);
  const c = receiveCopy(locale);
  const deposit = xlmDepositCopy(locale);
  const goBack = useGoBack("/");
  const [identity, setIdentity] = useState<{ address: string | null; username: string | null }>(isLocalPreview
    ? { address: PREVIEW_WALLET.address, username: PREVIEW_WALLET.handle } : { address: null, username: null });
  const [status, setStatus] = useState<"loading" | "ready" | "guest" | "error">(isLocalPreview ? "ready" : "loading");
  const [copied, setCopied] = useState(false);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [base, setBase] = useState(SITE);
  const [shareError, setShareError] = useState("");
  const owner = useRef<string | null | undefined>(undefined);
  const revision = useRef(0);
  const active = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const destination = isLocalPreview ? usernameLink
    : status === "ready" ? receiveDestination(identity.address, null, base) : null;
  const qrLabel = isLocalPreview ? t("receive.scan") : c.addressScan;

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
          {destination.kind === "address" && <button className={styles.copy} type="button" title={destination.value}
            aria-label={deposit.copy} aria-describedby="receive-address" data-copy-error={Boolean(shareError) || undefined}
            onClick={() => shareDestination(destination, true)}>
            <span id="receive-address">{destination.value}</span>{copied ? Ico.check({ size: 16 }) : Ico.link({ size: 16 })}
          </button>}
          <p className={styles.note}>{isLocalPreview ? deposit.previewBody : deposit.warning}</p>
          {!identity.username && !isLocalPreview && <p className={styles.note}>{c.addressHint}</p>}
          {!isLocalPreview && <button className={styles.link} type="button" aria-haspopup="dialog"
            onClick={() => setGuidanceOpen(true)}>{deposit.stepsTitle}</button>}
          {!isLocalPreview && usernameLink?.kind === "username" && <button className={styles.link} type="button"
            onClick={() => shareDestination(usernameLink)}>{c.shareUsername}</button>}
        </> : <>
          <p className={styles.status} role="status">{status === "loading" ? m("Loading receive code…") : m("Receive code unavailable")}</p>
          {status === "guest" && <p className={styles.note}>{c.guest} <Link href="/signin?next=%2Freceive">{c.signIn}</Link></p>}
          {status === "ready" && <p className={styles.note}>{c.noWallet}</p>}
        </>}
        {(isLocalPreview || !destination) && <p className={styles.note}>{m("Testnet only · no real money")}</p>}
        {shareError && <p className={styles.error} role="alert">{moneyMessage(locale, shareError)}</p>}
      </section>
      <div className={styles.pattern} aria-hidden="true" />
      <div className={styles.actions}>
        <Btn kind="secondary" onClick={goBack}>{t("send.done")}</Btn>
        <Btn kind="primary" disabled={!destination} onClick={() => shareDestination(destination)}
          leading={copied ? Ico.check({ c: "#fff" }) : <ShareGlyph />}>
          {copied ? t("receive.copied") : t("receive.share")}
        </Btn>
      </div>
      {guidanceOpen && <ReceiveGuidanceSheet copy={deposit} closeLabel={c.close} onClose={() => setGuidanceOpen(false)} />}
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
