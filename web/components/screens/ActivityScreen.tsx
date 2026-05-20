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

const EXPLORER = "https://stellar.expert/explorer/testnet";

type IconFn = (p: { size?: number; c?: string }) => React.ReactNode;

const TRAIL: { step: string; hash: string; ico: IconFn; kind: "in" | "out" | "sys" }[] = [
  { step: "Deploy disaster vault", hash: "1bed6a16e6b6b2a8fddf3c8e247764f77f80bc18f58cd019bec225e60d891d12", ico: Ico.shield, kind: "sys" },
  { step: "Register @juandelacruz", hash: "00d0861463b124d7ec83b1cb5ef65f4b13579167127b8acede5c01362f8bf913", ico: Ico.user, kind: "sys" },
  { step: "Initialize(admin, token)", hash: "f49b815b47b052ba12f288c64c1e11e336b9a6a1afaf5d359db08b928e20beb1", ico: Ico.shield, kind: "sys" },
  { step: "Contribute 5 XLM", hash: "618dedd72dd1ba49f7432dc33e237007da5280c857d00e4eff6164247ad0cd66", ico: Ico.arrowDown, kind: "in" },
  { step: "set_disaster(true)", hash: "7ecdeaf152745257b1d0f619503f6f59971068ad1a3bf7dd8499a08295608d0a", ico: Ico.bell, kind: "sys" },
  { step: "Disburse 2 XLM", hash: "1115f685287faf7b508e97d378df5f4ccb1ccc302d007b2190776ad0c986a837", ico: Ico.arrowUp, kind: "out" },
];

export default function ActivityScreen() {
  const router = useRouter();
  const [addr, setAddr] = useState("");

  useEffect(() => {
    walletState().then((w) => setAddr(w.address));
  }, []);

  const account = addr ? `${EXPLORER}/account/${addr}` : undefined;
  const shortAddr = addr ? `${addr.slice(0, 6)}…${addr.slice(-6)}` : "loading…";

  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%", paddingBottom: 110 }}>
      <AppBar
        large
        title="Activity"
        sub="Real · verifiable on Stellar testnet"
        leading={<IconButton onClick={() => router.push("/")}>{Ico.back({})}</IconButton>}
      />

      {/* Your wallet → full real history */}
      <div style={{ padding: "4px 16px 0" }}>
        <Card p={14} onClick={() => account && window.open(account, "_blank", "noopener,noreferrer")} style={{ cursor: account ? "pointer" : "default" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: T.actionTint, color: T.action, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {Ico.sparkle({ c: T.action, size: 20 })}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>
                Your wallet · managed demo
              </div>
              <div style={{ fontSize: 13, fontFamily: T.fontMono, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {shortAddr}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.action, marginTop: 4, display: "inline-flex", alignItems: "center", gap: 5 }}>
                Open full history on explorer {Ico.link({ size: 13, c: T.action })}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Founding on-chain trail · Week 2 (real, verifiable) */}
      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.slate, padding: "2px 4px 6px" }}>
          Founding on-chain trail · Week 2
        </div>
        <Card p={0}>
          {TRAIL.map((t, i) => {
            const c = t.kind === "in" ? T.moneyIn : t.kind === "out" ? T.warn : T.slate;
            const bg = t.kind === "in" ? T.moneyInTint : t.kind === "out" ? T.warnTint : T.canvas;
            return (
              <a
                key={t.hash}
                href={`${EXPLORER}/tx/${t.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: i < TRAIL.length - 1 ? "1px solid " + T.hairline : "none", color: T.ink, textDecoration: "none", minHeight: 44 }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 10, background: bg, color: c, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {t.ico({ size: 18, c })}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {t.step}
                  </div>
                  <div style={{ fontSize: 11, color: T.slate, marginTop: 1, fontFamily: T.fontMono }}>
                    tx · {t.hash.slice(0, 16)}…
                  </div>
                </div>
                {Ico.link({ size: 16, c: T.action })}
              </a>
            );
          })}
        </Card>
        <div style={{ marginTop: 10, fontSize: 12, color: T.slate, lineHeight: 1.45, padding: "0 4px" }}>
          Every send, top-up, paluwagan and donation you make in the app posts a
          real transaction here. Independently checkable, no login.
        </div>
      </div>

      <div style={{ padding: "16px 16px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <PoweredByStellar />
        <span style={{ fontSize: 11, color: T.slate, fontFamily: T.fontMono }}>Read-only · anyone can verify</span>
      </div>
    </div>
  );
}
