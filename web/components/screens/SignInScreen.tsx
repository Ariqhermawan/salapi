"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { T, Btn, Wordmark, TestnetPill, PoweredByStellar } from "@/components/ui/kit";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="9" fill="#fff" />
      <path d="M14.7 9.2c0-.5-.05-1-.13-1.4H9v2.7h3.2c-.14.7-.55 1.3-1.18 1.7v1.4h1.9c1.1-1 1.78-2.5 1.78-4.4z" fill="#4285F4" />
      <path d="M9 15c1.6 0 2.9-.5 3.9-1.4l-1.9-1.4c-.5.4-1.2.6-2 .6-1.5 0-2.8-1-3.3-2.4H3.7v1.5C4.7 13.7 6.7 15 9 15z" fill="#34A853" />
      <path d="M5.7 10.4c-.1-.3-.2-.7-.2-1s.1-.7.2-1V6.8H3.7C3.2 7.7 3 8.8 3 10s.3 2.3.7 3.2l2-1.5z" fill="#FBBC05" />
      <path d="M9 5.6c.9 0 1.6.3 2.2.9l1.6-1.6C11.9 4 10.6 3.5 9 3.5 6.7 3.5 4.7 4.8 3.7 6.8l2 1.5C6.2 6.6 7.5 5.6 9 5.6z" fill="#EA4335" />
    </svg>
  );
}

export default function SignInScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const configured = supabaseConfigured();

  // If auth/callback bounced us here with ?error=oauth (exchangeCodeForSession
  // failed) surface that, so the user knows why they're back on this screen
  // instead of being silently dropped. Derived during render, no setState
  // inside useEffect (React 19 react-hooks/set-state-in-effect).
  const urlError =
    searchParams?.get("error") === "oauth"
      ? "Google sign-in didn't complete. Please try again."
      : null;
  const authError = submitError ?? urlError;

  const enter = () => start(() => void router.push("/"));

  async function google() {
    if (!configured) return enter();
    setBusy(true);
    setSubmitError(null);
    try {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        setBusy(false);
        setSubmitError(error.message || "Couldn't start Google sign-in.");
      }
      // success → browser is redirecting to Google
    } catch (e) {
      setBusy(false);
      setSubmitError(
        e instanceof Error ? e.message : "Couldn't start Google sign-in."
      );
    }
  }

  const working = pending || busy;

  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%", display: "flex", flexDirection: "column", paddingBottom: 110 }}>
      <div style={{ padding: "16px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={20} />
        <TestnetPill />
      </div>

      <div style={{ padding: "56px 28px 0", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: "linear-gradient(160deg,#2563EB,#0B1220)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, boxShadow: "0 18px 40px -12px rgba(37,99,235,.5)" }}>
          <span style={{ color: "#fff", fontSize: 30, fontWeight: 700, letterSpacing: "-0.04em" }}>S.</span>
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", textAlign: "center", lineHeight: 1.2 }}>Welcome to Salapi.</div>
        <div style={{ marginTop: 6, fontSize: 14, color: T.slate, textAlign: "center" }}>Sign in to continue.</div>
      </div>

      <div style={{ padding: "40px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        {authError && (
          <div role="alert" style={{ background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA", borderRadius: 12, padding: "10px 12px", fontSize: 13, lineHeight: 1.4, textAlign: "center" }}>
            {authError}
          </div>
        )}
        <Btn kind="primary" disabled={working} loading={working} leading={!working && <GoogleMark />} onClick={google}>
          {busy ? "Redirecting to Google…" : "Continue with Google"}
        </Btn>
        <Btn kind="secondary" disabled={working} onClick={enter}>Continue with phone number</Btn>
        <Btn kind="ghost" disabled={working} onClick={enter}>Use email instead</Btn>
      </div>

      <div style={{ marginTop: "auto", padding: "24px 24px 0", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: T.slate, lineHeight: 1.6, marginBottom: 8 }}>
          {configured
            ? "Real Google sign-in via Supabase. Your own Stellar wallet is created on first login. Phone/email are sandbox seams."
            : "Sandbox sign-in seam. No real account is created. Google OAuth activates once Supabase is configured."}
        </div>
        <div style={{ fontSize: 11, color: T.slate, lineHeight: 1.6, marginBottom: 14 }}>
          By continuing, you agree to our Terms and Privacy Policy.
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <PoweredByStellar />
        </div>
      </div>
    </div>
  );
}
