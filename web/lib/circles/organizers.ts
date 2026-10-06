import type { Circle } from "./types";

export type CircleReview = {
  id: string;
  reviewer: string;
  score: number;
  causeId: string;
  body: string;
  date: string;
};

export type CircleOrganizer = {
  id: string;
  name: string;
  kind: "individual" | "ngo";
  location: string;
  bio: string;
  initials: string;
  rating: number;
  reviewCount: number;
  reviews: CircleReview[];
  historyIds: string[];
};

type OrganizerSpec = Omit<CircleOrganizer, "rating" | "reviewCount" | "reviews"> & {
  scores: [number, number, number];
  reviewDates: [string, string, string];
};

function organizer(spec: OrganizerSpec): CircleOrganizer {
  const { scores, reviewDates, ...profile } = spec;
  const reviewers = ["Alina P. (example)", "Ben R. (example)", "Citra M. (example)"];
  const reviews = profile.historyIds.map((causeId, index) => ({
    id: `${profile.id}-review-${index + 1}`,
    reviewer: reviewers[index],
    score: scores[index],
    causeId,
    body: [
      "Synthetic demo review: the example plan and progress notes were easy to follow. This is not testimony from an actual donor.",
      "Synthetic demo review: the fictional delivery update explains the intended community benefit. No real delivery was verified.",
      "Synthetic demo review: the sample organizer kept the illustration focused on the cause. This rating does not establish identity or trust.",
    ][index],
    date: reviewDates[index],
  }));
  return {
    ...profile,
    reviews,
    reviewCount: reviews.length,
    rating: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length * 10) / 10,
  };
}

// All nine profiles, ratings, histories and reviews are invented demonstration
// data. NGO means an NGO-shaped example, not a registered or verified entity.
export const ORGANIZERS: CircleOrganizer[] = [
  organizer({
    id: "maria-cebu", name: "Maria S.", kind: "individual", location: "Cebu, PH", initials: "MS",
    bio: "Fictional individual organizer example in Cebu, exploring coastal recovery, family housing and shared neighborhood water projects. No identity or delivery is verified.",
    historyIds: ["cebu-boat-repairs", "cebu-home-rebuild", "cebu-water-tanks"],
    scores: [5, 4, 5], reviewDates: ["2026-06-21", "2026-07-19", "2026-08-16"],
  }),
  organizer({
    id: "mei-family", name: "Mei's family", kind: "individual", location: "Quezon City, PH", initials: "MF",
    bio: "Fictional family organizer example in Quezon City, exploring medical access, after-class learning and repairs to a family home. This is not a verified patient or family appeal.",
    historyIds: ["quezon-medical-rides", "quezon-learning-corner", "quezon-roof-repair"],
    scores: [4, 5, 4], reviewDates: ["2026-06-26", "2026-07-24", "2026-08-21"],
  }),
  organizer({
    id: "karang-taruna-rw06", name: "Karang Taruna RW 06", kind: "ngo", location: "Jakarta Utara, ID", initials: "KT",
    bio: "Fictional NGO example shaped around a North Jakarta neighborhood group, exploring flood meals, river care and community art. It is not a registered or verified organization in this prototype.",
    historyIds: ["jakarta-flood-meals", "jakarta-river-tools", "jakarta-lane-mural"],
    scores: [5, 5, 4], reviewDates: ["2026-07-03", "2026-08-01", "2026-09-01"],
  }),
  organizer({
    id: "teachers-tubigon", name: "Teachers' Circle, Tubigon", kind: "ngo", location: "Bohol, PH", initials: "TC",
    bio: "Fictional NGO example shaped around a teachers' circle in Tubigon, exploring reading spaces, community health days and handmade learning materials. No organizational status is verified.",
    historyIds: ["bohol-reading-shelves", "bohol-clinic-day", "bohol-story-zines"],
    scores: [5, 4, 4], reviewDates: ["2026-07-09", "2026-08-06", "2026-09-07"],
  }),
  organizer({
    id: "ana-family", name: "Family of Ana D.", kind: "individual", location: "Tarlac, PH", initials: "AD",
    bio: "Fictional family organizer example in Tarlac, exploring school costs, storm-preparedness supplies and classroom kits. Names, circumstances and past projects are invented for the demo.",
    historyIds: ["tarlac-school-transport", "tarlac-relief-boxes", "tarlac-classroom-kits"],
    scores: [4, 4, 4], reviewDates: ["2026-07-14", "2026-08-11", "2026-09-12"],
  }),
  organizer({
    id: "kapatid-tinta", name: "@kapatid.tinta", kind: "individual", location: "Manila, PH", initials: "KT",
    bio: "Fictional individual creator example in Manila, exploring learning zines, clinic transport and a shared makerspace. The handle, reviews and activity do not represent a verified creator.",
    historyIds: ["manila-baybayin-workshops", "manila-clinic-transport", "manila-maker-tools"],
    scores: [5, 5, 5], reviewDates: ["2026-07-20", "2026-08-17", "2026-09-18"],
  }),
  organizer({
    id: "paws-home", name: "Paws & Home Care", kind: "ngo", location: "Yogyakarta, ID", initials: "PH",
    bio: "Fictional NGO example in Yogyakarta, exploring injured-animal care, foster homes and shelter repairs. This is not a registered shelter or verified animal-welfare organization.",
    historyIds: ["cats-clinic-recovery", "dogs-foster-homes", "shelter-kennel-repairs"],
    scores: [5, 4, 5], reviewDates: ["2026-06-23", "2026-07-22", "2026-09-16"],
  }),
  organizer({
    id: "ruang-peduli", name: "Ruang Peduli Foundation", kind: "ngo", location: "Bandung, ID", initials: "RP",
    bio: "Fictional NGO example in Bandung, exploring learning spaces for children in care, elder support and community meals. No foundation registration, identity or delivery is verified.",
    historyIds: ["orphanage-book-shelves", "elder-care-visits", "free-meal-week"],
    scores: [4, 5, 4], reviewDates: ["2026-06-29", "2026-07-27", "2026-08-25"],
  }),
  organizer({
    id: "lintas-alam", name: "Relawan Lintas Alam", kind: "ngo", location: "Kalimantan, ID", initials: "LA",
    bio: "Fictional NGO example in Kalimantan, exploring river cleanups, flood logistics and trained forest-safety volunteering. It is not a verified emergency-response organization and offers no safety instruction.",
    historyIds: ["river-cleanup-round", "flood-relief-delivery", "forest-fire-water-station"],
    scores: [5, 5, 4], reviewDates: ["2026-07-05", "2026-08-03", "2026-09-03"],
  }),
];

export function getOrganizer(id: string): CircleOrganizer | undefined {
  return ORGANIZERS.find(profile => profile.id === id);
}

export function getOrganizerForCircle(circle: Pick<Circle, "organizerId" | "organizer" | "organizerLocation">): CircleOrganizer | undefined {
  if (circle.organizerId) return getOrganizer(circle.organizerId);
  // Legacy Circle values from existing create/draft consumers have no new ID.
  return ORGANIZERS.find(profile => profile.name === circle.organizer && profile.location === circle.organizerLocation);
}
