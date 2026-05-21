"use client";

import { useEffect, useState, useTransition } from "react";
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

const QUICK = ["500", "1000", "2000", "5000", "10000"];

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
      style={{
        width: "100%",
        textAlign: "left",
        border: "none",
        cursor: disabled ? "default" : "pointer",
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
        opacity: disabled ? 0.6 : 1,
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

export default function TopUpScreen() {
  const { t } = useT();
  const router = useRouter();
  const [phase, setPhase] = useState<"amount" | "processing" | "done">("amount");
  const [amount, setAmount] = useState("1000");
  const [method, setMethod] = useState<"gcash" | "bank">("gcash");
  const [addr, setAddr] = useState("");
  const [result, setResult] = useState<{ note: string; pesoLabel: string } | null>(
    null
  );
  const [pending, start] = useTransition();

  useEffect(() => {
    walletState().then((w) => setAddr(w.address));
  }, []);

  const explorer = addr
    ? `https://stellar.expert/explorer/testnet/account/${addr}`
    : undefined;
  const amt = Number(amount) || 0;
  const amtLabel = "₱" + amt.toLocaleString("en-PH");

  function go() {
    setPhase("processing");
    start(async () => {
      const r = await topUpSandbox();
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
          <Card p={14}>
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
            <Money value={amt} size={38} color={T.moneyIn} sign="+" />
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: T.slate }}>
            {t("topup.newBalance")}{" "}
            <span
              className="sl-balance"
              style={{ color: T.ink, fontWeight: 600 }}
            >
              {result.pesoLabel}
            </span>
          </div>
        </div>
        <div style={{ padding: "16px 16px 0" }}>
          <Card p={14}>
            <Row
              title={t("topup.from")}
              trailing={
                <span style={{ fontWeight: 500, fontSize: 14 }}>
                  GCash · sandbox
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
  return (
    <div style={shell}>
      <AppBar
        leading={
          <IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>
        }
        title={t("topup.title")}
      />
      <div style={{ padding: "8px 20px 4px" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: T.slate,
          }}
        >
          {t("topup.eyebrow")}
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            marginTop: 4,
          }}
        >
          {t("topup.question")}
        </div>
      </div>

      {/* Amount */}
      <div style={{ padding: "12px 24px 0", textAlign: "center" }}>
        <div
          className="sl-balance"
          style={{
            fontSize: 44,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            display: "inline-flex",
            alignItems: "baseline",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 26, color: T.slate, fontWeight: 500 }}>₱</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
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
            }}
          />
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: T.slate }}>
          {t("topup.limits")}
        </div>
      </div>

      {/* Quick amounts */}
      <div
        style={{
          padding: "14px 16px 0",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {QUICK.map((a) => (
          <span
            key={a}
            onClick={() => setAmount(a)}
            style={{ cursor: "pointer" }}
          >
            <Chip kind={a === amount ? "action" : "neutral"} size="md">
              ₱{Number(a).toLocaleString("en-PH")}
            </Chip>
          </span>
        ))}
      </div>

      {/* Method */}
      <div style={{ padding: "18px 16px 0" }}>
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
          {t("topup.methodLabel")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <MethodCard
            selected={method === "gcash"}
            onClick={() => setMethod("gcash")}
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
            label={t("topup.methodGcash")}
            sub={t("topup.methodGcashSub")}
            tag={t("topup.sandboxTag")}
          />
          <MethodCard
            disabled
            tile={
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: T.canvas,
                  color: T.slate,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {Ico.vault({ size: 18, c: T.slate })}
              </div>
            }
            label={t("topup.methodBank")}
            sub={t("topup.methodBankSub")}
          />
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

      {/* Total */}
      <div style={{ padding: "10px 16px 0" }}>
        <Card p={14}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: T.slate,
              }}
            >
              {t("topup.youGet")}
            </span>
            <span
              className="sl-balance"
              style={{ fontSize: 18, fontWeight: 700, color: T.ink }}
            >
              {amtLabel}
            </span>
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              fontWeight: 600,
              color: T.moneyIn,
            }}
          >
            {t("topup.noFee")}
          </div>
        </Card>
      </div>

      {/* CTA */}
      <div style={{ padding: "16px 16px 0" }}>
        <Btn
          kind="primary"
          disabled={pending || amt <= 0 || method === "bank"}
          loading={pending}
          trailing={!pending && Ico.chev({ c: "#fff" })}
          onClick={go}
        >
          {t("topup.cta", { amount: amtLabel })}
        </Btn>
      </div>
      <div style={{ padding: "18px 16px 0", display: "flex", justifyContent: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
