"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  myUsername,
  walletState,
  registerUsername,
  renameUsername,
} from "@/app/actions";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import {
  T,
  Ico,
  AppBar,
  Card,
  Row,
  Avatar,
  Chip,
  Btn,
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

function UsernamePanel({
  current,
  onChanged,
}: {
  current: string | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null);
  const [pending, start] = useTransition();
  const has = Boolean(current);

  function save() {
    const clean = val.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (clean.length < 3) {
      setMsg({ ok: false, text: "Min 3 chars (a-z, 0-9, _)" });
      return;
    }
    start(async () => {
      setMsg(null);
      const r = has ? await renameUsername(clean) : await registerUsername(clean);
      if (r.ok) {
        setMsg({ ok: true, text: `Username is now @${r.name}`, link: r.link });
        setEditing(false);
        setVal("");
        onChanged();
      } else {
        setMsg({ ok: false, text: r.error || "Couldn't save" });
      }
    });
  }

  return (
    <Card p={0}>
      <Row
        leading={
          <div style={{ width: 34, height: 34, borderRadius: 10, background: T.actionTint, color: T.action, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {Ico.user({ c: T.action })}
          </div>
        }
        title={has ? `@${current}` : "No username yet"}
        sub={has ? "Your name on Salapi — for receiving" : "Claim a name so people can send to you"}
        trailing={
          !editing ? (
            <Btn kind="ghost" size="sm" full={false} onClick={() => { setEditing(true); setMsg(null); setVal(""); }}>
              {has ? "Change" : "Claim"}
            </Btn>
          ) : null
        }
        divider={editing || Boolean(msg)}
      />
      {editing && (
        <div style={{ padding: "12px 16px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.canvas, borderRadius: 12, padding: "10px 14px", boxShadow: "inset 0 0 0 1px " + T.hairline }}>
            <span style={{ fontSize: 16, color: T.slate, fontWeight: 600 }}>@</span>
            <input
              autoFocus
              value={val}
              onChange={(e) => setVal(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="newname"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 16, color: T.ink, fontFamily: T.fontSans }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Btn kind="primary" size="md" disabled={pending || val.length < 3} loading={pending} onClick={save}>
              {has ? "Save new username" : "Claim username"}
            </Btn>
            <Btn kind="ghost" size="md" full={false} onClick={() => { setEditing(false); setMsg(null); }}>
              Cancel
            </Btn>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: T.slate, lineHeight: 1.4 }}>
            Lowercase letters, numbers, _ · min 3. Your old name keeps working too.
          </div>
        </div>
      )}
      {msg && (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ padding: "10px 12px", borderRadius: 10, background: msg.ok ? T.moneyInTint : "#FBEAE8", color: msg.ok ? T.moneyIn : T.danger, fontSize: 13, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600 }}>{msg.ok ? "✓ " : ""}{msg.text}</span>
            {msg.link && (
              <a href={msg.link} target="_blank" rel="noopener noreferrer" style={{ color: T.action, fontFamily: T.fontMono, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                View {Ico.link({ size: 13, c: T.action })}
              </a>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [addr, setAddr] = useState<string>("");
  const [supaEmail, setSupaEmail] = useState<string | null>(null);

  useEffect(() => {
    myUsername().then(setName);
    walletState().then((w) => setAddr(w.address));
    if (supabaseConfigured()) {
      createSupabaseBrowser()
        .auth.getUser()
        .then(({ data }) => setSupaEmail(data.user?.email ?? null))
        .catch(() => {});
    }
  }, []);

  async function signOut() {
    try {
      await createSupabaseBrowser().auth.signOut();
    } catch {
      /* ignore */
    }
    window.location.href = "/signin";
  }

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

      {/* Username */}
      <SectionLabel>Username</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <UsernamePanel current={name} onChanged={() => myUsername().then(setName)} />
      </div>

      {/* Accounts */}
      <SectionLabel>Accounts</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <Card p={0}>
          {supaEmail && (
            <Row
              leading={iconBox(Ico.user({ c: T.moneyIn }), T.moneyInTint, T.moneyIn)}
              title="Signed in with Google"
              sub={supaEmail}
              trailing={
                <Btn kind="ghost" size="sm" full={false} onClick={signOut}>
                  Sign out
                </Btn>
              }
            />
          )}
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

      {/* Verification & trust - Build-Award stage 2 preview entry */}
      <SectionLabel>Verification &amp; trust</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <Card p={0}>
          <Row
            leading={iconBox(Ico.verify({ c: T.action }), T.actionTint, T.action)}
            title="KYC tier"
            sub="Tier 0 - no verification yet"
            onClick={() => router.push("/you/kyc-tier")}
            trailing={
              <Chip kind="warn" size="sm">
                Preview · Stage 2
              </Chip>
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
            title="Salapi"
            sub="A crypto-invisible money app for the Philippines & Indonesia, built on Stellar."
            trailing={null}
            divider={false}
          />
        </Card>
      </div>

      <div style={{ padding: "22px 16px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <MakerLockup />
        <PoweredByStellar />
        <span style={{ fontSize: 12, color: T.slate }}>For Southeast Asia.</span>
      </div>
    </div>
  );
}
