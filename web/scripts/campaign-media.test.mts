import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createHash, randomUUID } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";
import { AuthSessionMissingError, isAuthSessionMissingError } from "@supabase/supabase-js";
import sharp from "sharp";
import ts from "typescript";
import * as media from "../lib/campaign-media.ts";

const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const wallet = "GDWYDMY2WDL4MCKMYQ6CWZJP526K6YHLRK3EG6IF2IJTX3EHZU3RRB72";
const otherWallet = "GCBKRBBNTQ2YA7U7SOC2NTZCCACFIIQCLKKO2FJYL5WJP5QVYH6UNDHL";
const contract = "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU";
const token = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const origin = "https://fixture.supabase.co";
const source = readFileSync(new URL("../lib/server/campaignMedia.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;

function storedPhotos() {
  return ["a", "b", "c"].map((char, index) => ({ path: `testnet/${contract}/1/00000000-0000-4000-8000-000000000010/${index}-${char.repeat(64)}.jpg`, sha256: char.repeat(64), width: 100, height: 80 }));
}
function row() { return { network: "testnet", contract_id: contract, campaign_id: "1", creator_wallet: wallet, photos: storedPhotos(), public_acknowledged: true, updated_at: "2026-10-06T13:29:27.000Z" }; }
type Options = {
  preview?: boolean; configured?: boolean; url?: string; contractId?: string | null;
  currentOwner?: string | null; authError?: unknown; authThrows?: unknown; factoryThrows?: boolean;
  wallet?: string | null; walletError?: unknown; rawCreator?: string; version?: number; deploymentToken?: string; campaignToken?: string; rawId?: bigint;
  row?: ReturnType<typeof row> | null; rowError?: unknown; bucketError?: unknown; bucketPrivate?: boolean;
  uploadFailureAt?: number; uploadThrowsAt?: number; saveError?: boolean; saveThrowsAfterPersist?: boolean; corruptSaved?: boolean; removeError?: boolean;
};
function harness(options: Options = {}) {
  let savedRow = options.row === undefined ? null : options.row;
  const calls = { auth: 0, wallet: 0, row: 0, rpc: [] as string[], uploads: [] as { path: string; bytes: Buffer; options: unknown }[], saves: [] as Record<string, unknown>[], removes: [] as string[][], fetches: [] as { input: unknown; init: RequestInit | undefined }[] };
  const bucket = {
    async upload(path: string, bytes: Buffer, opts: unknown) {
      const index = calls.uploads.length; calls.uploads.push({ path, bytes, options: structuredClone(opts) });
      if (options.uploadThrowsAt === index) throw new Error("Upload interrupted");
      return options.uploadFailureAt === index ? { data: null, error: {} } : { data: { path }, error: null };
    },
    async remove(paths: string[]) { calls.removes.push(Array.from(paths)); if (options.removeError) throw new Error("Cleanup unavailable"); return { data: [], error: null }; },
  };
  const admin = {
    from(table: string) {
      let upsert: Record<string, unknown> | null = null;
      const query = {
        select(columns: string) {
          if (table === "wallets") assert.equal(columns, "public_key", "Never select custody secrets");
          else assert.equal(table, "campaign_media");
          return query;
        },
        eq(key: string, value: unknown) {
          if (table === "wallets") { assert.equal(key, "user_id"); assert.equal(value, options.currentOwner ?? owner); }
          else assert.equal(value, key === "network" ? "testnet" : key === "contract_id" ? contract : "1");
          return query;
        },
        async maybeSingle() {
          if (table === "wallets") { calls.wallet++; return { data: options.wallet === null ? null : { public_key: options.wallet ?? wallet }, error: options.walletError ?? null }; }
          calls.row++; return { data: savedRow, error: options.rowError ?? null };
        },
        upsert(value: Record<string, unknown>, opts: unknown) { assert.equal(table, "campaign_media"); assert.deepEqual(structuredClone(opts), { onConflict: "network,contract_id,campaign_id" }); upsert = structuredClone(value); calls.saves.push(upsert); return query; },
        async single() {
          assert.ok(upsert); savedRow = upsert as ReturnType<typeof row>;
          if (options.saveThrowsAfterPersist) throw new Error("Response interrupted after persistence");
          if (options.saveError) return { data: null, error: {} };
          return { data: options.corruptSaved ? { ...savedRow, creator_wallet: otherWallet } : savedRow, error: null };
        },
      };
      return query;
    },
    storage: {
      async getBucket(name: string) { assert.equal(name, media.CAMPAIGN_MEDIA_BUCKET); return { data: { id: name, public: !options.bucketPrivate, file_size_limit: media.CAMPAIGN_MEDIA_MAX_FILE_BYTES, allowed_mime_types: ["image/jpeg"] }, error: options.bucketError ?? null }; },
      from(name: string) { assert.equal(name, media.CAMPAIGN_MEDIA_BUCKET); return bucket; },
    },
  };
  let configuredFetch: typeof fetch | undefined;
  const exports = {} as { readCampaignMedia(input: unknown): Promise<media.CampaignMediaResult>; publishCampaignMedia(input: unknown, expected: unknown, form: unknown): Promise<media.CampaignMediaResult> };
  runInNewContext(compiled, {
    exports, Buffer, File, FormData, URL, TextEncoder, AbortSignal, setTimeout, clearTimeout,
    fetch: async (input: unknown, init?: RequestInit) => { calls.fetches.push({ input, init }); return new Response("{}", { status: 200 }); },
    require(dependency: string) {
      if (dependency === "server-only") return {};
      if (dependency === "node:crypto") return { randomUUID, createHash };
      if (dependency === "sharp") return sharp;
      if (dependency === "@stellar/stellar-sdk") return { StrKey };
      if (dependency === "@supabase/supabase-js") return { isAuthSessionMissingError, createClient(url: string, key: string, config: { global: { fetch: typeof fetch }; auth: unknown }) { assert.equal(url, origin); assert.equal(key, "fixture-service-key"); assert.deepEqual(structuredClone(config.auth), { persistSession: false, autoRefreshToken: false }); configuredFetch = config.global.fetch; return admin; } };
      if (dependency === "@/lib/campaign-media") return media;
      if (dependency === "@/lib/local-preview") return { isLocalPreview: options.preview ?? false };
      if (dependency === "@/lib/supabase/env") return { SUPABASE_URL: options.url ?? origin, SUPABASE_SERVICE_ROLE: "fixture-service-key", supabaseConfigured: () => options.configured ?? true, supabaseAdminConfigured: () => options.configured ?? true };
      if (dependency === "@/lib/supabase/server") return { createSupabaseServer: async () => {
        if (options.factoryThrows) throw new AuthSessionMissingError();
        return { auth: { getUser: async () => { calls.auth++; if (options.authThrows) throw options.authThrows; return { data: { user: options.currentOwner === null ? null : { id: options.currentOwner ?? owner } }, error: options.authError ?? null }; } } };
      } };
      if (dependency === "@/lib/server/stellar") return { CONTRACTS: { tokenXlmSac: token }, donationCampaignId: () => options.contractId === undefined ? contract : options.contractId,
        sc: { u64: (id: bigint) => id }, readContract: async (id: string, method: string, args?: bigint[]) => {
          assert.equal(id, contract); calls.rpc.push(method);
          if (method === "version") return options.version ?? 4;
          if (method === "token") return options.deploymentToken ?? token;
          assert.equal(method, "campaign"); assert.equal(args?.[0], 1n);
          return { id: options.rawId ?? 1n, config: { creator: options.rawCreator ?? wallet, token: options.campaignToken ?? token } };
        } };
      throw new Error(`Unexpected dependency ${dependency}`);
    },
  });
  return { ...exports, calls, mediaFetch: () => { assert.ok(configuredFetch); return configuredFetch; } };
}

async function form({ count = 3, duplicate = false, ack = true, mime = "image/png", bytes = 0, corrupt = false, width = 40, name = "local-photo.png" } = {}) {
  const value = new FormData();
  if (ack) value.set("publicAcknowledged", "true");
  for (let index = 0; index < count; index++) {
    const color = ["#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#eab308", "#0f172a"][duplicate ? 0 : index % 6];
    const buffer = bytes ? Buffer.alloc(bytes) : corrupt ? Buffer.from("<svg>no raster</svg>") : await sharp({ create: { width, height: width, channels: 3, background: color } }).png().withMetadata().toBuffer();
    value.append("photos", new File([new Uint8Array(buffer)], name, { type: mime }));
  }
  return value;
}
const noWrites = (h: ReturnType<typeof harness>) => { assert.equal(h.calls.uploads.length, 0); assert.equal(h.calls.saves.length, 0); assert.equal(h.calls.removes.length, 0); };

test("campaign IDs are canonical bounded positive u64, never paths or caller deployments", () => {
  for (const id of [null, {}, 1, "0", "01", "1/2", "../1", "18446744073709551616", "9".repeat(21)]) assert.equal(media.canonicalCampaignMediaId(id), null);
  assert.equal(media.canonicalCampaignMediaId("1"), "1"); assert.equal(media.canonicalCampaignMediaId("18446744073709551615"), "18446744073709551615");
});
test("metadata accepts only scoped distinct immutable normalized photos", () => {
  assert.deepEqual(media.scopedCampaignMediaPhotos(storedPhotos(), contract, "1"), storedPhotos());
  for (const mutation of [
    (photos: ReturnType<typeof storedPhotos>) => { photos[0].path = "https://evil.invalid/photo.jpg"; },
    (photos: ReturnType<typeof storedPhotos>) => { photos[0].path = photos[0].path.replace("/1/", "/2/"); },
    (photos: ReturnType<typeof storedPhotos>) => { photos[0].path += "?token=secret"; },
    (photos: ReturnType<typeof storedPhotos>) => { photos[0].width = 1281; },
    (photos: ReturnType<typeof storedPhotos>) => { photos[1].sha256 = photos[0].sha256; photos[1].path = photos[1].path.replace("b".repeat(64), "a".repeat(64)); },
  ]) { const photos = storedPhotos(); mutation(photos); assert.equal(media.scopedCampaignMediaPhotos(photos, contract, "1"), null); }
  assert.equal(media.scopedCampaignMediaPhotos(storedPhotos().slice(0, 2), contract, "1"), null);
  assert.equal(media.scopedCampaignMediaPhotos([...storedPhotos(), ...storedPhotos(), storedPhotos()[0]], contract, "1"), null);
});
test("public URL is constructed from fixed configured origin, not supplied signed/remote URLs", () => {
  assert.deepEqual(media.publicCampaignMediaPhoto(origin, storedPhotos()[0]), { src: `${origin}/storage/v1/object/public/campaign-media/${storedPhotos()[0].path}`, width: 100, height: 80 });
});

for (const [label, opts, code] of [
  ["local preview", { preview: true }, "local_preview"], ["no admin configuration", { configured: false }, "not_configured"],
  ["invalid deployment", { contractId: null }, "not_configured"], ["non-HTTPS origin", { url: "http://fixture.supabase.co" }, "not_configured"],
  ["URL credentials", { url: "https://name:secret@fixture.supabase.co" }, "not_configured"], ["URL path", { url: `${origin}/unsafe` }, "not_configured"],
] as const) test(`${label} cannot read live data or publish photos`, async () => {
  const h = harness(opts); const read = await h.readCampaignMedia("1"); const save = await h.publishCampaignMedia("1", owner, await form());
  assert.equal(!read.ok && read.code, code); assert.equal(!save.ok && save.code, code); noWrites(h); assert.equal(h.calls.auth, 0); assert.equal(h.calls.rpc.length, 0);
});
test("no caller-supplied campaign ID reaches auth, table or contract", async () => {
  const h = harness(); assert.equal((await h.readCampaignMedia("../1")).ok, false); assert.equal((await h.publishCampaignMedia({}, owner, await form())).ok, false);
  noWrites(h); assert.equal(h.calls.auth, 0); assert.equal(h.calls.row, 0);
});
for (const [label, opts, code] of [
  ["guest", { currentOwner: null }, "unauthenticated"], ["missing session", { currentOwner: null, authError: new AuthSessionMissingError() }, "unauthenticated"],
  ["auth setup failure", { factoryThrows: true }, "unavailable"], ["auth unavailable", { authThrows: new Error("Offline") }, "unavailable"],
  ["no saved wallet", { wallet: null }, "no_wallet"], ["wallet lookup failure", { walletError: {} }, "unavailable"],
  ["invalid saved wallet", { wallet: "not-a-wallet" }, "unavailable"],
] as const) test(`${label} cannot publish photos or provision a wallet`, async () => {
  const h = harness(opts); const result = await h.publishCampaignMedia("1", owner, await form());
  assert.equal(!result.ok && result.code, code); noWrites(h); assert.equal(h.calls.rpc.length, 0);
});
test("server-verified owner, not stale or forged caller owner, binds writes", async () => {
  const h = harness({ currentOwner: other }); const result = await h.publishCampaignMedia("1", owner, await form());
  assert.equal(!result.ok && result.code, "account_changed"); assert.equal(result.ownerId, other); noWrites(h); assert.equal(h.calls.rpc.length, 0);
});
test("only current D4 creator saved wallet can publish, never a caller public key", async () => {
  const h = harness({ wallet: otherWallet }); const result = await h.publishCampaignMedia("1", owner, await form());
  assert.equal(!result.ok && result.code, "not_creator"); assert.equal(result.creatorWallet, wallet); noWrites(h);
});
for (const opts of [{ version: 3 }, { deploymentToken: otherWallet }, { campaignToken: otherWallet }, { rawId: 2n }, { rawCreator: "invalid" }]) {
  test(`mismatched on-chain identity cannot publish ${JSON.stringify(opts, (_, value) => typeof value === "bigint" ? String(value) : value)}`, async () => {
    const h = harness(opts); const result = await h.publishCampaignMedia("1", owner, await form());
    assert.equal(!result.ok && result.code, "unavailable"); noWrites(h);
  });
}
test("missing table/bucket and private bucket report honest unavailable setup, not fake empty success", async () => {
  for (const opts of [{ rowError: { code: "42P01" } }, { bucketError: { statusCode: "404" } }, { bucketPrivate: true }]) {
    const h = harness(opts); const result = await h.readCampaignMedia("1");
    assert.equal(!result.ok && result.code, "not_configured"); assert.equal(result.available, false); assert.equal(result.photos.length, 0); noWrites(h);
  }
});
test("ordinary table errors do not masquerade as a successfully empty gallery", async () => {
  const h = harness({ rowError: { code: "42501" } }); const result = await h.readCampaignMedia("1");
  assert.equal(!result.ok && result.code, "unavailable");
});
test("public guest gallery keeps photos readable without exposing publisher auth or granting writes", async () => {
  const h = harness({ row: row(), currentOwner: null }); const result = await h.readCampaignMedia("1");
  assert.equal(result.ok, true); assert.equal(result.photos.length, 3); assert.equal(result.ownerId, null); assert.equal(result.canManage, false); assert.equal(result.permissionCode, "unauthenticated");
  assert.equal("published_by" in result, false); assert.ok(result.photos.every(photo => photo.src.startsWith(`${origin}/storage/v1/object/public/`))); noWrites(h);
});
test("public gallery survives optional auth outage and exposes no management permission", async () => {
  const h = harness({ row: row(), factoryThrows: true }); const result = await h.readCampaignMedia("1");
  assert.equal(result.ok, true); assert.equal(result.photos.length, 3); assert.equal(result.ownerId, null); assert.equal(result.canManage, false); assert.equal(result.permissionCode, "unavailable");
});
test("read keys strictly bind network, configured contract, campaign and actual creator", async () => {
  for (const value of [{ ...row(), contract_id: "caller-contract" }, { ...row(), creator_wallet: otherWallet }, { ...row(), public_acknowledged: false }, { ...row(), updated_at: "not-a-time" }, { ...row(), photos: [{ src: "https://evil.invalid/remote.jpg" }] }]) {
    const h = harness({ row: value as ReturnType<typeof row> }); const result = await h.readCampaignMedia("1");
    assert.equal(!result.ok && result.code, "unavailable"); assert.equal(result.photos.length, 0); noWrites(h);
  }
});
test("creator read returns server owner correlation and an honest configured empty gallery", async () => {
  const h = harness(); const result = await h.readCampaignMedia("1");
  assert.equal(result.ok, true); assert.equal(result.ownerId, owner); assert.equal(result.canManage, true); assert.equal(result.photos.length, 0); assert.equal(result.updatedAt, null); noWrites(h);
});
test("explicit public acknowledgement is required before any Storage mutation", async () => {
  const h = harness(); const value = await form({ ack: false }); const result = await h.publishCampaignMedia("1", owner, value);
  assert.equal(!result.ok && result.code, "ack_required"); noWrites(h);
  value.set("publicAcknowledged", "true"); value.append("publicAcknowledged", "true");
  assert.equal((await h.publishCampaignMedia("1", owner, value)).ok, false); noWrites(h);
});
test("caller URLs, captions, contracts, paths and unsupported fields are rejected", async () => {
  for (const key of ["src", "caption", "contractId", "network", "path"]) {
    const h = harness(); const value = await form(); value.set(key, "https://evil.invalid/image.jpg");
    assert.equal(!((await h.publishCampaignMedia("1", owner, value)).ok), true); noWrites(h);
  }
});
for (const opts of [{ count: 2 }, { count: 7 }, { duplicate: true }, { mime: "image/svg+xml" }, { corrupt: true }, { bytes: media.CAMPAIGN_MEDIA_MAX_FILE_BYTES + 1 }, { width: 4097 }, { name: "a".repeat(121) }, { name: "photo\u0000.jpg" }]) {
  test(`invalid raster/size/count/duplicate cannot reach Storage ${JSON.stringify(opts)}`, async () => {
    const h = harness(); const result = await h.publishCampaignMedia("1", owner, await form(opts));
    assert.equal(!result.ok && result.code, "invalid_photos"); noWrites(h);
  });
}
test("successful complete replacement strips EXIF, bounds dimensions and confirms immutable scoped paths", async () => {
  const h = harness({ row: row() }); const result = await h.publishCampaignMedia("1", owner, await form({ width: 2000 }));
  assert.equal(result.ok, true); assert.equal(result.photos.length, 3); assert.equal(result.ownerId, owner); assert.equal(h.calls.saves.length, 1);
  for (const uploaded of h.calls.uploads) {
    assert.match(uploaded.path, new RegExp(`^testnet/${contract}/1/[a-f0-9-]{36}/[0-5]-[a-f0-9]{64}\\.jpg$`));
    assert.deepEqual(uploaded.options, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
    const metadata = await sharp(uploaded.bytes).metadata(); assert.equal(metadata.format, "jpeg"); assert.ok(metadata.width! <= 1280); assert.ok(metadata.height! <= 1280); assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined);
    assert.ok(uploaded.bytes.length <= media.CAMPAIGN_MEDIA_MAX_FILE_BYTES);
  }
  assert.deepEqual(h.calls.removes, [storedPhotos().map(photo => photo.path)]);
  const reread = await h.readCampaignMedia("1"); assert.equal(reread.ok, true); assert.deepEqual(reread.photos, result.photos);
});
test("six distinct photos are accepted without requiring unique caller filenames", async () => {
  const h = harness(); const result = await h.publishCampaignMedia("1", owner, await form({ count: 6, name: "same-local-name.png" }));
  assert.equal(result.ok, true); assert.equal(result.photos.length, 6); assert.equal(h.calls.uploads.length, 6);
});
test("the maximum valid multipart envelope stays below the default Next 1MiB request cap", async () => {
  const value = new FormData(); value.set("publicAcknowledged", "true");
  for (let index = 0; index < 6; index++) value.append("photos", new File([new Uint8Array(media.CAMPAIGN_MEDIA_MAX_FILE_BYTES)], "a".repeat(116) + ".jpg", { type: "image/jpeg" }));
  const request = new Request("https://fixture.invalid/action", { method: "POST", body: value });
  const bytes = (await request.arrayBuffer()).byteLength;
  assert.ok(bytes > media.CAMPAIGN_MEDIA_MAX_TOTAL_BYTES); assert.ok(bytes < 1024 * 1024);
});
test("same-owner concurrent publications use disjoint immutable paths and clean only old snapshot", async () => {
  const h = harness({ row: row() }); const [first, second] = await Promise.all([h.publishCampaignMedia("1", owner, await form()), h.publishCampaignMedia("1", owner, await form())]);
  assert.equal(first.ok, true); assert.equal(second.ok, true); assert.equal(new Set(h.calls.uploads.map(upload => upload.path)).size, 6);
  assert.equal(h.calls.removes.length, 2); assert.ok(h.calls.removes.every(paths => paths.every(path => storedPhotos().some(photo => photo.path === path))));
});
test("upload failure cleans only this attempted batch, never prior gallery or another campaign", async () => {
  const h = harness({ row: row(), uploadFailureAt: 1 }); const result = await h.publishCampaignMedia("1", owner, await form());
  assert.equal(!result.ok && result.code, "save_failed"); assert.equal(h.calls.saves.length, 0); assert.deepEqual(h.calls.removes, [h.calls.uploads.map(upload => upload.path)]);
  assert.ok(h.calls.removes.flat().every(path => !storedPhotos().some(photo => photo.path === path)));
});
for (const opts of [{ saveError: true }, { saveThrowsAfterPersist: true }, { corruptSaved: true }]) test(`ambiguous or mismatched publish cannot claim success or delete potentially current media ${JSON.stringify(opts)}`, async () => {
  const h = harness({ row: row(), ...opts }); const result = await h.publishCampaignMedia("1", owner, await form());
  assert.equal(!result.ok && result.code, "save_failed"); assert.equal(result.photos.length, 0); assert.equal(h.calls.removes.length, 0);
});
test("old orphan cleanup failure does not turn confirmed publication into fake failure", async () => {
  const h = harness({ row: row(), removeError: true }); const result = await h.publishCampaignMedia("1", owner, await form()); assert.equal(result.ok, true);
});
test("admin fetch stays on fixed Supabase origin with bounded timeout/no redirects/no cache", async () => {
  const h = harness(); await h.readCampaignMedia("1"); const bounded = h.mediaFetch();
  await assert.rejects(() => bounded("https://evil.invalid/storage/upload")); assert.equal(h.calls.fetches.length, 0);
  await bounded(`${origin}/rest/v1/campaign_media`, { method: "GET" });
  assert.equal(h.calls.fetches[0].init?.redirect, "error"); assert.equal(h.calls.fetches[0].init?.cache, "no-store"); assert.ok(h.calls.fetches[0].init?.signal);
});
test("setup recipe is explicit, client writes restrictive, metadata denied, no proof or custody schema mutation", () => {
  const sql = readFileSync(new URL("../supabase/campaign_media.sql", import.meta.url), "utf8");
  assert.match(sql, /SETUP RECIPE ONLY/); assert.match(sql, /enable row level security/); assert.match(sql, /revoke all on public\.campaign_media from public, anon, authenticated/);
  assert.equal((sql.match(/as restrictive/g) ?? []).length, 5); assert.match(sql, /public_acknowledged boolean not null check/); assert.match(sql, /file_size_limit/);
  assert.match(sql, /campaign_media_published_by_idx/); assert.match(sql, /grant select, insert, update on public\.campaign_media to service_role/);
  assert.doesNotMatch(sql, /alter table public\.wallets|secret_cipher|security definer|delete from storage\.objects/i);
  assert.doesNotMatch(source, /getSigner|getAuthenticatedSigner|invokeAs|friendbot|secret_cipher|currentWalletPublicKey/);
});
test("thin public server actions delegate untrusted inputs to the authorization service", () => {
  const action = readFileSync(new URL("../app/campaign-media-actions.ts", import.meta.url), "utf8");
  assert.match(action, /^"use server"/); assert.match(action, /return readCampaignMedia\(campaignId\)/); assert.match(action, /return publishCampaignMedia\(campaignId, expectedOwnerId, formData\)/);
});
