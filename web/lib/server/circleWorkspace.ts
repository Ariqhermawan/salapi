import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { isLocalPreview } from "@/lib/local-preview";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseConfigured, supabaseAdminConfigured } from "@/lib/supabase/env";
import { currentWalletPublicKey } from "@/lib/server/userWallet";
import { campaignState } from "@/app/campaign-actions";
import { WORKSPACE_LOCAL_ACTORS, isWorkspaceLocalHost, workspaceId, parseWorkspacePublish, parseWorkspaceUpdate, parseWorkspaceReview, parseWorkspaceSupport, workspaceReviewEligibility, workspaceXlmFromStroops, type WorkspaceActor, type WorkspaceCampaign, type WorkspaceMedia, type WorkspaceSnapshot, type WorkspaceUpdate, type WorkspaceReview, type WorkspaceResult } from "@/lib/circles/workspace";
import { mutateLocalWorkspace, ownedLocalCampaign, ownLocalMedia, readLocalWorkspace, registerLocalActor } from "./circleWorkspaceLocal";

export const WORKSPACE_ROLE_COOKIE = "salapi-circle-local-role";
export const WORKSPACE_BUCKET = "circle-workspace-media";
type Client = Awaited<ReturnType<typeof createSupabaseServer>>;
type Context = { mode: "local"; actor: WorkspaceActor | null; localRole: "organizer" | "donor" | "visitor" } | { mode: "testnet"; actor: WorkspaceActor | null; db: Client };
export async function workspaceContext(write = false): Promise<Context> {
  const request = await headers();
  const local = isWorkspaceLocalHost(request.get("host"), request.get("x-forwarded-host"), request.get("origin"), Boolean(process.env.VERCEL || process.env.VERCEL_ENV), isLocalPreview);
  if (isLocalPreview) {
    if (!local) throw new Error("Workspace lokal hanya tersedia melalui localhost, bukan deployment cloud.");
    const roleCookie = (await cookies()).get(WORKSPACE_ROLE_COOKIE)?.value;
    const localRole = roleCookie === "donor" || roleCookie === "visitor" ? roleCookie : "organizer";
    const actor = localRole === "visitor" ? null : WORKSPACE_LOCAL_ACTORS[localRole];
    if (write && !actor) throw new Error("Pilih peran organizer atau donatur lokal terlebih dahulu.");
    return { mode: "local", actor, localRole };
  }
  if (process.env.CIRCLES_WORKSPACE_ENABLED !== "1") throw new Error("Workspace pengguna belum diaktifkan pada deployment ini. Campaign contoh tetap terpisah.");
  if (!supabaseConfigured()) throw new Error("Penyimpanan campaign belum terhubung.");
  const db = await createSupabaseServer();
  const { data: { user }, error } = await db.auth.getUser();
  if (error && !isAuthSessionMissingError(error)) throw new Error("Sesi akun belum dapat diverifikasi. Coba kembali setelah layanan autentikasi tersedia.");
  if (write && (!user || error || user.is_anonymous)) throw new Error("Masuk ke akun terverifikasi sesi untuk melanjutkan.");
  // Display metadata is never authorization, KYC status or NGO verification.
  const actor: WorkspaceActor | null = user && !error && !user.is_anonymous ? { id: user.id, name: typeof user.user_metadata?.name === "string" ? user.user_metadata.name.trim().slice(0, 80) || "Pengguna Salapi" : "Pengguna Salapi", kind: "person", verification: "unverified" } : null;
  return { mode: "testnet", actor, db };
}
export function requireWorkspaceActor(context: Context): WorkspaceActor {
  if (!context.actor) throw new Error("Masuk untuk melanjutkan.");
  return context.actor;
}
export function workspaceSafeError(error: unknown): string {
  return error instanceof Error && !/supabase|postgres|relation|schema|column|jwt|fetch|bucket/i.test(error.message) ? error.message.slice(0, 250) : "Penyimpanan campaign belum siap atau tidak tersedia. Tidak ada perubahan yang dikonfirmasi.";
}
function checkDb(error: { message: string } | null) { if (error) throw new Error(error.message); }
export const workspaceMediaUrl = (id: string) => `/api/circles/media/${id}`;
export function campaignFromRow(row: Record<string, unknown>): WorkspaceCampaign {
  return { id: String(row.id), organizerId: String(row.organizer_id), organizerName: String(row.organizer_name), organizerKind: row.organizer_kind === "ngo" ? "ngo" : "person", title: String(row.title), story: String(row.story), location: String(row.location), category: row.category as WorkspaceCampaign["category"], goalPHP: Number(row.goal_php), allowancePct: Number(row.allowance_pct), coverMediaId: String(row.cover_media_id), createdAt: String(row.created_at), status: row.status as WorkspaceCampaign["status"], ...(row.contract_campaign_id ? { contractCampaignId: String(row.contract_campaign_id), contractCreatorWallet: String(row.contract_creator_wallet), contractAddress: String(row.contract_address) } : {}) };
}
function mediaFromRow(row: Record<string, unknown>): WorkspaceMedia {
  return { id: String(row.id), ownerId: String(row.owner_id), name: String(row.name), mime: String(row.mime), size: Number(row.size), sha256: String(row.sha256), url: workspaceMediaUrl(String(row.id)) };
}
function updateFromRow(row: Record<string, unknown>): WorkspaceUpdate {
  return { id: String(row.id), campaignId: String(row.campaign_id), title: String(row.title), body: String(row.body), kind: row.kind as WorkspaceUpdate["kind"], mediaIds: row.media_ids as string[], createdAt: String(row.created_at) };
}
function reviewFromRow(row: Record<string, unknown>): WorkspaceReview {
  return { id: String(row.id), campaignId: String(row.campaign_id), organizerId: String(row.organizer_id), donorId: String(row.donor_id), donorName: String(row.donor_name), stars: Number(row.stars), comment: String(row.comment), createdAt: String(row.created_at) };
}
export async function loadWorkspace(requestedCampaignId?: string): Promise<WorkspaceSnapshot> {
  const empty: WorkspaceSnapshot = { mode: isLocalPreview ? "local" : "testnet", actor: null, profiles: [], campaigns: [], updates: [], reviews: [], supports: [], following: [], media: [] };
  try {
    const context = await workspaceContext();
    if (context.mode === "local") {
      const store = await readLocalWorkspace();
      return { ...empty, actor: context.actor, localRole: context.localRole, profiles: store.profiles, campaigns: store.campaigns, updates: store.updates, reviews: store.reviews, supports: store.supports.filter(s => s.userId === context.actor?.id), following: store.follows.filter(f => f.userId === context.actor?.id).map(f => f.campaignId), media: store.media.filter(m => m.ownerId === context.actor?.id || store.campaigns.some(c => c.coverMediaId === m.id) || store.updates.some(u => u.mediaIds.includes(m.id))).map(m => ({ id: m.id, ownerId: m.ownerId, name: m.name, mime: m.mime, size: m.size, sha256: m.sha256, url: m.url })) };
    }
    const [campaignRows, updateRows, reviewRows, mediaRows, followRows] = await Promise.all([
      context.db.from("circle_workspace_campaigns").select("*").order("created_at", { ascending: false }).limit(500),
      context.db.from("circle_workspace_updates").select("*").order("created_at", { ascending: false }).limit(3000),
      context.db.from("circle_workspace_reviews").select("*").order("created_at", { ascending: false }).limit(5000),
      context.db.from("circle_workspace_media").select("id,owner_id,name,mime,size,sha256").limit(4000),
      context.actor ? context.db.from("circle_workspace_follows").select("campaign_id").eq("user_id", context.actor.id) : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [campaignRows, updateRows, reviewRows, mediaRows, followRows]) checkDb(result.error);
    const campaigns = (campaignRows.data ?? []).map(campaignFromRow);
    const profiles = [...new Map(campaigns.map(c => [c.organizerId, { id: c.organizerId, name: c.organizerName, kind: c.organizerKind, verification: "unverified" as const }])).values()];
    // Supports are verified reads from D4, not writeable donation claims in Postgres.
    const followed = new Set((followRows.data ?? []).map(f => String(f.campaign_id)));
    const requestedId = requestedCampaignId ? workspaceId(requestedCampaignId) : null;
    const relevant = campaigns.filter(c => c.contractCampaignId && (c.id === requestedId || followed.has(c.id))).slice(0, 20);
    const viewerWallet = context.actor && relevant.length ? await currentWalletPublicKey() : null;
    const supports = context.actor ? (await Promise.all(relevant.map(async c => {
      const chain = await campaignState(c.contractCampaignId!);
      const record = chain.ok ? chain.campaigns[0] : null;
      const contribution = record?.contribution;
      const matching = chain.ok && record && Boolean(viewerWallet) && chain.viewer === viewerWallet && chain.contractId === c.contractAddress && record.id === c.contractCampaignId && record.title === c.title && record.config.creator === c.contractCreatorWallet && record.config.creator_cut_bps === c.allowancePct * 100;
      return matching && contribution && !contribution.refunded && BigInt(contribution.amount) > 0n ? { campaignId: c.id, userId: context.actor!.id, amount: workspaceXlmFromStroops(contribution.amount), simulated: false } : null;
    }))).filter((s): s is NonNullable<typeof s> => s !== null) : [];
    return { ...empty, actor: context.actor, profiles, campaigns, updates: (updateRows.data ?? []).map(updateFromRow), reviews: (reviewRows.data ?? []).map(reviewFromRow), media: (mediaRows.data ?? []).map(mediaFromRow), following: (followRows.data ?? []).map(f => String(f.campaign_id)), supports };
  } catch (error) { return { ...empty, unavailable: workspaceSafeError(error) }; }
}
export async function publishWorkspace(input: unknown): Promise<WorkspaceResult<WorkspaceCampaign>> {
  try {
    const context = await workspaceContext(true), actor = requireWorkspaceActor(context), data = parseWorkspacePublish(input);
    let campaign: WorkspaceCampaign = { id: data.requestId ?? randomUUID(), organizerId: actor.id, organizerName: actor.name, organizerKind: actor.kind, title: data.title, story: data.story, location: data.location, category: data.category, goalPHP: data.goalPHP, allowancePct: data.allowancePct, coverMediaId: data.coverMediaId, createdAt: new Date().toISOString(), status: "published" };
    if (context.mode === "local") await mutateLocalWorkspace(store => {
      const existing = store.campaigns.find(c => c.id === campaign.id);
      if (existing) { if (existing.organizerId !== actor.id || !["title", "story", "location", "category", "goalPHP", "allowancePct", "coverMediaId"].every(key => existing[key as keyof WorkspaceCampaign] === campaign[key as keyof WorkspaceCampaign])) throw new Error("ID permintaan sudah digunakan untuk data berbeda. Muat ulang sebelum menerbitkan lagi."); campaign = existing; return; }
      ownLocalMedia(store, [data.coverMediaId], actor); registerLocalActor(store, actor); store.campaigns.push(campaign);
    });
    else {
      const result = await context.db.from("circle_workspace_campaigns").insert({ id: campaign.id, organizer_id: actor.id, organizer_name: actor.name, organizer_kind: actor.kind, title: data.title, story: data.story, location: data.location, category: data.category, goal_php: data.goalPHP, allowance_pct: data.allowancePct, cover_media_id: data.coverMediaId });
      if (result.error?.code === "23505" && data.requestId) {
        const row = await context.db.from("circle_workspace_campaigns").select("*").eq("id", campaign.id).eq("organizer_id", actor.id).single(); checkDb(row.error);
        const existing = campaignFromRow(row.data);
        if (!["title", "story", "location", "category", "goalPHP", "allowancePct", "coverMediaId"].every(key => existing[key as keyof WorkspaceCampaign] === campaign[key as keyof WorkspaceCampaign])) throw new Error("ID permintaan sudah digunakan untuk data berbeda.");
        campaign = existing;
      } else checkDb(result.error);
    }
    return { ok: true, value: campaign };
  } catch (error) { return { ok: false, error: workspaceSafeError(error) }; }
}
export async function postWorkspaceUpdate(input: unknown): Promise<WorkspaceResult<WorkspaceUpdate>> {
  try {
    const context = await workspaceContext(true), actor = requireWorkspaceActor(context), data = parseWorkspaceUpdate(input);
    let update: WorkspaceUpdate = { id: data.requestId ?? randomUUID(), campaignId: data.campaignId, title: data.title, body: data.body, kind: data.kind, mediaIds: data.mediaIds, createdAt: new Date().toISOString() };
    if (context.mode === "local") await mutateLocalWorkspace(store => { const c = ownedLocalCampaign(store, data.campaignId, actor); const existing = store.updates.find(u => u.id === update.id); if (existing) { if (existing.campaignId !== data.campaignId || existing.title !== data.title || existing.body !== data.body || existing.kind !== data.kind || JSON.stringify(existing.mediaIds) !== JSON.stringify(data.mediaIds)) throw new Error("ID update sudah digunakan untuk data berbeda."); update = existing; return; } if (c.status === "completed") throw new Error("Campaign telah selesai. Update tidak dapat ditambah."); ownLocalMedia(store, data.mediaIds, actor); store.updates.push(update); });
    else { const result = await context.db.from("circle_workspace_updates").insert({ id: update.id, campaign_id: data.campaignId, organizer_id: actor.id, title: data.title, body: data.body, kind: data.kind, media_ids: data.mediaIds });
      if (result.error?.code === "23505" && data.requestId) { const row = await context.db.from("circle_workspace_updates").select("*").eq("id", update.id).eq("organizer_id", actor.id).single(); checkDb(row.error); const existing = updateFromRow(row.data); if (existing.campaignId !== data.campaignId || existing.title !== data.title || existing.body !== data.body || existing.kind !== data.kind || JSON.stringify(existing.mediaIds) !== JSON.stringify(data.mediaIds)) throw new Error("ID update sudah digunakan untuk data berbeda."); update = existing; } else checkDb(result.error);
    }
    return { ok: true, value: update };
  } catch (error) { return { ok: false, error: workspaceSafeError(error) }; }
}
async function ownedProductionCampaign(context: Extract<Context, {mode: "testnet"}>, id: string): Promise<WorkspaceCampaign> {
  const result = await context.db.from("circle_workspace_campaigns").select("*").eq("id", id).single(); checkDb(result.error);
  const campaign = campaignFromRow(result.data);
  if (campaign.organizerId !== requireWorkspaceActor(context).id) throw new Error("Hanya organizer campaign ini yang dapat mengubahnya.");
  return campaign;
}
/** Independent chain identity/immutable terms are checked again for every privileged operation. */
export async function verifiedWorkspaceChain(campaign: WorkspaceCampaign, owner = false, initialBinding = false) {
  if (!campaign.contractCampaignId) throw new Error("Campaign belum terhubung ke D4 Testnet. Tidak ada transaksi dana yang dibuat.");
  if ((!campaign.contractCreatorWallet || !campaign.contractAddress) && !(owner && initialBinding)) throw new Error("Identitas binding D4 belum lengkap.");
  const chain = await campaignState(campaign.contractCampaignId);
  if (!chain.ok) throw new Error("Kontribusi D4 belum dapat diverifikasi. Coba kembali setelah jaringan tersedia.");
  const c = chain.campaigns[0];
  if (!c || c.id !== campaign.contractCampaignId || c.title !== campaign.title || c.config.creator_cut_bps !== campaign.allowancePct * 100 || !chain.contractId || !chain.viewer) throw new Error("Identitas atau syarat campaign D4 tidak cocok.");
  if (campaign.contractCreatorWallet && c.config.creator !== campaign.contractCreatorWallet) throw new Error("Creator wallet D4 berubah atau tidak cocok dengan binding.");
  if (campaign.contractAddress && campaign.contractAddress !== chain.contractId) throw new Error("Alamat deployment D4 tidak cocok dengan binding.");
  const viewerWallet = await currentWalletPublicKey();
  if (!viewerWallet || viewerWallet !== chain.viewer) throw new Error("Wallet donatur tidak cocok dengan sesi terautentikasi.");
  if (owner && c.config.creator !== viewerWallet) throw new Error("Wallet Anda bukan creator D4 ini.");
  return { ...c, contractAddress: chain.contractId };
}
export async function completeWorkspace(idInput: unknown): Promise<WorkspaceResult> {
  try {
    const id = workspaceId(idInput), context = await workspaceContext(true), actor = requireWorkspaceActor(context);
    if (context.mode === "local") await mutateLocalWorkspace(store => { const c = ownedLocalCampaign(store, id, actor); if (!store.updates.some(u => u.campaignId === id && u.kind === "delivery" && u.mediaIds.length)) throw new Error("Unggah bukti penyaluran dengan foto sebelum menyelesaikan campaign."); c.status = "completed"; });
    else {
      const campaign = await ownedProductionCampaign(context, id), chain = await verifiedWorkspaceChain(campaign, true);
      if (chain.state !== "Released") throw new Error("D4 belum Released. Selesaikan dua persetujuan dan release melalui alur D4 terlebih dahulu.");
      const proof = await context.db.from("circle_workspace_updates").select("id,media_ids").eq("campaign_id", id).eq("kind", "delivery"); checkDb(proof.error);
      if (!proof.data?.some(u => u.media_ids.length > 0)) throw new Error("Bukti penyaluran dengan foto belum tersedia.");
      if (!supabaseAdminConfigured()) throw new Error("Verifikasi server untuk penyelesaian belum dikonfigurasi.");
      // Narrow server-only privilege: authenticated owner + matching immutable chain terms + Released + delivery.
      const result = await createSupabaseAdmin().from("circle_workspace_campaigns").update({ status: "completed" }).eq("id", id).eq("organizer_id", actor.id).select("id").single(); checkDb(result.error);
    }
    return { ok: true, value: undefined };
  } catch (error) { return { ok: false, error: workspaceSafeError(error) }; }
}
export async function followWorkspace(idInput: unknown, follow: unknown): Promise<WorkspaceResult> {
  try {
    const id = workspaceId(idInput), context = await workspaceContext(true), actor = requireWorkspaceActor(context);
    if (typeof follow !== "boolean") throw new Error("Pilihan mengikuti tidak valid.");
    if (context.mode === "local") await mutateLocalWorkspace(store => { if (!store.campaigns.some(c => c.id === id)) throw new Error("Campaign tidak ditemukan."); store.follows = store.follows.filter(f => !(f.campaignId === id && f.userId === actor.id)); if (follow) store.follows.push({ campaignId: id, userId: actor.id }); registerLocalActor(store, actor); });
    else { const result = follow ? await context.db.from("circle_workspace_follows").upsert({ campaign_id: id, user_id: actor.id }, { onConflict: "campaign_id,user_id", ignoreDuplicates: true }) : await context.db.from("circle_workspace_follows").delete().eq("campaign_id", id).eq("user_id", actor.id); checkDb(result.error); }
    return { ok: true, value: undefined };
  } catch (error) { return { ok: false, error: workspaceSafeError(error) }; }
}
export async function supportWorkspace(idInput: unknown, amountInput: unknown): Promise<WorkspaceResult> {
  try {
    const id = workspaceId(idInput), amount = parseWorkspaceSupport(amountInput), context = await workspaceContext(true), actor = requireWorkspaceActor(context);
    if (context.mode !== "local") throw new Error("Kontribusi hanya melalui transaksi D4 Testnet yang terkonfirmasi. Simulasi tidak berlaku di deployment.");
    await mutateLocalWorkspace(store => { const c = store.campaigns.find(c => c.id === id); if (!c || c.status !== "published") throw new Error("Campaign tidak terbuka."); if (c.organizerId === actor.id) throw new Error("Ganti ke peran donatur untuk menguji dukungan campaign sendiri."); const current = store.supports.find(s => s.campaignId === id && s.userId === actor.id); if (current) current.amount = amount; else store.supports.push({ campaignId: id, userId: actor.id, amount, simulated: true }); if (!store.follows.some(f => f.campaignId === id && f.userId === actor.id)) store.follows.push({ campaignId: id, userId: actor.id }); registerLocalActor(store, actor); });
    return { ok: true, value: undefined };
  } catch (error) { return { ok: false, error: workspaceSafeError(error) }; }
}
export async function reviewWorkspace(input: unknown): Promise<WorkspaceResult<WorkspaceReview>> {
  try {
    const context = await workspaceContext(true), actor = requireWorkspaceActor(context), data = parseWorkspaceReview(input);
    let review: WorkspaceReview | undefined;
    if (context.mode === "local") await mutateLocalWorkspace(store => { const campaign = store.campaigns.find(c => c.id === data.campaignId); if (!campaign) throw new Error("Campaign tidak ditemukan."); const denied = workspaceReviewEligibility(actor, campaign, store.supports.find(s => s.campaignId === campaign.id && s.userId === actor.id), store.reviews); if (denied) throw new Error(denied); review = { id: randomUUID(), campaignId: campaign.id, organizerId: campaign.organizerId, donorId: actor.id, donorName: actor.name, stars: data.stars, comment: data.comment, createdAt: new Date().toISOString() }; store.reviews.push(review); });
    else {
      const result = await context.db.from("circle_workspace_campaigns").select("*").eq("id", data.campaignId).single(); checkDb(result.error);
      const campaign = campaignFromRow(result.data);
      if (campaign.organizerId === actor.id) throw new Error("Organizer tidak dapat mereview campaign sendiri.");
      if (campaign.status !== "completed") throw new Error("Review tersedia setelah penyaluran selesai.");
      const chain = await verifiedWorkspaceChain(campaign);
      if (chain.state !== "Released" || chain.contribution.refunded || BigInt(chain.contribution.amount) <= 0n) throw new Error("Review hanya untuk donatur D4 dengan kontribusi terkonfirmasi, tidak direfund, dan campaign Released.");
      if (!supabaseAdminConfigured()) throw new Error("Verifikasi server untuk review belum dikonfigurasi.");
      review = { id: randomUUID(), campaignId: campaign.id, organizerId: campaign.organizerId, donorId: actor.id, donorName: actor.name, stars: data.stars, comment: data.comment, createdAt: new Date().toISOString() };
      // No client INSERT privilege. Donor ID and eligibility come only from the verified session and chain.
      const inserted = await createSupabaseAdmin().from("circle_workspace_reviews").insert({ id: review.id, campaign_id: review.campaignId, organizer_id: review.organizerId, donor_id: actor.id, donor_name: actor.name, stars: review.stars, comment: review.comment });
      if (inserted.error?.code === "23505") throw new Error("Anda sudah memberi review untuk campaign ini."); checkDb(inserted.error);
    }
    return { ok: true, value: review! };
  } catch (error) { return { ok: false, error: workspaceSafeError(error) }; }
}
export async function bindWorkspaceD4(idInput: unknown, chainIdInput: unknown): Promise<WorkspaceResult> {
  try {
    const id = workspaceId(idInput), context = await workspaceContext(true);
    if (context.mode !== "testnet") throw new Error("Workspace lokal tidak dapat dihubungkan ke kontrak live.");
    if (typeof chainIdInput !== "string" || !/^[1-9]\d{0,19}$/.test(chainIdInput)) throw new Error("ID D4 tidak valid.");
    const campaign = await ownedProductionCampaign(context, id);
    if (campaign.contractCampaignId) throw new Error("Campaign sudah terhubung ke D4. Binding tidak dapat diganti.");
    const chain = await verifiedWorkspaceChain({ ...campaign, contractCampaignId: chainIdInput }, true, true);
    if (!supabaseAdminConfigured()) throw new Error("Verifikasi server untuk binding belum dikonfigurasi.");
    const result = await createSupabaseAdmin().from("circle_workspace_campaigns").update({ contract_campaign_id: chainIdInput, contract_creator_wallet: chain.config.creator, contract_address: chain.contractAddress }).eq("id", id).eq("organizer_id", context.actor!.id).is("contract_campaign_id", null).select("id").single(); checkDb(result.error);
    return { ok: true, value: undefined };
  } catch (error) { return { ok: false, error: workspaceSafeError(error) }; }
}
