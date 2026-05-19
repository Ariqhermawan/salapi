"use client";

// Salapi — Learn article. Faithful port of V4 salapi/learn.jsx LearnArticle,
// adapted to the web screen pattern (global BottomNav; no own TabBar).

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { T, Ico, AppBar, IconButton, PoweredByStellar } from "@/components/ui/kit";
import { SalapiMascot, type MascotPose } from "@/components/ui/mascot";
import { spot, HeroFund, HeroCircle, HeroGrow, DooStars } from "@/components/ui/doodles";
import { useT } from "@/components/I18nProvider";
import { LEARN, LEARN_X, type LearnTopicId } from "@/lib/learn-content";

const CREAM = "#FAF6EE";
const POSE: Record<LearnTopicId, MascotPose> = { fund: "point", circle: "wave", grow: "cheer" };
const TOPIC_SPOTS: Record<LearnTopicId, [string, string, string]> = {
  fund: ["storm", "ledger", "magnify"],
  circle: ["handshake", "calendar", "padlock"],
  grow: ["vault", "sprout", "flag"],
};
const CTA_ROUTE: Record<LearnTopicId, string> = {
  fund: "/transparency",
  circle: "/paluwagan",
  grow: "/savings",
};

function Paragraph({ children, dense = false }: { children: ReactNode; dense?: boolean }) {
  return (
    <p style={{ margin: dense ? 0 : "14px 0 0", fontSize: 13.5, lineHeight: 1.6, color: T.ink }}>
      {children}
    </p>
  );
}

function Spotted({ doodle, children }: { doodle: ReactNode; children: ReactNode }) {
  return (
    <div style={{ marginTop: 14, display: "flex", alignItems: "flex-start", gap: 14 }}>
      <div style={{ flex: "0 0 auto", width: 48, paddingTop: 2, transform: "rotate(-3deg)" }}>{doodle}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Paragraph dense>{children}</Paragraph>
      </div>
    </div>
  );
}

function PromiseCard({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 18,
        padding: "14px 16px",
        borderRadius: 12,
        background: T.actionTint,
        color: T.ink,
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <div style={{ width: 4, alignSelf: "stretch", background: T.action, borderRadius: 99, flex: "0 0 auto" }} />
      <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.5, color: T.ink }}>{children}</div>
    </div>
  );
}

function TestnetStrip() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        background: T.warnTint,
        borderRadius: 10,
        boxShadow: "inset 0 0 0 1px rgba(180,83,9,0.22)",
        color: T.warn,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 99, background: T.warn, flex: "0 0 auto" }} />
      <span style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase" }}>
        Testnet version
      </span>
      <span style={{ flex: 1, height: 1, background: T.warn, opacity: 0.2 }} />
      <span style={{ fontSize: 11.5, fontWeight: 500, opacity: 0.85, letterSpacing: "-0.005em" }}>
        Real funds arrive at mainnet launch.
      </span>
    </div>
  );
}

