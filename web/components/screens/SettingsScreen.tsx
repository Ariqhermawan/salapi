"use client";

import { useEffect, useState } from "react";
import { myUsername, walletState } from "@/app/actions";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import {
  T,
  Ico,
  AppBar,
  Card,
  Row,
  Avatar,
  Chip,
  TestnetPill,
  PoweredByStellar,
  MakerLockup,
} from "@/components/ui/kit";

function Switch({ on }: { on: boolean }) {
  return (
    <div
      style={{
        width: 42,
        height: 24,
        borderRadius: 99,
        background: on ? T.action : T.hairline,
        padding: 2,
        display: "flex",
        justifyContent: on ? "flex-end" : "flex-start",
      }}
    >
      <div style={{ width: 20, height: 20, borderRadius: 99, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.18)" }} />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "16px 24px 8px", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>
      {children}
    </div>
  );
}

export default function SettingsScreen() {
  const [name, setName] = useState<string | null>(null);
  const [addr, setAddr] = useState<string>("");

  useEffect(() => {
    myUsername().then(setName);
    walletState().then((w) => setAddr(w.address));
  }, []);

  const display = name ? `@${name}` : "Salapi user";
  const shortAddr = addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : "—";
  const explorer = addr
    ? `https://stellar.expert/explorer/testnet/account/${addr}`
    : undefined;

  const iconBox = (icon: React.ReactNode, bg: string, fg: string) => (
    <div style={{ width: 34, height: 34, borderRadius: 10, background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {icon}
    </div>
  );

  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%", paddingBottom: 110 }}>
      <AppBar large title="You" sub="Your profile & preferences" />

      {/* Profile header */}
      <div style={{ padding: "8px 16px 0" }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar name={name || "Salapi"} size={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>{display}</div>
              <div style={{ fontSize: 13, color: T.slate, fontFamily: T.fontMono, marginTop: 2 }}>
                {shortAddr} · Stellar
              </div>
            </div>
            <TestnetPill />
          </div>
        </Card>
      </div>

      {/* Accounts */}
      <SectionLabel>Accounts</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <Card p={0}>
          <Row
            leading={iconBox(Ico.arrowDown({ c: T.action }), T.actionTint, T.action)}
            title="GCash"
            sub="Top-up & cash-out · sandbox"
            trailing={
              <Chip kind="success" leading={Ico.check({ size: 11, c: T.moneyIn })}>
                Connected
              </Chip>
            }
          />
          <Row
            leading={iconBox(Ico.sparkle({ c: T.action }), T.actionTint, T.action)}
            title="Stellar wallet"
            sub={shortAddr}
            trailing={
              explorer ? (
                <a
                  href={explorer}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13, color: T.action, fontFamily: T.fontMono, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}
                >
                  View {Ico.link({ size: 13, c: T.action })}
                </a>
              ) : (
                <span style={{ fontSize: 13, color: T.slate }}>Loading…</span>
              )
            }
            divider={false}
          />
        </Card>
      </div>

      {/* Security */}
      <SectionLabel>Security</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <Card p={0}>
          <Row
            leading={iconBox(Ico.lock({ c: T.action }), T.actionTint, T.action)}
            title="Face ID"
            sub="Required on launch"
            trailing={<Switch on />}
          />
          <Row
            leading={iconBox(Ico.shield({ c: T.slate }), T.canvas, T.slate)}
            title="6-digit PIN"
            sub="Backup unlock"
            trailing={<Switch on />}
          />
          <Row
            leading={iconBox(Ico.user({ c: T.slate }), T.canvas, T.slate)}
            title="Hide balance"
            sub="Tap balance to reveal"
            trailing={<Switch on={false} />}
            divider={false}
          />
        </Card>
      </div>

      {/* Language */}
      <SectionLabel>Choose your language</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <LanguageSwitcher />
      </div>

      {/* About */}
      <SectionLabel>About</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <Card p={0}>
          <Row title="Version" trailing={<span style={{ fontSize: 13, color: T.slate, fontFamily: T.fontMono }}>1.0 · testnet</span>} />
          <Row
            title="Open source"
            sub="github.com/Ariqhermawan/salapi"
            trailing={
              <a
                href="https://github.com/Ariqhermawan/salapi"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: T.action }}
              >
                {Ico.link({ size: 15, c: T.action })}
              </a>
            }
          />
          <Row
            title="Salapi"
            sub="A crypto-invisible peso wallet for the Philippines, built on Stellar."
            trailing={null}
            divider={false}
          />
        </Card>
      </div>

      <div style={{ padding: "22px 16px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <MakerLockup />
        <PoweredByStellar />
        <span style={{ fontSize: 12, color: T.slate }}>For the Filipino people.</span>
      </div>
    </div>
  );
}
