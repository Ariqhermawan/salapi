"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { commitAppNavigation, getNavigationEntrySnapshot, installAppNavigation, subscribeNavigationViewState } from "@/lib/ui/app-navigation";

// The app scrolls inside its phone frame, not the document. Next's document
// scroll reset alone can leave a new screen halfway down the previous screen.
export default function AppScrollReset() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const entry = useSyncExternalStore(subscribeNavigationViewState, getNavigationEntrySnapshot, () => "");
  const cancelRestore = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    const stop = installAppNavigation();
    return () => { cancelRestore.current?.(); stop(); };
  }, []);
  useEffect(() => {
    const plan = commitAppNavigation(pathname, query);
    const main = document.getElementById("app-content");
    if (!plan || !main) return;
    cancelRestore.current?.();
    // A POP can render a loading state before the longer saved screen. Retry
    // only until its height permits restoration, and stop on user interaction.
    let frame = 0;
    let timeout = 0;
    let stopped = false;
    let observer: ResizeObserver | undefined;
    const stop = () => {
      stopped = true;
      cancelAnimationFrame(frame); clearTimeout(timeout); observer?.disconnect();
      main.removeEventListener("wheel", stop); main.removeEventListener("touchstart", stop);
      main.removeEventListener("pointerdown", stop); main.removeEventListener("keydown", stop);
    };
    const restore = () => {
      if (stopped) return;
      main.scrollTo({ top: plan.top, behavior: "instant" });
      if (!plan.restore || main.scrollHeight - main.clientHeight >= plan.top) stop();
    };
    cancelRestore.current = stop;
    if (plan.restore && plan.top > 0) {
      main.addEventListener("wheel", stop, { passive: true }); main.addEventListener("touchstart", stop, { passive: true });
      main.addEventListener("pointerdown", stop); main.addEventListener("keydown", stop);
      if (typeof ResizeObserver !== "undefined" && main.firstElementChild) {
        observer = new ResizeObserver(restore); observer.observe(main.firstElementChild);
      }
      timeout = window.setTimeout(stop, 5000);
    }
    frame = requestAnimationFrame(restore);
    restore();
    return stop;
  }, [pathname, query, entry]);
  return null;
}
