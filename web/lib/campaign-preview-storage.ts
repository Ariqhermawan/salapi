import type { Campaign } from "./campaign";

export const CAMPAIGN_PREVIEW_KEY = "salapi.preview.campaigns";
type PreviewStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Commit browser-only state only after verifying storage, never a transaction. */
export function saveCampaignPreview(storage: PreviewStorage, campaigns: Campaign[]): boolean {
  let previous: string | null;
  let encoded: string;
  try {
    previous = storage.getItem(CAMPAIGN_PREVIEW_KEY);
    encoded = JSON.stringify(campaigns);
  } catch { return false; }
  try {
    storage.setItem(CAMPAIGN_PREVIEW_KEY, encoded);
    if (storage.getItem(CAMPAIGN_PREVIEW_KEY) === encoded) return true;
  } catch { /* A blocked, partial or silently dropped write is not success. */ }
  try {
    if (previous === null) storage.removeItem(CAMPAIGN_PREVIEW_KEY);
    else storage.setItem(CAMPAIGN_PREVIEW_KEY, previous);
  } catch { /* Caller keeps its original state and reports unconfirmed storage. */ }
  return false;
}
