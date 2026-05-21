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
import { useT } from "@/components/I18nProvider";
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
    <div style={{ padding: "12px 20px 6px", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: T.slate }}>
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
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null);
  const [pending, start] = useTransition();
  const has = Boolean(current);

  function save() {
    const clean = val.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (clean.length < 3) {
      setMsg({ ok: false, text: t("settings.usernameMinChars") });
      return;
    }
    start(async () => {
      setMsg(null);
      const r = has ? await renameUsername(clean) : await registerUsername(clean);
      if (r.ok) {
        setMsg({ ok: true, text: t("settings.usernameSaved", { name: r.name }), link: r.link });
        setEditing(false);
        setVal("");
        onChanged();
      } else {
        setMsg({ ok: false, text: r.error || t("settings.usernameSaveFailed") });
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
        title={has ? `@${current}` : t("settings.noUsername")}
        sub={has ? t("settings.usernameSub") : t("settings.claimPrompt")}
        trailing={
          !editing ? (
            <Btn kind="ghost" size="sm" full={false} onClick={() => { setEditing(true); setMsg(null); setVal(""); }}>
              {has ? t("settings.change") : t("settings.claim")}
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
              placeholder={t("settings.newnamePlaceholder")}
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 16, color: T.ink, fontFamily: T.fontSans }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Btn kind="primary" size="md" disabled={pending || val.length < 3} loading={pending} onClick={save}>
              {has ? t("settings.saveNew") : t("settings.claimUsername")}
            </Btn>
            <Btn kind="ghost" size="md" full={false} onClick={() => { setEditing(false); setMsg(null); }}>
              {t("settings.cancel")}
            </Btn>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: T.slate, lineHeight: 1.4 }}>
            {t("settings.usernameHint")}
          </div>
        </div>
      )}
      {msg && (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ padding: "10px 12px", borderRadius: 10, background: msg.ok ? T.moneyInTint : "#FBEAE8", color: msg.ok ? T.moneyIn : T.danger, fontSize: 13, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600 }}>{msg.ok ? "✓ " : ""}{msg.text}</span>
            {msg.link && (
              <a href={msg.link} target="_blank" rel="noopener noreferrer" style={{ color: T.action, fontFamily: T.fontMono, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                {t("settings.view")} {Ico.link({ size: 13, c: T.action })}
              </a>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function SettingsScreen() {
  const { t } = useT();
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

  const display = name ? `@${name}` : t("settings.salapiUser");
  const shortAddr = addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : "-";
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
      <AppBar large title={t("settings.you")} sub={t("settings.youSub")} />

      {/* Profile header */}
      <div style={{ padding: "4px 16px 0" }}>
        <Card p={14}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={name || "Salapi"} size={48} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>{display}</div>
              <div style={{ fontSize: 12, color: T.slate, fontFamily: T.fontMono, marginTop: 1 }}>
                {shortAddr} · Stellar
              </div>
            </div>
            <TestnetPill />
          </div>
        </Card>
      </div>

      {/* Username */}
      <SectionLabel>{t("settings.username")}</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <UsernamePanel current={name} onChanged={() => myUsername().then(setName)} />
      </div>

      {/* Accounts */}
      <SectionLabel>{t("settings.accounts")}</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <Card p={0}>
          {supaEmail && (
            <Row
              leading={iconBox(Ico.user({ c: T.moneyIn }), T.moneyInTint, T.moneyIn)}
              title={t("settings.googleSignedIn")}
              sub={supaEmail}
              trailing={
                <Btn kind="ghost" size="sm" full={false} onClick={signOut}>
                  {t("settings.signOut")}
                </Btn>
              }
            />
          )}
          <Row
            leading={iconBox(Ico.arrowDown({ c: T.action }), T.actionTint, T.action)}
            title="GCash"
            sub={t("settings.gcashSub")}
            trailing={
              <Chip kind="success" leading={Ico.check({ size: 11, c: T.moneyIn })}>
                {t("settings.connected")}
              </Chip>
            }
          />
          <Row
            leading={iconBox(Ico.sparkle({ c: T.action }), T.actionTint, T.action)}
            title={t("settings.stellarWallet")}
            sub={shortAddr}
            trailing={
              explorer ? (
                <a
                  href={explorer}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13, color: T.action, fontFamily: T.fontMono, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}
                >
                  {t("settings.view")} {Ico.link({ size: 13, c: T.action })}
                </a>
              ) : (
                <span style={{ fontSize: 13, color: T.slate }}>{t("common.loading")}</span>
              )
            }
            divider={false}
          />
        </Card>
      </div>

      {/* Verification & trust - Build-Award stage 2 preview entry */}
      <SectionLabel>{t("settings.verification")}</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <Card p={0}>
          <Row
            leading={iconBox(Ico.verify({ c: T.action }), T.actionTint, T.action)}
            title={t("settings.kycTier")}
            sub={t("settings.kycTier0")}
            onClick={() => router.push("/you/kyc-tier")}
            trailing={
              <Chip kind="warn" size="sm">
                {t("settings.previewStage2")}
              </Chip>
            }
            divider={false}
          />
        </Card>
      </div>

      {/* Security */}
      <SectionLabel>{t("settings.security")}</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <Card p={0}>
          <Row
            leading={iconBox(Ico.lock({ c: T.action }), T.actionTint, T.action)}
            title={t("settings.faceId")}
            sub={t("settings.faceIdSub")}
            trailing={<Switch on />}
          />
          <Row
            leading={iconBox(Ico.shield({ c: T.slate }), T.canvas, T.slate)}
            title={t("settings.pin")}
            sub={t("settings.pinSub")}
            trailing={<Switch on />}
          />
          <Row
            leading={iconBox(Ico.user({ c: T.slate }), T.canvas, T.slate)}
            title={t("settings.hideBalance")}
            sub={t("settings.hideBalanceSub")}
            trailing={<Switch on={false} />}
            divider={false}
          />
        </Card>
      </div>

      {/* Language */}
      <SectionLabel>{t("lang.choose")}</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <LanguageSwitcher />
      </div>

      {/* About */}
      <SectionLabel>{t("settings.about")}</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <Card p={0}>
          <Row title={t("settings.version")} trailing={<span style={{ fontSize: 13, color: T.slate, fontFamily: T.fontMono }}>1.0 · testnet</span>} />
          <Row
            title="Salapi"
            sub={t("settings.aboutText")}
            trailing={null}
            divider={false}
          />
        </Card>
      </div>

      <div style={{ padding: "14px 16px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <MakerLockup />
        <PoweredByStellar />
        <span style={{ fontSize: 12, color: T.slate }}>{t("settings.forSEA")}</span>
      </div>
    </div>
  );
}
