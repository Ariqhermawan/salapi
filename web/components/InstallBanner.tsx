"use client";

import { useEffect, useState } from "react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { SalapiMark } from "@/components/ui/brand";
import { useT } from "@/components/I18nProvider";

const DISMISS_KEY = "salapi_install_dismissed";

export default function InstallBanner() {
  const { canInstall, promptInstall } = useInstallPrompt();
  const { t } = useT();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (!canInstall || dismissed) return null;

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
