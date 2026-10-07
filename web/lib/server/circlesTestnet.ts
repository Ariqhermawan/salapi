import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { StrKey } from "@stellar/stellar-sdk";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE, supabaseAdminConfigured } from "@/lib/supabase/env";
import { isLocalPreview } from "@/lib/local-preview";
import { CONTRACTS, donationCampaignId, readContract, sc } from "@/lib/server/stellar";
import { canonicalCircleTestnetSlug, circleTestnetSlugs, circleTestnetFailure, circleTestnetReady,
  validatedCircleTestnetMapping, validatedCircleTestnetCampaign,
  type CircleTestnetCode, type CircleTestnetCampaignResult, type CircleTestnetBatchResult } from "@/lib/circles/testnet";

const TABLE = "circles_testnet_campaigns";
const COLUMNS = "network,contract_id,circle_slug,campaign_id,campaign_title,creator_wallet,beneficiary_wallet,token_id,approver_wallets,creator_cut_bps,funding_deadline,review_deadline,purpose,archived_at";
const RPC_CONCURRENCY = 4;

function admin(): SupabaseClient | null {
  if (!supabaseAdminConfigured()) return null;
  try {
    const url = new URL(SUPABASE_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    const origin = url.origin;
    const boundedFetch: typeof fetch = (input, init) => {
      const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (target.origin !== origin || target.username || target.password) return Promise.reject(new Error("Unexpected mapping origin"));
      const timeout = AbortSignal.timeout(8_000);
      const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      return fetch(input, { ...init, signal, redirect: "error", cache: "no-store" });
    };
    return createClient(origin, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: boundedFetch },
    });
  } catch { return null; }
}

async function bounded<T>(operation: Promise<T>, milliseconds = 8_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Circles mapping read timed out")), milliseconds);
  })]); } finally { if (timer) clearTimeout(timer); }
}

function setupMissing(error: unknown): boolean {
  return !!error && typeof error === "object" && ["42P01", "PGRST205"].includes(String((error as { code?: unknown }).code));
}

/** Public, read-only and request-scoped. No viewer auth, custody or mutation. */
export async function readCirclesTestnetCampaigns(input: unknown = undefined): Promise<CircleTestnetBatchResult> {
  const contractId = donationCampaignId();
  const slugs = circleTestnetSlugs(input);
  const campaigns: Record<string, CircleTestnetCampaignResult> = Object.create(null);
  const envelope = { network: "testnet" as const, contractId, checkedAt: new Date().toISOString(), campaigns };
  if (!slugs) return { ...envelope, ok: false, code: "invalid_circle" };
  const failAll = (code: CircleTestnetCode) => {
    for (const slug of slugs) campaigns[slug] = circleTestnetFailure(slug, contractId, code);
    return { ...envelope, ok: false, code };
  };
  if (isLocalPreview) return failAll("local_preview");
  if (!contractId || !StrKey.isValidContract(contractId)) return failAll("not_configured");
  const db = admin();
  if (!db) return failAll("not_configured");
  let stopped = false;
  try {
    const stored = await bounded(Promise.resolve(db.from(TABLE).select(COLUMNS).eq("network", "testnet")
      .eq("contract_id", contractId).is("archived_at", null).in("circle_slug", slugs).limit(slugs.length + 1)));
    if (stored.error) return failAll(setupMissing(stored.error) ? "not_configured" : "unavailable");
    if (!Array.isArray(stored.data) || stored.data.length > slugs.length) return failAll("unavailable");
    // Missing mappings stay unavailable; never synthesize campaigns or counts.
    for (const slug of slugs) campaigns[slug] = circleTestnetFailure(slug, contractId, "unmapped");
    if (!stored.data.length) return { ...envelope, ok: true };
    const mappings = stored.data.map(row => validatedCircleTestnetMapping(row, contractId, CONTRACTS.tokenXlmSac));
    if (mappings.some(mapping => !mapping || !slugs.includes(mapping.circleId)) ||
      new Set(mappings.map(mapping => mapping!.circleId)).size !== mappings.length ||
      new Set(mappings.map(mapping => mapping!.campaignId)).size !== mappings.length) return failAll("unavailable");
    const [version, token, clock] = await bounded(Promise.all([
      readContract(contractId, "version"), readContract(contractId, "token"), readContract(contractId, "clock"),
    ]));
    if (version !== 4 || token !== CONTRACTS.tokenXlmSac || typeof clock !== "bigint" || clock <= 0n || clock > (1n << 64n) - 1n) return failAll("unavailable");
    let next = 0;
    const workers = Array.from({ length: Math.min(RPC_CONCURRENCY, mappings.length) }, async () => {
      while (!stopped && next < mappings.length) {
        const mapping = mappings[next++]!;
        campaigns[mapping.circleId] = circleTestnetFailure(mapping.circleId, contractId, "unavailable");
        try {
          const raw = await bounded(readContract(contractId, "campaign", [sc.u64(BigInt(mapping.campaignId))]));
          if (stopped) return;
          const campaign = validatedCircleTestnetCampaign(raw, mapping, CONTRACTS.tokenXlmSac);
          if (campaign) campaigns[mapping.circleId] = circleTestnetReady(mapping, campaign, contractId, clock);
        } catch { /* Preserve an honest unavailable result for this exact mapping. */ }
      }
    });
    try { await bounded(Promise.all(workers), 15_000); }
    catch {
      stopped = true;
      for (const mapping of mappings) if (!campaigns[mapping!.circleId].ok) {
        campaigns[mapping!.circleId] = circleTestnetFailure(mapping!.circleId, contractId, "unavailable");
      }
    }
    return { ...envelope, ok: true };
  } catch { return failAll("unavailable"); }
  finally { stopped = true; }
}

export async function readCircleTestnetCampaign(input: unknown): Promise<CircleTestnetCampaignResult> {
  const slug = canonicalCircleTestnetSlug(input);
  if (!slug) return circleTestnetFailure("", donationCampaignId(), "invalid_circle");
  const batch = await readCirclesTestnetCampaigns([slug]);
  return batch.campaigns[slug] ?? circleTestnetFailure(slug, batch.contractId, "unavailable");
}
