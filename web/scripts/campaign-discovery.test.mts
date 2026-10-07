import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { campaignDiscoveryView } from "../lib/campaign-discovery.ts";
import * as discoveryCopy from "../lib/i18n/revamp-campaign-discovery.ts";
import * as circlesCopy from "../lib/i18n/revamp-circles.ts";
import * as money from "../lib/campaign-money.ts";
import * as currency from "../lib/ui/currency.ts";
import * as accountCopy from "../lib/i18n/revamp-account.ts";
import * as homeCircles from "../lib/home-circles.ts";
import { publicProofUrl, type Campaign } from "../lib/campaign.ts";
import { formatStroops } from "../lib/disaster.ts";
import { DICTS } from "../lib/i18n/dictionaries.ts";
import { LOCALES, type Locale } from "../lib/i18n/config.ts";
import type { Circle, CircleCategory } from "../lib/circles/types.ts";
import { campaignDonorBadge } from "../lib/ui/testnet-donor.ts";

type Element = { type: unknown; props: Record<string, unknown>; key?: string };
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : "";
}
const jsx = (type: unknown, props: Record<string, unknown>, key?: string): Element => typeof type === "function" ? type(props) : { type, props, key };
function compile(path: string, isJsx = false) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, ...(isJsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
  }).outputText;
}
const fixtures = new Map<string, Record<string, unknown>>();
function fixture(path: string): Record<string, unknown> {
  if (fixtures.has(path)) return fixtures.get(path)!;
  const exports: Record<string, unknown> = {}; fixtures.set(path, exports);
  runInNewContext(compile(path, path.endsWith(".tsx")), { exports, require(name: string) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (name === "./types") return fixture("../lib/circles/types.ts");
    if (name === "./organizers") return fixture("../lib/circles/organizers.ts");
    if (name === "@/lib/ui/currency") return currency;
    if (name === "@/lib/i18n/revamp-circles") return circlesCopy;
    if (name === "@/components/ui/CauseCategoryDoodle") return fixture("../components/ui/CauseCategoryDoodle.tsx");
    if (name.endsWith(".module.css")) return { default: {} };
    throw Error(`Unexpected pure fixture dependency: ${name}`);
  } });
  return exports;
}
const seed = fixture("../lib/circles/seed.ts") as { SEED_CIRCLES: Circle[] };
const circleTypes = fixture("../lib/circles/types.ts") as { CATEGORY_LABEL: Record<CircleCategory, string> };
function previewModule(preview: boolean) {
  const exports: Record<string, unknown> = {};
  runInNewContext(compile("../lib/local-preview.ts"), { exports, process: { env: { NEXT_PUBLIC_LOCAL_PREVIEW: preview ? "1" : "0" } } });
  return exports as { PREVIEW_CAMPAIGNS: Campaign[]; PREVIEW_TIME: number; PREVIEW_WALLET: { address: string }; isLocalPreview: boolean } & Record<string, unknown>;
}

test("route policy keeps flag0 default D4, explicit mode choices, and authoritative id/create intents", () => {
  for (const preview of [false, true]) {
    for (const mode of [undefined, "examples", "testnet", "unknown", "", "TESTNET"]) {
      const expected = mode === "testnet" ? "testnet" : preview || mode === "examples" ? "examples" : "testnet";
      assert.equal(campaignDiscoveryView({ mode }, preview), expected, `${preview}:${mode}`);
      assert.equal(campaignDiscoveryView({ mode, create: "0" }, preview), expected);
      assert.equal(campaignDiscoveryView({ mode, create: "true" }, preview), expected);
      assert.equal(campaignDiscoveryView({ mode, create: "1" }, preview), "testnet");
      for (const id of ["101", "999999", "cats-recovery", "not-a-number", "0", "-1", " "]) {
        assert.equal(campaignDiscoveryView({ mode, id }, preview), "testnet", `${preview}:${mode}:${id}`);
      }
      assert.equal(campaignDiscoveryView({ mode, id: "" }, preview), expected);
    }
  }
});

