"use client";

import { usePathname, useRouter } from "next/navigation";
import { TabBar, Ico } from "@/components/ui/kit";
import { useT } from "@/components/I18nProvider";

export default function BottomNav() {
  const path = usePathname();
  const router = useRouter();
  const { t } = useT();

  const items = [
    { id: "/", label: t("nav.home"), icon: Ico.home },
    { id: "/vaults", label: t("nav.vaults"), icon: Ico.vault },
    { id: "/send", label: t("nav.send"), icon: Ico.send, fab: true },
    { id: "/activity", label: t("nav.activity"), icon: Ico.activity },
    { id: "/learn", label: t("nav.learn"), icon: Ico.globe },
    { id: "/settings", label: t("common.you"), icon: Ico.user },
  ];

  const active =
    path === "/"
      ? "/"
      : items.find((i) => i.id !== "/" && path.startsWith(i.id))?.id ?? "/";

  return (
    <TabBar
      items={items}
      active={active}
      onNav={(id) => router.push(id)}
    />
  );
}
