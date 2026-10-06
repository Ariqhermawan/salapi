"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { SalapiMark } from "@/components/ui/brand";
import { useT } from "@/components/I18nProvider";

const DISMISS_KEY = "salapi_install_dismissed";
function dismissalSnapshot() {
  try { return localStorage.getItem(DISMISS_KEY) === "1"; }
  catch { return false; }
}
function subscribeDismissal(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === DISMISS_KEY) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
function serverDismissalSnapshot() { return true; }

// The primary bottom-nav tabs (Home, Vault, Activity) are deliberately
// single-screen, no-scroll layouts, so the install promo would push their
// content off-screen. The banner still appears on every other route.
const HIDDEN_ROUTES = ["/", "/vaults", "/activity"];

export default function InstallBanner() {
  const pathname = usePathname();
  const { canInstall, promptInstall } = useInstallPrompt();
  const { t } = useT();
  const persistedDismissal = useSyncExternalStore(subscribeDismissal, dismissalSnapshot, serverDismissalSnapshot);
  const [dismissedInMemory, setDismissed] = useState(false);
  const dismissed = persistedDismissal || dismissedInMemory;

  if (HIDDEN_ROUTES.includes(pathname) || !canInstall || dismissed) return null;

  return (
    <div className="s-anim-up mx-5 mt-3 flex items-center gap-3 rounded-xl border border-[var(--color-hairline)] bg-white p-3 shadow-sm">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-action)]">
        <SalapiMark size={22} c="#fff" />
      </span>
      <div className="flex-1 text-xs">
        <div className="font-semibold text-[var(--color-ink)]">
          {t("install.title")}
        </div>
        <div className="text-[var(--color-slate)]">
          {t("install.body")}
        </div>
      </div>
      <button
        onClick={() => promptInstall()}
        className="rounded-lg bg-[var(--color-action-deep)] px-3 py-1.5 text-xs font-semibold text-white"
      >
        {t("install.cta")}
      </button>
      <button
        aria-label={t("install.dismiss")}
        onClick={() => {
          setDismissed(true);
          try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* Still dismiss for this visit. */ }
        }}
        className="px-1 text-[var(--color-slate)]"
      >
        ✕
      </button>
    </div>
  );
}
