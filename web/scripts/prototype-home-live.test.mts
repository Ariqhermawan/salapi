import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { homeCopy } from "../lib/i18n/revamp-home.ts";
import { PROTOTYPE_CAUSES } from "../lib/prototype-causes.ts";

type HomeLiveData = {
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

function render(liveData?: HomeLiveData) {
  const screen = {} as { default: React.ComponentType<{ liveData?: HomeLiveData }> };
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
      if (name === "@/lib/prototype-causes") return { PROTOTYPE_CAUSES };
      if (name === "@/lib/local-preview") return { previewReferralNoticeIsNew: () => false, previewUsdcBalanceCents: () => 241_226 };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale: "en" }) };
      if (name === "@/lib/i18n/revamp-home") return { homeCopy };
      if (name === "@/components/MarketValue") return { default: (props: Record<string, unknown>) => React.createElement("div", {
        "data-testid": "wallet-market-value",
        "data-native-stroops": props.nativeStroops ?? "",
        "data-loading": String(props.balanceLoading),
      }, props.dashboardBalanceError as React.ReactNode) };
      if (name === "@/components/HomeDonationTicker") return { default: (props: Record<string, unknown>) => {
        const campaigns = props.campaigns as { id: string }[];
        return React.createElement("div", {
          "data-testid": "home-donation-ticker",
          "data-campaign-ids": campaigns.map(campaign => campaign.id).join(","),
          "data-loading": String(props.loading),
        }, "Recent campaign activity");
      } };
      if (name === "./PrototypeHomeScreen.module.css") return { default: new Proxy({}, { get: (_target, key) => String(key) }) };
      throw new Error(`Unexpected Home dependency: ${name}`);
    },
  });
  return renderToStaticMarkup(React.createElement(screen.default, { liveData }));
}

test("local preview renders its sample activity and prototype causes", () => {
  const html = render();
  assert.match(html, /data-testid="prototype-home"/);
  assert.match(html, /SAMPLE/);
  assert.match(html, /Bantayan Island/);
  assert.doesNotMatch(html, /data-testid="home-donation-ticker"/);
});

test("live Home uses its Testnet wallet and campaign reads instead of sample activity", () => {
  const html = render({
    guest: false,
    handle: "edwin",
    wallet: { address: "GTEST", pesos: 1000, nativeStroops: "15000000" },
    walletLoading: false,
    walletError: "",
    campaigns: [{ id: "103", title: "Bantayan Testnet relief" }],
    campaignsLoading: false,
    onRetryWallet() {},
  });
  assert.match(html, /data-testid="home-dashboard"/);
  assert.match(html, /Welcome to Salapi, @edwin/);
  assert.match(html, /data-testid="wallet-market-value"[^>]*data-native-stroops="15000000"/);
  assert.match(html, /data-testid="home-donation-ticker"[^>]*data-campaign-ids="103"[^>]*data-loading="false"/);
  assert.doesNotMatch(html, /SAMPLE/);
});

test("guest wallet actions route through sign in and never render a wallet value", () => {
  const html = render({
    guest: true,
    handle: null,
    wallet: null,
    walletLoading: false,
    walletError: "",
    campaigns: [],
    campaignsLoading: true,
    onRetryWallet() {},
  });
  assert.match(html, /Guest account/);
  assert.match(html, /href="\/signin\?next=%2Fsend"/);
  assert.doesNotMatch(html, /data-testid="wallet-market-value"/);
  assert.match(html, /data-testid="home-donation-ticker"[^>]*data-loading="true"/);
});
