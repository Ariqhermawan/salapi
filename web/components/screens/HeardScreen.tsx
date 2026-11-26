"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitSignupSource } from "@/app/referral-actions";
import { useT } from "@/components/I18nProvider";
import { Btn } from "@/components/ui/kit";
import { signupSourceCopy } from "@/lib/i18n/signup-source";
import { SIGNUP_SOURCE_CHOICES, referralCode, type SignupSourceChoice } from "@/lib/referral";
import type { readSignupSource } from "@/lib/server/referrals";
import styles from "./InviteScreen.module.css";

export default function HeardScreen({ signup, destination }: {
  signup: Awaited<ReturnType<typeof readSignupSource>>;
  destination: string;
}) {
  const router = useRouter();
  const { locale, t } = useT();
  const c = signupSourceCopy[locale];
  const [choice, setChoice] = useState<SignupSourceChoice | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"invalid" | "unavailable" | null>(null);
  const source = signup.status === "ready" ? signup.source : null;
  const preview = signup.status === "preview";
  const canAnswer = source === "unanswered";
  const groupedCode = code.replace(/^(.{4})(.+)$/, "$1 $2");
  const codeInvalid = error === "invalid" || (code.length === 8 && !referralCode(code));

  async function continueToApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAnswer || !choice || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitSignupSource(choice, choice === "referral" ? code : "");
      if (result === "saved" || result === "alreadyAnswered") {
        router.replace(destination);
        return;
      }
      setError(result);
    } catch {
      setError("unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`${styles.screen} ${preview ? styles.sourcePreview : ""}`} onSubmit={continueToApp}>
      <div className={styles.body}>
        <h1 className={styles.question}>{c.title}</h1>
        {canAnswer || preview ? <>
          <fieldset className={styles.options} disabled={busy}>
            <legend className="sr-only">{c.title}</legend>
            {SIGNUP_SOURCE_CHOICES.map(option => (
              <label key={option} className={styles.option}>
                <span><strong>{c[option]}</strong><small>{c[`${option}Note`]}</small></span>
                <input type="radio" name="signup-source" value={option} checked={choice === option}
                  onChange={() => { setChoice(option); setError(null); }} />
              </label>
            ))}
          </fieldset>
          {choice === "referral" && <div className={`${styles.card} ${styles.manualCode}`}>
            <label htmlFor="signup-code">{c.code}</label>
            <input id="signup-code" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={groupedCode}
              aria-describedby="signup-code-hint" aria-invalid={codeInvalid} disabled={busy}
              onChange={event => { setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)); setError(null); }} />
            <p id="signup-code-hint" role={codeInvalid ? "alert" : undefined}>{codeInvalid ? c.codeInvalid : c.codeHint}</p>
          </div>}
          {preview && <p className={`${styles.note} ${styles.previewNotice}`}>{c.preview}</p>}
          {error === "unavailable" && <p role="alert" className={styles.note}>{c.unavailable}</p>}
        </> : <div className={styles.card}>
          {signup.status === "guest" ? <Link href="/signin">{t("signin.signIn")}</Link>
            : signup.status === "unavailable" ? <p role="alert">{c.unavailable}</p>
            : source ? <><p>{c.saved}</p><strong>{source === "invite_link" ? c.inviteLink : c[source]}</strong></>
            : <p>{c.noSource}</p>}
        </div>}
        <Image className={styles.art} src={preview ? "/prototype-causes/doodle-people.png" : "/illustrations/referral-people.png"} alt="" width={230} height={230} unoptimized />
      </div>
      <div className={`${styles.actions} ${styles.single}`}>
        {canAnswer || preview ? <Btn type="submit" disabled={preview || !choice || (choice === "referral" && code !== "" && !referralCode(code)) || busy} loading={busy}>{c.continue}</Btn>
          : <Btn type="button" onClick={() => router.replace(destination)}>{c.continue}</Btn>}
      </div>
    </form>
  );
}
