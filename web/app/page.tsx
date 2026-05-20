"use client";

// Salapi homepage. Mobile-first density: the full home (header + balance +
// LIVE TODAY 2x2 tile grid + VISION compact tile + powered-by) is designed
// to fit an iPhone 14 viewport (390x844) without scroll. Quick Actions row
// was removed because every action it offered duplicated either the
// BottomNav (Vaults, Activity), the FAB (Send), or the header QR icon
// (Receive). The 2x2 tile grid + a single compact VISION tile compresses
// what was ~370px of LIVE TODAY plus a separate ~96px Circles teaser into
// a single tighter rhythm.
//
// Tier honesty preserved: LIVE TODAY tiles route to day-30 features only
// (no Preview badge). The VISION tile carries its "Preview, Build-Award"
// badge unchanged. Operational Allowance teaser slot is a comment marker
// for the parallel session to fill in.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { walletState, myUsername } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import {
  T,
  Ico,
  Card,
  Avatar,
  Money,
  IconButton,
  TestnetPill,
  PoweredByStellar,
} from "@/components/ui/kit";

type IconFn = (p?: { size?: number; c?: string }) => React.ReactNode;

type LiveTile = {
  key: string;
  ico: IconFn;
  bg: string;
  fg: string;
  titleKey: string;
  to: string;
};

