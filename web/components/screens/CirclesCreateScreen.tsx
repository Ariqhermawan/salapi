"use client";

// Salapi Circles — Create-a-circle multi-step preview (Build-Award scope).
// Nothing is persisted to a contract; the only persistence is the optional
// waitlist email captured at the share-screen, via joinCirclesWaitlist (same
// server action as the Donate flow). Real organizer verification + open-cause
// moderation ship at Build-Award.

import { useMemo, useState, useTransition } from "react";
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
  CATEGORY_LABEL,
  type CircleCategory,
} from "@/lib/circles/types";

type Step = 0 | 1 | 2 | 3 | 4 | 5;
const STEPS = [
  "Title",
  "Story",
  "Goal",
  "Cover",
  "Verify",
  "Share",
] as const;

const CATS: CircleCategory[] = [
  "disaster",
  "medical",
  "education",
  "community",
  "family",
  "creator",
];

const DURATIONS = [
  { d: 14, label: "2 weeks" },
  { d: 30, label: "1 month" },
  { d: 60, label: "2 months" },
  { d: 90, label: "3 months" },
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
  const { locale } = useT();

  const [step, setStep] = useState<Step>(0);
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [category, setCategory] = useState<CircleCategory>("community");
  const [pesoTarget, setPesoTarget] = useState<number>(50_000);
  const [days, setDays] = useState<number>(30);
  const [gradient, setGradient] = useState<[string, string]>(GRADIENTS[0]);

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
      setErr("Give your circle a clear title (at least 6 characters).");
      return;
    }
    if (step === 1 && story.trim().length < 40) {
      setErr("A short story helps donors trust the cause. Add a bit more.");
      return;
    }
    if (step === 2 && !(pesoTarget > 0)) {
      setErr("Pick a goal amount above zero.");
      return;
    }
    setStep((s) => Math.min(5, (s + 1) as Step) as Step);
  }
  function back() {
    setErr("");
    setStep((s) => Math.max(0, (s - 1) as Step) as Step);
  }

  function submitWaitlist() {
    setErr("");
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErr("Enter a valid email so we can invite you at launch.");
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
      else setErr(r.error || "Couldn't save your draft. Please try again.");
    });
  }

  // ── HEADER + STEPPER ──
  const Header = (
    <>
      <AppBar
        leading={
          <IconButton
            onClick={() => (step === 0 ? router.push("/circles") : back())}
          >
            {step === 0 ? Ico.x({}) : Ico.back({})}
          </IconButton>
        }
        title="Start a circle"
        trailing={<PreviewBadge />}
      />
      <div
        style={{
          padding: "4px 20px 12px",
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        {STEPS.map((_, i) => (
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
          {step + 1}/{STEPS.length}
        </div>
      </div>
    </>
  );

  // ── STEP 0: Title ──
  if (step === 0) {
    return (
      <div style={shell}>
        {Header}
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
            What are you raising for?
          </h1>
          <p
            style={{
              marginTop: 8,
              fontSize: 13.5,
              color: T.slate,
              lineHeight: 1.55,
            }}
          >
            One sentence donors will see first. Be specific - location, who it
            helps, the timeframe.
          </p>
        </div>
        <div style={{ padding: "18px 16px 0" }}>
          <Card>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 90))}
              placeholder="e.g. Help Lola Rosa replace her cataract lenses this month"
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
        <BottomNext onNext={next} label="Next: tell the story" />
      </div>
    );
  }

  // ── STEP 1: Story ──
  if (step === 1) {
    return (
      <div style={shell}>
        {Header}
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
            Tell the story
          </h1>
          <p
            style={{
              marginTop: 8,
              fontSize: 13.5,
              color: T.slate,
              lineHeight: 1.55,
            }}
          >
            Who is affected, what happened, what the money buys. Donors give to
            people, not numbers.
          </p>
        </div>
        <div style={{ padding: "18px 16px 0" }}>
          <Card>
            <textarea
              value={story}
              onChange={(e) => setStory(e.target.value.slice(0, 1500))}
              placeholder={
                "Example: Last Tuesday a fire took the second floor of our barangay hall...\n\nWe need to rebuild the roof before the rains. The carpenter quoted ₱45,000 for materials..."
              }
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
        <BottomNext onNext={next} label="Next: set the goal" />
      </div>
    );
  }

  // ── STEP 2: Goal + category + duration ──
  if (step === 2) {
    const amt = formatParts(pesoTarget, locale);
    return (
      <div style={shell}>
        {Header}
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
            Set your goal
          </h1>
          <p
            style={{
              marginTop: 8,
              fontSize: 13.5,
              color: T.slate,
              lineHeight: 1.55,
            }}
          >
            A clear, achievable number wins faster. You can keep raising past
            the goal at Build-Award launch.
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
                setPesoTarget(raw === "" ? 0 : Math.min(10_000_000, Number(raw)));
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
            Category
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
              {CATEGORY_LABEL[c]}
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
            Duration
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
              {d.label}
              <div style={{ fontSize: 11, color: T.slate, marginTop: 2, fontWeight: 500 }}>
                {d.d} days
              </div>
            </button>
          ))}
        </div>

        {err && <ErrorBanner err={err} />}
        <BottomNext onNext={next} label="Next: pick a cover" />
      </div>
    );
  }

  // ── STEP 3: Cover (placeholder gradient picker) ──
  if (step === 3) {
    return (
      <div style={shell}>
        {Header}
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
            Pick a cover
          </h1>
          <p
            style={{
              marginTop: 8,
              fontSize: 13.5,
              color: T.slate,
              lineHeight: 1.55,
            }}
          >
            Real image upload (with safety review) ships at Build-Award. For
            this preview, pick a tone that fits the cause.
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
              {CATEGORY_LABEL[category]}
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
              {title || "Your circle title"}
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
            Tone
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
              aria-label={`Cover tone ${i + 1}`}
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

        <BottomNext onNext={next} label="Next: organizer" />
      </div>
    );
  }

  // ── STEP 4: Organizer verification placeholder ──
  if (step === 4) {
    return (
      <div style={shell}>
        {Header}
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
            Verify yourself
          </h1>
          <p
            style={{
              marginTop: 8,
              fontSize: 13.5,
              color: T.slate,
              lineHeight: 1.55,
            }}
          >
            Real organizer verification (government ID, video selfie, recipient
            account confirmation) ships at Build-Award. This preview only
            mocks the screen so you can see the shape.
          </p>
        </div>

        <div style={{ padding: "18px 16px 0" }}>
          <Card>
            {[
              { ico: Ico.user, label: "Government ID", sub: "Photo + name match" },
              { ico: Ico.verify, label: "Selfie video", sub: "Liveness + face match" },
              { ico: Ico.shield, label: "Recipient account", sub: "Confirm payout account ownership" },
              { ico: Ico.globe, label: "Community vouch", sub: "Two existing Salapi users vouch" },
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
                  Build-Award
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
            <div>
              For this preview we skip verification. Your draft will be invited
              first at Build-Award launch and you&apos;ll go through the real
              verification then.
            </div>
          </div>
        </div>

        <BottomNext onNext={next} label="Next: share preview" />
      </div>
    );
  }

  // ── STEP 5: Share + waitlist signup ──
  return (
    <div style={shell}>
      {Header}
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
          Your circle preview is ready
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 13.5,
            color: T.slate,
            lineHeight: 1.55,
          }}
        >
          Drop your email and we&apos;ll invite you to launch your circle for
          real the moment Salapi Circles goes live at Build-Award.
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
            Share link (preview)
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
            Link is illustrative; real share URLs activate at Build-Award.
          </div>
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
              Invite me at launch
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
              Save my draft + invite me
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
              No money is charged. Your draft is saved as a launch waitlist
              entry.
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
                  Draft saved. We&apos;ll email you at launch.
                </div>
                <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>
                  Title, story, goal of {formatParts(pesoTarget, locale).symbol}
                  {formatParts(pesoTarget, locale).int}, duration {days} days.
                </div>
              </div>
            </div>
          </Card>
          <div style={{ paddingTop: 14 }}>
            <Btn kind="secondary" onClick={() => router.push("/circles")}>
              Back to Circles
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

function ErrorBanner({ err }: { err: string }) {
  return (
    <div
      style={{
        margin: "14px 16px 0",
        padding: "12px 14px",
        borderRadius: 12,
        background: "#FBEAE8",
        color: "#B91C1C",
        fontSize: 13,
        lineHeight: 1.4,
      }}
    >
      {err}
    </div>
  );
}

function BottomNext({ onNext, label }: { onNext: () => void; label: string }) {
  return (
    <div style={{ padding: "24px 16px 0" }}>
      <button
        type="button"
        onClick={onNext}
        style={{
          width: "100%",
          height: 52,
          borderRadius: 12,
          border: "none",
          background: "#2563EB",
          color: "#fff",
          fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
          fontWeight: 600,
          fontSize: 16,
          cursor: "pointer",
          boxShadow:
            "0 1px 2px rgba(11,18,32,.06), 0 6px 16px -6px rgba(37,99,235,.55)",
        }}
      >
        {label}
      </button>
    </div>
  );
}
