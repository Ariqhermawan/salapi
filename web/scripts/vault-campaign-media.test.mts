import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PREVIEW_CAMPAIGNS, PREVIEW_TIME, PREVIEW_WALLET } from "../lib/local-preview.ts";
import { formatLocal } from "../lib/ui/currency.ts";
import { formatStroops } from "../lib/format-stroops.ts";
import type { Campaign } from "../lib/campaign.ts";
import type { Locale } from "../lib/i18n/config.ts";
import { homeCopy } from "../lib/i18n/revamp-home.ts";

type Media = { coverSrc: string; gallery: { src: string; alt: string; caption: string }[]; organizerName: string; organizerPhotoSrc: string; organizerHref: string };
type Element = { type: string; props: Record<string, unknown> };
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
function transpile(path: string, jsx = false) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
  }).outputText;
}
const media = {} as { vaultCampaignMedia(campaign: Campaign, preview: boolean): Media | null };
runInNewContext(transpile("../lib/vault-campaign-media.ts"), { exports: media, require(name: string) {
  assert.equal(name, "./local-preview"); return { PREVIEW_CAMPAIGNS };
} });
const code = transpile("../components/screens/VaultsScreen.tsx", true);

const mapping = [
  { id: "101", cause: "tino-relief", organizer: "Maria S." },
  { id: "102", cause: "ate-mei-dialysis", organizer: "Mei's family" },
  { id: "103", cause: "barangay-library", organizer: "Teachers' Circle, Tubigon" },
];

// Render the actual Vaults UI with isolated hydrated state. Effects are not
// executed: no browser, auth, account provisioning, RPC, network or storage can
// run. The same ID/title data is deliberately supplied in flag0 negative cases.
function screen(options: { preview?: boolean; campaigns?: Campaign[]; locale?: Locale } = {}) {
  const preview = options.preview ?? true;
  const locale = options.locale ?? "en";
  const campaigns = options.campaigns ?? PREVIEW_CAMPAIGNS;
  const states: unknown[] = [];
  let cursor = 0;
  const calls = { actions: 0, network: 0, storage: 0 };
  const forbidden = (kind: keyof typeof calls) => () => { calls[kind]++; throw Error(`Forbidden ${kind} in isolated Vaults media test`); };
  const component = {} as { default(): Element };
  const jsx = (type: unknown, props: Record<string, unknown>): Element => ({ type: String(type), props });
  const icons = new Proxy({}, { get: () => () => null });
  const styles = new Proxy({}, { get: (_target, key) => String(key) });
  runInNewContext(code, {
    exports: component, process: { env: { NEXT_PUBLIC_LOCAL_PREVIEW: preview ? "1" : "0" } },
    fetch: forbidden("network"), XMLHttpRequest: forbidden("network"),
    sessionStorage: { getItem: forbidden("storage"), setItem: forbidden("storage"), removeItem: forbidden("storage") },
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react") return {
        useState(initial: unknown) {
          const index = cursor++;
          if (!(index in states)) {
            if (index === 1) states[index] = { ok: true, viewer: PREVIEW_WALLET.address, contractId: "Isolated test fixture", now: String(PREVIEW_TIME), campaigns };
            else if (index === 4) states[index] = false;
            else states[index] = typeof initial === "function" ? initial() : initial;
          }
          return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
        },
        useEffect() {}, useCallback: (callback: unknown) => callback,
      };
      if (name === "next/link") return { default: "Link" };
      if (name === "next/image") return { default: "Image" };
      if (name === "@/components/I18nProvider") return { useT: () => ({ currency: "en", locale }) };
      if (name === "@/lib/i18n/revamp-home") return { homeCopy };
      if (name === "@/components/ui/kit") return { Ico: icons, T: {}, PoweredByStellar: "PoweredByStellar" };
      if (name === "@/lib/ui/currency") return { formatLocal };
      if (name === "@/lib/format-stroops") return { formatStroops };
      if (name === "@/lib/vault-campaign-media") return media;
      if (name === "@/lib/local-preview") return { PREVIEW_CAMPAIGNS, PREVIEW_TIME, PREVIEW_WALLET, normalizePreviewCampaigns: (values: Campaign[]) => values };
      if (name === "./arisan-preview") return { readPreviewArisanRoom: forbidden("storage") };
      if (name.endsWith(".module.css")) return { default: styles };
      if (name === "@/app/vault-read-actions") return { vaultOverview: forbidden("actions") };
      throw Error(`Unexpected actual Vaults dependency: ${name}`);
    },
  });
  const tree = component.default();
  return { tree, calls, cards: nodes(tree).filter(node => node.type === "article" && String(node.props["aria-labelledby"] ?? "").startsWith("vault-campaign-")) };
}

