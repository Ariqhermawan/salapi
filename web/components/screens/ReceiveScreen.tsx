"use client";

import { useEffect, useState } from "react";
import { myUsername, walletState } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { T, Card, Btn, PoweredByStellar } from "@/components/ui/kit";

export default function ReceiveScreen() {
  const { t } = useT();
  const [handle, setHandle] = useState("");
  useEffect(() => {
    walletState().then((s) =>
      setHandle(`${s.address.slice(0, 6)}…${s.address.slice(-4)}`)
    );
    myUsername().then((u) => u && setHandle("@" + u));
  }, []);

  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink, padding: "12px 16px" }}>
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>
        {t("receive.title")}
      </div>
      <p style={{ fontSize: 13, color: T.slate, margin: "4px 0 12px" }}>
        {t("receive.sub")}
      </p>
      <Card p={14} style={{ textAlign: "center" }}>
        <div
          style={{
            width: 156,
            height: 156,
            margin: "0 auto",
            borderRadius: 14,
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
            marginTop: 10,
            fontSize: 18,
            fontWeight: 700,
            color: T.action,
          }}
        >
          {handle || "…"}
        </div>
        <p style={{ fontSize: 12, color: T.slate, marginTop: 4 }}>
          {t("receive.railNote")}
        </p>
        <div style={{ marginTop: 12 }}>
          <Btn kind="secondary">{t("receive.share")}</Btn>
        </div>
      </Card>
      <div style={{ marginTop: 14, textAlign: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
