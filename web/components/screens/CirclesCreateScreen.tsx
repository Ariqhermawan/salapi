"use client";

// Salapi Circles - Create-a-circle multi-step preview (Build-Award scope).
// Nothing is persisted to a contract; the only persistence is the optional
// waitlist email captured at the share-screen, via joinCirclesWaitlist (same
// server action as the Donate flow). Real organizer verification + open-cause
// moderation ship at Build-Award.
//
// Step 3 "Operational Allowance" is the Build-Award STAGE 2 extension (SOW
// Section 8 "Honest creator economy"). The selector is preview-only; no
// allowance is encoded into any contract today. Day-30 Disaster Vault is
// 0 percent organizer cut.

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { joinCirclesWaitlist } from "@/app/actions";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  Card,
  Btn,
  Chip,
  PoweredByStellar,
} from "@/components/ui/kit";
import { formatParts, CURRENCY } from "@/lib/ui/currency";
import { useT } from "@/components/I18nProvider";
import PreviewBadge from "@/components/circles/PreviewBadge";
import {
  Stage2Pill,
  WhyExistsLink,
} from "@/components/ui/OperationalAllowanceExplainer";
import {
  KYC_TIER_CEILING,
  KYC_TIER_NAME,
  clampToTier,
  localePreviewSplit,
  type KycTier,
} from "@/lib/circles/allowance";
import { type CircleCategory } from "@/lib/circles/types";

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Step progress labels, by index. Resolved through t() at render.
const STEP_KEYS = [
  "circles.stepTitle",
  "circles.stepStory",
  "circles.stepGoal",
  "circles.stepAllowance",
  "circles.stepCover",
  "circles.stepVerify",
  "circles.stepShare",
] as const;

const CATS: CircleCategory[] = [
  "disaster",
  "medical",
  "education",
  "community",
  "family",
  "creator",
];
const CATEGORY_KEY: Record<CircleCategory, string> = {
  disaster: "circles.catDisaster",
  medical: "circles.catMedical",
  education: "circles.catEducation",
  community: "circles.catCommunity",
  family: "circles.catFamily",
  creator: "circles.catCreator",
};
const TIER_KEY: Record<KycTier, string> = {
  0: "circles.tier0",
  1: "circles.tier1",
  2: "circles.tier2",
};

// Duration options. `d` is the day count; the label is a circles.* key.
const DURATIONS = [
  { d: 14, key: "circles.dur2w" },
  { d: 30, key: "circles.dur1m" },
  { d: 60, key: "circles.dur2m" },
  { d: 90, key: "circles.dur3m" },
];

