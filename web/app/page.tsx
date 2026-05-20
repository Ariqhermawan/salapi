"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { walletState, myUsername } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import {
  T,
  Ico,
  Card,
  Chip,
  Btn,
  Avatar,
  Money,
  IconButton,
  TestnetPill,
  PoweredByStellar,
} from "@/components/ui/kit";

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

  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink }}>
      {/* Greeting */}
      <div
        style={{
          padding: "16px 20px 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name="Salapi" size={38} />
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
        <div style={{ display: "flex", gap: 8 }}>
          <IconButton onClick={go("/learn")}>{Ico.bulb({})}</IconButton>
          <IconButton onClick={go("/activity")}>{Ico.bell({})}</IconButton>
          <IconButton onClick={go("/receive")}>{Ico.qr({})}</IconButton>
        </div>
      </div>

      {/* Balance card */}
      <div style={{ padding: "8px 16px 16px" }}>
        <div
          style={{
            borderRadius: 20,
            background: T.ink,
            color: "#fff",
            padding: "22px 22px 20px",
            boxShadow: "0 18px 40px -16px rgba(11,18,32,0.4)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: -28,
              top: -28,
              width: 140,
              height: 140,
              opacity: 0.06,
            }}
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
                fontSize: 11,
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
          <div className="sl-rise" style={{ marginTop: 10 }}>
            <Money value={pesos} size={38} color="#fff" />
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "rgba(255,255,255,0.55)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
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
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <button
              onClick={go("/topup")}
              style={{
                height: 44,
                borderRadius: 12,
                border: "none",
                background: "#fff",
                color: T.ink,
                fontFamily: T.fontSans,
                fontWeight: 600,
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              {Ico.arrowDown({ c: T.action })} {t("wallet.topup")}
            </button>
            <button
              onClick={go("/withdraw")}
              style={{
                height: 44,
                borderRadius: 12,
                border: "none",
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                fontFamily: T.fontSans,
                fontWeight: 600,
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
                cursor: "pointer",
              }}
            >
              {Ico.arrowUp({ c: "#fff" })} {t("wallet.withdraw")}
            </button>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ padding: "0 16px 16px" }}>
        <div
          style={{
            background: T.surface,
            borderRadius: T.rCard,
            padding: "8px 0",
            boxShadow: "inset 0 0 0 1px " + T.hairline,
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
          }}
        >
          {[
            { ico: Ico.send, label: t("wallet.send"), to: "/send" },
            { ico: Ico.qr, label: t("wallet.receive"), to: "/receive" },
            { ico: Ico.vault, label: t("wallet.vaults"), to: "/vaults" },
            { ico: Ico.activity, label: t("nav.activity"), to: "/activity" },
          ].map((it) => (
            <div
              key={it.label}
              onClick={go(it.to)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px 4px",
                gap: 6,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  background: T.actionTint,
                  color: T.action,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {it.ico({ size: 20, c: T.action })}
              </div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{it.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Zone 1: LIVE TODAY (day-30 features verifiable on Stellar testnet) */}
      <div style={{ padding: "0 16px" }}>
        <div
          style={{
            fontSize: 11,
            color: T.slate,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "4px 4px 10px",
          }}
        >
          {t("home.zoneLive")}
        </div>
        <Card p={0} style={{ overflow: "hidden", marginBottom: 10 }}>
          <div style={{ padding: "18px 18px 16px" }}>
            <Chip kind="action" leading={Ico.star({ size: 11, c: T.action })}>
              {t("pal.kicker")}
            </Chip>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                marginTop: 12,
                lineHeight: 1.3,
              }}
            >
              {t("home.palTitle")}
            </div>
            <div
              style={{
                fontSize: 13,
                color: T.slate,
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              {t("home.palDesc")}
            </div>
            <div style={{ marginTop: 14 }}>
              <Btn
                kind="primary"
                size="md"
                full={false}
                onClick={go("/paluwagan")}
                trailing={Ico.chev({ c: "#fff" })}
              >
                {t("home.palCta")}
              </Btn>
            </div>
          </div>
        </Card>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <Card
            p={16}
            onClick={go("/savings")}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 130,
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                background: T.moneyInTint,
                color: T.moneyIn,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {Ico.shield({ c: T.moneyIn })}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
              {t("home.savTitle")}
            </div>
            <div style={{ fontSize: 11, color: T.slate, lineHeight: 1.4 }}>
              {t("home.savDesc")}
            </div>
          </Card>
          <Card
            p={16}
            onClick={go("/transparency")}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 130,
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                background: T.warnTint,
                color: T.warn,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {Ico.shield({ c: T.warn })}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
              {t("home.disTitle")}
            </div>
            <div style={{ fontSize: 11, color: T.slate, lineHeight: 1.4 }}>
              {t("home.disDesc")}
            </div>
          </Card>
        </div>
      </div>

      {/* Zone 2: VISION · BUILD-AWARD (preview surfaces, NOT on-chain today).
          Visually paired with the LIVE TODAY zone above via a wider top
          margin and an indigo accent dot on the header so the reader knows
          they have crossed a tier without being shouted at. Every card in
          this zone must continue to carry its own "Preview · Build-Award"
          badge (the Salapi Circles card already does). */}
      <div style={{ padding: "22px 16px 0" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 4px 10px",
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

        {/* Salapi Circles teaser. Visual unchanged from its previous bottom-
            of-page position; only its location and its body/badge strings
            (now from the dictionary) are updated. Tap routes to /circles
            which carries the persistent Preview pill + info modal. */}
        <Card
          p={0}
          style={{
            overflow: "hidden",
            cursor: "pointer",
            background: "linear-gradient(160deg,#fff 0%, #FBF1E0 110%)",
          }}
          onClick={go("/circles")}
        >
          <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: "#fff",
                color: T.warn,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "inset 0 0 0 1px " + T.hairline,
              }}
            >
              {Ico.globe({ c: T.warn, size: 22 })}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>Salapi Circles</div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    padding: "2px 7px",
                    borderRadius: 99,
                    background: T.warnTint,
                    color: T.warn,
                  }}
                >
                  {t("home.circlesBadge")}
                </span>
              </div>
              <div style={{ fontSize: 12, color: T.slate, marginTop: 3, lineHeight: 1.4 }}>
                {t("home.circlesDesc")}
              </div>
            </div>
            <span style={{ color: T.slate, flex: "0 0 auto" }}>{Ico.chev({ c: T.slate })}</span>
          </div>
        </Card>

        {/* Operational Allowance preview card lands here when /circles
            Operational Allowance build merges. Keep this comment until a
            teaser card component for the OA flow exists (the parallel
            session ships /circles/[id]/manage and /you/kyc-tier; if they
            later expose an OA home-page teaser, render it as the second
            card in this zone). */}
      </div>

      <div style={{ padding: "24px 16px 28px", textAlign: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