test("media resolves only the three canonical explicit local campaign fixtures without mutation", () => {
  const before = JSON.stringify(PREVIEW_CAMPAIGNS);
  for (const example of mapping) {
    const campaign = PREVIEW_CAMPAIGNS.find(campaign => campaign.id === example.id)!;
    const result = media.vaultCampaignMedia(campaign, true); assert.ok(result);
    assert.equal(result.coverSrc, `/circles/generated/${example.cause}.png`);
    assert.equal(result.organizerName, example.organizer);
    assert.equal(result.organizerHref, `/circles/${example.cause}/organizer`);
  }
  assert.equal(JSON.stringify(PREVIEW_CAMPAIGNS), before);
});

test("flag0 never binds fictional media even when live ID and title exactly match a demo", () => {
  for (const campaign of PREVIEW_CAMPAIGNS) assert.equal(media.vaultCampaignMedia(campaign, false), null);
  const ui = screen({ preview: false }); assert.equal(ui.cards.length, 3);
  for (const card of ui.cards) {
    const id = String(card.props["aria-labelledby"]).replace("vault-campaign-", "");
    const campaign = PREVIEW_CAMPAIGNS.find(campaign => campaign.id === id)!;
    assert.equal(nodes(card).some(node => node.type === "Image"), false);
    assert.equal(nodes(card).some(node => node.type === "Link" && String(node.props.href).startsWith("/circles/")), false);
    assert.ok(nodes(card).some(node => node.type === "a" && node.props.href === `https://stellar.expert/explorer/testnet/account/${campaign.config.creator}`));
    assert.match(text(card), /Organizer wallet|Campaign photo not provided/);
    assert.doesNotMatch(text(card), /Maria S\.|Mei's family|Teachers' Circle|Fictional organizer example/);
  }
  assert.deepEqual(ui.calls, { actions: 0, network: 0, storage: 0 });
});

test("every canonical local D4 fixture has three distinct, existing, explicitly illustrative gallery scenes", () => {
  for (const campaign of PREVIEW_CAMPAIGNS) {
    const result = media.vaultCampaignMedia(campaign, true)!;
    assert.equal(result.gallery.length, 3);
    assert.equal(new Set(result.gallery.map(photo => photo.src)).size, 3);
    assert.equal(result.gallery[0].src, result.coverSrc);
    for (const photo of result.gallery) {
      assert.match(photo.alt, /AI.*not verified campaign evidence/);
      assert.match(photo.caption, /not documentary evidence|Not a photo of this campaign/);
      const bytes = readFileSync(new URL(`../public${photo.src}`, import.meta.url));
      assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    }
  }
});

test("unknown local ID and changed title or creator cannot rebind canonical portraits and profiles", () => {
  const original = PREVIEW_CAMPAIGNS[0];
  const changed = [
    { ...original, id: "900001" },
    { ...original, title: "A custom local campaign" },
    { ...original, config: { ...original.config, creator: PREVIEW_CAMPAIGNS[1].config.creator } },
  ];
  for (const campaign of changed) {
    assert.equal(media.vaultCampaignMedia(campaign, true), null);
    const ui = screen({ campaigns: [campaign] }); assert.equal(ui.cards.length, 1);
    const card = ui.cards[0];
    assert.equal(nodes(card).some(node => node.type === "Image"), false);
    assert.equal(nodes(card).some(node => String(node.props.href ?? "").startsWith("/circles/")), false);
    assert.ok(nodes(card).some(node => node.type === "a" && node.props.href === `https://stellar.expert/explorer/testnet/account/${campaign.config.creator}`));
    assert.deepEqual(ui.calls, { actions: 0, network: 0, storage: 0 });
  }
});