function HowItWorks({
  heading,
  steps,
}: {
  heading: string;
  steps: { t: string; s: string; doodle: ReactNode }[];
}) {
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.slate }}>
        {heading}
      </div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {steps.map((st, i) => (
          <div
            key={i}
            style={{
              background: T.surface,
              borderRadius: 12,
              padding: "12px 14px",
              boxShadow: "inset 0 0 0 1px " + T.hairline,
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div style={{ flex: "0 0 auto", width: 40, display: "flex", justifyContent: "center" }}>{st.doodle}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{st.t}</div>
              <div style={{ fontSize: 11, color: T.slate, marginTop: 1, lineHeight: 1.4 }}>{st.s}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LearnCTA({
  label,
  sub,
  doodle,
  onClick,
}: {
  label: string;
  sub: string;
  doodle: ReactNode;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        marginTop: 18,
        background: T.action,
        color: "#fff",
        borderRadius: 14,
        padding: "16px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        cursor: "pointer",
        boxShadow: "0 8px 24px -10px rgba(37,99,235,.6)",
      }}
    >
      <div style={{ flex: "0 0 auto" }}>{doodle}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{label}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{sub}</div>
      </div>
      {Ico.chev({ c: "#fff", size: 18 })}
    </div>
  );
}

function DoodleHero({ topic, pose }: { topic: LearnTopicId; pose: MascotPose }) {
  return (
    <div
      style={{
        background: CREAM,
        borderRadius: 16,
        padding: "18px 22px 14px",
        boxShadow: "inset 0 0 0 1px " + T.hairline,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0 25px, rgba(11,18,32,0.04) 25px 26px)",
        }}
      />
      <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
        {topic === "fund" && <HeroFund width={260} />}
        {topic === "circle" && <HeroCircle width={260} />}
        {topic === "grow" && <HeroGrow width={260} />}
      </div>
      <div style={{ position: "absolute", right: 14, bottom: 8, transform: "rotate(-6deg)" }}>
        <SalapiMascot size={46} c={T.ink} pose={pose} />
      </div>
    </div>
  );
}

export default function LearnArticleScreen({ topic }: { topic: LearnTopicId }) {
  const router = useRouter();
  const { locale } = useT();
  const L = LEARN[locale] ?? LEARN.en;
  const X = LEARN_X[locale] ?? LEARN_X.en;
  const fontStack = locale === "vi" ? T.fontUni : T.fontSans;
  const head = topic === "fund" ? L.fund : topic === "circle" ? L.circle : L.grow;
  const xtopic = X[topic];
  const sp = TOPIC_SPOTS[topic];

  let body: ReactNode = null;
  if (topic === "fund") {
    const d = L.fund;
    body = (
      <>
        <Spotted doodle={spot(sp[0], { size: 44 })}>{d.p1}</Spotted>
        <Spotted doodle={spot(sp[1], { size: 44 })}>{d.p2}</Spotted>
        <Spotted doodle={spot(sp[2], { size: 44 })}>{d.p3}</Spotted>
        <PromiseCard>{d.promise}</PromiseCard>
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {d.stats.map((s) => (
            <div key={s.k} style={{ background: T.canvas, borderRadius: 12, padding: "12px 12px" }}>
              <div style={{ fontSize: 10, color: T.slate, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {s.k}
              </div>
              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, fontFamily: T.fontMono, color: T.ink }}>{s.v}</div>
            </div>
          ))}
        </div>
      </>
    );
  } else if (topic === "circle") {
    const d = L.circle;
    body = (
      <>
        <Spotted doodle={spot(sp[0], { size: 44 })}>{d.p1}</Spotted>
        <div style={{ margin: "16px 0 4px", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
          {d.glossary.map((gl) => (
            <div
              key={gl.lang}
              style={{ background: CREAM, borderRadius: 10, padding: "10px 8px", textAlign: "center", boxShadow: "inset 0 0 0 1px " + T.hairline }}
            >
              <div style={{ fontFamily: T.fontMono, fontSize: 10, color: T.slate, fontWeight: 600 }}>{gl.lang}</div>
              <div style={{ marginTop: 2, fontSize: 12.5, fontWeight: 600 }}>{gl.word}</div>
            </div>
          ))}
        </div>
        <Spotted doodle={spot(sp[1], { size: 46 })}>{d.p2}</Spotted>
        <Spotted doodle={spot(sp[2], { size: 44 })}>{d.p3}</Spotted>
        <PromiseCard>{d.promise}</PromiseCard>
      </>
    );
  } else {
    const d = L.grow;
    body = (
      <>
        <Spotted doodle={spot(sp[0], { size: 48 })}>{d.p1}</Spotted>
        <Spotted doodle={spot(sp[1], { size: 44 })}>{d.p2}</Spotted>
        <div
          style={{
            marginTop: 16,
            background: T.ink,
            color: "#fff",
            borderRadius: 14,
            padding: "16px 18px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", right: -6, top: -6, opacity: 0.6 }}>
            <DooStars width={140} c="#fff" />
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)", fontFamily: T.fontMono }}>
            {d.apy.label}
          </div>
          <div style={{ marginTop: 4, fontFamily: T.fontMono, fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>
            {d.apy.value}
          </div>
        </div>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
          {d.stack.map((s, i) => (
            <div
              key={s.t}
              style={{
                background: T.surface,
                borderRadius: 12,
                padding: "12px 14px",
                boxShadow: "inset 0 0 0 1px " + T.hairline,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 99,
                  background: i === 0 ? T.actionTint : i === 1 ? T.warnTint : T.moneyInTint,
                  color: i === 0 ? T.action : i === 1 ? T.warn : T.moneyIn,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: T.fontMono,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.t}</div>
                <div style={{ fontSize: 11, color: T.slate, marginTop: 1, lineHeight: 1.4 }}>{s.s}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: "0 0 auto", transform: "rotate(-6deg)" }}>{spot(sp[2], { size: 48 })}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Paragraph dense>{d.p3}</Paragraph>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <TestnetStrip />
        </div>
        <PromiseCard>{d.promise}</PromiseCard>
      </>
    );
  }

  return (
    <div style={{ fontFamily: fontStack, color: T.ink, minHeight: "100%", paddingBottom: 110 }}>
      <AppBar
        leading={<IconButton onClick={() => router.push("/learn")}>{Ico.back({})}</IconButton>}
        title={L.indexEyebrow}
      />
      <div style={{ padding: "4px 16px 16px" }}>
        <DoodleHero topic={topic} pose={POSE[topic]} />
      </div>
      <div style={{ padding: "0 20px 8px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: T.action, fontFamily: T.fontMono }}>
          {head.eyebrow}
        </div>
        <div style={{ marginTop: 8, fontSize: 21, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
          {head.title}
        </div>
        <div style={{ marginTop: 12, fontSize: 15, fontStyle: "italic", color: T.slate, fontWeight: 500, lineHeight: 1.45 }}>
          {head.lede}
        </div>
      </div>
      <div style={{ padding: "0 20px 16px" }}>
        {body}
        <HowItWorks
          heading={X.howHeading}
          steps={xtopic.steps.map((st) => ({ t: st.t, s: st.s, doodle: spot(st.icon, { size: 32 }) }))}
        />
        <LearnCTA
          label={xtopic.cta.label}
          sub={xtopic.cta.sub}
          doodle={spot(xtopic.cta.icon, { size: 30, accent: "#fff" })}
          onClick={() => router.push(CTA_ROUTE[topic])}
        />
        <div style={{ marginTop: 24, textAlign: "center" }}>
          <PoweredByStellar />
        </div>
      </div>
    </div>
  );
}
