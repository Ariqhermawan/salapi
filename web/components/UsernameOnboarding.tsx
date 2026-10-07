"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { completeUsername } from "@/app/username-onboarding-actions";
import { checkSubmittedTransaction } from "@/app/actions";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { isLocalPreview } from "@/lib/local-preview";
import { normalizedUsername, usernameGateExempt, type UsernameStatus } from "@/lib/username-onboarding";
import { usernameOnboardingCopy } from "@/lib/i18n/username-onboarding";
import { useT } from "@/components/I18nProvider";
import styles from "./UsernameOnboarding.module.css";

type State = "idle" | "checking" | "ready" | "required" | "wallet_missing" | "unavailable";
const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

/** One owner-bound check per document/login, not another RPC on every click. */
export default function UsernameOnboarding() {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const destination = `${pathname}${searchParams?.size ? `?${searchParams.toString()}` : ""}`;
  const router = useRouter();
  const { locale } = useT();
  const c = usernameOnboardingCopy(locale);
  const preview = isLocalPreview && pathname === "/onboarding/username";
  const hydrated = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const enabled = !isLocalPreview && supabaseConfigured();
  const [state, setState] = useState<State>(preview ? "required" : "idle");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<"invalid" | "taken" | "failed" | null>(null);
  const owner = useRef<string | null>(null);
  const version = useRef(0);
  const alive = useRef(false);
  const locked = useRef(false);
  const pendingHash = useRef<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const currentState = preview && state === "idle" ? "required" : state;
  const blocked = hydrated && (enabled || preview) && !usernameGateExempt(pathname) && !["idle", "ready"].includes(currentState);

  const check = useCallback(async () => {
    const expected = owner.current;
    if (!expected || !alive.current) return;
    const request = ++version.current;
    setState("checking");
    try {
      const response = await fetch("/api/account/username-onboarding", {
        cache: "no-store", credentials: "same-origin", headers: { "X-Salapi-Owner": expected },
        signal: AbortSignal.timeout(15000),
      });
      const result: UsernameStatus = await response.json();
      if (!alive.current || request !== version.current || owner.current !== expected) return;
      if (!response.ok || !("ownerId" in result) || result.ownerId !== expected) { setState("unavailable"); return; }
      if (result.status === "ready" && normalizedUsername(result.handle)) {
        setUncertain(false); pendingHash.current = null; setState("ready");
        return result;
      } else if (result.status === "required" || result.status === "wallet_missing") setState(result.status);
      else setState("unavailable");
    } catch {
      if (alive.current && request === version.current && owner.current === expected) setState("unavailable");
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    const invalidate = () => { alive.current = false; version.current++; };
    if (!enabled) return invalidate;
    let unsubscribe = () => {};
    try {
      const { data } = createSupabaseBrowser().auth.onAuthStateChange((event, session) => {
        if (!alive.current) return;
        const nextOwner = event === "SIGNED_OUT" || session?.user.is_anonymous !== false ? null : session.user.id;
        if (nextOwner === owner.current) return; // Token refresh/focus does not repeat registry work.
        owner.current = nextOwner; version.current++;
        setValue(""); setError(null); setUncertain(false); setBusy(false); pendingHash.current = null;
        if (!nextOwner) { setState("idle"); return; }
        setState("checking");
        // Never await inside Supabase's Auth callback.
        queueMicrotask(() => { if (alive.current && owner.current === nextOwner) void check(); });
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch { /* No established Auth owner: existing sign-in recovery owns the error. */ }
    return () => { invalidate(); owner.current = null; unsubscribe(); };
  }, [enabled, check]);

  useEffect(() => {
    const node = dialog.current;
    if (!blocked || !node) return;
    // Native modal makes the rest of the app inert and traps keyboard focus.
    const preventCancel = (event: Event) => event.preventDefault();
    const preventEscape = (event: KeyboardEvent) => { if (event.key === "Escape") event.preventDefault(); };
    const reopen = () => { if (node.isConnected && !node.open) node.showModal(); };
    node.addEventListener("cancel", preventCancel);
    node.addEventListener("keydown", preventEscape);
    node.addEventListener("close", reopen);
    if (!node.open) node.showModal();
    if (currentState === "required" && !uncertain) input.current?.focus();
    return () => {
      node.removeEventListener("cancel", preventCancel);
      node.removeEventListener("keydown", preventEscape);
      node.removeEventListener("close", reopen);
      if (node.open) node.close();
    };
  }, [blocked, currentState, uncertain]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || uncertain || currentState !== "required") return;
    const name = normalizedUsername(value);
    if (!name) { setError("invalid"); return; }
    if (preview) { setState("ready"); router.replace("/"); return; }
    const expected = owner.current;
    if (!expected) return;
    locked.current = true; setBusy(true); setError(null);
    const request = ++version.current;
    try {
      const result = await completeUsername(expected, name);
      if (!alive.current || request !== version.current || owner.current !== expected) return;
      if (result.ok && result.ownerId === expected && normalizedUsername(result.handle)) {
        // Refresh all mounted wallet/handle readers, keep the original deep link.
        window.location.reload();
      } else if (!result.ok && result.code === "pending") {
        pendingHash.current = result.hash ?? null; setUncertain(true);
      } else if (!result.ok && ["invalid", "taken", "failed"].includes(result.code)) {
        setError(result.code as "invalid" | "taken" | "failed");
      } else setState("unavailable");
    } catch {
      // Transport failure cannot prove that registration was not submitted.
      if (alive.current && request === version.current && owner.current === expected) setUncertain(true);
    } finally {
      locked.current = false;
      if (alive.current && request === version.current) setBusy(false);
    }
  }

  async function retry() {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    const expected = owner.current;
    try {
      if (pendingHash.current) {
        const result = await checkSubmittedTransaction(pendingHash.current);
        if (!alive.current || owner.current !== expected) return;
        if (!result.ok && !("pending" in result && result.pending)) {
          setUncertain(false); pendingHash.current = null;
        }
      }
      const confirmed = await check();
      if (confirmed?.status === "ready" && alive.current && owner.current === expected) window.location.reload();
    } catch {
      if (alive.current && owner.current === expected) setState("unavailable");
    } finally { locked.current = false; if (alive.current && owner.current === expected) setBusy(false); }
  }

  if (!blocked) return null;
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="username-title" aria-describedby="username-intro" onCancel={event => event.preventDefault()}>
    <div className={styles.content} aria-busy={busy || currentState === "checking"}>
      <span className={styles.mark} aria-hidden="true">@</span>
      <p className={styles.step}>{c.step}</p>
      <h2 id="username-title">{c.title}</h2>
      <p id="username-intro" className={styles.intro}>{c.intro}</p>
      {currentState === "checking" ? <p className={styles.status} role="status">{c.checking}</p>
        : currentState === "required" && !uncertain ? <form onSubmit={save}>
          <label className={styles.label} htmlFor="required-username">{c.label}</label>
          <div className={styles.field}><span aria-hidden="true">@</span><input ref={input} id="required-username" value={value} onChange={event => { setValue(event.target.value.replace(/^@/, "").toLowerCase()); setError(null); }} minLength={3} maxLength={32} pattern="[a-z0-9_]{3,32}" required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="your_username" disabled={busy} aria-describedby="username-hint" /></div>
          <p id="username-hint" className={styles.hint}>{c.hint}</p>
          {error ? <p className={styles.error} role="alert">{c[error]}</p> : null}
          <button className={styles.primary} type="submit" disabled={busy || !normalizedUsername(value)}>{busy ? c.saving : c.claim}</button>
        </form>
        : <><p role="alert" className={styles.status}>{uncertain ? c.pending : state === "wallet_missing" ? c.wallet : c.unavailable}</p>
          {state === "wallet_missing" ? <Link className={styles.primary} href={`/wallet/setup?next=${encodeURIComponent(destination)}`}>{c.setup}</Link>
            : <button type="button" className={styles.primary} disabled={busy} onClick={() => void retry()}>{c.retry}</button>}</>}
      <p className={styles.note}>{preview ? c.preview : c.testnet}</p>
      {!preview ? <Link className={styles.switchAccount} href={`/signin?next=${encodeURIComponent(destination)}`}>{c.switchAccount}</Link> : null}
    </div>
  </dialog>;
}
