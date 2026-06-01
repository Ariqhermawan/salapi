"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { walletState, withdrawSandbox } from "@/app/actions";
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
import {
  CURRENCY,
  formatLocal,
  formatLocalAmount,
  localAmount,
  pesoFromLocal,
} from "@/lib/ui/currency";

function DestCard({
  selected,
  onClick,
  tile,
  label,
  sub,
  tag,
}: {
  selected?: boolean;
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
      className="sl-lift"
      style={{
        width: "100%",
        textAlign: "left",
        border: "none",
        cursor: "pointer",
        padding: "13px 14px",
        borderRadius: 14,
        background: selected ? T.actionTint : T.surface,
        boxShadow: selected
          ? "inset 0 0 0 1.5px " + T.action + ", 0 8px 20px -14px rgba(37,99,235,.5)"
          : "0 2px 8px -3px rgba(11,18,32,.08), inset 0 0 0 1px " + T.hairline,
        display: "flex",
        alignItems: "center",
        gap: 13,
        minHeight: 44,
        transition: "background .14s, box-shadow .14s",
      }}
    >
      {tile}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: "-0.01em" }}>
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
                padding: "2px 7px",
                borderRadius: 999,
              }}
            >
              {tag}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: T.slate, marginTop: 3, lineHeight: 1.35 }}>{sub}</div>
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
          transition: "background .14s",
        }}
      >
        {selected && Ico.check({ size: 13, c: "#fff" })}
      </div>
    </button>
  );
}