const GRADIENTS: [string, string][] = [
  ["#B45309", "#F59E0B"],
  ["#059669", "#10B981"],
  ["#1D4ED8", "#3B82F6"],
  ["#4C2F8A", "#7C3AED"],
  ["#9C4221", "#F97316"],
  ["#2E5DA0", "#0EA5E9"],
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

export default function CirclesCreateScreen() {
  const router = useRouter();
  const { locale, t } = useT();

  const [step, setStep] = useState<Step>(0);
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [category, setCategory] = useState<CircleCategory>("community");
  const [pesoTarget, setPesoTarget] = useState<number>(50_000);
  const [days, setDays] = useState<number>(30);
  const [gradient, setGradient] = useState<[string, string]>(GRADIENTS[0]);

  // Build-Award stage 2 (SOW Section 8) preview state.
  const [previewTier, setPreviewTier] = useState<KycTier>(0);
  const [allowancePct, setAllowancePct] = useState<number>(0);
  const [allowanceAck, setAllowanceAck] = useState<boolean>(false);

  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const [waitlisted, setWaitlisted] = useState(false);

  const slug = useMemo(() => slugify(title || "your-circle"), [title]);
  const previewUrl = `salapi.app/circles/${slug}`;

  const shell: React.CSSProperties = {
    fontFamily: T.fontSans,
    color: T.ink,
    minHeight: "100%",
    paddingBottom: 110,
  };

  function next() {
    setErr("");
    if (step === 0 && title.trim().length < 6) {
      setErr(t("circles.errTitle"));
      return;
    }
    if (step === 1 && story.trim().length < 40) {
      setErr(t("circles.errStory"));
      return;
    }
    if (step === 2 && !(pesoTarget > 0)) {
      setErr(t("circles.errGoal"));
      return;
    }
    if (step === 3 && allowancePct > 0 && !allowanceAck) {
      setErr(t("circles.errAck"));
      return;
    }
    setStep((s) => Math.min(6, (s + 1) as Step) as Step);
  }
  function back() {
    setErr("");
    setStep((s) => Math.max(0, (s - 1) as Step) as Step);
  }

  function submitWaitlist() {
    setErr("");
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErr(t("circles.errEmailCreate"));
      return;
    }
    start(async () => {
      const r = await joinCirclesWaitlist({
        email: trimmed,
        circleId: `draft:${slug}`,
        locale,
        pesoPledge: pesoTarget,
        anonymous: false,
        marketingOk: true,
      });
      if (r.ok) setWaitlisted(true);
      else setErr(r.error || t("circles.saveDraftFailed"));
    });
  }

  // Header callbacks are stable closures; the Header itself lives at module
  // level (below) to satisfy React 19's react-hooks/static-components rule.
  const onExit = () => router.push("/circles");

  // ── STEP 0: Title ──
  if (step === 0) {
    return (
      <div style={shell}>
        <Header pill={<PreviewBadge />} step={step} onBack={back} onExit={onExit} t={t} />
        <div style={{ padding: "8px 20px 0" }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              lineHeight: 1.25,
              margin: 0,
            }}
          >
            {t("circles.createTitleH1")}
          </h1>
          <p
            style={{
              marginTop: 8,
              fontSize: 13.5,
              color: T.slate,
              lineHeight: 1.55,
            }}
          >
            {t("circles.createTitleHint")}
          </p>
        </div>
        <div style={{ padding: "18px 16px 0" }}>
          <Card>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 90))}
              placeholder={t("circles.createTitlePh")}
              rows={3}
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                resize: "none",
                background: "transparent",
                fontFamily: T.fontSans,
                fontSize: 16,
                color: T.ink,
                lineHeight: 1.4,
              }}
            />
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                color: T.slate,
                textAlign: "right",
                fontFamily: T.fontMono,
              }}
            >
              {title.length}/90
            </div>
          </Card>
        </div>
        {err && <ErrorBanner err={err} />}
        <BottomNext onNext={next} label={t("circles.nextStory")} />
      </div>
    );
  }

  // ── STEP 1: Story ──
  if (step === 1) {
    return (
      <div style={shell}>
        <Header pill={<PreviewBadge />} step={step} onBack={back} onExit={onExit} t={t} />
        <div style={{ padding: "8px 20px 0" }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              lineHeight: 1.25,
              margin: 0,
            }}
          >
            {t("circles.createStoryH1")}
          </h1>
          <p
            style={{
              marginTop: 8,
              fontSize: 13.5,
              color: T.slate,
              lineHeight: 1.55,
            }}
          >
            {t("circles.createStoryHint")}
          </p>
        </div>
        <div style={{ padding: "18px 16px 0" }}>
          <Card>
            <textarea
              value={story}
              onChange={(e) => setStory(e.target.value.slice(0, 1500))}
              placeholder={t("circles.createStoryPh")}
              rows={12}
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                resize: "vertical",
                background: "transparent",
                fontFamily: T.fontSans,
                fontSize: 15,
                color: T.ink,
                lineHeight: 1.55,
                minHeight: 220,
              }}
            />
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                color: T.slate,
                textAlign: "right",
                fontFamily: T.fontMono,
              }}
            >
              {story.length}/1500
            </div>
          </Card>
        </div>
        {err && <ErrorBanner err={err} />}
        <BottomNext onNext={next} label={t("circles.nextGoal")} />
      </div>
    );
  }

  // ── STEP 2: Goal + category + duration ──
  if (step === 2) {
    const amt = formatParts(pesoTarget, locale);
    return (
      <div style={shell}>
        <Header pill={<PreviewBadge />} step={step} onBack={back} onExit={onExit} t={t} />
        <div style={{ padding: "8px 20px 0" }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              lineHeight: 1.25,
              margin: 0,
            }}
          >
            {t("circles.createGoalH1")}
          </h1>
          <p
            style={{
              marginTop: 8,
              fontSize: 13.5,
              color: T.slate,
              lineHeight: 1.55,
            }}
          >
            {t("circles.createGoalHint")}
          </p>
        </div>

        <div
          style={{
            padding: "20px 24px 0",
            textAlign: "center",
          }}
        >
          <div
            className="sl-balance"
            style={{
              fontSize: 46,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              display: "inline-flex",
              alignItems: "baseline",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 24, color: T.slate, fontWeight: 500 }}>
              {amt.symbol.trim()}
            </span>
            <input
              value={String(pesoTarget)}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, "");
                setPesoTarget(
                  raw === "" ? 0 : Math.min(10_000_000, Number(raw))
                );
              }}
              inputMode="numeric"
              style={{
                width: Math.max(2, String(pesoTarget).length || 1) + "ch",
                border: "none",
                outline: "none",
                background: "transparent",
                font: "inherit",
                color: T.ink,
                textAlign: "center",
              }}
            />
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              color: T.slate,
              fontFamily: T.fontMono,
            }}
          >
            {CURRENCY[locale].code}
          </div>
        </div>

        <div style={{ padding: "22px 24px 6px" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: T.slate,
            }}
          >
            {t("circles.category")}
          </div>
        </div>
        <div
          style={{
            padding: "0 16px",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {CATS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              style={{
                padding: "8px 12px",
                borderRadius: 99,
                border: "none",
                background: c === category ? T.action : T.surface,
                color: c === category ? "#fff" : T.slate,
                fontFamily: T.fontSans,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow:
                  c === category
                    ? "0 1px 2px rgba(11,18,32,0.06)"
                    : "inset 0 0 0 1px " + T.hairline,
              }}
            >
              {t(CATEGORY_KEY[c])}
            </button>
          ))}
        </div>

        <div style={{ padding: "22px 24px 6px" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: T.slate,
            }}
          >
            {t("circles.duration")}
          </div>
        </div>
        <div
          style={{
            padding: "0 16px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          {DURATIONS.map((d) => (
            <button
              key={d.d}
              type="button"
              onClick={() => setDays(d.d)}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "none",
                background: d.d === days ? T.actionTint : T.surface,
                color: d.d === days ? T.action : T.ink,
                fontFamily: T.fontSans,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                textAlign: "left",
                boxShadow:
                  d.d === days
                    ? "inset 0 0 0 1px " + T.action
                    : "inset 0 0 0 1px " + T.hairline,
              }}
            >
              {t(d.key)}
              <div
                style={{
                  fontSize: 11,
                  color: T.slate,
                  marginTop: 2,
                  fontWeight: 500,
                }}
              >
                {t("circles.durDays", { n: d.d })}
              </div>
            </button>
          ))}
        </div>

        {err && <ErrorBanner err={err} />}
        <BottomNext onNext={next} label={t("circles.nextAllowance")} />
      </div>
    );
  }

  // ── STEP 3 (NEW): Operational Allowance, Build-Award stage 2 ──
  if (step === 3) {
    const ceiling = KYC_TIER_CEILING[previewTier];
    const clamped = clampToTier(allowancePct, previewTier);
    // Locale-aware round sample - ₱100 / Rp 100,000 / $100 / ₫100,000.
    const preview = localePreviewSplit(locale, clamped);
    return (
      <div style={shell}>
        <Header pill={<Stage2Pill />} step={step} onBack={back} onExit={onExit} t={t} />

        <div style={{ padding: "8px 20px 0" }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              lineHeight: 1.25,
              margin: 0,
            }}
          >
            {t("circles.allowanceH1")}
          </h1>
          <p
            style={{
              marginTop: 8,
              fontSize: 13.5,
              color: T.slate,
              lineHeight: 1.55,
            }}
          >
            {t("circles.allowanceHint")}
          </p>
          <div style={{ marginTop: 6 }}>
            <WhyExistsLink label={t("circles.whyReadCase")} />
          </div>
        </div>

        {/* Tier selector. Tap to demo a tier; the slider responds. */}
        <div style={{ padding: "16px 24px 6px" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: T.slate,
            }}
          >
            {t("circles.yourKycTier")}
          </div>
        </div>
        <div
          style={{
            padding: "0 16px",
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 8,
          }}
        >
          {([0, 1, 2] as KycTier[]).map((tier) => {
            const active = tier === previewTier;
            return (
              <button
                key={tier}
                type="button"
                onClick={() => {
                  setPreviewTier(tier);
                  // Clamp the existing allowance to the new tier's ceiling
                  // and reset the immutable-after-donation ack: any new
                  // value must be re-acknowledged so users cannot bypass
                  // the checkbox by switching tiers around it.
                  setAllowancePct((p) => clampToTier(p, tier));
                  setAllowanceAck(false);
                }}
                style={{
                  padding: "12px 10px",
                  borderRadius: 12,
                  border: "none",
                  background: active ? T.ink : T.surface,
                  color: active ? "#fff" : T.ink,
                  fontFamily: T.fontSans,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  textAlign: "center",
                  boxShadow: active
                    ? "0 1px 2px rgba(11,18,32,0.1)"
                    : "inset 0 0 0 1px " + T.hairline,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    color: active ? "rgba(255,255,255,0.65)" : T.slate,
                    textTransform: "uppercase",
                  }}
                >
                  {t(TIER_KEY[tier])}
                </span>
                <span>{t("circles.upTo", { pct: KYC_TIER_CEILING[tier] })}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: active ? "rgba(255,255,255,0.75)" : T.slate,
                  }}
                >
                  {KYC_TIER_NAME[tier]}
                </span>
              </button>
            );
          })}
        </div>
        <div
          style={{
            padding: "8px 24px 0",
            fontSize: 11.5,
            color: T.slate,
            lineHeight: 1.5,
          }}
        >
          {t("circles.tierPreviewNote")}
        </div>

        {/* Slider */}
        <div style={{ padding: "20px 20px 0" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: T.slate,
              }}
            >
              {t("circles.allowance")}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "-0.01em",
              }}
            >
              {clamped}
              <span style={{ fontSize: 14, color: T.slate, marginLeft: 2 }}>
                %
              </span>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(ceiling, 1)}
            value={clamped}
            disabled={ceiling === 0}
            onChange={(e) => {
              setAllowancePct(clampToTier(Number(e.target.value), previewTier));
              setAllowanceAck(false);
            }}
            aria-label="Operational allowance percentage"
            style={{
              width: "100%",
              marginTop: 10,
              accentColor: T.action,
              opacity: ceiling === 0 ? 0.5 : 1,
              cursor: ceiling === 0 ? "not-allowed" : "pointer",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 4,
              fontSize: 10.5,
              color: T.slate,
              fontFamily: T.fontMono,
            }}
          >
            <span>0%</span>
            <span>
              {t("circles.ceilingFor", {
                pct: ceiling,
                tier: t(TIER_KEY[previewTier]),
              })}
            </span>
          </div>
        </div>

        {/* Live split preview */}
        <div style={{ padding: "16px 16px 0" }}>
          <Card>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: T.slate,
              }}
            >
              {t("circles.donorSees")}
            </div>
            <p
              style={{
                margin: "8px 0 12px",
                fontSize: 14.5,
                lineHeight: 1.5,
                color: T.ink,
              }}
            >
              {t("circles.splitCreateLine", {
                sample: preview.fmtSample,
                beneficiary: preview.fmtBeneficiary,
                allowance: preview.fmtAllowance,
              })}
            </p>
            {/* Stacked bar */}
            <div
              style={{
                height: 12,
                borderRadius: 99,
                background: T.hairline,
                overflow: "hidden",
                display: "flex",
              }}
            >
              <div
                style={{
                  width: `${100 - clamped}%`,
                  background: T.moneyIn,
                }}
                aria-label={`${100 - clamped}% beneficiary`}
              />
              <div
                style={{
                  width: `${clamped}%`,
                  background: T.warn,
                }}
                aria-label={`${clamped}% operational allowance`}
              />
            </div>
            <div
              style={{
                marginTop: 8,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11.5,
                color: T.slate,
              }}
            >
              <span>
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: 99,
                    background: T.moneyIn,
                    marginRight: 6,
                    verticalAlign: "middle",
                  }}
                />
                {t("circles.beneficiaryPct", { pct: 100 - clamped })}
              </span>
              <span>
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: 99,
                    background: T.warn,
                    marginRight: 6,
                    verticalAlign: "middle",
                  }}
                />
                {t("circles.operationalPct", { pct: clamped })}
              </span>
            </div>
          </Card>
        </div>

        {/* Mandatory ack */}
        {clamped > 0 && (
          <div style={{ padding: "14px 16px 0" }}>
            <Card>
              <button
                type="button"
                onClick={() => setAllowanceAck((v) => !v)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: 0,
                  background: "transparent",
                  border: "none",
                  textAlign: "left",
                  cursor: "pointer",
                  color: T.ink,
                  fontFamily: T.fontSans,
                }}
                aria-pressed={allowanceAck}
              >
                <span
                  style={{
                    flex: "0 0 auto",
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    border: "2px solid " + (allowanceAck ? T.action : T.hairline),
                    background: allowanceAck ? T.action : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 1,
                  }}
                >
                  {allowanceAck && Ico.check({ size: 14, c: "#fff" })}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: T.ink,
                  }}
                >
                  {t("circles.ackText")}
                </span>
              </button>
            </Card>
          </div>
        )}

        {/* Build-Award stage 2 footer */}
        <div style={{ padding: "16px 16px 0" }}>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: T.canvas,
              fontSize: 12.5,
              color: T.slate,
              lineHeight: 1.55,
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <div style={{ marginTop: 1, color: T.warn }}>
              {Ico.shield({ size: 16, c: T.warn })}
            </div>
            <div>
              <strong style={{ color: T.ink }}>
                {t("circles.stage2FooterStrong")}
              </strong>{" "}
              {t("circles.stage2FooterBody")}
            </div>
          </div>
        </div>

        {err && <ErrorBanner err={err} />}
        <BottomNext onNext={next} label={t("circles.nextCover")} />
      </div>
    );
  }

  // ── STEP 4 (was 3): Cover (placeholder gradient picker) ──
  if (step === 4) {
    return (
      <div style={shell}>
        <Header pill={<PreviewBadge />} step={step} onBack={back} onExit={onExit} t={t} />
        <div style={{ padding: "8px 20px 0" }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              lineHeight: 1.25,
              margin: 0,
            }}
          >
            {t("circles.coverH1")}
          </h1>
          <p
            style={{
              marginTop: 8,
              fontSize: 13.5,
              color: T.slate,
              lineHeight: 1.55,
            }}
          >
            {t("circles.coverHint")}
          </p>
        </div>

        <div style={{ padding: "18px 16px 0" }}>
          <div
            style={{
              height: 160,
              borderRadius: 18,
              background: `linear-gradient(140deg, ${gradient[0]}, ${gradient[1]})`,
              position: "relative",
              overflow: "hidden",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(120% 80% at 80% 20%, rgba(255,255,255,0.32), transparent 60%)",
              }}
            />
            <div
              style={{
                padding: "5px 10px",
                borderRadius: 99,
                background: "rgba(11,18,32,0.55)",
                color: "#fff",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                alignSelf: "flex-start",
                position: "relative",
              }}
            >
              {t(CATEGORY_KEY[category])}
            </div>
            <div
              style={{
                color: "#fff",
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                lineHeight: 1.3,
                textShadow: "0 1px 2px rgba(11,18,32,0.35)",
                position: "relative",
              }}
            >
              {title || t("circles.yourCircleTitle")}
            </div>
          </div>
        </div>

        <div style={{ padding: "16px 24px 6px" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: T.slate,
            }}
          >
            {t("circles.tone")}
          </div>
        </div>
        <div
          style={{
            padding: "0 16px",
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 8,
          }}
        >
          {GRADIENTS.map((g, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setGradient(g)}
              aria-label={t("circles.coverToneAria", { n: i + 1 })}
              style={{
                height: 56,
                borderRadius: 12,
                border: "none",
                background: `linear-gradient(140deg, ${g[0]}, ${g[1]})`,
                cursor: "pointer",
                boxShadow:
                  g === gradient
                    ? "0 0 0 3px " + T.action
                    : "inset 0 0 0 1px rgba(11,18,32,0.08)",
              }}
            />
          ))}
        </div>

        <BottomNext onNext={next} label={t("circles.nextOrganizer")} />
      </div>
    );
  }

  // ── STEP 5 (was 4): Organizer verification placeholder ──
  if (step === 5) {
    return (
      <div style={shell}>
        <Header pill={<PreviewBadge />} step={step} onBack={back} onExit={onExit} t={t} />
        <div style={{ padding: "8px 20px 0" }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              lineHeight: 1.25,
              margin: 0,
            }}
          >
            {t("circles.verifyH1")}
          </h1>
          <p
            style={{
              marginTop: 8,
              fontSize: 13.5,
              color: T.slate,
              lineHeight: 1.55,
            }}
          >
            {t("circles.verifyHint")}
          </p>
        </div>

        <div style={{ padding: "18px 16px 0" }}>
          <Card>
            {[
              {
                ico: Ico.user,
                label: t("circles.verifyGovId"),
                sub: t("circles.verifyGovIdSub"),
              },
              {
                ico: Ico.verify,
                label: t("circles.verifySelfie"),
                sub: t("circles.verifySelfieSub"),
              },
              {
                ico: Ico.shield,
                label: t("circles.verifyRecipient"),
                sub: t("circles.verifyRecipientSub"),
              },
              {
                ico: Ico.globe,
                label: t("circles.verifyVouch"),
                sub: t("circles.verifyVouchSub"),
              },
            ].map((row, i, arr) => (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 4px",
                  borderBottom:
                    i < arr.length - 1 ? "1px solid " + T.hairline : "none",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: T.canvas,
                    color: T.slate,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {row.ico({ size: 16, c: T.slate })}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {row.label}
                  </div>
                  <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>
                    {row.sub}
                  </div>
                </div>
                <Chip kind="warn" size="sm">
                  {t("circles.buildAwardChip")}
                </Chip>
              </div>
            ))}
          </Card>
        </div>

        <div style={{ padding: "16px 16px 0" }}>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: T.warnTint,
              color: T.warn,
              fontSize: 12.5,
              lineHeight: 1.5,
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <div style={{ marginTop: 1 }}>
              {Ico.shield({ size: 16, c: T.warn })}
            </div>
            <div>{t("circles.verifySkipNote")}</div>
          </div>
        </div>

        <BottomNext onNext={next} label={t("circles.nextShare")} />
      </div>
    );
  }

  // ── STEP 6 (was 5): Share + waitlist signup ──
  return (
    <div style={shell}>
      <Header pill={<PreviewBadge />} step={step} onBack={back} onExit={onExit} t={t} />
      <div style={{ padding: "10px 28px 0", textAlign: "center" }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: T.actionTint,
            color: T.action,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "inset 0 0 0 1px " + T.hairline,
          }}
        >
          {Ico.check({ size: 32, c: T.action })}
        </div>
        <div
          style={{
            marginTop: 18,
            fontSize: 21,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            lineHeight: 1.25,
          }}
        >
          {t("circles.shareReadyTitle")}
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 13.5,
            color: T.slate,
            lineHeight: 1.55,
          }}
        >
          {t("circles.shareReadyBody")}
        </div>
      </div>

      <div style={{ padding: "20px 16px 0" }}>
        <Card>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: T.slate,
            }}
          >
            {t("circles.shareLinkLabel")}
          </div>
          <div
            style={{
              marginTop: 8,
              fontFamily: T.fontMono,
              fontSize: 13.5,
              color: T.action,
              wordBreak: "break-all",
            }}
          >
            {previewUrl}
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 11.5,
              color: T.slate,
              lineHeight: 1.45,
            }}
          >
            {t("circles.shareLinkNote")}
          </div>
          {allowancePct > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: T.canvas,
                fontSize: 12,
                color: T.slate,
                lineHeight: 1.5,
              }}
            >
              {t("circles.allowanceConfigured")}{" "}
              <strong style={{ color: T.ink }}>{allowancePct}%</strong>{" "}
              {t("circles.allowanceConfiguredTail", {
                tier: t(TIER_KEY[previewTier]),
                ceiling: KYC_TIER_CEILING[previewTier],
              })}
            </div>
          )}
        </Card>
      </div>

      {!waitlisted && (
        <>
          <div style={{ padding: "16px 16px 0" }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: T.slate,
                padding: "0 4px 6px",
              }}
            >
              {t("circles.inviteAtLaunch")}
            </label>
            <Card p={0}>
              <div style={{ padding: "12px 16px" }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  autoComplete="email"
                  inputMode="email"
                  style={{
                    width: "100%",
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontFamily: T.fontSans,
                    fontSize: 16,
                    color: T.ink,
                    padding: "6px 0",
                  }}
                />
              </div>
            </Card>
          </div>

          {err && <ErrorBanner err={err} />}

          <div style={{ padding: "18px 16px 0" }}>
            <Btn
              kind="primary"
              disabled={pending}
              loading={pending}
              onClick={submitWaitlist}
            >
              {t("circles.saveDraftCta")}
            </Btn>
            <div
              style={{
                marginTop: 10,
                fontSize: 11.5,
                color: T.slate,
                textAlign: "center",
                lineHeight: 1.5,
              }}
            >
              {t("circles.saveDraftNote")}
            </div>
          </div>
        </>
      )}

      {waitlisted && (
        <div style={{ padding: "18px 16px 0" }}>
          <Card style={{ background: "linear-gradient(160deg,#E6F6EF,#fff)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 99,
                  background: T.moneyInTint,
                  color: T.moneyIn,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {Ico.check({ size: 18, c: T.moneyIn })}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {t("circles.draftSavedTitle")}
                </div>
                <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>
                  {t("circles.draftSavedDetail", {
                    amount: `${formatParts(pesoTarget, locale).symbol}${
                      formatParts(pesoTarget, locale).int
                    }`,
                    days,
                    pct: allowancePct,
                  })}
                </div>
              </div>
            </div>
          </Card>
          <div style={{ paddingTop: 14 }}>
            <Btn kind="secondary" onClick={() => router.push("/circles")}>
              {t("circles.backToCircles")}
            </Btn>
          </div>
        </div>
      )}

      <div
        style={{
          padding: "22px 24px 0",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <PoweredByStellar />
      </div>
    </div>
  );
}

// Translation fn type, mirrors useT()'s `t`. Passed in because Header is a
// module-level component (React 19 react-hooks/static-components rule) and
// cannot call the useT() hook itself.
type TFn = (key: string, vars?: Record<string, string | number>) => string;

// Header lives at module level (React 19 react-hooks/static-components rule).
function Header({
  pill,
  step,
  onBack,
  onExit,
  t,
}: {
  pill: ReactNode;
  step: number;
  onBack: () => void;
  onExit: () => void;
  t: TFn;
}) {
  return (
    <>
      <AppBar
        leading={
          <IconButton onClick={step === 0 ? onExit : onBack}>
            {step === 0 ? Ico.x({}) : Ico.back({})}
          </IconButton>
        }
        title={t("circles.startCircle")}
        trailing={pill}
      />
      <div
        style={{
          padding: "4px 20px 12px",
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        {STEP_KEYS.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 99,
              background: i <= step ? T.action : T.hairline,
              transition: "background .2s",
            }}
          />
        ))}
        <div
          style={{
            marginLeft: 6,
            fontSize: 11,
            color: T.slate,
            fontFamily: T.fontMono,
          }}
        >
          {step + 1}/{STEP_KEYS.length}
        </div>
      </div>
    </>
  );
}

function ErrorBanner({ err }: { err: string }) {
  return (
    <div
      style={{
        margin: "14px 16px 0",
        padding: "12px 14px",
        borderRadius: 12,
        background: "#FBEAE8",
        color: T.danger,
        fontSize: 13,
        lineHeight: 1.4,
      }}
    >
      {err}
    </div>
  );
}

// Uses the design-system Btn (primary kind) and T tokens, not re-hardcoded
// hex colors / font stacks.
function BottomNext({ onNext, label }: { onNext: () => void; label: string }) {
  return (
    <div style={{ padding: "24px 16px 0" }}>
      <Btn kind="primary" onClick={onNext}>
        {label}
      </Btn>
    </div>
  );
}
