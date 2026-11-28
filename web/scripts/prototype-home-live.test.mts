import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { homeCopy } from "../lib/i18n/revamp-home.ts";
import { campaignDiscoveryCopy } from "../lib/i18n/revamp-campaign-discovery.ts";
import { PROTOTYPE_CAUSES } from "../lib/prototype-causes.ts";
import { formatHomeXlm, selectHomeCampaigns } from "../lib/home-campaigns.ts";
import type { Campaign } from "../lib/campaign.ts";

type HomeLiveData = {
  guest: boolean;
  handle: string | null;
  wallet: { address: string; pesos: number; nativeStroops?: string } | null;
  walletLoading: boolean;
  walletError: string;
  campaigns: Omit<Campaign, "contribution">[];
  campaignsNow: string | null;
  campaignsLoading: boolean;
  campaignsError: boolean;
  onRetryWallet: () => void;
  onRetryCampaigns: () => void;
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
      if (name === "@/lib/i18n/revamp-campaign-discovery") return { campaignDiscoveryCopy };
      if (name === "@/lib/home-campaigns") return { formatHomeXlm, selectHomeCampaigns };
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

function campaign(id: string, state: Campaign["state"], fundingDeadline: string, escrow = "178461538"): Omit<Campaign, "contribution"> {
  const address = "GAKZLTZFGSSM372XUKW2ZIJ5GSHVVIW5BYZIKIXRW2BW4MM6TUI5536TUI5536Y";
  return { id, title: `Campaign ${id}`, state, total: escrow, escrow, proofHash: null, proofUrl: "", approvals: [],
    config: { creator: address, beneficiary: address, token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      creator_cut_bps: 0, funding_deadline: fundingDeadline, review_deadline: "3000", approvers: [address, address, address] } };
}

test("local preview renders its sample activity and prototype causes", () => {
  const html = render();
  assert.match(html, /data-testid="prototype-home"/);
  assert.match(html, /SAMPLE/);
  assert.match(html, /href="\/vault\?tab=activity"/);
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
    campaigns: [campaign("103", "Funding", "2000", "15000000")],
    campaignsNow: "1000",
    campaignsLoading: false,
    campaignsError: false,
    onRetryWallet() {},
    onRetryCampaigns() {},
  });
  assert.match(html, /data-testid="home-dashboard"/);
  assert.match(html, /Welcome to Salapi, @edwin/);
  assert.match(html, /href="\/vault\?tab=activity"/);
  assert.match(html, /data-testid="wallet-market-value"[^>]*data-native-stroops="15000000"/);
  assert.match(html, /data-testid="home-donation-ticker"[^>]*data-campaign-ids="103"[^>]*data-loading="false"/);
  assert.match(html, /data-testid="home-campaign-label">TESTNET/);
  assert.match(html, /data-testid="home-live-campaign"[^>]*data-campaign-id="103"/);
  assert.match(html, /href="\/campaigns\?id=103"/);
  assert.match(html, /1\.5 Testnet XLM/);
  assert.doesNotMatch(html, /Bantayan Island|data-testid="home-example-label"/);
  assert.doesNotMatch(html, /EXAMPLES/);
});

test("guest wallet actions route through sign in and never render a wallet value", () => {
  const html = render({
    guest: true,
    handle: null,
    wallet: null,
    walletLoading: false,
    walletError: "",
    campaigns: [],
    campaignsNow: "1000",
    campaignsLoading: true,
    campaignsError: false,
    onRetryWallet() {},
    onRetryCampaigns() {},
  });
  assert.match(html, /Guest account/);
  assert.match(html, /href="\/signin\?next=%2Fsend"/);
  assert.doesNotMatch(html, /data-testid="wallet-market-value"/);
  assert.match(html, /data-testid="home-donation-ticker"[^>]*data-loading="true"/);
  assert.match(html, /Loading Testnet campaigns/);
});

test("live Home selects the newest open campaigns using ledger time and exact escrow display", () => {
  const campaigns = [campaign("12", "Funding", "1200"), campaign("10", "Funding", "1500"),
    campaign("11", "Released", "2500"), campaign("9", "Funding", "900")];
  assert.deepEqual(selectHomeCampaigns(campaigns, "1000").map(item => item.id), ["12", "10"]);
  assert.equal(formatHomeXlm("178461538", "en"), "17.8461538");
  assert.equal(formatHomeXlm("178461538", "id"), "17,8461538");
  assert.equal(formatHomeXlm("not-a-stroop-value", "en"), null);
  assert.deepEqual(selectHomeCampaigns(campaigns, "invalid"), []);
});
