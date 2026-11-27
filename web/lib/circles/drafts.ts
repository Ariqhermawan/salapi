import { isLocale, type Locale } from "@/lib/i18n/config";
import { CURRENCY, pesoFromLocal } from "@/lib/ui/currency";
import { CATEGORY_LABEL, type CircleCategory } from "@/lib/circles/types";
import { readDraftGallery, type DraftGalleryPhoto } from "@/lib/ui/circle-draft-gallery";

export type CircleDraft = {
  version: 1;
  savedAt: string;
  title: string;
  story: string;
  category: CircleCategory;
  target: { localValue: string; currency: Locale; pesoEquivalent: number };
  durationDays: number;
  cover: string;
  gallery: DraftGalleryPhoto[];
  allowance: { percentage: number; conceptAcknowledged: boolean };
  organizerVerification: "not-performed";
  publication: "browser-draft-only";
};

/** Canonical validation for private Circles concepts stored on the server. */
export function parseCircleDraft(value: unknown, savedAt?: string): CircleDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  const category = draft.category as CircleCategory;
  const target = draft.target;
  const allowance = draft.allowance;
  if (draft.version !== 1 || typeof draft.title !== "string" || draft.title.trim().length < 6 || draft.title.length > 90
    || typeof draft.story !== "string" || draft.story.trim().length < 40 || draft.story.length > 1500
    || !Object.hasOwn(CATEGORY_LABEL, category) || typeof draft.cover !== "string"
    || !target || typeof target !== "object" || Array.isArray(target)
    || !allowance || typeof allowance !== "object" || Array.isArray(allowance)
    || ![14, 30, 60, 90].includes(draft.durationDays as number)
    || draft.organizerVerification !== "not-performed" || draft.publication !== "browser-draft-only") return null;

  const fields = target as Record<string, unknown>;
  if (typeof fields.localValue !== "string" || typeof fields.currency !== "string" || !isLocale(fields.currency)
    || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/.test(fields.localValue)) return null;
  const targetNumber = Number(fields.localValue);
  const currency = fields.currency as Locale;
  const decimals = fields.localValue.split(".")[1]?.length ?? 0;
  if (!Number.isFinite(targetNumber) || targetNumber <= 0 || decimals > CURRENCY[currency].dp) return null;

  const allowanceFields = allowance as Record<string, unknown>;
  if (![0, 5, 10].includes(allowanceFields.percentage as number)
    || typeof allowanceFields.conceptAcknowledged !== "boolean"
    || (allowanceFields.percentage !== 0 && allowanceFields.conceptAcknowledged !== true)) return null;
  const pesoEquivalent = pesoFromLocal(targetNumber, currency);
  if (!Number.isFinite(pesoEquivalent) || pesoEquivalent <= 0 || pesoEquivalent > 10_000_000_000) return null;

  const gallery = readDraftGallery(category, draft.cover, draft.gallery);
  if (!gallery || gallery.length !== 3) return null;
  const timestamp = savedAt ?? (typeof draft.savedAt === "string" && Number.isFinite(Date.parse(draft.savedAt))
    ? draft.savedAt : new Date().toISOString());
  if (!Number.isFinite(Date.parse(timestamp))) return null;
  return {
    version: 1,
    savedAt: timestamp,
    title: draft.title.trim(),
    story: draft.story.trim(),
    category,
    target: { localValue: fields.localValue, currency, pesoEquivalent },
    durationDays: draft.durationDays as number,
    cover: draft.cover as string,
    gallery,
    allowance: { percentage: allowanceFields.percentage as number, conceptAcknowledged: allowanceFields.conceptAcknowledged },
    organizerVerification: "not-performed",
    publication: "browser-draft-only",
  };
}
