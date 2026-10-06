import type { Circle, CircleCategory, DiscoverFilter } from "./circles/types";

// Home discovery reads the Circles fixtures, never D4 contract IDs or XLM sums.
export const HOME_CAUSE_CATEGORIES = ["all", "disaster", "medical", "education", "community", "family", "creator", "animals", "care", "volunteer"] as const;
export type HomeCauseCategory = CircleCategory | "all";
export function isHomeCauseCategory(value: string): value is HomeCauseCategory {
  return HOME_CAUSE_CATEGORIES.some(category => category === value);
}
export function homeCircleExamples(circles: readonly Circle[], category: HomeCauseCategory): Circle[] {
  return circles.filter(circle => circle.status !== "completed" && (category === "all" || circle.category === category));
}

// Treat browser history UI state as untrusted. Only category, card index and
// sort are restored; this never parses money, identity or transaction state.
export function parseCauseViewState(snapshot: string): { category: HomeCauseCategory; index: number; sort: DiscoverFilter } {
  const fallback = { category: "all" as HomeCauseCategory, index: 0, sort: "all" as DiscoverFilter };
  if (!snapshot || snapshot.length > 2048) return fallback;
  try {
    const value: unknown = JSON.parse(snapshot);
    if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
    const state = value as Record<string, unknown>;
    return {
      category: typeof state.category === "string" && isHomeCauseCategory(state.category) ? state.category : "all",
      index: typeof state.index === "number" && Number.isSafeInteger(state.index) && state.index >= 0 && state.index < 100 ? state.index : 0,
      sort: state.sort === "trending" || state.sort === "closeToGoal" || state.sort === "justLaunched" ? state.sort : "all",
    };
  } catch { return fallback; }
}
