import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import ts from "typescript";

// Actual component + React effects + native dialog in an isolated browser.
// Auth/server boundaries are fixtures, not Gmail signup or on-chain evidence.
// No credential, network, registration, wallet or database mutation is used.
const fixtureRequire = createRequire(join(process.cwd(), "package.json"));
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const address = "GCUBT6T7SMQKJE5L2TJLUQQPSBBU5GVHALGLWWECEJUIV2YFFCSXGHY7";
const compile = (path: string) => ts.transpileModule(readFileSync(join(process.cwd(), "e2e", path), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const productionModule = (pkg: string, name: string) => readFileSync(join(dirname(fixtureRequire.resolve(`${pkg}/package.json`)), "cjs", name), "utf8");
const sources: Record<string, string> = {
  react: productionModule("react", "react.production.js"),
  "react/jsx-runtime": productionModule("react", "react-jsx-runtime.production.js"),
  "react-dom": productionModule("react-dom", "react-dom.production.js"),
  "react-dom/client": productionModule("react-dom", "react-dom-client.production.js"),
  scheduler: productionModule("scheduler", "scheduler.production.js"),
  "@/lib/username-onboarding": compile("../lib/username-onboarding.ts"),
  "@/lib/username-onboarding-client": compile("../lib/username-onboarding-client.ts"),
  "@/lib/i18n/username-onboarding": compile("../lib/i18n/username-onboarding.ts"),
  component: compile("../components/UsernameOnboarding.tsx"),
};
const styles = readFileSync(join(process.cwd(), "components/UsernameOnboarding.module.css"), "utf8");

async function mount(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.setContent(`<style>${styles}</style><main><h1>Salapi account</h1><p>Home and Vaults remain visible while verifying.</p></main><div id="fixture-root"></div>`);
  await page.addScriptTag({ content: `
    const fixture = window.fixture = { path: '/', owner: '${owner}', reads: [], flashes: 0, mounts: 0 };
    let auth;
    const cache = {};
    const modules = {${Object.entries(sources).map(([name, code]) => `${JSON.stringify(name)}: (module, exports, require) => { ${code}\n }`).join(",")}};
    const stubs = {
      'next/navigation': { usePathname: () => fixture.path, useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace() {} }) },
      'next/link': { __esModule: true, default: p => require('react').createElement('a', {href: p.href}, p.children) },
      '@/app/username-onboarding-actions': { completeUsername() { throw Error('No registration in a read-only fixture'); } },
      '@/app/actions': { checkSubmittedTransaction() { throw Error('No transaction in this fixture'); } },
      '@/lib/supabase/env': { supabaseConfigured: () => true },
      '@/lib/local-preview': { isLocalPreview: false },
      '@/components/I18nProvider': { useT: () => ({ locale: 'en' }) },
      './UsernameOnboarding.module.css': { __esModule: true, default: new Proxy({}, {get: (_, key) => key}) },
      '@/lib/supabase/client': { createSupabaseBrowser: () => ({auth: { onAuthStateChange(cb) {
        fixture.mounts++;
        auth = cb;
        queueMicrotask(() => cb('INITIAL_SESSION', {user: {id: fixture.owner, is_anonymous: false}}));
        return {data: {subscription: {unsubscribe() {}}}};
      } }}) },
    };
    function require(id) {
      if (id === './username-onboarding') id = '@/lib/username-onboarding';
      if (id in stubs) return stubs[id];
      if (cache[id]) return cache[id].exports;
      if (!modules[id]) throw Error('Unexpected fixture dependency: ' + id);
      const module = cache[id] = {exports: {}};
      modules[id](module, module.exports, require);
      return module.exports;
    }
    window.fetch = (url, options) => new Promise(resolve => fixture.reads.push({
      owner: options.headers['X-Salapi-Owner'],
      resolve: value => resolve({ok: true, json: async () => value}),
    }));
    const React = require('react');
    const Component = require('component').default;
    const root = require('react-dom/client').createRoot(document.getElementById('fixture-root'));
    fixture.render = () => root.render(React.createElement(Component));
    fixture.navigate = path => {fixture.path = path; fixture.render();};
    fixture.auth = owner => {fixture.owner = owner; auth(owner ? 'SIGNED_IN' : 'SIGNED_OUT', owner ? {user: {id: owner, is_anonymous: false}} : null);};
    fixture.remount = () => {require('react-dom').flushSync(() => root.render(null)); setTimeout(fixture.render, 0);};
    new MutationObserver(() => {if (document.querySelector('dialog h2')?.textContent === 'Choose your @username') fixture.flashes++;}).observe(document.body, {childList: true, subtree: true});
    fixture.render();
  ` });
  await expect.poll(() => page.evaluate(() => (window as unknown as { fixture: { reads: unknown[] } }).fixture.reads.length)).toBe(1);
}

async function resolveRead(page: Page, index: number, status: "ready" | "required" | "unavailable", ownerId = owner) {
  await page.evaluate(({ index, status, ownerId, address }) => {
    const fixture = (window as unknown as { fixture: { reads: { resolve(value: unknown): void }[] } }).fixture;
    fixture.reads[index].resolve(status === "unavailable" ? { status } : { status, ownerId, address, ...(status === "ready" ? { handle: "fixture_user" } : {}) });
  }, { index, status, ownerId, address });
}

test("slow verification and section changes never flash a claim dialog for an existing user", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await mount(page);
  await page.evaluate(() => (window as unknown as { fixture: { navigate(path: string): void } }).fixture.navigate("/vaults"));
  await expect(page.getByRole("heading", { name: "Salapi account" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await resolveRead(page, 0, "ready");
  await page.evaluate(() => (window as unknown as { fixture: { navigate(path: string): void; remount(): void } }).fixture.remount());
  await expect.poll(() => page.evaluate(() => (window as unknown as { fixture: { mounts: number } }).fixture.mounts)).toBe(2);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const f = (window as unknown as { fixture: { reads: unknown[]; flashes: number } }).fixture;
    return { reads: f.reads.length, flashes: f.flashes };
  })).toEqual({ reads: 1, flashes: 0 });
  expect(errors).toEqual([]);
});

test("remounting during a slow owner read deduplicates the request without flashing the dialog", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => (window as unknown as { fixture: { remount(): void } }).fixture.remount());
  await expect.poll(() => page.evaluate(() => (window as unknown as { fixture: { mounts: number } }).fixture.mounts)).toBe(2);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await resolveRead(page, 0, "ready");
  await expect.poll(() => page.evaluate(() => {
    const f = (window as unknown as { fixture: { reads: unknown[]; flashes: number } }).fixture;
    return { reads: f.reads.length, flashes: f.flashes };
  })).toEqual({ reads: 1, flashes: 0 });
});

test("confirmed missing username opens a mandatory focus-trapped native dialog", async ({ page }) => {
  await mount(page, 320); await expect(page.getByRole("dialog")).toHaveCount(0);
  await resolveRead(page, 0, "required");
  await expect(page.getByRole("dialog", { name: "Choose your @username" })).toBeVisible();
  await expect(page.getByLabel("Your username", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save username" })).toBeDisabled();
});

test("an unavailable verification shows neutral recovery instead of a false claim", async ({ page }) => {
  await mount(page); await resolveRead(page, 0, "unavailable");
  await expect(page.getByRole("dialog", { name: "Check your account" })).toBeVisible();
  await expect(page.getByLabel("Your username", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();
});

test("an account switch cannot reuse the previous owner's verified ready state", async ({ page }) => {
  await mount(page); await resolveRead(page, 0, "ready");
  await page.evaluate(other => (window as unknown as { fixture: { auth(id: string): void } }).fixture.auth(other), other);
  await expect.poll(() => page.evaluate(() => (window as unknown as { fixture: { reads: unknown[] } }).fixture.reads.length)).toBe(2);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await resolveRead(page, 1, "required", other);
  await expect(page.getByRole("dialog", { name: "Choose your @username" })).toBeVisible();
});
