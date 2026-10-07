"use client";

import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/kit";
import { arisanMemberAddress, arisanMemberName, type ArisanMemberIdentity as Identity } from "@/lib/arisan-member-identity";
import styles from "./ArisanMemberIdentity.module.css";

type Props = { address: string; identity?: Identity; previewLabel?: string };

export function ArisanMemberAvatar({ address, identity, previewLabel, size = 30 }: Props & { size?: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photo = identity?.address === address ? identity.photoUrl : null;
  const name = arisanMemberName(address, identity, previewLabel).replace(/^@/, "");
  if (!photo || photo === failedUrl) return <Avatar name={name} size={size} />;
  // The server returns only consented, owner-bound, allowlisted account photos.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={styles.avatar} src={photo} width={size} height={size} alt={`${name} profile photo`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(photo)} />;
}

export function ArisanMemberIdentity({ address, identity, previewLabel, children }: Props & { children?: ReactNode }) {
  return <div className={styles.identity}>
    <div className={styles.name}><strong>{arisanMemberName(address, identity, previewLabel)}</strong>{children}</div>
    <span className={styles.address} title={address} aria-label={`Wallet address ${address}`}>{arisanMemberAddress(address)}</span>
  </div>;
}
