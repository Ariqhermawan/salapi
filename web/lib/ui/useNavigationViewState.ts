"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getNavigationViewStateSnapshot, subscribeNavigationViewState } from "./app-navigation";

const serverSnapshot = () => "";

// UI-only, per-history-entry snapshots. Server markup starts with the neutral
// view; React reconciles the saved browser view at hydration without an effect
// that copies browser state into React state or stores any financial data.
export function useNavigationViewState(key: "home-circles" | "circles-discovery") {
  const snapshot = useCallback(() => getNavigationViewStateSnapshot(key), [key]);
  return useSyncExternalStore(subscribeNavigationViewState, snapshot, serverSnapshot);
}
