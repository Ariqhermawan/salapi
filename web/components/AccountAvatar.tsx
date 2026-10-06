"use client";

import { useState } from "react";
import Image from "next/image";
import { Avatar } from "@/components/ui/kit";

export default function AccountAvatar({ name, photoUrl, size = 46, alt, loading = false }: {
  name: string; photoUrl: string | null; size?: number; alt: string; loading?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <span data-account-avatar="" style={{ display: "inline-flex", flexShrink: 0, width: size, height: size, overflow: "hidden", borderRadius: "50%" }}>
    {loading ? <span className="sl-skel" style={{ width: size, height: size }} aria-hidden="true" />
      : photoUrl && failedUrl !== photoUrl ? <Image src={photoUrl} width={size} height={size} unoptimized
        alt={alt} referrerPolicy="no-referrer" style={{ objectFit: "cover", width: size, height: size }} onError={() => setFailedUrl(photoUrl)} />
        : <Avatar name={name} size={size} />}
  </span>;
}
