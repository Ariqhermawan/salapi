"use server";

import type { ArisanRoomKind } from "@/lib/arisan-member-identity";
import { readArisanMemberIdentities } from "@/lib/server/arisanMemberIdentity";

export async function arisanMemberIdentities(kind: ArisanRoomKind, roomId: number) {
  return readArisanMemberIdentities(kind, roomId);
}
