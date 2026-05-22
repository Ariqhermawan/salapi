"use client";

import { useT } from "@/components/I18nProvider";
import { T, Card, Ico, PoweredByStellar } from "@/components/ui/kit";

// Standalone deep-link route for a single transaction receipt. Composes the
// design-system primitives (T tokens + Card) so it matches the Receive screen
// it sits beside, and routes every string through the dictionary.
export default function TxDetailScreen({ hash }: { hash: string }) {
  const { t } = useT();
  const explorer = `https://stellar.expert/explorer/testnet/tx/${hash}`;

  return (
    <div
      style={{
        fontFamily: T.fontSans,
        color: T.ink,
        padding: "16px 16px 24px",
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>
        {t("tx.title")}
      </div>
      <p style={{ fontSize: 13, color: T.slate, margin: "4px 0 14px" }}>
        {t("tx.sub")}
      </p>

      <Card p={16}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: T.slate,
          }}
        >
          {t("tx.hashLabel")}
        </div>
        <div
          style={{
            marginTop: 6,
            fontFamily: T.fontMono,
            fontSize: 12,
            lineHeight: 1.5,
            color: T.ink,
            wordBreak: "break-all",
          }}
        >
          {hash}
        </div>
        <a
          href={explorer}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            marginTop: 14,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 14,
            fontWeight: 600,
            color: T.action,
          }}
        >
          {t("tx.openExplorer")} {Ico.link({ size: 14, c: T.action })}
        </a>
      </Card>

      <div style={{ marginTop: 14, textAlign: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
