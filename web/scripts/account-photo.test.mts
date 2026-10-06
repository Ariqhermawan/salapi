import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import sharp from "sharp";
import { AuthSessionMissingError, isAuthSessionMissingError } from "@supabase/supabase-js";
import * as photo from "../lib/account-photo.ts";
import { accountPhotoCopy } from "../lib/i18n/account-photo.ts";
import { LOCALES } from "../lib/i18n/config.ts";

const ownerId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const oldPath = `${ownerId}/00000000-0000-4000-8000-000000000010.jpg`;
const googleUrl = "https://lh3.googleusercontent.com/a/fixture=s96-c";
const user = () => ({ id: ownerId, email: "fixture@example.invalid", identities: [{ provider: "google", identity_data: { avatar_url: googleUrl } }], user_metadata: {} as Record<string, unknown> });
const source = readFileSync(new URL("../lib/server/accountPhoto.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;

function harness(options: {
  currentUser?: ReturnType<typeof user> | null; authError?: unknown; authThrows?: boolean; factoryThrows?: boolean;
  preview?: boolean; configured?: boolean; uploadFails?: boolean; signFails?: boolean; saveFails?: boolean; saveThrows?: boolean; savedOwner?: string; removeFails?: boolean;
} = {}) {
  let current = options.currentUser === undefined ? user() : options.currentUser;
  const calls = { auth: 0, upload: [] as { path: string; bytes: Buffer; options: unknown }[], sign: [] as string[], save: [] as Record<string, unknown>[], remove: [] as string[][] };
  const bucket = {
    async upload(path: string, bytes: Buffer, uploadOptions: unknown) {
      calls.upload.push({ path, bytes, options: structuredClone(uploadOptions) });
      return options.uploadFails ? { data: null, error: { message: "Bucket not found" } } : { data: { path }, error: null };
    },
    async createSignedUrl(path: string, seconds: number) {
      assert.equal(seconds, 3600); calls.sign.push(path);
      return options.signFails ? { data: null, error: {} } : { data: { signedUrl: `https://project.supabase.co/storage/v1/object/sign/account-avatars/${path}?token=fixture` }, error: null };
    },
    async remove(paths: string[]) {
      calls.remove.push(Array.from(paths)); if (options.removeFails) throw new Error("Cleanup failure"); return { data: [], error: null };
    },
  };
  const supabase = { auth: {
    async getUser() { calls.auth++; if (options.authThrows) throw new Error("Auth offline"); return { data: { user: current }, error: options.authError ?? null }; },
    async updateUser(input: { data: Record<string, unknown> }) {
      calls.save.push(structuredClone(input.data));
      if (options.saveThrows) throw new Error("Auth response interrupted");
      if (options.saveFails) return { data: { user: null }, error: {} };
      assert.ok(current); current = { ...current, id: options.savedOwner ?? current.id, user_metadata: { ...current.user_metadata, ...input.data } };
      return { data: { user: current }, error: null };
    },
  }, storage: { from(name: string) { assert.equal(name, photo.ACCOUNT_AVATAR_BUCKET); return bucket; } } };
  const exports = {} as {
    readAccountPhoto: () => Promise<photo.AccountPhotoResult>;
    uploadAccountPhoto: (expected: string, input: FormData) => Promise<photo.AccountPhotoResult>;
    restoreGoogleAccountPhoto: (expected: string) => Promise<photo.AccountPhotoResult>;
  };
  runInNewContext(compiled, {
    exports, Buffer, File, FormData, URL,
    require(dependency: string) {
      if (dependency === "server-only") return {};
      if (dependency === "node:crypto") return { randomUUID };
      if (dependency === "sharp") return sharp;
      if (dependency === "@supabase/supabase-js") return { isAuthSessionMissingError };
      if (dependency === "@/lib/account-photo") return photo;
      if (dependency === "@/lib/local-preview") return { isLocalPreview: options.preview ?? false };
      if (dependency === "@/lib/supabase/env") return { supabaseConfigured: () => options.configured ?? true };
      if (dependency === "@/lib/supabase/server") return { createSupabaseServer: async () => { if (options.factoryThrows) throw new AuthSessionMissingError(); return supabase; } };
      throw new Error(`Unexpected dependency ${dependency}`);
    },
  });
  return { ...exports, calls };
}

async function inputPhoto({ mime = "image/png", width = 40, height = 60, corrupt = false, bytes = 0 } = {}) {
  const buffer = bytes ? Buffer.alloc(bytes) : corrupt ? Buffer.from("<svg>not an image</svg>")
    : await sharp({ create: { width, height, channels: 3, background: "#2563eb" } }).png().withMetadata().toBuffer();
  const data = new FormData(); data.set("photo", new File([new Uint8Array(buffer)], "untrusted-name.svg", { type: mime }));
  return data;
}

test("verified Google identity photo is the default without persistent writes", async () => {
  const h = harness(); const result = await h.readAccountPhoto();
  assert.equal(result.ok, true); if (!result.ok) return;
  assert.equal(result.profile.photoUrl, googleUrl); assert.equal(result.profile.source, "google");
  assert.equal(result.profile.email, "fixture@example.invalid"); assert.equal(result.profile.ownerId, ownerId);
  assert.deepEqual(h.calls.save, []); assert.deepEqual(h.calls.upload, []);
});

test("user-editable avatar URLs and misleading hosts cannot replace the verified Google photo", () => {
  for (const url of ["http://lh3.googleusercontent.com/a", "https://lh3.googleusercontent.com.evil.invalid/a", "https://evil.invalid/googleusercontent.com", "https://user:pass@lh3.googleusercontent.com/a", "data:image/svg+xml,evil", "javascript:alert(1)"]) {
    assert.equal(photo.googleAccountPhoto({ identities: [{ provider: "google", identity_data: { avatar_url: url } }] } as never), null);
  }
  assert.equal(photo.googleAccountPhoto({ identities: [{ provider: "email", identity_data: { avatar_url: googleUrl } }] } as never), null);
  assert.equal(photo.googleAccountPhoto({ identities: [], user_metadata: { avatar_url: googleUrl } } as never), null);
});

test("valid private override persists on fresh server reads and belongs only to the request owner", async () => {
  const current = user(); current.user_metadata[photo.ACCOUNT_AVATAR_METADATA_KEY] = oldPath;
  const h = harness({ currentUser: current }); const result = await h.readAccountPhoto();
  assert.equal(result.ok, true); if (!result.ok) return;
  assert.equal(result.profile.source, "custom"); assert.match(result.profile.photoUrl!, /token=fixture/);
  assert.deepEqual(h.calls.sign, [oldPath]);
  for (const value of [`${otherId}/00000000-0000-4000-8000-000000000010.jpg`, `${ownerId}/../photo.jpg`, `https://evil.invalid/avatar.jpg`, `${ownerId}/nested/00000000-0000-4000-8000-000000000010.jpg`]) {
    assert.equal(photo.ownedAccountPhotoPath(value, ownerId), null);
    current.user_metadata[photo.ACCOUNT_AVATAR_METADATA_KEY] = value;
    const invalid = harness({ currentUser: current }); await invalid.readAccountPhoto(); assert.deepEqual(invalid.calls.sign, []);
  }
});

for (const options of [{ currentUser: null }, { currentUser: null, authError: new AuthSessionMissingError() }, { authThrows: true }, { factoryThrows: true }, { preview: true }, { configured: false }]) {
  test(`no writes for missing/unavailable auth ${JSON.stringify(options)}`, async () => {
    const h = harness(options); const result = await h.uploadAccountPhoto(ownerId, await inputPhoto());
    assert.equal(result.ok, false); assert.deepEqual(h.calls.upload, []); assert.deepEqual(h.calls.save, []);
    if (options.factoryThrows) assert.equal(!result.ok && result.code, "unavailable", "Client setup failure is not a proven guest");
  });
}

test("stale or forged client owner cannot upload or restore another account", async () => {
  const h = harness();
  assert.equal((await h.uploadAccountPhoto(otherId, await inputPhoto())).ok, false);
  assert.equal((await h.restoreGoogleAccountPhoto(otherId)).ok, false);
  assert.deepEqual(h.calls.upload, []); assert.deepEqual(h.calls.save, []);
});

test("malformed action inputs fail clearly without a Storage or Auth mutation", async () => {
  const h = harness();
  const malformed = await h.uploadAccountPhoto(ownerId, null as never);
  assert.equal(!malformed.ok && malformed.code, "invalid_file");
  for (const missing of [undefined, null, "", {}]) {
    assert.equal((await h.uploadAccountPhoto(missing as never, await inputPhoto())).ok, false);
    assert.equal((await h.restoreGoogleAccountPhoto(missing as never)).ok, false);
  }
  assert.deepEqual(h.calls.upload, []); assert.deepEqual(h.calls.save, []);
});

test("upload decodes/reencodes a bounded JPEG, strips metadata and ignores the supplied filename", async () => {
  const current = user(); current.user_metadata[photo.ACCOUNT_AVATAR_METADATA_KEY] = oldPath;
  const h = harness({ currentUser: current }); const result = await h.uploadAccountPhoto(ownerId, await inputPhoto());
  assert.equal(result.ok, true); assert.equal(h.calls.upload.length, 1);
  const upload = h.calls.upload[0]; assert.match(upload.path, new RegExp(`^${ownerId}/[0-9a-f-]{36}\\.jpg$`));
  assert.deepEqual(upload.options, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
  const metadata = await sharp(upload.bytes).metadata(); assert.equal(metadata.format, "jpeg"); assert.ok(metadata.width! <= 512); assert.ok(metadata.height! <= 512);
  assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined);
  assert.deepEqual(h.calls.save, [{ [photo.ACCOUNT_AVATAR_METADATA_KEY]: upload.path }]); assert.deepEqual(h.calls.remove, [[oldPath]]);
  const reread = await h.readAccountPhoto(); assert.equal(reread.ok && reread.profile.source, "custom", "A fresh request reads the persisted Auth preference");
});

for (const options of [{ mime: "image/svg+xml" }, { corrupt: true }, { bytes: photo.ACCOUNT_AVATAR_MAX_BYTES + 1 }, { width: 4097, height: 4097 }]) {
  test(`invalid or excessive image cannot reach Storage ${JSON.stringify(options)}`, async () => {
    const h = harness(); const result = await h.uploadAccountPhoto(ownerId, await inputPhoto(options));
    assert.equal(!result.ok && result.code, "invalid_file"); assert.deepEqual(h.calls.upload, []); assert.deepEqual(h.calls.save, []);
  });
}

test("a missing bucket fails clearly and never saves a fake photo preference", async () => {
  const h = harness({ uploadFails: true }); const result = await h.uploadAccountPhoto(ownerId, await inputPhoto());
  assert.equal(!result.ok && result.code, "storage_unavailable"); assert.deepEqual(h.calls.save, []);
});

test("missing read policy prevents persistence and removes only the newly uploaded owned object", async () => {
  const h = harness({ signFails: true }); const result = await h.uploadAccountPhoto(ownerId, await inputPhoto());
  assert.equal(!result.ok && result.code, "storage_unavailable"); assert.deepEqual(h.calls.save, []);
  assert.deepEqual(h.calls.remove, [[h.calls.upload[0].path]]);
});

for (const options of [{ saveFails: true }, { saveThrows: true }, { savedOwner: otherId }]) {
  test(`unconfirmed Auth persistence never returns success or deletes a possibly referenced object ${JSON.stringify(options)}`, async () => {
    const h = harness(options); const result = await h.uploadAccountPhoto(ownerId, await inputPhoto());
    assert.equal(!result.ok && result.code, "save_failed"); assert.deepEqual(h.calls.remove, []);
  });
}

test("restore Google saves the preference first, removes only the owner's old photo, and survives cleanup failure", async () => {
  const current = user(); current.user_metadata[photo.ACCOUNT_AVATAR_METADATA_KEY] = oldPath;
  const h = harness({ currentUser: current, removeFails: true }); const result = await h.restoreGoogleAccountPhoto(ownerId);
  assert.equal(result.ok && result.profile.source, "google"); assert.deepEqual(h.calls.save, [{ [photo.ACCOUNT_AVATAR_METADATA_KEY]: null }]);
  assert.deepEqual(h.calls.remove, [[oldPath]]); assert.equal((await h.readAccountPhoto()).ok, true);
});

test("restore is not offered as a fake provider operation when Google photo is absent", async () => {
  const current = user(); current.identities = [];
  const h = harness({ currentUser: current }); const result = await h.restoreGoogleAccountPhoto(ownerId);
  assert.equal(!result.ok && result.code, "google_unavailable"); assert.deepEqual(h.calls.save, []);
});

test("private bucket recipe has owner SELECT/INSERT/DELETE checks and no broad read or service-role dependency", () => {
  const sql = readFileSync(new URL("../supabase/account_avatars.sql", import.meta.url), "utf8");
  assert.match(sql, /'account-avatars', 'account-avatars', false, 524288/);
  for (const operation of ["select", "insert", "delete"]) assert.match(sql, new RegExp(`for ${operation} to authenticated`));
  assert.equal((sql.match(/\(select auth\.uid\(\)\)::text/g) ?? []).length, 3);
  assert.doesNotMatch(source, /createSupabaseAdmin|service_role|SUPABASE_SERVICE_ROLE/);
  assert.match(sql, /raise exception 'account-avatars must be private/);
});

test("all photo labels and failure states are localized without placeholder fallback", () => {
  for (const locale of LOCALES) {
    const copy = accountPhotoCopy(locale); assert.deepEqual(Object.keys(copy), Object.keys(accountPhotoCopy("en")));
    for (const value of Object.values(copy)) { assert.ok(value.trim()); assert.doesNotMatch(value, /—|\{\w+\}/); }
    if (locale !== "en") assert.notEqual(copy.title, accountPhotoCopy("en").title);
  }
});
