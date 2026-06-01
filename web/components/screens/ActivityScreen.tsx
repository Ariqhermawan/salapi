"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { walletState } from "@/app/actions";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Card,
  PoweredByStellar,
} from "@/components/ui/kit";
import { useT } from "@/components/I18nProvider";
import { useGoBack } from "@/lib/ui/useGoBack";

const EXPLORER = "https://stellar.expert/explorer/testnet";

type IconFn = (p: { size?: number; c?: string }) => React.ReactNode;

// The founding on-chain trail is a deliberate technical proof artifact: raw
// Week-2 contract operations with real, verifiable testnet tx hashes. Step
// labels stay as technical literals (like the hashes and explorer links they
// point to), not localized consumer copy.
const TRAIL: { step: string; hash: string; ico: IconFn; kind: "in" | "out" | "sys" }[] = [
  { step: "Deploy disaster vault", hash: "1bed6a16e6b6b2a8fddf3c8e247764f77f80bc18f58cd019bec225e60d891d12", ico: Ico.shield, kind: "sys" },
  { step: "Register @juandelacruz", hash: "00d0861463b124d7ec83b1cb5ef65f4b13579167127b8acede5c01362f8bf913", ico: Ico.user, kind: "sys" },
  { step: "Initialize(admin, token)", hash: "f49b815b47b052ba12f288c64c1e11e336b9a6a1afaf5d359db08b928e20beb1", ico: Ico.shield, kind: "sys" },
  { step: "Contribute 5 XLM", hash: "618dedd72dd1ba49f7432dc33e237007da5280c857d00e4eff6164247ad0cd66", ico: Ico.arrowDown, kind: "in" },
  { step: "set_disaster(true)", hash: "7ecdeaf152745257b1d0f619503f6f59971068ad1a3bf7dd8499a08295608d0a", ico: Ico.bell, kind: "sys" },
  { step: "Disburse 2 XLM", hash: "1115f685287faf7b508e97d378df5f4ccb1ccc302d007b2190776ad0c986a837", ico: Ico.arrowUp, kind: "out" },
];

export default function ActivityScreen() {
  const { t } = useT();
  const router = useRouter();
  const goBack = useGoBack("/");
  const [addr, setAddr] = useState("");

  useEffect(() => {
    walletState().then((w) => setAddr(w.address));
  }, []);

  const account = addr ? `${EXPLORER}/account/${addr}` : undefined;
  const shortAddr = addr
    ? `${addr.slice(0, 6)}…${addr.slice(-6)}`
    : t("common.loading");

  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%", paddingBottom: 4 }}>
      <AppBar
        large
        title={t("activity.title")}
        sub={t("activity.sub")}
        leading={<IconButton ariaLabel="Back" onClick={goBack}>{Ico.back({})}</IconButton>}
      />

      {/* Your wallet → full real history. Premium dark navy accent card
          (same hero language as home) with mono address + explorer link. */}
      <div style={{ padding: "4px 16px 0" }}>
        <div
          onClick={() => account && window.open(account, "_blank", "noopener,noreferrer")}
          className="sl-lift"
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 18,
            padding: 15,
            color: "#fff",
            cursor: account ? "pointer" : "default",
            background:
              "radial-gradient(120% 120% at 88% -10%, rgba(37,99,235,.55), transparent 52%), linear-gradient(165deg,#101a31 0%,#0b1220 60%,#0a0f1c 100%)",
            boxShadow:
              "0 16px 34px -22px rgba(11,18,32,.7), inset 0 0 0 1px rgba(255,255,255,.06)",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(60% 50% at 14% 120%, rgba(5,150,105,.28), transparent 60%)",
            }}
          />
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 13 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 13,
                background: "rgba(255,255,255,.10)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "0 0 auto",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,.16)",
              }}
            >
              {Ico.sparkle({ c: "#fff", size: 20 })}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.6)" }}>
                {t("activity.walletLabel")}
              </div>
              <div className="sl-mono" style={{ fontSize: 14, fontFamily: T.fontMono, fontWeight: 600, marginTop: 3, color: "rgba(255,255,255,.92)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {shortAddr}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginTop: 6, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: "#34d399", flex: "0 0 auto" }} />
                {t("activity.openHistory")}
              </div>
            </div>
            <div
              aria-hidden
              style={{
                width: 30,
                height: 30,
                borderRadius: 99,
                background: "rgba(255,255,255,.10)",
                display: "grid",
                placeItems: "center",
                flex: "0 0 auto",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,.16)",
              }}
            >
              {Ico.link({ size: 15, c: "#fff" })}
            </div>
          </div>
        </div>
      </div>

      {/* Founding on-chain trail · Week 2 (real, verifiable) */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px 7px" }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.11em", textTransform: "uppercase", color: T.slate }}>
            {t("activity.trailTitle")}
          </span>
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              marginLeft: "auto",
              color: T.moneyIn,
              background: T.moneyInTint,
              padding: "4px",
              borderRadius: 99,
            }}
          >
            {Ico.verify({ size: 13, c: T.moneyIn })}
          </span>
        </div>
        <Card p={0} elevation>
          {TRAIL.map((row, i) => {
            const c = row.kind === "in" ? T.moneyIn : row.kind === "out" ? T.warn : T.action;
            const bg = row.kind === "in" ? T.moneyInTint : row.kind === "out" ? T.warnTint : T.actionTint;
            return (
              <a
                key={row.hash}
                href={`${EXPLORER}/tx/${row.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="sl-lift"
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: i < TRAIL.length - 1 ? "1px solid " + T.hairline : "none", color: T.ink, textDecoration: "none", minHeight: 44 }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 11, background: bg, color: c, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
                  {row.ico({ size: 18, c })}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {row.step}
                  </div>
                  <div style={{ fontSize: 11, color: T.slate, marginTop: 2, fontFamily: T.fontMono }}>
                    tx · {row.hash.slice(0, 16)}…
                  </div>
                </div>
                <div
                  aria-hidden
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 9,
                    background: T.canvas,
                    display: "grid",
                    placeItems: "center",
                    flex: "0 0 auto",
                    boxShadow: "inset 0 0 0 1px " + T.hairline,
                  }}
                >
                  {Ico.link({ size: 15, c: T.action })}
                </div>
              </a>
            );
          })}
        </Card>
        <div style={{ marginTop: 11, fontSize: 12, color: T.slate, lineHeight: 1.5, padding: "0 4px" }}>
          {t("activity.note")}
        </div>
      </div>

      <div style={{ padding: "18px 16px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
        <PoweredByStellar />
        <span style={{ fontSize: 11, color: T.slate, fontFamily: T.fontMono }}>
          {t("activity.footer")}
        </span>
      </div>
    </div>
  );
}
