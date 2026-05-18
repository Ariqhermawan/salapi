"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // In development the offline-fallback SW only causes confusion: if the dev
    // server is briefly down it serves a sticky "You're offline" shell. So in
    // dev we proactively tear down any previously-registered SW + its caches,
    // and only register it for real production builds.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      if ("caches" in window) {
        caches
          .keys()
          .then((keys) => keys.forEach((k) => caches.delete(k)))
          .catch(() => {});
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* non-fatal: app still works without the SW */
    });
  }, []);
  return null;
}