test("actual server page dispatches without action calls and preserves direct D4 props/remount keys", async () => {
  const code = compile("../app/campaigns/page.tsx", true);
  for (const preview of [false, true]) {
    const exports = {} as { default(props: unknown): Promise<Element> };
    runInNewContext(code, { exports, require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "@/components/screens/CampaignScreen") return { default: "CampaignScreen" };
      if (name === "@/components/screens/CirclesDiscoverScreen") return { default: "CirclesDiscoverScreen" };
      if (name === "@/components/CampaignDiscoveryNav") return { default: "CampaignDiscoveryNav" };
      if (name === "@/lib/campaign-discovery") return { campaignDiscoveryView };
      if (name === "@/lib/local-preview") return previewModule(preview);
      throw Error(`Forbidden server page dependency: ${name}`);
    } });
    for (const params of [{}, { mode: "examples" }, { mode: "testnet" }, { mode: "unknown" }, { id: "101", mode: "examples" }, { id: "not-a-number", mode: "examples" }, { create: "1", mode: "examples" }, { id: "101", create: "1", mode: "examples" }]) {
      const tree = await exports.default({ searchParams: Promise.resolve(params) });
      const expected = campaignDiscoveryView(params, preview);
      assert.equal(nodes(tree).find(node => node.type === "CampaignDiscoveryNav")?.props.view, expected);
      if (expected === "examples") {
        assert.equal(nodes(tree).find(node => node.type === "CirclesDiscoverScreen")?.props.campaignEntry, true);
        assert.equal(nodes(tree).some(node => node.type === "CampaignScreen"), false);
      } else {
        const screen = nodes(tree).find(node => node.type === "CampaignScreen")!; assert.ok(screen);
        const id = "id" in params ? params.id : "", create = "create" in params && params.create === "1";
        assert.equal(screen.props.id, id); assert.equal(screen.props.initialCreate, create);
        assert.equal(screen.key, `${id}:${create ? "create" : "view"}`);
        assert.equal(nodes(tree).some(node => node.type === "CirclesDiscoverScreen"), false);
      }
    }
  }
});

test("actual mode navigation has explicit links, one current page, and truthful four-locale boundaries", () => {
  for (const locale of LOCALES) for (const view of ["examples", "testnet"] as const) {
    const exports = {} as { default(props: unknown): Element };
    runInNewContext(compile("../components/CampaignDiscoveryNav.tsx", true), { exports, require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "next/link") return { default: "Link" };
      if (name === "./I18nProvider") return { useT: () => ({ locale }) };
      if (name === "@/lib/i18n/revamp-campaign-discovery") return discoveryCopy;
      if (name.endsWith(".module.css")) return { default: {} };
      throw Error(`Unexpected navigation dependency: ${name}`);
    } });
    const tree = exports.default({ view }), c = discoveryCopy.campaignDiscoveryCopy(locale);
    const links = nodes(tree).filter(node => node.type === "Link");
    assert.deepEqual(links.map(node => node.props.href), ["/campaigns?mode=examples", "/campaigns?mode=testnet"]);
    assert.equal(links.filter(node => node.props["aria-current"] === "page").length, 1);
    assert.equal(links.find(node => node.props["aria-current"] === "page")?.props.href, `/campaigns?mode=${view}`);
    assert.ok(text(tree).includes(c(view === "examples" ? "Categories, organizer profiles and updates. Fictional examples, no payments." : "Separate D4 escrow in valueless Testnet XLM. Circles example totals are not contract balances.")));
    assert.equal(nodes(tree).find(node => node.type === "nav")?.props["aria-label"], c("Donation discovery"));
  }
});

