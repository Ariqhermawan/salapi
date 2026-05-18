"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useT } from "@/components/I18nProvider";
import { Button } from "@/components/ui";

export default function SignIn() {
  const router = useRouter();
  const { t } = useT();
  const [pending, start] = useTransition();
  return (
    <div className="flex min-h-[70vh] flex-col justify-center px-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-action)] text-2xl font-extrabold text-white">
          S
        </div>
        <h1 className="s-h1">Salapi</h1>
        <p className="s-sub mt-1">{t("home.tagline")}</p>
      </div>
      <div className="mt-8 space-y-3">
        <Button
          disabled={pending}
          onClick={() => start(() => void router.push("/"))}
        >
          {pending ? t("common.processing") : "Continue with Google"}
        </Button>
        <p className="text-center text-[11px] text-[var(--color-slate)]">
          Sandbox sign-in seam. Production = Google OAuth via the platform
          auth provider. No real account is created.
        </p>
      </div>
    </div>
  );
}
