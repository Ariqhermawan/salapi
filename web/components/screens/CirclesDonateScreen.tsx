"use client";

// Salapi Circles — Donate flow (PREVIEW, Build-Award).
// Option (b) waitlist: amount picker + method + toggles, then a waitlist
// signup screen. No on-chain transfer happens here. The email is saved to
// the Supabase `circles_waitlist` table via the joinCirclesWaitlist server
// action; if Supabase is not configured the action gracefully degrades to a
// server-side console log and the UI still confirms the pledge.
//
// V10 revamp: matches the photo-forward Circle Detail it routes from — a photo
// cause-context card, a big centered amount display (like Send / Top up), pill
// quick-picks, green money, and a STICKY bottom CTA bar that floats above the
// BottomNav (PoweredByStellar scrolls above it). Every PREVIEW / waitlist /
// "no charge today" honesty element is preserved verbatim.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinCirclesWaitlist } from "@/app/actions";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Card,
  Btn,
  Chip,
  PoweredByStellar,
} from "@/components/ui/kit";
import { formatParts, CURRENCY } from "@/lib/ui/currency";
import { useT } from "@/components/I18nProvider";
import PreviewBadge from "@/components/circles/PreviewBadge";
import type { Circle, CircleCategory } from "@/lib/circles/types";

type Phase = "amount" | "waitlist" | "done";
type Method = "balance" | "gcash" | "qris";

// Quick chips in PHP app-units. Display layer converts to user's locale.
const QUICK = [100, 250, 500, 1000, 2500];

// Owned cause photography by category — same assets as the Circle Detail hero,
// so the donate flow keeps the same documentary cover the donor just saw.
const CATEGORY_PHOTO: Partial<Record<CircleCategory, string>> = {
  disaster: "/circles/disaster.jpg",
  medical: "/circles/medical.jpg",
  education: "/circles/education.jpg",
};

// Sticky bottom CTA bar — mirrors CircleDetailScreen exactly so the two screens
// share one signature. main has overflow-y-auto + pb so bottom:0 pins it just
// above the BottomNav rather than the viewport edge; PoweredByStellar scrolls
// above it.
function StickyBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        marginTop: 8,
        padding: "12px 16px",
        background: "rgba(244,246,251,0.94)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        borderTop: "1px solid " + T.hairline,
        boxShadow: "0 -12px 28px -16px rgba(11,18,32,.28)",
        zIndex: 5,
      }}
    >
      {children}
    </div>
  );
}