test("actual local campaign cards contain decorative cover, visibly fictional organizer and descriptive portrait", () => {
  const ui = screen(); assert.equal(ui.cards.length, 3);
  for (const example of mapping) {
    const card = ui.cards.find(card => card.props["aria-labelledby"] === `vault-campaign-${example.id}`)!;
    const result = media.vaultCampaignMedia(PREVIEW_CAMPAIGNS.find(campaign => campaign.id === example.id)!, true)!;
    const header = nodes(card).find(node => node.type === "header")!;
    assert.equal(header.props["data-has-photo"], true);
    const cover = nodes(header).find(node => node.type === "Image")!;
    assert.equal(cover.props.src, result.coverSrc); assert.equal(cover.props.alt, ""); assert.equal(cover.props.fill, true);
    const profile = nodes(card).find(node => node.type === "Link" && node.props.href === result.organizerHref)!;
    assert.ok(profile); assert.match(text(profile), /Fictional organizer example/); assert.ok(text(profile).includes(example.organizer));
    const portrait = nodes(profile).find(node => node.type === "Image")!;
    assert.equal(portrait.props.src, result.organizerPhotoSrc); assert.equal(portrait.props.width, 44); assert.equal(portrait.props.height, 44);
    assert.equal(portrait.props.alt, "Illustrative profile photo, not a verified identity");
    assert.ok(String(profile.props["aria-label"]).includes(example.organizer));
  }
  assert.deepEqual(ui.calls, { actions: 0, network: 0, storage: 0 });
});

test("media presentation preserves campaign escrow, proof status, campaign actions and existing arisan classes", () => {
  for (const preview of [true, false]) {
    const ui = screen({ preview });
    for (const campaign of PREVIEW_CAMPAIGNS) {
      const card = ui.cards.find(card => card.props["aria-labelledby"] === `vault-campaign-${campaign.id}`)!;
      assert.ok(text(card).includes(campaign.title));
      assert.ok(text(card).includes(`${formatStroops(campaign.escrow)} Testnet XLM in escrow`));
      assert.ok(nodes(card).some(node => node.type === "Link" && node.props.href === `/campaigns?id=${campaign.id}` && text(node).includes("View campaign")));
      if (campaign.state === "PendingProof") { assert.match(text(card), /Proof review/); assert.match(text(card), /1 of 2 required approvals/); }
      else assert.ok(text(card).includes(campaign.state));
      assert.equal(String(card.props.className).includes("personalVault"), false, "Photo campaigns must not inherit arisan's grid layout");
    }
    if (preview) {
      const rooms = nodes(ui.tree).filter(node => node.type === "article" && String(node.props.className).includes("arisanVault"));
      assert.equal(rooms.length, 2); assert.ok(rooms.every(room => String(room.props.className).includes("personalVault")));
      assert.ok(nodes(ui.tree).some(node => node.type === "Link" && node.props.href === "/arisan/1"));
    }
    assert.deepEqual(ui.calls, { actions: 0, network: 0, storage: 0 });
  }
});

test("all referenced campaign images and organizer portraits or logos exist with usable dimensions", () => {
  const covers = new Set<string>();
  for (const campaign of PREVIEW_CAMPAIGNS) {
    const result = media.vaultCampaignMedia(campaign, true)!;
    covers.add(result.coverSrc);
    for (const path of [result.coverSrc, result.organizerPhotoSrc]) {
      assert.match(path, /^\/circles\/((generated\/)?[a-z0-9-]+\.png|organizers\/[a-z0-9-]+\.svg)$/);
      const bytes = readFileSync(new URL(`../public${path}`, import.meta.url));
      if (path.endsWith(".svg")) {
        assert.match(bytes.toString(), /viewBox="0 0 96 96"/);
        assert.match(bytes.toString(), /Fictional.*logo/);
        continue;
      }
      assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
      assert.ok(width >= 44 && height >= 44);
      if (path === result.coverSrc) { assert.equal(width, 1536); assert.equal(height, 1024); }
    }
  }
  assert.equal(covers.size, 3);
});

test("new photo and profile labels render in four locales without changing names or financial values", () => {
  const labels: Record<Locale, string> = {
    en: "Fictional organizer example", tl: "Halimbawang kathang-isip na organizer", id: "Contoh penyelenggara fiktif", vi: "Nhà tổ chức hư cấu mẫu",
  };
  for (const locale of ["en", "tl", "id", "vi"] as const) {
    const ui = screen({ locale });
    for (const example of mapping) {
      const card = ui.cards.find(card => card.props["aria-labelledby"] === `vault-campaign-${example.id}`)!;
      assert.ok(text(card).includes(labels[locale])); assert.ok(text(card).includes(example.organizer));
      assert.ok(text(card).includes(formatStroops(PREVIEW_CAMPAIGNS.find(campaign => campaign.id === example.id)!.escrow)));
      assert.ok(nodes(card).some(node => node.type === "Link" && node.props.href === `/campaigns?id=${example.id}`));
    }
    assert.deepEqual(ui.calls, { actions: 0, network: 0, storage: 0 });
  }
});
