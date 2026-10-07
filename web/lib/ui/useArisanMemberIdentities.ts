"use client";

import { useEffect, useState } from "react";
import { arisanMemberIdentities } from "@/app/arisan-member-actions";
import { isLocalPreview } from "@/lib/local-preview";
import type { ArisanMemberIdentity, ArisanRoomKind } from "@/lib/arisan-member-identity";

const empty = new Map<string, ArisanMemberIdentity>();

/** Optional presentation read, independent of the room's financial polling.
 * No shared account cache. A changed room, membership, or viewer immediately
 * hides the previous projection, including while its new read is in flight.
 */
export function useArisanMemberIdentities(kind: ArisanRoomKind, roomId: number | undefined, addresses: readonly string[], viewer: string | null) {
  const membership = JSON.stringify(addresses);
  const key = JSON.stringify([kind, roomId, membership, viewer]);
  const [projection, setProjection] = useState<{ key: string; identities: Map<string, ArisanMemberIdentity> } | null>(null);
  useEffect(() => {
    if (isLocalPreview || !roomId || !addresses.length || addresses.length > 20) return;
    let active = true;
    const members = new Set<string>(JSON.parse(membership));
    async function read() {
      try {
        const result = await arisanMemberIdentities(kind, roomId!);
        if (!active || !result.ok || result.kind !== kind || result.roomId !== roomId || result.identities.length > 20) return;
        setProjection({ key, identities: new Map(result.identities.filter(identity => members.has(identity.address)).map(identity => [identity.address, identity])) });
      } catch { /* Identity failure cannot hide funding or payout state. */ }
    }
    void read();
    // Signed photo URLs last five minutes. Refresh only while visible, not on
    // every five-second financial poll or every one-second countdown tick.
    const refresh = setInterval(() => { if (document.visibilityState === "visible") void read(); }, 240_000);
    return () => { active = false; clearInterval(refresh); };
    // Membership is a primitive key so new financial DTO objects do not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, roomId, membership, viewer, key]);
  return projection?.key === key ? projection.identities : empty;
}
