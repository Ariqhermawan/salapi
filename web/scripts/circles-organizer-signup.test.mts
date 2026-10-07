import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { CURRENCY, formatLocal, formatLocalAmount, localAmount, pesoFromLocal } from "../lib/ui/currency.ts";
import { isLocale } from "../lib/i18n/config.ts";
import * as revampCircles from "../lib/i18n/revamp-circles.ts";
import * as draftGallery from "../lib/ui/circle-draft-gallery.ts";
import { CATEGORY_LABEL } from "../lib/circles/types.ts";
import type { SignupIdentityState } from "../lib/ui/useCirclesSignupIdentity.ts";

type Element = { type: string; props: Record<string, unknown> };
const code = ts.transpileModule(readFileSync(new URL("../components/screens/CirclesCreateScreen.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  if (value && typeof value === "object" && "props" in value) return text((value as Element).props.children);
  return "";
}

// The real component and handlers execute with isolated hooks and in-memory
// draft storage. No browser, credential, Supabase SDK or network can run here.
function setup(options: { preview?: boolean; identity?: SignupIdentityState; result?: { ok: boolean; error?: string; kind?: string; persisted?: boolean }; throws?: boolean; storageMode?: "normal" | "blocked" | "drop" | "tamper" | "readback-error"; previous?: string; phase?: "server" | "hydrate" | "client" } = {}) {
  const states: unknown[] = [];
  let phase = options.phase ?? "client";
  let cursor = 0;
  const transitions: Promise<unknown>[] = [];
  const memory = new Map<string, string>();
  if (options.previous) memory.set("salapi.circles.draft.v1", options.previous);
  let writes = 0;
  let reads = 0;
  const payloads: unknown[] = [];
  const downloads: string[] = [];
  const component = {} as { default(): Element };
  const icons = new Proxy({}, { get: () => () => null });
  const jsx = (type: unknown, props: Record<string, unknown>) => typeof type === "function" ? type(props) : ({ type: String(type), props });
  const signupEmail = {} as { default(props: unknown): Element };
  runInNewContext(ts.transpileModule(readFileSync(new URL("../components/CirclesSignupEmail.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports: signupEmail, require(name: string) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (name === "@/components/I18nProvider") return { useT: () => ({ locale: "en" }) };
    if (name === "@/lib/i18n/revamp-circles") return revampCircles;
    if (name.endsWith(".module.css")) return { default: {} };
    throw Error(`Unexpected signup field dependency: ${name}`);
  } });
  const forbidden = () => { throw new Error("External side effects are forbidden in isolated signup tests"); };
  runInNewContext(code, {
    exports: component, fetch: forbidden,
    Blob: class { parts: string[]; constructor(parts: string[]) { this.parts = parts; } },
    URL: { createObjectURL(blob: { parts: string[] }) { downloads.push(blob.parts.join("")); return "blob:isolated-draft"; }, revokeObjectURL() {} },
    document: { createElement(tag: string) { assert.equal(tag, "a"); return { click() {} }; } },
    localStorage: {
      getItem(key: string) {
        reads++;
        if (options.storageMode === "blocked" || (options.storageMode === "readback-error" && reads === 2)) throw Error("Isolated storage read denied");
        return memory.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        writes++;
        if (options.storageMode === "blocked") throw Error("Isolated storage write denied");
        if (options.storageMode === "drop") return;
        memory.set(key, options.storageMode === "tamper" && writes === 1 ? value + "tampered" : value);
      },
      removeItem(key: string) { memory.delete(key); },
    },
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react") return {
        useSyncExternalStore(_subscribe: unknown, clientSnapshot: () => unknown, serverSnapshot: () => unknown) { return phase === "client" ? clientSnapshot() : serverSnapshot(); },
        useState(initial: unknown) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; },
        useRef(initial: unknown) { const index = cursor++; if (!(index in states)) states[index] = { current: initial }; return states[index]; },
        useTransition: () => [false, (action: () => Promise<unknown>) => transitions.push(action())],
      };
      if (name === "next/link") return { default: "Link" };
      if (name === "@/components/ui/kit") return { Ico: icons, T: {}, Btn: "Btn", PoweredByStellar: "PoweredByStellar" };
      if (name === "@/components/I18nProvider") return { useT: () => ({ currency: "en", locale: "en" }) };
      if (name === "@/lib/i18n/revamp-circles") return revampCircles;
      if (name === "@/components/CirclesSignupEmail") return signupEmail;
      if (name === "@/lib/ui/useCirclesSignupIdentity") return { useCirclesSignupIdentity: () => ({ identity: options.identity ?? { status: "guest" }, refresh: () => {}, captureOwnerRevision: () => 0, isCurrentOwner: () => true }) };
      if (name === "@/lib/ui/circle-draft-gallery") return draftGallery;
      if (name === "@/lib/ui/currency") return { CURRENCY, formatLocalAmount, localAmount, pesoFromLocal };
      if (name === "@/lib/i18n/config") return { isLocale };
      if (name === "@/lib/circles/types") return { CATEGORY_LABEL };
      if (name === "@/lib/local-preview") return { isLocalPreview: options.preview ?? true };
      if (name === "@/lib/ui/useGoBack") return { useGoBack: () => forbidden };
      if (name.endsWith(".module.css")) return { default: {} };
      if (name === "@/app/actions") return { async joinCirclesWaitlist(payload: unknown) { payloads.push(payload); if (options.throws) throw Error("Isolated interrupted request"); return options.result ?? { ok: true, kind: "launch-subscription", persisted: true }; } };
      throw Error(`Unexpected component dependency: ${name}`);
    },
  });
  const render = () => { cursor = 0; return component.default(); };
  let tree = render();
  function input(id: string, value: string) {
    const node = nodes(tree).find(node => node.props.id === id);
    assert.ok(node, `Missing field ${id}`);
    (node.props.onChange as (event: unknown) => void)({ target: { value } }); tree = render();
  }
  function check(label: string, checked = true) {
    const field = nodes(tree).find(node => node.type === "label" && text(node).includes(label));
    assert.ok(field, `Missing acknowledgement ${label}`);
    const node = nodes(field).find(node => node.type === "input" && node.props.type === "checkbox")!;
    (node.props.onChange as (event: unknown) => void)({ target: { checked } }); tree = render();
  }
  function click(label: string) {
    const node = nodes(tree).find(node => node.type === "Btn" && text(node).trim() === label);
    assert.ok(node, `Missing button ${label}`);
    (node.props.onClick as () => void)(); tree = render();
  }
  async function submit(times = 1) {
    const form = nodes(tree).find(node => node.type === "form"); assert.ok(form, "Missing optional signup form");
    for (let i = 0; i < times; i++) (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} });
    while (transitions.length) await Promise.all(transitions.splice(0)); tree = render();
  }
  function save() {
    input("circle-draft-title", "Our barangay library");
    input("circle-draft-story", "A fictional local library idea with books and shelves, not a published cause.");
    click("Continue"); input("circle-draft-goal", "10.00"); click("Continue"); click("Continue");
    check("Save this concept on this device only"); click("Save complete browser draft");
  }
  return { input, check, click, submit, save, memory, payloads, downloads, setPhase(next: typeof phase) { phase = next; tree = render(); }, get tree() { return tree; } };
}

