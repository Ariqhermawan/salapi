"use client";

import { useEffect, useState } from "react";
import { myUsername, walletState } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { T, Card, Btn, PoweredByStellar } from "@/components/ui/kit";

export default function ReceivePage() {
  const { t } = useT();
  const [handle, setHandle] = useState("");
  useEffect(() => {
    walletState().then((s) =>
      setHandle(`${s.address.slice(0, 6)}…${s.address.slice(-4)}`)
    );
    myUsername().then((u) => u && setHandle("@" + u));
  }, []);

  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink, padding: "20px 16px" }}>
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>
        {t("nav.send") /* placeholder header */}
      </div>
      <p style={{ fontSize: 13, color: T.slate, margin: "6px 0 18px" }}>
        Share your @username — anyone on Salapi can send you pesos.
      </p>
      <Card p={20} style={{ textAlign: "center" }}>
        <div
          style={{
            width: 180,
            height: 180,
            margin: "0 auto",
            borderRadius: 16,
            background:
              "repeating-linear-gradient(135deg,rgba(11,18,32,.06) 0 10px,rgba(11,18,32,.02) 10px 20px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: T.slate,
            fontFamily: T.fontMono,
            fontSize: 11,
          }}
        >
          QR · {handle || "…"}
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 20,
            fontWeight: 700,
            color: T.action,
          }}
        >
          {handle || "…"}
        </div>
        <p style={{ fontSize: 12, color: T.slate, marginTop: 4 }}>
          Stellar testnet · crypto invisible
        </p>
        <div style={{ marginTop: 18 }}>
          <Btn kind="secondary">Share</Btn>
        </div>
      </Card>
      <div style={{ marginTop: 24, textAlign: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
