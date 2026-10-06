// Synthetic Circles fixture catalog. Every cause, organizer, amount, review,
// date and update is fictional demo data, not an appeal, payment or verification.
// Generated photos illustrate scenes; they are not documentary proof.
import type { Circle, CircleCategory, CircleUpdate } from "./types";
import { getOrganizer } from "./organizers";

type CauseSpec = {
  id: string;
  title: string;
  organizerId: string;
  category: CircleCategory;
  purpose: string;
  scene: string;
  raised: number;
  target: number;
  pct: number;
  donors: number;
  days: number;
  completedOn?: string;
};

const gradients: Record<CircleCategory, [string, string]> = {
  disaster: ["#B45309", "#F59E0B"], medical: ["#059669", "#10B981"],
  education: ["#4C2F8A", "#7C3AED"], community: ["#1D4ED8", "#3B82F6"],
  family: ["#2E5DA0", "#0EA5E9"], creator: ["#9C4221", "#F97316"],
  animals: ["#9C5320", "#FBBF24"], care: ["#9D4376", "#F472B6"],
  volunteer: ["#286344", "#34D399"],
};

function daysBefore(date: string, days: number): string {
  return new Date(Date.parse(date + "T00:00:00Z") - days * 86_400_000).toISOString().slice(0, 10);
}

function updatesFor(spec: CauseSpec, image: string): CircleUpdate[] {
  const lastDate = spec.completedOn ?? "2026-10-05";
  return [
    {
      id: spec.id + "-milestone", title: "Example planning milestone", date: daysBefore(lastDate, 12), kind: "milestone",
      body: "Fictional demo update: the sample organizer outlines a proposal for " + spec.purpose + ". Names, progress and consultation are invented; no actual project or payment is established.",
      image, proofLabel: "Synthetic planning note, not verified proof",
    },
    {
      id: spec.id + "-spend", title: "Example spending breakdown", date: daysBefore(lastDate, 6), kind: "spend",
      body: "Fictional demo update: an illustrative budget line shows how materials and practical support for " + spec.purpose + " could be recorded. The displayed expense is synthetic; no funds moved and no receipt was verified.",
      amountPHP: Math.round(spec.raised * 0.08), image, proofLabel: "Synthetic expense example, not a payment receipt",
    },
    {
      id: spec.id + "-delivery", title: spec.completedOn ? "Example completion and delivery" : "Example delivery progress", date: lastDate, kind: "delivery",
      body: "Fictional demo update: the generated scene illustrates the intended benefit of " + spec.purpose + ". " + (spec.completedOn ? "This completed status belongs only to the demo history." : "This sample cause remains open in the demo.") + " No real delivery, beneficiary or donation has been verified.",
      image, proofLabel: "Generated illustration, not verified delivery evidence",
    },
  ];
}

function cause(spec: CauseSpec): Circle {
  const organizer = getOrganizer(spec.organizerId);
  if (!organizer) throw new Error("Missing fictional organizer: " + spec.organizerId);
  const coverImage = "/circles/generated/" + spec.id + ".png";
  return {
    id: spec.id, title: spec.title, organizerId: organizer.id,
    organizer: organizer.name, organizerLocation: organizer.location, category: spec.category,
    summary: "Fictional example: " + spec.purpose + ".",
    story: "This fictional Circles cause explores " + spec.purpose + ". The organizer, circumstances and generated imagery are invented for an interactive demonstration.\n\nThe displayed goal, raised amount, contributor count, dates and progress updates are synthetic examples. They are not records of actual donations, verified identity or delivered aid.\n\nA proposed organizer-operations allocation is shown separately from the beneficiary share. This prototype has no payment or allocation contract and establishes no platform fee.",
    pesoRaised: spec.raised, pesoTarget: spec.target, donorCount: spec.donors,
    daysRemaining: spec.completedOn ? 0 : spec.days, coverGradient: gradients[spec.category],
    status: spec.completedOn ? "completed" : "funding",
    ...(spec.completedOn ? { completedOn: spec.completedOn } : {}),
    coverImage, imageAlt: "Generated illustrative scene of " + spec.scene + "; fictional demo, not verified evidence",
    recentDonations: [250, 500, 1000].map((pesoAmount, index) => ({
      id: spec.id + "-supporter-" + (index + 1), donorLabel: "Example supporter " + (index + 1),
      pesoAmount, whenLabel: "Synthetic demo entry", note: "Fictional contribution example. No payment was made.",
    })),
    allowance: {
      percentage: spec.pct, tier: spec.pct === 0 ? 0 : spec.pct <= 5 ? 1 : 2,
      organizerName: organizer.name, proofRequired: spec.pct > 0, escrowed: spec.pct > 0,
      pesoAccrued: Math.round(spec.raised * spec.pct / 100),
    },
    updates: updatesFor(spec, coverImage),
  };
}

