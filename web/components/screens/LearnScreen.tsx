"use client";

// Salapi, Learn index. Faithful port of V4 salapi/learn.jsx LearnIndex,
// adapted to the web screen pattern (global BottomNav; no own TabBar).

import { useRouter } from "next/navigation";
import { T, Ico, AppBar, IconButton, TestnetPill, PoweredByStellar } from "@/components/ui/kit";
import { SalapiMascot } from "@/components/ui/mascot";
import { HeroFund, HeroCircle, HeroGrow } from "@/components/ui/doodles";
import { useT } from "@/components/I18nProvider";
import { LEARN, type LearnTopicId } from "@/lib/learn-content";
import { useGoBack } from "@/lib/ui/useGoBack";

const CREAM = "#FAF6EE";

function HeroThumb({ id, width = 78 }: { id: LearnTopicId; width?: number }) {
  if (id === "fund") return <HeroFund width={width} />;
  if (id === "circle") return <HeroCircle width={width} />;
  return <HeroGrow width={width} />;
}

export default function LearnScreen() {
  const router = useRouter();
  const goBack = useGoBack("/");
  const { locale } = useT();
  const L = LEARN[locale] ?? LEARN.en;
  const fontStack = locale === "vi" ? T.fontUni : T.fontSans;

  return (
    <div style={{ fontFamily: fontStack, color: T.ink, minHeight: "100%", paddingBottom: 110 }}>
      <AppBar
        leading={<IconButton onClick={goBack}>{Ico.back({})}</IconButton>}
        title={L.indexEyebrow}
        trailing={<TestnetPill />}
      />

      {/* Mascot intro, notebook-cream so Learn feels warmer than the rest */}
      <div style={{ padding: "4px 16px 10px" }}>
        <div
          style={{
            background: CREAM,
            color: T.ink,
            borderRadius: 16,
            padding: "14px 14px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            position: "relative",
            overflow: "hidden",
            boxShadow: "inset 0 0 0 1px " + T.hairline,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              backgroundImage:
                "repeating-linear-gradient(to bottom, transparent 0 23px, rgba(11,18,32,0.045) 23px 24px)",
            }}
          />
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: T.action, fontFamily: T.fontMono }}>
              {L.indexEyebrow}
            </div>
            <div style={{ marginTop: 4, fontSize: 17, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.22 }}>
              {L.indexTitle}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: T.slate, lineHeight: 1.45 }}>{L.indexSub}</div>
          </div>
          <div style={{ position: "relative", flex: "0 0 auto", transform: "rotate(-4deg)" }}>
            <SalapiMascot size={54} c={T.ink} pose="wave" />
          </div>
        </div>
      </div>

      {/* Topic cards */}
      <div style={{ padding: "0 16px 4px", display: "flex", flexDirection: "column", gap: 8 }}>
        {L.cards.map((card) => (
          <div
            key={card.id}
            onClick={() => router.push(`/learn/${card.id}`)}
            style={{
              background: T.surface,
              borderRadius: T.rCard,
              boxShadow: "inset 0 0 0 1px " + T.hairline,
              padding: "12px 12px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: 72,
                height: 56,
                borderRadius: 10,
                background: CREAM,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "0 0 auto",
                overflow: "hidden",
                boxShadow: "inset 0 0 0 1px " + T.hairline,
              }}
            >
              <HeroThumb id={card.id} width={68} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.fontMono, fontSize: 10, color: T.action, fontWeight: 600, letterSpacing: "0.06em" }}>
                {card.kicker}
              </div>
              <div style={{ marginTop: 2, fontSize: 13.5, fontWeight: 600, lineHeight: 1.25 }}>{card.title}</div>
              <div style={{ marginTop: 3, fontSize: 11, color: T.slate, lineHeight: 1.4 }}>{card.blurb}</div>
              <div style={{ marginTop: 4, fontFamily: T.fontMono, fontSize: 10, color: T.slate, letterSpacing: 0.02 }}>
                {card.mins}
                {L.readTime}
              </div>
            </div>
            <div style={{ color: T.slate, flex: "0 0 auto" }}>{Ico.chev({ c: T.slate, size: 18 })}</div>
          </div>
        ))}
        <div style={{ padding: "10px 4px 0", textAlign: "center" }}>
          <PoweredByStellar />
        </div>
      </div>
    </div>
  );
}
