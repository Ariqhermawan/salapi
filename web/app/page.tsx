"use client";

// Salapi home — V10 "Circles-first" (live). SALAPI CIRCLES is the hero /
// onboarding block, rendered with real photography (web/public/circles/*) and
// face avatars, on the real design kit (T, Ico, Card, Btn, Chip, Progress).
// Tuned to fit ONE phone screen without scrolling.
//
// Honesty signals kept: TESTNET on the balance, PREVIEW on Circles, SANDBOX on
// the Disaster Vault tile. Balance + circle figures are illustrative demo /
// preview values under those badges; the prior real-data home is preserved at
// Backup/app-page-legacy-realdata.tsx (re-wire walletState/i18n when desired).

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  T,
  Ico,
  Card,
  Btn,
  Chip,
  Progress,
  TestnetPill,
  PoweredByStellar,
} from "@/components/ui/kit";

const BALANCE_INT = "1,667";
const BALANCE_CENTS = "93";

const VIOLET = "#7C3AED";
const VIOLET_TINT = "#EDE9FE";
const AMBER_FG = "#B45309";

const FEATURED = {
  to: "/circles/tino-relief",
  chip: "DISASTER RELIEF",
  title: "Tino survivors, Cebu — rebuild a fishing barangay",
  raised: "$3,181",
  pct: 74,
  gave: 128,
  img: "/circles/disaster.jpg",
  faces: [1, 3, 2, 5],
};

type Cause = {
  to: string;
  cat: string;
  catBg: string;
  title: string;
  raised: string;
  pct: number;
  gave: number;
  img: string;
  faces: number[];
};

const MORE: Cause[] = [
  {
    to: "/circles/ate-mei-dialysis",
    cat: "MEDICAL",
    catBg: "rgba(5,150,105,.94)",
    title: "Ate Mei needs dialysis — 12 sessions to stabilize",
    raised: "$1,074",
    pct: 35,
    gave: 96,
    img: "/circles/medical.jpg",
    faces: [4, 1, 3],
  },
  {
    to: "/circles/barangay-library",
    cat: "EDUCATION",
    catBg: "rgba(124,58,237,.94)",
    title: "Books and tuition for 30 island students",
    raised: "$2,455",
    pct: 62,
    gave: 142,
    img: "/circles/education.jpg",
    faces: [2, 5, 1],
  },
  {
    to: "/circles",
    cat: "LIVELIHOOD",
    catBg: "rgba(37,99,235,.94)",
    title: "New nets and motors for fisher families",
    raised: "$1,832",
    pct: 48,
    gave: 101,
    img: "/circles/livelihood.jpg",
    faces: [5, 2, 4],
  },
];

function PeopleIcon({ c = T.moneyIn, size = 14 }: { c?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="#fff" aria-hidden>
      <path d="M12 21s-7-4.6-9.3-9C1 8.7 2.7 5.5 6 5.5c2 0 3.2 1.1 4 2.3.8-1.2 2-2.3 4-2.3 3.3 0 5 3.2 3.3 6.5C19 16.4 12 21 12 21Z" />
    </svg>
  );
}

function FaceStack({ faces, size = 20, ring = "#fff" }: { faces: number[]; size?: number; ring?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {faces.map((n, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={n}
          src={`/circles/face-${n}.png`}
          alt=""
          width={size}
          height={size}
          style={{
            width: size,
            height: size,
            borderRadius: 99,
            objectFit: "cover",
            marginLeft: i === 0 ? 0 : -(size * 0.34),
            border: `2px solid ${ring}`,
            boxShadow: "0 1px 3px rgba(11,18,32,.28)",
          }}
        />
      ))}
    </div>
  );
}

