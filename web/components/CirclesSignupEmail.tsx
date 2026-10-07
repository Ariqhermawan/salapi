"use client";

import { useT } from "@/components/I18nProvider";
import { circlesCopy } from "@/lib/i18n/revamp-circles";
import type { SignupIdentityState } from "@/lib/ui/useCirclesSignupIdentity";
import styles from "./CirclesSignupEmail.module.css";

export default function CirclesSignupEmail({ identity, email, onChange, refresh, pending, id }: {
  identity: SignupIdentityState; email: string; onChange(value: string): void;
  refresh(): void; pending: boolean; id: string;
}) {
  const { locale } = useT();
  const c = circlesCopy(locale);
  if (identity.status === "loading") return <p className={styles.notice} role="status">{c("Checking your signed-in email…")}</p>;
  if (identity.status === "verified") return <section className={styles.account} aria-label={c("Email from your verified account")}>
    <span>{identity.source === "google" ? c("Your verified Google email") : c("Your verified account email")}</span>
    <strong>{identity.email}</strong>
    <p>{c("No need to enter it again. The server checks this email again when you subscribe.")}</p>
  </section>;
  if (identity.status !== "guest") return <div className={styles.notice} role="status">
    <p>{identity.status === "unverified" ? c("Verify your account email before subscribing. Nothing was saved.") : c("Your account could not be verified. Nothing was saved. Try again.")}</p>
    <button type="button" disabled={pending} onClick={refresh}>{c("Check account again")}</button>
  </div>;
  return <label className={styles.field} htmlFor={id}>{c("Email address")}
    <input id={id} type="email" autoComplete="email" required maxLength={200} value={email}
      onChange={event => onChange(event.target.value)} disabled={pending} placeholder="you@example.com" />
  </label>;
}
