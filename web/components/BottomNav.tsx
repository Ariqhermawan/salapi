"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { House, Pulse, User, Users } from "@phosphor-icons/react";
import { TabBar, Ico, type Tab } from "@/components/ui/kit";
import { useT } from "@/components/I18nProvider";
import { homeCopy } from "@/lib/i18n/revamp-home";

type TabPrefetchKind = NonNullable<Parameters<ReturnType<typeof useRouter>["prefetch"]>[1]>["kind"];

export default function BottomNav() {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const { t, locale } = useT();
  const prefetched = useRef(new Set<string>());

  // Pre-auth / standalone screens have no app nav — keeps the tab bar from
  // bleeding onto onboarding, sign-in, and the offline screen (and from
  // falsely lighting the Home tab there).
  if (
    path === "/onboarding" ||
    (path === "/create" && process.env.NEXT_PUBLIC_LOCAL_PREVIEW === "1") ||
    (path === "/wallet/setup" && process.env.NEXT_PUBLIC_LOCAL_PREVIEW === "1") ||
    path === "/signin" ||
    path === "/receive" ||
    path === "/you/invite" ||
    path.startsWith("/you/verify/preview") ||
    path === "/you/heard" ||
    path === "/offline" ||
    path.startsWith("/docs") ||
    path === "/send" ||
    /^\/activity\/[^/]+$/.test(path) ||
    path === "/topup" ||
    path === "/withdraw" ||
    /^\/manage\/[^/]+\/updates\/new$/.test(path) ||
    path.startsWith("/cause/") ||
    path.startsWith("/donate/") ||
    (path === "/campaigns" && (params.has("id") || params.get("create") === "1")) ||
    path.startsWith("/circles/") ||
    path === "/arisan/new" ||
    path === "/arisan/join" ||
    path === "/arisan/funding" ||
    path.startsWith("/vault/contribute")
  ) {
    return null;
  }

  const items: Tab[] = [
    { id: "/", label: t("nav.home"), icon: ({ size, active } = {}) => <House size={size} weight={active ? "fill" : "regular"} /> },
    { id: "/vaults", label: "Arisan", icon: ({ size, active } = {}) => <Users size={size} weight={active ? "fill" : "regular"} /> },
    { id: "/campaigns?create=1", label: homeCopy(locale, "Cause"), icon: Ico.plus, fab: true },
    { id: "/activity", label: t("nav.activity"), icon: ({ size, active } = {}) => <Pulse size={size} weight={active ? "bold" : "regular"} /> },
    { id: "/you", label: t("common.you"), icon: ({ size, active } = {}) => <User size={size} weight={active ? "fill" : "regular"} /> },
  ];

  // Highlight the tab whose section the current path is under. If the path
  // belongs to no tab (e.g. /topup, /withdraw, /receive, /transparency,
  // /paluwagan, /savings), highlight NOTHING rather than falsely lighting Home.
  const active =
    path === "/"
      ? "/"
      : path === "/vault" ? "/"
      : path === "/campaigns" ? "/campaigns?create=1"
      : /^\/(vaults|arisan|paluwagan|savings)(\/|$)/.test(path)
        ? "/vaults"
      : path === "/saved" ? "/you"
        : path.startsWith("/tx/") ? "/activity"
      : path.startsWith("/manage") ? "/you"
      : path === "/settings" || path.startsWith("/settings/") ? "/you"
      : path === "/you" || path.startsWith("/you/") ? "/you"
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
