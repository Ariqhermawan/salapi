"use client";

// Receive — a real, scannable QR of the user's pay link. Crypto-invisible:
// the QR encodes salapi.app/send?to=<username> so any phone camera opens the
// Send flow pre-filled with this handle. No address, no token name on the face;
// the on-chain layer stays behind "View on Stellar". Falls back to the raw
// Stellar address only when no username is claimed yet.

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { myHandle, walletState } from "@/app/actions";
import { requireWalletState } from "@/lib/wallet-state";
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
  const goBack = useGoBack("/send");
  const [username, setUsername] = useState<string | null>(isLocalPreview ? PREVIEW_WALLET.handle : null);
  const [address, setAddress] = useState(isLocalPreview ? PREVIEW_WALLET.address : "");
  const [copied, setCopied] = useState(false);
  const [base, setBase] = useState(SITE);
  const [shareError, setShareError] = useState("");

  useEffect(() => {
    if (isLocalPreview) { Promise.resolve(window.location.origin).then(setBase); return; }
    walletState().then(requireWalletState).then((s) => setAddress(s.address)).catch(() => setShareError("Your wallet could not be loaded. Reload this page before sharing a receive link."));
    myHandle().then((u) => u && setUsername(u)).catch(() => {});
  }, []);

  const handle = username
    ? "@" + username
    : address
      ? `${address.slice(0, 6)}…${address.slice(-4)}`
      : "…";
  // Scannable destination: a real pay deep-link when a username exists, else
  // the raw on-chain address as a safe fallback.
  const shareUrl = username ? `${base}/send?to=${username}` : address || base;

  async function onShare() {
    setShareError("");
    const data = { title: "Salapi", text: t("receive.sub"), url: shareUrl };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(data);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      /* user dismissed the share sheet, or it is unsupported — fall through */
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setShareError(m("Sharing is unavailable in this browser. You can copy the username shown above."));
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
          {isLocalPreview ? m("Try receiving with your example username in this local preview.") : m("Share your username or scan this code to receive Testnet XLM.")}
        </p>
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
            {t("receive.scan")}
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
            {username || address ? <QRCodeSVG
              value={shareUrl}
              size={188}
              level="M"
              marginSize={2}
              fgColor={T.ink}
              bgColor="#ffffff"
            /> : <div role="status" style={{ width: 188, height: 188, display: "grid", placeItems: "center", color: T.slate, fontSize: 13 }}>{shareError ? m("Receive code unavailable") : m("Loading receive code…")}</div>}
          </div>
          <div
            style={{
              marginTop: 18,
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: T.action,
              overflowWrap: "anywhere",
            }}
          >
            {handle}
          </div>
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
          disabled={!username && !address}
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
