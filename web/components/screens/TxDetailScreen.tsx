"use client";

import { useT } from "@/components/I18nProvider";
import { moneyCopy } from "@/lib/i18n/revamp-money";
import { T, Card, Ico, Chip, AppBar, IconButton, PoweredByStellar } from "@/components/ui/kit";
import { useRouter } from "next/navigation";

// Standalone deep-link route for a single transaction receipt. Composes the
// design-system primitives (T tokens + Card) so it matches the Receive screen
// it sits beside, and routes every string through the dictionary.
export default function TxDetailScreen({ hash }: { hash: string }) {
  const { t, locale } = useT();
  const m = moneyCopy(locale);
  const router = useRouter();
  const valid = /^[a-fA-F0-9]{64}$/.test(hash);
  const explorer = `https://stellar.expert/explorer/testnet/tx/${hash}`;

  return (
    <div
      style={{
        fontFamily: T.fontSans,
        color: T.ink,
        padding: "16px 16px 24px",
      }}
    >
      <AppBar title={t("send.receipt")} leading={<IconButton ariaLabel={m("Back to Activity")} onClick={() => router.push("/activity")}>{Ico.back({})}</IconButton>} />
      <div style={{ background: "#F2EFE7", padding: 20, borderRadius: 24, marginBottom: 18 }}>
      <Chip kind="warn">{m("STELLAR TESTNET")}</Chip>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.035em", marginTop: 12 }}>
        {t("tx.title")}
      </div>
      <p style={{ fontSize: 13, color: T.slate, margin: "4px 0 14px" }}>
        {t("tx.sub")}
      </p>
      <p style={{ color: T.slate, fontSize: 12, lineHeight: 1.5 }}>{m("The explorer provides transaction status, token amounts and network fees. This page identifies the receipt; it does not independently decode or validate it.")}</p>
      </div>

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
        {valid ? <a
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
        </a> : <p role="alert" style={{ color: T.danger, fontSize: 13 }}>{m("This is not a valid Stellar transaction hash.")}</p>}
      </Card>

      <div style={{ marginTop: 14, textAlign: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
