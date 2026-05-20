"use client";

import { useEffect, useState } from "react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

const DISMISS_KEY = "salapi_install_dismissed";

export default function InstallBanner() {
  const { canInstall, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (!canInstall || dismissed) return null;

  return (
    <div className="s-anim-up mx-5 mt-3 flex items-center gap-3 rounded-xl border border-[var(--color-hairline)] bg-white p-3 shadow-sm">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-action)] text-sm font-bold text-white">
        S
      </span>
      <div className="flex-1 text-xs">
        <div className="font-semibold text-[var(--color-ink)]">
          Install Salapi
        </div>
        <div className="text-[var(--color-slate)]">
          Add to your home screen. Works offline.
        </div>
      </div>
      <button
        onClick={() => promptInstall()}
        className="rounded-lg bg-[var(--color-action-deep)] px-3 py-1.5 text-xs font-semibold text-white"
      >
        Install
      </button>
      <button
        aria-label="Dismiss"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
        className="px-1 text-[var(--color-slate)]"
      >
        ✕
      </button>
    </div>
  );
}
