import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { WorkspaceSnapshot } from "../lib/circles/workspace.ts";
import { CURRENCY, formatLocal, pesoFromLocal } from "../lib/ui/currency.ts";
import type { Locale } from "../lib/i18n/config.ts";
import { circlesCategory } from "../lib/i18n/revamp-circles.ts";

// Isolated component-handler tests. These do not prove browser rendering,
// authentication, storage, contribution verification or blockchain behavior.
type Element = { type: unknown; props: Record<string, unknown> };
function source(path: string) { return readFileSync(new URL(path, import.meta.url), "utf8"); }
function compile(path: string) { return ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText; }
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element; return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : "";
}
const organizer = { id: "11111111-1111-4111-8111-111111111111", name: "Organizer QA", kind: "person" as const, verification: "unverified" as const };
const donor = { id: "22222222-2222-4222-8222-222222222222", name: "Donor QA", kind: "person" as const, verification: "unverified" as const };
const campaignId = "33333333-3333-4333-8333-333333333333";
const campaign = { id: campaignId, organizerId: organizer.id, organizerName: organizer.name, organizerKind: organizer.kind, title: "River cleaning campaign", story: "Community cleanup volunteers report spending and delivery details.", location: "Jakarta", category: "volunteer" as const, goalPHP: 1234, allowancePct: 5, coverMediaId: "44444444-4444-4444-8444-444444444444", createdAt: "2026-10-06T10:00:00Z", status: "published" as const };
const base: WorkspaceSnapshot = { mode: "local", actor: donor, profiles: [organizer, donor], campaigns: [campaign], updates: [], reviews: [], supports: [], following: [], media: [], localRole: "donor" };

