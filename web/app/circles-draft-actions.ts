"use server";

import { readCircleDraft, saveCircleDraft } from "@/lib/server/circleDrafts";

export async function savePrivateCircleDraft(input: unknown, expectedOwnerId: unknown) {
  return saveCircleDraft(input, expectedOwnerId);
}

export async function readPrivateCircleDraft(expectedOwnerId: unknown) {
  return readCircleDraft(expectedOwnerId);
}
