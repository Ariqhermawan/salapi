"use client";

// Profile and settings share one compact account sheet. Unavailable features
// remain explicitly labelled instead of resembling enabled security controls.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { ReactNode } from "react";
import {
  myHandle,
  walletState,
  registerUsername,
  renameUsername,
} from "@/app/actions";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { useT } from "@/components/I18nProvider";
import { LOCALE_META } from "@/lib/i18n/config";
import { accountCopy, accountCurrencyName, type AccountCopyKey } from "@/lib/i18n/revamp-account";
import { CURRENCY } from "@/lib/ui/currency";
import { isLocalPreview, PREVIEW_WALLET } from "@/lib/local-preview";
import {
  T,
  Ico,
  Avatar,
  Btn,
  PoweredByStellar,
  MakerLockup,
} from "@/components/ui/kit";
import styles from "./SettingsRevamp.module.css";

const NOTIF_KEY = "salapi_notif";

function SettingRow({
  icon,
  title,
  sub,
  trailing,
  onClick,
}: {
  icon: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className={styles.rowIcon}>{icon}</span>
      <span className={styles.rowCopy}>
        <span className={styles.rowTitle}>{title}</span>
        {sub ? <span className={styles.rowSub}>{sub}</span> : null}
      </span>
      {trailing ? <span className={styles.rowTrailing}>{trailing}</span> : null}
    </>
  );
  return (
    onClick
      ? <button type="button" className={styles.row} onClick={onClick}>{content}</button>
      : <div className={styles.row}>{content}</div>
  );
}

function SectionLabel({ children, id }: { children: ReactNode; id: string }) {
  return (
    <h2 className={styles.sectionTitle} id={id}>{children}</h2>
  );
}