function catalog(preview = true, campaignEntry = true) {
  let cursor = 0; const states: unknown[] = [];
  // One isolated history entry per harness. These snapshots contain UI-only
  // category/sort, not browser storage, ledger balances or donor preferences.
  const navigationViews = new Map<string, string>();
  const backCalls: string[] = [];
  const calls = { network: 0, action: 0, storage: 0 };
  const forbidden = (kind: keyof typeof calls) => () => { calls[kind]++; throw Error(`Forbidden ${kind}`); };
  const exports = {} as { default(props: unknown): Element };
  runInNewContext(compile("../components/screens/CirclesDiscoverScreen.tsx", true), {
    exports, fetch: forbidden("network"), sessionStorage: { getItem: forbidden("storage"), setItem: forbidden("storage") },
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react") return { useState(initial: unknown) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], (value: unknown) => { states[i] = value; }]; } };
      if (name === "next/link") return { default: "Link" };
      if (name === "next/image") return { default: "Image" };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale: "en", t(key: string) { let value: unknown = DICTS.en; for (const part of key.split(".")) value = (value as Record<string, unknown>)[part]; assert.equal(typeof value, "string"); return value; } }) };
      if (name === "@/components/ui/kit") return { Ico: new Proxy({}, { get: () => () => null }), T: {}, PoweredByStellar: "PoweredByStellar" };
      if (name === "@/components/ui/OrganizerVerification") return { default: "OrganizerVerification" };
      if (name === "@/components/ui/ExampleOrganizerAvatar") return { default: "ExampleOrganizerAvatar" };
      if (name === "@/components/CauseCategoryPicker") return fixture("../components/CauseCategoryPicker.tsx");
      if (name === "@/lib/circles/seed") return seed;
      if (name === "@/lib/circles/types") return circleTypes;
      if (name === "@/lib/circles/organizers") return fixture("../lib/circles/organizers.ts");
      if (name === "@/lib/i18n/revamp-circles") return circlesCopy;
      if (name === "@/lib/i18n/revamp-campaign-discovery") return discoveryCopy;
      if (name === "@/lib/home-circles") return homeCircles;
      if (name === "@/lib/ui/useNavigationViewState") return { useNavigationViewState: (key: string) => navigationViews.get(key) ?? "" };
      if (name === "@/lib/ui/app-navigation") return { writeNavigationViewState(key: string, value: Record<string, unknown>) {
        assert.equal(key, "circles-discovery");
        assert.deepEqual(Object.keys(value).sort(), ["category", "sort"]);
        navigationViews.set(key, JSON.stringify(value));
      } };
      if (name === "@/lib/ui/useGoBack") return { useGoBack: (fallback: string) => () => { backCalls.push(fallback); } };
      if (name === "@/lib/local-preview") return previewModule(preview);
      if (name.endsWith(".module.css")) return { default: {} };
      if (name === "@/app/actions") return new Proxy({}, { get: () => forbidden("action") });
      throw Error(`Unexpected catalog dependency: ${name}`);
    },
  });
  const render = () => { cursor = 0; return exports.default({ campaignEntry }); };
  let tree = render();
  return { calls, backCalls, get tree() { return tree; }, back() {
    const button = nodes(tree).find(node => node.type === "button" && text(node) === "Back")!; assert.ok(button);
    assert.equal(button.props.type, "button"); (button.props.onClick as () => void)();
  }, filter(category: CircleCategory | "all") {
    const label = category === "all" ? "All examples" : circlesCopy.circlesCategory("en", category);
    const button = nodes(tree).find(node => node.type === "button" && (node.props["aria-label"] === label || text(node) === label))!; assert.ok(button);
    (button.props.onClick as () => void)(); tree = render();
  } };
}

