"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RECURRING_CAMPAIGN_FIXTURES } from "@/lib/recurring-campaign-preview";
import styles from "./PrototypePreviewAside.module.css";

type FlowLink = { href: string; label: string };
type Feature = FlowLink & { children: FlowLink[] };

const FLOW: Feature[][] = [
  [
    { href: "/", label: "Home", children: [
      { href: "/?causes=a", label: "Home · Causes A · Row" }, { href: "/?causes=b", label: "Home · Causes B · Featured and list" }, { href: "/?causes=c", label: "Home · Causes C · Grid" },
      { href: "/?update=ready", label: "Update ready" }, { href: "/send", label: "Send" }, { href: "/receive", label: "Receive" },
      { href: "/topup", label: "Top up · Choose currency" }, { href: "/topup?cur=idr", label: "Top up · IDR" }, { href: "/topup?cur=php", label: "Top up · PHP" }, { href: "/topup?cur=usdc", label: "Top up · USDC" },
      { href: "/withdraw", label: "Withdraw · Choose currency" }, { href: "/withdraw?cur=idr", label: "Withdraw · IDR" }, { href: "/withdraw?cur=php", label: "Withdraw · PHP" }, { href: "/withdraw?cur=usdc", label: "Withdraw · USDC" },
    ] },
    { href: "/causes", label: "Causes", children: [
      { href: "/cause/mei", label: "Cause" }, { href: "/cause/baybayin-zines", label: "Cause · Less than 1 day" }, { href: "/cause/santos-roof/feedback", label: "Cause feedback" }, { href: "/cause/bantayan/report", label: "Report cause" },
      { href: "/organizer/meis_family", label: "Organizer profile" }, { href: "/organizer/meis_family?total=open", label: "Organizer · Total raised" }, { href: "/organizer/meis_family?tab=trust", label: "Organizer · Trust" }, { href: "/donate/mei", label: "Donate" },
      { href: "/cause/reading-zines", label: "Cause · Recurring, in stages" }, { href: "/cause/tita-ana?tab=proof", label: "Cause · Recurring, still funding" },
      { href: "/create", label: "Create cause" }, { href: "/create?kind=recurring&stages=empty", label: "Create cause · Recurring, stages empty" }, { href: "/create?kind=recurring", label: "Create cause · Recurring stages" }, { href: "/create?kind=recurring&stages=over", label: "Create cause · Recurring, over the goal" }, { href: "/create?kind=recurring&step=review", label: "Create cause · Recurring review" }, { href: "/manage", label: "Your causes" }, { href: "/manage/mei", label: "Manage cause" }, { href: "/manage/mei/payout", label: "Payout" }, { href: "/manage/reading-zines/payout", label: "Payout · Stages" }, { href: "/manage/tita-ana/payout", label: "Payout · Stages, still funding" }, { href: "/manage/reading-zines/edit", label: "Edit cause · Recurring" },
      { href: "/campaigns?mode=recurring&fixture=funding", label: "D5 Testnet · Funding" }, { href: "/campaigns?mode=recurring&fixture=scheduled", label: "D5 Testnet · Scheduled stage" }, { href: "/campaigns?mode=recurring&fixture=proof", label: "D5 Testnet · Proof review" }, { href: "/campaigns?mode=recurring&fixture=ready", label: "D5 Testnet · Two approvals" }, { href: "/campaigns?mode=recurring&fixture=refundable", label: "D5 Testnet · Unspent refund" }, { href: "/campaigns?mode=recurring&fixture=released", label: "D5 Testnet · Released" }, { href: "/campaigns?mode=recurring&fixture=closed", label: "D5 Testnet · Closed" },
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
      { href: "/vault?ngo=unassigned", label: "No NGOs assigned" }, { href: "/vault?ngo=team", label: "Salapi team · NGO review" }, { href: "/vault?ngo=partner", label: "NGO · Assignment" }, { href: "/vault?tab=activity", label: "Vault activity" },
      { href: "/vault?tab=activity&filter=in", label: "Vault activity · Contributions" }, { href: "/vault?tab=activity&filter=out", label: "Vault activity · NGO payouts" }, { href: "/ngo/tulong-cebu", label: "NGO profile" }, { href: "/vault/contribute", label: "Contribute" },
    ] },
    { href: "/you", label: "You", children: [
      { href: "/you/feedback", label: "Send feedback" }, { href: "/you/invite", label: "Invite friends" }, { href: "/you/referrals", label: "Referrals" }, { href: "/you/referrals?state=empty", label: "Referrals · None yet" }, { href: "/you/referrals?state=earned", label: "Referrals · Reward earned" }, { href: "/you/invite?state=earned", label: "Invite friends · Reward earned" }, { href: "/learn", label: "How Salapi works" },
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
  const [empty, setEmpty] = useState(false);
  const activeRoute = useMemo(() => {
    if (pathname === "/" && params.get("causes") && ["a", "b", "c"].includes(params.get("causes") ?? "")) return `/?causes=${params.get("causes")}`;
    if (pathname.startsWith("/organizer/") && params.get("total") === "open") return `${pathname}?total=open`;
    if (pathname.startsWith("/organizer/") && params.get("tab") === "trust") return `${pathname}?tab=trust`;
    if (pathname === "/campaigns" && params.get("mode") === "recurring" && RECURRING_CAMPAIGN_FIXTURES.includes(params.get("fixture") as (typeof RECURRING_CAMPAIGN_FIXTURES)[number])) return `${pathname}?mode=recurring&fixture=${params.get("fixture")}`;
    if (pathname === "/cause/tita-ana" && params.get("tab") === "proof") return `${pathname}?tab=proof`;
    if (pathname === "/manage/reading-zines/payout" || pathname === "/manage/tita-ana/payout" || pathname === "/manage/reading-zines/edit") return pathname;
    if (pathname === "/create" && params.get("kind") === "recurring") {
      if (params.get("stages") === "empty") return "/create?kind=recurring&stages=empty";
      if (params.get("stages") === "over") return "/create?kind=recurring&stages=over";
      if (params.get("step") === "review") return "/create?kind=recurring&step=review";
      return "/create?kind=recurring";
    }
    if ((pathname === "/topup" || pathname === "/withdraw") && params.has("cur")) return `${pathname}?cur=${params.get("cur")?.toLowerCase()}`;
    if (pathname === "/you/referrals" && params.get("state") === "empty") return "/you/referrals?state=empty";
    if (pathname === "/you/referrals" && params.get("state") === "earned") return "/you/referrals?state=earned";
    if (pathname === "/you/invite" && params.get("state") === "earned") return "/you/invite?state=earned";
    if (pathname === "/vault" && params.get("tab") === "activity") {
      if (params.get("filter") === "in" || params.get("filter") === "out") return `/vault?tab=activity&filter=${params.get("filter")}`;
      return "/vault?tab=activity";
    }
    if (pathname === "/vault" && params.has("ngo")) return `/vault?ngo=${params.get("ngo")}`;
    return pathname;
  }, [params, pathname]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(VAULT_DATA_KEY) ?? "null") as { balanceCents?: number; vaultCents?: number; ledger?: unknown[] } | null;
      setEmpty(!!stored && stored.balanceCents === 0 && stored.vaultCents === 0 && stored.ledger?.length === 0);
    } catch { /* The navigation panel remains available when browser storage is disabled. */ }
  }, []);

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
      <button type="button" onClick={resetPreview}><span aria-hidden="true">↻</span>Reset</button>
      <button className={styles.wide} type="button" aria-pressed={empty} onClick={toggleEmpty}><span aria-hidden="true">▣</span>{empty ? "Sample data" : "Empty state"}</button>
      <button className={styles.wide} type="button" onClick={() => router.push("/notifications")}><span aria-hidden="true">♧</span>Test notification</button>
    </div>
  </aside>;
}
