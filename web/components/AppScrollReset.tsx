"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// The app scrolls inside its phone frame, not the document. Next's document
// scroll reset alone can leave a new screen halfway down the previous screen.
export default function AppScrollReset() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => {
    document.getElementById("app-content")?.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname, query]);
  return null;
}