test("SSR and first hydration keep all draft controls disabled; committed handlers unlock without editing storage", () => {
  const screen = setup({ phase: "server" });
  const fields = () => nodes(screen.tree).find(node => node.props["data-testid"] === "circle-draft-fields");
  for (const phase of ["server", "hydrate"] as const) {
    screen.setPhase(phase);
    assert.equal(fields()?.type, "fieldset"); assert.equal(fields()?.props.disabled, true);
    assert.equal(fields()?.props["aria-busy"], true);
    assert.ok(nodes(fields()).some(node => node.props.id === "circle-draft-title"));
    assert.ok(nodes(fields()).some(node => node.props.id === "circle-draft-story"));
    assert.ok(nodes(fields()).some(node => node.props.id === "circle-draft-category"));
    for (const label of ["Restore last browser draft", "Continue"]) assert.ok(nodes(fields()).some(node => node.type === "Btn" && text(node).trim() === label));
    assert.equal(screen.memory.size, 0); assert.equal(screen.payloads.length, 0);
  }
  screen.setPhase("client");
  assert.equal(fields()?.props.disabled, false); assert.equal(fields()?.props["aria-busy"], false);
  completeCause(screen, "animals");
  assert.equal(nodes(screen.tree).find(node => node.props.id === "circle-draft-photo-0")?.props.value, draftGallery.defaultDraftGallery("animals")[0].src);
  assert.equal(screen.memory.size, 0); assert.equal(screen.payloads.length, 0);
});