test("default local catalog renders all 27 causes with nine filters, original photos/profiles, and no D4 ID conversion", () => {
  const before = JSON.stringify(seed.SEED_CIRCLES), screen = catalog();
  const articles = nodes(screen.tree).filter(node => node.type === "article"); assert.equal(articles.length, 27);
  assert.equal(Object.keys(circleTypes.CATEGORY_LABEL).length, 9);
  for (let i = 0; i < articles.length; i++) {
    const circle = seed.SEED_CIRCLES[i], article = articles[i];
    assert.equal(text(nodes(article).find(node => node.type === "h2")), circle.title);
    assert.equal(nodes(article).find(node => node.type === "Image")?.props.src, circle.coverImage);
    assert.ok(nodes(article).some(node => node.props.href === `/circles/${circle.id}`));
    assert.ok(nodes(article).some(node => node.props.href === `/circles/${circle.id}/organizer`));
    assert.equal(nodes(article).some(node => String(node.props.href ?? "").startsWith("/campaigns?id=")), false);
  }
  for (const category of Object.keys(circleTypes.CATEGORY_LABEL) as CircleCategory[]) {
    screen.filter(category);
    const expected = seed.SEED_CIRCLES.filter(circle => circle.category === category);
    assert.equal(expected.length, 3);
    assert.deepEqual(nodes(screen.tree).filter(node => node.type === "article").map(node => text(nodes(node).find(child => child.type === "h2"))), Array.from(expected, circle => circle.title));
    assert.equal(nodes(screen.tree).filter(node => node.type === "button" && node.props["aria-pressed"] === true).length, 1);
  }
  screen.filter("all"); assert.equal(nodes(screen.tree).filter(node => node.type === "article").length, 27);
  assert.equal(JSON.stringify(seed.SEED_CIRCLES), before);
  assert.deepEqual(screen.calls, { network: 0, action: 0, storage: 0 });
});

test("catalog entry and explicit flag0 examples retain truthful labels and separate D4/draft/support paths", () => {
  for (const preview of [true, false]) {
    const screen = catalog(preview), all = nodes(screen.tree);
    assert.ok(all.some(node => node.type === "button" && node.props.type === "button" && text(node) === "Back"));
    screen.back(); assert.deepEqual(screen.backCalls, ["/"]);
    assert.equal(all.some(node => node.type === "Link" && node.props.href === "/campaigns?mode=testnet"), false, "Campaign entry uses its separate mode navigation, not a duplicate bridge");
    assert.ok(all.some(node => node.type === "Link" && node.props.href === "/circles/create"));
    assert.equal(all.some(node => node.type === "Link" && node.props.href === "/circles/supported"), preview);
    assert.match(text(screen.tree), /Fictional causes, AI photos and example ratings/);
    assert.match(text(screen.tree), /No live donations or on-chain receipts/);
    const standalone = catalog(preview, false);
    standalone.back(); assert.deepEqual(standalone.backCalls, ["/vaults"]);
    assert.ok(nodes(standalone.tree).some(node => node.type === "Link" && node.props.href === "/campaigns?mode=testnet" && text(node).includes("Open donation campaigns")));
    assert.ok(text(standalone.tree).includes(preview ? "local sample data. No transactions." : "Testnet campaign escrow, proof review and two wallet approvals."));
    assert.deepEqual(standalone.calls, { network: 0, action: 0, storage: 0 });
    assert.deepEqual(screen.calls, { network: 0, action: 0, storage: 0 });
  }
});