// Exactly three active examples in each of nine sectors, with three distinct
// organizers per sector. The six original IDs and PHP amounts are preserved.
const activeSpecs: CauseSpec[] = [
  { id: "tino-relief", title: "Tino survivors, Cebu - rebuild a fishing barangay", organizerId: "maria-cebu", category: "disaster", purpose: "coastal families repairing boats and shared livelihood spaces", scene: "fishing families repairing small boats beside a coastal village", raised: 184_500, target: 250_000, pct: 0, donors: 312, days: 18 },
  { id: "ate-mei-dialysis", title: "Ate Mei needs dialysis - 12 sessions to stabilize", organizerId: "mei-family", category: "medical", purpose: "family-led support for dialysis-related care and clinic access", scene: "a caring family beside an adult patient in a dialysis clinic", raised: 62_300, target: 180_000, pct: 5, donors: 87, days: 25 },
  { id: "arisan-banjir-jakarta", title: "Banjir Jakarta Utara - dapur umum untuk 200 keluarga", organizerId: "karang-taruna-rw06", category: "disaster", purpose: "a North Jakarta community kitchen offering meals after flooding", scene: "volunteers preparing boxed meals in an Indonesian community kitchen", raised: 96_750, target: 200_000, pct: 0, donors: 421, days: 11 },
  { id: "barangay-library", title: "Build a barangay library for 300 kids in Bohol", organizerId: "teachers-tubigon", category: "education", purpose: "books, shelves and welcoming reading space for a community library", scene: "children reading storybooks inside a bright small community library", raised: 38_900, target: 150_000, pct: 8, donors: 54, days: 60 },
  { id: "ofw-family-tuition", title: "Help Tita Ana keep her three kids in school this term", organizerId: "ana-family", category: "family", purpose: "family support for school costs and learning supplies", scene: "a parent helping three schoolchildren prepare notebooks at home", raised: 47_200, target: 75_000, pct: 0, donors: 138, days: 9 },
  { id: "creator-baybayin", title: "Print 1,000 free Baybayin learning zines", organizerId: "kapatid-tinta", category: "creator", purpose: "printing and sharing handmade Baybayin learning zines", scene: "a Filipino artist arranging hand-drawn learning zines in a studio", raised: 24_400, target: 60_000, pct: 7, donors: 92, days: 22 },
  { id: "cebu-family-home", title: "A safer home for the Ramos family", organizerId: "maria-cebu", category: "family", purpose: "repair materials for a safer coastal family home", scene: "a family carrying repair materials toward a modest coastal home", raised: 45_600, target: 120_000, pct: 2, donors: 76, days: 31 },
  { id: "cebu-community-water", title: "A shared water point for a Cebu neighborhood", organizerId: "maria-cebu", category: "community", purpose: "a shared neighborhood tap and clean-water containers", scene: "neighbors installing a shared tap beside clean-water containers", raised: 28_500, target: 95_000, pct: 3, donors: 58, days: 27 },
  { id: "quezon-afterclass", title: "After-class learning kits in Quezon City", organizerId: "mei-family", category: "education", purpose: "books and learning kits for an after-class neighborhood group", scene: "children studying together with books at a neighborhood table", raised: 19_600, target: 70_000, pct: 5, donors: 43, days: 36 },
  { id: "quezon-family-roof", title: "A dry roof for the Santos family", organizerId: "mei-family", category: "family", purpose: "roof panels and practical repairs for a small family home", scene: "a family inspecting roof panels beside their small urban home", raised: 37_200, target: 110_000, pct: 0, donors: 64, days: 23 },
  { id: "jakarta-river-cleanup", title: "River clean-up tools for neighborhood volunteers", organizerId: "karang-taruna-rw06", category: "community", purpose: "shared gloves, collection tools and river-care sessions", scene: "Indonesian neighbors collecting litter along a calm urban river", raised: 31_500, target: 85_000, pct: 3, donors: 83, days: 20 },
  { id: "jakarta-community-mural", title: "A neighborhood mural made by local artists", organizerId: "karang-taruna-rw06", category: "creator", purpose: "paint and shared materials for a neighborhood wall mural", scene: "young Indonesian artists painting a colorful neighborhood wall mural", raised: 17_900, target: 55_000, pct: 5, donors: 49, days: 29 },
  { id: "bohol-health-screening", title: "A community health-screening day in Bohol", organizerId: "teachers-tubigon", category: "medical", purpose: "a sample neighborhood health-screening and referral day", scene: "a nurse checking blood pressure at a rural community clinic", raised: 42_700, target: 130_000, pct: 2, donors: 71, days: 32 },
  { id: "bohol-reading-zine", title: "Reading zines made with Bohol teachers", organizerId: "teachers-tubigon", category: "creator", purpose: "teacher-made reading zines and simple illustration supplies", scene: "teachers folding illustrated reading zines around a wooden table", raised: 12_800, target: 48_000, pct: 10, donors: 38, days: 41 },
  { id: "tarlac-storm-packs", title: "Storm-preparedness packs for Tarlac families", organizerId: "ana-family", category: "disaster", purpose: "household storm-preparedness packs and essential supplies", scene: "volunteers packing flashlights and supplies into emergency bags", raised: 26_400, target: 90_000, pct: 0, donors: 57, days: 24 },
  { id: "tarlac-school-kits", title: "School kits for a new term in Tarlac", organizerId: "ana-family", category: "education", purpose: "backpacks, notebooks and classroom stationery for a school term", scene: "children receiving colorful backpacks and notebooks outside a classroom", raised: 33_500, target: 100_000, pct: 3, donors: 89, days: 19 },
  { id: "manila-medical-transport", title: "Clinic transport for neighbors in Manila", organizerId: "kapatid-tinta", category: "medical", purpose: "accessible transport arrangements for neighborhood clinic visits", scene: "a volunteer helping an older adult enter a community van", raised: 29_800, target: 80_000, pct: 8, donors: 62, days: 28 },
  { id: "manila-community-makerspace", title: "A shared makerspace for Manila neighbors", organizerId: "kapatid-tinta", category: "community", purpose: "shared worktables and hand tools for a neighborhood makerspace", scene: "neighbors assembling wooden worktables in a bright shared workshop", raised: 51_300, target: 160_000, pct: 10, donors: 104, days: 45 },
  { id: "cats-recovery", title: "Clinic recovery for injured cats", organizerId: "paws-home", category: "animals", purpose: "veterinary recovery supplies and foster care for injured cats", scene: "a veterinarian gently examining a recovering cat in a clean clinic", raised: 28_000, target: 90_000, pct: 3, donors: 63, days: 26 },
  { id: "dogs-rescue-care", title: "Rescue care and foster supplies for dogs", organizerId: "maria-cebu", category: "animals", purpose: "rescue-dog care supplies and peaceful foster spaces", scene: "a volunteer caring for rescued dogs beside a peaceful foster yard", raised: 34_000, target: 120_000, pct: 5, donors: 75, days: 30 },
  { id: "shared-animal-shelter", title: "Repairing a shared animal shelter", organizerId: "teachers-tubigon", category: "animals", purpose: "shelter repairs and shaded kennels for rescued animals", scene: "shelter volunteers repairing shaded kennels beside calm rescued animals", raised: 46_000, target: 150_000, pct: 0, donors: 96, days: 38 },
  { id: "orphanage-learning-room", title: "A learning room for children in care", organizerId: "ruang-peduli", category: "care", purpose: "books and a welcoming learning room for children in care", scene: "care workers arranging books inside a bright children's learning room", raised: 23_000, target: 100_000, pct: 3, donors: 59, days: 33 },
  { id: "elder-home-meals", title: "Warm meals for an example elder home", organizerId: "ana-family", category: "care", purpose: "warm shared meals and practical support for older neighbors", scene: "a care volunteer serving warm meals to elders at a dining table", raised: 29_000, target: 95_000, pct: 0, donors: 68, days: 25 },
  { id: "community-free-kitchen", title: "Community free-meal kitchen supplies", organizerId: "karang-taruna-rw06", category: "care", purpose: "supplies and cooking equipment for a community free-meal kitchen", scene: "neighbors preparing free meals together in a clean community kitchen", raised: 43_000, target: 130_000, pct: 5, donors: 102, days: 28 },
  { id: "river-volunteer-kit", title: "Shared safety kits for river volunteers", organizerId: "lintas-alam", category: "volunteer", purpose: "shared gloves, collection tools and safety equipment for river volunteers", scene: "volunteers sorting gloves and safety vests beside a green river", raised: 21_000, target: 75_000, pct: 3, donors: 53, days: 22 },
  { id: "flood-volunteer-logistics", title: "Flood-response volunteer logistics", organizerId: "mei-family", category: "volunteer", purpose: "relief-crate transport and organized volunteer logistics in a flood scenario", scene: "volunteers loading relief crates into a van near a shelter", raised: 32_000, target: 115_000, pct: 5, donors: 81, days: 21 },
  { id: "forest-fire-volunteer-safety", title: "Safety supplies for forest-fire volunteers", organizerId: "kapatid-tinta", category: "volunteer", purpose: "protective supplies and water-station logistics for trained forest-safety volunteers", scene: "trained volunteers checking protective supplies at a forest safety station", raised: 25_000, target: 140_000, pct: 0, donors: 66, days: 35 },
];

