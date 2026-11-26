"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { publicUsernameForWallet } from "@/app/campaign-actions";

export default function OrganizerProfileLink({ address }: { address: string }) {
  const [handle, setHandle] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    publicUsernameForWallet(address).then(result => {
      if (active && result.ok) setHandle(result.username);
    }).catch(() => {});
    return () => { active = false; };
  }, [address]);
  if (!handle) return null;
  return <Link href={`/organizer/${encodeURIComponent(handle)}`}>View organizer profile · @{handle}</Link>;
}
