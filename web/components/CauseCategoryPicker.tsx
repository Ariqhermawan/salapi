"use client";
import type { Circle, CircleCategory } from "@/lib/circles/types";
import type { Locale } from "@/lib/i18n/config";
import { circlesCopy, circlesCategory } from "@/lib/i18n/revamp-circles";
import CauseCategoryDoodle from "@/components/ui/CauseCategoryDoodle";
import s from "./CauseCategoryPicker.module.css";

export const CAUSE_CATEGORIES = ["all", "animals", "care", "volunteer", "disaster", "medical", "education", "community", "family", "creator"] as const;
type Category = CircleCategory | "all";

export default function CauseCategoryPicker({ circles, selected, locale, onSelect }: {
  circles: readonly Circle[];
  selected: Category;
  locale: Locale;
  onSelect: (category: Category) => void;
}) {
  const c = circlesCopy(locale);
  const counts: Record<Category, number> = { all: circles.length, animals: 0, care: 0, volunteer: 0, disaster: 0, medical: 0, education: 0, community: 0, family: 0, creator: 0 };
  for (const circle of circles) counts[circle.category]++;
  return <div className={s.picker} role="group" aria-label={c("Example cause categories")}>
    {CAUSE_CATEGORIES.map(category => {
      const label = category === "all" ? c("All examples") : circlesCategory(locale, category);
      const count = counts[category];
      return <button key={category} type="button" className={s.tile} data-category={category} aria-label={label} aria-pressed={selected === category} onClick={() => onSelect(category)}>
        <span className={s.art} aria-hidden="true"><CauseCategoryDoodle category={category}/></span>
        <span className={s.label}>{label}</span>
        <span className={s.count}>{c(count === 1 ? "{count} example" : "{count} examples", { count })}</span>
        {selected === category ? <span className={s.selectedMark} aria-hidden="true"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8 3 3 7-7"/></svg></span> : null}
      </button>;
    })}
  </div>;
}
