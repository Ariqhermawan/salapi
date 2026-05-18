"use client";

import Link from "next/link";
import DonateForm from "@/components/DonateForm";
import { CONTRACTS } from "@/lib/salapi";
import { useT } from "@/components/I18nProvider";

const ex = (id: string) =>
  `https://stellar.expert/explorer/testnet/contract/${id}`;

export default function VaultsPage() {
  const { t } = useT();
  return (
    <div className="px-5 py-6">
      <h1 className="s-h1">{t("vaults.title")}</h1>
      <p className="s-sub mt-1 mb-5">{t("vaults.sub")}</p>

      <DonateForm />

      <Link
        href="/transparency"
        className="mt-3 block text-center text-sm font-semibold text-[var(--color-action-deep)]"
      >
        {t("vaults.fullDashboard")}
      </Link>

      <Link
        href="/paluwagan"
        className="s-card mt-6 block transition-colors hover:border-[var(--color-action)]"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[var(--color-ink)]">Paluwagan</h3>
          <span className="s-label">{t("vaults.palTag")}</span>
        </div>
        <p className="mt-1 text-sm text-[var(--color-slate)]">
          {t("vaults.palDesc")}
        </p>
        <div className="mt-2 text-xs font-bold text-[var(--color-action-deep)]">
          {t("vaults.palCta")}
        </div>
      </Link>

      <Link
        href="/savings"
        className="s-card mt-3 block transition-colors hover:border-[var(--color-action)]"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[var(--color-ink)]">
            Smart Savings
          </h3>
          <span className="s-label">{t("vaults.savTag")}</span>
        </div>
        <p className="mt-1 text-sm text-[var(--color-slate)]">
          {t("vaults.savDesc")}
        </p>
        <div className="mt-2 text-xs font-bold text-[var(--color-action-deep)]">
          {t("vaults.savCta")}
        </div>
      </Link>

      <p className="mt-6 text-[11px] leading-relaxed text-[var(--color-slate)]">
        Disaster contract:{" "}
        <a
          className="underline"
          href={ex(CONTRACTS.disaster)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {CONTRACTS.disaster.slice(0, 12)}…
        </a>
        . DAO governance + AI Tribunal = Build-Award vision.
      </p>
    </div>
  );
}
