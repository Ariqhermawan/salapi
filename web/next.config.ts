import type { NextConfig } from "next";

// Content-Security-Policy tuned to Salapi's real origins. The app is built from
// 100% inline style attributes + Next.js inline hydration scripts, so
// 'unsafe-inline' is required for style-src and script-src — a nonce-based CSP
// would need middleware + per-request nonce threading (a larger change, tracked
// separately). Even so, the policy pins object/base/frame/form-action and
// restricts connect/img/font/worker to known origins, closing the main
// injection surface. React already escapes rendered values and the codebase has
// no dangerouslySetInnerHTML, so the primary XSS vector is already mitigated.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // Browser-side network: Supabase (auth / session / realtime) and the Stellar
  // testnet endpoints + explorer (defensive — chain calls are server-side today).
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.stellar.org https://stellar.expert",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Clickjacking: the app is never meant to be framed (frame-ancestors 'none'
  // above supersedes this on modern browsers; kept for legacy coverage).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
