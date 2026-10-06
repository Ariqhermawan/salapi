import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as helpers from "../lib/campaign-media.ts";
import { campaignGalleryCopy } from "../lib/i18n/campaign-gallery.ts";
import { LOCALES } from "../lib/i18n/config.ts";

const owner = "00000000-0000-4000-8000-000000000001", other = "00000000-0000-4000-8000-000000000002";
const wallet = `G${"A".repeat(55)}`, otherWallet = `G${"B".repeat(55)}`;
const photos = Array.from({ length: 3 }, (_, index) => ({ src: `/fixture-${index + 1}.jpg`, width: 1280, height: 720 }));
const baseProps = { campaignId: "101", creatorWallet: wallet, viewer: wallet as string | null, localPreview: false };
const readResult = (overrides: Partial<helpers.CampaignMediaEnvelope> = {}): helpers.CampaignMediaResult => ({
  ok: true, available: true, network: "testnet", contractId: `C${"A".repeat(55)}`, campaignId: "101", creatorWallet: wallet,
  photos, updatedAt: "2026-10-06T00:00:00Z", ownerId: owner, canManage: true, permissionCode: null, ...overrides,
});
const fileBatch = (count = 3) => Array.from({ length: count }, (_, index) => new File([`fixture-${index}`], `photo-${index}.jpg`, { type: "image/jpeg" }));
function compile(path: string) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
async function flush() { for (let index = 0; index < 15; index++) await Promise.resolve(); }
type Session = { user: { id: string } } | null;

