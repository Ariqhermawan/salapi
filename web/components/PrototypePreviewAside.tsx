"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./PrototypePreviewAside.module.css";

type FlowLink = { href: string; label: string };
type Feature = FlowLink & { children: FlowLink[] };

const FLOW: Feature[][] = [
  [
    { href: "/", label: "Home", children: [
      { href: "/?update=ready", label: "Update ready" }, { href: "/send", label: "Send" }, { href: "/receive", label: "Receive" }, { href: "/topup", label: "Top up" }, { href: "/withdraw", label: "Withdraw" },
    ] },
    { href: "/causes", label: "Causes", children: [
      { href: "/cause/mei", label: "Cause" }, { href: "/cause/baybayin-zines", label: "Cause · Less than 1 day" }, { href: "/cause/santos-roof/feedback", label: "Cause feedback" }, { href: "/cause/bantayan/report", label: "Report cause" },
      { href: "/organizer/meis_family", label: "Organizer profile A" }, { href: "/organizer/meis_family?figs=b", label: "Organizer profile B" }, { href: "/organizer/meis_family?figs=c", label: "Organizer profile C" }, { href: "/donate/mei", label: "Donate" },
      { href: "/create", label: "Create cause" }, { href: "/manage", label: "Your causes" }, { href: "/manage/mei", label: "Manage cause" }, { href: "/manage/mei/payout", label: "Payout" },
    ] },
    { href: "/activity", label: "Activity", children: [{ href: "/notifications", label: "Notifications" }] },
  ],
  [
    { href: "/signin", label: "Sign in", children: [
      { href: "/wallet-setup", label: "Wallet setup" }, { href: "/heard", label: "How did you hear" }, { href: "/r/JAM4X7QP", label: "Referral link" }, { href: "/username", label: "Username" },
    ] },
    { href: "/you/verify/preview", label: "KYC", children: [
      { href: "/you/verify/preview/pending", label: "Under review" }, { href: "/you/verify/preview/approved", label: "Approved" }, { href: "/you/verify/preview/retry", label: "Retry required" }, { href: "/you/verify/preview/rejected", label: "Rejected" }, { href: "/you/verify/preview/levels", label: "Organizer levels" },
    ] },
    { href: "/vaults", label: "Arisan", children: [
      { href: "/vaults/sample", label: "With rooms" }, { href: "/vaults/empty", label: "No rooms yet" }, { href: "/vaults/room", label: "Create room" }, { href: "/vaults/join", label: "Join room" },
      { href: "/vaults/sample/state/countdown", label: "Full room · Countdown" }, { href: "/vaults/sample/state/draw-member", label: "Draw day · Member" }, { href: "/vaults/sample/state/draw-master", label: "Draw day · Room Master" }, { href: "/vaults/sample/state/master-away", label: "Room Master away" },
    ] },
    { href: "/vault", label: "Disaster Vault", children: [
      { href: "/vault?ngo=unassigned", label: "No NGOs assigned" }, { href: "/vault?ngo=team", label: "Salapi team · NGO review" }, { href: "/vault?ngo=partner", label: "NGO · Assignment" }, { href: "/vault?tab=activity", label: "Vault activity" }, { href: "/ngo/tulong-cebu", label: "NGO profile" }, { href: "/vault/contribute", label: "Contribute" },
    ] },
    { href: "/you", label: "You", children: [
      { href: "/you/feedback", label: "Send feedback" }, { href: "/you/invite", label: "Invite friends" }, { href: "/learn", label: "How Salapi works" },
    ] },
  ],
];

const LOCAL_DATA_PREFIXES = ["salapi.local-preview.", "salapi:local-preview:"];
const VAULT_DATA_KEY = "salapi.local-preview.disaster-vault.v1";

function cleanHref(href: string) {
  const url = new URL(href, "http://local.invalid");
  return `${url.pathname}${url.search}`;
}

export default function PrototypePreviewAside() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [dark, setDark] = useState(false);
  const [empty, setEmpty] = useState(false);
  const activeRoute = useMemo(() => {
    if (pathname === "/organizer/" + pathname.split("/")[2] && (params.get("figs") === "b" || params.get("figs") === "c")) return `${pathname}?figs=${params.get("figs")}`;
    if (pathname === "/vault" && params.get("tab") === "activity") return "/vault?tab=activity";
    if (pathname === "/vault" && params.has("ngo")) return `/vault?ngo=${params.get("ngo")}`;
    return pathname;
  }, [params, pathname]);

  useEffect(() => {
    try {
      setDark(document.documentElement.dataset.theme === "dark");
      const stored = JSON.parse(localStorage.getItem(VAULT_DATA_KEY) ?? "null") as { balanceCents?: number; vaultCents?: number; ledger?: unknown[] } | null;
      setEmpty(!!stored && stored.balanceCents === 0 && stored.vaultCents === 0 && stored.ledger?.length === 0);
    } catch { /* The navigation panel remains available when browser storage is disabled. */ }
  }, []);

  function toggleTheme() {
    const nextDark = !dark;
    setDark(nextDark);
    document.documentElement.dataset.theme = nextDark ? "dark" : "light";
    try { localStorage.setItem("salapi-theme", nextDark ? "dark" : "light"); } catch { /* Theme still changes for this visit. */ }
  }

  function resetPreview() {
    for (const key of Object.keys(localStorage)) if (LOCAL_DATA_PREFIXES.some(prefix => key.startsWith(prefix))) localStorage.removeItem(key);
    window.location.assign("/");
  }

  function toggleEmpty() {
    if (empty) {
      localStorage.removeItem(VAULT_DATA_KEY);
      setEmpty(false);
    } else {
      localStorage.setItem(VAULT_DATA_KEY, JSON.stringify({ balanceCents: 0, vaultCents: 0, ledger: [] }));
      setEmpty(true);
    }
    window.location.reload();
  }

  return <aside className={styles.aside} lang="en">
    <h1>Salapi prototype</h1>
    <p>Every flow in the Figma v4.2 look. No real money moves.</p>
    <nav className={styles.links} aria-label="Screens">
      {FLOW.map((column, index) => <ul key={index}>{column.map(feature => <li key={feature.href}>
        <Link href={feature.href} aria-current={activeRoute === cleanHref(feature.href) ? "page" : undefined}>{feature.label}</Link>
        <ul>{feature.children.map(child => <li key={child.href}><Link href={child.href} aria-current={activeRoute === cleanHref(child.href) ? "page" : undefined}>{child.label}</Link></li>)}</ul>
      </li>)}</ul>)}
    </nav>
    <div className={styles.controls}>
      <button type="button" onClick={toggleTheme}><span aria-hidden="true">{dark ? "☼" : "☾"}</span>{dark ? "Light" : "Dark"}</button>
      <button type="button" onClick={resetPreview}><span aria-hidden="true">↻</span>Reset</button>
      <button className={styles.wide} type="button" aria-pressed={empty} onClick={toggleEmpty}><span aria-hidden="true">▣</span>{empty ? "Sample data" : "Empty state"}</button>
      <button className={styles.wide} type="button" onClick={() => router.push("/notifications")}><span aria-hidden="true">♧</span>Test notification</button>
    </div>
  </aside>;
}