function campaignCard(campaign: Campaign, preview: boolean, locale: Locale = "en", viewer?: string | null) {
  const local = previewModule(preview), media = {} as { vaultCampaignMedia: unknown };
  runInNewContext(compile("../lib/vault-campaign-media.ts"), { exports: media, require(name: string) { assert.equal(name, "./local-preview"); return local; } });
  let cursor = 0; const states: unknown[] = [], reviews: { label: string; action: unknown; preview: unknown }[] = [];
  const calls = { network: 0, action: 0, storage: 0 };
  const forbidden = (kind: keyof typeof calls) => () => { calls[kind]++; throw Error(`Forbidden ${kind}`); };
  const exports = {} as { cardForTest(props: unknown): Element };
  runInNewContext(`${compile("../components/screens/CampaignScreen.tsx", true)}\nexports.cardForTest = CampaignCard;`, {
    exports, fetch: forbidden("network"), sessionStorage: { getItem: forbidden("storage"), setItem: forbidden("storage") },
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react") return { useState(initial: unknown) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], (value: unknown) => { states[i] = value; }]; }, useRef: () => ({ current: null }), useEffect() {}, useCallback: (fn: unknown) => fn };
      if (name === "next/link") return { default: "Link" };
      if (name === "next/image") return { default: "Image" };
      if (name === "@phosphor-icons/react/dist/csr/Heart") return { Heart: "Heart" };
      if (name === "@/components/D4CampaignGallery") return { default: "D4CampaignGallery" };
      // Independently tested ledger/subscription/organizer panels are isolated
      // boundaries here. Discovery still forbids all action/network/storage use.
      if (name === "@/components/CampaignDonorActivity") return { default: "CampaignDonorActivity" };
      if (name === "@/components/CampaignUpdateSubscription") return { default: "CampaignUpdateSubscription" };
      if (name === "@/components/CampaignOrganizerUpdates") return { default: "CampaignOrganizerUpdates" };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale }) };
      if (name === "@/components/ui/kit") return { Ico: new Proxy({}, { get: () => () => null }), T: {}, Btn: "Btn", Card: "Card", PoweredByStellar: "PoweredByStellar" };
      if (name === "@/lib/campaign-money") return money;
      if (name === "@/lib/disaster") return { formatStroops };
      if (name === "@/lib/campaign") return { publicProofUrl };
      if (name === "@/lib/campaign-evidence") return {};
      if (name === "@/lib/local-preview") return local;
      if (name === "@/lib/vault-campaign-media") return media;
      if (name === "@/lib/i18n/revamp-campaign-discovery") return discoveryCopy;
      if (name === "@/lib/i18n/revamp-account") return accountCopy;
      if (name === "@/lib/i18n/revamp-circles") return circlesCopy;
      if (name === "@/lib/ui/testnet-donor") return { campaignDonorBadge };
      if (name === "@/lib/ui/useGoBack") return { useGoBack: () => forbidden("action") };
      if (name === "@/app/campaign-actions") return new Proxy({}, { get: () => forbidden("action") });
      if (name === "@/lib/ui/useUnresolvedSubmission") return { useUnresolvedSubmission: forbidden("action") };
      if (name === "@/lib/campaign-preview-storage") return { saveCampaignPreview: forbidden("storage") };
      if (name === "@/components/ui/SubmissionStatusPanel" || name === "@/components/ui/SuccessMotion") return { default: "Stub" };
      if (name.endsWith(".module.css")) return { default: {} };
      throw Error(`Unexpected actual campaign dependency: ${name}`);
    },
  });
  const render = () => { cursor = 0; return exports.cardForTest({ c: campaign, now: BigInt(local.PREVIEW_TIME), viewer: viewer === undefined ? local.PREVIEW_WALLET.address : viewer, busy: false, detail: true,
    run(label: string, action: unknown, _created: unknown, previewAction: unknown) { reviews.push({ label, action, preview: previewAction }); }, onPreviewUpdate: forbidden("storage") }); };
  let tree = render();
  return { calls, reviews, get tree() { return tree; }, amount(value: string) {
    const input = nodes(tree).find(node => node.type === "input" && node.props.inputMode === "decimal")!; assert.ok(input);
    (input.props.onChange as (event: unknown) => void)({ target: { value } }); tree = render();
  }, currency(value: string) {
    const select = nodes(tree).find(node => node.type === "select" && node.props["aria-label"] === "Display currency")!; assert.ok(select);
    (select.props.onChange as (event: unknown) => void)({ target: { value } }); tree = render();
  }, review() { const button = nodes(tree).find(node => node.type === "Btn" && text(node) === "Donate · Review amount")!; assert.ok(button); (button.props.onClick as () => void)(); tree = render(); } };
}

