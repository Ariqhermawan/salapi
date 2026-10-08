export type CampaignSupport = { amount: string; status: "donated" | "refunded" | "none" | "unavailable" };
export type CampaignSupportResult = { ok: true; ownerId: string; contributions: Record<string, CampaignSupport>; circleCampaigns?: Record<string, string> };
export function campaignSupportIds(input: unknown): string[] | null {
  if (typeof input !== "string" || input.length > 839) return null;
  const ids = input.split(",");
  return ids.length > 0 && ids.length <= 40 && new Set(ids).size === ids.length
    && ids.every(id => /^[1-9]\d{0,19}$/.test(id) && BigInt(id) <= 18_446_744_073_709_551_615n) ? ids : null;
}
export function validCampaignSupport(value: unknown): value is CampaignSupportResult {
  if (!value || typeof value !== "object") return false;
  const v = value as CampaignSupportResult;
  return v.ok === true && typeof v.ownerId === "string" && !!v.contributions && typeof v.contributions === "object" && !Array.isArray(v.contributions)
    && (!v.circleCampaigns || typeof v.circleCampaigns === "object" && !Array.isArray(v.circleCampaigns)
      && Object.entries(v.circleCampaigns).length <= 27 && Object.entries(v.circleCampaigns).every(([slug, id]) => /^[a-z0-9-]{1,80}$/.test(slug) && campaignSupportIds(id) !== null))
    && Object.entries(v.contributions).length <= 40 && Object.entries(v.contributions).every(([id, c]) =>
      campaignSupportIds(id) !== null && c && typeof c.amount === "string" && /^\d{1,39}$/.test(c.amount)
      && ["donated", "refunded", "none", "unavailable"].includes(c.status)
      && (c.status === "donated" || c.status === "refunded" ? BigInt(c.amount) > 0n : c.amount === "0"));
}
