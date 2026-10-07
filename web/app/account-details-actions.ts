"use server";
import { readAccountDetails, saveReceiptPhotoConsent } from "@/lib/server/accountDetails";

export async function accountDetails(ownerId: string) { return readAccountDetails(ownerId); }
export async function setReceiptPhotoConsent(ownerId: string, enabled: boolean) { return saveReceiptPhotoConsent(ownerId, enabled); }
