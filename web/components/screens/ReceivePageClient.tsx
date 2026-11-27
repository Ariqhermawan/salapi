"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isLocalPreview, localPreviewUsername } from "@/lib/local-preview";
import ReceiveScreen from "@/components/screens/ReceiveScreen";

export default function ReceivePageClient() {
  const router = useRouter();
  const [previewUsername, setPreviewUsername] = useState<string | null>(isLocalPreview ? null : "production");

  useEffect(() => {
    if (!isLocalPreview) return;
    const username = localPreviewUsername();
    if (!username) {
      router.replace("/username?next=/receive");
      return;
    }
    setPreviewUsername(username);
  }, [router]);

  if (!previewUsername) return null;
  return <ReceiveScreen previewUsername={previewUsername === "production" ? undefined : previewUsername} />;
}
