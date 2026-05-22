"use client";

import { useT } from "@/components/I18nProvider";
import { T } from "@/components/ui/kit";
import { SalapiMascot } from "@/components/ui/mascot";

// PWA offline fallback. Composes T tokens (no Tailwind utility classes) and
// routes both strings through the dictionary so the fallback reads in the
// user's language even with no network.
export default function OfflineScreen() {
  const { t } = useT();

  return (
    <div
      style={{
        fontFamily: T.fontSans,
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "0 32px",
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <SalapiMascot size={64} c={T.slate} pose="think" />
      </div>
      <h1
        style={{
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: T.ink,
        }}
      >
        {t("offline.title")}
      </h1>
      <p
        style={{
          marginTop: 8,
          fontSize: 14,
          color: T.slate,
          lineHeight: 1.5,
          maxWidth: 280,
        }}
      >
        {t("offline.body")}
      </p>
    </div>
  );
}