export default function Home() {
  const { t } = useT();
  const router = useRouter();
  const [pesos, setPesos] = useState(0);
  const [handle, setHandle] = useState("");

  useEffect(() => {
    walletState().then((s) => {
      setPesos(s.pesos);
      setHandle(`${s.address.slice(0, 4)}…${s.address.slice(-4)}`);
    });
    myUsername().then((u) => u && setHandle("@" + u));
  }, []);

  const go = (p: string) => () => router.push(p);

  // LIVE TODAY 2x2 grid. Each tile = icon + short label. The full screens
  // (Paluwagan, Savings, Disaster, Send) carry the longer descriptions. The
  // 4th tile (Send by @username) is a day-30 feature surfaced as a tile
  // because the user already removed Quick Actions row.
  const liveTiles: LiveTile[] = [
    {
      key: "pal",
      ico: Ico.star,
      bg: T.actionTint,
      fg: T.action,
      titleKey: "home.tilePal",
      to: "/paluwagan",
    },
    {
      key: "sav",
      ico: Ico.shield,
      bg: T.moneyInTint,
      fg: T.moneyIn,
      titleKey: "home.tileSav",
      to: "/savings",
    },
    {
      key: "dis",
      ico: Ico.shield,
      bg: T.warnTint,
      fg: T.warn,
      titleKey: "home.tileDis",
      to: "/transparency",
    },
    {
      key: "send",
      ico: Ico.send,
      bg: T.actionTint,
      fg: T.action,
      titleKey: "home.tileSend",
      to: "/send",
    },
  ];

  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink }}>
      {/* Greeting - tighter padding for mobile density. */}
      <div
        style={{
          padding: "12px 16px 4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name="Salapi" size={34} />
          <div>
            <div style={{ fontSize: 11, color: T.slate, fontWeight: 500 }}>
              {t("home.greeting")}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              Salapi{" "}
              <span style={{ color: T.slate, fontWeight: 500 }}>
                · {handle || "…"}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <IconButton onClick={go("/learn")}>{Ico.bulb({})}</IconButton>
          <IconButton onClick={go("/activity")}>{Ico.bell({})}</IconButton>
          <IconButton onClick={go("/receive")}>{Ico.qr({})}</IconButton>
        </div>
      </div>

      {/* Balance card - compressed: smaller numeral (28 vs 38), tighter
          padding, 40px buttons (was 44). Still tap-friendly and readable. */}
      <div style={{ padding: "8px 16px 12px" }}>
        <div
          style={{
            borderRadius: 18,
            background: T.ink,
            color: "#fff",
            padding: "14px 16px 14px",
            boxShadow: "0 14px 32px -16px rgba(11,18,32,0.4)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: -24,
              top: -24,
              width: 110,
              height: 110,
              opacity: 0.06,
            }}
            aria-hidden
          >
            <svg viewBox="0 0 100 100">
              <path
                d="M50 5 L55 45 L95 50 L55 55 L50 95 L45 55 L5 50 L45 45 Z"
                fill="#fff"
              />
            </svg>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.55)",
              }}
            >
              {t("wallet.balance")}
            </div>
            <TestnetPill />
          </div>
          <div className="sl-rise" style={{ marginTop: 6 }}>
            <Money value={pesos} size={28} color="#fff" />
          </div>
          <div
            style={{
              marginTop: 5,
              fontSize: 11,
              color: "rgba(255,255,255,0.55)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: T.moneyIn,
              }}
            />
            {t("wallet.live")} · {t("wallet.cryptoInvisible")}
          </div>
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            <button
              onClick={go("/topup")}
              style={{
                height: 40,
                borderRadius: 11,
                border: "none",
                background: "#fff",
                color: T.ink,
                fontFamily: T.fontSans,
                fontWeight: 600,
                fontSize: 13.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                cursor: "pointer",
              }}
            >
              {Ico.arrowDown({ c: T.action, size: 16 })} {t("wallet.topup")}
            </button>
            <button
              onClick={go("/withdraw")}
              style={{
                height: 40,
                borderRadius: 11,
                border: "none",
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                fontFamily: T.fontSans,
                fontWeight: 600,
                fontSize: 13.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
                cursor: "pointer",
              }}
            >
              {Ico.arrowUp({ c: "#fff", size: 16 })} {t("wallet.withdraw")}
            </button>
          </div>
        </div>
      </div>

      {/* Quick Actions row removed. Send is the FAB in BottomNav. Vaults
          and Activity also live in BottomNav. Receive (QR) is the rightmost
          icon in the greeting header above. Keeping a Quick Actions row was
          ~80px of vertical waste duplicating those entry points. */}

      {/* Zone 1: LIVE TODAY - 2x2 compact tile grid of day-30 features. */}
      <div style={{ padding: "0 16px" }}>
        <div
          style={{
            fontSize: 11,
            color: T.slate,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "2px 4px 8px",
          }}
        >
          {t("home.zoneLive")}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          {liveTiles.map((tile) => (
            <Card
              key={tile.key}
              p={12}
              onClick={go(tile.to)}
              style={{
                cursor: "pointer",
                minHeight: 84,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: tile.bg,
                  color: tile.fg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-hidden
              >
                {tile.ico({ size: 18, c: tile.fg })}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  lineHeight: 1.25,
                  color: T.ink,
                }}
              >
                {t(tile.titleKey)}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Zone 2: VISION, BUILD-AWARD - compact tile mirroring LIVE TODAY's
          shape so the eye reads them as the same kind of object, just in a
          different tier. The indigo accent dot on the header signals the
          tier change without shouting. Every tile in this zone carries its
          own "Preview, Build-Award" badge. */}
      <div style={{ padding: "14px 16px 0" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "2px 4px 8px",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: 99,
              background: T.action,
            }}
          />
          <div
            style={{
              fontSize: 11,
              color: T.slate,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {t("home.zoneVision")}
          </div>
        </div>

        {/* Salapi Circles tile (full-width). Mirrors the LIVE TODAY tile
            shape vertically; carries its own "Preview, Build-Award" badge
            so the tier is unmistakable.
            When the parallel /circles Operational Allowance build adds its
            own home-page teaser tile, swap this wrapper for a 2-col grid
            and drop the OA tile as the second cell. Marker: `Operational
            Allowance tile lands here when /circles Operational Allowance
            build merges.` */}
        <Card
          p={14}
          onClick={go("/circles")}
          style={{
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "linear-gradient(160deg,#fff 0%, #FBF1E0 110%)",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              background: "#fff",
              color: T.warn,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "inset 0 0 0 1px " + T.hairline,
              flex: "0 0 auto",
            }}
            aria-hidden
          >
            {Ico.globe({ size: 18, c: T.warn })}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                lineHeight: 1.25,
                color: T.ink,
              }}
            >
              {t("home.tileCircles")}
            </div>
          </div>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "3px 7px",
              borderRadius: 99,
              background: T.warnTint,
              color: T.warn,
              whiteSpace: "nowrap",
              flex: "0 0 auto",
            }}
          >
            {t("home.circlesBadge")}
          </span>
        </Card>
      </div>

      <div style={{ padding: "14px 16px 16px", textAlign: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
