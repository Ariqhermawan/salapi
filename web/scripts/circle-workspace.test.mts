import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as crypto from "node:crypto";
import * as filesystem from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import * as shared from "../lib/circles/workspace.ts";
import * as local from "../lib/server/circleWorkspaceLocal.ts";
import type { WorkspaceCampaign, WorkspaceReview, WorkspaceSnapshot } from "../lib/circles/workspace.ts";

const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
function isolated<T>(name: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const exports = {};
  runInNewContext(ts.transpileModule(source(name), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    exports, Buffer, File, Uint8Array, URL, ...globals,
    require(name: string) { if (!(name in dependencies)) throw Error(`Unexpected dependency ${name}`); return dependencies[name]; },
  });
  return exports as T;
}
const organizer = shared.WORKSPACE_LOCAL_ACTORS.organizer, donor = shared.WORKSPACE_LOCAL_ACTORS.donor;
const id = () => crypto.randomUUID();
const campaign = (status: "published" | "completed" = "published"): WorkspaceCampaign => ({ id: id(), organizerId: organizer.id, organizerName: organizer.name, organizerKind: "person", title: "Bantu shelter kucing", story: "Campaign yang dibuat pengguna untuk menyediakan kebutuhan shelter kucing secara transparan.", location: "Jakarta", category: "animals", goalPHP: 1000, allowancePct: 5, coverMediaId: id(), createdAt: new Date().toISOString(), status });
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
type Backend = {
  loadWorkspace(): Promise<WorkspaceSnapshot>;
  publishWorkspace(input: unknown): Promise<Result<WorkspaceCampaign>>;
  postWorkspaceUpdate(input: unknown): Promise<Result<unknown>>;
  completeWorkspace(id: string): Promise<Result<unknown>>;
  followWorkspace(id: string, follow: boolean): Promise<Result<unknown>>;
  supportWorkspace(id: string, amount: string): Promise<Result<unknown>>;
  reviewWorkspace(input: unknown): Promise<Result<WorkspaceReview>>;
  bindWorkspaceD4(id: string, chainId: string): Promise<Result<unknown>>;
  workspaceContext(write?: boolean): Promise<unknown>;
  verifiedWorkspaceChain(c: WorkspaceCampaign, owner?: boolean): Promise<unknown>;
};
async function harness(options: { preview?: boolean; deployment?: boolean; host?: string; enabled?: string; user?: object | null; authError?: object; chain?: unknown; wallet?: string; campaignRow?: object; allowAdmin?: boolean } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "salapi-workspace-test-"));
  let role = "organizer";
  let authReads = 0, adminWrites = 0;
  const insertedReviews: Record<string, unknown>[] = [];
  const db = { auth: { getUser: async () => { authReads++; return { data: { user: "user" in options ? options.user : { id: donor.id, is_anonymous: false } }, error: options.authError }; } }, from: (table: string) => {
    assert.equal(table, "circle_workspace_campaigns");
    const builder = { select: () => builder, eq: () => builder, single: async () => ({ data: options.campaignRow, error: options.campaignRow ? null : { message: "Campaign unavailable" } }) };
    return builder;
  } };
  const api = isolated<Backend>("../lib/server/circleWorkspace.ts", {
    "node:crypto": crypto,
    "@supabase/supabase-js": { isAuthSessionMissingError: (error: { name?: string }) => error.name === "AuthSessionMissingError" },
    "next/headers": { headers: async () => new Map([["host", options.host ?? "localhost:3000"]]), cookies: async () => ({ get: () => ({ value: role }) }) },
    "@/lib/local-preview": { isLocalPreview: options.preview ?? true },
    "@/lib/supabase/server": { createSupabaseServer: async () => db },
    "@/lib/supabase/admin": { createSupabaseAdmin: () => { adminWrites++; if (!options.allowAdmin) throw Error("Admin should not be invoked"); return { from: (table: string) => { assert.equal(table, "circle_workspace_reviews"); return { insert: async (row: Record<string, unknown>) => { insertedReviews.push(row); return { error: null }; } }; } }; } },
    "@/lib/supabase/env": { supabaseConfigured: () => true, supabaseAdminConfigured: () => true },
    "@/lib/server/userWallet": { currentWalletPublicKey: async () => options.wallet ?? "creator-wallet" },
    "@/app/campaign-actions": { campaignState: async () => options.chain ?? { ok: false } },
    "@/lib/circles/workspace": shared,
    "./circleWorkspaceLocal": { ...local, readLocalWorkspace: () => local.readLocalWorkspace(directory), mutateLocalWorkspace: (fn: Parameters<typeof local.mutateLocalWorkspace>[0]) => local.mutateLocalWorkspace(fn, directory) },
  }, { process: { env: { ...(options.deployment ? { VERCEL: "1" } : {}), CIRCLES_WORKSPACE_ENABLED: options.enabled } } });
  return { api, directory, insertedReviews, role: (value: string) => { role = value; }, calls: () => ({ authReads, adminWrites }), close: () => rm(directory, { recursive: true }) };
}

