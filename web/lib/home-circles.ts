import type { Circle, CircleCategory } from "./circles/types";

// Home discovery reads the Circles fixtures, never D4 contract IDs or XLM sums.
export const HOME_CAUSE_CATEGORIES = ["all", "disaster", "medical", "education", "community", "family", "creator", "animals", "care", "volunteer"] as const;
export type HomeCauseCategory = CircleCategory | "all";
export function isHomeCauseCategory(value: string): value is HomeCauseCategory {
  return HOME_CAUSE_CATEGORIES.some(category => category === value);
}
export function homeCircleExamples(circles: readonly Circle[], category: HomeCauseCategory): Circle[] {
  return circles.filter(circle => circle.status !== "completed" && (category === "all" || circle.category === category));
}
