import type { NextConfig } from "next";

// Public flags are baked into the client bundle. A local-review build must not
// become the live app, while localhost production-mode audits and explicitly
// labelled Vercel Preview demos remain supported.
if (
  process.env.VERCEL_ENV === "production" &&
  process.env.NEXT_PUBLIC_LOCAL_PREVIEW === "1"
) {
  throw new Error(
    "Local preview is not allowed in Vercel production. Rebuild with NEXT_PUBLIC_LOCAL_PREVIEW unset or 0."
  );
}

// The Salapi APP's Content-Security-Policy is set per-request in `proxy.ts`, so
// script-src can use a fresh nonce instead of 'unsafe-inline'. This file keeps
// two things:
//   1. the non-CSP security headers, applied to every route, and
//   2. a static CSP for the /landing marketing page only.
//
// /landing is a static file in public/ with a separate policy. Next cannot
// stamp a per-request nonce into that file. App documents use the stricter
// nonce policy in proxy.ts, including the dynamically rendered /offline page.
// The matcher excludes /landing; this does not exempt app or auth routes.
const landingCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  // fonts.googleapis.com + fonts.gstatic.com allow Geist via Google Fonts on the
  // /landing marketing page (static). The app itself uses self-hosted next/font.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.stellar.org https://stellar.expert",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  // Clickjacking: the app is never meant to be framed (frame-ancestors 'none'
  // in the CSP supersedes this on modern browsers; kept for legacy coverage).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [{ source: "/landing", destination: "/landing/index.html" }];
  },
  async headers() {
    return [
      // Non-CSP security headers on every route (incl. static assets + /landing).
      { source: "/:path*", headers: securityHeaders },
      // The static landing page keeps its own inline-script CSP. The app's CSP
      // (including /offline) is owned by proxy.ts, so it is NOT set here.
      {
        source: "/landing",
        headers: [{ key: "Content-Security-Policy", value: landingCsp }],
      },
      {
        source: "/landing/:path*",
        headers: [{ key: "Content-Security-Policy", value: landingCsp }],
      },
    ];
  },
};

export default nextConfig;
