"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { arisanCreate, type ArisanCadence } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Card,
  Btn,
} from "@/components/ui/kit";
import {
  CURRENCY,
  formatLocalAmount,
  pesoFromLocal,
} from "@/lib/ui/currency";
import { useGoBack } from "@/lib/ui/useGoBack";
import { isLocalPreview } from "@/lib/local-preview";
import { moneyInputToStroops, pesosToStroopsExact } from "@/lib/money";
import { useUnresolvedSubmission } from "@/lib/ui/useUnresolvedSubmission";
import SubmissionStatusPanel from "@/components/ui/SubmissionStatusPanel";
import styles from "./CampaignArisan.module.css";
import { commitPreviewArisanSession, previewArisanRoomKey } from "./arisan-preview";

const PRESETS_LOCAL: Record<string, number[]> = {
  // Display-currency presets per locale (illustrative).
  USD: [10, 25, 50, 100],
  PHP: [500, 1000, 2500, 5000],
  IDR: [50_000, 100_000, 250_000, 500_000],
  VND: [200_000, 500_000, 1_000_000, 2_000_000],
};

const CADENCES: ArisanCadence[] = ["Weekly", "Biweekly", "Monthly"];

export default function ArisanCreateScreen() {
  const submission = useUnresolvedSubmission("arisan:rooms");
  const { t, currency } = useT();
  const router = useRouter();
  const goBack = useGoBack("/arisan");
  const [transitionPending, start] = useTransition();
  const pending = transitionPending || submission.locked;
  const [name, setName] = useState("");
  const [members, setMembers] = useState(3);
  const [shareLocal, setShareLocal] = useState<string>("");
  const [cadence, setCadence] = useState<ArisanCadence>("Weekly");
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const meta = CURRENCY[currency];
  const presets = PRESETS_LOCAL[meta.code] ?? PRESETS_LOCAL.USD;

  const shareLocalNum = Number(shareLocal.replace(/[^0-9.]/g, "")) || 0;
  const lockedLocal = shareLocalNum * members;

  const canSubmit = useMemo(() => {
    if (!Number.isInteger(members) || members < 3 || members > 20) return false;
    if (!/^\d+(?:\.\d{1,7})?$/.test(shareLocal) || !Number.isFinite(shareLocalNum) || shareLocalNum <= 0) return false;
    if (!Number.isFinite(lockedLocal) || !Number.isFinite(pesoFromLocal(shareLocalNum, currency))) return false;
    const stroops = moneyInputToStroops({ amount: shareLocal, currency });
    return stroops !== null && stroops > 0n && stroops <= pesosToStroopsExact("1000000000")!;
  }, [members, shareLocalNum, shareLocal, lockedLocal, currency]);

  function submit() {
    if (pending || !canSubmit) return;
    setError(null);
    start(async () => {
      if (isLocalPreview) {
        try {
        const draft = JSON.stringify({ id: 9001, name: name.trim() || "New community arisan", members, share: shareLocalNum, sharePesos: pesoFromLocal(shareLocalNum, currency), currency, cadence });
        if (!commitPreviewArisanSession([{ key: previewArisanRoomKey(9001), value: null }, { key: "salapi.preview.arisan-cancelled.9001", value: null }, { key: "salapi.preview.arisan-draft", value: draft }])) throw new Error("Preview room could not be saved.");
        router.replace("/arisan/9001");
        } catch { setError("Browser storage could not confirm the local room save. No room was opened and no tokens moved. Check the local room before retrying."); }
        return;
      }
      try {
      const r = await submission.run(() => arisanCreate({
        name: name.trim() || t("arisan.defaultName"),
        memberTarget: members,
        share: { amount: shareLocal, currency },
        cadence,
      }));
      if (!r) return;
      if (r.ok) {
        router.replace(`/arisan/${r.id}`);
      } else {
        setError(r.error || t("arisan.somethingWrong"));
      }
      } catch { setError("Room creation was interrupted. Check your rooms before retrying."); }
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
      <SubmissionStatusPanel guard={submission} />
      <AppBar
        leading={
          <IconButton ariaLabel="Back to arisan rooms" onClick={reviewing ? () => setReviewing(false) : goBack}>{Ico.back({})}</IconButton>
        }
        title={t("arisan.create.title")}
      />
      <header className={styles.formIntro}><div><span className={styles.eyebrow}>{reviewing ? "Step 2 of 2 · Review" : "Step 1 of 2 · Set the terms"}</span><h1>{reviewing ? "Check your circle." : "Start something together."}</h1><p>{isLocalPreview ? "Example data. Creating a room here only changes this local preview." : "Create a Testnet room, then invite people you know."}</p></div><Image className={styles.doodle} width={112} height={112} src="/illustrations/arisan.png" alt="People pooling funds together" /></header>
      {reviewing ? <div className={styles.body}><section className={styles.review}><h2>{name.trim() || t("arisan.defaultName")}</h2><dl><dt>Members</dt><dd>{members}</dd><dt>Share per round</dt><dd>{formatLocalAmount(shareLocalNum,currency)}</dd><dt>Payout per draw</dt><dd>{formatLocalAmount(lockedLocal,currency)}</dd><dt>Your upfront deposit</dt><dd>{formatLocalAmount(lockedLocal,currency)}</dd><dt>Schedule</dt><dd>{t("arisan.cadence." + cadence)}</dd></dl><p className={styles.muted}>Each member deposits {members} × their share before the first draw. This is a rotating pool, with no interest or yield. Display currency is illustrative; live Testnet rooms move valueless XLM.</p></section>{error && <div role="alert" className={styles.error}>{error}</div>}<Btn disabled={pending} loading={pending} onClick={submit}>{isLocalPreview ? "Create local example room" : "Create Testnet room"}</Btn><Btn kind="secondary" disabled={pending} onClick={() => setReviewing(false)}>Edit terms</Btn></div> : <>
      <div style={{ padding: "8px 16px 0" }}>
        <Card p={16}>
          <Label>{t("arisan.create.nameLabel")}</Label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder={t("arisan.create.namePlaceholder")}
            aria-label={t("arisan.create.nameLabel")}
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
              aria-label="Remove a member"
              disabled={members <= 3}
            >
              −
            </button>
            <div style={{ fontSize: 28, fontWeight: 600, minWidth: 60, textAlign: "center" }}>
              {members}
            </div>
            <button
              onClick={() => setMembers((m) => Math.min(20, m + 1))}
              style={stepBtn}
              aria-label="Add a member"
              disabled={members >= 20}
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
              aria-label={t("arisan.create.shareLabel")}
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
        <Card p={20} style={{ background: "#F2EFE7" }}>
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
          <p className={styles.muted} style={{ marginTop: 8 }}>Upfront deposit per member = {members} × the share. It funds all {members} rounds before anyone receives a payout.</p>
          {!isLocalPreview && <p className={styles.muted} style={{ marginTop: 8 }}>Current Testnet demo timing: joining closes about 2 minutes after creation. The host must start the full room before the first draw at about 3 minutes. Weekly, biweekly and monthly describe later rounds.</p>}
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
          onClick={() => setReviewing(true)}
          disabled={!canSubmit || pending}
          loading={pending}
        >
          Review room terms
        </Btn>
      </div>

      <div style={{ padding: "12px 24px 0", fontSize: 12, color: T.slate, lineHeight: 1.5, textAlign: "center" }}>
        {t("arisan.create.footer")}
      </div>
      </>}
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