function setup(snapshot: WorkspaceSnapshot = structuredClone(base), currency: Locale = "en") {
  const state: unknown[] = [];
  let cursor = 0;
  let errors = "";
  const actionResults = new Map<string, { ok: boolean; error?: string; value?: unknown }>();
  const calls: { action: string; args: unknown[] }[] = [];
  const uploads: Map<string, unknown>[] = [];
  const styles = { default: new Proxy({}, { get: (_target, key) => String(key) }) };
  const jsx = (type: unknown, props: Record<string, unknown>) => typeof type === "function" ? type(props) : { type, props };
  const jsxRuntime = { jsx, jsxs: jsx, Fragment: "Fragment" };
  const react = {
    useState(initial: unknown) { const index = cursor++; if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial; return [state[index], (value: unknown) => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
    useRef(initial: unknown) { const index = cursor++; if (!(index in state)) state[index] = { current: initial }; return state[index]; },
  };
  const types: Record<string, unknown> = {};
  runInNewContext(compile("../lib/circles/workspace.ts"), { exports: types });
  const labels: Record<string, unknown> = {};
  runInNewContext(compile("../lib/circles/types.ts"), { exports: labels });
  const action = (name: string) => async (...args: unknown[]) => { calls.push({ action: name, args }); return actionResults.get(name) ?? { ok: true, value: null }; };
  const actions = Object.fromEntries(["workspacePublish", "workspaceFollow", "workspaceReview", "workspaceSupport", "workspaceBindD4", "workspaceComplete", "workspacePostUpdate"].map(name => [name, action(name)]));
  const common = {
    useWorkspaceCopy: () => (english: string) => english,
    useWorkspace: () => ({ snapshot, busy: false, error: errors, notice: "", setError: (value: string) => { errors = value; }, setNotice: () => {}, refresh: async () => {}, run: async (fn: () => Promise<{ ok: boolean }>) => (await fn()).ok }),
    WorkspaceFrame: (props: Record<string, unknown>) => jsx("main", props),
    WorkspaceIdentity: ({ actor, href }: { actor: typeof organizer; href?: string }) => jsx(href ? "a" : "div", { href, children: [actor.name, "Identity not verified"] }),
    WorkspaceImage: ({ media, alt }: { media?: { url: string }; alt: string }) => jsx("img", { src: media?.url, alt }),
    mediaFor: () => undefined,
    actorFor: (_snapshot: WorkspaceSnapshot, value: typeof campaign) => snapshot.profiles.find(profile => profile.id === value.organizerId) ?? organizer,
    workspaceDate: (value: string) => value,
  };
  const cache = new Map<string, Record<string, unknown>>();
  class FakeFormData extends Map<string, unknown> { append(key: string, value: unknown) { this.set(key, value); } }
  const dependencies: Record<string, unknown> = { react, "react/jsx-runtime": jsxRuntime, "next/link": { default: (props: Record<string, unknown>) => jsx("a", props) }, "next/image": { default: (props: Record<string, unknown>) => jsx("img", props) }, "next/navigation": { useRouter: () => ({ push: (url: string) => { calls.push({ action: "navigate", args: [url] }); } }) }, "@/components/I18nProvider": { useT: () => ({ locale: "en", currency }) }, "@/lib/ui/currency": { CURRENCY, formatLocal, pesoFromLocal }, "@/lib/i18n/revamp-circles": { circlesCategory }, "@/components/ui/kit": { Ico: new Proxy({}, { get: () => () => jsx("svg", {}) }), T: { action: "#2563eb", slate: "#647795" } }, "@/app/circle-workspace-actions": actions, "@/lib/circles/types": labels, "@/lib/circles/workspace": types, "./WorkspaceCommon": common, "./Workspace.module.css": styles, "./PublishCampaign.module.css": styles };
  function load(name: string) {
    if (cache.has(name)) return cache.get(name)!;
    const exports: Record<string, unknown> = {}; cache.set(name, exports);
    runInNewContext(compile(`../components/circles/${name}.tsx`), {
      exports, crypto: { randomUUID: () => "55555555-5555-4555-8555-555555555555" }, FormData: FakeFormData, TextEncoder, requestAnimationFrame: (callback: () => void) => callback(),
      fetch: async (url: string, init: { method: string; body: Map<string, unknown> }) => { assert.equal(url, "/api/circles/media"); assert.equal(init.method, "POST"); uploads.push(init.body); return { ok: true, json: async () => ({ ok: true, media: { id: "66666666-6666-4666-8666-666666666666", ownerId: organizer.id, name: "proof.png", mime: "image/png", size: 100, sha256: "a".repeat(64), url: "/api/circles/media/qa" } }) }; },
      require(dependency: string) { if (dependency.startsWith("./Workspace") && dependency !== "./WorkspaceCommon" && dependency !== "./Workspace.module.css") return load(dependency.slice(2)); if (!(dependency in dependencies)) throw Error(`Unexpected UI dependency ${dependency}`); return dependencies[dependency]; },
    });
    return exports;
  }
  function render(name: string) { cursor = 0; const component = load(name).default as (props: { initialSnapshot: WorkspaceSnapshot; snapshot: WorkspaceSnapshot; campaignId: string }) => Element; return component({ initialSnapshot: snapshot, snapshot, campaignId }); }
  return { render, calls, uploads, snapshot, actionResults, errors: () => errors };
}
function button(tree: Element, name: string) { const node = nodes(tree).find(node => node.type === "button" && text(node) === name); assert.ok(node, `Button ${name}`); return node; }
function field(tree: Element, label: string, tag = "input") { const parent = nodes(tree).find(node => node.type === "label" && text(node).startsWith(label)); assert.ok(parent, `Field ${label}`); const input = nodes(parent).find(node => node.type === tag); assert.ok(input); return input; }
function change(node: Element, value: string) { (node.props.onChange as (event: unknown) => void)({ target: { value } }); }
function click(node: Element) { assert.notEqual(node.props.disabled, true); return (node.props.onClick as () => unknown)(); }
function submit(tree: Element, title: string) { const form = nodes(tree).find(node => node.type === "form" && text(node).includes(title)); assert.ok(form, `Form ${title}`); return (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} }); }

test("workspace list counts only supplied user campaigns and filters supported/following/category", () => {
  const qa = setup();
  qa.snapshot.campaigns.push({ ...campaign, id: "77777777-7777-4777-8777-777777777777", title: "Shelter medicine campaign", category: "animals" });
  qa.snapshot.supports.push({ campaignId, userId: donor.id, amount: "10", simulated: true });
  let tree = qa.render("WorkspaceList");
  assert.equal(nodes(tree).filter(node => node.type === "article").length, 2);
  assert.equal(nodes(tree).filter(node => node.type === "option").length, 10);
  click(button(tree, "Supported")); tree = qa.render("WorkspaceList");
  assert.equal(nodes(tree).filter(node => node.type === "article").length, 1);
  assert.ok(text(tree).includes(campaign.title));
  click(button(tree, "Following")); tree = qa.render("WorkspaceList");
  assert.ok(text(tree).includes("No campaigns in this view yet."));
  assert.equal(qa.calls.length, 0);
});

