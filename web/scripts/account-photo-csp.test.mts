import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
import ts from "typescript";

// Run the actual proxy with an explicit local/no-auth fixture. Never contacts a
// provider or starts a server. Check response and renderer CSP remain identical.
const code = ts.transpileModule(readFileSync(new URL("../proxy.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
type Response = { headers: Headers; request: { headers: Headers } };
function loadProxy(url: string, mode = "production") {
  const exported = {} as { proxy(request: unknown): Promise<Response> };
  runInNewContext(code, {
    exports: exported, URL, Headers, Buffer, crypto: { randomUUID }, process: { env: { NODE_ENV: mode } },
    require(name: string) {
      if (name === "next/server") return { NextResponse: { next: (options: { request: { headers: Headers } }) => ({ headers: new Headers(), ...options }) } };
      if (name === "@supabase/ssr") return { createServerClient: () => { throw new Error("Unexpected provider access"); } };
      if (name === "@/lib/supabase/env") return { SUPABASE_URL: url, SUPABASE_ANON: "", supabaseConfigured: () => false };
      if (name === "@/lib/local-preview") return { isLocalPreview: true };
      throw new Error("Unexpected proxy dependency: " + name);
    },
  });
  return exported.proxy;
}
const request = (path = "/settings") => ({ nextUrl: { pathname: path }, headers: new Headers() });

test("avatar CSP permits only Google image domains and the configured storage origin", async () => {
  const response = await loadProxy("https://project-id.supabase.co/storage/v1?ignored=yes")(request());
  const csp = response.headers.get("Content-Security-Policy")!;
  assert.equal(response.request.headers.get("Content-Security-Policy"), csp);
  const image = csp.split("; ").find(source => source.startsWith("img-src"))!;
  assert.equal(image, "img-src 'self' data: blob: https://googleusercontent.com https://*.googleusercontent.com https://project-id.supabase.co");
  assert.doesNotMatch(image, /https:\/\/\*\.supabase|ignored|storage\/v1|\bhttps:\s/);
  assert.match(csp, /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  assert.doesNotMatch(csp.split("; ").find(source => source.startsWith("script-src"))!, /unsafe-inline|unsafe-eval/);
  assert.match(csp, /frame-ancestors 'none'/);
});

for (const url of ["", "not a URL", "http://project.supabase.co", "data:text/html,test", "https://user:pass@project.supabase.co"]) {
  test("avatar CSP excludes invalid or insecure storage configuration " + JSON.stringify(url), async () => {
    const response = await loadProxy(url)(request());
    const image = response.headers.get("Content-Security-Policy")!.split("; ").find(source => source.startsWith("img-src"))!;
    assert.equal(image, "img-src 'self' data: blob: https://googleusercontent.com https://*.googleusercontent.com");
  });
}

test("nonce stays request-specific and development eval does not leak into production", async () => {
  const proxy = loadProxy("https://storage.example.com");
  const first = await proxy(request());
  const second = await proxy(request());
  assert.notEqual(first.request.headers.get("x-nonce"), second.request.headers.get("x-nonce"));
  const dev = await loadProxy("", "development")(request());
  assert.match(dev.headers.get("Content-Security-Policy")!, /'unsafe-eval'/);
});

test("static landing, asset and API routes retain their prior CSP exclusions", async () => {
  const proxy = loadProxy("https://project.supabase.co");
  for (const path of ["/landing", "/landing/privacy", "/circles/face-1.png", "/api/status"]) {
    assert.equal((await proxy(request(path))).headers.get("Content-Security-Policy"), null);
  }
  assert.ok((await proxy(request("/circles/tino-relief"))).headers.get("Content-Security-Policy"));
});