test("D4 display currency has an exact accessible label independent of option text and retains PHP review precision", () => {
  const campaign = previewModule(true).PREVIEW_CAMPAIGNS[0];
  for (const preview of [false, true]) {
    const screen = campaignCard(campaign, preview);
    const select = nodes(screen.tree).find(node => node.type === "select")!;
    assert.ok(select);
    assert.equal(select.props["aria-label"], "Display currency");
    assert.equal(select.props.disabled, false);
    assert.deepEqual(nodes(select).filter(node => node.type === "option").map(node => [node.props.value, text(node)]),
      [["XLM", "Testnet XLM"], ["tl", "PHP (illustrative)"], ["id", "IDR (illustrative)"]]);
    screen.amount("6.50"); screen.currency("tl"); screen.review();
    assert.equal(nodes(screen.tree).find(node => node.type === "select")?.props.value, "tl");
    assert.equal(nodes(screen.tree).find(node => node.type === "input" && node.props.inputMode === "decimal")?.props.value, "6.50");
    assert.equal(screen.reviews.length, 1);
    assert.match(screen.reviews[0].label, /^Donate 1 Testnet XLM to campaign #/);
    assert.deepEqual(screen.calls, { network: 0, action: 0, storage: 0 });
  }
});

test("actual D4 media is restricted to canonical preview identity and never applied to flag0/rebound IDs", () => {
  const fixtures = previewModule(true).PREVIEW_CAMPAIGNS;
  for (const campaign of fixtures) for (const preview of [true, false]) {
    const screen = campaignCard(campaign, preview);
    assert.equal(nodes(screen.tree).filter(node => node.type === "Image").length, preview ? 1 : 0);
    assert.equal(nodes(screen.tree).some(node => String(node.props.href ?? "").startsWith("/circles/")), preview);
    if (preview) assert.match(text(screen.tree), /Illustrative campaign photo|Fictional organizer example/);
    assert.deepEqual(screen.calls, { network: 0, action: 0, storage: 0 });
  }
  const original = fixtures[0];
  for (const campaign of [{ ...original, id: "unknown" }, { ...original, title: "A new user draft" }, { ...original, config: { ...original.config, creator: fixtures[1].config.creator } }]) {
    const screen = campaignCard(campaign, true);
    assert.equal(nodes(screen.tree).filter(node => node.type === "Image").length, 0);
    assert.equal(nodes(screen.tree).some(node => String(node.props.href ?? "").startsWith("/circles/")), false);
    assert.ok(nodes(screen.tree).some(node => node.type === "Link" && node.props.href === `/campaigns?id=${campaign.id}`));
  }
});

test("D4 photo presentation preserves exact escrow/splits/recipients/proof controls in both modes", () => {
  const fixtures = previewModule(true).PREVIEW_CAMPAIGNS, before = JSON.stringify(fixtures);
  for (const campaign of fixtures) for (const preview of [true, false]) {
    const screen = campaignCard(campaign, preview), split = money.campaignSplit(BigInt(campaign.total), BigInt(campaign.config.creator_cut_bps));
    assert.ok(text(screen.tree).includes(`${formatStroops(campaign.total)} Testnet XLM`));
    assert.ok(text(screen.tree).includes(`${formatStroops(campaign.escrow)} Testnet XLM`));
    assert.ok(text(screen.tree).includes(`On release: ${formatStroops(split.beneficiary)} XLM to beneficiary, ${formatStroops(split.creator)} XLM to creator (${campaign.config.creator_cut_bps / 100}%).`));
    assert.equal(split.beneficiary + split.creator, BigInt(campaign.total));
    for (const address of [campaign.config.creator, campaign.config.beneficiary, ...campaign.config.approvers]) assert.ok(text(screen.tree).includes(address));
    assert.ok(nodes(screen.tree).some(node => node.type === "Link" && node.props.href === `/campaigns?id=${campaign.id}`));
    if (campaign.state === "Funding") {
      screen.amount("6.5000001"); screen.review();
      assert.equal(screen.reviews.length, 1); assert.match(screen.reviews[0].label, /^Donate 6\.5000001 Testnet XLM to campaign #/);
      assert.equal(nodes(screen.tree).find(node => node.type === "input" && node.props.inputMode === "decimal")?.props.value, "6.5000001");
    } else {
      assert.equal(nodes(screen.tree).some(node => node.type === "Btn" && text(node) === "Approve proof"), true);
      assert.equal(nodes(screen.tree).some(node => node.type === "Btn" && text(node) === "Release funds"), false);
      assert.ok(text(screen.tree).includes(campaign.proofHash!));
    }
    assert.deepEqual(screen.calls, { network: 0, action: 0, storage: 0 });
  }
  assert.equal(JSON.stringify(fixtures), before);
});

test("D4 illustrative labels are four-locale while fixture identity and money stay unchanged", () => {
  const campaign = previewModule(true).PREVIEW_CAMPAIGNS[0];
  for (const locale of LOCALES) {
    const screen = campaignCard(campaign, true, locale), c = discoveryCopy.campaignDiscoveryCopy(locale);
    assert.ok(text(screen.tree).includes(c("Fictional organizer example")));
    assert.ok(text(screen.tree).includes("Maria S."));
    assert.equal(nodes(screen.tree).find(node => node.type === "Image" && node.props.width === 44)?.props.alt, c("Illustrative profile photo, not a verified identity"));
    assert.ok(text(screen.tree).includes(formatStroops(campaign.escrow)));
  }
});

test("D4 details bind organizer galleries to campaign identity without rebinding fictional media to live campaigns", () => {
  for (const campaign of previewModule(true).PREVIEW_CAMPAIGNS) {
    for (const preview of [true, false]) {
      const screen = campaignCard(campaign, preview);
      const gallery = nodes(screen.tree).find(node => node.type === "D4CampaignGallery");
      assert.ok(gallery);
      assert.equal(gallery.props.campaignId, campaign.id);
      assert.equal(gallery.props.creatorWallet, campaign.config.creator);
      assert.equal(gallery.props.localPreview, preview);
      const photos = gallery.props.examplePhotos as { src: string }[] | undefined;
      if (preview) {
        assert.equal(photos?.length, 3);
        assert.equal(new Set(photos!.map(photo => photo.src)).size, 3);
      } else assert.equal(photos, undefined);
      assert.deepEqual(screen.calls, { network: 0, action: 0, storage: 0 });
    }
  }
});

test("only a positive unrefunded contract-read contribution for the current viewer renders Testnet donor, never an example or zero balance", () => {
  const base = previewModule(true).PREVIEW_CAMPAIGNS[0];
  for (const preview of [true, false]) for (const amount of ["0", "1", "50000000"]) for (const refunded of [true, false]) for (const viewer of [null, base.config.creator]) {
    const campaign = { ...base, contribution: { amount, refunded } };
    const screen = campaignCard(campaign, preview, "en", viewer);
    const badge = nodes(screen.tree).find(node => node.props["data-testid"] === "campaign-donor-badge");
    const eligible = viewer !== null && BigInt(amount) > 0n && !refunded;
    assert.equal(Boolean(badge), eligible);
    if (eligible) {
      assert.equal(badge?.props["data-evidence"], preview ? "example" : "testnet");
      assert.equal(text(badge), preview ? "Example donor" : "Testnet donor");
      assert.ok(text(screen.tree).includes(preview ? "Browser-only example" : "Confirmed by this wallet's D4 contract record"));
    }
    assert.deepEqual(screen.calls, { network: 0, action: 0, storage: 0 });
  }
  for (const amount of ["-1", "1.2", "bad", "", "NaN"]) assert.equal(campaignDonorBadge({ contribution: { amount, refunded: false } }, base.config.creator, false), null);
});

test("confirmed donor labels are four-locale and a pending action does not substitute for a refreshed contribution read", () => {
  const base = previewModule(true).PREVIEW_CAMPAIGNS[0];
  for (const locale of LOCALES) {
    const c = circlesCopy.circlesCopy(locale);
    for (const preview of [true, false]) {
      const screen = campaignCard({ ...base, contribution: { amount: "1", refunded: false } }, preview, locale);
      const badge = nodes(screen.tree).find(node => node.props["data-testid"] === "campaign-donor-badge");
      assert.equal(text(badge), c(preview ? "Example donor" : "Testnet donor"));
    }
  }
  const awaitingRead = campaignCard({ ...base, contribution: { amount: "0", refunded: false } }, false);
  awaitingRead.amount("5"); awaitingRead.review();
  assert.equal(awaitingRead.reviews.length, 1);
  assert.equal(nodes(awaitingRead.tree).some(node => node.props["data-testid"] === "campaign-donor-badge"), false);
  const source = readFileSync(new URL("../app/campaign-actions.ts", import.meta.url), "utf8");
  assert.match(source, /readContract\(contractId, "contribution", \[sc\.u64\(c\.id\), sc\.addr\(viewer\)\]\)/);
});
