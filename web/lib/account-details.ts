/** This is a display/privacy preference, never an authorization claim. */
export const RECEIPT_PHOTO_CONSENT = "salapi_receipt_photo_consent";
export const TRANSFER_PREVIEW_PHOTO_CONSENT = "salapi_transfer_preview_photo_consent";
export type AccountDetailsCode = "unavailable" | "unauthenticated" | "account_changed" | "invalid_input" | "save_failed";
export type AccountDetails = {
  ownerId: string;
  email: string;
  address: string | null;
  handle: string | null;
  receiptPhotoConsent: boolean;
  transferPreviewPhotoConsent: boolean;
  identityUnavailable: boolean;
};
export type AccountDetailsResult = { ok: true; account: AccountDetails } | { ok: false; code: AccountDetailsCode };
export type ReceiptPhotoResult = { ok: true; ownerId: string; enabled: boolean } | { ok: false; code: AccountDetailsCode };
