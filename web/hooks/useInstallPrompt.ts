"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const STANDALONE_QUERY = "(display-mode: standalone)";
function standaloneSnapshot() {
  if (typeof window === "undefined") return false;
  return !!window.matchMedia?.(STANDALONE_QUERY).matches ||
    !!(window.navigator as unknown as { standalone?: boolean }).standalone;
}
function subscribeStandalone(notify: () => void) {
  const media = window.matchMedia?.(STANDALONE_QUERY);
  if (!media) return () => {};
  if (media.addEventListener) {
    media.addEventListener("change", notify);
    return () => media.removeEventListener("change", notify);
  }
  media.addListener(notify);
  return () => media.removeListener(notify);
}
function serverStandaloneSnapshot() { return false; }

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installedByEvent, setInstalled] = useState(false);
  const standalone = useSyncExternalStore(subscribeStandalone, standaloneSnapshot, serverStandaloneSnapshot);
  const installed = standalone || installedByEvent;
  const prompting = useRef(false);

  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      if (!installed) setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [installed]);

  async function promptInstall() {
    if (!deferred || installed || prompting.current) return "unavailable";
    prompting.current = true;
    // A browser install event is single-use, including rejected prompts.
    setDeferred(null);
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      return outcome === "accepted" || outcome === "dismissed" ? outcome : "unavailable";
    } catch {
      return "unavailable";
    } finally {
      prompting.current = false;
    }
  }

  return { canInstall: !!deferred && !installed, installed, promptInstall };
}
