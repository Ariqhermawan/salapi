import type { Campaign } from "./campaign";
import { PREVIEW_CAMPAIGNS } from "./local-preview";

type VaultCampaignMedia = {
  coverSrc: string;
  organizerName: string;
  organizerPhotoSrc: string;
  organizerHref: string;
};

// Presentation for three fictional local fixtures only. These portraits are
// illustrative avatars, not the identities of the fixture creator wallets.
const EXAMPLE_MEDIA: Record<string, VaultCampaignMedia> = {
  "101": {
    coverSrc: "/circles/generated/tino-relief.png",
    organizerName: "Maria S.",
    organizerPhotoSrc: "/circles/face-1.png",
    organizerHref: "/circles/tino-relief/organizer",
  },
  "102": {
    coverSrc: "/circles/generated/ate-mei-dialysis.png",
    organizerName: "Mei's family",
    organizerPhotoSrc: "/circles/face-2.png",
    organizerHref: "/circles/ate-mei-dialysis/organizer",
  },
  "103": {
    coverSrc: "/circles/generated/barangay-library.png",
    organizerName: "Teachers' Circle, Tubigon",
    organizerPhotoSrc: "/circles/face-3.png",
    organizerHref: "/circles/barangay-library/organizer",
  },
};

export function vaultCampaignMedia(campaign: Campaign, localPreview: boolean): VaultCampaignMedia | null {
  if (!localPreview) return null;
  const original = PREVIEW_CAMPAIGNS.find(example => example.id === campaign.id);
  if (!original || original.title !== campaign.title || original.config.creator !== campaign.config.creator) return null;
  return EXAMPLE_MEDIA[original.id] ?? null;
}