test("saving a complete browser draft never automatically submits organizer details", () => {
  for (const preview of [false, true]) {
    const screen = setup({ preview }); screen.save();
    assert.equal(screen.payloads.length, 0);
    const draft = JSON.parse([...screen.memory.values()][0]);
    assert.equal(draft.title, "Our barangay library"); assert.equal(draft.target.pesoEquivalent, 580);
    assert.equal(draft.publication, "browser-draft-only"); assert.equal("email" in draft, false);
    assert.ok(nodes(screen.tree).some(node => node.props["aria-label"] === "Optional organizer launch signup"));
  }
});

test("organizer draft bridge labels example escrow only in local preview", () => {
  for (const preview of [false, true]) {
    const screen = setup({ preview });
    const bridge = nodes(screen.tree).find(node => node.type === "Link" && node.props.href === "/campaigns?mode=testnet");
    assert.ok(bridge);
    if (preview) { assert.match(text(bridge), /D4 example campaign.*simulated escrow.*No transactions/); assert.doesNotMatch(text(bridge), /real Testnet escrow/); }
    else assert.match(text(bridge), /current Testnet campaign.*real Testnet escrow/);
    screen.save();
    assert.ok(nodes(screen.tree).some(node => node.type === "Link" && text(node).includes(preview ? "Go to D4 example campaigns" : "Go to live Testnet campaigns")));
  }
});

test("local organizer signup stays explicit and never calls the server action", async () => {
  const screen = setup({ preview: true }); screen.save();
  screen.input("circle-organizer-launch-email", "organizer@example.com");
  screen.check("Try the signup example locally"); await screen.submit();
  assert.equal(screen.payloads.length, 0);
  assert.match(text(screen.tree), /No email was submitted or saved/);
  assert.equal(JSON.stringify([...screen.memory.values()]).includes("organizer@example.com"), false);
});

test("live optional signup preserves the baseline lead payload after explicit consent", async () => {
  const screen = setup({ preview: false }); screen.save();
  screen.input("circle-organizer-launch-email", " organizer@example.com ");
  screen.check("Send my email and the draft title"); await screen.submit(2);
  assert.equal(screen.payloads.length, 1, "Guard duplicate handler invocations, not only disabled UI");
  assert.deepEqual(JSON.parse(JSON.stringify(screen.payloads[0])), {
    email: "organizer@example.com", circleId: "draft:our-barangay-library", locale: "en", pesoPledge: 580, anonymous: false, notifyOk: true, marketingOk: false,
  });
  assert.match(text(screen.tree), /organizer launch subscription is saved/);
});

test("invalid email and missing consent fail before any server invocation", async () => {
  const screen = setup({ preview: false }); screen.save();
  screen.input("circle-organizer-launch-email", "invalid"); screen.check("Send my email and the draft title"); await screen.submit();
  assert.equal(screen.payloads.length, 0); assert.match(text(screen.tree), /Enter a valid email/);
  screen.input("circle-organizer-launch-email", "organizer@example.com"); screen.check("Send my email and the draft title", false); await screen.submit();
  assert.equal(screen.payloads.length, 0); assert.match(text(screen.tree), /Consent to the optional/);
});

test("rejected or interrupted signup keeps the draft and does not claim success", async () => {
  for (const options of [{ result: { ok: false, error: "Isolated server rejection" } }, { throws: true }]) {
    const screen = setup({ preview: false, ...options }); screen.save();
    screen.input("circle-organizer-launch-email", "organizer@example.com"); screen.check("Send my email and the draft title"); await screen.submit();
    assert.equal(screen.memory.size, 1); assert.equal(screen.payloads.length, 1);
    assert.ok(nodes(screen.tree).some(node => node.props.role === "alert"));
    assert.doesNotMatch(text(screen.tree), /organizer launch subscription is saved/);
  }
});