// The actual hook executes with isolated React/Supabase/action boundaries. This
// is lifecycle evidence, not authenticated browser or real Storage E2E proof.
function hookHarness({ initialOwner = owner as string | null, configured = true, initialProps = baseProps } = {}) {
  const state: unknown[] = [], refs: { current: unknown }[] = [];
  const effects: { callback: () => void | (() => void); deps: unknown[]; cleanup?: void | (() => void); pending: boolean }[] = [];
  const callbacks: { value: unknown; deps: unknown[] }[] = [];
  let stateCursor = 0, refCursor = 0, effectCursor = 0, callbackCursor = 0;
  let props = initialProps, sessionOwner = initialOwner;
  let authCallback: ((event: string, session: Session) => void) | undefined;
  const listeners = new Map<string, () => void>();
  const reads: { id: string; response: ReturnType<typeof deferred<helpers.CampaignMediaResult>> }[] = [];
  const writes: { id: string; owner: string; data: FormData; response: ReturnType<typeof deferred<helpers.CampaignMediaResult>> }[] = [];
  const calls = { subscriptions: 0, unsubscribed: 0 };
  const exports = {} as typeof import("../components/useD4CampaignMedia");
  const equal = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  runInNewContext(compile("../components/useD4CampaignMedia.ts"), {
    exports, FormData, File, queueMicrotask, window: { addEventListener: (name: string, callback: () => void) => listeners.set(name, callback), removeEventListener: (name: string) => listeners.delete(name) },
    require(dependency: string) {
      if (dependency === "react") return {
        startTransition(callback: () => void) { callback(); },
        useState(initial: unknown) { const index = stateCursor++; if (index >= state.length) state[index] = initial; return [state[index], (value: unknown) => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
        useRef(initial: unknown) { const index = refCursor++; return refs[index] ?? (refs[index] = { current: initial }); },
        useCallback(value: unknown, deps: unknown[]) { const index = callbackCursor++; if (!callbacks[index] || !equal(callbacks[index].deps, deps)) callbacks[index] = { value, deps }; return callbacks[index].value; },
        useEffect(callback: () => void | (() => void), deps: unknown[]) { const index = effectCursor++; if (!effects[index]) effects[index] = { callback, deps, pending: true }; else if (!equal(effects[index].deps, deps)) effects[index] = { ...effects[index], callback, deps, pending: true }; },
      };
      if (dependency === "@/lib/campaign-media") return helpers;
      if (dependency === "@/lib/supabase/env") return { supabaseConfigured: () => configured };
      if (dependency === "@/lib/supabase/client") return { createSupabaseBrowser: () => ({ auth: { onAuthStateChange(callback: typeof authCallback) {
        calls.subscriptions++; authCallback = callback;
        queueMicrotask(() => callback!("INITIAL_SESSION", sessionOwner ? { user: { id: sessionOwner } } : null));
        return { data: { subscription: { unsubscribe() { calls.unsubscribed++; } } } };
      } } }) };
      if (dependency === "@/app/campaign-media-actions") return {
        campaignMedia(id: string) { const response = deferred<helpers.CampaignMediaResult>(); reads.push({ id, response }); return response.promise; },
        saveCampaignMedia(id: string, expectedOwner: string, data: FormData) { const response = deferred<helpers.CampaignMediaResult>(); writes.push({ id, owner: expectedOwner, data, response }); return response.promise; },
      };
      throw new Error(`Unexpected dependency ${dependency}`);
    },
  });
  const render = (nextProps = props) => {
    props = nextProps; stateCursor = refCursor = effectCursor = callbackCursor = 0;
    const result = exports.useD4CampaignMedia(props);
    for (const effect of effects) if (effect.pending) { effect.cleanup?.(); effect.cleanup = effect.callback(); effect.pending = false; }
    return result;
  };
  render();
  return { render, reads, writes, calls, auth(event: string, nextOwner: string | null = event === "SIGNED_OUT" ? null : owner) { sessionOwner = nextOwner; authCallback!(event, nextOwner ? { user: { id: nextOwner } } : null); }, focus: () => listeners.get("focus")?.(), cleanup() { for (const effect of effects) effect.cleanup?.(); } };
}
async function ready(h: ReturnType<typeof hookHarness>, result = readResult()) { await flush(); h.reads.at(-1)!.response.resolve(result); await flush(); return h.render(); }

test("neutral first render waits for browser Auth correlation, server creator/owner read authorizes editor", async () => {
  const h = hookHarness(); assert.equal(h.reads.length, 0); assert.equal(h.render().editOwner, null);
  const state = await ready(h); assert.equal(state.editOwner, owner); assert.equal(state.result?.photos.length, 3); assert.equal(h.writes.length, 0); h.cleanup();
});
test("guest can see public organizer photos, never receives upload controls", async () => {
  const h = hookHarness({ initialOwner: null, initialProps: { ...baseProps, viewer: null } });
  const state = await ready(h, readResult({ ownerId: null, canManage: false, permissionCode: "unauthenticated" }));
  assert.equal(state.result?.photos.length, 3); assert.equal(state.editOwner, null); await state.publish(fileBatch(), true); assert.equal(h.writes.length, 0); h.cleanup();
});
test("mismatched browser/server owner cannot authorize editor, including guest session", async () => {
  for (const initialOwner of [owner, null]) {
    const h = hookHarness({ initialOwner }); const state = await ready(h, readResult({ ownerId: other }));
    assert.equal(state.editOwner, null); assert.equal(state.code, "account_changed"); assert.equal(state.result?.ownerId, null); await state.publish(fileBatch(), true); assert.equal(h.writes.length, 0); h.cleanup();
  }
});
test("viewer hint or creator hint alone cannot authorize uploads", async () => {
  for (const result of [readResult({ canManage: false, permissionCode: "not_creator" }), readResult({ creatorWallet: otherWallet })]) {
    const h = hookHarness(); const state = await ready(h, result); assert.equal(state.editOwner, null); await state.publish(fileBatch(), true); assert.equal(h.writes.length, 0); h.cleanup();
  }
  const h = hookHarness({ initialProps: { ...baseProps, viewer: otherWallet } }); assert.equal((await ready(h)).editOwner, null); h.cleanup();
});
test("missing Storage configuration stays honest rather than falsely claiming an account change", async () => {
  const h = hookHarness(); const failure = { ...readResult(), ok: false, available: false, ownerId: null, creatorWallet: null, photos: [], canManage: false, code: "not_configured" } as helpers.CampaignMediaResult;
  const state = await ready(h, failure); assert.equal(state.code, "not_configured"); assert.equal(state.editOwner, null); assert.equal(state.result?.photos.length, 0); h.cleanup();
});
test("campaign change suppresses old public photos and late reads without showing old creator controls", async () => {
  const h = hookHarness(); await flush(); const first = h.reads[0];
  const neutral = h.render({ ...baseProps, campaignId: "102" }); assert.equal(neutral.result, null); assert.equal(neutral.editOwner, null);
  await flush(); h.reads.at(-1)!.response.resolve(readResult({ campaignId: "102", photos: [] })); await flush();
  first.response.resolve(readResult()); await flush(); const state = h.render(); assert.equal(state.result?.campaignId, "102"); assert.equal(state.result?.photos.length, 0); h.cleanup();
});
test("wrong campaign response cannot populate a requested gallery", async () => {
  const h = hookHarness(); const state = await ready(h, readResult({ campaignId: "102" })); assert.equal(state.result, null); assert.equal(state.code, "unavailable"); h.cleanup();
});
test("publication requires3..6preparedphotos and explicit public consent, never invokes financial actions", async () => {
  const h = hookHarness(); await ready(h);
  await h.render().publish(fileBatch(2), true); assert.equal(h.render().message, "invalid_photos");
  await h.render().publish(fileBatch(3), false); assert.equal(h.render().message, "ack_required");
  await h.render().publish(fileBatch(7), true);
  assert.equal(h.writes.length, 0); h.cleanup();
});
test("one bound publication, no success until actual response, updates from returned photos only", async () => {
  const h = hookHarness(); const state = await ready(h), selected = fileBatch();
  const first = state.publish(selected, true); await state.publish(selected, true);
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].id, "101"); assert.equal(h.writes[0].owner, owner);
  assert.equal(h.writes[0].data.getAll("photos").length, 3); assert.equal(h.writes[0].data.get("publicAcknowledged"), "true");
  assert.equal(h.render().pending, true); assert.equal(h.render().message, null);
  const published = photos.map((photo, index) => ({ ...photo, src: `/published-${index}.jpg` })); h.writes[0].response.resolve(readResult({ photos: published }));
  assert.equal(await first, true); assert.equal(h.render().message, "saved"); assert.equal(h.render().result?.photos[0].src, "/published-0.jpg"); assert.equal(h.render().pending, false); h.cleanup();
});
test("same-owner TOKEN_REFRESHED cannot unlock a pending publication or erase its saved result", async () => {
  const h = hookHarness(); await ready(h); const save = h.render().publish(fileBatch(), true);
  h.auth("TOKEN_REFRESHED"); await flush(); assert.equal(h.render().pending, true); assert.equal(h.reads.length, 1); await h.render().publish(fileBatch(), true); assert.equal(h.writes.length, 1);
  h.writes[0].response.resolve(readResult()); assert.equal(await save, true); assert.equal(h.render().message, "saved"); h.cleanup();
});
test("sign-out clears editor and suppresses a late save response", async () => {
  const h = hookHarness(); await ready(h); const save = h.render().publish(fileBatch(), true);
  h.auth("SIGNED_OUT"); assert.equal(h.render().editOwner, null); assert.equal(h.render().result, null); assert.equal(h.render().pending, false);
  h.writes[0].response.resolve(readResult()); assert.equal(await save, false); assert.equal(h.render().message, null); h.cleanup();
});
test("owner change suppresses old save and retains physical single-write guard", async () => {
  const h = hookHarness(); await ready(h); const save = h.render().publish(fileBatch(), true);
  h.auth("SIGNED_IN", other); await flush(); h.reads.at(-1)!.response.resolve(readResult({ ownerId: other })); await flush();
  assert.equal(h.render().editOwner, other); await h.render().publish(fileBatch(), true); assert.equal(h.writes.length, 1);
  h.writes[0].response.resolve(readResult()); assert.equal(await save, false); assert.equal(h.render().message, null); assert.equal(h.render().editOwner, other); h.cleanup();
});
test("latest mismatched-owner save result is rejected with no fabricated success", async () => {
  const h = hookHarness(); await ready(h); const save = h.render().publish(fileBatch(), true);
  h.writes[0].response.resolve(readResult({ ownerId: other })); assert.equal(await save, false); assert.equal(h.render().editOwner, null); assert.equal(h.render().result, null); assert.equal(h.render().message, "account_changed"); h.cleanup();
});
test("publication error preserves previous real gallery without displaying success", async () => {
  const h = hookHarness(); await ready(h); const save = h.render().publish(fileBatch(), true);
  h.writes[0].response.resolve({ ...readResult(), ok: false, available: false, code: "save_failed" }); assert.equal(await save, false);
  assert.equal(h.render().result?.photos[0].src, photos[0].src); assert.equal(h.render().message, "save_failed"); assert.equal(h.render().pending, false); h.cleanup();
});
test("unmount cancels stale reads and removes auth/focus listeners", async () => {
  const h = hookHarness(); await flush(); h.cleanup(); h.reads[0].response.resolve(readResult()); await flush(); assert.equal(h.render().result, null); assert.equal(h.calls.unsubscribed, 1);
});
test("local preview never reads or publishes server media even with organizer viewer", async () => {
  const h = hookHarness({ initialProps: { ...baseProps, localPreview: true } }); await flush(); await h.render().publish(fileBatch(), true); assert.equal(h.reads.length, 0); assert.equal(h.writes.length, 0); assert.equal(h.calls.subscriptions, 0); h.cleanup();
});

