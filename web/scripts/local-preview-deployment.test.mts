import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Config = {
  headers(): Promise<{ source: string; headers: { key: string; value: string }[] }[]>;
  rewrites(): Promise<{ source: string; destination: string }[]>;
};

// Exercise the real Next config, not a copied guard. No build, provider, network,
// host environment, or deployed project is contacted by this regression matrix.
const code = ts.transpileModule(
  readFileSync(new URL("../next.config.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText;

function loadConfig(env: Record<string, string | undefined>): Config {
  const exported = {} as { default: Config };
  runInNewContext(code, {
    exports: exported,
    process: { env: { ...env } },
    require(name: string) { throw new Error(`Unexpected config dependency: ${name}`); },
  });
  return exported.default;
}

for (const nodeEnv of ["production", "development"] as const) {
  test(`Vercel production rejects preview flag 1 with NODE_ENV=${nodeEnv}`, () => {
    assert.throws(
      () => loadConfig({ NODE_ENV: nodeEnv, VERCEL_ENV: "production", NEXT_PUBLIC_LOCAL_PREVIEW: "1" }),
      /Local preview is not allowed in Vercel production\. Rebuild/
    );
  });
}

for (const flag of [undefined, "0", ""] as const) {
  test(`Vercel production accepts a non-preview build with flag ${String(flag)}`, () => {
    assert.ok(loadConfig({ NODE_ENV: "production", VERCEL_ENV: "production", NEXT_PUBLIC_LOCAL_PREVIEW: flag }));
  });
}

for (const vercelEnv of [undefined, "preview", "development"] as const) {
  test(`Local or demo preview remains supported with VERCEL_ENV=${String(vercelEnv)}`, () => {
    assert.ok(loadConfig({ NODE_ENV: "production", VERCEL_ENV: vercelEnv, NEXT_PUBLIC_LOCAL_PREVIEW: "1" }));
  });
}

test("Allowed preview config keeps the current security headers and landing rewrite", async () => {
  const config = loadConfig({ NODE_ENV: "production", NEXT_PUBLIC_LOCAL_PREVIEW: "1" });
  const headers = await config.headers();
  const universal = headers.find(route => route.source === "/:path*");
  assert.ok(universal);
  assert.ok(universal.headers.some(header => header.key === "X-Frame-Options" && header.value === "DENY"));
  assert.ok(universal.headers.some(header => header.key === "Permissions-Policy" && header.value === "camera=(), microphone=(), geolocation=()"));
  assert.ok(headers.some(route => route.source === "/landing" && route.headers.some(header => header.key === "Content-Security-Policy")));
  assert.equal(JSON.stringify(await config.rewrites()), JSON.stringify([{ source: "/landing", destination: "/landing/index.html" }]));
});
