import type { Circle, CircleCategory, DiscoverFilter } from "./circles/types";
import type { Campaign } from "./campaign";

// Fictional stories remain separate from their explicitly linked QA ledger data.
export const HOME_CAUSE_CATEGORIES = ["all", "disaster", "medical", "education", "community", "family", "creator", "animals", "care", "volunteer"] as const;
export type HomeCauseCategory = CircleCategory | "all";
export function isHomeCauseCategory(value: string): value is HomeCauseCategory {
  return HOME_CAUSE_CATEGORIES.some(category => category === value);
}
export function homeCircleExamples(circles: readonly Circle[], category: HomeCauseCategory): Circle[] {
  return circles.filter(circle => circle.status !== "completed" && (category === "all" || circle.category === category));
}

export function homeStandaloneCampaigns(circles: readonly Circle[], campaigns: readonly Omit<Campaign, "contribution">[], links: Readonly<Record<string, string>>): Omit<Campaign, "contribution">[] {
  const represented = new Set(circles.filter(circle => circle.status !== "completed").map(circle => circle.id));
  return campaigns.filter(campaign => !represented.has(links[campaign.id]));
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
      index: typeof state.index === "number" && Number.isSafeInteger(state.index) && state.index >= 0 && state.index < 1027 ? state.index : 0,
      sort: state.sort === "trending" || state.sort === "closeToGoal" || state.sort === "justLaunched" ? state.sort : "all",
    };
  } catch { return fallback; }
}
