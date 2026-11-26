import { safeAppFallback } from "./ui/app-navigation.ts";

export const SIGNUP_SOURCE_CHOICES = ["direct", "referral", "community"] as const;
export type SignupSourceChoice = typeof SIGNUP_SOURCE_CHOICES[number];
export type SignupSource = SignupSourceChoice | "invite_link" | "unanswered";

export function isSignupSourceChoice(value: unknown): value is SignupSourceChoice {
  return SIGNUP_SOURCE_CHOICES.some(choice => choice === value);
}

export function referralCode(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-F0-9]{8}$/.test(code) ? code : null;
}

export function referralCodeFromNext(path: string): string | null {
  const match = /^\/r\/([A-Fa-f0-9]{8})$/.exec(path);
  return match ? referralCode(match[1]) : null;
}

export function signupReturnPath(raw: string): string {
  const url = safeAppFallback(raw);
  return /^\/(?:you\/heard|signin|r|wallet\/setup)(?:[/?#]|$)/.test(url) ? "/" : url;
}

/** Only accept attribution near account creation and its initial sign-in. */
export function referralSignupEligible(createdAt: string, lastSignInAt?: string, now = Date.now()): boolean {
  const created = Date.parse(createdAt);
  const signedIn = Date.parse(lastSignInAt ?? "");
  return created <= signedIn && signedIn <= now
    && now - created <= 5 * 60_000 && signedIn - created <= 2 * 60_000;
}
