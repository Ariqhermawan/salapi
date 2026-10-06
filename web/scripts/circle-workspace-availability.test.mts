import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { isWorkspaceLocalHost } from "../lib/circles/workspace.ts";

function load<T>(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const sandboxModule = { exports: {} as T };
  runInNewContext(code, { module: sandboxModule, exports: sandboxModule.exports, URL, ...globals, require(name: string) {
    assert.ok(name in dependencies, `Unexpected dependency ${name}: no auth, DB, storage or network reads allowed`);
    return dependencies[name];
  } });
  return sandboxModule.exports;
}

type Availability = { workspaceEntryAvailable(): Promise<boolean> };
type Provider = { WorkspaceAvailabilityProvider(props: { enabled: boolean; children?: React.ReactNode }): React.ReactNode; useWorkspaceAvailability(): boolean };
type Entry = { default(props: { create?: boolean }): React.ReactNode };
type Options = { preview?: boolean; enabled?: string; deployment?: boolean; host?: string | null; forwarded?: string; origin?: string; denyHeaders?: boolean };
function harness(options: Options = {}) {
  const env: Record<string, string | undefined> = { CIRCLES_WORKSPACE_ENABLED: options.enabled, ...(options.deployment ? { VERCEL: "1" } : {}) };
  const calls = { headers: 0, connection: 0 };
  const helper = load<Availability>("../lib/server/circleWorkspaceAvailability.ts", {
    "next/headers": { headers: async () => {
      calls.headers++; if (options.denyHeaders) throw new Error("Request unavailable");
      return new Map([["host", options.host === undefined ? "localhost:3000" : options.host], ["x-forwarded-host", options.forwarded ?? null], ["origin", options.origin ?? null]]);
    } },
    "@/lib/local-preview": { isLocalPreview: options.preview ?? false },
    "@/lib/circles/workspace": { isWorkspaceLocalHost },
  }, { process: { env } });
  const provider = load<Provider>("../components/circles/WorkspaceAvailabilityProvider.tsx", { react: React, "react/jsx-runtime": runtime });
  const entry = load<Entry>("../components/circles/WorkspaceEntry.tsx", {
    "react/jsx-runtime": runtime, "next/link": { default: (props: React.ComponentProps<"a">) => React.createElement("a", props) },
    "@/components/I18nProvider": { useT: () => ({ locale: "id" }) }, "./WorkspaceAvailabilityProvider": provider,
    "./WorkspaceEntry.module.css": { default: { entry: "workspace-entry" } },
  });
  const children = React.createElement(React.Fragment, {}, React.createElement("h1", {}, "Ordinary app content"),
    React.createElement(entry.default), React.createElement(entry.default, { create: true }));
  const pass = ({ children: value }: { children: React.ReactNode }) => value;
  const empty = { default: () => null };
  const layout = load<{ default(props: { children: React.ReactNode }): Promise<React.ReactNode> }>("../app/layout.tsx", {
    react: React, "react/jsx-runtime": runtime, "next/server": { connection: async () => { calls.connection++; } },
    "next/font/google": { Geist: () => ({ variable: "sans" }), Geist_Mono: () => ({ variable: "mono" }) }, "./globals.css": {},
    "@/components/I18nProvider": { I18nProvider: pass }, "@/components/circles/WorkspaceAvailabilityProvider": provider,
    "@/lib/server/circleWorkspaceAvailability": helper, "@/lib/local-preview": { isLocalPreview: options.preview ?? false },
    "@/components/BottomNav": empty, "@/components/PwaRegister": empty, "@/components/InstallBanner": empty,
    "@/components/MarketingAside": empty, "@/components/AppScrollReset": empty, "@/components/RouteMotion": { default: pass },
    "@/components/SuccessFeedback": empty, "@vercel/analytics/next": { Analytics: () => null }, "@vercel/speed-insights/next": { SpeedInsights: () => null },
  }, { process: { env } });
  return { helper, provider, entry, env, calls, render: async () => renderToStaticMarkup(await layout.default({ children })) };
}

for (const enabled of [undefined, "0", "false", "true", "2"]) test(`production flag ${String(enabled)}: server layout hides both workspace entry variants without hiding app content`, async () => {
  const h = harness({ enabled, deployment: true, host: "salapi.app" });
  assert.equal(await h.helper.workspaceEntryAvailable(), false);
  const html = await h.render(); assert.match(html, /Ordinary app content/); assert.doesNotMatch(html, /href="\/circles\/workspace/);
  assert.equal(h.calls.headers, 0); assert.equal(h.calls.connection, 1);
});

test("production flag 1: server layout passes availability to normal and create entries", async () => {
  const h = harness({ enabled: "1", deployment: true, host: "salapi.app" });
  const html = await h.render(); assert.match(html, /href="\/circles\/workspace"/); assert.match(html, /href="\/circles\/workspace\/create"/);
  assert.match(html, /Campaign komunitas &amp; donasi saya/); assert.match(html, /Buka campaign dengan foto/); assert.equal(h.calls.headers, 0);
});

test("local preview: validated localhost entry stays visible even with the production flag off", async () => {
  for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
    const h = harness({ preview: true, enabled: "0", host }); const html = await h.render();
    assert.match(html, /href="\/circles\/workspace"/); assert.match(html, /href="\/circles\/workspace\/create"/); assert.equal(h.calls.headers, 1);
  }
});

test("local mode on cloud, external, forwarded-spoofed or cross-origin hosts stays hidden even with flag 1", async () => {
  for (const options of [{ deployment: true }, { host: "salapi.app" }, { host: null }, { forwarded: "evil.example" }, { origin: "https://evil.example" }, { denyHeaders: true }]) {
    const h = harness({ preview: true, enabled: "1", ...options }); assert.doesNotMatch(await h.render(), /href="\/circles\/workspace/);
    assert.equal(h.calls.headers, 1);
  }
});

test("the server flag is read at request time, not frozen into a client/public environment flag", async () => {
  const h = harness({ enabled: "0" }); assert.doesNotMatch(await h.render(), /href="\/circles\/workspace/);
  h.env.CIRCLES_WORKSPACE_ENABLED = "1"; assert.match(await h.render(), /href="\/circles\/workspace"/);
  h.env.CIRCLES_WORKSPACE_ENABLED = "0"; assert.doesNotMatch(await h.render(), /href="\/circles\/workspace/);
  assert.equal(h.calls.headers, 0);
});

test("entry defaults closed without a provider and accepts only an explicit server boolean true", () => {
  const h = harness(); assert.equal(renderToStaticMarkup(React.createElement(h.entry.default)), "");
  for (const value of [false, undefined, null, "1", "true", 1]) {
    assert.equal(renderToStaticMarkup(React.createElement(h.provider.WorkspaceAvailabilityProvider, { enabled: value as boolean }, React.createElement(h.entry.default))), "");
  }
  assert.match(renderToStaticMarkup(React.createElement(h.provider.WorkspaceAvailabilityProvider, { enabled: true }, React.createElement(h.entry.default))), /href="\/circles\/workspace"/);
});
