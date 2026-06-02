"use client";

import { usePathname, useRouter } from "next/navigation";
import { TabBar, Ico } from "@/components/ui/kit";
import { useT } from "@/components/I18nProvider";

export default function BottomNav() {
  const path = usePathname();
  const router = useRouter();
  const { t } = useT();

  // Pre-auth / standalone screens have no app nav — keeps the tab bar from
  // bleeding onto onboarding, sign-in, and the offline screen (and from
  // falsely lighting the Home tab there).
  if (path === "/onboarding" || path === "/signin" || path === "/offline") {
    return null;
  }

  const items = [
    { id: "/", label: t("nav.home"), icon: Ico.home },
    { id: "/vaults", label: t("nav.vaults"), icon: Ico.vault },
    { id: "/send", label: t("nav.send"), icon: Ico.send, fab: true },
    { id: "/activity", label: t("nav.activity"), icon: Ico.activity },
    { id: "/settings", label: t("common.you"), icon: Ico.user },
  ];

  // Highlight the tab whose section the current path is under. If the path
  // belongs to no tab (e.g. /topup, /withdraw, /receive, /transparency,
  // /paluwagan, /savings), highlight NOTHING rather than falsely lighting Home.
  const active =
    path === "/"
      ? "/"
      : items.find((i) => i.id !== "/" && path.startsWith(i.id))?.id ?? "";

  return (
    <TabBar
      items={items}
      active={active}
      onNav={(id) => router.push(id)}
    />
  );
}
