// Explicit, project-bound Storage API setup. Never logs credentials or alters
// an existing public bucket. No SQL/object-row deletion or user mutation.
import env from "@next/env";
import { createClient } from "@supabase/supabase-js";
const args = process.argv.slice(2);
const arg = name => args[args.indexOf(name) + 1];
if (!args.includes("--env-dir") || !args.includes("--project-ref")) throw Error("Specify --env-dir and --project-ref");
env.loadEnvConfig(arg("--env-dir"), false, { info() {}, error() {} });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (new URL(url).hostname !== `${arg("--project-ref")}.supabase.co`) throw Error("Project mismatch");
const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const id = "account-avatars";
const listed = await client.storage.listBuckets();
if (listed.error) throw Error("Cannot verify storage configuration");
const bucket = listed.data.find(value => value.id === id);
if (bucket?.public) throw Error("Existing bucket is public; manual privacy review required");
if (!args.includes("--apply")) {
  console.log(JSON.stringify({ project: arg("--project-ref"), exists: !!bucket, private: bucket ? !bucket.public : null }));
} else {
  const options = { public: false, fileSizeLimit: 524288, allowedMimeTypes: ["image/jpeg"] };
  const result = bucket ? await client.storage.updateBucket(id, options) : await client.storage.createBucket(id, options);
  if (result.error) throw Error("Private bucket setup failed");
  const verified = await client.storage.getBucket(id);
  if (verified.error || verified.data.public || verified.data.file_size_limit !== 524288
    || verified.data.allowed_mime_types?.join(",") !== "image/jpeg") throw Error("Bucket setup not verified");
  console.log(JSON.stringify({ project: arg("--project-ref"), bucket: id, private: true, maxBytes: 524288, mime: "image/jpeg" }));
}