test("organizer cannot support or review their own campaign and nonowners cannot manage", () => {
  const own = setup({ ...structuredClone(base), actor: organizer, localRole: "organizer" });
  const detail = own.render("WorkspaceDetail");
  assert.ok(text(detail).includes("Manage campaign"));
  assert.equal(nodes(detail).filter(node => node.type === "form").length, 0);
  const donorView = setup().render("WorkspaceManage");
  assert.ok(text(donorView).includes("Organizer access required"));
  assert.equal(nodes(donorView).filter(node => node.type === "form").length, 0);
});

test("local support and follow handlers forward campaign ID without asserting payment", async () => {
  const qa = setup(); let tree = qa.render("WorkspaceDetail");
  assert.ok(text(tree).includes("does not debit a wallet"));
  change(field(tree, "Simulation amount"), "17.5"); tree = qa.render("WorkspaceDetail");
  await submit(tree, "Try a local support");
  await click(button(tree, "Follow updates"));
  assert.equal(qa.calls[0].action, "workspaceSupport"); assert.equal(JSON.stringify(qa.calls[0].args), JSON.stringify([campaignId, "17.5"]));
  assert.equal(qa.calls[1].action, "workspaceFollow"); assert.equal(JSON.stringify(qa.calls[1].args), JSON.stringify([campaignId, true]));
});

test("Testnet cannot simulate support and follows successfully before opening the configured D4 ID", async () => {
  const qa = setup({ ...structuredClone(base), mode: "testnet" });
  let tree = qa.render("WorkspaceDetail");
  assert.ok(text(tree).includes("No D4 funding contract is linked."));
  assert.equal(nodes(tree).filter(node => node.type === "form").length, 0);
  qa.snapshot.campaigns[0].contractCampaignId = "107"; tree = qa.render("WorkspaceDetail");
  await click(button(tree, "Follow updates & open D4"));
  assert.equal(qa.calls[0].action, "workspaceFollow"); assert.equal(JSON.stringify(qa.calls[0].args), JSON.stringify([campaignId, true]));
  assert.equal(qa.calls[1].action, "navigate"); assert.equal(qa.calls[1].args[0], "/campaigns?mode=testnet&id=107");
  assert.equal(qa.calls.some(call => call.action === "workspaceSupport"), false);
});

test("D4 navigation fails closed if the follow preference was not saved", async () => {
  const qa = setup({ ...structuredClone(base), mode: "testnet" }); qa.snapshot.campaigns[0].contractCampaignId = "107";
  qa.actionResults.set("workspaceFollow", { ok: false, error: "Failed" });
  await click(button(qa.render("WorkspaceDetail"), "Follow updates & open D4"));
  assert.equal(qa.calls.length, 1); assert.equal(qa.calls[0].action, "workspaceFollow");
});

test("saved local support renders the actual amount and disables amount editing", () => {
  const qa = setup(); qa.snapshot.supports.push({ campaignId, userId: donor.id, amount: "25", simulated: true });
  const input = field(qa.render("WorkspaceDetail"), "Simulation amount");
  assert.equal(input.props.value, "25"); assert.equal(input.props.disabled, true);
});

test("eligible completed-campaign donor gets required native star radios and saves comment once", async () => {
  const qa = setup(); qa.snapshot.campaigns[0].status = "completed";
  qa.snapshot.supports.push({ campaignId, userId: donor.id, amount: "10", simulated: true });
  let tree = qa.render("WorkspaceDetail"); click(button(tree, "Reviews")); tree = qa.render("WorkspaceDetail");
  const radios = nodes(tree).filter(node => node.type === "input" && node.props.type === "radio");
  assert.equal(radios.length, 5); assert.ok(radios.every(node => node.props.required === true && node.props.name === "rating"));
  (radios[3].props.onChange as () => void)(); change(field(tree, "Review comment", "textarea"), "The delivery update explained each expense clearly."); tree = qa.render("WorkspaceDetail");
  await submit(tree, "Your experience with this organizer");
  assert.equal(qa.calls[0].action, "workspaceReview"); assert.equal(JSON.stringify(qa.calls[0].args), JSON.stringify([{ campaignId, stars: 4, comment: "The delivery update explained each expense clearly." }]));
  qa.snapshot.reviews.push({ id: "review1", campaignId, organizerId: organizer.id, donorId: donor.id, donorName: donor.name, stars: 4, comment: "Reviewed", createdAt: "2026-10-06" });
  tree = qa.render("WorkspaceDetail"); assert.equal(nodes(tree).filter(node => node.props.type === "radio").length, 0);
});

