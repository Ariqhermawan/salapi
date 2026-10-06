"use server";

import { readAccountPhoto, uploadAccountPhoto, restoreGoogleAccountPhoto } from "@/lib/server/accountPhoto";

export async function accountPhoto() { return readAccountPhoto(); }
export async function saveAccountPhoto(ownerId: string, formData: FormData) { return uploadAccountPhoto(ownerId, formData); }
export async function restoreGooglePhoto(ownerId: string) { return restoreGoogleAccountPhoto(ownerId); }