// Three completed fictional history entries per organizer. Completion describes
// only the fixture scenario, not evidence of actual fundraising or delivery.
const completedSpecs: CauseSpec[] = [
  { id: "cebu-boat-repairs", title: "Fishing boat repair supplies", organizerId: "maria-cebu", category: "disaster", purpose: "repair supplies for small fishing boats", scene: "repaired small fishing boats lined along a sunny shore", raised: 82_000, target: 82_000, pct: 0, donors: 114, days: 0, completedOn: "2026-06-20" },
  { id: "cebu-home-rebuild", title: "A rebuilt family kitchen", organizerId: "maria-cebu", category: "family", purpose: "repairs to a modest family kitchen", scene: "a family sharing breakfast inside a freshly repaired modest kitchen", raised: 63_500, target: 63_500, pct: 2, donors: 86, days: 0, completedOn: "2026-07-18" },
  { id: "cebu-water-tanks", title: "Rainwater tanks for shared use", organizerId: "maria-cebu", category: "community", purpose: "rainwater tanks for shared neighborhood use", scene: "neighbors standing beside newly installed community rainwater tanks", raised: 74_000, target: 74_000, pct: 3, donors: 101, days: 0, completedOn: "2026-08-15" },
  { id: "quezon-medical-rides", title: "Clinic transport for neighbors", organizerId: "mei-family", category: "medical", purpose: "transport support for routine neighborhood clinic visits", scene: "a family returning from a clinic beside a clean transport van", raised: 42_000, target: 42_000, pct: 5, donors: 67, days: 0, completedOn: "2026-06-25" },
  { id: "quezon-learning-corner", title: "A family learning corner", organizerId: "mei-family", category: "education", purpose: "books and supplies for a family learning corner", scene: "children reading beside neatly arranged books and learning supplies", raised: 28_000, target: 28_000, pct: 3, donors: 46, days: 0, completedOn: "2026-07-23" },
  { id: "quezon-roof-repair", title: "Storm-damaged roof repair", organizerId: "mei-family", category: "family", purpose: "a sturdy roof repair above a small home", scene: "workers finishing a sturdy roof above a modest house", raised: 57_000, target: 57_000, pct: 0, donors: 79, days: 0, completedOn: "2026-08-20" },
  { id: "jakarta-flood-meals", title: "Community meals after flooding", organizerId: "karang-taruna-rw06", category: "disaster", purpose: "boxed community meals in a flood-recovery scenario", scene: "volunteers handing boxed meals across an Indonesian shelter table", raised: 68_000, target: 68_000, pct: 0, donors: 126, days: 0, completedOn: "2026-07-02" },
  { id: "jakarta-river-tools", title: "Shared river-cleanup equipment", organizerId: "karang-taruna-rw06", category: "community", purpose: "shared gloves and litter-collection tools for volunteers", scene: "neighborhood volunteers storing gloves and litter-collection tools", raised: 35_000, target: 35_000, pct: 3, donors: 72, days: 0, completedOn: "2026-07-31" },
  { id: "jakarta-lane-mural", title: "A finished neighborhood mural", organizerId: "karang-taruna-rw06", category: "creator", purpose: "a completed neighborhood wall-mural illustration", scene: "residents admiring a finished colorful mural along a narrow lane", raised: 46_000, target: 46_000, pct: 5, donors: 91, days: 0, completedOn: "2026-08-31" },
  { id: "bohol-reading-shelves", title: "New shelves for young readers", organizerId: "teachers-tubigon", category: "education", purpose: "wooden reading shelves and storybooks for children", scene: "a teacher arranging storybooks on new wooden library shelves", raised: 51_000, target: 51_000, pct: 8, donors: 74, days: 0, completedOn: "2026-07-08" },
  { id: "bohol-clinic-day", title: "A completed community clinic day", organizerId: "teachers-tubigon", category: "medical", purpose: "a neighborhood health-screening day in a fictional rural clinic", scene: "health volunteers chatting with families at a rural clinic", raised: 77_000, target: 77_000, pct: 2, donors: 93, days: 0, completedOn: "2026-08-05" },
  { id: "bohol-story-zines", title: "Story zines for school readers", organizerId: "teachers-tubigon", category: "creator", purpose: "handmade story zines for school readers", scene: "children holding colorful handmade story zines in a classroom", raised: 32_000, target: 32_000, pct: 10, donors: 52, days: 0, completedOn: "2026-09-06" },
  { id: "tarlac-school-transport", title: "School transport support for siblings", organizerId: "ana-family", category: "family", purpose: "school transport arrangements for a fictional family", scene: "three schoolchildren waving beside a neighborhood school-transport van", raised: 39_000, target: 39_000, pct: 0, donors: 61, days: 0, completedOn: "2026-07-13" },
  { id: "tarlac-relief-boxes", title: "Household storm-relief boxes", organizerId: "ana-family", category: "disaster", purpose: "storm-relief supply boxes in a fictional community scenario", scene: "families receiving neatly packed relief boxes at a community center", raised: 58_000, target: 58_000, pct: 2, donors: 108, days: 0, completedOn: "2026-08-10" },
  { id: "tarlac-classroom-kits", title: "Classroom stationery kits delivered", organizerId: "ana-family", category: "education", purpose: "classroom notebooks and stationery kit illustrations", scene: "a teacher distributing notebooks and pencils across classroom desks", raised: 44_000, target: 44_000, pct: 3, donors: 82, days: 0, completedOn: "2026-09-11" },
  { id: "manila-baybayin-workshops", title: "Community Baybayin learning workshops", organizerId: "kapatid-tinta", category: "creator", purpose: "a fictional community Baybayin learning workshop", scene: "young learners practicing hand-drawn symbols around a workshop table", raised: 36_000, target: 36_000, pct: 7, donors: 69, days: 0, completedOn: "2026-07-19" },
  { id: "manila-clinic-transport", title: "A completed clinic-transport example", organizerId: "kapatid-tinta", category: "medical", purpose: "volunteer transport for a fictional neighborhood clinic visit", scene: "an older neighbor smiling beside a volunteer at a clinic entrance", raised: 49_000, target: 49_000, pct: 8, donors: 77, days: 0, completedOn: "2026-08-16" },
  { id: "manila-maker-tools", title: "Shared maker tools for neighbors", organizerId: "kapatid-tinta", category: "community", purpose: "shared hand tools and workstations for neighborhood makers", scene: "neighbors organizing hand tools on a bright workshop wall", raised: 87_000, target: 87_000, pct: 10, donors: 119, days: 0, completedOn: "2026-09-17" },
  { id: "cats-clinic-recovery", title: "Example cat-clinic recovery support", organizerId: "paws-home", category: "animals", purpose: "a fictional cat-clinic recovery and foster-support project", scene: "a recovered cat resting comfortably beside a veterinary care volunteer", raised: 29_000, target: 29_000, pct: 3, donors: 71, days: 0, completedOn: "2026-06-22" },
  { id: "dogs-foster-homes", title: "Example foster homes for rescued dogs", organizerId: "paws-home", category: "animals", purpose: "a fictional foster-home project for rescued dogs", scene: "happy rescued dogs relaxing with volunteers in a sunny foster yard", raised: 43_000, target: 43_000, pct: 5, donors: 89, days: 0, completedOn: "2026-07-21" },
  { id: "shelter-kennel-repairs", title: "Example animal-shelter kennel repairs", organizerId: "paws-home", category: "animals", purpose: "clean kennel repairs in a fictional shared animal shelter", scene: "volunteers standing beside clean newly repaired animal-shelter kennels", raised: 57_000, target: 57_000, pct: 0, donors: 113, days: 0, completedOn: "2026-09-15" },
  { id: "orphanage-book-shelves", title: "Example bookshelves for children in care", organizerId: "ruang-peduli", category: "care", purpose: "bookshelves and reading materials for a fictional children's care home", scene: "a care worker arranging storybooks on colorful learning-room shelves", raised: 39_000, target: 39_000, pct: 3, donors: 76, days: 0, completedOn: "2026-06-28" },
  { id: "elder-care-visits", title: "Example elder-care visits and meal support", organizerId: "ruang-peduli", category: "care", purpose: "care visits and meal support for fictional older neighbors", scene: "a volunteer sharing tea with elders in a warm common room", raised: 47_000, target: 47_000, pct: 0, donors: 92, days: 0, completedOn: "2026-07-26" },
  { id: "free-meal-week", title: "Example community free-meal week", organizerId: "ruang-peduli", category: "care", purpose: "a week of meals in a fictional community kitchen", scene: "community-kitchen volunteers distributing neatly packed lunch boxes", raised: 53_000, target: 53_000, pct: 5, donors: 117, days: 0, completedOn: "2026-08-24" },
  { id: "river-cleanup-round", title: "Example volunteer river-cleanup round", organizerId: "lintas-alam", category: "volunteer", purpose: "a completed river-cleanup round in a fictional volunteer scenario", scene: "volunteers carrying collected litter away from a green riverbank", raised: 35_000, target: 35_000, pct: 3, donors: 68, days: 0, completedOn: "2026-07-04" },
  { id: "flood-relief-delivery", title: "Example volunteer flood-relief delivery", organizerId: "lintas-alam", category: "volunteer", purpose: "volunteer relief-box logistics in a fictional flood scenario", scene: "volunteers handing relief boxes to neighbors outside a shelter", raised: 62_000, target: 62_000, pct: 5, donors: 124, days: 0, completedOn: "2026-08-02" },
  { id: "forest-fire-water-station", title: "Example forest-safety water station", organizerId: "lintas-alam", category: "volunteer", purpose: "water-station logistics in a fictional trained-volunteer forest-safety scenario", scene: "volunteers organizing water containers at a shaded forest-safety station", raised: 71_000, target: 71_000, pct: 0, donors: 132, days: 0, completedOn: "2026-09-02" },
];

export const SEED_CIRCLES: Circle[] = activeSpecs.map(cause);
export const COMPLETED_CIRCLES: Circle[] = completedSpecs.map(cause);

export function getCircle(id: string): Circle | undefined {
  return SEED_CIRCLES.find(circle => circle.id === id) ?? COMPLETED_CIRCLES.find(circle => circle.id === id);
}
