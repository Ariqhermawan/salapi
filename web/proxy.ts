// Next 16: Middleware is now "Proxy" (proxy.ts at project root). This proxy has
// two jobs on each request:
//
//   1. Refresh the Supabase auth session (rotate tokens via cookies). No-op when
//      Supabase env is absent, so the app keeps working on the shared demo signer
//      until auth is configured.
//   2. Apply a per-request nonce Content-Security-Policy to app document routes,
//      replacing 'unsafe-inline' in script-src. Next.js reads the nonce from the
//      request's CSP header and stamps it onto its own <script> tags during SSR;
//      app/layout.tsx forces dynamic rendering (connection()) so the nonce is
//      always present.
//
// CSP is applied conditionally (shouldSetCsp): NOT to /landing (a static file in
// public/ whose two inline scripts cannot be nonced — it keeps the 'unsafe-inline'
// CSP from next.config.ts), NOT to /api (no HTML), and NOT to static assets.
// style-src deliberately keeps 'unsafe-inline' because the app uses inline style
// attributes, which a nonce cannot cover; this change only tightens script-src.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON, supabaseConfigured } from "@/lib/supabase/env";

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    // 'strict-dynamic' lets the nonce'd Next bootstrap load the app bundles;
    // 'self' is the fallback for browsers without strict-dynamic. 'unsafe-eval'
    // is dev-only (React's error overlay uses eval); production never gets it,
    // matching the previous policy.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.stellar.org https://stellar.expert",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
}

// The nonce CSP belongs only on HTML documents Next renders. Skip /landing (a
// static file that keeps its own CSP), /api (no HTML), and any static asset
// (path with a file extension). Everything else is an app document route.
function shouldSetCsp(pathname: string): boolean {
  if (pathname === "/landing" || pathname.startsWith("/landing/")) return false;
  if (pathname === "/api" || pathname.startsWith("/api/")) return false;
  if (/\.[^/]+$/.test(pathname)) return false;
  return true;
}

export async function proxy(request: NextRequest) {
  const wantsCsp = shouldSetCsp(request.nextUrl.pathname);
  const nonce = wantsCsp
    ? Buffer.from(crypto.randomUUID()).toString("base64")
    : "";
  const csp = wantsCsp ? buildCsp(nonce) : "";

  // Headers forwarded to the renderer. Carry the nonce + CSP so Next can stamp
  // the nonce onto its <script> tags during SSR.
  const requestHeaders = new Headers(request.headers);
  if (wantsCsp) {
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
  }

  const withCsp = (res: NextResponse) => {
    if (wantsCsp) res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  // No Supabase configured: attach the CSP (if any) and continue. The app runs
  // on the shared demo signer in this mode.
  if (!supabaseConfigured()) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  let response = withCsp(
    NextResponse.next({ request: { headers: requestHeaders } })
  );

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        // Re-sync the forwarded request's Cookie header from the (now rotated)
        // cookie jar so an in-request server read sees the fresh session, then
        // rebuild the response carrying the nonce + the Set-Cookie for the browser.
        requestHeaders.set(
          "cookie",
          request.cookies
            .getAll()
            .map((c) => `${c.name}=${c.value}`)
            .join("; ")
        );
        response = withCsp(
          NextResponse.next({ request: { headers: requestHeaders } })
        );
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Touch the session so Supabase rotates tokens via the cookies above.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    // Run on every route EXCEPT Next internals and the static assets the app
    // serves from public/ + the static /landing page (which keeps its own CSP
    // from next.config.ts and needs no session refresh). The file/asset tokens
    // are anchored ($ / (?:/|$)) so a future route like "/landing-promo" is NOT
    // wrongly excluded — the classic Next prefix-lookahead footgun. The /offline
    // app page is intentionally NOT excluded: it is a normal dynamic route (the
    // service worker serves its own inline offline HTML, never the /offline
    // route), so it gets the nonce CSP like every other page. CSP is further
    // narrowed per-request by shouldSetCsp(); session refresh runs on the rest.
    "/((?!_next/static|_next/image|favicon\\.ico$|manifest\\.webmanifest$|sw\\.js$|icon\\.svg$|icon-maskable\\.svg$|landing(?:/|$)).*)",
  ],
};
