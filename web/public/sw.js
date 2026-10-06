// Minimal, conservative service worker — enables PWA install + an offline
// fallback without interfering with Next.js RSC/navigation.
const CACHE = "salapi-v3";
const ASSETS = ["/icon.svg", "/icon-maskable.svg", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // The public install metadata changes with the app's claims and icon list.
  // Refresh it from the network instead of keeping an older cached description.
  // Only the exact, same-origin manifest can enter this public cache path.
  const url = new URL(request.url);
  if (
    url.origin === self.location.origin &&
    url.pathname === "/manifest.webmanifest" &&
    !url.search
  ) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then(async (response) => {
          if (response.ok) {
            try {
              const cache = await caches.open(CACHE);
              await cache.put(request, response.clone());
            } catch {
              // A cache/storage failure must not hide fresh public metadata.
            }
          }
          return response;
        })
        .catch(async (error) => {
          const cached = await caches.match(request);
          if (cached) return cached;
          throw error;
        })
    );
    return;
  }

  // Only handle top-level navigations: network-first, offline fallback.
  if (request.mode === "navigate") {
    const { pathname } = new URL(request.url);

    // OAuth must reach the server so callback errors are not hidden behind
    // the generic offline page.
    if (pathname.startsWith("/auth/") || pathname === "/signin") return;

    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            "<!doctype html><meta charset=utf-8><title>Salapi — offline</title>" +
              "<body style='font-family:system-ui;padding:2rem;text-align:center'>" +
              "<h1>You're offline</h1><p>Reconnect to use Salapi.</p>",
            { headers: { "Content-Type": "text/html" } }
          )
      )
    );
    return;
  }

  // Static icons: cache-first.
  if (ASSETS.some((a) => request.url.endsWith(a))) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request))
    );
  }
});