type HookState = ReturnType<typeof import("../components/useD4CampaignMedia").useD4CampaignMedia>;
const forbidden = () => { throw new Error("Unexpected external boundary"); };
function componentHarness(locale: typeof LOCALES[number], state: Partial<HookState> = {}) {
  const states: unknown[] = [], refs: { current: unknown }[] = [];
  let stateCursor = 0, refCursor = 0;
  const exports = {} as { default: (props: React.ComponentProps<typeof import("../components/D4CampaignGallery").default>) => React.ReactElement };
  runInNewContext(compile("../components/D4CampaignGallery.tsx"), { exports, File, URL, queueMicrotask,
    require(dependency: string) {
      if (dependency === "react") return { ...React, useEffect: () => {}, useState(initial: unknown) { const index = stateCursor++; if (index >= states.length) states[index] = initial; return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; }, useRef(initial: unknown) { const index = refCursor++; return refs[index] ?? (refs[index] = { current: initial }); } };
      if (dependency === "react/jsx-runtime") return jsxRuntime;
      if (dependency === "next/image") return { __esModule: true, default: (props: { src: string; alt: string; onError?: () => void }) => React.createElement("img", { src: props.src, alt: props.alt }) };
      if (dependency === "@/components/I18nProvider") return { useT: () => ({ locale }) };
      if (dependency === "@/lib/i18n/campaign-gallery") return { campaignGalleryCopy };
      if (dependency === "@/lib/campaign-media") return helpers;
      if (dependency === "@/lib/ui/campaign-photo-preparation") return { prepareCampaignPhotos: forbidden, CampaignPhotoPreparationError: Error };
      if (dependency === "./useD4CampaignMedia") return { useD4CampaignMedia: () => ({ key: "fixture", result: null, editOwner: null, status: "ready", pending: false, message: null, code: null, reload: forbidden, publish: forbidden, ...state }) };
      if (dependency.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
      throw new Error(`Unexpected dependency ${dependency}`);
    },
  });
  return { render(props: React.ComponentProps<typeof import("../components/D4CampaignGallery").default> = baseProps) { stateCursor = refCursor = 0; return exports.default(props); } };
}
function elements(tree: unknown): React.ReactElement<Record<string, unknown>>[] {
  if (!React.isValidElement<Record<string, unknown>>(tree)) return Array.isArray(tree) ? tree.flatMap(elements) : [];
  return [tree, ...elements(tree.props.children)];
}
for (const locale of LOCALES) {
  test(`${locale}: live missing-media gallery is honest, no AI photos or upload button`, () => {
    const h = componentHarness(locale), c = campaignGalleryCopy(locale);
    const html = renderToStaticMarkup(h.render()); assert.ok(html.includes(c.empty)); assert.ok(html.includes(c.publicHint)); assert.ok(!html.includes(c.demoLabel)); assert.ok(!html.includes(c.choose));
  });
  test(`${locale}: organizer editor renders consent and disabled publish until at least3 photos prepared`, () => {
    const h = componentHarness(locale, { editOwner: owner, result: readResult() }), c = campaignGalleryCopy(locale), tree = h.render();
    const nodes = elements(tree); const publish = nodes.find(node => node.type === "button" && node.props.children === c.editor)!;
    assert.equal(publish.props.disabled, true);
    const input = nodes.find(node => node.type === "input" && node.props.type === "file")!;
    assert.equal(input.props.multiple, true); assert.equal(input.props.accept, "image/jpeg,image/png,image/webp");
    const html = renderToStaticMarkup(tree); assert.ok(html.includes(c.consent)); assert.ok(html.includes(c.publicLabel)); assert.ok(!html.includes(c.demoLabel));
  });
}
test("actual gallery renders3thumbnailimages and cycles arrows/keyboard rather than repeating hero only", () => {
  const h = componentHarness("en", { result: readResult(), editOwner: null }), c = campaignGalleryCopy("en");
  let nodes = elements(h.render()); assert.equal(nodes.filter(node => node.type === "button" && typeof node.props["aria-label"] === "string" && String(node.props["aria-label"]).startsWith(c.thumbnail)).length, 3);
  const next = nodes.find(node => node.props["aria-label"] === c.next)!; (next.props.onClick as () => void)();
  nodes = elements(h.render()); const group = nodes.find(node => node.props.role === "group")!; assert.equal(group.props["aria-label"], `${c.photo} 2 / 3`);
  let prevented = false; (group.props.onKeyDown as (event: unknown) => void)({ key: "End", preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(elements(h.render()).find(node => node.props.role === "group")!.props["aria-label"], `${c.photo} 3 / 3`);
});
test("local examples label AI honestly; live gallery ignores illustrative fallback supplied accidentally", () => {
  const examples = photos.map(photo => ({ src: photo.src, alt: "Demo illustration" }));
  const c = campaignGalleryCopy("en");
  const local = componentHarness("en"); const localHtml = renderToStaticMarkup(local.render({ ...baseProps, localPreview: true, examplePhotos: examples })); assert.ok(localHtml.includes(c.demoLabel)); assert.ok(localHtml.includes(c.localOnly));
  const live = componentHarness("en"); const html = renderToStaticMarkup(live.render({ ...baseProps, examplePhotos: examples })); assert.ok(html.includes(c.empty)); assert.ok(!html.includes("Demo illustration"));
});
test("gallery CSS keeps actual thumbnail hit targets at least44px and respects reduced motion", () => {
  const css = readFileSync(new URL("../components/D4CampaignGallery.module.css", import.meta.url), "utf8"); assert.match(css, /\.thumbnail\{[^}]*min-width:44px;min-height:44px/); assert.match(css, /prefers-reduced-motion:no-preference/);
});

// Exercise the actual component's asynchronous file selection and blob lifetime,
// not only its static markup. Preparation/server remain explicit test doubles.
function editorHarness() {
  const states: unknown[] = [], refs: { current: unknown }[] = [];
  const effects: { deps: unknown[]; callback: () => void | (() => void); cleanup?: void | (() => void); pending: boolean }[] = [];
  let stateCursor = 0, refCursor = 0, effectCursor = 0;
  let editOwner: string | null = owner;
  const preparations: { files: File[]; response: ReturnType<typeof deferred<File[]>> }[] = [];
  const publications: { files: readonly File[]; consent: boolean; response: ReturnType<typeof deferred<boolean>> }[] = [];
  const created: string[] = [], revoked: string[] = [];
  const exports = {} as { default: (props: typeof baseProps) => React.ReactElement };
  runInNewContext(compile("../components/D4CampaignGallery.tsx"), { exports, File, queueMicrotask,
    URL: { createObjectURL() { const url = `blob:fixture-${created.length + 1}`; created.push(url); return url; }, revokeObjectURL(url: string) { revoked.push(url); } },
    require(dependency: string) {
      if (dependency === "react") return { ...React,
        useState(initial: unknown) { const index = stateCursor++; if (index >= states.length) states[index] = initial; return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; },
        useRef(initial: unknown) { const index = refCursor++; return refs[index] ?? (refs[index] = { current: initial }); },
        useEffect(callback: () => void | (() => void), deps: unknown[]) { const index = effectCursor++; if (!effects[index]) effects[index] = { deps, callback, pending: true }; else if (deps.length !== effects[index].deps.length || deps.some((value, i) => !Object.is(value, effects[index].deps[i]))) effects[index] = { ...effects[index], deps, callback, pending: true }; },
      };
      if (dependency === "react/jsx-runtime") return jsxRuntime;
      if (dependency === "next/image") return { __esModule: true, default: "img" };
      if (dependency === "@/components/I18nProvider") return { useT: () => ({ locale: "en" }) };
      if (dependency === "@/lib/i18n/campaign-gallery") return { campaignGalleryCopy };
      if (dependency === "@/lib/campaign-media") return helpers;
      if (dependency === "@/lib/ui/campaign-photo-preparation") return { CampaignPhotoPreparationError: Error,
        prepareCampaignPhotos(files: File[]) { const response = deferred<File[]>(); preparations.push({ files, response }); return response.promise; } };
      if (dependency === "./useD4CampaignMedia") return { useD4CampaignMedia: () => ({ key: "fixture", editOwner, result: readResult(), status: "ready", pending: false, message: null, code: null, reload: forbidden,
        publish(files: readonly File[], consent: boolean) { const response = deferred<boolean>(); publications.push({ files, consent, response }); return response.promise; } }) };
      if (dependency.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
      throw new Error(`Unexpected dependency ${dependency}`);
    },
  });
  const render = () => {
    stateCursor = refCursor = effectCursor = 0; const tree = exports.default(baseProps);
    for (const effect of effects) if (effect.pending) { effect.cleanup?.(); effect.cleanup = effect.callback(); effect.pending = false; }
    return tree;
  };
  render();
  const c = campaignGalleryCopy("en");
  return { render, preparations, publications, created, revoked,
    select(files = fileBatch()) { const node = elements(render()).find(item => item.type === "input" && item.props.type === "file")!; (node.props.onChange as (event: unknown) => void)({ currentTarget: { files, value: "fixture" } }); },
    consent() { const node = elements(render()).find(item => item.type === "input" && item.props.type === "checkbox")!; (node.props.onChange as (event: unknown) => void)({ currentTarget: { checked: true } }); },
    publish() { const node = elements(render()).find(item => item.type === "button" && item.props.children === c.editor)!; (node.props.onClick as () => void)(); },
    changeOwner(next: string | null) { editOwner = next; render(); },
    cleanup() { for (const effect of effects) effect.cleanup?.(); },
  };
}
test("actual editor shows selected image previews, requires consent, and releases blobs after confirmed publication", async () => {
  const h = editorHarness(); await flush(); h.select(); assert.equal(h.preparations.length, 1);
  h.preparations[0].response.resolve(fileBatch()); await flush(); assert.equal(h.created.length, 3);
  let tree = h.render(); const c = campaignGalleryCopy("en");
  assert.equal(elements(tree).filter(node => node.props.src && String(node.props.src).startsWith("blob:")).length, 3);
  assert.equal(elements(tree).find(node => node.type === "button" && node.props.children === c.editor)!.props.disabled, true);
  h.publish(); await flush(); assert.equal(h.publications.length, 0);
  h.consent(); h.publish(); assert.equal(h.publications.length, 1); assert.equal(h.publications[0].consent, true); assert.equal(h.revoked.length, 0);
  h.publications[0].response.resolve(true); await flush(); tree = h.render();
  assert.equal(elements(tree).filter(node => node.props.src && String(node.props.src).startsWith("blob:")).length, 0); assert.equal(h.revoked.length, 3); h.cleanup();
});
test("actual editor does not clear selected previews after unconfirmed publication", async () => {
  const h = editorHarness(); await flush(); h.select(); h.preparations[0].response.resolve(fileBatch()); await flush(); h.consent(); h.publish();
  h.publications[0].response.resolve(false); await flush(); assert.equal(h.revoked.length, 0);
  assert.equal(elements(h.render()).filter(node => node.props.src && String(node.props.src).startsWith("blob:")).length, 3); h.cleanup(); assert.equal(h.revoked.length, 3);
});
test("changing account during preparation never creates previews for the previous owner", async () => {
  const h = editorHarness(); await flush(); h.select(); h.changeOwner(other); await flush();
  h.preparations[0].response.resolve(fileBatch()); await flush(); assert.equal(h.created.length, 0); assert.equal(h.publications.length, 0); h.cleanup();
});
test("changing account immediately hides/revokes old selection and invalidates pending publication UI", async () => {
  const h = editorHarness(); await flush(); h.select(); h.preparations[0].response.resolve(fileBatch()); await flush(); h.consent(); h.publish();
  h.changeOwner(other); assert.equal(elements(h.render()).filter(node => node.props.src && String(node.props.src).startsWith("blob:")).length, 0); await flush(); assert.equal(h.revoked.length, 3);
  h.publications[0].response.resolve(true); await flush(); assert.equal(h.revoked.length, 3); h.cleanup();
});
test("unmount during preparation suppresses late selection and double selection starts one preparation", async () => {
  const h = editorHarness(); await flush(); h.select(); h.select(); assert.equal(h.preparations.length, 1);
  h.cleanup(); h.preparations[0].response.resolve(fileBatch()); await flush(); assert.equal(h.created.length, 0); assert.equal(h.publications.length, 0);
});
