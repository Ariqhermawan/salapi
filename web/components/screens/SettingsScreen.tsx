"use client";

// Profile and settings share one compact account sheet. Unavailable features
// remain explicitly labelled instead of resembling enabled security controls.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { ReactNode } from "react";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import {
  walletState,
  registerUsername,
  renameUsername,
} from "@/app/actions";
import { settingsHandle } from "@/app/account-actions";
import AccountAvatar from "@/components/AccountAvatar";
import AccountPhotoEditor from "@/components/AccountPhotoEditor";
import { useAccountPhoto } from "@/components/useAccountPhoto";
import { accountPhotoCopy } from "@/lib/i18n/account-photo";
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
  const [nameStatus, setNameStatus] = useState<"loading" | "ready" | "error">(isLocalPreview ? "ready" : "loading");
  const [addr, setAddr] = useState<string>(isLocalPreview ? PREVIEW_WALLET.address : "");
  const [supaEmail, setSupaEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(!configured);
  const [authFailed, setAuthFailed] = useState(false);
  const [notif, setNotif] = useState(false);
  const [loadError, setLoadError] = useState<AccountCopyKey | "">("");
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const signOutInFlight = useRef(false);
  const photo = useAccountPhoto(() => signOutInFlight.current);
  const photoCopy = accountPhotoCopy(locale);

  useEffect(() => {
    let active = true;
    if (!isLocalPreview) {
      settingsHandle().then((result) => {
        if (!active || signOutInFlight.current) return;
        if (!result.ok) {
          setNameStatus("error");
          setLoadError("usernameLoad");
          return;
        }
        setName(result.handle);
        setNameStatus("ready");
      }).catch(() => {
        if (!active || signOutInFlight.current) return;
        setNameStatus("error");
        setLoadError("usernameLoad");
      });
      walletState().then((w) => { if (active && !signOutInFlight.current) setAddr(w.address); }).catch(() => { if (active && !signOutInFlight.current) setLoadError("settingsWalletLoad"); });
    }
    if (configured) {
      // Only use the Auth server's getUser response, not a cached session or
      // user-editable metadata. A failed lookup is not evidence of a guest.
      async function loadAccountEmail() {
        let authRequestStarted = false;
        try {
          const supabase = createSupabaseBrowser();
          authRequestStarted = true;
          const { data, error } = await supabase.auth.getUser();
          if (!active || signOutInFlight.current) return;
          if (error && !(isAuthSessionMissingError(error) && data.user === null)) {
            setSupaEmail(null);
            setAuthFailed(true);
            return;
          }
          const email = data.user?.email;
          if (data.user !== null && (!data.user || typeof email !== "string" || !email.trim())) {
            setSupaEmail(null);
            setAuthFailed(true);
            return;
          }
          setSupaEmail(email?.trim() ?? null);
          setAuthFailed(false);
        } catch (error) {
          if (!active || signOutInFlight.current) return;
          setSupaEmail(null);
          setAuthFailed(!authRequestStarted || !isAuthSessionMissingError(error));
        } finally {
          if (active && !signOutInFlight.current) setAuthChecked(true);
        }
      }
      void loadAccountEmail();
    }
    try { Promise.resolve(localStorage.getItem(NOTIF_KEY) === "1").then((enabled) => { if (active) setNotif(enabled); }); }
    catch { /* Browser storage may be unavailable. Keep notifications off. */ }
    return () => { active = false; };
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
    if (signOutInFlight.current) return;
    signOutInFlight.current = true;
    setSignOutPending(true);
    setSignOutError(false);
    let redirecting = false;
    try {
      const { error } = await createSupabaseBrowser().auth.signOut();
      if (error) {
        setSignOutError(true);
        return;
      }
      // Reload the document after auth cookies are cleared, discarding private
      // client-router state. The destination is bound to the current origin.
      window.location.href = new URL("/signin", window.location.origin).href;
      redirecting = true;
    } catch {
      setSignOutError(true);
    } finally {
      // Allow a retry after failure, but keep the guard until navigation on success.
      if (!redirecting) {
        signOutInFlight.current = false;
        setSignOutPending(false);
      }
    }
  }

  // A known registry handle has precedence. Without a handle, wait for the
  // verified account email instead of briefly presenting a generic identity.
  const profileStatus = nameStatus !== "ready" || name
    ? nameStatus : !authChecked ? "loading" : authFailed ? "error" : "ready";
  const display = name ? `@${name}` : supaEmail ?? t("settings.salapiUser");
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

      <button type="button" className={styles.profile} onClick={() => router.push("/you/kyc-tier")}
        disabled={profileStatus !== "ready"} aria-busy={profileStatus === "loading"} data-profile-state={profileStatus}
        aria-label={profileStatus === "loading" ? c.profileLoading : profileStatus === "error" ? c.profileUnavailable : undefined}>
        {profileStatus === "ready" ? <AccountAvatar name={name || supaEmail || "Salapi"} photoUrl={photo.profile?.photoUrl ?? null} size={46} alt={photoCopy.alt} loading={photo.status === "loading"} />
          : <span className={`${styles.profileAvatarPlaceholder} ${profileStatus === "loading" ? "sl-skel" : ""}`} aria-hidden="true" />}
        <span className={styles.profileCopy}>
          <span className={styles.profileName}>{profileStatus === "loading"
            ? <span className={`${styles.profileNamePlaceholder} sl-skel`} aria-hidden="true" />
            : profileStatus === "error" ? c.profileUnavailable : display}</span>
          <span className={styles.profileSub}>{isLocalPreview ? c.previewAccount : c.managedWallet}</span>
          <span className={styles.profileMeta}>
            <span className={styles.testnet}><span />Testnet</span>
            <span className={styles.accountDetails}>{profileStatus === "loading" ? c.loading : profileStatus === "ready" ? <>{c.accountDetails}{Ico.chev({ size: 15, c: T.action })}</> : null}</span>
          </span>
        </span>
      </button>

      <AccountPhotoEditor photo={photo} disabled={signOutPending} />

      <section className={styles.sheet} aria-labelledby="account-title">
        <SectionLabel id="account-title">{t("settings.accounts")}</SectionLabel>
        <div className={styles.rows}>
          {profileStatus === "ready" ? <UsernamePanel current={name} onChanged={setName} /> : <SettingRow
            icon={Ico.user({ size: 21, c: T.action })}
            title={t("settings.username")}
            sub={profileStatus === "loading" ? c.loading : c.profileUnavailable}
          />}
          {supaEmail && (
            <SettingRow
              icon={Ico.user({ size: 21, c: T.action })}
              title={t("settings.googleSignedIn")}
              sub={supaEmail}
              trailing={
                <button type="button" className={styles.textAction} onClick={signOut} disabled={signOutPending} aria-busy={signOutPending}>
                  {signOutPending ? c.signingOut : t("settings.signOut")}
                </button>
              }
            />
          )}
          {signOutError ? <p role="alert" className={styles.loadError}>{c.signOutError}</p> : null}
          {authChecked && !authFailed && !supaEmail && (
            <SettingRow
              icon={Ico.lock({ size: 21, c: T.action })}
              title={t("signin.signIn")}
              sub={t("signin.subtitle")}
              onClick={() => router.push("/signin")}
              trailing={Ico.chev({ size: 15, c: T.slate })}
            />
          )}
          {authChecked && authFailed ? <p className={styles.loadError} role="alert">{c.profileUnavailable}</p> : null}
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
