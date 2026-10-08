"use server";
import { readAccountDetails, saveReceiptPhotoConsent, saveTransferPreviewPhotoConsent } from "@/lib/server/accountDetails";

export async function accountDetails(ownerId: string) { return readAccountDetails(ownerId); }
export async function setReceiptPhotoConsent(ownerId: string, enabled: boolean) { return saveReceiptPhotoConsent(ownerId, enabled); }
export async function setTransferPreviewPhotoConsent(ownerId: string, enabled: boolean) { return saveTransferPreviewPhotoConsent(ownerId, enabled); }