export default function CirclesDonateScreen({ circle }: { circle: Circle }) {
  const router = useRouter();
  const { locale, t, currency } = useT();

  const [phase, setPhase] = useState<Phase>("amount");
  const [amount, setAmount] = useState<number>(500);
  const [method, setMethod] = useState<Method>("gcash");
  const [anonymous, setAnonymous] = useState(false);
  const [marketingOk, setMarketingOk] = useState(true);

  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  const shell: React.CSSProperties = {
    fontFamily: T.fontSans,
    color: T.ink,
    minHeight: "100%",
    // The sticky bar lives in normal flow above the nav, so no large bottom
    // pad is needed; a small breathing pad keeps the footer off the bar.
    paddingBottom: 0,
  };

  const heroPhoto = CATEGORY_PHOTO[circle.category];

  // Methods. All clearly tagged "Preview" — no money moves today.
  const methods: { id: Method; title: string; sub: string }[] = [
    {
      id: "gcash",
      title: t("circles.methodGcash"),
      sub: t("circles.methodGcashSub"),
    },
    {
      id: "qris",
      title: t("circles.methodQris"),
      sub: t("circles.methodQrisSub"),
    },
    {
      id: "balance",
      title: t("circles.methodBalance"),
      sub: t("circles.methodBalanceSub"),
    },
  ];

  function submitWaitlist() {
    setErr("");
    const trimmed = email.trim();
    // Lightweight email shape check; the server action validates again.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErr(t("circles.badEmail"));
      return;
    }
    start(async () => {
      const r = await joinCirclesWaitlist({
        email: trimmed,
        circleId: circle.id,
        locale,
        pesoPledge: amount,
        anonymous,
        marketingOk,
      });
      if (r.ok) setPhase("done");
      else setErr(r.error || t("circles.saveFailed"));
    });
  }

  // ── PHASE: amount picker + method + toggles ──
  if (phase === "amount") {
    const amt = formatParts(amount, currency);
    return (
      <div style={shell}>
        <AppBar
          leading={
            <IconButton
              ariaLabel="Back"
              onClick={() => router.push(`/circles/${circle.id}`)}
            >
              {Ico.back({})}
            </IconButton>
          }
          title={t("circles.donateTitle")}
          trailing={<PreviewBadge />}
        />

        {/* Cause context — photo accent + title, echoing the detail hero */}
        <div style={{ padding: "4px 16px 12px" }}>
          <Card p={0} elevation style={{ overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
              {heroPhoto ? (
                <div
                  style={{
                    position: "relative",
                    width: 84,
                    flex: "0 0 auto",
                    overflow: "hidden",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={heroPhoto}
                    alt=""
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(90deg, rgba(7,12,22,0) 60%, rgba(255,255,255,.12) 100%)",
                    }}
                  />
                </div>
              ) : (
                <div
                  aria-hidden
                  style={{
                    width: 84,
                    flex: "0 0 auto",
                    background: `linear-gradient(150deg, ${circle.coverGradient[0]} 0%, ${circle.coverGradient[1]} 100%)`,
                  }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0, padding: "12px 14px" }}>
                <Chip kind="action">{t("circles.circleChip")}</Chip>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 15,
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                    lineHeight: 1.25,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {circle.title}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: T.slate,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {t("circles.by", { name: circle.organizer })} ·{" "}
                  {circle.organizerLocation}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Amount entry — big centered display, like Send / Top up */}
        <div style={{ padding: "8px 24px 0", textAlign: "center" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: T.slate,
            }}
          >
            {t("circles.pledging")}
          </div>
          <div
            className="sl-balance"
            style={{
              marginTop: 12,
              fontSize: 52,
              fontWeight: 700,
              letterSpacing: "-0.035em",
              display: "inline-flex",
              alignItems: "baseline",
              gap: 4,
              lineHeight: 1,
            }}
          >
            <span style={{ fontSize: 27, color: T.slate, fontWeight: 600 }}>
              {amt.symbol.trim()}
            </span>
            <input
              value={String(amount)}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, "");
                const next = raw === "" ? 0 : Math.min(1_000_000, Number(raw));
                setAmount(Number.isFinite(next) ? next : 0);
              }}
              inputMode="numeric"
              placeholder="0"
              aria-label={t("circles.pledging")}
              style={{
                width: Math.max(2, String(amount).length || 1) + "ch",
                border: "none",
                outline: "none",
                background: "transparent",
                font: "inherit",
                color: T.ink,
                textAlign: "center",
                padding: 0,
              }}
            />
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 11.5,
              color: T.slate,
              fontFamily: T.fontMono,
            }}
          >
            {currency === "tl" || currency === "en"
              ? t("circles.localeRenderNote")
              : t("circles.localeCodeNote", { code: CURRENCY[currency].code })}
          </div>
        </div>

        {/* Quick-pick chips */}
        <div
          style={{
            padding: "16px 16px 0",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {QUICK.map((p) => {
            const parts = formatParts(p, currency);
            return (
              <button
                key={p}
                type="button"
                onClick={() => setAmount(p)}
                aria-pressed={p === amount}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <Chip kind={p === amount ? "action" : "neutral"} size="md">
                  {parts.symbol}
                  {parts.int}
                </Chip>
              </button>
            );
          })}
        </div>

        {/* Payment method */}
        <div style={{ padding: "22px 16px 8px" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: T.slate,
              padding: "0 4px",
            }}
          >
            {t("circles.paymentMethod")}
          </div>
        </div>
        <div style={{ padding: "0 16px" }}>
          <Card p={0} elevation>
            {methods.map((m, i, arr) => {
              const active = m.id === method;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  aria-pressed={active}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 16px",
                    border: "none",
                    borderBottom:
                      i < arr.length - 1 ? "1px solid " + T.hairline : "none",
                    background: active ? T.actionTint : "transparent",
                    color: T.ink,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background .14s",
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 99,
                      flex: "0 0 auto",
                      border: "2px solid " + (active ? T.action : T.hairline),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "border-color .14s",
                    }}
                  >
                    {active && (
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 99,
                          background: T.action,
                        }}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{m.title}</div>
                    <div style={{ fontSize: 12, color: T.slate, marginTop: 1 }}>
                      {m.sub}
                    </div>
                  </div>
                </button>
              );
            })}
          </Card>
        </div>

        {/* Toggles */}
        <div style={{ padding: "16px 16px 0" }}>
          <Card p={0} elevation>
            <Toggle
              label={t("circles.toggleAnon")}
              sub={t("circles.toggleAnonSub")}
              value={anonymous}
              onChange={setAnonymous}
              divider
            />
            <Toggle
              label={t("circles.toggleUpdates")}
              sub={t("circles.toggleUpdatesSub")}
              value={marketingOk}
              onChange={setMarketingOk}
            />
          </Card>
        </div>

        {/* Preview banner — honesty: no money moves today */}
        <div style={{ padding: "16px 16px 0" }}>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: T.warnTint,
              color: T.warn,
              fontSize: 12.5,
              lineHeight: 1.5,
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              boxShadow: "inset 0 0 0 1px rgba(146,64,14,.12)",
            }}
          >
            <div style={{ marginTop: 1, flex: "0 0 auto" }}>
              {Ico.shield({ size: 16, c: T.warn })}
            </div>
            <div>
              <strong>{t("circles.previewBannerStrong")}</strong>{" "}
              {t("circles.previewBannerBody")}
            </div>
          </div>
        </div>

        {/* Footer — scrolls above the sticky bar */}
        <div
          style={{
            padding: "22px 24px 4px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <PoweredByStellar />
        </div>

        {/* Sticky CTA bar — floats above the BottomNav */}
        <StickyBar>
          <Btn
            kind="primary"
            leading={Ico.shield({ c: "#fff" })}
            disabled={amount <= 0}
            onClick={() => setPhase("waitlist")}
          >
            {t("circles.continueWaitlist")}
          </Btn>
        </StickyBar>
      </div>
    );
  }

  // ── PHASE: waitlist email ──
  if (phase === "waitlist") {
    const amt = formatParts(amount, currency);
    return (
      <div style={shell}>
        <AppBar
          leading={
            <IconButton ariaLabel="Back" onClick={() => setPhase("amount")}>
              {Ico.back({})}
            </IconButton>
          }
          title={t("circles.notifyTitle")}
          trailing={<PreviewBadge />}
        />

        <div style={{ padding: "30px 28px 0", textAlign: "center" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: T.actionTint,
              color: T.action,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "inset 0 0 0 1px " + T.hairline,
            }}
          >
            {Ico.bell({ size: 28, c: T.action })}
          </div>
          <div
            style={{
              marginTop: 18,
              fontSize: 21,
              fontWeight: 700,
              letterSpacing: "-0.015em",
              lineHeight: 1.25,
            }}
          >
            {t("circles.waitlistHeadline1")}{" "}
            <span style={{ display: "block" }}>
              {t("circles.waitlistHeadline2")}
            </span>
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 13.5,
              color: T.slate,
              lineHeight: 1.55,
            }}
          >
            {t("circles.pledgeLine1", {
              amount: `${amt.symbol}${amt.int}${
                amt.dp > 0 ? "." + amt.dec : ""
              }`,
            })}{" "}
            <strong style={{ color: T.ink }}>{circle.title}</strong>
            {t("circles.pledgeLine2")}
          </div>
        </div>

        <div style={{ padding: "26px 16px 0" }}>
          <label
            style={{
              display: "block",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: T.slate,
              padding: "0 4px 6px",
            }}
          >
            {t("circles.notifyWhenLive")}
          </label>
          <Card p={0} elevation>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 16px",
              }}
            >
              <div style={{ flex: "0 0 auto", color: T.slate }}>
                {Ico.bell({ size: 17, c: T.slate })}
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
                inputMode="email"
                style={{
                  width: "100%",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontFamily: T.fontSans,
                  fontSize: 16,
                  color: T.ink,
                  padding: "6px 0",
                }}
              />
            </div>
          </Card>
        </div>

        {err && (
          <div
            style={{
              margin: "12px 16px 0",
              padding: "12px 14px",
              borderRadius: 12,
              background: "#FBEAE8",
              color: T.danger,
              fontSize: 13,
              lineHeight: 1.4,
              boxShadow: "inset 0 0 0 1px rgba(185,28,28,.14)",
            }}
          >
            {err}
          </div>
        )}

        {/* Footer — scrolls above the sticky bar */}
        <div
          style={{
            padding: "24px 24px 4px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <PoweredByStellar />
        </div>

        {/* Sticky CTA bar — submit floats above the BottomNav */}
        <StickyBar>
          <Btn
            kind="primary"
            disabled={pending}
            loading={pending}
            onClick={submitWaitlist}
          >
            {t("circles.addToLaunchList")}
          </Btn>
          <div
            style={{
              marginTop: 7,
              fontSize: 11,
              color: T.slate,
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            {t("circles.joinTerms")}
          </div>
        </StickyBar>
      </div>
    );
  }

  // ── PHASE: done ──
  const amt = formatParts(amount, currency);
  return (
    <div style={shell}>
      <AppBar
        leading={
          <IconButton ariaLabel="Close" onClick={() => router.push("/circles")}>
            {Ico.x({})}
          </IconButton>
        }
        title=""
        trailing={<PreviewBadge />}
      />
      <div style={{ padding: "44px 28px 0", textAlign: "center" }}>
        <div
          className="sl-tick"
          style={{
            width: 88,
            height: 88,
            borderRadius: 99,
            background: "linear-gradient(160deg,#E6F6EF,#fff)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow:
              "inset 0 0 0 1px " + T.hairline + ", 0 14px 30px -18px rgba(5,150,105,.5)",
          }}
        >
          {Ico.check({ size: 36, c: T.moneyIn })}
        </div>
        <div
          style={{
            marginTop: 22,
            fontSize: 13,
            color: T.moneyIn,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {t("circles.pledgeSaved")}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 23,
            fontWeight: 700,
            letterSpacing: "-0.015em",
            lineHeight: 1.25,
          }}
        >
          {t("circles.pledgeSavedHeadline")}
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            color: T.slate,
            lineHeight: 1.55,
            maxWidth: 320,
            margin: "10px auto 0",
          }}
        >
          {t("circles.pledgeSavedLine1", {
            amount: `${amt.symbol}${amt.int}${
              amt.dp > 0 ? "." + amt.dec : ""
            }`,
          })}{" "}
          <strong style={{ color: T.ink }}>{circle.title}</strong>
          {t("circles.pledgeSavedLine2")}
        </div>
      </div>

      <div
        style={{
          padding: "30px 16px 0",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <Btn kind="primary" onClick={() => router.push("/circles")}>
          {t("circles.backToCircles")}
        </Btn>
        <Btn kind="secondary" onClick={() => router.push("/transparency")}>
          {t("circles.seePrimitiveShort")}
        </Btn>
      </div>

      <div
        style={{
          padding: "22px 24px 0",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <PoweredByStellar />
      </div>
    </div>
  );
}

function Toggle({
  label,
  sub,
  value,
  onChange,
  divider = false,
}: {
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
  divider?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        background: "transparent",
        border: "none",
        borderBottom: divider ? "1px solid " + T.hairline : "none",
        color: T.ink,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: T.fontSans,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>{sub}</div>
      </div>
      <div
        style={{
          width: 40,
          height: 24,
          borderRadius: 99,
          background: value ? T.action : T.hairline,
          position: "relative",
          transition: "background .15s",
          flex: "0 0 auto",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 2,
            left: value ? 18 : 2,
            width: 20,
            height: 20,
            borderRadius: 99,
            background: "#fff",
            boxShadow: "0 1px 3px rgba(11,18,32,0.25)",
            transition: "left .15s",
          }}
        />
      </div>
    </button>
  );
}