test("input validators reject spoofed category, fee, consent, media IDs and invalid reviews", () => {
  const c = campaign();
  const valid = { ...c, publicMediaConsent: true };
  assert.equal(shared.parseWorkspacePublish(valid).category, "animals");
  assert.equal(shared.parseWorkspacePublish({ ...valid, goalPHP: 1.13 }).goalPHP, 1.13);
  assert.throws(() => shared.parseWorkspacePublish({ ...valid, goalPHP: 1.131 }));
  assert.throws(() => shared.parseWorkspacePublish({ ...valid, title: "猫".repeat(41) }));
  assert.equal(shared.workspaceXlmFromStroops("9223372036854775807"), "922337203685.4775807");
  assert.equal(shared.workspaceXlmFromStroops("100000001"), "10.0000001");
  for (const alteration of [{ category: "other" }, { allowancePct: 11 }, { allowancePct: 0.5 }, { goalPHP: -1 }, { goalPHP: Infinity }, { publicMediaConsent: false }, { coverMediaId: "../../secret" }, { requestId: "invalid" }, { story: "short" }]) assert.throws(() => shared.parseWorkspacePublish({ ...valid, ...alteration }));
  for (const stars of [0, 6, 1.5, "5", null]) assert.throws(() => shared.parseWorkspaceReview({ campaignId: c.id, stars, comment: "Pengiriman sangat baik." }));
  assert.throws(() => shared.parseWorkspaceUpdate({ campaignId: c.id, title: "Selesai", body: "Sudah disalurkan ke shelter", kind: "delivery", mediaIds: [], publicMediaConsent: true }));
  for (const amount of ["0", "-1", "1e3", "NaN", " 10", "0.00000001", "1000001", "01"]) assert.throws(() => shared.parseWorkspaceSupport(amount));
});
test("review eligibility enforces donor identity, contribution, completion and uniqueness", () => {
  const c = campaign("completed"), support = { campaignId: c.id, userId: donor.id, amount: "1", simulated: true };
  assert.equal(shared.workspaceReviewEligibility(donor, c, support, []), null);
  assert.ok(shared.workspaceReviewEligibility(null, c, support, []));
  assert.ok(shared.workspaceReviewEligibility(organizer, c, support, []));
  assert.ok(shared.workspaceReviewEligibility(donor, { ...c, status: "published" }, support, []));
  assert.ok(shared.workspaceReviewEligibility(donor, c, undefined, []));
  assert.ok(shared.workspaceReviewEligibility(donor, c, { ...support, userId: organizer.id }, []));
  assert.ok(shared.workspaceReviewEligibility(donor, c, support, [{ campaignId: c.id, donorId: donor.id } as WorkspaceReview]));
});
test("local persistence is forbidden on cloud, external hosts, forwarded spoofing and cross-origin requests", () => {
  assert.equal(shared.isWorkspaceLocalHost("localhost:3000", null, null, false, true), true);
  for (const args of [["salapi.app", null, null, false, true], ["localhost:3000", null, null, true, true], ["localhost:3000", null, null, false, false], ["localhost:3000", "evil.example", null, false, true], ["localhost:3000", null, "https://evil.example", false, true]] as const) assert.equal(shared.isWorkspaceLocalHost(args[0], args[1], args[2], args[3], args[4]), false);
});
test("complete organizer to donor lifecycle persists real uploaded metadata, updates and review across reloads", async () => {
  const h = await harness();
  try {
    const cover = id();
    await local.mutateLocalWorkspace(s => s.media.push({ id: cover, ownerId: organizer.id, name: "cover.webp", mime: "image/webp", size: 200, sha256: "a".repeat(64), url: `/api/circles/media/${cover}`, objectPath: `${organizer.id}/${cover}.webp` }), h.directory);
    const requestId = id(), payload = { ...campaign(), coverMediaId: cover, publicMediaConsent: true, requestId };
    const published = await h.api.publishWorkspace(payload); assert.equal(published.ok, true); if (!published.ok) return;
    const c = published.value;
    assert.equal((await h.api.publishWorkspace(payload)).ok, true);
    assert.equal((await h.api.loadWorkspace()).campaigns.length, 1);
    assert.equal((await h.api.publishWorkspace({ ...payload, title: "Changed title" })).ok, false);
    assert.equal((await h.api.completeWorkspace(c.id)).ok, false);
    h.role("donor");
    assert.equal((await h.api.postWorkspaceUpdate({ campaignId: c.id, title: "Fake proof", body: "Spoofed organizer update", kind: "delivery", mediaIds: [cover], publicMediaConsent: true })).ok, false);
    assert.equal((await h.api.completeWorkspace(c.id)).ok, false);
    assert.equal((await h.api.followWorkspace(c.id, true)).ok, true);
    assert.equal((await h.api.supportWorkspace(c.id, "10")).ok, true);
    assert.equal((await h.api.reviewWorkspace({ campaignId: c.id, stars: 5, comment: "Sudah membantu dengan baik." })).ok, false);
    h.role("organizer");
    const updatePayload = { requestId: id(), campaignId: c.id, title: "Bantuan telah disalurkan", body: "Pakan dan kebutuhan medis sudah diterima shelter.", kind: "delivery", mediaIds: [cover], publicMediaConsent: true };
    assert.equal((await h.api.postWorkspaceUpdate(updatePayload)).ok, true);
    assert.equal((await h.api.postWorkspaceUpdate(updatePayload)).ok, true);
    assert.equal((await h.api.postWorkspaceUpdate({ ...updatePayload, body: "Mengubah isi update yang sudah diterbitkan." })).ok, false);
    assert.equal((await h.api.completeWorkspace(c.id)).ok, true);
    assert.equal((await h.api.reviewWorkspace({ campaignId: c.id, stars: 5, comment: "Organizer mereview sendiri." })).ok, false);
    h.role("donor");
    const reviewed = await h.api.reviewWorkspace({ campaignId: c.id, stars: 4, comment: "Bantuan sampai dan update jelas." }); assert.equal(reviewed.ok, true);
    assert.equal((await h.api.reviewWorkspace({ campaignId: c.id, stars: 5, comment: "Review kedua tidak diperbolehkan." })).ok, false);
    const reload = await local.readLocalWorkspace(h.directory); assert.equal(reload.campaigns.length, 1); assert.equal(reload.updates.length, 1); assert.equal(reload.reviews.length, 1); assert.equal(reload.reviews[0].stars, 4);
    const snapshot = await h.api.loadWorkspace(); assert.equal(snapshot.supports[0].simulated, true); assert.equal(snapshot.following[0], c.id); assert.ok(snapshot.media.every(m => !("objectPath" in m)));
    h.role("visitor"); assert.equal((await h.api.followWorkspace(c.id, true)).ok, false); assert.equal((await h.api.loadWorkspace()).supports.length, 0);
    assert.equal(h.calls().adminWrites, 0); assert.equal(h.calls().authReads, 0);
  } finally { await h.close(); }
});
test("local media ownership and safe path boundaries prevent IDOR/private reads", async () => {
  const store = local.newLocalWorkspaceStore(), m = { id: id(), ownerId: organizer.id, name: "private.webp", mime: "image/webp", size: 10, sha256: "a".repeat(64), url: "", objectPath: "" };
  store.media.push(m);
  assert.equal(local.localMediaVisible(store, m, donor), false);
  assert.equal(local.localMediaVisible(store, m, organizer), true);
  assert.throws(() => local.ownLocalMedia(store, [m.id], donor));
  const safeRoot = path.resolve(tmpdir(), "salapi-workspace-boundary", "safe");
  const outside = path.resolve(safeRoot, "..", "outside");
  for (const name of ["../outside", outside, "nested/../../outside"]) assert.throws(() => local.boundedWorkspacePath(safeRoot, name));
  assert.equal(local.boundedWorkspacePath(safeRoot, "nested/proof.webp"), path.resolve(safeRoot, "nested/proof.webp"));
});
test("concurrent atomic mutations preserve all updates without lost writes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "salapi-workspace-atomic-"));
  try {
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => local.mutateLocalWorkspace(s => s.follows.push({ campaignId: String(i), userId: donor.id }), directory)));
    const rejected = results.filter(result => result.status === "rejected");
    assert.deepEqual(rejected.map(result => String(result.reason)), [], "All queued mutations must succeed");
    assert.equal((await local.readLocalWorkspace(directory)).follows.length, 12);
  } finally { await rm(directory, { recursive: true, maxRetries: 3, retryDelay: 100 }); }
});
test("feature flag, missing auth, anonymous auth and local cloud requests fail closed without admin writes", async () => {
  for (const options of [{ preview: false }, { preview: true, deployment: true }, { preview: true, host: "salapi.app" }, { preview: false, enabled: "1", user: null }, { preview: false, enabled: "1", user: { id: donor.id, is_anonymous: true } }, { preview: false, enabled: "1", authError: { message: "auth unavailable" } }]) {
    const h = await harness(options);
    try { const result = await h.api.reviewWorkspace({ campaignId: id(), stars: 5, comment: "Unsafe reviews are not persisted." }); assert.equal(result.ok, false); assert.equal(h.calls().adminWrites, 0); } finally { await h.close(); }
  }
});
test("read context fails closed on Auth errors instead of using an existing JWT to fetch private metadata", async () => {
  for (const authError of [{ name: "AuthApiError", message: "Auth unavailable" }, { name: "AuthRetryableFetchError", message: "Network failure" }]) {
    const h = await harness({ preview: false, enabled: "1", authError });
    try { await assert.rejects(h.api.workspaceContext(false), /Sesi akun belum dapat diverifikasi/); assert.equal(h.calls().adminWrites, 0); const snapshot = await h.api.loadWorkspace(); assert.ok(snapshot.unavailable); assert.equal(snapshot.actor, null); assert.equal(snapshot.media.length, 0); } finally { await h.close(); }
  }
  const guest = await harness({ preview: false, enabled: "1", user: null, authError: { name: "AuthSessionMissingError" } });
  try { const context = await guest.api.workspaceContext(false) as { actor: unknown }; assert.equal(context.actor, null); await assert.rejects(guest.api.workspaceContext(true)); } finally { await guest.close(); }
});
test("chain binding validates exact deployment, campaign ID, title, fee, creator and authenticated viewer", async () => {
  const c = { ...campaign("completed"), contractCampaignId: "101", contractCreatorWallet: "creator-wallet", contractAddress: "contract-A" };
  const chain = { ok: true, viewer: "donor-wallet", contractId: "contract-A", campaigns: [{ id: "101", title: c.title, state: "Released", config: { creator: "creator-wallet", creator_cut_bps: 500 }, contribution: { amount: "100000000", refunded: false } }] };
  const good = await harness({ preview: false, enabled: "1", chain, wallet: "donor-wallet" });
  try { assert.ok(await good.api.verifiedWorkspaceChain(c)); } finally { await good.close(); }
  for (const changed of [{ ...chain, viewer: null }, { ...chain, contractId: "contract-B" }, { ...chain, campaigns: [{ ...chain.campaigns[0], id: "102" }] }, { ...chain, campaigns: [{ ...chain.campaigns[0], title: "Spoofed title" }] }, { ...chain, campaigns: [{ ...chain.campaigns[0], config: { creator: "other-wallet", creator_cut_bps: 500 } }] }, { ...chain, campaigns: [{ ...chain.campaigns[0], config: { creator: "creator-wallet", creator_cut_bps: 1000 } }] }]) {
    const h = await harness({ preview: false, enabled: "1", chain: changed });
    try { await assert.rejects(h.api.verifiedWorkspaceChain(c)); assert.equal(h.calls().adminWrites, 0); } finally { await h.close(); }
  }
});
test("production review is persisted only after positive nonrefunded Released contribution, ignoring spoofed donor input", async () => {
  const c = { ...campaign("completed"), contractCampaignId: "101", contractCreatorWallet: "creator-wallet", contractAddress: "contract-A" };
  const campaignRow = { id: c.id, organizer_id: organizer.id, organizer_name: organizer.name, organizer_kind: "person", title: c.title, story: c.story, location: c.location, category: c.category, goal_php: c.goalPHP, allowance_pct: c.allowancePct, cover_media_id: c.coverMediaId, created_at: c.createdAt, status: c.status, contract_campaign_id: "101", contract_creator_wallet: "creator-wallet", contract_address: "contract-A" };
  const chain = { ok: true, viewer: "donor-wallet", contractId: "contract-A", campaigns: [{ id: "101", title: c.title, state: "Released", config: { creator: "creator-wallet", creator_cut_bps: 500 }, contribution: { amount: "100000000", refunded: false } }] };
  const h = await harness({ preview: false, enabled: "1", campaignRow, chain, wallet: "donor-wallet", allowAdmin: true });
  try { const review = await h.api.reviewWorkspace({ campaignId: c.id, stars: 5, comment: "Bantuan tiba dengan dokumentasi jelas.", donorId: organizer.id, organizerId: donor.id }); assert.equal(review.ok, true); assert.equal(h.insertedReviews.length, 1); assert.equal(h.insertedReviews[0].donor_id, donor.id); assert.equal(h.insertedReviews[0].organizer_id, organizer.id); } finally { await h.close(); }
  for (const mutation of [{ state: "Funding" }, { contribution: { amount: "0", refunded: false } }, { contribution: { amount: "100000000", refunded: true } }]) {
    const h = await harness({ preview: false, enabled: "1", campaignRow, chain: { ...chain, campaigns: [{ ...chain.campaigns[0], ...mutation }] }, wallet: "donor-wallet", allowAdmin: true });
    try { assert.equal((await h.api.reviewWorkspace({ campaignId: c.id, stars: 5, comment: "Review tidak boleh bypass chain." })).ok, false); assert.equal(h.calls().adminWrites, 0); } finally { await h.close(); }
  }
});
test("uploads decode images, reject spoofed types and strip original EXIF before hashing", async () => {
  const media = isolated<{ normalizeWorkspaceImage(file: File): Promise<{ bytes: Buffer; mime: string; name: string }>; imageSignature(bytes: Uint8Array): string | null }>("../lib/server/circleWorkspaceMedia.ts", { "node:crypto": crypto, "node:fs/promises": filesystem, sharp, "@/lib/circles/workspace": shared, "./circleWorkspace": {}, "./circleWorkspaceLocal": local });
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "blue" } }).png().toBuffer();
  const file = new File([new Uint8Array(png)], "safe.png", { type: "image/png" }); const result = await media.normalizeWorkspaceImage(file);
  assert.equal(result.mime, "image/webp"); assert.equal(result.name, "safe.webp"); assert.equal(media.imageSignature(result.bytes), "image/webp");
  assert.equal((await sharp(result.bytes).metadata()).exif, undefined);
  for (const bad of [new File([new Uint8Array(png)], "fake.jpg", { type: "image/jpeg" }), new File(["<svg>evil</svg>"], "evil.svg", { type: "image/svg+xml" }), new File([new Uint8Array(shared.WORKSPACE_MEDIA_LIMIT + 1)], "big.png", { type: "image/png" }), new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])], "broken.png", { type: "image/png" })]) await assert.rejects(media.normalizeWorkspaceImage(bad));
});
test("migration restricts private storage and only server-validated review/completion writes", () => {
  const sql = source("../supabase/migrations/20261006071201_circle_workspace.sql");
  for (const table of ["media", "campaigns", "updates", "follows", "reviews"]) assert.ok(sql.includes(`alter table public.circle_workspace_${table} enable row level security`));
  assert.ok(sql.includes("'circle-workspace-media', 'circle-workspace-media', false"));
  assert.ok(!sql.includes("security definer"));
  assert.ok(!/create policy[^;]+on public\.circle_workspace_reviews for (insert|update|delete)/i.test(sql));
  assert.ok(!/grant[^;]*(insert|update|delete)[^;]*circle_workspace_reviews[^;]*to authenticated/i.test(sql));
  assert.ok(sql.includes("unique(campaign_id, donor_id)"));
  assert.ok(sql.includes("organizer_id <> donor_id"));
});

