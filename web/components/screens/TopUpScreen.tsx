"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { walletState, topUpSandbox } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Card,
  Row,
  Btn,
  Chip,
  Money,
  PoweredByStellar,
} from "@/components/ui/kit";
import { SalapiMascot } from "@/components/ui/mascot";
import { useGoBack } from "@/lib/ui/useGoBack";
import {
  CURRENCY,
  formatLocal,
  formatLocalAmount,
  localAmount,
  pesoFromLocal,
} from "@/lib/ui/currency";
import type { Locale } from "@/lib/i18n/config";

// Quick-pick amounts per display currency — round numbers in each currency,
// not one peso set scaled (₱500 ≈ Rp 138k is not a clean Rupiah figure).
const QUICK: Record<Locale, string[]> = {
  en: ["10", "20", "50", "100", "200"],
  tl: ["500", "1000", "2000", "5000", "10000"],
  id: ["100000", "200000", "500000", "1000000", "2000000"],
  vi: ["200000", "500000", "1000000", "2000000", "5000000"],
};

// Daily on-ramp limits in PHP app-units, shown converted to the display
// currency so an IDR/USD/VND user does not see a peso figure.
const MIN_TOPUP = 20;
const MAX_TOPUP = 50000;

function MethodCard({
  selected,
  disabled,
  onClick,
  tile,
  label,
  sub,
  tag,
}: {
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  tile: React.ReactNode;
  label: string;
  sub: string;
  tag?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={disabled ? undefined : "sl-lift"}
      style={{
        width: "100%",
        textAlign: "left",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        padding: "12px 14px",
        borderRadius: 14,
        background: selected ? T.actionTint : T.surface,
        boxShadow: selected
          ? "inset 0 0 0 1.5px " + T.action + ", 0 6px 16px -10px rgba(37,99,235,.45)"
          : "0 2px 8px -4px rgba(11,18,32,.10), inset 0 0 0 1px " + T.hairline,
        display: "flex",
        alignItems: "center",
        gap: 12,
        minHeight: 56,
        opacity: disabled ? 0.6 : 1,
        transition: "background .14s, box-shadow .14s",
      }}
    >
      {tile}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>
            {label}
          </span>
          {tag && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: T.warn,
                background: T.warnTint,
                padding: "2px 6px",
                borderRadius: 999,
              }}
            >
              {tag}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: T.slate, marginTop: 2, lineHeight: 1.35 }}>{sub}</div>
      </div>
      <div
        aria-hidden
        style={{
          flex: "0 0 auto",
          width: 22,
          height: 22,
          borderRadius: 99,
          display: "grid",
          placeItems: "center",
          background: selected ? T.action : "transparent",
          boxShadow: selected ? "none" : "inset 0 0 0 1.5px " + T.hairline,
          transition: "background .14s, box-shadow .14s",
        }}
      >
        {selected && Ico.check({ size: 13, c: "#fff" })}
      </div>
    </button>
  );
}

