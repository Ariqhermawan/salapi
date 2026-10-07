"use client";

// A username QR opens Salapi Send. An address QR is for Stellar Testnet wallets.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { accountDetails } from "@/app/account-details-actions";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { receiveDestination, receiveShareData } from "@/lib/receive";
import { receiveCopy } from "@/lib/i18n/receive";
import { useT } from "@/components/I18nProvider";
import { moneyCopy, moneyMessage } from "@/lib/i18n/revamp-money";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Btn,
  PoweredByStellar,
} from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import { isLocalPreview, PREVIEW_WALLET } from "@/lib/local-preview";

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
  const goBack = useGoBack("/send");
  const [identity, setIdentity] = useState<{ address: string | null; username: string | null }>(isLocalPreview
    ? { address: PREVIEW_WALLET.address, username: PREVIEW_WALLET.handle } : { address: null, username: null });
  const [status, setStatus] = useState<"loading" | "ready" | "guest" | "error">(isLocalPreview ? "ready" : "loading");
  const [copied, setCopied] = useState(false);
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

  const destination = status === "ready" ? receiveDestination(identity.address, identity.username, base) : null;

  async function onShare() {
    if (!destination || !active.current) return;
    const request = revision.current;
    const current = () => active.current && revision.current === request;
    setShareError("");
    const data = receiveShareData(destination, destination.kind === "username" ? c.usernameCaption : c.addressCaption);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(data);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Unsupported sharing falls back to copying the exact destination.
    }
    if (!current()) return;
    try {
      await navigator.clipboard.writeText(destination.value);
      if (!current()) return;
      setCopied(true);
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => { if (current()) setCopied(false); }, 1800);
    } catch {
      if (current()) setShareError(c.shareUnavailable);
    }
  }

  return (
    <div
      style={{
        fontFamily: T.fontSans,
        color: T.ink,
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <AppBar
        leading={
          <IconButton ariaLabel={m("Back")} onClick={goBack}>
            {Ico.back({})}
          </IconButton>
        }
        title={t("receive.title")}
      />

      <div style={{ padding: "4px 24px 0", textAlign: "center" }}>
        <p
          style={{
            fontSize: 13.5,
            color: T.slate,
            lineHeight: 1.5,
            maxWidth: 300,
            margin: "0 auto",
          }}
        >
          {isLocalPreview ? m("Try receiving with your example username in this local preview.") : status === "guest" ? c.guest : destination?.kind === "address" ? c.addressHint : c.usernameHint}
        </p>
        {status === "guest" ? <Link href="/signin?next=%2Freceive">{c.signIn}</Link> : null}
        {status === "ready" && !destination ? <p style={{ fontSize: 13, color: T.slate }}>{c.noWallet}</p> : null}
      </div>

      {/* QR card */}
      <div style={{ padding: "20px 16px 0", display: "flex", justifyContent: "center" }}>
        <div
          style={{
            width: "100%",
            maxWidth: 320,
            background: "#F2EFE7",
            borderRadius: 28,
            boxShadow:
              "0 20px 44px -22px rgba(11,18,32,.4), inset 0 0 0 1px " + T.hairline,
            padding: "24px 24px 22px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: T.slate,
            }}
          >
            {destination?.kind === "address" ? c.addressScan : t("receive.scan")}
          </div>
          <div
            style={{
              marginTop: 14,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              borderRadius: 18,
              background: "#fff",
              boxShadow: "inset 0 0 0 1px " + T.hairline,
            }}
          >
            {destination ? <QRCodeSVG
              value={destination.value}
              size={188}
              level="M"
              marginSize={2}
              fgColor={T.ink}
              bgColor="#ffffff"
            /> : <div role="status" style={{ width: 188, height: 188, display: "grid", placeItems: "center", color: T.slate, fontSize: 13 }}>{status === "loading" ? m("Loading receive code…") : m("Receive code unavailable")}</div>}
          </div>
          <div
            style={{
              marginTop: 18,
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: T.action,
              overflowWrap: "anywhere",
              userSelect: "text",
            }}
          >
            {destination?.display ?? "…"}
          </div>
          {destination?.kind === "address" ? <p style={{ fontSize: 12, color: T.slate }}>{c.addressLabel}</p> : null}
          <div style={{ marginTop: 4, fontSize: 12, color: T.slate }}>
            {m("Testnet only · no real money")}
          </div>
        </div>
      </div>

      {/* Spacer keeps the CTA + footer low without a sticky bar (short screen). */}
      <div style={{ flex: 1, minHeight: 12 }} />

      <div style={{ padding: "18px 16px 0" }}>
        {shareError && <p role="alert" style={{ color: T.danger, fontSize: 13, lineHeight: 1.5 }}>{moneyMessage(locale, shareError)}</p>}
        <Btn
          kind="primary"
          disabled={!destination}
          onClick={onShare}
          leading={copied ? Ico.check({ c: "#fff" }) : <ShareGlyph />}
        >
          {copied ? t("receive.copied") : t("receive.share")}
        </Btn>
      </div>

      <div style={{ padding: "16px 16px 0", display: "flex", justifyContent: "center" }}>
        <PoweredByStellar />
      </div>
      <div style={{ height: 8 }} />
    </div>
  );
}
