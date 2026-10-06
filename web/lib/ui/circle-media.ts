import type { Circle } from "../circles/types";

export type CirclePhoto = { src: string; alt: string; caption: string };
export type ExampleDonor = {
  id: string;
  anonymous: boolean;
  displayName?: string;
  amountPesos: number;
  comment?: string;
  createdAt?: string;
  whenLabel?: string;
  avatarSrc?: string;
};

/** A repeated cover is one photo, never an invented multi-photo gallery. */
export function circlePhotos(circle: Circle): CirclePhoto[] {
  const supplied = circle.gallery?.length ? circle.gallery : circle.coverImage ? [{
    src: circle.coverImage, alt: circle.imageAlt ?? "", caption: "",
  }] : [];
  const seen = new Set<string>();
  return supplied.filter(photo => {
    if (!photo.src || seen.has(photo.src)) return false;
    seen.add(photo.src);
    return true;
  });
}

export function galleryIndex(current: number, count: number, key: string): number {
  if (count < 1) return 0;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowRight") return (current + 1) % count;
  if (key === "ArrowLeft") return (current + count - 1) % count;
  return current;
}

/** Strip identifying fields before rendering an anonymous example. */
export function circleDonorExamples(circle: Circle): ExampleDonor[] {
  if (circle.donorExamples !== undefined) return circle.donorExamples.map(donor => ({
    id: donor.id, anonymous: donor.anonymous, amountPesos: donor.amountPesos,
    comment: donor.comment, createdAt: donor.createdAt,
    ...(!donor.anonymous ? { displayName: donor.displayName, avatarSrc: donor.avatarSrc } : {}),
  }));
  return circle.recentDonations.map(donor => {
    const anonymous = /^anonymous\b/i.test(donor.donorLabel.trim());
    return {
      id: donor.id, anonymous, amountPesos: donor.pesoAmount, comment: donor.note,
      whenLabel: donor.whenLabel, ...(!anonymous ? { displayName: donor.donorLabel } : {}),
    };
  });
}