function HeaderIconBtn({ children, onClick, label, dot = false }: { children: ReactNode; onClick?: () => void; label: string; dot?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{ position: "relative", width: 37, height: 37, borderRadius: 99, border: "none", background: "#fff", color: T.ink, display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px -3px rgba(11,18,32,.18), inset 0 0 0 1px " + T.hairline, cursor: "pointer" }}
    >
      {children}
      {dot && <span aria-hidden style={{ position: "absolute", top: 7, right: 8, width: 7, height: 7, borderRadius: 99, background: T.action, border: "2px solid #fff" }} />}
    </button>
  );
}

export default function Home() {
  const router = useRouter();
  const go = (p: string) => () => router.push(p);

  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink, paddingBottom: 2 }}>
      {/* Greeting */}
      <div style={{ padding: "6px 16px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 99, background: "#fff", display: "grid", placeItems: "center", fontWeight: 800, color: T.action, fontSize: 16, boxShadow: "0 2px 8px -3px rgba(11,18,32,.18), inset 0 0 0 1px " + T.hairline }} aria-hidden>
            S
          </div>
          <div>
            <div style={{ fontSize: 12, color: T.slate, fontWeight: 500, lineHeight: 1.1 }}>Hi 👋</div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em" }}>
              Salapi <span style={{ color: T.slate, fontWeight: 500, fontFamily: T.fontMono, fontSize: 13 }}>· @moonjem</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          <HeaderIconBtn label="Learn" onClick={go("/learn")}>{Ico.bulb({ size: 16, c: T.slate })}</HeaderIconBtn>
          <HeaderIconBtn label="Activity" onClick={go("/activity")} dot>{Ico.bell({ size: 16, c: T.slate })}</HeaderIconBtn>
          <HeaderIconBtn label="Receive" onClick={go("/receive")}>{Ico.qr({ size: 16, c: T.slate })}</HeaderIconBtn>
        </div>
      </div>

      {/* Balance hero — premium dark, gradient + glow */}
      <div style={{ padding: "6px 16px 0" }}>
        <div
          style={{ position: "relative", overflow: "hidden", borderRadius: 20, padding: 13, color: "#fff", background: "radial-gradient(120% 120% at 88% -10%, rgba(37,99,235,.55), transparent 52%), linear-gradient(165deg,#101a31 0%,#0b1220 60%,#0a0f1c 100%)", boxShadow: "0 16px 34px -22px rgba(11,18,32,.7), inset 0 0 0 1px rgba(255,255,255,.06)" }}
        >
          <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 50% at 12% 120%, rgba(5,150,105,.30), transparent 60%)" }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.62)" }}>Available balance</span>
              <TestnetPill />
            </div>
            <div className="sl-balance sl-rise" style={{ marginTop: 5, fontWeight: 800, fontSize: 35, lineHeight: 1, letterSpacing: "-0.03em", display: "flex", alignItems: "flex-start", gap: 2 }}>
              <span style={{ fontSize: 19, fontWeight: 700, marginTop: 5, color: "rgba(255,255,255,.72)" }}>$</span>
              {BALANCE_INT}
              <span style={{ fontSize: 17, fontWeight: 700, marginTop: 5, color: "rgba(255,255,255,.5)" }}>.{BALANCE_CENTS}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: "rgba(255,255,255,.6)", display: "flex", alignItems: "center", gap: 6 }}>
              <span className="sl-mono" style={{ color: "rgba(255,255,255,.75)" }}>approx $1,667.93</span>
              <span>·</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#5fe3ad", fontWeight: 600 }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: "#34d399" }} />
                Live · crypto invisible
              </span>
            </div>
            <div style={{ marginTop: 11, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
              <button onClick={go("/topup")} style={{ height: 42, borderRadius: 12, border: "none", background: "#fff", color: T.ink, fontFamily: T.fontSans, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer", boxShadow: "0 6px 16px -8px rgba(0,0,0,.5)" }}>
                {Ico.arrowDown({ c: T.action, size: 16 })} Top up
              </button>
              <button onClick={go("/withdraw")} style={{ height: 42, borderRadius: 12, border: "none", background: "rgba(255,255,255,.1)", color: "#fff", fontFamily: T.fontSans, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18)", cursor: "pointer" }}>
                {Ico.arrowUp({ c: "#fff", size: 16 })} Withdraw
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SALAPI CIRCLES — hero / onboarding flagship */}
      <div style={{ padding: "4px 16px 0" }}>
        <Card p={11} elevation style={{ borderRadius: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.09em", color: T.action }}>SALAPI CIRCLES</span>
            <Chip kind="neutral" size="sm">PREVIEW</Chip>
          </div>

          {/* 2-column: pitch (left) + featured photo card (right) */}
          <div style={{ display: "flex", gap: 11, marginTop: 8, alignItems: "stretch" }}>
            <div style={{ flex: "1.12 1 0", minWidth: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 16.5, fontWeight: 800, letterSpacing: "-0.027em", lineHeight: 1.08 }}>
                Raise for any cause — proof on every peso.
              </div>
              <div style={{ marginTop: 5, fontSize: 10.5, color: T.slate, lineHeight: 1.28 }}>
                Every donation lands in a smart contract with a public receipt, withdrawable only to the cause.
              </div>
              <span style={{ marginTop: 6, alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 600, color: T.moneyIn, background: T.moneyInTint, padding: "4px 9px", borderRadius: 99, lineHeight: 1.2 }}>
                <PeopleIcon c={T.moneyIn} size={12} />
                12 gave this hour ·{" "}<b style={{ color: T.ink, fontWeight: 800 }}>+$240</b>
              </span>
              <div style={{ marginTop: 6, fontSize: 11, color: T.ink, lineHeight: 1.28 }}>
                Start your own cause —{" "}<b style={{ fontWeight: 700 }}>public proof in 2 minutes.</b>
              </div>
            </div>

            {/* featured photo card */}
            <div
              onClick={go(FEATURED.to)}
              style={{ flex: "0.88 1 0", minWidth: 0, position: "relative", borderRadius: 13, overflow: "hidden", minHeight: 124, cursor: "pointer", boxShadow: "inset 0 0 0 1px " + T.hairline }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={FEATURED.img} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(7,12,22,.90) 2%, rgba(7,12,22,.5) 40%, rgba(7,12,22,0) 66%)" }} />
              <span style={{ position: "absolute", left: 8, top: 8, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.05em", color: "#fff", background: "rgba(11,18,32,.55)", backdropFilter: "blur(4px)", padding: "3px 7px", borderRadius: 99 }}>{FEATURED.chip}</span>
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 10px 10px", color: "#fff" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.22, textShadow: "0 1px 8px rgba(0,0,0,.4)" }}>{FEATURED.title}</div>
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600 }}>
                  {FEATURED.raised} <span style={{ color: "rgba(255,255,255,.78)" }}>raised · {FEATURED.pct}%</span>
                </div>
                <div style={{ marginTop: 5, height: 5, borderRadius: 99, background: "rgba(255,255,255,.28)", overflow: "hidden" }}>
                  <div style={{ width: FEATURED.pct + "%", height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#34d399,#059669)" }} />
                </div>
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <FaceStack faces={FEATURED.faces} size={20} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,.88)" }}>{FEATURED.gave} gave</span>
                </div>
              </div>
            </div>
          </div>

          {/* CTAs */}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Btn kind="primary" size="md" full={false} style={{ flex: 1, height: 40 }} onClick={go(FEATURED.to)} leading={<HeartIcon />}>Donate</Btn>
            <Btn kind="quiet" size="md" full={false} style={{ height: 40 }} onClick={go("/circles/create")} leading={Ico.plus({ size: 16, c: T.action })}>Start a circle</Btn>
            <button onClick={go("/circles")} aria-label="Share" style={{ width: 42, height: 40, flex: "0 0 auto", borderRadius: T.rCtrl, background: "#fff", display: "grid", placeItems: "center", boxShadow: "inset 0 0 0 1px " + T.hairline, cursor: "pointer" }}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" />
              </svg>
            </button>
          </div>
        </Card>
      </div>

      {/* LIVE TODAY — quick tiles */}
      <div style={{ padding: "4px 16px 0" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate, padding: "0 4px 6px" }}>Live today</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          {[
            { ico: Ico.lock, bg: T.moneyInTint, fg: T.moneyIn, t: "Smart Savings", s: "Lock toward a goal", to: "/savings", sandbox: false, group: false },
            { ico: Ico.star, bg: VIOLET_TINT, fg: VIOLET, t: "Savings circle", s: "Group saving you trust", to: "/paluwagan", sandbox: false, group: true },
            { ico: Ico.send, bg: T.actionTint, fg: T.action, t: "Send by @", s: "Send to anyone by name", to: "/send", sandbox: false, group: false },
            { ico: Ico.shield, bg: T.warnTint, fg: AMBER_FG, t: "Disaster Vault", s: "Verifiable on-chain", to: "/transparency", sandbox: true, group: false },
          ].map((tile) => (
            <div
              key={tile.t}
              onClick={go(tile.to)}
              className="sl-lift"
              style={{ cursor: "pointer", background: T.surface, borderRadius: 13, padding: 8, boxShadow: "0 2px 8px -2px rgba(11,18,32,.08), inset 0 0 0 1px " + T.hairline, display: "flex", gap: 9, alignItems: "center" }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 9, background: tile.bg, color: tile.fg, display: "grid", placeItems: "center", flex: "0 0 auto" }} aria-hidden>
                {tile.group ? <PeopleIcon c={tile.fg} size={17} /> : tile.ico({ size: 17, c: tile.fg })}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.1 }}>{tile.t}</span>
                  {tile.sandbox && <Chip kind="warn" size="sm">SANDBOX</Chip>}
                </div>
                <div style={{ marginTop: 1, fontSize: 10, color: T.slate }}>{tile.s}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MORE LIVE CAUSES */}
      <div style={{ padding: "4px 0 0" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "0 20px 5px" }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>More live causes</span>
          <span onClick={go("/circles")} style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 600, color: T.action, cursor: "pointer" }}>See all ›</span>
        </div>
        <div className="sl-hscroll" style={{ display: "flex", gap: 9, overflowX: "auto", padding: "2px 16px 4px" }}>
          {MORE.map((c) => (
            <div
              key={c.title}
              onClick={go(c.to)}
              className="sl-lift"
              style={{ flex: "0 0 130px", cursor: "pointer", background: "#fff", borderRadius: 13, overflow: "hidden", boxShadow: "0 8px 20px -16px rgba(11,18,32,.22), inset 0 0 0 1px " + T.hairline }}
            >
              <div style={{ height: 40, position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.img} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                <span style={{ position: "absolute", left: 6, top: 6, fontSize: 7.5, fontWeight: 800, letterSpacing: "0.04em", color: "#fff", background: c.catBg, padding: "2px 6px", borderRadius: 99 }}>{c.cat}</span>
              </div>
              <div style={{ padding: "6px 9px 6px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.2, height: 25, overflow: "hidden" }}>{c.title}</div>
                <div style={{ marginTop: 5, fontSize: 10, fontWeight: 600 }}>
                  {c.raised} <span style={{ color: T.slate, fontWeight: 500 }}>· {c.pct}%</span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <Progress pct={c.pct} h={4} color={T.moneyIn} />
                </div>
                <div style={{ marginTop: 7, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <FaceStack faces={c.faces} size={17} />
                  <span style={{ fontSize: 9.5, color: T.slate, fontWeight: 600 }}>{c.gave} gave</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: "4px 20px 4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
