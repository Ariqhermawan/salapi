import type { NextConfig } from "next";

// The Salapi APP's Content-Security-Policy is set per-request in `proxy.ts`, so
// script-src can use a fresh nonce instead of 'unsafe-inline'. This file keeps
// two things:
//   1. the non-CSP security headers, applied to every route, and
//   2. a static CSP for the /landing marketing page only.
//
// /landing is a static file in public/ with two legitimate inline <script>
// blocks (sticky-nav + the flowing-ribbon canvas). Next cannot stamp a nonce
// into a static file, so /landing keeps 'unsafe-inline' for those scripts. It
// carries no user data, so its XSS surface is effectively nil. Every other route
// is an app document that gets the stricter nonce CSP from proxy.ts (including
// /offline, a normal dynamic page); the two never overlap because proxy.ts's
// matcher excludes /landing.
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
