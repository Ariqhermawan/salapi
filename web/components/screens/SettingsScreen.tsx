"use client";

// "Kamu" — profile & settings. Grouped-card layout: Profile → Akun →
// Preferensi → Keamanan → Bantuan → Legal. Every function from the prior
// version is preserved; the language picker now lives on its own screen
// (/settings/language) reached from the Preferensi › Bahasa row.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  myUsername,
  walletState,
  registerUsername,
  renameUsername,
} from "@/app/actions";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { useT } from "@/components/I18nProvider";
import { LOCALE_META } from "@/lib/i18n/config";
import { CURRENCY, CURRENCY_LABEL } from "@/lib/ui/currency";
import {
  T,
  Ico,
  AppBar,
  Card,
  Row,
  Avatar,
  Chip,
  Btn,
  PoweredByStellar,
  MakerLockup,
} from "@/components/ui/kit";

const NOTIF_KEY = "salapi_notif";

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
        transition: "background .16s ease",
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: 99,
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,.18)",
        }}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "16px 20px 7px",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: T.slate,
      }}
    >
      {children}
    </div>
  );
}

function iconBox(icon: React.ReactNode, bg: string, fg: string) {
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        background: bg,
        color: fg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {icon}
    </div>
  );
}

// Username row + inline claim/rename editor. Renders as a fragment so it
// can sit as the first row of the Akun card.
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
    <>
      <Row
        leading={iconBox(Ico.user({ c: T.action }), T.actionTint, T.action)}
        title={has ? `@${current}` : t("settings.noUsername")}
        sub={has ? t("settings.usernameSub") : t("settings.claimPrompt")}
        trailing={
          !editing ? (
            <Btn
              kind="ghost"
              size="sm"
              full={false}
              onClick={() => {
                setEditing(true);
                setMsg(null);
                setVal("");
              }}
            >
              {has ? t("settings.change") : t("settings.claim")}
            </Btn>
          ) : null
        }
      />
      {editing && (
        <div style={{ padding: "12px 16px 14px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: T.canvas,
              borderRadius: 12,
              padding: "10px 14px",
              boxShadow: "inset 0 0 0 1px " + T.hairline,
            }}
          >
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
    </>
  );
}

export default function SettingsScreen() {
  const { t, locale, currency, currencyPref } = useT();
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [addr, setAddr] = useState<string>("");
  const [supaEmail, setSupaEmail] = useState<string | null>(null);
  const [notif, setNotif] = useState(true);

  useEffect(() => {
    myUsername().then(setName);
    walletState().then((w) => setAddr(w.address));
    if (supabaseConfigured()) {
      createSupabaseBrowser()
        .auth.getUser()
        .then(({ data }) => setSupaEmail(data.user?.email ?? null))
        .catch(() => {});
    }
    setNotif(localStorage.getItem(NOTIF_KEY) !== "0");
  }, []);

  function toggleNotif() {
    setNotif((v) => {
      const next = !v;
      try {
        localStorage.setItem(NOTIF_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

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
  const value = (text: string) => (
    <span style={{ fontSize: 13.5, fontWeight: 500, color: T.ink }}>{text}</span>
  );

  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%" }}>
      <AppBar large title={t("settings.you")} />

      {/* Profile — tier status, taps through to the KYC tier screen */}
      <div style={{ padding: "4px 16px 0" }}>
        <Card
          p={14}
          className="sl-lift"
          onClick={() => router.push("/you/kyc-tier")}
          style={{ cursor: "pointer" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={name || "Salapi"} size={48} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{
                    fontSize: 17,
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {display}
                </span>
                {name && Ico.verify({ size: 15, c: T.moneyIn })}
              </div>
              <div style={{ fontSize: 12.5, color: T.slate, marginTop: 2 }}>
                {t("settings.tierShort")}
              </div>
            </div>
            <Chip kind="warn" size="sm">
              {t("settings.previewStage2")}
            </Chip>
          </div>
        </Card>
      </div>

      {/* Akun */}
      <SectionLabel>{t("settings.accounts")}</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <Card p={0}>
          <UsernamePanel current={name} onChanged={() => myUsername().then(setName)} />
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

      {/* Preferensi */}
      <SectionLabel>{t("settings.preferences")}</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <Card p={0}>
          <Row
            leading={iconBox(Ico.globe({ c: T.action }), T.actionTint, T.action)}
            title={t("settings.language")}
            onClick={() => router.push("/settings/language")}
            trailing={value(LOCALE_META[locale].native)}
          />
          <Row
            leading={iconBox(
              <span>{CURRENCY[currency].symbol.trim()}</span>,
              T.actionTint,
              T.action
            )}
            title={t("settings.currency")}
            sub={
              currencyPref
                ? t("settings.currencyManual")
                : t("settings.currencySub")
            }
            onClick={() => router.push("/settings/currency")}
            trailing={value(CURRENCY_LABEL[currency])}
          />
          <Row
            leading={iconBox(Ico.bell({ c: T.action }), T.actionTint, T.action)}
            title={t("settings.notifications")}
            sub={t("settings.notificationsSub")}
            onClick={toggleNotif}
            trailing={<Switch on={notif} />}
            divider={false}
          />
        </Card>
      </div>

      {/* Keamanan */}
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

      {/* Bantuan */}
      <SectionLabel>{t("settings.help")}</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <Card p={0}>
          <Row
            leading={iconBox(Ico.bulb({ c: T.action }), T.actionTint, T.action)}
            title={t("settings.helpCenter")}
            sub={t("settings.helpCenterSub")}
            onClick={() => router.push("/learn")}
            trailing={Ico.chev({ size: 16, c: T.slate })}
            divider={false}
          />
        </Card>
      </div>

      {/* Legal */}
      <SectionLabel>{t("settings.legal")}</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <Card p={0}>
          <Row
            leading={iconBox(Ico.shield({ c: T.action }), T.actionTint, T.action)}
            title={t("settings.privacy")}
            sub={t("settings.privacySub")}
            onClick={() => router.push("/learn")}
            trailing={Ico.chev({ size: 16, c: T.slate })}
            divider={false}
          />
        </Card>
      </div>

      <div style={{ padding: "20px 16px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <MakerLockup />
        <PoweredByStellar />
        <span style={{ fontSize: 12, color: T.slate }}>
          Salapi 1.0 · testnet · {t("settings.forSEA")}
        </span>
      </div>
    </div>
  );
}