export default function TopUpScreen() {
  const { t, locale, currency } = useT();
  const router = useRouter();
  const goBack = useGoBack("/");
  const [phase, setPhase] = useState<"amount" | "processing" | "done">("amount");
  const [amount, setAmount] = useState("");
  const [methodPick, setMethodPick] = useState<"gcash" | "qris" | null>(null);
  const [addr, setAddr] = useState("");
  const [result, setResult] = useState<{ note: string; pesos: number } | null>(
    null
  );
  const [pending, start] = useTransition();
  const amtTouched = useRef(false);

  useEffect(() => {
    walletState().then((w) => setAddr(w.address));
  }, []);

  // Prefill a sensible amount in the active display currency until the user
  // touches the field (currency resolves after hydration, so this re-runs).
  useEffect(() => {
    if (!amtTouched.current) setAmount(QUICK[currency][1]);
  }, [currency]);

  const explorer = addr
    ? `https://stellar.expert/explorer/testnet/account/${addr}`
    : undefined;
  const amt = Number(amount) || 0;
  const amtLabel = formatLocalAmount(amt, currency);
  // Locale-aware default: Indonesia leads with QRIS, elsewhere GCash.
  const method: "gcash" | "qris" =
    methodPick ?? (locale === "id" ? "qris" : "gcash");

  function go() {
    setPhase("processing");
    start(async () => {
      const r = await topUpSandbox();
      setResult({ note: r.note, pesos: r.pesos });
      setPhase("done");
    });
  }

  const shell: React.CSSProperties = {
    fontFamily: T.fontSans,
    color: T.ink,
    minHeight: "100%",
    paddingBottom: 110,
  };

  // Eyebrow label — the premium uppercase section header used across the
  // revamped screens (10px / 700 / 0.1em, slate).
  const eyebrow: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: T.slate,
  };

  // ── PROCESSING ──
  if (phase === "processing") {
    return (
      <div style={shell}>
        <AppBar
          leading={
            <IconButton onClick={() => router.push("/")}>{Ico.x({})}</IconButton>
          }
          title={t("common.processing")}
        />
        <div style={{ padding: "32px 28px 0", textAlign: "center" }}>
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: 99,
              background: T.actionTint,
              color: T.action,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <span
              className="sl-spin"
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 99,
                border: "3px solid " + T.action,
                borderTopColor: "transparent",
              }}
            />
            {Ico.arrowDown({ size: 26, c: T.action })}
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: 19,
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            {t("topup.processingTitle", { amount: amtLabel })}
          </div>
          <div
            style={{ marginTop: 4, fontSize: 13, color: T.slate, lineHeight: 1.5 }}
          >
            {t("topup.processingSub")}
          </div>
        </div>
        <div style={{ padding: "22px 16px 0" }}>
          <Card p={14} elevation>
            {[t("topup.step1"), t("topup.step2"), t("topup.step3")].map(
              (s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 0",
                    borderBottom: i < 2 ? "1px solid " + T.hairline : "none",
                  }}
                >
                  {i < 2 ? (
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 99,
                        background: T.moneyInTint,
                        color: T.moneyIn,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {Ico.check({ size: 14, c: T.moneyIn })}
                    </div>
                  ) : (
                    <div
                      className="sl-spin"
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 99,
                        border: "2px solid " + T.action,
                        borderTopColor: "transparent",
                      }}
                    />
                  )}
                  <div
                    style={{
                      flex: 1,
                      fontSize: 14,
                      fontWeight: i === 2 ? 600 : 500,
                      color: i === 2 ? T.ink : T.slate,
                    }}
                  >
                    {s}
                  </div>
                </div>
              )
            )}
          </Card>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
            <PoweredByStellar />
          </div>
        </div>
      </div>
    );
  }

  // ── DONE ──
  if (phase === "done" && result) {
    return (
      <div style={shell}>
        <AppBar
          leading={
            <IconButton onClick={() => router.push("/")}>{Ico.x({})}</IconButton>
          }
          title=""
        />
        <div style={{ padding: "20px 24px 0", textAlign: "center" }}>
          <div
            className="sl-tick"
            style={{
              width: 72,
              height: 72,
              borderRadius: 99,
              background: T.moneyIn,
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 14px 30px -10px rgba(5,150,105,0.5)",
            }}
          >
            {Ico.check({ size: 34, c: "#fff" })}
          </div>
          <div
            style={{ display: "flex", justifyContent: "center", marginTop: 10 }}
          >
            <SalapiMascot size={42} c={T.moneyIn} pose="cheer" />
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: 12,
              color: T.slate,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {t("topup.doneEyebrow")}
          </div>
          <div className="sl-rise" style={{ marginTop: 6 }}>
            <Money
              value={pesoFromLocal(amt, currency)}
              size={38}
              color={T.moneyIn}
              sign="+"
            />
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: T.slate }}>
            {t("topup.newBalance")}{" "}
            <span
              className="sl-balance"
              style={{ color: T.ink, fontWeight: 600 }}
            >
              {formatLocal(result.pesos, currency)}
            </span>
          </div>
        </div>
        <div style={{ padding: "16px 16px 0" }}>
          <Card p={14} elevation>
            <Row
              title={t("topup.from")}
              trailing={
                <span style={{ fontWeight: 500, fontSize: 14 }}>
                  {method === "qris" ? "QRIS" : "GCash"} · sandbox
                </span>
              }
              divider
            />
            <Row
              title={t("topup.fee")}
              trailing={
                <span
                  style={{ fontSize: 14, color: T.moneyIn, fontWeight: 600 }}
                >
                  {t("topup.free")}
                </span>
              }
              divider
            />
            <Row
              title={t("topup.receipt")}
              trailing={
                explorer ? (
                  <a
                    href={explorer}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 13,
                      color: T.action,
                      fontFamily: T.fontMono,
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {t("topup.onStellar")} {Ico.link({ size: 13, c: T.action })}
                  </a>
                ) : (
                  <span style={{ fontSize: 13, color: T.slate }}>-</span>
                )
              }
              divider={false}
            />
          </Card>
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 10,
              background: T.canvas,
              fontSize: 12,
              color: T.slate,
              lineHeight: 1.5,
            }}
          >
            {result.note}
          </div>
        </div>
        <div
          style={{
            padding: "14px 16px 0",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <Btn kind="primary" onClick={() => router.push("/")}>
            {t("topup.done")}
          </Btn>
          <Btn
            kind="ghost"
            onClick={() => {
              setResult(null);
              setPhase("amount");
            }}
          >
            {t("topup.again")}
          </Btn>
        </div>
      </div>
    );
  }

  // ── AMOUNT ──
  // The CTA is a sticky bar that provides its own floor above the BottomNav
  // (like CircleDetail), so this phase drops the large bottom padding the
  // in-flow processing/done phases still need.
  return (
    <div style={{ ...shell, paddingBottom: 0 }}>
      <AppBar
        leading={
          <IconButton onClick={goBack}>{Ico.back({})}</IconButton>
        }
        title={t("topup.title")}
      />
      <div style={{ padding: "8px 20px 4px" }}>
        <div style={eyebrow}>{t("topup.eyebrow")}</div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            marginTop: 5,
            lineHeight: 1.15,
          }}
        >
          {t("topup.question")}
        </div>
      </div>

      {/* Amount hero — the big number on its own elevated surface, with the
          quick-pick chips tucked inside the same card. */}
      <div style={{ padding: "12px 16px 0" }}>
        <Card p={18} elevation style={{ borderRadius: 20 }}>
          <div style={{ textAlign: "center" }}>
            <div
              className="sl-balance"
              style={{
                fontSize: 46,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                display: "inline-flex",
                alignItems: "baseline",
                gap: 4,
                lineHeight: 1,
              }}
            >
              <span style={{ fontSize: 27, color: T.slate, fontWeight: 600 }}>
                {CURRENCY[currency].symbol}
              </span>
              <input
                value={amount}
                onChange={(e) => {
                  amtTouched.current = true;
                  setAmount(e.target.value.replace(/[^0-9]/g, ""));
                }}
                inputMode="numeric"
                placeholder="0"
                aria-label={t("topup.amountAria")}
                style={{
                  width: Math.max(2, amount.length || 1) + "ch",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  font: "inherit",
                  color: T.ink,
                  textAlign: "center",
                  caretColor: T.action,
                }}
              />
            </div>
            <div style={{ marginTop: 7, fontSize: 12, color: T.slate }}>
              {t("topup.limits", {
                min: formatLocalAmount(localAmount(MIN_TOPUP, currency), currency),
                max: formatLocalAmount(localAmount(MAX_TOPUP, currency), currency),
              })}
            </div>
          </div>

          {/* Quick amounts */}
          <div
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTop: "1px solid " + T.hairline,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            {QUICK[currency].map((a) => (
              <span
                key={a}
                onClick={() => {
                  amtTouched.current = true;
                  setAmount(a);
                }}
                style={{ cursor: "pointer" }}
              >
                <Chip kind={a === amount ? "action" : "neutral"} size="md">
                  {formatLocalAmount(Number(a), currency)}
                </Chip>
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* Method */}
      <div style={{ padding: "18px 16px 0" }}>
        <div style={{ ...eyebrow, marginBottom: 9 }}>
          {t("topup.methodLabel")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(locale === "id"
            ? (["qris", "gcash"] as const)
            : (["gcash", "qris"] as const)
          ).map((m) =>
            m === "gcash" ? (
              <MethodCard
                key="gcash"
                selected={method === "gcash"}
                onClick={() => setMethodPick("gcash")}
                tile={
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 11,
                      background: "#0079FF",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      fontSize: 13,
                      flex: "0 0 auto",
                      boxShadow: "0 4px 10px -4px rgba(0,121,255,.5)",
                    }}
                  >
                    GC
                  </div>
                }
                label={t("topup.methodGcash")}
                sub={t("topup.methodGcashSub")}
                tag={t("topup.sandboxTag")}
              />
            ) : (
              <MethodCard
                key="qris"
                selected={method === "qris"}
                onClick={() => setMethodPick("qris")}
                tile={
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 11,
                      background: "#C8102E",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "0 0 auto",
                      boxShadow: "0 4px 10px -4px rgba(200,16,46,.5)",
                    }}
                  >
                    {Ico.qr({ size: 19, c: "#fff" })}
                  </div>
                }
                label={t("topup.methodQris")}
                sub={t("topup.methodQrisSub")}
                tag={t("topup.sandboxTag")}
              />
            )
          )}
        </div>
      </div>

      {/* Anchor disclaimer — honesty: sandbox on-ramp, real anchor at launch. */}
      <div style={{ padding: "14px 16px 0" }}>
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 14,
            background: T.warnTint,
            boxShadow: "inset 0 0 0 1px rgba(146,64,14,0.22)",
            display: "flex",
            gap: 11,
            alignItems: "flex-start",
          }}
        >
          <div
            aria-hidden
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: "rgba(146,64,14,0.12)",
              color: T.warn,
              display: "grid",
              placeItems: "center",
              flex: "0 0 auto",
            }}
          >
            {Ico.verify({ size: 16, c: T.warn })}
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: T.warn,
              }}
            >
              {t("topup.anchorTitle")}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                lineHeight: 1.5,
                color: T.slate,
              }}
            >
              {t("topup.anchorBody")}
            </div>
          </div>
        </div>
      </div>

      {/* Total — what lands in the wallet, with the no-fee promise. */}
      <div style={{ padding: "12px 16px 0" }}>
        <Card p={14} elevation>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
              <div
                aria-hidden
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  background: T.moneyInTint,
                  color: T.moneyIn,
                  display: "grid",
                  placeItems: "center",
                  flex: "0 0 auto",
                }}
              >
                {Ico.arrowDown({ size: 18, c: T.moneyIn })}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={eyebrow}>{t("topup.youGet")}</div>
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 12,
                    fontWeight: 700,
                    color: T.moneyIn,
                  }}
                >
                  {t("topup.noFee")}
                </div>
              </div>
            </div>
            <span
              className="sl-balance"
              style={{ fontSize: 20, fontWeight: 800, color: T.ink, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}
            >
              {amtLabel}
            </span>
          </div>
        </Card>
      </div>

      {/* Footer — scrolls above the sticky CTA bar. */}
      <div style={{ padding: "20px 16px 0", display: "flex", justifyContent: "center" }}>
        <PoweredByStellar />
      </div>

      {/* Sticky CTA bar — floats above the BottomNav and stays visible while
          scrolling. main has overflow-y-auto + pb so bottom:0 pins it just
          above the nav rather than the viewport edge. */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: 14,
          padding: "12px 16px",
          background: "rgba(244,246,251,0.94)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderTop: "1px solid " + T.hairline,
          boxShadow: "0 -12px 28px -16px rgba(11,18,32,.28)",
          zIndex: 5,
        }}
      >
        <Btn
          kind="primary"
          disabled={pending || amt <= 0}
          loading={pending}
          trailing={!pending && Ico.chev({ c: "#fff" })}
          onClick={go}
        >
          {t("topup.cta", { amount: amtLabel })}
        </Btn>
      </div>
    </div>
  );
}
