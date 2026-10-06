"use client";

import { useRouter } from "next/navigation";
import { claimAppBack, safeAppFallback } from "./app-navigation";

// Browser history length includes external sites. Only pop a predecessor that
// our app recorded; replace a direct/unknown entry instead of creating a loop.
export function useGoBack(fallback: string = "/") {
  const router = useRouter();
  return () => {
    const decision = claimAppBack();
    if (decision === "back") router.back();
    else if (decision === "fallback") router.replace(safeAppFallback(fallback));
  };
}