test("missing contribution never opens the review form after completion", () => {
  const qa = setup(); qa.snapshot.campaigns[0].status = "completed";
  let tree = qa.render("WorkspaceDetail"); click(button(tree, "Reviews")); tree = qa.render("WorkspaceDetail");
  assert.equal(nodes(tree).filter(node => node.props.type === "radio").length, 0);
  assert.equal(qa.calls.length, 0);
});

test("delivery update requires photos and consent before upload or publication", async () => {
  const qa = setup({ ...structuredClone(base), actor: organizer, localRole: "organizer" });
  let tree = qa.render("WorkspaceManage"); change(field(tree, "Update type", "select"), "delivery"); tree = qa.render("WorkspaceManage");
  await submit(tree, "Publish a campaign update"); assert.equal(qa.calls.length, 0); assert.equal(qa.uploads.length, 0); assert.ok(qa.errors().includes("Confirm permission"));
  const consent = nodes(tree).find(node => node.props.type === "checkbox")!;
  (consent.props.onChange as (event: unknown) => void)({ target: { checked: true } }); tree = qa.render("WorkspaceManage");
  await submit(tree, "Publish a campaign update"); assert.equal(qa.calls.length, 0); assert.ok(qa.errors().includes("at least one photo"));
});

test("manager uploads the selected photo with public consent before posting hashed-media reference", async () => {
  const qa = setup({ ...structuredClone(base), actor: organizer, localRole: "organizer" });
  let tree = qa.render("WorkspaceManage");
  change(field(tree, "Update type", "select"), "delivery"); change(field(tree, "Update title"), "Supplies delivered"); change(field(tree, "What happened?", "textarea"), "The cleanup volunteers received the documented supplies.");
  (field(tree, "Update photos").props.onChange as (event: unknown) => void)({ target: { files: [{ name: "proof.png", type: "image/png", size: 100 }] } });
  const consent = nodes(tree).find(node => node.props.type === "checkbox")!; (consent.props.onChange as (event: unknown) => void)({ target: { checked: true } });
  tree = qa.render("WorkspaceManage"); await submit(tree, "Publish a campaign update");
  assert.equal(qa.uploads.length, 1); assert.equal(qa.uploads[0].get("publicMediaConsent"), "true"); assert.equal((qa.uploads[0].get("file") as { name: string }).name, "proof.png");
  const payload = qa.calls[0].args[0] as Record<string, unknown>; assert.equal(qa.calls[0].action, "workspacePostUpdate"); assert.equal(payload.campaignId, campaignId); assert.equal(payload.publicMediaConsent, true); assert.equal(payload.requestId, "55555555-5555-4555-8555-555555555555"); assert.equal(JSON.stringify(payload.mediaIds), JSON.stringify(["66666666-6666-4666-8666-666666666666"]));
});

test("completed manager cannot post new updates or simulate binding a D4 contract", () => {
  const qa = setup({ ...structuredClone(base), actor: organizer, localRole: "organizer" }); qa.snapshot.campaigns[0].status = "completed";
  const tree = qa.render("WorkspaceManage"); assert.equal(nodes(tree).filter(node => node.type === "form").length, 0); assert.ok(text(tree).includes("No contract can be linked in this local simulation."));
});

test("organizer history and average use actual supplied records rather than fabricated ratings", () => {
  const qa = setup(); let tree = qa.render("WorkspaceOrganizer"); assert.ok(text(tree).includes("No completed campaign yet. History is not invented.")); assert.ok(text(tree).includes("0 simulation reviews"));
  qa.snapshot.campaigns[0].status = "completed";
  qa.snapshot.reviews.push({ id: "one", campaignId, organizerId: organizer.id, donorId: donor.id, donorName: donor.name, stars: 4, comment: "Good update", createdAt: "2026-10-06" }, { id: "two", campaignId: "other", organizerId: organizer.id, donorId: "other", donorName: "Another donor", stars: 2, comment: "Needs more detail", createdAt: "2026-10-05" });
  tree = qa.render("WorkspaceOrganizer"); assert.ok(text(tree).includes("3.0/52 simulation reviews")); assert.ok(text(tree).includes("1Completed campaigns")); assert.ok(text(tree).includes("Identity not verified"));
});

