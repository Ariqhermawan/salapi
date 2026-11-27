import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { parse, type Declaration, type Rule } from "postcss";
import { LOCALES, type Locale } from "../lib/i18n/config.ts";
import { homeCopy } from "../lib/i18n/revamp-home.ts";

type LiveData = {
  guest: boolean;
  handle: string | null;
  wallet: { address: string; pesos: number; nativeStroops?: string } | null;
  walletLoading: boolean;
  walletError: string;
  campaigns: { id: string; title: string }[];
  campaignsLoading: boolean;
  onRetryWallet: () => void;
};

const source = readFileSync(new URL("../components/screens/PrototypeHomeScreen.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const icon = () => null;
const icons = new Proxy({}, { get: () => icon });

function render(locale: Locale, liveData?: LiveData) {
  const screen = {} as { default: React.ComponentType<{ liveData?: LiveData }> };
  runInNewContext(code, {
    exports: screen,
    require(name: string) {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "next/link") return { default: ({ href, children, ...props }: Record<string, unknown>) => React.createElement("a", { href, ...props }, children as React.ReactNode) };
      if (name === "next/image") return { default: (props: Record<string, unknown>) => {
        const { src, alt, width, height, fill, priority, sizes, ...imageProps } = props;
        void fill; void priority; void sizes;
        return React.createElement("img", { src, alt, width, height, ...imageProps });
      } };
      if (name === "next/navigation") return { usePathname: () => "/", useSearchParams: () => new URLSearchParams() };
      if (name === "@phosphor-icons/react") return icons;
      if (name === "@/lib/prototype-causes") return { PROTOTYPE_CAUSES: [] };
      if (name === "@/lib/local-preview") return { previewReferralNoticeIsNew: () => false, previewUsdcBalanceCents: () => 241_226 };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale }) };
      if (name === "@/lib/i18n/revamp-home") return { homeCopy };
      if (name === "@/components/MarketValue") return { default: () => React.createElement("div") };
      if (name === "@/components/HomeDonationTicker") return { default: () => React.createElement("div") };
      if (name === "./PrototypeHomeScreen.module.css") return { default: new Proxy({}, { get: (_target, key) => String(key) }) };
      throw new Error(`Unexpected Home dependency: ${name}`);
    },
  });
  return renderToStaticMarkup(React.createElement(screen.default, { liveData }));
}

const actions = [
  { href: "/topup", label: "Top up" },
  { href: "/withdraw", label: "Withdraw" },
  { href: "/send", label: "Send" },
  { href: "/receive", label: "Receive" },
];
const actionLinks = (html: string) => [...html.matchAll(/<a\b[^>]*class="action"[^>]*>/g)].map(([tag]) => ({
  label: tag.match(/aria-label="([^"]+)"/)?.[1] ?? "",
  href: tag.match(/href="([^"]+)"/)?.[1] ?? "",
}));
const emptyLiveData = (guest = false): LiveData => ({
  guest, handle: null, wallet: null, walletLoading: false, walletError: "",
  campaigns: [], campaignsLoading: false, onRetryWallet() {},
});

test("prototype Home exposes four native wallet links in preview and live modes across all locales", () => {
  for (const locale of LOCALES) for (const liveData of [undefined, emptyLiveData()]) {
    const html = render(locale, liveData);
    const rail = html.match(/<nav class="actions" aria-label="([^"]+)"/);
    assert.equal(rail?.[1], homeCopy(locale, "Wallet actions"));
    const links = actionLinks(html);
    assert.deepEqual(links.map(link => link.label), actions.map(action => homeCopy(locale, action.label)));
    assert.deepEqual(links.map(link => link.href), actions.map(action => action.href));
  }
});

test("guest wallet links keep native navigation and route through sign-in", () => {
  const html = render("en", emptyLiveData(true));
  const links = actionLinks(html);
  assert.deepEqual(links.map(link => link.href), actions.map(action => `/signin?next=${encodeURIComponent(action.href)}`));
});

test("prototype wallet action links remain large enough to tap", () => {
  const css = parse(readFileSync(new URL("../components/screens/PrototypeHomeScreen.module.css", import.meta.url), "utf8"));
  const actionRules: Rule[] = [];
  css.walkRules(rule => { if (rule.selectors.includes(".action")) actionRules.push(rule); });
  const minHeight = (rule: Rule) => rule.nodes.filter((node): node is Declaration => node.type === "decl" && node.prop === "min-height").at(-1)?.value;
  assert.ok(actionRules.some(rule => Number.parseFloat(minHeight(rule) ?? "0") >= 44));
});
