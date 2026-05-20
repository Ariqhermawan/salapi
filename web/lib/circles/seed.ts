// Salapi Circles — preview SEED data for the Discover screen and detail pages.
// NOT real causes, NOT live, NOT on-chain. Names are illustrative placeholders
// crafted to mirror the PH/ID context the SOW Section 7 describes (typhoon
// recovery, medical relief, school supplies, OFW family support, creator
// patronage). Numbers are in PHP app-units; the Money component renders them
// in the user's locale. Do not display tx hashes or contract IDs against any
// of these circles — Circles is Build-Award scope.

import type { Circle } from "./types";

export const SEED_CIRCLES: Circle[] = [
  {
    id: "tino-relief",
    title: "Tino survivors, Cebu - rebuild a fishing barangay",
    organizer: "Maria S.",
    organizerLocation: "Cebu, PH",
    category: "disaster",
    story:
      "Typhoon Tino tore through our barangay in November. Twenty-two families lost their boats and their roofs in one night. The fish landing center is gone. We are not waiting for the government to come; we are rebuilding with our own hands, but we need materials.\n\nEvery peso you give goes through the same on-chain pool that powers Salapi's Disaster Vault today. At Build-Award launch, you will see every disbursement here.\n\nMabuhay po, and salamat sa tulong.",
    pesoRaised: 184_500,
    pesoTarget: 250_000,
    donorCount: 312,
    daysRemaining: 18,
    coverGradient: ["#B45309", "#F59E0B"],
    recentDonations: [
      { id: "d1", donorLabel: "Anonymous", pesoAmount: 1000, whenLabel: "2 hours ago", note: "Para sa mga bata. Stay strong." },
      { id: "d2", donorLabel: "Jen R.", pesoAmount: 500, whenLabel: "5 hours ago" },
      { id: "d3", donorLabel: "Ariq H.", pesoAmount: 2500, whenLabel: "yesterday", note: "Sending love from Jakarta - one rail, two countries." },
      { id: "d4", donorLabel: "Anonymous", pesoAmount: 250, whenLabel: "yesterday" },
      { id: "d5", donorLabel: "Carlos M.", pesoAmount: 5000, whenLabel: "2 days ago" },
    ],
  },
  {
    id: "ate-mei-dialysis",
    title: "Ate Mei needs dialysis - 12 sessions to stabilize",
    organizer: "Mei's family",
    organizerLocation: "Quezon City, PH",
    category: "medical",
    story:
      "Our Ate Mei is 54 and was just diagnosed with end-stage kidney disease. PhilHealth covers part of her dialysis, but we still need to fund 12 sessions while we wait for the transplant queue.\n\nWe are a family of teachers and a tricycle driver. Our circle is a small one but every contribution buys her another week of stability. We will post receipts here at every milestone once Salapi Circles ships at Build-Award.",
    pesoRaised: 62_300,
    pesoTarget: 180_000,
    donorCount: 87,
    daysRemaining: 25,
    coverGradient: ["#059669", "#10B981"],
    recentDonations: [
      { id: "d1", donorLabel: "Anonymous", pesoAmount: 300, whenLabel: "6 hours ago" },
      { id: "d2", donorLabel: "Bea G.", pesoAmount: 1000, whenLabel: "yesterday", note: "Praying for Ate Mei." },
      { id: "d3", donorLabel: "Ruth T.", pesoAmount: 200, whenLabel: "2 days ago" },
      { id: "d4", donorLabel: "Anonymous", pesoAmount: 5000, whenLabel: "3 days ago" },
    ],
  },
  {
    id: "arisan-banjir-jakarta",
    title: "Banjir Jakarta Utara - dapur umum untuk 200 keluarga",
    organizer: "Karang Taruna RW 06",
    organizerLocation: "Jakarta Utara, ID",
    category: "disaster",
    story:
      "Banjir besar di RW 06 membuat 200 keluarga mengungsi ke balai warga. Listrik mati tiga hari. Kami buka dapur umum 24 jam, masak nasi bungkus untuk yang masih bertahan di rumah panggung dan yang di pengungsian.\n\nSetiap rupiah yang masuk lewat Salapi Circles akan terlihat publik on-chain saat Build-Award. Untuk sekarang ini adalah preview - kontribusi belum akan dipungut.\n\nTerima kasih untuk teman-teman di seluruh nusantara dan diaspora.",
    pesoRaised: 96_750,
    pesoTarget: 200_000,
    donorCount: 421,
    daysRemaining: 11,
    coverGradient: ["#1D4ED8", "#3B82F6"],
    recentDonations: [
      { id: "d1", donorLabel: "Anonymous", pesoAmount: 150, whenLabel: "1 hour ago" },
      { id: "d2", donorLabel: "Putri W.", pesoAmount: 500, whenLabel: "4 hours ago", note: "Dari Surabaya. Tetap semangat." },
      { id: "d3", donorLabel: "Anonymous", pesoAmount: 1000, whenLabel: "yesterday" },
      { id: "d4", donorLabel: "Anggi P.", pesoAmount: 750, whenLabel: "yesterday" },
    ],
  },
  {
    id: "barangay-library",
    title: "Build a barangay library for 300 kids in Bohol",
    organizer: "Teachers' Circle, Tubigon",
    organizerLocation: "Bohol, PH",
    category: "education",
    story:
      "Our barangay has no library. The kids share four storybooks among 300 students. We have an empty room next to the chapel and a carpenter willing to build the shelves at cost. We need books, paint, and a small generator.\n\nThis is a long campaign. Every milestone we hit will be posted here transparently at Build-Award launch. For now we are gathering pledges in this preview.",
    pesoRaised: 38_900,
    pesoTarget: 150_000,
    donorCount: 54,
    daysRemaining: 60,
    coverGradient: ["#4C2F8A", "#7C3AED"],
    recentDonations: [
      { id: "d1", donorLabel: "Anonymous", pesoAmount: 500, whenLabel: "yesterday" },
      { id: "d2", donorLabel: "Lola Linda", pesoAmount: 2000, whenLabel: "3 days ago", note: "Para sa mga apo ko." },
      { id: "d3", donorLabel: "Anonymous", pesoAmount: 100, whenLabel: "4 days ago" },
    ],
  },
  {
    id: "ofw-family-tuition",
    title: "Help Tita Ana keep her three kids in school this term",
    organizer: "Family of Ana D.",
    organizerLocation: "Tarlac, PH",
    category: "family",
    story:
      "My mother works in Riyadh as a domestic helper. Her employer delayed her last three months of salary. The tuition deadline for my two younger siblings and me is in 14 days.\n\nThis is exactly the cross-border use case Salapi Circles is built for: an OFW in the Gulf, three kids in Tarlac, donors anywhere in the world, one Google login. At Build-Award you will see every peso land on-chain.",
    pesoRaised: 47_200,
    pesoTarget: 75_000,
    donorCount: 138,
    daysRemaining: 9,
    coverGradient: ["#2E5DA0", "#0EA5E9"],
    recentDonations: [
      { id: "d1", donorLabel: "Anonymous", pesoAmount: 500, whenLabel: "3 hours ago" },
      { id: "d2", donorLabel: "Kuya Marvin", pesoAmount: 1500, whenLabel: "yesterday", note: "Kapit lang, Tita." },
      { id: "d3", donorLabel: "Anonymous", pesoAmount: 300, whenLabel: "2 days ago" },
    ],
  },
  {
    id: "creator-baybayin",
    title: "Print 1,000 free Baybayin learning zines",
    organizer: "@kapatid.tinta",
    organizerLocation: "Manila, PH",
    category: "creator",
    story:
      "I make small zines that teach Baybayin to kids who cannot afford workshops. I want to print 1,000 copies and ship them free to public schools in Mindanao.\n\nCreators on Salapi Circles will keep more of every contribution than on Kitabisa or Saweria, because the rail is USDC on Stellar and the platform cut is a flat rail fee, not a percentage of generosity. This is preview wording - the real economics ship at Build-Award.",
    pesoRaised: 24_400,
    pesoTarget: 60_000,
    donorCount: 92,
    daysRemaining: 22,
    coverGradient: ["#9C4221", "#F97316"],
    recentDonations: [
      { id: "d1", donorLabel: "Anonymous", pesoAmount: 250, whenLabel: "yesterday" },
      { id: "d2", donorLabel: "Iya R.", pesoAmount: 1000, whenLabel: "2 days ago", note: "Salamat for keeping the script alive." },
      { id: "d3", donorLabel: "Anonymous", pesoAmount: 500, whenLabel: "4 days ago" },
    ],
  },
];

export function getCircle(id: string): Circle | undefined {
  return SEED_CIRCLES.find((c) => c.id === id);
}