function publishDetails(qa: ReturnType<typeof setup>, goal = "100.01") {
  const tree = qa.render("PublishCampaignScreen");
  change(field(tree, "Campaign title"), "River cleanup volunteers");
  change(field(tree, "Story and delivery plan", "textarea"), "Volunteers will remove rubbish from the river and publish spending and delivery records.");
  change(field(tree, "Location"), "Jakarta, Indonesia");
  change(field(tree, "Display goal"), goal);
  change(field(tree, "Organizer operations allocation", "select"), "5");
  click(button(qa.render("PublishCampaignScreen"), "Continue"));
}
function publicationConsent(tree: Element, checked: boolean) {
  const input = nodes(tree).find(node => node.type === "input" && node.props.type === "checkbox"); assert.ok(input);
  (input.props.onChange as (event: unknown) => void)({ target: { checked } });
}
function uploadPublication(tree: Element, file: { name: string; type: string; size: number }) {
  const input = field(tree, "Upload campaign photo");
  (input.props.onChange as (event: unknown) => void)({ target: { files: [file], value: file.name } });
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test("publication has fail-closed identity gating and requires photo permission before upload", () => {
  const unavailable = setup({ ...structuredClone(base), actor: null }).render("PublishCampaignScreen");
  assert.ok(text(unavailable).includes("Publication unavailable")); assert.equal(nodes(unavailable).filter(node => node.type === "input").length, 0);
  const qa = setup(); publishDetails(qa);
  const tree = qa.render("PublishCampaignScreen"); const input = field(tree, "Upload campaign photo");
  assert.equal(input.props.disabled, true);
  uploadPublication(tree, { name: "cover.png", type: "image/png", size: 100 });
  assert.equal(qa.uploads.length, 0); assert.ok(text(qa.render("PublishCampaignScreen")).includes("Consent to public campaign media first."));
});

test("publication rejects unsupported and oversized images without network writes", () => {
  const qa = setup(); publishDetails(qa); publicationConsent(qa.render("PublishCampaignScreen"), true);
  for (const file of [{ name: "bad.svg", type: "image/svg+xml", size: 100 }, { name: "large.png", type: "image/png", size: 4 * 1024 * 1024 + 1 }, { name: "empty.jpg", type: "image/jpeg", size: 0 }]) {
    uploadPublication(qa.render("PublishCampaignScreen"), file);
    assert.ok(text(qa.render("PublishCampaignScreen")).includes("SVG and documents are not accepted."));
  }
  assert.equal(qa.uploads.length, 0); assert.equal(qa.calls.length, 0);
});

test("publication upload busy state disables input and advances only after stored media exists", async () => {
  const qa = setup(); publishDetails(qa); publicationConsent(qa.render("PublishCampaignScreen"), true);
  uploadPublication(qa.render("PublishCampaignScreen"), { name: "cover.png", type: "image/png", size: 100 });
  let tree = qa.render("PublishCampaignScreen"); assert.equal(field(tree, "Upload campaign photo").props.disabled, true); assert.equal(button(tree, "Continue").props.disabled, true); assert.ok(text(tree).includes("Uploading and checking photo"));
  await settle(); tree = qa.render("PublishCampaignScreen"); assert.ok(text(tree).includes("Upload saved")); assert.equal(button(tree, "Continue").props.disabled, false);
  assert.equal(qa.uploads.length, 1); assert.equal(qa.uploads[0].get("publicMediaConsent"), "true");
});

test("publication preserves rounded PHP metadata, allocation consent and same request ID across safe retries", async () => {
  const qa = setup(); publishDetails(qa, "100.01"); publicationConsent(qa.render("PublishCampaignScreen"), true);
  uploadPublication(qa.render("PublishCampaignScreen"), { name: "cover.png", type: "image/png", size: 100 }); await settle(); click(button(qa.render("PublishCampaignScreen"), "Continue"));
  const tree = qa.render("PublishCampaignScreen"); assert.equal(button(tree, "Publish to local workspace").props.disabled, true); publicationConsent(tree, true);
  qa.actionResults.set("workspacePublish", { ok: false, error: "Retry same request" });
  click(button(qa.render("PublishCampaignScreen"), "Publish to local workspace")); await settle();
  assert.equal(qa.calls.length, 1); const first = qa.calls[0].args[0] as Record<string, unknown>; assert.equal(first.goalPHP, 5800.58); assert.equal(first.allowancePct, 5); assert.equal(first.publicMediaConsent, true); assert.equal(first.coverMediaId, "66666666-6666-4666-8666-666666666666");
  qa.actionResults.set("workspacePublish", { ok: true, value: { id: campaignId } });
  click(button(qa.render("PublishCampaignScreen"), "Publish to local workspace")); await settle();
  const second = qa.calls[1].args[0] as Record<string, unknown>; assert.equal(second.requestId, first.requestId); assert.equal(qa.calls[2].action, "navigate"); assert.equal(qa.calls[2].args[0], `/circles/workspace/${campaignId}/manage`);
});
