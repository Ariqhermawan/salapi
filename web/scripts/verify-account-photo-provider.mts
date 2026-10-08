// Opt-in, bounded provider QA. Only a new fixture account and its generated
// photo objects are changed. No real user, wallet, transaction or email send.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { createClient, isAuthSessionMissingError } from "@supabase/supabase-js";
import sharp from "sharp";
import ts from "typescript";
import * as photo from "../lib/account-photo.ts";

const args = process.argv.slice(2);
const option = (key: string) => { const at = args.indexOf(key); return at < 0 ? undefined : args[at + 1]; };
assert.ok(args.includes("--apply"), "Provider QA requires --apply");
const project = option("--project-ref"), envDir = option("--env-dir");
assert.ok(project && /^[a-z]{20}$/.test(project) && envDir, "Pass exact --project-ref and --env-dir");
nextEnv.loadEnvConfig(resolve(envDir), false, { info() {}, error() {} });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
assert.equal(new URL(url).hostname, `${project}.supabase.co`);
const configuration = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, configuration);
const session = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, configuration);
const anonymous = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, configuration);
const paths: string[] = [];
let owner: string | undefined;
let providerPassed = false;
try {
  const created = await admin.auth.admin.createUser({ email: `photo-qa-${randomUUID()}@fixture.invalid`, password: randomUUID() + randomUUID(), email_confirm: true });
  assert.equal(created.error, null); owner = created.data.user?.id; assert.ok(owner);
  const token = await admin.auth.admin.generateLink({ type: "magiclink", email: created.data.user!.email! });
  assert.equal(token.error, null);
  const signedIn = await session.auth.verifyOtp({ token_hash: token.data.properties!.hashed_token, type: "magiclink" });
  assert.equal(signedIn.error, null); assert.equal(signedIn.data.user?.id, owner);
  const api = {} as { uploadAccountPhoto(owner: string, form: FormData): Promise<photo.AccountPhotoResult>; readAccountPhoto(): Promise<photo.AccountPhotoResult> };
  const compiled = ts.transpileModule(readFileSync(new URL("../lib/server/accountPhoto.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const storage = { storage: { from(bucket: string) {
    assert.equal(bucket, photo.ACCOUNT_AVATAR_BUCKET);
    const target = admin.storage.from(bucket);
    return { ...target,
      upload(path: string, bytes: Buffer, options: object) {
        assert.ok(photo.ownedAccountPhotoPath(path, owner!)); paths.push(path);
        return target.upload(path, bytes, options);
      },
      createSignedUrl: target.createSignedUrl.bind(target), remove: target.remove.bind(target),
    };
  } } };
  runInNewContext(compiled, { exports: api, Buffer, File, FormData, URL, require(name: string) {
    if (name === "server-only") return {};
    if (name === "node:crypto") return { randomUUID };
    if (name === "sharp") return sharp;
    if (name === "@supabase/supabase-js") return { isAuthSessionMissingError };
    if (name === "@/lib/account-photo") return photo;
    if (name === "@/lib/local-preview") return { isLocalPreview: false };
    if (name === "@/lib/supabase/env") return { supabaseConfigured: () => true };
    if (name === "@/lib/supabase/server") return { createSupabaseServer: async () => session };
    if (name === "@/lib/supabase/admin") return { createSupabaseAdmin: () => storage };
    throw Error(`Unexpected dependency ${name}`);
  } });
  const form = new FormData();
  form.set("photo", new File([new Uint8Array(await sharp({ create: { width: 40, height: 40, channels: 3, background: "#4263eb" } }).png().toBuffer())], "qa.png", { type: "image/png" }));
  const forbidden = await api.uploadAccountPhoto(randomUUID(), form);
  assert.equal(forbidden.ok, false); assert.equal(paths.length, 0);
  const first = await api.uploadAccountPhoto(owner, form);
  assert.ok(first.ok && first.profile.source === "custom");
  if (!first.ok) throw Error("Owner upload failed");
  const signed = await fetch(first.profile.photoUrl!, { redirect: "error" });
  assert.equal(signed.status, 200); assert.equal(signed.headers.get("content-type"), "image/jpeg");
  assert.ok((await signed.arrayBuffer()).byteLength > 0);
  assert.ok((await anonymous.storage.from(photo.ACCOUNT_AVATAR_BUCKET).download(paths[0])).error, "Anonymous direct object access must fail");
  assert.ok((await session.storage.from(photo.ACCOUNT_AVATAR_BUCKET).download(paths[0])).error, "Direct bucket access is not required by the server-managed app");
  const fresh = await api.readAccountPhoto();
  assert.ok(fresh.ok && fresh.profile.source === "custom", "Fresh verified Auth read retains profile");
  const replacement = await api.uploadAccountPhoto(owner, form);
  assert.ok(replacement.ok && replacement.profile.source === "custom");
  assert.equal(paths.length, 2);
  assert.ok((await admin.storage.from(photo.ACCOUNT_AVATAR_BUCKET).download(paths[0])).error, "Replaced photo must be removed");
  providerPassed = true;
} finally {
  if (paths.length) {
    assert.ok(owner && paths.every(path => photo.ownedAccountPhotoPath(path, owner!)), "Cleanup is restricted to generated QA owner paths");
    const removed = await admin.storage.from(photo.ACCOUNT_AVATAR_BUCKET).remove(paths); assert.equal(removed.error, null);
    const remaining = await admin.storage.from(photo.ACCOUNT_AVATAR_BUCKET).list(owner!); assert.equal(remaining.error, null); assert.equal(remaining.data?.length, 0);
  }
  if (owner) {
    const removed = await admin.auth.admin.deleteUser(owner); assert.equal(removed.error, null);
    const remaining = await admin.auth.admin.getUserById(owner); assert.equal(remaining.data.user, null);
  }
}
console.log(JSON.stringify({ project, upload: providerPassed, signedRead: providerPassed, persistedProfile: providerPassed, forgedOwnerDenied: providerPassed, anonymousDenied: providerPassed, replacementCleanup: providerPassed, fixtureCleanup: true }));
