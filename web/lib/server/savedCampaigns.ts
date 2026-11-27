import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { verifiedAccountOwner } from "@/lib/server/verifiedAccountOwner";

const TABLE = "d4_saved_campaigns";
const MAX_CAMPAIGN_ID = 18_446_744_073_709_551_615n;
type Failure = { ok: false; error: string };

function campaignId(value: unknown): string | null {
  if (typeof value !== "string" || !/^[1-9]\d{0,19}$/.test(value)) return null;
  try { return BigInt(value) <= MAX_CAMPAIGN_ID ? value : null; } catch { return null; }
}

export async function readSavedCampaigns(expectedOwnerId: unknown): Promise<{ ok: true; campaignIds: string[] } | Failure> {
  const who = await verifiedAccountOwner(expectedOwnerId);
  if (!who.ok) return { ok: false, error: who.error };
  try {
    const { data, error } = await createSupabaseAdmin().from(TABLE).select("campaign_id")
      .eq("user_id", who.userId).order("created_at", { ascending: false }).limit(500);
    if (error || !Array.isArray(data) || data.some(row => !campaignId(row.campaign_id)))
      return { ok: false, error: "Saved campaigns could not be loaded from your account." };
    return { ok: true, campaignIds: data.map(row => row.campaign_id as string) };
  } catch {
    return { ok: false, error: "Saved campaigns could not be loaded from your account." };
  }
}

export async function setSavedCampaign(campaignIdInput: unknown, save: unknown, expectedOwnerId: unknown): Promise<{ ok: true; saved: boolean } | Failure> {
  const who = await verifiedAccountOwner(expectedOwnerId);
  if (!who.ok) return { ok: false, error: who.error };
  const id = campaignId(campaignIdInput);
  if (!id || typeof save !== "boolean") return { ok: false, error: "The saved campaign could not be verified." };
  try {
    const admin = createSupabaseAdmin();
    const result = save
      ? await admin.from(TABLE).upsert({ user_id: who.userId, campaign_id: id }, { onConflict: "user_id,campaign_id", ignoreDuplicates: true })
      : await admin.from(TABLE).delete().eq("user_id", who.userId).eq("campaign_id", id);
    if (result.error) return { ok: false, error: "Saved campaigns could not be updated in your account." };
    return { ok: true, saved: save };
  } catch {
    return { ok: false, error: "Saved campaigns could not be updated in your account." };
  }
}
