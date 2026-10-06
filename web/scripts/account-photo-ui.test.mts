import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as photoHelpers from "../lib/account-photo.ts";
import { accountPhotoCopy } from "../lib/i18n/account-photo.ts";
import { LOCALES } from "../lib/i18n/config.ts";

const ownerId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const profile = (id = ownerId): photoHelpers.AccountPhoto => ({ ownerId: id, email: "fixture@example.invalid", photoUrl: "https://lh3.googleusercontent.com/a/fixture", googlePhotoUrl: "https://lh3.googleusercontent.com/a/fixture", source: "google" });
const forbidden = () => { throw new Error("Unexpected external boundary"); };
function compile(relative: string) {
  return ts.transpileModule(readFileSync(new URL(relative, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function flush() { for (let turn = 0; turn < 12; turn++) await Promise.resolve(); }

// Execute the actual hook with isolated React hooks and auth/action boundaries.
// These fixtures prove lifecycle/state behavior, not real Supabase or browser E2E.
type AuthSession = { user: { id: string } } | null;
function hookHarness({ preview = false, configured = true, initialOwner = ownerId as string | null, signOutPending = undefined as (() => boolean) | undefined } = {}) {
  const state: unknown[] = [];
  const refs: { current: unknown }[] = [];
  const reads: ReturnType<typeof deferred<photoHelpers.AccountPhotoResult>>[] = [];
  const upload = deferred<photoHelpers.AccountPhotoResult>();
  const restore = deferred<photoHelpers.AccountPhotoResult>();
  const calls = { uploads: [] as { owner: string; data: FormData }[], restores: [] as string[], unsubscribed: 0, reloads: 0 };
  const listeners = new Map<string, () => void>();
  const reloadTasks = new Map<number, () => void>();
  const location = { pathname: "/settings", reload: () => { calls.reloads++; } };
  let timeoutId = 0;
  let stateCursor = 0, refCursor = 0;
  let effect: (() => void | (() => void)) | undefined;
  let authEvent: ((event: string, session: AuthSession) => void) | undefined;
  const exports = {} as { useAccountPhoto: typeof import("../components/useAccountPhoto").useAccountPhoto };
  runInNewContext(compile("../components/useAccountPhoto.ts"), {
    exports, FormData, File, Event, queueMicrotask, setInterval: () => 1, clearInterval: () => {},
    window: {
      location,
      setTimeout: (callback: () => void) => { const id = ++timeoutId; reloadTasks.set(id, callback); return id; },
      clearTimeout: (id: number) => reloadTasks.delete(id),
      addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
      dispatchEvent: (event: Event) => { listeners.get(event.type)?.(); return true; },
    },
    require(dependency: string) {
      if (dependency === "react") return {
        useState(initial: unknown) { const i = stateCursor++; if (i >= state.length) state[i] = initial; return [state[i], (next: unknown) => { state[i] = next; }]; },
        useRef(initial: unknown) { const i = refCursor++; return refs[i] ?? (refs[i] = { current: initial }); },
        useCallback: (callback: unknown) => callback,
        useEffect: (callback: () => void | (() => void)) => { effect = callback; },
      };
      if (dependency === "@/lib/account-photo") return photoHelpers;
      if (dependency === "@/lib/local-preview") return { isLocalPreview: preview };
      if (dependency === "@/lib/supabase/env") return { supabaseConfigured: () => configured };
      if (dependency === "@/lib/supabase/client") return { createSupabaseBrowser: () => ({ auth: { onAuthStateChange(callback: (event: string, session: AuthSession) => void) {
        authEvent = callback;
        queueMicrotask(() => callback("INITIAL_SESSION", initialOwner ? { user: { id: initialOwner } } : null));
        return { data: { subscription: { unsubscribe() { calls.unsubscribed++; } } } };
      } } }) };
      if (dependency === "@/app/account-photo-actions") return {
        accountPhoto() { const request = deferred<photoHelpers.AccountPhotoResult>(); reads.push(request); return request.promise; },
        saveAccountPhoto(owner: string, data: FormData) { calls.uploads.push({ owner, data }); return upload.promise; },
        restoreGooglePhoto(owner: string) { calls.restores.push(owner); return restore.promise; },
      };
      throw new Error(`Unexpected dependency ${dependency}`);
    },
  });
  const render = () => { stateCursor = refCursor = 0; return exports.useAccountPhoto(signOutPending); };
  render(); const cleanup = effect!();
  const runReloads = () => { const tasks = [...reloadTasks.values()]; reloadTasks.clear(); for (const callback of tasks) callback(); };
  return { render, reads, upload, restore, calls, auth: (event: string, session: AuthSession = event === "SIGNED_OUT" ? null : { user: { id: ownerId } }) => authEvent!(event, session), cleanup, remountEffect: () => effect!(), focus: () => listeners.get("focus")?.(), listeners, reloadTasks, runReloads, location };
}

test("hook starts neutral, reads the verified owner, and uploads once even with two immediate clicks", async () => {
  const h = hookHarness(); assert.equal(h.render().status, "loading"); assert.equal(h.render().profile, null);
  await flush(); assert.equal(h.reads.length, 1); h.reads[0].resolve({ ok: true, profile: profile() }); await flush();
  assert.equal(h.reloadTasks.size, 0); assert.equal(h.calls.reloads, 0);
  const controller = h.render(); assert.equal(controller.profile?.ownerId, ownerId);
  const file = new File([new Uint8Array([1, 2, 3])], "fixture.png", { type: "image/png" });
  const first = controller.upload(file); const duplicate = controller.upload(file);
  assert.equal(h.calls.uploads.length, 1); assert.equal(h.calls.uploads[0].owner, ownerId); assert.equal(h.calls.uploads[0].data.get("photo"), file);
  assert.equal(h.render().pending, true); assert.equal(h.render().message, null);
  h.upload.resolve({ ok: true, profile: { ...profile(), source: "custom", photoUrl: "https://project.supabase.co/owned.jpg" } }); await Promise.all([first, duplicate]);
  assert.equal(h.render().pending, false); assert.equal(h.render().message, "saved"); assert.equal(h.render().profile?.source, "custom");
  h.cleanup?.();
});

test("Storage error keeps the previous verified photo and presents no success message", async () => {
  const h = hookHarness(); await flush(); h.reads[0].resolve({ ok: true, profile: profile() }); await flush();
  const save = h.render().upload(new File(["fixture"], "fixture.png", { type: "image/png" }));
  h.upload.resolve({ ok: false, code: "storage_unavailable" }); await save;
  assert.equal(h.render().profile?.photoUrl, profile().photoUrl); assert.equal(h.render().message, "storage_unavailable"); assert.equal(h.render().pending, false);
  h.cleanup?.();
});

test("sign-out removes the old photo immediately and suppresses an outstanding upload response", async () => {
  const h = hookHarness(); await flush(); h.reads[0].resolve({ ok: true, profile: profile() }); await flush();
  const save = h.render().upload(new File(["fixture"], "fixture.png", { type: "image/png" }));
  h.auth("SIGNED_OUT"); assert.equal(h.render().profile, null); assert.equal(h.render().pending, false);
  h.upload.resolve({ ok: true, profile: profile() }); await save;
  assert.equal(h.render().profile, null); assert.equal(h.render().message, null); assert.equal(h.render().code, "unauthenticated");
  assert.equal(h.reloadTasks.size, 1); h.runReloads(); assert.equal(h.calls.reloads, 1);
  h.cleanup?.();
});

test("an owner change reloads the document without mixing the next photo with the old wallet identity", async () => {
  const h = hookHarness(); await flush(); h.auth("SIGNED_IN", { user: { id: otherId } }); await flush(); assert.equal(h.reads.length, 1);
  h.focus(); await h.render().reload(); await flush(); assert.equal(h.reads.length, 1);
  h.reads[0].resolve({ ok: true, profile: profile() }); await flush();
  assert.equal(h.render().profile, null); assert.equal(h.render().status, "loading");
  assert.equal(h.calls.reloads, 0); assert.equal(h.reloadTasks.size, 1);
  h.runReloads(); assert.equal(h.calls.reloads, 1); h.cleanup?.();
});

test("a latest server response for another owner never renders before the browser Auth event settles", async () => {
  const h = hookHarness(); await flush();
  h.auth("SIGNED_IN", { user: { id: ownerId } }); await flush();
  h.reads.at(-1)!.resolve({ ok: true, profile: profile(otherId) }); await flush();
  assert.equal(h.render().profile, null); assert.equal(h.render().status, "error"); assert.equal(h.render().code, "account_changed");
  const skipped = h.render().upload(new File(["fixture"], "fixture.png", { type: "image/png" })); await skipped;
  assert.equal(h.calls.uploads.length, 0);
  h.auth("SIGNED_IN", { user: { id: otherId } }); await flush();
  assert.equal(h.render().profile, null); assert.equal(h.render().status, "loading");
  h.runReloads(); assert.equal(h.calls.reloads, 1); h.cleanup?.();
});

test("same-owner token refresh cannot unlock a pending upload or discard its confirmed response", async () => {
  const h = hookHarness(); await flush(); h.reads[0].resolve({ ok: true, profile: profile() }); await flush();
  const controller = h.render(), file = new File(["fixture"], "fixture.png", { type: "image/png" });
  const first = controller.upload(file);
  h.auth("TOKEN_REFRESHED", { user: { id: ownerId } }); await flush();
  assert.equal(h.render().pending, true); assert.equal(h.reads.length, 1);
  assert.equal(h.reloadTasks.size, 0); assert.equal(h.calls.reloads, 0);
  await h.render().upload(file); assert.equal(h.calls.uploads.length, 1);
  h.upload.resolve({ ok: true, profile: { ...profile(), source: "custom" } }); await first;
  assert.equal(h.render().pending, false); assert.equal(h.render().message, "saved"); assert.equal(h.render().profile?.source, "custom");
  h.cleanup?.();
});

test("account switching clears a pending photo immediately but cannot start a concurrent write", async () => {
  const h = hookHarness(); await flush(); h.reads[0].resolve({ ok: true, profile: profile() }); await flush();
  const file = new File(["fixture"], "fixture.png", { type: "image/png" });
  const first = h.render().upload(file);
  h.auth("SIGNED_IN", { user: { id: otherId } }); assert.equal(h.render().profile, null); await flush();
  assert.equal(h.reads.length, 1);
  await h.render().upload(file); assert.equal(h.calls.uploads.length, 1);
  h.upload.resolve({ ok: true, profile: profile() }); await first;
  assert.equal(h.render().profile, null); assert.equal(h.render().message, null); assert.equal(h.render().pending, false);
  await h.render().upload(file); assert.equal(h.calls.uploads.length, 1);
  h.runReloads(); assert.equal(h.calls.reloads, 1);
  h.cleanup?.();
});

test("an initial signed-out session stays neutral and never requests a profile", async () => {
  const h = hookHarness({ initialOwner: null }); await flush();
  assert.equal(h.reads.length, 0); assert.equal(h.render().profile, null); assert.equal(h.render().code, "unauthenticated");
  assert.equal(h.reloadTasks.size, 0); assert.equal(h.calls.reloads, 0); h.cleanup?.();
});

test("signing in from an initialized guest discards the guest document before reading the account photo", async () => {
  const h = hookHarness({ initialOwner: null }); await flush();
  h.auth("SIGNED_IN", { user: { id: ownerId } }); await flush();
  assert.equal(h.reads.length, 0); assert.equal(h.render().profile, null);
  h.runReloads(); assert.equal(h.calls.reloads, 1); h.cleanup?.();
});

test("same-owner SDK events never reload the document", async () => {
  const h = hookHarness(); await flush();
  for (const event of ["TOKEN_REFRESHED", "SIGNED_IN", "USER_UPDATED"]) { h.auth(event); await flush(); }
  assert.equal(h.reloadTasks.size, 0); assert.equal(h.calls.reloads, 0); h.cleanup?.();
});

test("explicit Settings signout navigation wins over the queued auth reload", async () => {
  const h = hookHarness(); await flush(); h.auth("SIGNED_OUT");
  // Settings awaits signOut, then sets the same-origin /signin location before
  // the queued macrotask executes. Do not reload that already navigating page.
  h.location.pathname = "/signin"; h.runReloads();
  assert.equal(h.calls.reloads, 0); assert.equal(h.render().profile, null); h.cleanup?.();
});

test("the explicit signout guard prevents a second navigation while the browser still reports the old pathname", async () => {
  let signOutPending = false;
  const h = hookHarness({ signOutPending: () => signOutPending }); await flush();
  h.reads[0].resolve({ ok: true, profile: profile() }); await flush();
  signOutPending = true; h.auth("SIGNED_OUT"); await flush();
  assert.equal(h.location.pathname, "/settings"); assert.equal(h.reloadTasks.size, 0);
  h.runReloads(); assert.equal(h.calls.reloads, 0); assert.equal(h.render().profile, null);
  assert.equal(h.render().code, "unauthenticated"); h.cleanup?.();
});

test("rapid account changes coalesce and same-owner events cannot render before document reload", async () => {
  const h = hookHarness(); await flush();
  h.auth("SIGNED_IN", { user: { id: otherId } });
  h.auth("SIGNED_IN", { user: { id: ownerId } });
  h.auth("TOKEN_REFRESHED"); await flush();
  assert.equal(h.reloadTasks.size, 1); assert.equal(h.reads.length, 1); assert.equal(h.render().profile, null);
  h.runReloads(); assert.equal(h.calls.reloads, 1); h.cleanup?.();
});

test("effect cleanup cancels queued owner reloads, including a stale callback after StrictMode remount", async () => {
  const h = hookHarness(); await flush(); h.auth("SIGNED_IN", { user: { id: otherId } });
  const staleTask = [...h.reloadTasks.values()][0]; assert.ok(staleTask);
  h.cleanup?.(); assert.equal(h.reloadTasks.size, 0);
  const remountCleanup = h.remountEffect(); await flush(); staleTask();
  assert.equal(h.calls.reloads, 0); assert.equal(h.reloadTasks.size, 0);
  assert.equal(h.reads.length, 2); remountCleanup?.();
});

test("mutation response for a mismatched owner stays neutral instead of rendering another user's image", async () => {
  const h = hookHarness(); await flush(); h.reads[0].resolve({ ok: true, profile: profile() }); await flush();
  const save = h.render().upload(new File(["fixture"], "fixture.png", { type: "image/png" }));
  h.upload.resolve({ ok: true, profile: profile(otherId) }); await save;
  assert.equal(h.render().profile, null); assert.equal(h.render().message, "account_changed"); assert.equal(h.render().status, "error");
  h.cleanup?.();
});

test("restore calls the server-bound owner and changes to Google only after persistence confirmation", async () => {
  const h = hookHarness(); await flush(); h.reads[0].resolve({ ok: true, profile: { ...profile(), source: "custom", photoUrl: "https://project.supabase.co/owned.jpg" } }); await flush();
  const saved = h.render().restore(); assert.deepEqual(h.calls.restores, [ownerId]); assert.equal(h.render().profile?.source, "custom");
  h.restore.resolve({ ok: true, profile: profile() }); await saved;
  assert.equal(h.render().profile?.source, "google"); assert.equal(h.render().message, "restored"); h.cleanup?.();
});

test("unmount cancels stale reads and removes all auth/window listeners", async () => {
  const h = hookHarness(); await flush(); h.cleanup?.(); h.reads[0].resolve({ ok: true, profile: profile() }); await flush();
  assert.equal(h.render().profile, null); assert.equal(h.calls.unsubscribed, 1); assert.equal(h.listeners.size, 0);
});

for (const options of [{ preview: true }, { configured: false }]) {
  test(`preview/unconfigured mode never reads or stores an account photo ${JSON.stringify(options)}`, async () => {
    const h = hookHarness(options); await flush(); assert.equal(h.reads.length, 0); assert.equal(h.render().profile, null); h.cleanup?.();
  });
}

test("private URLs are refreshed on focus before their one-hour expiry", async () => {
  const h = hookHarness(); await flush(); h.reads[0].resolve({ ok: true, profile: profile() }); await flush();
  h.focus(); assert.equal(h.reads.length, 2); h.cleanup?.();
});

for (const locale of LOCALES) {
  test(`${locale}: actual photo editor shows upload, restoration and honest localized failure`, () => {
    const exports = {} as { default: React.ComponentType<Record<string, unknown>> };
    runInNewContext(compile("../components/AccountPhotoEditor.tsx"), {
      exports,
      require(dependency: string) {
        if (dependency === "react") return React;
        if (dependency === "react/jsx-runtime") return jsxRuntime;
        if (dependency === "@/components/I18nProvider") return { useT: () => ({ locale }) };
        if (dependency === "@/lib/i18n/account-photo") return { accountPhotoCopy };
        if (dependency === "./AccountAvatar") return { __esModule: true, default: () => React.createElement("span", { "data-photo": "fixture" }) };
        if (dependency.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
        throw new Error(`Unexpected dependency ${dependency}`);
      },
    });
    const c = accountPhotoCopy(locale);
    const html = renderToStaticMarkup(React.createElement(exports.default, { photo: { profile: { ...profile(), source: "custom" }, status: "ready", pending: false,
      message: "storage_unavailable", code: null, upload: forbidden, restore: forbidden, reload: forbidden } }));
    assert.ok(html.includes(c.upload)); assert.ok(html.includes(c.restore)); assert.ok(html.includes(c.storage_unavailable)); assert.ok(!html.includes(c.saved));
    assert.match(html, /accept="image\/jpeg,image\/png,image\/webp"/); assert.match(html, /role="alert"/);
  });
}

test("Home and Settings use the same avatar component and account-backed hook, not a browser-only override", () => {
  for (const path of ["../app/page.tsx", "../components/screens/SettingsScreen.tsx"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8"); assert.match(source, /<AccountAvatar/); assert.match(source, /useAccountPhoto\(/);
    if (path.includes("SettingsScreen")) assert.match(source, /useAccountPhoto\(\(\) => signOutInFlight\.current\)/);
  }
  const hook = readFileSync(new URL("../components/useAccountPhoto.ts", import.meta.url), "utf8");
  assert.doesNotMatch(hook, /(?:localStorage|sessionStorage)\.(?:getItem|setItem)/);
});

test("actual avatar renders provider photo without leaking a referrer, then falls back after an image failure", () => {
  let failedUrl: string | null = null;
  const exports = {} as { default: (props: { name: string; photoUrl: string | null; size?: number; alt: string; loading?: boolean }) => React.ReactElement<{ children: React.ReactElement }> };
  runInNewContext(compile("../components/AccountAvatar.tsx"), {
    exports,
    require(dependency: string) {
      if (dependency === "react") return { useState: () => [failedUrl, (value: string) => { failedUrl = value; }] };
      if (dependency === "react/jsx-runtime") return jsxRuntime;
      if (dependency === "next/image") return { __esModule: true, default: (props: { src: string; alt: string; width: number; height: number; referrerPolicy: string }) => React.createElement("img", { src: props.src, alt: props.alt, width: props.width, height: props.height, referrerPolicy: props.referrerPolicy }) };
      if (dependency === "@/components/ui/kit") return { Avatar: (props: { name: string }) => React.createElement("span", { "data-avatar-name": props.name }, props.name.charAt(0)) };
      throw new Error(`Unexpected dependency ${dependency}`);
    },
  });
  const props = { name: "fixture@example.invalid", photoUrl: profile().photoUrl, size: 44, alt: "Account photo" };
  const image = exports.default(props);
  const html = renderToStaticMarkup(image);
  assert.match(html, /src="https:\/\/lh3\.googleusercontent\.com\/a\/fixture"/); assert.match(html, /referrerPolicy="no-referrer"/);
  assert.match(html, /width="44"/); assert.match(html, /alt="Account photo"/);
  const onError = (image.props.children.props as { onError: () => void }).onError;
  onError(); const fallback = renderToStaticMarkup(exports.default(props));
  assert.doesNotMatch(fallback, /<img/); assert.match(fallback, /data-avatar-name="fixture@example.invalid"/);
  const changed = renderToStaticMarkup(exports.default({ ...props, photoUrl: "https://project.supabase.co/new-owned.jpg" }));
  assert.match(changed, /<img/); assert.match(changed, /new-owned\.jpg/);
  const loading = renderToStaticMarkup(exports.default({ ...props, loading: true }));
  assert.doesNotMatch(loading, /<img|data-avatar-name/); assert.match(loading, /sl-skel/);
});
