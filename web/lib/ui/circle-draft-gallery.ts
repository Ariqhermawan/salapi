import type { CircleCategory } from "../circles/types";

export type DraftGalleryPhoto = { src: string; alt: string; caption: string };

// A small asset allowlist, not the full campaign catalog, reaches the draft UI.
// These are existing fictional AI scenes, never user uploads or delivery proof.
const SCENES: Record<CircleCategory, readonly (readonly [string, string])[]> = {
  disaster: [
    ["tino-relief", "fishing families repairing boats beside a coast"],
    ["arisan-banjir-jakarta", "volunteers preparing community meals"],
    ["tarlac-storm-packs", "volunteers packing emergency supplies"],
    ["cebu-boat-repairs", "small fishing boats beside a sunny shore"],
    ["jakarta-flood-meals", "volunteers sharing boxed relief meals"],
    ["tarlac-relief-boxes", "families receiving household supply boxes"],
  ],
  medical: [
    ["ate-mei-dialysis", "a family beside an adult in a dialysis clinic"],
    ["bohol-health-screening", "a nurse checking blood pressure"],
    ["manila-medical-transport", "a volunteer helping an older adult into a van"],
    ["bohol-clinic-day", "health volunteers at a rural clinic"],
    ["quezon-medical-rides", "a family beside a clinic transport van"],
    ["manila-clinic-transport", "an older neighbor with a clinic volunteer"],
  ],
  education: [
    ["barangay-library", "children reading in a community library"],
    ["quezon-afterclass", "children studying at a neighborhood table"],
    ["tarlac-school-kits", "children receiving notebooks and backpacks"],
    ["bohol-reading-shelves", "a teacher arranging storybooks on shelves"],
    ["quezon-learning-corner", "children beside books and learning supplies"],
    ["tarlac-classroom-kits", "a teacher arranging classroom stationery"],
  ],
  community: [
    ["cebu-community-water", "neighbors installing a shared water tap"],
    ["jakarta-river-cleanup", "neighbors collecting litter beside a river"],
    ["manila-community-makerspace", "neighbors assembling shared worktables"],
    ["cebu-water-tanks", "neighbors beside rainwater tanks"],
    ["jakarta-river-tools", "volunteers storing river-cleanup tools"],
    ["manila-maker-tools", "neighbors organizing shared workshop tools"],
  ],
  family: [
    ["ofw-family-tuition", "a parent helping children with notebooks"],
    ["cebu-family-home", "a family carrying home repair materials"],
    ["quezon-family-roof", "a family inspecting roof panels"],
    ["cebu-home-rebuild", "a family sharing a meal in a modest kitchen"],
    ["quezon-roof-repair", "workers repairing a modest home roof"],
    ["tarlac-school-transport", "children beside a school transport van"],
  ],
  creator: [
    ["creator-baybayin", "an artist arranging handmade learning zines"],
    ["jakarta-community-mural", "artists painting a neighborhood mural"],
    ["bohol-reading-zine", "teachers folding illustrated reading zines"],
    ["bohol-story-zines", "children holding handmade story zines"],
    ["jakarta-lane-mural", "neighbors beside a colorful mural"],
    ["manila-baybayin-workshops", "young learners at an art workshop"],
  ],
  animals: [
    ["cats-recovery", "a veterinarian examining a recovering cat"],
    ["dogs-rescue-care", "a volunteer caring for rescued dogs"],
    ["shared-animal-shelter", "volunteers repairing shaded animal kennels"],
    ["cats-clinic-recovery", "a cat resting beside a veterinary volunteer"],
    ["dogs-foster-homes", "rescued dogs resting in a foster yard"],
    ["shelter-kennel-repairs", "volunteers beside repaired animal kennels"],
  ],
  care: [
    ["orphanage-learning-room", "care workers arranging a learning room"],
    ["elder-home-meals", "a care volunteer sharing meals with elders"],
    ["community-free-kitchen", "neighbors preparing free community meals"],
    ["orphanage-book-shelves", "a care worker arranging storybooks"],
    ["elder-care-visits", "a volunteer sharing tea with elders"],
    ["free-meal-week", "volunteers distributing packed lunches"],
  ],
  volunteer: [
    ["river-volunteer-kit", "river volunteers arranging safety equipment"],
    ["flood-volunteer-logistics", "volunteers loading relief crates into a van"],
    ["forest-fire-volunteer-safety", "trained volunteers checking forest safety supplies"],
    ["river-cleanup-round", "volunteers carrying litter from a riverbank"],
    ["flood-relief-delivery", "volunteers handing out relief boxes"],
    ["forest-fire-water-station", "volunteers organizing a forest safety water station"],
  ],
};

const LEGACY_COVERS = [
  "/circles/disaster.jpg", "/circles/medical.jpg", "/circles/education.jpg", "/illustrations/giving.png",
] as const;

export function draftGalleryOptions(category: CircleCategory): DraftGalleryPhoto[] {
  return SCENES[category].map(([id, scene]) => ({
    src: `/circles/generated/${id}.png`,
    alt: `AI-generated fictional scene of ${scene}. Not a photo of this draft or verified evidence.`,
    caption: "Related AI concept, not a photo of this draft or delivery proof.",
  }));
}

export function defaultDraftGallery(category: CircleCategory): DraftGalleryPhoto[] {
  return draftGalleryOptions(category).slice(0, 3);
}

function legacyPhoto(src: string): DraftGalleryPhoto | null {
  if (!LEGACY_COVERS.some(cover => cover === src)) return null;
  return {
    src,
    alt: "Restored legacy example cover. Not a verified photo of this draft.",
    caption: "Legacy example cover, not a verified campaign photo or delivery proof.",
  };
}

// Optional gallery keeps version-1 cover-only records readable. Legacy expansion
// is in memory only; callers must not silently rewrite the user's saved draft.
export function readDraftGallery(category: CircleCategory, cover: unknown, value?: unknown): DraftGalleryPhoto[] | null {
  if (typeof cover !== "string") return null;
  const options = draftGalleryOptions(category);
  const legacy = legacyPhoto(cover);
  if (value === undefined) {
    const first = legacy ?? options.find(photo => photo.src === cover);
    return first ? [first, ...options.filter(photo => photo.src !== cover).slice(0, 2)] : null;
  }
  if (!Array.isArray(value) || value.length !== 3) return null;
  const photos: DraftGalleryPhoto[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || typeof item.src !== "string") return null;
    const photo = options.find(option => option.src === item.src) ?? (photos.length === 0 && legacy?.src === item.src ? legacy : null);
    if (!photo || photos.some(existing => existing.src === photo.src)) return null;
    // Canonical metadata, not arbitrary stored claims or remote image sources.
    photos.push(photo);
  }
  return photos[0].src === cover ? photos : null;
}

export function replaceDraftPhoto(category: CircleCategory, current: readonly DraftGalleryPhoto[], index: number, src: string): DraftGalleryPhoto[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= 3 || current.length !== 3) return null;
  if (current.some((photo, at) => at !== index && photo.src === src)) return null;
  const replacement = draftGalleryOptions(category).find(photo => photo.src === src);
  if (!replacement) return null;
  return current.map((photo, at) => at === index ? replacement : photo);
}
