"use client";

// Shared honesty markers for Salapi Circles' Operational Allowance preview
// (Build-Award STAGE 2). Mirrors SOW v2 Spotlight Section 8 "Honest creator
// economy". NONE of this is on-chain today.
//
// Three exports, two modals:
//   <Stage2Pill />            small pill placed in AppBar trailing; tap opens
//                              the StageExplainer modal (3-tier overview).
//   <WhyExistsLink />          inline text-link; tap opens the trust-and-safety
//                              modal with the Cak Budi case + the five trust
//                              gates from SOW Section 8 (verbatim phrasing).
//   <StageExplainerModalShared open onClose />
//                              the StageExplainer modal as a controlled
//                              component, also imported by PreviewBadge so the
//                              two pills open the same explainer.

import { useEffect, useState, type ReactNode } from "react";
import { T, Ico } from "@/components/ui/kit";

/* ───────────────────────── modal hygiene helper ───────────────────────── */
function useModalA11y(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

function ModalShell({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useModalA11y(open, onClose);
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,18,32,0.55)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 80,
        padding: 12,
        overflowY: "auto",
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
          maxHeight: "90vh",
          overflowY: "auto",
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
        {children}
      </div>
    </div>
  );
}

/* ─────────────────── Stage explainer modal (3-tier scope) ─────────────────── */
export function StageExplainerModalShared({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <ModalShell open={open} onClose={onClose}>
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
            background: T.actionTint,
            color: T.action,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {Ico.shield({ size: 18, c: T.action })}
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.2 }}>
          What ships when
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <StageRow
          tag="DAY-30"
          tagBg={T.moneyInTint}
          tagFg={T.moneyIn}
          title="Disaster Vault, live on Stellar testnet"
          body="0 percent organizer cut. Whitelisted NGO shortlist. Already running, every contribute and disburse is a public on-chain transaction."
          live
        />
        <StageRow
          tag="STAGE 1"
          tagBg={T.warnTint}
          tagFg={T.warn}
          title="Salapi Circles, Build-Award"
          body="Opens the same primitive to any cause from any trusted person, borderless by one Google login. Verification, moderation, dispute handling launch at Build-Award."
        />
        <StageRow
          tag="STAGE 2"
          tagBg={T.warnTint}
          tagFg={T.warn}
          title="Operational Allowance, Build-Award"
          body="Transparent organizer reimbursement, capped at 10 percent, gated by KYC tier. Encoded at circle creation, immutable, escrowed until proof of delivery."
        />
      </div>

      <p
        style={{
          marginTop: 14,
          fontSize: 12.5,
          color: T.slate,
          lineHeight: 1.55,
        }}
      >
        None of stages 1 or 2 is on-chain today. Disaster Vault is. See
        Salapi-SOW-v2.pdf Spotlight Sections 6, 7, 8.
      </p>

      <button
        type="button"
        onClick={onClose}
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
    </ModalShell>
  );
}

function StageRow({
  tag,
  tagBg,
  tagFg,
  title,
  body,
  live = false,
}: {
  tag: string;
  tagBg: string;
  tagFg: string;
  title: string;
  body: string;
  live?: boolean;
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 14,
        background: T.canvas,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 8px",
            borderRadius: 99,
            background: tagBg,
            color: tagFg,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.06em",
          }}
        >
          {live && (
            <span
              className="sl-pulse"
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: tagFg,
              }}
            />
          )}
          {tag}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</span>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 12.5,
          color: T.slate,
          lineHeight: 1.5,
        }}
      >
        {body}
      </p>
    </div>
  );
}

/* ───────────────────── Stage 2 pill (small, in AppBar) ───────────────────── */
export function Stage2Pill() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="About Operational Allowance, Build-Award stage 2"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 11px 5px 11px",
          borderRadius: 999,
          background: T.ink,
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          border: "1px solid " + T.ink,
          cursor: "pointer",
          fontFamily: T.fontSans,
          boxShadow: "0 1px 2px rgba(11,18,32,0.18)",
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
        Build-Award · Stage 2
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 14,
            height: 14,
            borderRadius: 99,
            background: "rgba(255,255,255,0.18)",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            marginLeft: 2,
          }}
        >
          i
        </span>
      </button>
      <StageExplainerModalShared open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/* ─────────────────── Trust-and-safety modal (Cak Budi + gates) ────────────── */
function TrustAndSafetyModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <ModalShell open={open} onClose={onClose}>
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
        <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.2 }}>
          Why an honest operational allowance exists.
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
        In Indonesia and the Philippines, individual organizers who help others
        either absorb real costs (transport, time, documentation) and burn out,
        or quietly take a slice with no disclosure, which breaks donor trust.
      </p>

      {/* Cak Budi block, empathetic framing */}
      <div
        style={{
          marginTop: 12,
          padding: "12px 14px",
          borderRadius: 14,
          background: T.canvas,
          color: T.ink,
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: T.slate,
            marginBottom: 6,
          }}
        >
          Documented case: Cak Budi, Indonesia 2017
        </div>
        <p style={{ margin: 0 }}>
          Budi Utomo raised donations via Kitabisa and Instagram, used Rp 1.7B
          of donor funds to buy a Toyota Fortuner and an iPhone 7 framed as
          operational tools, faced public outcry, and eventually sold the
          Fortuner and donated the proceeds back.
        </p>
        <p
          style={{
            margin: "10px 0 0",
            fontSize: 12.5,
            color: T.slate,
          }}
        >
          The failure was not that he wanted operational means. The failure was
          that the donation rail offered no honest way to take it.
        </p>
      </div>

      {/* Five trust gates - SOW Section 8 wording */}
      <div
        style={{
          marginTop: 16,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: T.slate,
        }}
      >
        Five trust gates
      </div>
      <ol
        style={{
          margin: "8px 0 0",
          padding: "0 0 0 20px",
          fontSize: 13,
          lineHeight: 1.55,
          color: T.ink,
        }}
      >
        <Gate
          title="Donor sees the split before donating."
          body='The donate screen renders the math: "Of every Rp 100,000 you send, Rp 92,000 to beneficiary, Rp 8,000 operational cost for the organizer." Not fine print, not a hidden tab.'
        />
        <Gate
          title="KYC and reputation tier the ceiling."
          body="Brand-new account: 0 percent. Tier 1 (basic ID): up to 5 percent. Tier 2 (enhanced KYC plus 3 prior circles closed with verified delivery): up to 10 percent."
        />
        <Gate
          title="Allowance escrowed until proof of delivery."
          body="The contract holds the allowance until the organizer uploads proof of beneficiary receipt (photo, signature, or receipt), hashed on-chain."
        />
        <Gate
          title="Seven-day dispute window."
          body="A multi-donor signal triggers a freeze and a community review. If the dispute holds, the allowance returns pro-rata to donors."
        />
        <Gate
          title="Reputation slashable on-chain."
          body="The record is permanent and visible to every future donor. One bad close locks Tier 2 for a cool-off; repeated failures bar the account."
        />
      </ol>

      <div
        style={{
          marginTop: 16,
          padding: "10px 12px",
          borderRadius: 12,
          background: T.warnTint,
          color: T.warn,
          fontSize: 12,
          lineHeight: 1.45,
          fontWeight: 600,
        }}
      >
        Operational Allowance ships at Build-Award stage 2, after Salapi
        Circles itself launches.
      </div>

      <div
        style={{
          marginTop: 12,
          fontSize: 10.5,
          color: T.slate,
          lineHeight: 1.6,
          fontFamily: T.fontMono,
        }}
      >
        Sources: BBC Indonesia, &ldquo;Kasus Cak Budi: Akhirnya Fortuner dijual
        dan donasi Rp1,7 miliar&rdquo; (3 May 2017); NU Online, &ldquo;Kasus
        Cak Budi, Mensos Khofifah Angkat Bicara&rdquo; (2 May 2017); Tempo,
        &ldquo;Kontroversi Penyaluran Donasi, Kitabisa.com Tutup Akun Cak
        Budi&rdquo; (2017).
      </div>

      <button
        type="button"
        onClick={onClose}
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
    </ModalShell>
  );
}

function Gate({ title, body }: { title: string; body: string }) {
  return (
    <li style={{ marginBottom: 10 }}>
      <span style={{ fontWeight: 600 }}>{title}</span>{" "}
      <span style={{ color: T.slate }}>{body}</span>
    </li>
  );
}

/* ──────────── "Why this exists" link (opens trust-and-safety modal) ──────── */
export function WhyExistsLink({
  label = "Why this exists",
  align = "left",
}: {
  label?: string;
  align?: "left" | "center";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 6px",
          margin: align === "center" ? "0 auto" : 0,
          background: "transparent",
          border: "none",
          color: T.action,
          fontFamily: T.fontSans,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {Ico.bulb({ size: 14, c: T.action })}
        {label}
      </button>
      <TrustAndSafetyModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
