"use client";

// Salapi homepage, V2 "Amanah" (trust-forward). The SOW names Disaster Vault
// the hero and "visible trust" the product thesis.
//
// LIVE TODAY block: all four day-30 features in one compact two-column row,
// the Disaster Vault hero card on the left and the other three features as a
// stacked column on the right. Keeping that block short lets the Salapi
// Circles VISION zone surface sooner.
//
// Honesty: the hero shows only real data from disasterState(). LIVE TODAY
// routes to day-30 features only; the Circles zone stays VISION / PREVIEW.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { walletState, myUsername, disasterState } from "@/app/actions";
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
import CirclesHomeStrip from "@/components/CirclesHomeStrip";

type IconFn = (p?: { size?: number; c?: string }) => React.ReactNode;
type Dis = Awaited<ReturnType<typeof disasterState>>;

type LiveTile = {
  key: string;
  ico: IconFn;
  bg: string;
  fg: string;
  titleKey: string;
  subKey: string;
  to: string;
};

export default function Home() {
  const { t } = useT();
  const router = useRouter();
  const [pesos, setPesos] = useState(0);
  const [handle, setHandle] = useState("");
  const [dis, setDis] = useState<Dis | null>(null);

  useEffect(() => {
    walletState().then((s) => {
      setPesos(s.pesos);
      setHandle(`${s.address.slice(0, 4)}…${s.address.slice(-4)}`);
    });
    myUsername().then((u) => u && setHandle("@" + u));
    // If the disaster read comes back not-ok (it shares the RPC with the
    // reads above), retry once so the pool figure recovers.
    disasterState().then((d) => {
      setDis(d);
      if (!d.ok) setTimeout(() => disasterState().then(setDis), 700);
    });
  }, []);

  const go = (p: string) => () => router.push(p);

  const disReady = !!dis && dis.ok;
  const disRaised =
    dis && dis.ok ? Number(dis.pesoLabel.replace(/[^0-9.]/g, "")) || 0 : 0;
  const disActive = dis && dis.ok ? dis.active : false;

  // The three day-30 features besides Disaster Vault (which owns the hero
  // card). Each carries a one-line "what it is" descriptor.
  const liveTiles: LiveTile[] = [
    {
      key: "pal",
      ico: Ico.star,
      bg: T.actionTint,
      fg: T.action,
      titleKey: "home.tilePal",
      subKey: "home.tilePalSub",
      to: "/paluwagan",
    },
    {
      key: "sav",
      ico: Ico.shield,
      bg: T.moneyInTint,
      fg: T.moneyIn,
      titleKey: "home.tileSav",
      subKey: "home.tileSavSub",
      to: "/savings",
    },
    {
      key: "send",
      ico: Ico.send,
      bg: T.actionTint,
      fg: T.action,
      titleKey: "home.tileSend",
      subKey: "home.tileSendSub",
      to: "/send",
    },
  ];

  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink }}>
      {/* Greeting */}
      <div
        style={{
          padding: "10px 16px 2px",
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
          <IconButton ariaLabel="Learn" onClick={go("/learn")}>{Ico.bulb({})}</IconButton>
          <IconButton ariaLabel="Activity" onClick={go("/activity")}>{Ico.bell({})}</IconButton>
          <IconButton ariaLabel="Receive" onClick={go("/receive")}>{Ico.qr({})}</IconButton>
        </div>
      </div>

      {/* Balance card */}
      <div style={{ padding: "6px 16px 0" }}>
        <div
          style={{
            borderRadius: 18,
            background: T.ink,
            color: "#fff",
            padding: "12px 16px 12px",
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

      {/* LIVE TODAY - all four day-30 features in one compact two-column row.
          Left: the Disaster Vault hero (real on-chain data). Right: the other
          three features stacked. Whole hero card taps the public dashboard. */}
      <div style={{ padding: "12px 16px 0" }}>
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
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          {/* Disaster Vault hero, left column */}
          <div
            onClick={go("/transparency")}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              cursor: "pointer",
              borderRadius: 16,
              padding: "12px 12px",
              background: "linear-gradient(160deg,#FFFDF8,#FBEBD3)",
              boxShadow: "inset 0 0 0 1px #F0DCB8",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontFamily: T.fontMono,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.09em",
                    textTransform: "uppercase",
                    color: T.warn,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 99,
                      background: T.warn,
                      boxShadow: "0 0 0 3px rgba(180,83,9,0.18)",
                    }}
                  />
                  {disReady
                    ? disActive
                      ? t("vaults.statusActive")
                      : t("vaults.statusStandby")
                    : "…"}
                </div>
                <div aria-hidden>{Ico.shield({ size: 15, c: T.warn })}</div>
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  color: T.ink,
                  lineHeight: 1.25,
                }}
              >
                {t("transparency.poolName")}
              </div>
              <div
                style={{
                  marginTop: 5,
                  display: "flex",
                  alignItems: "baseline",
                  gap: 5,
                  flexWrap: "wrap",
                }}
              >
                {disReady ? (
                  <Money value={disRaised} size={19} usdc={false} />
                ) : (
                  <span
                    style={{ fontSize: 19, fontWeight: 600, color: T.slate }}
                  >
                    …
                  </span>
                )}
                <span style={{ fontSize: 11, color: T.slate }}>
                  {t("home.disHeroRaised")}
                </span>
              </div>
              <div
                style={{
                  marginTop: 7,
                  fontSize: 10.5,
                  color: T.slate,
                  lineHeight: 1.4,
                }}
              >
                {t("home.disHeroTrust")}
              </div>
            </div>
            <div
              style={{ fontSize: 11.5, fontWeight: 600, color: T.action }}
            >
              {t("home.disHeroCta")} ›
            </div>
          </div>

          {/* The three other day-30 features, stacked, right column */}
          <div
            style={{
              flex: "1 1 0",
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {liveTiles.map((tile) => (
              <div
                key={tile.key}
                onClick={go(tile.to)}
                style={{
                  flex: "1 1 0",
                  cursor: "pointer",
                  background: tile.bg,
                  borderRadius: 12,
                  padding: "9px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 9,
                    background: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 6px -2px rgba(11,18,32,0.12)",
                    flex: "0 0 auto",
                  }}
                  aria-hidden
                >
                  {tile.ico({ size: 17, c: tile.fg })}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      lineHeight: 1.2,
                      color: T.ink,
                    }}
                  >
                    {t(tile.titleKey)}
                  </div>
                  <div
                    style={{
                      marginTop: 1,
                      fontSize: 9.5,
                      color: T.slate,
                      lineHeight: 1.3,
                    }}
                  >
                    {t(tile.subKey)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Zone 2: VISION, BUILD-AWARD - Salapi Circles showcase card + a live
          preview strip of the /circles feed. Honesty kept by the VISION
          header and the Preview, Build-Award badge. */}
      <div style={{ padding: "11px 16px 0" }}>
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

        <Card
          p={13}
          onClick={go("/circles")}
          style={{
            cursor: "pointer",
            background: "linear-gradient(160deg,#fff 0%, #FBF1E0 120%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "stretch", gap: 11 }}>
            <div
              style={{
                width: 38,
                height: 38,
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
              {Ico.globe({ size: 19, c: T.warn })}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>
                {t("home.tileCircles")}
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 11.5,
                  color: T.slate,
                  lineHeight: 1.4,
                }}
              >
                {t("home.circlesDesc")}
              </div>
            </div>
            {/* Right rail: the Preview badge pinned top, the "see all" link
                pinned bottom. Pulling the link up here lets CirclesHomeStrip
                drop its own footer link so the home fits one screen. */}
            <div
              style={{
                flex: "0 0 auto",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 6,
              }}
            >
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
                }}
              >
                {t("home.circlesBadge")}
              </span>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: T.action,
                  whiteSpace: "nowrap",
                }}
              >
                {t("home.circlesSeeAll")} ›
              </span>
            </div>
          </div>
        </Card>

        <CirclesHomeStrip />
      </div>

      <div style={{ padding: "10px 20px 10px", textAlign: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
