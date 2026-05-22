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
      style={{
        width: "100%",
        textAlign: "left",
        border: "none",
        cursor: "pointer",
        padding: "11px 14px",
        borderRadius: 12,
        background: T.surface,
        boxShadow:
          "inset 0 0 0 " +
          (selected ? "1.5px " + T.action : "1px " + T.hairline),
        display: "flex",
        alignItems: "center",
        gap: 12,
        minHeight: 44,
      }}
    >
      {tile}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>
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
        <div style={{ fontSize: 11, color: T.slate, marginTop: 2 }}>{sub}</div>
      </div>
      {selected && Ico.check({ size: 16, c: T.action })}
    </button>
  );
}

export default function WithdrawScreen() {
  const { t, locale } = useT();
  const router = useRouter();
  const [phase, setPhase] = useState<"amount" | "processing" | "done">("amount");
  const [amount, setAmount] = useState("");
  const [destPick, setDestPick] = useState<
    "gcash" | "bifast" | "ewallet" | null
  >(null);
  const [bal, setBal] = useState<{ pesos: number; pesoLabel: string } | null>(
    null
  );
  const [result, setResult] = useState<{ note: string; pesoLabel: string } | null>(
    null
  );
  const [pending, start] = useTransition();

  useEffect(() => {
    walletState().then((w) => setBal({ pesos: w.pesos, pesoLabel: w.pesoLabel }));
  }, []);

  const amt = Number(amount) || 0;
  const amtLabel = "₱" + amt.toLocaleString("en-PH");
  const over = bal ? amt > bal.pesos : false;
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
    setAmount(String(Math.floor(bal.pesos * p)));
  }

  function go() {
    setPhase("processing");
    start(async () => {
      const r = await withdrawSandbox(amt);
      setResult({ note: r.note, pesoLabel: r.pesoLabel });
      setPhase("done");
    });
  }

  const shell: React.CSSProperties = {
    fontFamily: T.fontSans,
    color: T.ink,
    minHeight: "100%",
    paddingBottom: 110,
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
            {Ico.arrowUp({ size: 26, c: T.action })}
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: 19,
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            {t("withdraw.processingTitle", { amount: amtLabel })}
          </div>
          <div
            style={{ marginTop: 4, fontSize: 13, color: T.slate, lineHeight: 1.5 }}
          >
            {t("withdraw.processingSub")}
          </div>
        </div>
        <div style={{ padding: "22px 16px 0" }}>
          <Card p={14}>
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
            ))}
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
            {t("withdraw.doneEyebrow")}
          </div>
          <div className="sl-rise" style={{ marginTop: 6 }}>
            <Money value={amt} size={38} />
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: T.slate }}>
            {destLabel} ·{" "}
            <span style={{ color: T.ink, fontWeight: 600 }}>sandbox</span>
          </div>
        </div>
        <div style={{ padding: "16px 16px 0" }}>
          <Card p={14}>
            <Row
              title={t("withdraw.fee")}
              trailing={
                <span
                  style={{ fontSize: 14, color: T.moneyIn, fontWeight: 600 }}
                >
                  {t("withdraw.free")}
                </span>
              }
              divider
            />
            <Row
              title={t("withdraw.onChainBalance")}
              trailing={
                <span
                  className="sl-balance"
                  style={{ fontSize: 14, fontWeight: 600 }}
                >
                  {result.pesoLabel}
                </span>
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
    <div style={shell}>
      <AppBar
        leading={
          <IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>
        }
        title={t("withdraw.title")}
      />
      <div style={{ padding: "6px 20px 8px" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: T.slate,
          }}
        >
          {t("withdraw.eyebrow")}
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            marginTop: 4,
          }}
        >
          {t("withdraw.question")}
        </div>
      </div>

      {/* Available to withdraw */}
      <div style={{ padding: "2px 16px 0" }}>
        <Card p={14}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: T.slate,
            }}
          >
            {t("withdraw.available")}
          </div>
          <div
            className="sl-balance"
            style={{
              marginTop: 4,
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: T.ink,
            }}
          >
            {bal ? bal.pesoLabel : "…"}
          </div>
        </Card>
      </div>

      {/* Amount */}
      <div style={{ padding: "14px 24px 0", textAlign: "center" }}>
        <div
          className="sl-balance"
          style={{
            fontSize: 42,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            display: "inline-flex",
            alignItems: "baseline",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 24, color: T.slate, fontWeight: 500 }}>₱</span>
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
      </div>
      <div
        style={{
          padding: "14px 16px 0",
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
            <Chip kind="neutral" size="md">
              {label}
            </Chip>
          </span>
        ))}
      </div>

      {/* Destination */}
      <div style={{ padding: "16px 16px 0" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: T.slate,
            marginBottom: 8,
          }}
        >
          {t("withdraw.destinationLabel")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {destIds.map((d) =>
            d === "gcash" ? (
              <DestCard
                key="gcash"
                selected={destination === "gcash"}
                onClick={() => setDestPick("gcash")}
                tile={
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: "#0079FF",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 12,
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
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: "#0F766E",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {Ico.vault({ size: 18, c: "#fff" })}
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
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: "#7C3AED",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
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
      <div style={{ padding: "12px 16px 0" }}>
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            background: T.warnTint,
            boxShadow: "inset 0 0 0 1px rgba(180,83,9,0.22)",
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          {Ico.verify({ size: 16, c: T.warn })}
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
            marginTop: 8,
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

      {/* CTA */}
      <div style={{ padding: "16px 16px 0" }}>
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
      <div style={{ padding: "18px 16px 0", display: "flex", justifyContent: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
