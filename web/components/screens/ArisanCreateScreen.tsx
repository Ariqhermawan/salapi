"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { arisanCreate, type ArisanCadence } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Card,
  Btn,
  Chip,
} from "@/components/ui/kit";
import {
  CURRENCY,
  formatLocalAmount,
  pesoFromLocal,
} from "@/lib/ui/currency";

const PRESETS_LOCAL: Record<string, number[]> = {
  // Display-currency presets per locale (illustrative).
  USD: [10, 25, 50, 100],
  PHP: [500, 1000, 2500, 5000],
  IDR: [50_000, 100_000, 250_000, 500_000],
  VND: [200_000, 500_000, 1_000_000, 2_000_000],
};

const CADENCES: ArisanCadence[] = ["Weekly", "Biweekly", "Monthly"];

export default function ArisanCreateScreen() {
  const { t, currency } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [members, setMembers] = useState(3);
  const [shareLocal, setShareLocal] = useState<string>("");
  const [cadence, setCadence] = useState<ArisanCadence>("Weekly");
  const [error, setError] = useState<string | null>(null);

  const meta = CURRENCY[currency];
  const presets = PRESETS_LOCAL[meta.code] ?? PRESETS_LOCAL.USD;

  const shareLocalNum = Number(shareLocal.replace(/[^0-9.]/g, "")) || 0;
  const sharePesos = pesoFromLocal(shareLocalNum, currency);
  const lockedLocal = shareLocalNum * members;

  const canSubmit = useMemo(() => {
    if (members < 3 || members > 20) return false;
    if (shareLocalNum <= 0) return false;
    return true;
  }, [members, shareLocalNum]);

  function submit() {
    setError(null);
    start(async () => {
      const r = await arisanCreate({
        name: name.trim() || t("arisan.defaultName"),
        memberTarget: members,
        sharePesos,
        cadence,
      });
      if (r.ok) {
        router.replace(`/arisan/${r.id}`);
      } else {
        setError(r.error || t("arisan.somethingWrong"));
      }
    });
  }

  const shell: React.CSSProperties = {
    fontFamily: T.fontSans,
    color: T.ink,
    minHeight: "100%",
    paddingBottom: 130,
  };

  return (
    <div style={shell}>
      <AppBar
        leading={
          <IconButton onClick={() => router.back()}>{Ico.back({})}</IconButton>
        }
        title={t("arisan.create.title")}
      />

      <div style={{ padding: "8px 16px 0" }}>
        <Card p={16}>
          <Label>{t("arisan.create.nameLabel")}</Label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder={t("arisan.create.namePlaceholder")}
            style={inputStyle}
          />
        </Card>
      </div>

      {/* Members */}
      <div style={{ padding: "12px 16px 0" }}>
        <Card p={16}>
          <Label>{t("arisan.create.membersLabel")}</Label>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
            <button
              onClick={() => setMembers((m) => Math.max(3, m - 1))}
              style={stepBtn}
              aria-label="decrement"
            >
              −
            </button>
            <div style={{ fontSize: 28, fontWeight: 600, minWidth: 60, textAlign: "center" }}>
              {members}
            </div>
            <button
              onClick={() => setMembers((m) => Math.min(20, m + 1))}
              style={stepBtn}
              aria-label="increment"
            >
              +
            </button>
            <div style={{ flex: 1, fontSize: 12, color: T.slate, textAlign: "right" }}>
              {t("arisan.create.membersHint")}
            </div>
          </div>
        </Card>
      </div>

      {/* Share */}
      <div style={{ padding: "12px 16px 0" }}>
        <Card p={16}>
          <Label>{t("arisan.create.shareLabel")}</Label>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 600, color: T.slate }}>{meta.symbol.trim()}</span>
            <input
              value={shareLocal}
              inputMode="decimal"
              onChange={(e) => setShareLocal(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0"
              style={{ ...inputStyle, fontSize: 24, fontWeight: 600, padding: "8px 0" }}
            />
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => setShareLocal(String(p))}
                style={presetBtn}
              >
                {formatLocalAmount(p, currency)}
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Cadence */}
      <div style={{ padding: "12px 16px 0" }}>
        <Card p={16}>
          <Label>{t("arisan.create.cadenceLabel")}</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 8 }}>
            {CADENCES.map((c) => {
              const active = c === cadence;
              return (
                <button
                  key={c}
                  onClick={() => setCadence(c)}
                  style={{
                    height: 44,
                    borderRadius: 12,
                    border: "none",
                    background: active ? T.action : T.surface,
                    color: active ? "#fff" : T.ink,
                    fontWeight: 600,
                    fontSize: 14,
                    boxShadow: active ? "none" : "inset 0 0 0 1px " + T.hairline,
                    cursor: "pointer",
                  }}
                >
                  {t("arisan.cadence." + c)}
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Locked preview */}
      <div style={{ padding: "12px 16px 0" }}>
        <Card p={16} style={{ background: T.actionTint }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {Ico.lock({ size: 18, c: T.action })}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.action }}>
                {t("arisan.create.lockedKicker")}
              </div>
              <div style={{ marginTop: 2, fontSize: 18, fontWeight: 600 }}>
                {formatLocalAmount(lockedLocal, currency)}
                <span style={{ marginLeft: 6, fontSize: 12, color: T.slate, fontWeight: 500 }}>
                  ({members} × {formatLocalAmount(shareLocalNum, currency)})
                </span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: T.slate, lineHeight: 1.5 }}>
            {t("arisan.create.lockedBody")}
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
          {t("arisan.create.cta")}
        </Btn>
      </div>

      <div style={{ padding: "12px 24px 0", fontSize: 12, color: T.slate, lineHeight: 1.5, textAlign: "center" }}>
        {t("arisan.create.footer")}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.slate }}>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  fontFamily: T.fontSans,
  fontSize: 16,
  color: T.ink,
  padding: "8px 0",
};

const stepBtn: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 20,
  border: "none",
  background: T.surface,
  boxShadow: "inset 0 0 0 1px " + T.hairline,
  color: T.ink,
  fontSize: 22,
  fontWeight: 600,
  cursor: "pointer",
};

const presetBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 99,
  border: "none",
  background: T.surface,
  boxShadow: "inset 0 0 0 1px " + T.hairline,
  fontSize: 13,
  fontWeight: 600,
  color: T.ink,
  cursor: "pointer",
};
