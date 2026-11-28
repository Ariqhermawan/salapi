import type { Campaign } from "./campaign";
import type { Locale } from "./i18n/config";

export const HOME_CAMPAIGN_LIMIT = 3;
export const HOME_CAMPAIGN_PAGE_SIZE = 10;
export const HOME_CAMPAIGN_MAX_PAGES = 4;

function unsignedInteger(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,38})$/.test(value)) return null;
  try { return BigInt(value); } catch { return null; }
}

/** Latest D4 campaigns that are still open at the contract's ledger time. */
export function selectHomeCampaigns(
  campaigns: readonly Omit<Campaign, "contribution">[],
  ledgerTime: string | null | undefined,
  limit = HOME_CAMPAIGN_LIMIT,
): Omit<Campaign, "contribution">[] {
  const now = unsignedInteger(ledgerTime);
  if (now === null || !Number.isSafeInteger(limit) || limit < 1 || limit > 10) return [];
  return campaigns.filter(campaign => {
    const id = unsignedInteger(campaign.id);
    const deadline = unsignedInteger(campaign.config?.funding_deadline);
    const escrow = unsignedInteger(campaign.escrow);
    return id !== null && id > 0n && deadline !== null && deadline > now
      && escrow !== null && campaign.state === "Funding";
  }).sort((left, right) => {
    const a = BigInt(left.id), b = BigInt(right.id);
    return a === b ? 0 : a > b ? -1 : 1;
  }).slice(0, limit);
}

/** Exact display of Testnet XLM stroops. This is never a fiat estimate. */
export function formatHomeXlm(stroops: string, locale: Locale): string | null {
  const amount = unsignedInteger(stroops);
  if (amount === null) return null;
  const whole = amount / 10_000_000n;
  const fraction = (amount % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  const decimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1 }).formatToParts(1.1)
    .find(part => part.type === "decimal")?.value ?? ".";
  return `${whole.toLocaleString(locale)}${fraction ? `${decimal}${fraction}` : ""}`;
}