test("organizer manage bridge describes simulated escrow in preview and preserves live wording otherwise", () => {
  const manageCode = ts.transpileModule(readFileSync(new URL("../components/screens/CircleManageScreen.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  for (const preview of [false, true]) {
    const component = {} as { default(props: unknown): Element };
    const jsx = (type: unknown, props: Record<string, unknown>) => ({ type: String(type), props });
    const icons = new Proxy({}, { get: () => () => null });
    runInNewContext(manageCode, { exports: component, require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react") return { useState: (initial: unknown) => [initial, () => {}] };
      if (name === "next/link") return { default: "Link" };
      if (name === "@/components/ui/kit") return { Ico: icons, T: {}, Btn: "Btn", PoweredByStellar: "PoweredByStellar" };
      if (name === "@/components/I18nProvider") return { useT: () => ({ currency: "en" }) };
      if (name === "@/lib/i18n/revamp-circles") return revampCircles;
      if (name === "@/lib/ui/currency") return { formatLocal };
      if (name === "@/lib/local-preview") return { isLocalPreview: preview };
      if (name === "@/lib/ui/useGoBack") return { useGoBack: () => () => { throw Error("Navigation is outside isolated manage rendering"); } };
      if (name.endsWith(".module.css")) return { default: {} };
      throw Error(`Unexpected manage dependency: ${name}`);
    } });
    const tree = component.default({ circle: { id: "example", title: "Example cause", pesoRaised: 100, allowance: { percentage: 0 } } });
    const bridge = nodes(tree).find(node => node.type === "Link" && node.props.href === "/campaigns?mode=testnet");
    assert.ok(bridge);
    if (preview) { assert.match(text(bridge), /Explore D4 example campaigns.*simulated escrow.*No transactions/); assert.doesNotMatch(text(bridge), /live Testnet|actual D4 escrow/); }
    else assert.match(text(bridge), /Manage live Testnet campaigns.*actual D4 escrow/);
  }
});

test("Circles headers use actual-entry Back with canonical destinations only as cold-entry fallbacks", () => {
  const detail = readFileSync(new URL("../components/screens/CircleDetailScreen.tsx", import.meta.url), "utf8");
  assert.match(detail, /const goBack = useGoBack\("\/circles"\)/);
  assert.match(detail, /onClick=\{goBack\}[^\n]*c\("Back"\)/);
  assert.doesNotMatch(detail, /onClick=\{\(\) => router\.push\("\/circles"\)\}/);
  const donate = readFileSync(new URL("../components/screens/CirclesDonateScreen.tsx", import.meta.url), "utf8");
  assert.match(donate, /const goBack = useGoBack\(`\/circles\/\$\{circle\.id\}`\)/);
  assert.match(donate, /onClick=\{backFromPhase\}/);
  assert.match(donate, /phase === "review" \|\| phase === "waitlist"/);
  assert.match(donate, /setPhase\("amount"\)/);
  const organizer = readFileSync(new URL("../components/screens/CirclesOrganizerScreen.tsx", import.meta.url), "utf8");
  assert.match(organizer, /const goBack = useGoBack\(causePath\)/);
  assert.match(organizer, /onClick=\{goBack\}/);
  assert.match(organizer, /href=\{causePath\}>View example cause/);
  assert.match(organizer, /href="\/circles">Browse Circles/);
  const create = readFileSync(new URL("../components/screens/CirclesCreateScreen.tsx", import.meta.url), "utf8");
  assert.match(create, /const goBack = useGoBack\("\/circles"\)/);
  assert.match(create, /onClick=\{goBack\}/);
  const manage = readFileSync(new URL("../components/screens/CircleManageScreen.tsx", import.meta.url), "utf8");
  assert.match(manage, /const goBack = useGoBack\(`\/circles\/\$\{circle\.id\}`\)/);
  assert.match(manage, /onClick=\{goBack\}/);
});

const previousDraft = JSON.stringify({
  version: 1, savedAt: "2026-10-01T00:00:00.000Z", title: "Previous library draft",
  story: "A previous fictional library draft with shelves and learning supplies.", category: "community",
  target: { localValue: "20.00", currency: "en", pesoEquivalent: 1160 }, durationDays: 60,
  cover: "/circles/disaster.jpg", allowance: { percentage: 0, conceptAcknowledged: false },
  organizerVerification: "not-performed", publication: "browser-draft-only",
});

test("blocked or silently dropped draft storage retains complete memory draft and explicit signup", async () => {
  for (const storageMode of ["blocked", "drop"] as const) for (const preview of [false, true]) {
    const screen = setup({ preview, storageMode, previous: previousDraft }); screen.save();
    assert.equal(screen.memory.get("salapi.circles.draft.v1"), previousDraft);
    assert.equal(screen.payloads.length, 0, "Preparing an unsaved draft never submits a lead");
    assert.match(text(screen.tree), /Complete draft prepared, not saved/);
    assert.doesNotMatch(text(screen.tree), /Complete draft saved in this browser|Your complete draft is saved on this device/);
    assert.ok(nodes(screen.tree).some(node => node.props.role === "alert" && text(node).includes("optional signup is still available")));
    screen.click("Download draft JSON");
    const draft = JSON.parse(screen.downloads[0]);
    assert.equal(draft.title, "Our barangay library"); assert.match(draft.story, /fictional local library/);
    assert.equal(draft.category, "community"); assert.equal(draft.target.localValue, "10.00");
    assert.equal(draft.target.currency, "en"); assert.equal(draft.target.pesoEquivalent, 580);
    assert.equal(draft.durationDays, 30); assert.equal(draft.cover, draftGallery.defaultDraftGallery("community")[0].src);
    assert.equal(draft.gallery.length, 3); assert.equal(new Set(draft.gallery.map((photo: { src: string }) => photo.src)).size, 3);
    assert.equal(draft.cover, draft.gallery[0].src);
    assert.equal(draft.allowance.percentage, 0); assert.equal(draft.publication, "browser-draft-only");
    assert.equal("email" in draft, false);
    screen.input("circle-organizer-launch-email", "qa@example.invalid");
    await screen.submit(); assert.equal(screen.payloads.length, 0, "Memory-only draft still requires explicit consent");
    screen.check(preview ? "Try the signup example locally" : "Send my email and the draft title"); await screen.submit();
    assert.equal(screen.payloads.length, preview ? 0 : 1);
    assert.equal(screen.memory.get("salapi.circles.draft.v1"), previousDraft, "Optional signup must not replace the preserved draft");
    assert.match(text(screen.tree), preview ? /No email was submitted or saved/ : /organizer launch subscription is saved/);
  }
});

test("tampered or throwing read-back never claims saved and rolls back only the prior draft key", () => {
  for (const storageMode of ["tamper", "readback-error"] as const) {
    const screen = setup({ storageMode, previous: previousDraft }); screen.save();
    assert.equal(screen.memory.get("salapi.circles.draft.v1"), previousDraft);
    assert.match(text(screen.tree), /Complete draft prepared, not saved/);
    assert.ok(nodes(screen.tree).some(node => node.props.role === "alert"));
    assert.equal(screen.payloads.length, 0);
  }
});

test("a prior compatible browser draft can be restored without mutation or automatic signup", () => {
  const screen = setup({ previous: previousDraft }); screen.click("Restore last browser draft");
  assert.equal(screen.memory.get("salapi.circles.draft.v1"), previousDraft);
  assert.equal(nodes(screen.tree).find(node => node.props.id === "circle-draft-title")?.props.value, "Previous library draft");
  assert.equal(screen.payloads.length, 0);
  assert.match(text(screen.tree), /last browser draft is restored/);
});

function completeCause(screen: ReturnType<typeof setup>, category = "community") {
  screen.input("circle-draft-title", "A fictional neighborhood cause");
  screen.input("circle-draft-story", "A browser-only fictional idea with practical supplies and shared help, not a published campaign.");
  screen.input("circle-draft-category", category);
  screen.click("Continue"); screen.input("circle-draft-goal", "10.00"); screen.click("Continue");
}

test("each category shows and saves three distinct AI example images without a server submission", () => {
  for (const category of Object.keys(CATEGORY_LABEL)) {
    const screen = setup({ preview: false }); completeCause(screen, category);
    assert.equal(nodes(screen.tree).filter(node => node.type === "select" && String(node.props.id).startsWith("circle-draft-photo-")).length, 3);
    assert.match(text(screen.tree), /Added photos are AI concepts.*nothing is published/);
    screen.click("Continue");
    const gallery = nodes(screen.tree).find(node => node.props["aria-label"] === "Browser draft photo gallery");
    assert.ok(gallery); assert.equal(nodes(gallery).filter(node => node.type === "img").length, 3);
    screen.check("Save this concept on this device only"); screen.click("Save complete browser draft");
    const draft = JSON.parse(screen.memory.get("salapi.circles.draft.v1")!);
    assert.deepEqual(draft.gallery, draftGallery.defaultDraftGallery(category as keyof typeof CATEGORY_LABEL));
    assert.equal(draft.cover, draft.gallery[0].src);
    assert.equal(draft.publication, "browser-draft-only"); assert.equal(draft.organizerVerification, "not-performed");
    assert.equal(screen.payloads.length, 0);
  }
});

test("selectable gallery alternatives update the cover and persist exact ordering without duplicate photos", () => {
  const screen = setup(); completeCause(screen, "animals");
  const options = draftGallery.draftGalleryOptions("animals");
  screen.input("circle-draft-photo-0", options[3].src);
  screen.input("circle-draft-photo-1", options[4].src);
  screen.input("circle-draft-photo-2", options[5].src);
  screen.input("circle-draft-photo-1", options[3].src); // Forged duplicate value is rejected too.
  assert.equal(nodes(screen.tree).find(node => node.props.id === "circle-draft-photo-1")?.props.value, options[4].src);
  const selects = nodes(screen.tree).filter(node => node.type === "select" && String(node.props.id).startsWith("circle-draft-photo-"));
  for (const [index, field] of selects.entries()) {
    const duplicate = nodes(field).find(node => node.type === "option" && node.props.value === options[3].src);
    assert.equal(duplicate?.props.disabled, index !== 0);
  }
  screen.click("Continue"); screen.check("Save this concept on this device only"); screen.click("Save complete browser draft");
  const draft = JSON.parse(screen.memory.get("salapi.circles.draft.v1")!);
  assert.deepEqual(draft.gallery, options.slice(3)); assert.equal(draft.cover, options[3].src);
  screen.click("Download draft JSON"); assert.deepEqual(JSON.parse(screen.downloads[0]).gallery, draft.gallery);
  assert.equal(screen.payloads.length, 0);
});

test("category changes reset the gallery to relevant defaults but selecting the same category preserves choices", () => {
  const screen = setup(); completeCause(screen, "animals");
  const customCover = draftGallery.draftGalleryOptions("animals")[3].src;
  screen.input("circle-draft-photo-0", customCover);
  screen.click("Back"); screen.click("Back");
  screen.input("circle-draft-category", "animals"); screen.click("Continue"); screen.click("Continue");
  assert.equal(nodes(screen.tree).find(node => node.props.id === "circle-draft-photo-0")?.props.value, customCover);
  screen.click("Back"); screen.click("Back"); screen.input("circle-draft-category", "education");
  screen.click("Continue"); screen.click("Continue");
  const expected = draftGallery.defaultDraftGallery("education");
  for (const [index, photo] of expected.entries()) assert.equal(nodes(screen.tree).find(node => node.props.id === `circle-draft-photo-${index}`)?.props.value, photo.src);
  assert.equal(screen.memory.size, 0); assert.equal(screen.payloads.length, 0);
});

test("restoring a version-1 one-cover draft preserves its cover and expands three honest example scenes only in memory", () => {
  const screen = setup({ previous: previousDraft }); screen.click("Restore last browser draft");
  assert.equal(screen.memory.get("salapi.circles.draft.v1"), previousDraft);
  screen.click("Continue"); screen.click("Continue");
  assert.equal(nodes(screen.tree).find(node => node.props.id === "circle-draft-photo-0")?.props.value, "/circles/disaster.jpg");
  assert.match(text(screen.tree), /Restored legacy cover/);
  screen.click("Continue"); screen.check("Save this concept on this device only"); screen.click("Save complete browser draft");
  const draft = JSON.parse(screen.memory.get("salapi.circles.draft.v1")!);
  assert.equal(draft.version, 1); assert.equal(draft.cover, "/circles/disaster.jpg"); assert.equal(draft.gallery.length, 3);
  assert.match(draft.gallery[0].caption, /Legacy example cover.*not a verified/);
  assert.match(draft.gallery[1].caption, /not a photo of this draft/);
  assert.equal(draft.target.localValue, "20.00"); assert.equal(draft.durationDays, 60);
  assert.equal(screen.payloads.length, 0);
});

test("new gallery drafts restore chosen photos and cover without rewriting storage or auto-signup", () => {
  const options = draftGallery.draftGalleryOptions("community").slice(3);
  const previous = JSON.stringify({ ...JSON.parse(previousDraft), cover: options[0].src, gallery: options });
  const screen = setup({ previous }); screen.click("Restore last browser draft");
  screen.click("Continue"); screen.click("Continue");
  for (const [index, photo] of options.entries()) assert.equal(nodes(screen.tree).find(node => node.props.id === `circle-draft-photo-${index}`)?.props.value, photo.src);
  assert.equal(screen.memory.get("salapi.circles.draft.v1"), previous); assert.equal(screen.payloads.length, 0);
});

test("malformed gallery records do not partially restore or silently replace the last draft", () => {
  const photos = draftGallery.defaultDraftGallery("community");
  for (const gallery of [photos.slice(0, 1), [photos[0], photos[0], photos[2]], [{ src: "https://invalid.test/private-photo.png" }, ...photos.slice(1)]]) {
    const previous = JSON.stringify({ ...JSON.parse(previousDraft), cover: photos[0].src, gallery });
    const screen = setup({ previous }); screen.input("circle-draft-title", "Current untouched idea"); screen.click("Restore last browser draft");
    assert.equal(nodes(screen.tree).find(node => node.props.id === "circle-draft-title")?.props.value, "Current untouched idea");
    assert.match(text(screen.tree), /No compatible saved draft/);
    assert.equal(screen.memory.get("salapi.circles.draft.v1"), previous); assert.equal(screen.payloads.length, 0);
  }
});

test("a failed gallery image renders an honest unavailable state without deleting the selected draft source", () => {
  const screen = setup(); completeCause(screen);
  const photo = nodes(screen.tree).find(node => node.type === "img" && String(node.props.src).startsWith("/circles/generated/"));
  assert.ok(photo); (photo.props.onError as () => void)();
  screen.input("circle-draft-photo-1", draftGallery.draftGalleryOptions("community")[4].src); // Re-render.
  assert.match(text(screen.tree), /Photo unavailable/);
  assert.equal(nodes(screen.tree).find(node => node.props.id === "circle-draft-photo-0")?.props.value, photo.props.src);
});

test("verified Google organizers subscribe with their server-checked account and no manual email or implicit marketing", async () => {
  const ownerId = "00000000-0000-4000-8000-000000000001";
  const screen = setup({ preview: false, identity: { status: "verified", ownerId, email: "organizer@example.invalid", source: "google" } }); screen.save();
  assert.equal(nodes(screen.tree).some(node => node.props.id === "circle-organizer-launch-email"), false);
  assert.match(text(screen.tree), /Your verified Google emailorganizer@example.invalid/);
  const checkboxes = nodes(screen.tree).filter(node => node.type === "input" && node.props.type === "checkbox");
  assert.equal(checkboxes.length, 1); assert.equal(checkboxes[0].props.checked, false);
  await screen.submit(); assert.equal(screen.payloads.length, 0);
  screen.check("Send my email and the draft title"); await screen.submit(2);
  assert.equal(screen.payloads.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(screen.payloads[0])), { expectedOwnerId: ownerId, circleId: "draft:our-barangay-library", locale: "en", pesoPledge: 580, anonymous: false, notifyOk: true, marketingOk: false });
  assert.match(text(screen.tree), /organizer launch subscription is saved/);
  assert.match(text(screen.tree), /no campaign, donor badge or payment was created/);
  assert.equal(screen.memory.size, 1);
});

test("organizer identity errors and unconfirmed action results cannot claim saved signup or publish the draft", async () => {
  for (const status of ["loading", "unavailable", "unverified"] as const) {
    const screen = setup({ preview: false, identity: { status } }); screen.save();
    screen.check("Send my email and the draft title"); await screen.submit();
    assert.equal(screen.payloads.length, 0); assert.doesNotMatch(text(screen.tree), /organizer launch subscription is saved/);
    assert.equal(screen.memory.size, 1);
  }
  const screen = setup({ preview: false, result: { ok: true } }); screen.save();
  screen.input("circle-organizer-launch-email", "qa@example.invalid"); screen.check("Send my email and the draft title"); await screen.submit();
  assert.equal(screen.payloads.length, 1); assert.doesNotMatch(text(screen.tree), /organizer launch subscription is saved/);
  assert.match(text(screen.tree), /signup result could not be confirmed/);
});
