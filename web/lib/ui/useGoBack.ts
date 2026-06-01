"use client";

import { useRouter } from "next/navigation";

// Back navigation that returns the user to where they ACTUALLY came from
// (browser history) instead of dumping them on a hardcoded route. Many screens
// previously hardcoded `router.push("/")` as their back action, so pressing back
// after drilling in from Vaults/Settings/Circles sent the user to Home rather
// than the parent they came from.
//
// `fallback` is only used on a cold/direct load (deep link, refresh, share-open)
// where there is no in-app history entry to pop — there, send the user to a
// sensible parent instead of letting `router.back()` leave the app.
export function useGoBack(fallback: string = "/") {
  const router = useRouter();
  return () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  };
}
