"use client";

// Shared honesty marker for every Salapi Circles screen.
// A persistent "Preview, Build-Award" pill with a tappable info icon that
// opens a modal explaining the scope. Mirrors the SOW Spotlight Section 7
// framing. Used by every Circles screen.

import { useState } from "react";
import { T, Ico } from "@/components/ui/kit";

export default function PreviewBadge() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="About Salapi Circles preview"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 11px 5px 12px",
          borderRadius: 999,
          background: T.warnTint,
          color: T.warn,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          border: "1px solid " + T.warnTint,
          cursor: "pointer",
          fontFamily: T.fontSans,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: 99,
            background: T.warn,
          }}
        />
        Preview, Build-Award
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 14,
            height: 14,
            borderRadius: 99,
            background: "rgba(180,83,9,0.18)",
            color: T.warn,
            fontSize: 10,
            fontWeight: 700,
            marginLeft: 2,
          }}
        >
          i
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(11,18,32,0.55)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 80,
            padding: 12,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: T.surface,
              borderRadius: 20,
              padding: "18px 18px 22px",
              width: "100%",
              maxWidth: 440,
              boxShadow:
                "0 24px 60px -20px rgba(11,18,32,0.45), inset 0 0 0 1px " +
                T.hairline,
              fontFamily: T.fontSans,
              color: T.ink,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 99,
                  background: "#D5D9E2",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 6,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  background: T.warnTint,
                  color: T.warn,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {Ico.shield({ size: 18, c: T.warn })}
              </div>
              <div style={{ fontSize: 17, fontWeight: 600 }}>
                Salapi Circles is a preview
              </div>
            </div>
            <p
              style={{
                marginTop: 12,
                fontSize: 13.5,
                lineHeight: 1.55,
                color: T.slate,
              }}
            >
              Salapi Circles is the Build-Award expansion of Salapi&apos;s
              Disaster Vault, currently live on Stellar testnet. The full
              Circles surface (open verification, moderation, dispute handling)
              launches at Build-Award. This preview shows the working user
              flow.
            </p>
            <p
              style={{
                marginTop: 10,
                fontSize: 13.5,
                lineHeight: 1.55,
                color: T.slate,
              }}
            >
              See <strong style={{ color: T.ink }}>Salapi-SOW-v2.pdf
              Spotlight Section 7</strong> for the full plan: trust in the
              contract not the brand, borderless by one Google login, never
              monetize generosity.
            </p>
            <div
              style={{
                marginTop: 14,
                padding: "10px 12px",
                borderRadius: 12,
                background: T.canvas,
                fontSize: 12.5,
                color: T.slate,
                lineHeight: 1.5,
              }}
            >
              The live primitive Circles is built on is the{" "}
              <strong style={{ color: T.ink }}>Disaster Vault</strong>, already
              on Stellar testnet today. Visit the Disaster Vault page to see
              the same on-chain receipt mechanism working end to end.
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                marginTop: 16,
                width: "100%",
                height: 48,
                borderRadius: 12,
                border: "none",
                background: T.action,
                color: "#fff",
                fontFamily: T.fontSans,
                fontWeight: 600,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
