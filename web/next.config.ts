import type { NextConfig } from "next";

// Baseline production hardening headers. These are the unambiguous, non-breaking
// set — no Content-Security-Policy here on purpose: the app is built entirely
// from inline style attributes + Next.js hydration scripts + Supabase/Stellar
// XHR origins, so an enforcing CSP needs to be tuned and tested against the live
// origins before it can be turned on without breaking the app. React already
// escapes rendered values (no dangerouslySetInnerHTML in the codebase), so the
// primary XSS vector is already mitigated; CSP is defense-in-depth to add next.
const securityHeaders = [
  // Clickjacking: the app is never meant to be framed.
  { key: "X-Frame-Options", value: "DENY" },
  // Stop MIME sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak full URLs (which can carry circle ids / handles) cross-origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app uses none of these device APIs — lock them down.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Force HTTPS for a year (Vercel serves HTTPS). No `preload` — that's a
  // separate, hard-to-undo commitment to the browser preload list.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
