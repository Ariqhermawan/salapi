import type { Campaign } from "./campaign";
import { PREVIEW_CAMPAIGNS } from "./local-preview";

type VaultCampaignMedia = {
  coverSrc: string;
  gallery: { src: string; alt: string; caption: string }[];
  organizerName: string;
  organizerPhotoSrc: string;
  organizerHref: string;
};

// Presentation for three fictional local fixtures only. These portraits are
// illustrative avatars, not the identities of the fixture creator wallets.
const EXAMPLE_MEDIA: Record<string, VaultCampaignMedia> = {
  "101": {
    coverSrc: "/circles/generated/tino-relief.png",
    gallery: ["tino-relief", "tino-relief-materials", "tino-relief-shore"].map(id => ({
      src: `/circles/generated/${id}.png`, alt: "AI concept of coastal livelihood support, not verified campaign evidence",
      caption: "AI concept scene. Fictional local fixture, not documentary evidence.",
    })),
    organizerName: "Maria S.",
    organizerPhotoSrc: "/circles/face-1.png",
    organizerHref: "/circles/tino-relief/organizer",
  },
  "102": {
    coverSrc: "/circles/generated/ate-mei-dialysis.png",
    gallery: ["ate-mei-dialysis", "bohol-clinic-day", "quezon-medical-rides"].map(id => ({
      src: `/circles/generated/${id}.png`, alt: "Related AI medical support concept, not verified campaign evidence",
      caption: "Related AI concept scene. Not a photo of this campaign or proof of delivery.",
    })),
    organizerName: "Mei's family",
    organizerPhotoSrc: "/circles/face-2.png",
    organizerHref: "/circles/ate-mei-dialysis/organizer",
  },
  "103": {
    coverSrc: "/circles/generated/barangay-library.png",
    gallery: ["barangay-library", "bohol-reading-shelves", "quezon-learning-corner"].map(id => ({
      src: `/circles/generated/${id}.png`, alt: "Related AI education concept, not verified campaign evidence",
      caption: "Related AI concept scene. Not a photo of this campaign or proof of delivery.",
    })),
    organizerName: "Teachers' Circle, Tubigon",
    organizerPhotoSrc: "/circles/organizers/teachers-tubigon.svg",
    organizerHref: "/circles/barangay-library/organizer",
  },
};

export function vaultCampaignMedia(campaign: Campaign, localPreview: boolean): VaultCampaignMedia | null {
  if (!localPreview) return null;
  const original = PREVIEW_CAMPAIGNS.find(example => example.id === campaign.id);
  if (!original || original.title !== campaign.title || original.config.creator !== campaign.config.creator) return null;
  return EXAMPLE_MEDIA[original.id] ?? null;
}
