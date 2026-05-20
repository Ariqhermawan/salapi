// Salapi Circles — types for the Build-Award PREVIEW surface.
// NO on-chain artifacts. NO live contributions. Every value here is preview
// data so a reviewer at salapi-blond.vercel.app can see the vision rendered.
// The real Circles surface (open verification, moderation, dispute handling,
// on-chain receipts) launches at Build-Award. See SOW v2 Spotlight Section 7.
// The optional `allowance` field reflects SOW Section 8 "Honest creator
// economy" - also Build-Award (stage 2), preview only here.

import type { AllowanceConfig } from "./allowance";

export type CircleCategory =
  | "disaster"
  | "medical"
  | "education"
  | "community"
  | "family"
  | "creator";

export const CATEGORY_LABEL: Record<CircleCategory, string> = {
  disaster: "Disaster relief",
  medical: "Medical",
  education: "Education",
  community: "Community",
  family: "Family",
  creator: "Creator support",
};

// Discover-screen filter buckets (mirrors the GoFundMe / Kitabisa cadence).
export type DiscoverFilter = "all" | "trending" | "closeToGoal" | "justLaunched";

export const DISCOVER_FILTER_LABEL: Record<DiscoverFilter, string> = {
  all: "All causes",
  trending: "Trending now",
  closeToGoal: "Close to goal",
  justLaunched: "Just launched",
};

// One preview donation entry in the recent-donations feed.
export type PreviewDonation = {
  id: string;
  donorLabel: string; // first name or "Anonymous"
  pesoAmount: number; // app-internal currency unit (PHP)
  whenLabel: string; // human-friendly ("2 hours ago")
  note?: string;
};

// One preview circle on the Discover screen + detail page.
export type Circle = {
  id: string;
  title: string;
  organizer: string;
  organizerLocation: string; // "Cebu, PH" / "Surabaya, ID" — borderless framing
  category: CircleCategory;
  story: string; // multi-paragraph long description (\n\n separated)
  pesoRaised: number; // PHP units (display layer converts to locale)
  pesoTarget: number; // PHP units
  donorCount: number;
  daysRemaining: number; // negative = ended
  coverGradient: [string, string]; // placeholder cover (preview, no image upload)
  recentDonations: PreviewDonation[];
  // Truthy iff this circle was created from the /circles/create flow in this
  // session (we never persist created circles — preview only).
  ephemeral?: boolean;
  // Build-Award stage 2 preview: organizer's operational allowance config.
  // Absent or { percentage: 0, tier: 0 } = day-30 default (100 percent to
  // beneficiary, no organizer cut).
  allowance?: AllowanceConfig;
};

export function progressPct(c: Pick<Circle, "pesoRaised" | "pesoTarget">): number {
  if (!(c.pesoTarget > 0)) return 0;
  return Math.min(100, Math.round((c.pesoRaised / c.pesoTarget) * 100));
}
