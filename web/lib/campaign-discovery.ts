import type { Campaign } from "./campaign.ts";
import type { Locale } from "./i18n/config.ts";
import { campaignDiscoveryCopy } from "./i18n/revamp-campaign-discovery.ts";

export type CampaignDiscoveryView = "examples" | "testnet";
export type D4CampaignLayout = "grid" | "list";
export type D4CampaignStatusTone = "open" | "review" | "approved" | "refund" | "ready" | "released" | "closed";
export type D4CampaignStatusPresentation = {
  tone: D4CampaignStatusTone;
  label: string;
  detail?: string;
  accessibleLabel: string;
};

export function d4CampaignStatus(campaign: Omit<Campaign, "contribution">, now: bigint): string {
  if (campaign.state === "Refundable") return "Refund available";
  const active = campaign.state === "Funding" || campaign.state === "PendingProof";
  const quorum = campaign.approvals.length >= 2;
  if (active && now >= BigInt(campaign.config.review_deadline) && !quorum)
    return campaign.total === "0" ? "Ready to close" : "Refund available";
  if (campaign.state === "Funding" && now >= BigInt(campaign.config.funding_deadline)) return "Awaiting proof";
  if (campaign.state === "PendingProof" && quorum) return "Proof approved";
  if (campaign.state === "PendingProof") return "In review";
  if (campaign.state === "Closed") return "Ended";
  return campaign.state;
}

function deadlineText(seconds: string, locale: Locale): string | undefined {
  const date = new Date(Number(seconds) * 1000);
  if (!Number.isFinite(date.getTime())) return undefined;
  const dateLocale = { en: "en-GB", tl: "tl-PH", id: "id-ID", vi: "vi-VN" }[locale];
  try {
    return new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC";
  } catch { return undefined; }
}

export function d4CampaignStatusPresentation(
  campaign: Omit<Campaign, "contribution">, now: bigint, locale: Locale,
): D4CampaignStatusPresentation {
  const status = d4CampaignStatus(campaign, now);
  const copy = campaignDiscoveryCopy(locale);
  if (status === "Funding") {
    const date = deadlineText(campaign.config.funding_deadline, locale);
    const label = copy("Open for contributions");
    const detail = date ? copy("Funding closes") + ": " + date : undefined;
    return { tone: "open", label, detail, accessibleLabel: detail ? label + " · " + detail : label };
  }

  const messages: Record<string, { tone: D4CampaignStatusTone; key: Parameters<typeof copy>[0] }> = {
    "Awaiting proof": { tone: "review", key: "Closed to contributions · awaiting proof" },
    "In review": { tone: "review", key: "Closed to contributions · proof in review" },
    "Proof approved": { tone: "approved", key: "Closed to contributions · proof approved, release pending" },
    "Refund available": { tone: "refund", key: "Closed · refund available" },
    "Ready to close": { tone: "ready", key: "Closed to contributions · ready to close" },
    Released: { tone: "released", key: "Closed · funds released" },
  };
  if (status === "Ended") {
    const key = campaign.total === "0" ? "Closed · no contributions received" : "Closed · refunds completed";
    const label = copy(key);
    return { tone: "closed", label, accessibleLabel: label };
  }
  const message = messages[status];
  if (message) {
    const label = copy(message.key);
    return { tone: message.tone, label, accessibleLabel: label };
  }
  const label = status === "My campaigns" ? copy("My campaigns") : status;
  return { tone: "closed", label, accessibleLabel: label };
}

export function d4CampaignStatusFilterLabel(status: string, locale: Locale): string {
  const copy = campaignDiscoveryCopy(locale);
  switch (status) {
    case "All": return copy("All");
    case "My campaigns": return copy("My campaigns");
    case "Funding": return copy("Open for contributions");
    case "Awaiting proof": return copy("Closed to contributions · awaiting proof");
    case "In review": return copy("Closed to contributions · proof in review");
    case "Proof approved": return copy("Closed to contributions · proof approved, release pending");
    case "Refund available": return copy("Closed · refund available");
    case "Ready to close": return copy("Closed to contributions · ready to close");
    case "Released": return copy("Closed · funds released");
    case "Ended": case "Closed": return copy("Closed");
    default: return status;
  }
}

export function filterD4Campaigns(
  campaigns: Campaign[], filter: string, query: string, viewer: string | null, now: bigint,
): Campaign[] {
  const words = query.trim().toLocaleLowerCase();
  return campaigns.filter(campaign => {
    const matchesFilter = filter === "All"
      || filter === "My campaigns" && campaign.config.creator === viewer
      || d4CampaignStatus(campaign, now) === filter;
    const searchable = `${campaign.title} ${campaign.id} ${campaign.state} ${d4CampaignStatus(campaign, now)} ${campaign.config.creator} ${campaign.config.beneficiary}`.toLocaleLowerCase();
    const matchesQuery = !words || searchable.includes(words);
    return matchesFilter && matchesQuery;
  });
}

// Keep direct D4 IDs and creation links authoritative. The larger Circles
// catalog is a separate prototype, never a set of deployed escrow contracts.
export function campaignDiscoveryView(
  params: { id?: string; create?: string; mode?: string }, localPreview: boolean,
): CampaignDiscoveryView {
  if (params.id || params.create === "1" || params.mode === "testnet") return "testnet";
  if (params.mode === "examples" || localPreview) return "examples";
  // Keep the default discovery page on the same, clearly labeled prototype
  // catalog in local and production. Live contract campaigns stay available
  // from the explicit Testnet tab and direct campaign links.
  return "examples";
}
