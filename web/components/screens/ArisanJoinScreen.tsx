"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { arisanJoin } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { T, Ico, AppBar, IconButton, Card, Btn } from "@/components/ui/kit";

// Invite codes are 6 chars from {digits 2–9, A–Z minus O/I}.
const ALPHA = /^[A-Z2-9]+$/;

export default function ArisanJoinScreen() {
  const { t } = useT();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canSubmit = code.length === 6 && ALPHA.test(code);

  function clean(s: string): string {
    return s
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .replace(/[OI01]/g, "")
      .slice(0, 6);
  }

  function submit() {
    setError(null);
    start(async () => {
      const r = await arisanJoin(code);
      if (r.ok) {
        router.replace(`/arisan/${r.id}`);
      } else {
        setError(r.error || t("arisan.somethingWrong"));
      }
    });
  }

  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%", paddingBottom: 130 }}>
      <AppBar
        leading={
          <IconButton onClick={() => router.back()}>{Ico.back({})}</IconButton>
        }
        title={t("arisan.join.title")}
      />

      <div style={{ padding: "20px 24px 0", textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.action }}>
          {t("arisan.join.kicker")}
        </div>
        <div style={{ marginTop: 6, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.25 }}>
          {t("arisan.join.heroTitle")}
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: T.slate, lineHeight: 1.5 }}>
          {t("arisan.join.heroBody")}
        </div>
      </div>

      <div style={{ padding: "24px 16px 0" }}>
        <Card p={16}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.slate }}>
            {t("arisan.join.codeLabel")}
          </div>
          <input
            value={code}
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="—— —— ——"
            onChange={(e) => setCode(clean(e.target.value))}
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: T.fontMono,
              fontSize: 32,
              fontWeight: 600,
              color: T.ink,
              letterSpacing: "0.18em",
              padding: "12px 0",
              textAlign: "center",
            }}
          />
          <div style={{ marginTop: 4, fontSize: 12, color: T.slate, textAlign: "center" }}>
            {t("arisan.join.codeHint")}
          </div>
        </Card>
      </div>

      {error && (
        <div style={{ padding: "12px 16px 0" }}>
          <div style={{ padding: "10px 12px", borderRadius: 10, background: T.warnTint, color: T.warn, fontSize: 13 }}>
            {error}
          </div>
        </div>
      )}

      <div style={{ padding: "20px 16px 0" }}>
        <Btn
          kind="primary"
          onClick={submit}
          disabled={!canSubmit || pending}
          loading={pending}
        >
          {t("arisan.join.cta")}
        </Btn>
      </div>

      <div style={{ padding: "16px 24px 0", fontSize: 12, color: T.slate, lineHeight: 1.5, textAlign: "center" }}>
        {t("arisan.join.footer")}
      </div>
    </div>
  );
}