export default function WithdrawScreen() {
  const { t, locale, currency } = useT();
  const router = useRouter();
  const [phase, setPhase] = useState<"amount" | "processing" | "done">("amount");
  const [amount, setAmount] = useState("");
  const [destPick, setDestPick] = useState<
    "gcash" | "bifast" | "ewallet" | null
  >(null);
  const [bal, setBal] = useState<{ pesos: number; pesoLabel: string } | null>(
    null
  );
  const [result, setResult] = useState<{ note: string; pesos: number } | null>(
    null
  );
  const [pending, start] = useTransition();

  useEffect(() => {
    walletState().then((w) => setBal({ pesos: w.pesos, pesoLabel: w.pesoLabel }));
  }, []);

  const amt = Number(amount) || 0;
  const amtLabel = formatLocalAmount(amt, currency);
  // amt is in the display currency; bal.pesos is the app's internal PHP unit.
  const amtPesos = pesoFromLocal(amt, currency);
  const over = bal ? amtPesos > bal.pesos : false;
  // Locale-aware payout destinations: Indonesia gets BI-FAST + e-wallet,
  // elsewhere GCash.
  const destIds: ReadonlyArray<"gcash" | "bifast" | "ewallet"> =
    locale === "id" ? ["bifast", "ewallet"] : ["gcash"];
  const destination =
    destPick && destIds.includes(destPick) ? destPick : destIds[0];
  const destLabel =
    destination === "bifast"
      ? t("withdraw.toBank")
      : destination === "ewallet"
        ? t("withdraw.toEwallet")
        : t("withdraw.toGcash");

  function pct(p: number) {
    if (!bal) return;
    setAmount(String(Math.floor(localAmount(bal.pesos * p, currency))));
  }

  function go() {
    setPhase("processing");
    start(async () => {
      const r = await withdrawSandbox(amtPesos);
      setResult({ note: r.note, pesos: r.pesos });
      setPhase("done");
    });
  }

  const shell: React.CSSProperties = {
    fontFamily: T.fontSans,
    color: T.ink,
    minHeight: "100%",
  };

  // ── PROCESSING ──
  if (phase === "processing") {
    return (
      <div style={{ ...shell, paddingBottom: 24 }}>
        <AppBar
          leading={
            <IconButton ariaLabel="Close" onClick={() => router.push("/")}>{Ico.x({})}</IconButton>
          }
          title={t("common.processing")}
        />
        <div style={{ padding: "32px 28px 0", textAlign: "center" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 99,
              background: T.actionTint,
              color: T.action,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              boxShadow: "0 14px 30px -14px rgba(37,99,235,.45)",
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
            {Ico.arrowUp({ size: 27, c: T.action })}
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {t("withdraw.processingTitle", { amount: amtLabel })}
          </div>
          <div
            style={{ marginTop: 5, fontSize: 13, color: T.slate, lineHeight: 1.5 }}
          >
            {t("withdraw.processingSub")}
          </div>
        </div>
        <div style={{ padding: "22px 16px 0" }}>
          <Card p={16} elevation>
            {[
              t("withdraw.step1"),
              t("withdraw.step2"),
              t("withdraw.step3"),
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "9px 0",
                  borderBottom: i < 2 ? "1px solid " + T.hairline : "none",
                }}
              >
                {i < 2 ? (
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 99,
                      background: T.moneyInTint,
                      color: T.moneyIn,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "0 0 auto",
                    }}
                  >
                    {Ico.check({ size: 14, c: T.moneyIn })}
                  </div>
                ) : (
                  <div
                    className="sl-spin"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 99,
                      border: "2px solid " + T.action,
                      borderTopColor: "transparent",
                      flex: "0 0 auto",
                    }}
                  />
                )}
                <div
                  style={{
                    flex: 1,
                    fontSize: 14,
                    fontWeight: i === 2 ? 700 : 500,
                    color: i === 2 ? T.ink : T.slate,
                  }}
                >
                  {s}
                </div>
              </div>
            ))}
          </Card>
          <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
            <PoweredByStellar />
          </div>
        </div>
      </div>
    );
  }

  // ── DONE ──
  if (phase === "done" && result) {
    return (
      <div style={{ ...shell, paddingBottom: 24 }}>
        <AppBar
          leading={
            <IconButton ariaLabel="Close" onClick={() => router.push("/")}>{Ico.x({})}</IconButton>
          }
          title=""
        />
        <div style={{ padding: "20px 24px 0", textAlign: "center" }}>
          <div
            className="sl-tick"
            style={{
              width: 76,
              height: 76,
              borderRadius: 99,
              background: T.moneyIn,
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 16px 34px -10px rgba(5,150,105,0.55)",
            }}
          >
            {Ico.check({ size: 36, c: "#fff" })}
          </div>
          <div
            style={{ display: "flex", justifyContent: "center", marginTop: 10 }}
          >
            <SalapiMascot size={42} c={T.moneyIn} pose="cheer" />
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: 11,
              color: T.moneyIn,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {t("withdraw.doneEyebrow")}
          </div>
          <div className="sl-rise" style={{ marginTop: 8 }}>
            <Money value={amtPesos} size={40} />
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: T.slate }}>
            {destLabel} ·{" "}
            <span style={{ color: T.ink, fontWeight: 600 }}>sandbox</span>
          </div>
        </div>
        <div style={{ padding: "18px 16px 0" }}>
          <Card p={6} elevation>
            <Row
              title={t("withdraw.fee")}
              trailing={
                <Chip kind="success">{t("withdraw.free")}</Chip>
              }
              divider
            />
            <Row
              title={t("withdraw.onChainBalance")}
              trailing={
                <span
                  className="sl-balance"
                  style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}
                >
                  {formatLocal(result.pesos, currency)}
                </span>
              }
              divider={false}
            />
          </Card>
          <div
            style={{
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 12,
              background: T.canvas,
              fontSize: 12.5,
              color: T.slate,
              lineHeight: 1.5,
            }}
          >
            {result.note}
          </div>
        </div>
        <div
          style={{
            padding: "16px 16px 0",
            display: "flex",
            flexDirection: "column",
            gap: 9,
          }}
        >
          <Btn kind="primary" onClick={() => router.push("/")}>
            {t("withdraw.done")}
          </Btn>
          <Btn
            kind="ghost"
            onClick={() => {
              setResult(null);
              setAmount("");
              setPhase("amount");
            }}
          >
            {t("withdraw.again")}
          </Btn>
        </div>
      </div>
    );
  }

  // ── AMOUNT ──
  return (
    <div style={{ ...shell, paddingBottom: 0 }}>
      <AppBar
        leading={
          <IconButton ariaLabel="Back" onClick={() => router.push("/")}>{Ico.back({})}</IconButton>
        }
        title={t("withdraw.title")}
      />
      <div style={{ padding: "6px 20px 10px" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: T.slate,
          }}
        >
          {t("withdraw.eyebrow")}
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "-0.025em",
            lineHeight: 1.15,
            marginTop: 5,
          }}
        >
          {t("withdraw.question")}
        </div>
      </div>

      {/* Available to withdraw — premium dark balance card, gradient + glow */}
      <div style={{ padding: "2px 16px 0" }}>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 18,
            padding: "15px 16px",
            color: "#fff",
            background:
              "radial-gradient(120% 120% at 88% -10%, rgba(37,99,235,.5), transparent 52%), linear-gradient(165deg,#101a31 0%,#0b1220 60%,#0a0f1c 100%)",
            boxShadow:
              "0 16px 34px -22px rgba(11,18,32,.7), inset 0 0 0 1px rgba(255,255,255,.06)",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(60% 50% at 12% 120%, rgba(5,150,105,.28), transparent 60%)",
            }}
          />
          <div style={{ position: "relative" }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,.62)",
              }}
            >
              {t("withdraw.available")}
            </div>
            <div style={{ marginTop: 6 }}>
              {bal ? (
                <Money value={bal.pesos} size={30} color="#fff" usdc={false} />
              ) : (
                <span
                  className="sl-balance"
                  style={{ fontSize: 30, fontWeight: 800, color: "rgba(255,255,255,.5)" }}
                >
                  …
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Amount */}
      <div style={{ padding: "20px 24px 0", textAlign: "center" }}>
        <div
          className="sl-balance"
          style={{
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: "-0.035em",
            display: "inline-flex",
            alignItems: "baseline",
            gap: 4,
            color: over ? T.danger : T.ink,
            transition: "color .14s",
          }}
        >
          <span style={{ fontSize: 25, color: over ? T.danger : T.slate, fontWeight: 500 }}>
            {CURRENCY[currency].symbol}
          </span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="0"
            aria-label={t("withdraw.amountAria")}
            style={{
              width: Math.max(2, amount.length || 1) + "ch",
              border: "none",
              outline: "none",
              background: "transparent",
              font: "inherit",
              color: over ? T.danger : T.ink,
              textAlign: "center",
            }}
          />
        </div>
        {over && (
          <div
            style={{
              marginTop: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              color: T.danger,
              background: "rgba(185,28,28,0.08)",
              padding: "4px 12px",
              borderRadius: 999,
            }}
          >
            {t("withdraw.exceedsBalance")}
          </div>
        )}
      </div>
      <div
        style={{
          padding: "16px 16px 0",
          display: "flex",
          gap: 8,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {(
          [
            ["25%", 0.25],
            ["50%", 0.5],
            ["75%", 0.75],
            [t("withdraw.max"), 1],
          ] as const
        ).map(([label, p]) => (
          <span key={label} onClick={() => pct(p)} style={{ cursor: "pointer" }}>
            <Chip kind="action" size="md">
              {label}
            </Chip>
          </span>
        ))}
      </div>

      {/* Destination */}
      <div style={{ padding: "20px 16px 0" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: T.slate,
            marginBottom: 9,
          }}
        >
          {t("withdraw.destinationLabel")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {destIds.map((d) =>
            d === "gcash" ? (
              <DestCard
                key="gcash"
                selected={destination === "gcash"}
                onClick={() => setDestPick("gcash")}
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
                      boxShadow: "0 6px 14px -6px rgba(0,121,255,.6)",
                    }}
                  >
                    GC
                  </div>
                }
                label={t("withdraw.methodGcash")}
                sub={t("withdraw.methodGcashSub")}
                tag={t("withdraw.sandboxTag")}
              />
            ) : d === "bifast" ? (
              <DestCard
                key="bifast"
                selected={destination === "bifast"}
                onClick={() => setDestPick("bifast")}
                tile={
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 11,
                      background: "#0F766E",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "0 0 auto",
                      boxShadow: "0 6px 14px -6px rgba(15,118,110,.6)",
                    }}
                  >
                    {Ico.vault({ size: 19, c: "#fff" })}
                  </div>
                }
                label={t("withdraw.methodBifast")}
                sub={t("withdraw.methodBifastSub")}
                tag={t("withdraw.sandboxTag")}
              />
            ) : (
              <DestCard
                key="ewallet"
                selected={destination === "ewallet"}
                onClick={() => setDestPick("ewallet")}
                tile={
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 11,
                      background: "#7C3AED",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "0 0 auto",
                      boxShadow: "0 6px 14px -6px rgba(124,58,237,.6)",
                    }}
                  >
                    <svg
                      width="19"
                      height="19"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="#fff"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 7a2 2 0 0 1 2-2h8.5A1.5 1.5 0 0 1 15 6.5V8" />
                      <rect x="3" y="7" width="14" height="9" rx="2" />
                      <circle cx="13" cy="11.5" r="1.3" fill="#fff" stroke="none" />
                    </svg>
                  </div>
                }
                label={t("withdraw.methodEwallet")}
                sub={t("withdraw.methodEwalletSub")}
                tag={t("withdraw.sandboxTag")}
              />
            )
          )}
        </div>
      </div>

      {/* Anchor disclaimer */}
      <div style={{ padding: "16px 16px 0" }}>
        <div
          style={{
            padding: "13px 14px",
            borderRadius: 14,
            background: T.warnTint,
            boxShadow: "inset 0 0 0 1px rgba(146,64,14,0.22)",
            display: "flex",
            gap: 11,
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: "rgba(146,64,14,0.12)",
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
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: T.warn,
              }}
            >
              {t("withdraw.anchorTitle")}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                lineHeight: 1.5,
                color: T.slate,
              }}
            >
              {t("withdraw.anchorBody")}
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            padding: "0 2px",
          }}
        >
          {Ico.shield({ size: 14, c: T.slate })}
          <div style={{ fontSize: 11.5, lineHeight: 1.45, color: T.slate }}>
            {t("withdraw.testnetNote")}
          </div>
        </div>
      </div>

      {/* Footer — scrolls above the sticky CTA bar */}
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
          marginTop: 16,
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
          disabled={pending || amt <= 0 || over}
          loading={pending}
          trailing={!pending && !over && Ico.chev({ c: "#fff" })}
          onClick={go}
        >
          {over ? t("withdraw.exceedsBalance") : t("withdraw.cta", { amount: amtLabel })}
        </Btn>
      </div>
    </div>
  );
}