function uploadRoute(options: { headers?: Record<string, string>; authDenied?: boolean } = {}) {
  const calls = { auth: 0, uploads: [] as File[] };
  const h = new Headers({ host: "localhost:3000", origin: "http://localhost:3000", "content-type": "multipart/form-data; boundary=test-boundary", ...options.headers });
  const route = isolated<{ POST(request: Request): Promise<Response> }>("../app/api/circles/media/route.ts", {
    "next/headers": { headers: async () => h },
    "@/lib/server/circleWorkspaceMedia": { uploadWorkspaceMedia: async (file: File) => { calls.uploads.push(file); return { id: "isolated-media", mime: "image/webp" }; } },
    "@/lib/server/circleWorkspace": { workspaceContext: async () => { calls.auth++; if (options.authDenied) throw Error("Not authorized"); }, workspaceSafeError: () => "Upload denied safely" },
    "@/lib/circles/workspace": shared,
  }, { Headers, Request, Response });
  return { route, calls, headers: h };
}
function countedRequest(h: Headers, chunk?: Uint8Array) {
  const reads = { count: 0, cancelled: false };
  const request = { url: "http://localhost:3000/api/circles/media", headers: h, body: { getReader: () => ({ read: async () => { reads.count++; return reads.count === 1 && chunk ? { done: false, value: chunk } : { done: true }; }, cancel: async () => { reads.cancelled = true; } }) } } as unknown as Request;
  return { request, reads };
}
test("media HTTP upload rejects missing, malformed and foreign Origin before auth or body reads", async () => {
  for (const origin of ["", "null", "http://evil.example", "http://localhost:3001"]) {
    const h = uploadRoute({ headers: { origin } }), body = countedRequest(h.headers);
    const response = await h.route.POST(body.request);
    assert.equal(response.status, 400); assert.equal(h.calls.auth, 0); assert.equal(body.reads.count, 0); assert.equal(h.calls.uploads.length, 0);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});
test("media HTTP upload verifies write identity before parsing or consuming body", async () => {
  const h = uploadRoute({ authDenied: true }), body = countedRequest(h.headers);
  assert.equal((await h.route.POST(body.request)).status, 400);
  assert.equal(h.calls.auth, 1); assert.equal(body.reads.count, 0); assert.equal(h.calls.uploads.length, 0);
});
test("media HTTP upload refuses oversized declared bodies, invalid lengths and non-multipart bodies", async () => {
  const invalidHeaders: Record<string, string>[] = [{ "content-length": String(shared.WORKSPACE_MEDIA_LIMIT + 32_769) }, { "content-length": "not-a-number" }, { "content-type": "application/json" }];
  for (const headers of invalidHeaders) {
    const h = uploadRoute({ headers }), body = countedRequest(h.headers);
    assert.equal((await h.route.POST(body.request)).status, 400);
    assert.equal(body.reads.count, 0); assert.equal(h.calls.uploads.length, 0);
  }
});
test("media HTTP upload bounds actual streamed bytes even when Content-Length lies or is missing", async () => {
  for (const length of ["12", ""]) {
    const h = uploadRoute({ headers: { "content-length": length } }), body = countedRequest(h.headers, new Uint8Array(shared.WORKSPACE_MEDIA_LIMIT + 32_769));
    assert.equal((await h.route.POST(body.request)).status, 400);
    assert.equal(body.reads.count, 1); assert.equal(body.reads.cancelled, true); assert.equal(h.calls.uploads.length, 0);
  }
});
test("media HTTP upload requires an actual file and explicit public consent", async () => {
  for (const fixture of ["missing-consent", "not-a-file", "valid"] as const) {
    const form = new FormData();
    form.set("file", fixture === "not-a-file" ? "spoofed-photo" : new File(["test-file-bytes"], "photo.webp", { type: "image/webp" }));
    if (fixture !== "missing-consent") form.set("publicMediaConsent", "true");
    const request = new Request("http://localhost:3000/api/circles/media", { method: "POST", body: form });
    const h = uploadRoute({ headers: { "content-type": request.headers.get("content-type")! } });
    const response = await h.route.POST(request), body = await response.json() as { ok: boolean };
    assert.equal(response.status, fixture === "valid" ? 200 : 400); assert.equal(body.ok, fixture === "valid");
    assert.equal(h.calls.uploads.length, fixture === "valid" ? 1 : 0);
    if (fixture === "valid") { assert.equal(h.calls.uploads[0].name, "photo.webp"); assert.equal(response.headers.get("x-content-type-options"), "nosniff"); }
  }
});
test("media HTTP reads hide denied IDs and return private no-store sandboxed image bytes", async () => {
  for (const denied of [true, false]) {
    const ids: string[] = [];
    const route = isolated<{ GET(request: Request, input: { params: Promise<{ id: string }> }): Promise<Response> }>("../app/api/circles/media/[id]/route.ts", {
      "@/lib/server/circleWorkspaceMedia": { readWorkspaceMedia: async (value: string) => { ids.push(value); if (denied) throw Error("Private path or auth details must never leak"); return { bytes: new Uint8Array([1, 2, 3]), mime: "image/webp" }; } },
    }, { Request, Response });
    const mediaId = id(), response = await route.GET(new Request("http://localhost:3000/api/circles/media/" + mediaId), { params: Promise.resolve({ id: mediaId }) });
    assert.deepEqual(ids, [mediaId]); assert.equal(response.status, denied ? 404 : 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    if (denied) assert.ok(!(await response.text()).includes("Private path"));
    else { assert.equal(response.headers.get("content-type"), "image/webp"); assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; sandbox"); }
  }
});
