"use client";
import { requireWalletState } from "@/lib/wallet-state";

// Profile and settings share one compact account sheet. Unavailable features
// remain explicitly labelled instead of resembling enabled security controls.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookmarkSimple } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { CopySimple } from "@phosphor-icons/react/dist/csr/CopySimple";
import { UserPlus } from "@phosphor-icons/react/dist/csr/UserPlus";
import type { ReactNode } from "react";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import {
  walletState,
} from "@/app/actions";
import { settingsHandle } from "@/app/account-actions";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { useT } from "@/components/I18nProvider";
import { LOCALE_META } from "@/lib/i18n/config";
import { accountCopy, accountCurrencyName, type AccountCopyKey } from "@/lib/i18n/revamp-account";
import { campaignDiscoveryCopy } from "@/lib/i18n/revamp-campaign-discovery";
import { CURRENCY } from "@/lib/ui/currency";
import { isLocalPreview, PREVIEW_WALLET } from "@/lib/local-preview";
import {
  T,
  Ico,
  Btn,
} from "@/components/ui/kit";
import styles from "./SettingsRevamp.module.css";


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

export default function SettingsScreen() {
  const { t, locale, currency } = useT();
  const c = accountCopy(locale);
  const router = useRouter();
  const configured = !isLocalPreview && supabaseConfigured();
  const [name, setName] = useState<string | null>(isLocalPreview ? PREVIEW_WALLET.handle : null);
  const [nameStatus, setNameStatus] = useState<"loading" | "ready" | "error">(isLocalPreview ? "ready" : "loading");
  const [addr, setAddr] = useState<string>(isLocalPreview ? PREVIEW_WALLET.address : "");
  const [supaEmail, setSupaEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(!configured);
  const [authFailed, setAuthFailed] = useState(false);
  const [loadError, setLoadError] = useState<AccountCopyKey | "">("");
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const signOutInFlight = useRef(false);

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
      walletState().then(requireWalletState).then((w) => { if (active && !signOutInFlight.current) setAddr(w.address); }).catch(() => { if (active && !signOutInFlight.current) setLoadError("settingsWalletLoad"); });
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
    return () => { active = false; };
  }, [configured]);

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
  const signedIn = isLocalPreview || Boolean(supaEmail);
  const display = !isLocalPreview && name ? `@${name}` : signedIn ? "Your account" : "Guest account";
  const shortAddr = addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : "-";
  async function copyAddress() {
    if (!addr) return;
    try {
      await navigator.clipboard.writeText(addr);
      setCopiedAddress(true);
      window.setTimeout(() => setCopiedAddress(false), 1600);
    } catch {
      setCopiedAddress(false);
    }
  }
  const value = (text: string) => (
    <span className={styles.preferenceValue}>
      <span>{text}</span>
      {Ico.chev({ size: 15, c: T.slate })}
    </span>
  );

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1>{t("settings.you")}</h1>
      </header>
      {loadError ? <p role="alert" className={styles.loadError}>{c[loadError]}</p> : null}

      <section className={styles.profile} aria-label={c.accountDetails}>
        <span className={styles.accountMark} aria-hidden="true">{Ico.user({ size: 21, c: T.action })}</span>
        <span className={styles.profileCopy}>
          <span className={styles.profileName}>{profileStatus === "loading" ? c.loading : display}</span>
          {signedIn ? (
            <button type="button" className={styles.walletCopy} onClick={copyAddress} disabled={!addr || signOutPending} aria-label={copiedAddress ? "Wallet address copied" : "Copy wallet address"}>
              <span>{copiedAddress ? "Copied" : shortAddr}</span>
              {copiedAddress ? Ico.check({ size: 14, c: T.action }) : <CopySimple size={14} aria-hidden="true" />}
            </button>
          ) : <span className={styles.profileSub}>Sign in to see your wallet address and account details.</span>}
        </span>
        {!signedIn ? <Btn kind="secondary" size="sm" full={false} onClick={() => router.push("/signin")}>{t("signin.signIn")}</Btn> : null}
      </section>

      <SectionLabel id="account-title">Account</SectionLabel>
      <section className={styles.sheet} aria-labelledby="account-title">
        <div className={styles.rows}>
          <SettingRow
            icon={Ico.user({ size: 21, c: T.action })}
            title={t("settings.username")}
            sub={!isLocalPreview && name ? `@${name}` : undefined}
            onClick={() => router.push("/username")}
            trailing={!isLocalPreview && name ? Ico.chev({ size: 15, c: T.slate }) : <span className={styles.textAction}>{t("settings.claim")}</span>}
          />
          {signedIn ? <>
            <SettingRow
              icon={Ico.user({ size: 21, c: T.action })}
              title={c.accountDetails}
              onClick={() => router.push("/you/account")}
              trailing={Ico.chev({ size: 15, c: T.slate })}
            />
            <SettingRow
              icon={<UserPlus size={21} aria-hidden="true" />}
              title={c.inviteFriends}
              onClick={() => router.push("/you/invite")}
              trailing={Ico.chev({ size: 15, c: T.slate })}
            />
          </> : null}
        </div>
      </section>

      <SectionLabel id="fundraising-title">Fundraising</SectionLabel>
      <section className={styles.sheet} aria-labelledby="fundraising-title">
        <div className={styles.rows}>
          <SettingRow
            icon={Ico.vault({ size: 21, c: T.action })}
            title="Your causes"
            onClick={() => router.push("/manage")}
            trailing={isLocalPreview ? <span className={styles.muted}>None yet</span> : Ico.chev({ size: 15, c: T.slate })}
          />
          <SettingRow
            icon={<BookmarkSimple size={21} aria-hidden="true" />}
            title={campaignDiscoveryCopy(locale)("Saved causes")}
            onClick={() => router.push("/you/saved")}
            trailing={isLocalPreview ? <span className={styles.muted}>None yet</span> : Ico.chev({ size: 15, c: T.slate })}
          />
        </div>
      </section>

      <SectionLabel id="preferences-title">{t("settings.preferences")}</SectionLabel>
      <section className={styles.sheet} aria-labelledby="preferences-title">
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
            onClick={() => router.push("/settings/currency")}
            trailing={value(accountCurrencyName(locale, currency))}
          />
          <SettingRow
            icon={Ico.bell({ size: 21, c: T.action })}
            title={t("settings.notifications")}
            onClick={() => router.push("/notifications")}
            trailing={Ico.chev({ size: 15, c: T.slate })}
          />
          <SettingRow
            icon={Ico.shield({ size: 21, c: T.action })}
            title={t("settings.security")}
            onClick={() => router.push("/you/security")}
            trailing={Ico.chev({ size: 15, c: T.slate })}
          />
        </div>
      </section>

      <section className={styles.support} aria-label={c.featuresSupport}>
        <SettingRow
          icon={Ico.bulb({ size: 21, c: T.action })}
          title="Help center"
          onClick={() => router.push("/learn")}
          trailing={Ico.chev({ size: 16, c: T.slate })}
        />
        <SettingRow
          icon={Ico.bulb({ size: 21, c: T.action })}
          title={locale === "id" ? "Kirim masukan" : locale === "tl" ? "Magpadala ng feedback" : locale === "vi" ? "Gửi phản hồi" : "Send feedback"}
          sub="Report a bug, suggest an idea, rate Salapi"
          onClick={() => router.push("/you/feedback")}
          trailing={Ico.chev({ size: 16, c: T.slate })}
        />
        <SettingRow
          icon={Ico.lock({ size: 21, c: T.action })}
          title="Privacy"
          onClick={() => router.push("/you/privacy")}
          trailing={Ico.chev({ size: 16, c: T.slate })}
        />
        <SettingRow
          icon={Ico.shield({ size: 21, c: T.action })}
          title="Terms"
          onClick={() => router.push("/you/terms")}
          trailing={Ico.chev({ size: 16, c: T.slate })}
        />
        <SettingRow
          icon={Ico.refresh({ size: 21, c: T.action })}
          title="Check for updates"
          sub={updateMessage || "Version 4.2.0 · Up to date"}
          onClick={() => setUpdateMessage("Salapi is up to date")}
        />
      </section>

      {signedIn ? <section className={styles.support} aria-label={t("settings.signOut")}>
        <SettingRow
          icon={Ico.back({ size: 21, c: T.action })}
          title={signOutPending ? c.signingOut : t("settings.signOut")}
          onClick={signOut}
          trailing={Ico.chev({ size: 16, c: T.slate })}
        />
        {signOutError ? <p role="alert" className={styles.loadError}>{c.signOutError}</p> : null}
      </section> : null}

      <footer className={styles.footer}><span className={styles.version}>Salapi 4.2.0</span></footer>
    </div>
  );
}