// Username row + inline claim/rename editor. Renders as a fragment so it
// can sit as the first row of the Akun card.
function UsernamePanel({
  current,
  onChanged,
}: {
  current: string | null;
  onChanged: (name: string) => void;
}) {
  const { t, locale } = useT();
  const c = accountCopy(locale);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null);
  const [pending, start] = useTransition();
  const has = Boolean(current);

  function save() {
    const clean = val.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (clean.length < 3 || clean.length > 32) {
      setMsg({ ok: false, text: t("settings.usernameMinChars") });
      return;
    }
    start(async () => {
      setMsg(null);
      try {
        const r = isLocalPreview
          ? { ok: true as const, name: clean, link: undefined }
          : has ? await renameUsername(clean) : await registerUsername(clean);
        if (r.ok) {
          setMsg({ ok: true, text: t("settings.usernameSaved", { name: r.name }), link: r.link });
          setEditing(false);
          setVal("");
          onChanged(r.name);
        } else {
          setMsg({ ok: false, text: r.error || t("settings.usernameSaveFailed") });
        }
      } catch {
        setMsg({ ok: false, text: c.usernameSaveError });
      }
    });
  }

  return (
    <>
      <SettingRow
        icon={Ico.user({ size: 21, c: T.action })}
        title={t("settings.username")}
        sub={has ? `@${current}` : t("settings.claimPrompt")}
        trailing={
          !editing ? (
            <button
              type="button"
              className={styles.textAction}
              onClick={() => {
                setEditing(true);
                setMsg(null);
                setVal("");
              }}
            >
              {has ? t("settings.change") : t("settings.claim")}
            </button>
          ) : null
        }
      />
      {editing && (
        <div className={styles.usernameEditor}>
          <div className={styles.usernameInput}>
            <span>@</span>
            <input
              autoFocus
              value={val}
              aria-label={c.newUsername}
              maxLength={32}
              onChange={(e) => setVal(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32))}
              placeholder={t("settings.newnamePlaceholder")}
            />
          </div>
          <div className={styles.editorActions}>
            <Btn kind="primary" size="md" disabled={pending || val.length < 3} loading={pending} onClick={save}>
              {has ? t("settings.saveNew") : t("settings.claimUsername")}
            </Btn>
            <Btn kind="ghost" size="md" full={false} disabled={pending} onClick={() => { setEditing(false); setMsg(null); }}>
              {t("settings.cancel")}
            </Btn>
          </div>
          <p className={styles.editorHint}>
            {t("settings.usernameSub")} · {t("settings.usernameHint")}
          </p>
          {isLocalPreview ? <p className={styles.editorHint}>{c.previewNames}</p> : null}
        </div>
      )}
      {msg && (
        <div className={styles.messageWrap}>
          <div className={msg.ok ? styles.success : styles.error} role={msg.ok ? "status" : "alert"}>
            <span>{msg.ok ? "✓ " : ""}{msg.text}</span>
            {msg.link && (
              <a className={styles.externalLink} href={msg.link} target="_blank" rel="noopener noreferrer">
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
  const c = accountCopy(locale);
  const router = useRouter();
  const configured = !isLocalPreview && supabaseConfigured();
  const [name, setName] = useState<string | null>(isLocalPreview ? PREVIEW_WALLET.handle : null);
  const [addr, setAddr] = useState<string>(isLocalPreview ? PREVIEW_WALLET.address : "");
  const [supaEmail, setSupaEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(!configured);
  const [notif, setNotif] = useState(false);
  const [loadError, setLoadError] = useState<AccountCopyKey | "">("");

  useEffect(() => {
    if (!isLocalPreview) {
      myHandle().then(setName).catch(() => setLoadError("usernameLoad"));
      walletState().then((w) => setAddr(w.address)).catch(() => setLoadError("settingsWalletLoad"));
    }
    if (configured) {
      createSupabaseBrowser()
        .auth.getUser()
        .then(({ data }) => setSupaEmail(data.user?.email ?? null))
        .catch(() => {})
        .finally(() => setAuthChecked(true));
    }
    try { Promise.resolve(localStorage.getItem(NOTIF_KEY) === "1").then(setNotif); }
    catch { /* Browser storage may be unavailable. Keep notifications off. */ }
  }, [configured]);

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
    if (isLocalPreview) { router.push("/signin"); return; }
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
    <span className={styles.preferenceValue}>
      <span>{text}</span>
      {Ico.chev({ size: 15, c: T.slate })}
    </span>
  );

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Salapi · Testnet</span>
          <h1>{t("settings.you")}</h1>
          <p>{t("settings.youSub")}</p>
        </div>
        <Image src="/illustrations/community-world.png" width={160} height={110} alt={c.communityAlt} />
      </header>
      {loadError ? <p role="alert" className={styles.loadError}>{c[loadError]}</p> : null}

      <button type="button" className={styles.profile} onClick={() => router.push("/you/kyc-tier")}>
        <Avatar name={name || "Salapi"} size={46} />
        <span className={styles.profileCopy}>
          <span className={styles.profileName}>{display}</span>
          <span className={styles.profileSub}>{isLocalPreview ? c.previewAccount : c.managedWallet}</span>
          <span className={styles.profileMeta}>
            <span className={styles.testnet}><span />Testnet</span>
            <span className={styles.accountDetails}>{c.accountDetails}{Ico.chev({ size: 15, c: T.action })}</span>
          </span>
        </span>
      </button>

      <section className={styles.sheet} aria-labelledby="account-title">
        <SectionLabel id="account-title">{t("settings.accounts")}</SectionLabel>
        <div className={styles.rows}>
          <UsernamePanel current={name} onChanged={setName} />
          {supaEmail && (
            <SettingRow
              icon={Ico.user({ size: 21, c: T.action })}
              title={t("settings.googleSignedIn")}
              sub={supaEmail}
              trailing={
                <button type="button" className={styles.textAction} onClick={signOut}>
                  {t("settings.signOut")}
                </button>
              }
            />
          )}
          {authChecked && !supaEmail && (
            <SettingRow
              icon={Ico.lock({ size: 21, c: T.action })}
              title={t("signin.signIn")}
              sub={t("signin.subtitle")}
              onClick={() => router.push("/signin")}
              trailing={Ico.chev({ size: 15, c: T.slate })}
            />
          )}
          {!authChecked ? <p className={styles.authLoading} role="status">{t("common.loading")}</p> : null}
          <SettingRow
            icon={Ico.sparkle({ size: 21, c: T.action })}
            title={t("settings.stellarWallet")}
            sub={shortAddr}
            trailing={
              explorer ? (
                <a
                  className={styles.externalLink}
                  href={explorer}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("settings.view")} {Ico.link({ size: 13, c: T.action })}
                </a>
              ) : (
                <span className={styles.muted}>{t("common.loading")}</span>
              )
            }
          />
        </div>
      </section>

      <section className={styles.sheet} aria-labelledby="preferences-title">
        <SectionLabel id="preferences-title">{t("settings.preferences")}</SectionLabel>
        <div className={styles.rows}>
          <SettingRow
            icon={Ico.globe({ size: 21, c: T.action })}
            title={t("settings.language")}
            onClick={() => router.push("/settings/language")}
            trailing={value(LOCALE_META[locale].native)}
          />
          <SettingRow
            icon={<span className={styles.currencySymbol}>{CURRENCY[currency].symbol.trim()}</span>}
            title={t("settings.currency")}
            sub={
              currencyPref
                ? t("settings.currencyManual")
                : t("settings.currencySub")
            }
            onClick={() => router.push("/settings/currency")}
            trailing={value(accountCurrencyName(locale, currency))}
          />
          <SettingRow
            icon={Ico.bell({ size: 21, c: T.action })}
            title={t("settings.notifications")}
            sub={c.localReminders}
            trailing={<button type="button" role="switch" aria-checked={notif} aria-label={t("settings.notifications")} className={styles.switch} onClick={toggleNotif}><span className={notif ? styles.switchOn : styles.switchOff}><span /></span></button>}
          />
        </div>
      </section>

      <section className={styles.support} aria-label={c.featuresSupport}>
        <SettingRow
          icon={(locale === "id" ? Ico.qr : Ico.arrowDown)({ size: 21, c: T.slate })}
          title={locale === "id" ? "QRIS" : "GCash"}
          sub={t("settings.gcashSub")}
          trailing={<span className={styles.plannedBadge}>{c.planned}</span>}
        />
        <details className={styles.security}>
          <summary>
            <span className={styles.rowIcon}>{Ico.shield({ size: 21, c: T.slate })}</span>
            <span className={styles.rowCopy}>
              <span className={styles.rowTitle}>{t("settings.security")}</span>
              <span className={styles.rowSub}>{c.unavailableFeatures}</span>
            </span>
            <span className={styles.disclosureArrow}>{Ico.chev({ size: 15, c: T.slate })}</span>
          </summary>
          <div className={styles.securityBody}>
            <SettingRow
              icon={Ico.lock({ size: 18, c: T.slate })}
              title={t("settings.faceId")}
              sub={c.biometricUnavailable}
              trailing={<span className={styles.unavailableBadge}>{c.notAvailable}</span>}
            />
            <SettingRow
              icon={Ico.shield({ size: 18, c: T.slate })}
              title={t("settings.pin")}
              sub={c.pinUnavailable}
              trailing={<span className={styles.unavailableBadge}>{c.notAvailable}</span>}
            />
            <SettingRow
              icon={Ico.user({ size: 18, c: T.slate })}
              title={t("settings.hideBalance")}
              sub={c.visibilityPlanned}
              trailing={<span className={styles.unavailableBadge}>{c.comingSoon}</span>}
            />
          </div>
        </details>
        <SettingRow
          icon={Ico.bulb({ size: 21, c: T.action })}
          title={t("settings.helpCenter")}
          sub={t("settings.helpCenterSub")}
          onClick={() => router.push("/learn")}
          trailing={Ico.chev({ size: 16, c: T.slate })}
        />
        <SettingRow
          icon={Ico.shield({ size: 21, c: T.action })}
          title={t("settings.privacy")}
          sub={t("settings.privacySub")}
          onClick={() => router.push("/privacy")}
          trailing={Ico.chev({ size: 16, c: T.slate })}
        />
        <SettingRow
          icon={Ico.shield({ size: 21, c: T.action })}
          title={c.testnetTerms}
          sub={c.termsSub}
          onClick={() => router.push("/terms")}
          trailing={Ico.chev({ size: 16, c: T.slate })}
        />
      </section>

      <footer className={styles.footer}>
        <div className={styles.attribution}>
          <MakerLockup />
          <PoweredByStellar />
        </div>
        <span className={styles.version}>
          Salapi 1.0 · testnet · {t("settings.forSEA")}
        </span>
      </footer>
    </div>
  );
}
