"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef } from "react";
import { TabBar, Ico } from "@/components/ui/kit";
import { useT } from "@/components/I18nProvider";

type TabPrefetchKind = NonNullable<Parameters<ReturnType<typeof useRouter>["prefetch"]>[1]>["kind"];

export default function BottomNav() {
  const path = usePathname();
  const router = useRouter();
  const { t } = useT();
  const prefetched = useRef(new Set<string>());

  // Pre-auth / standalone screens have no app nav — keeps the tab bar from
  // bleeding onto onboarding, sign-in, and the offline screen (and from
  // falsely lighting the Home tab there).
  if (
    path === "/onboarding" ||
    path === "/signin" ||
    path === "/offline" ||
    path.startsWith("/docs")
  ) {
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
      : /^\/(vaults|arisan|paluwagan|campaigns|circles|savings|transparency)/.test(path)
        ? "/vaults"
        : /^\/(send|receive|topup|withdraw)/.test(path) ? "/send"
        : path.startsWith("/tx/") ? "/activity"
        : path.startsWith("/you/") ? "/settings"
        : items.find((i) => i.id !== "/" && path.startsWith(i.id))?.id ?? "";

  function prefetch(id: string) {
    // Warm only a tab the user is about to open, not every tab on every mount.
    // Prefetch renders the route shell; its client data reads do not mount.
    if (id === path || prefetched.current.has(id) || !items.some(item => item.id === id)) return;
    prefetched.current.add(id);
    try {
      router.prefetch(id, {
        // Installed Next requires its string-enum kind in the options type.
        // Auto stops at loading boundaries instead of eagerly rendering data.
        kind: "auto" as TabPrefetchKind,
        onInvalidate: () => { prefetched.current.delete(id); },
      });
    } catch {
      prefetched.current.delete(id);
    }
  }

  return (
    <TabBar
      items={items}
      active={active}
      onPrefetch={prefetch}
      onNav={(id) => {
        // A tab's base URL must still clear query/hash state on its section.
        // Read browser location only in the click handler, not during SSR.
        if (id !== path || window.location.search || window.location.hash) router.push(id);
      }}
    />
  );
}
