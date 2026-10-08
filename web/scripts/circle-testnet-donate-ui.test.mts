import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { circleDonationAmount, circleDonationTerms, type CircleDonationInput, type CircleDonationResult } from "../lib/circles/donation.ts";
import { campaignDonorComment, type CampaignDonorInput, type CampaignDonorRecordResult } from "../lib/campaign-donor.ts";
import { campaignSplit } from "../lib/campaign-money.ts";
import { formatStroops } from "../lib/format-stroops.ts";
import { circleTestnetDonateCopy, type CircleTestnetDonateMessage } from "../lib/i18n/circle-testnet-donate.ts";
import type { Circle } from "../lib/circles/types.ts";
import type { CircleTestnetCampaignResult } from "../lib/circles/testnet.ts";
import type { SignupIdentityState } from "../lib/ui/useCirclesSignupIdentity.ts";
import type { SubmissionResult } from "../lib/ui/unresolved-submission.ts";
import type { Locale } from "../lib/i18n/config.ts";

const owner = "00000000-0000-4000-8000-000000000001", other = "00000000-0000-4000-8000-000000000002";
const contract = "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU";
const wallet = "GDWYDMY2WDL4MCKMYQ6CWZJP526K6YHLRK3EG6IF2IJTX3EHZU3RRB72";
const beneficiary = "GCBKRBBNTQ2YA7U7SOC2NTZCCACFIIQCLKKO2FJYL5WJP5QVYH6UNDHL";
const token = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const hash = "a".repeat(64);
const circle: Circle = { id: "tino-relief", title: "Tino survivors, Cebu - rebuild a fishing barangay", organizer: "Maria S.",
  organizerLocation: "Cebu, PH", category: "disaster", story: "Fictional QA cause", pesoRaised: 0, pesoTarget: 1,
  donorCount: 0, daysRemaining: 2, coverGradient: ["#fff", "#eef"], recentDonations: [] };
const verified = (id = owner): SignupIdentityState => ({ status: "verified", ownerId: id, email: `${id === owner ? "fixture" : "other"}@example.invalid`, source: "google" });
function readyMapping(id = "100"): Extract<CircleTestnetCampaignResult, { ok: true }> {
  const mapping = { campaignId: id, creatorWallet: wallet, beneficiaryWallet: beneficiary, approverWallets: [wallet, beneficiary, wallet],
    creatorCutBps: 500, fundingDeadline: "1792000000", reviewDeadline: "1793000000" };
  return { ok: true, available: true, network: "testnet", contractId: contract, circleId: circle.id, qaLabel: "QA Testnet · fictional cause",
    status: "ready", donationOpen: true, mapping, now: "1791000000", campaign: { id, title: `QA Circles: ${circle.id}`, state: "Funding",
      config: { creator: wallet, beneficiary, token, creator_cut_bps: mapping.creatorCutBps, approvers: mapping.approverWallets,
        funding_deadline: mapping.fundingDeadline, review_deadline: mapping.reviewDeadline }, total: "0", escrow: "0", proofHash: null, proofUrl: "", approvals: [] } };
}
const confirmed = (campaignId = "100", ownerId = owner): Extract<CircleDonationResult, { ok: true }> => ({ ok: true, hash, link: `https://stellar.expert/explorer/testnet/tx/${hash}`, campaignId, ownerId });
const saved = (ownerId = owner): Extract<CampaignDonorRecordResult, { ok: true }> => ({ ok: true, status: "recorded", ownerId, campaignId: "100", hash });
const missingMetadata: CampaignDonorRecordResult = { ok: false, campaignId: "100", hash, code: "not_configured", donationConfirmed: true, retryMetadataOnly: true };
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function flush() { for (let n = 0; n < 20; n++) await Promise.resolve(); }
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const source = readFileSync(new URL("../components/CircleTestnetDonate.tsx", import.meta.url), "utf8");
const code = compile("../components/CircleTestnetDonate.tsx");
type Options = { locale?: Locale; identity?: SignupIdentityState; mapping?: CircleTestnetCampaignResult | null; mappingLoading?: boolean; locked?: boolean; storedHash?: string | null; guardNull?: boolean; deferMappingRefresh?: boolean; statusResult?: SubmissionResult; statusError?: boolean };
// Actual component handlers/JSX and exact money/terms helpers execute here.
// Mapping, Auth, unresolved-submission and action transport boundaries alone
// are isolated fixtures. These tests are not Gmail/browser/on-chain E2E proof.
function setup(options: Options = {}) {
  const locale = options.locale ?? "en", text = circleTestnetDonateCopy(locale);
  let identity = options.identity ?? verified(), result = options.mapping === undefined ? readyMapping() : options.mapping;
  let guardLocked = options.locked ?? false, alive = true, revision = 0, resetOwner: (() => void) | undefined;
  let guardHash = guardLocked ? options.storedHash === undefined ? hash : options.storedHash : null, guardNotice = "";
  const cells: unknown[] = [], transitions: Promise<unknown>[] = [];
  let index = 0, transitionPending = 0;
  const calls = { guardRuns: 0, guardChecks: 0, mappingRefresh: 0, identityRefresh: 0, backs: 0, clearVerified: [] as string[], order: [] as string[] };
  const donations: { payload: CircleDonationInput; response: ReturnType<typeof deferred<CircleDonationResult>> }[] = [];
  const metadata: { id: string; input: CampaignDonorInput; response: ReturnType<typeof deferred<CampaignDonorRecordResult>> }[] = [];
  const mappingRefreshes: ReturnType<typeof deferred<CircleTestnetCampaignResult | null>>[] = [];
  const dummy = (label: string) => function FixtureSection({ children }: { children?: React.ReactNode }) { return React.createElement("section", { "data-fixture": label }, children ?? label); };
  const panelExports = {} as { default: (props: Record<string, unknown>) => React.ReactElement | null };
  runInNewContext(compile("../components/ui/SubmissionStatusPanel.tsx"), { exports: panelExports,
    require(name: string) {
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "next/link") return { __esModule: true, default: (props: { href: string; children: React.ReactNode }) => React.createElement("a", { href: props.href }, props.children) };
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
      throw Error(`Unexpected actual status-panel dependency ${name}`);
    },
  });
  const StatusPanel = panelExports.default;
  const exports = {} as { default: (props: { circle: Circle }) => React.ReactElement };
  runInNewContext(code, { exports, Buffer, BigInt, JSON,
    fetch: () => { throw Error("Network forbidden in isolated UI tests"); },
    require(name: string) {
      if (name === "react") return {
        useState(initial: unknown) { const position = index++; if (!(position in cells)) cells[position] = typeof initial === "function" ? initial() : initial;
          return [cells[position], (value: unknown) => { cells[position] = typeof value === "function" ? value(cells[position]) : value; }]; },
        useRef(initial: unknown) { const position = index++; return cells[position] ?? (cells[position] = { current: initial }); },
        useTransition() { return [transitionPending > 0, (action: () => Promise<unknown>) => {
          transitionPending++; const pending = Promise.resolve(action()).finally(() => { transitionPending--; }); transitions.push(pending);
        }]; },
      };
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "next/link") return { __esModule: true, default: (props: { href: string; children: React.ReactNode }) => React.createElement("a", { href: props.href }, props.children) };
      if (name === "@/app/circle-donation-actions") return { donateCircleTestnet(payload: CircleDonationInput) {
        const response = deferred<CircleDonationResult>(); donations.push({ payload: structuredClone(payload), response }); return response.promise;
      } };
      if (name === "@/app/campaign-donor-actions") return { campaignDonorRecord(id: string, input: CampaignDonorInput) {
        calls.order.push("metadata"); const response = deferred<CampaignDonorRecordResult>(); metadata.push({ id, input: structuredClone(input), response }); return response.promise;
      } };
      if (name === "@/lib/circles/donation") return { circleDonationAmount, circleDonationTerms };
      if (name === "@/lib/campaign-donor") return { campaignDonorComment };
      if (name === "@/lib/ui/useCircleTestnet") return { useCircleTestnet(id: string) {
        assert.equal(id, circle.id); return { result, loading: options.mappingLoading ?? false, refresh: async () => {
          calls.mappingRefresh++; calls.order.push("mapping-refresh");
          if (!options.deferMappingRefresh) return result;
          const pending = deferred<CircleTestnetCampaignResult | null>(); mappingRefreshes.push(pending); return pending.promise;
        } };
      } };
      if (name === "@/lib/ui/useCirclesSignupIdentity") return { useCirclesSignupIdentity(reset: () => void) {
        resetOwner ??= reset; return { identity, refresh: () => { calls.identityRefresh++; }, captureOwnerRevision: () => revision, isCurrentOwner: (captured: number) => alive && captured === revision };
      } };
      if (name === "@/lib/ui/useUnresolvedSubmission") return { useUnresolvedSubmission(context: string, guardOptions?: { keepSuccessLocked?: boolean }) {
        assert.equal(context, `circle-donate:${circle.id}`);
        assert.equal(guardOptions?.keepSuccessLocked, true, "Native donation must opt into recoverable success locking");
        return { locked: guardLocked, state: guardLocked ? { kind: "locked", record: { id: "fixture", hash: guardHash } } : { kind: "clear" }, notice: guardNotice, checking: false,
          async run(action: () => Promise<CircleDonationResult>) {
            calls.guardRuns++; if (guardLocked) return null;
            guardLocked = true;
            if (options.guardNull) return null;
            try { const response = await action(); if (response.hash) guardHash = response.hash;
              if (!(response.ok && guardOptions?.keepSuccessLocked) && (response.ok || !response.pending)) { guardLocked = false; guardHash = null; } return response; }
            catch { return null; }
          },
          async check() {
            calls.guardChecks++; calls.order.push("guard-check");
            if (!guardLocked || !guardHash || options.statusError) return false;
            const response = options.statusResult ?? { ok: true, hash: guardHash };
            if (response.hash) guardHash = response.hash;
            if (!(response.ok && guardOptions?.keepSuccessLocked) && !response.pending) { guardLocked = false; guardHash = null; }
            guardNotice = response.pending ? "Testnet has not returned a definitive result. Retry remains locked." : response.ok
              ? "Testnet confirms success. The recovery safeguard remains locked until the feature verifies and saves its receipt. Do not send again."
              : "Testnet reports a definitive failure. Refresh the feature state before another attempt.";
            return !response.pending;
          },
          clearVerified(verifiedHash: string) {
            calls.clearVerified.push(verifiedHash); calls.order.push("clear-verified");
            if (!guardOptions?.keepSuccessLocked || !/^[a-f0-9]{64}$/.test(verifiedHash) || !guardLocked || guardHash !== verifiedHash) return false;
            guardLocked = false; guardHash = null; guardNotice = ""; return true;
          },
        };
      } };
      if (name === "@/lib/ui/useGoBack") return { useGoBack(fallback: string) { assert.equal(fallback, `/circles/${circle.id}`); return () => { calls.backs++; }; } };
      if (name === "@/lib/format-stroops") return { formatStroops };
      if (name === "@/lib/campaign-money") return { campaignSplit };
      if (name === "@/components/CircleTestnetSummary") return { __esModule: true, default: dummy("mapping-summary") };
      if (name === "@/components/CampaignDonorActivity") return { __esModule: true, default: dummy("donor-feed") };
      if (name === "@/components/CampaignUpdateSubscription") return { __esModule: true, default: dummy("updates-subscription") };
      if (name === "@/components/ui/SubmissionStatusPanel") return { __esModule: true, default: StatusPanel };
      if (name === "@/components/ui/SuccessMotion") return { __esModule: true, default: (props: { title: string; children: React.ReactNode }) => React.createElement("section", { "data-success-motion": true }, React.createElement("strong", {}, props.title), props.children) };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale }) };
      if (name === "@/lib/i18n/circle-testnet-donate") return { circleTestnetDonateCopy };
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
      throw Error(`Unexpected dependency ${name}`);
    },
  });
  function render() { index = 0; return exports.default({ circle }); }
  function nodes(value: unknown): React.ReactElement<Record<string, unknown>>[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!React.isValidElement<Record<string, unknown>>(value)) return [];
    return [value, ...nodes(value.props.children)];
  }
  const all = () => nodes(render());
  function button(message: CircleTestnetDonateMessage) {
    const value = all().find(node => node.type === "button" && node.props.children === text(message)); assert.ok(value, `Actual button ${message} must exist`); return value;
  }
  function field(id: string) { const value = all().find(node => node.props.id === id); assert.ok(value, `Actual field ${id} must exist`); return value; }
  function checkbox(label: CircleTestnetDonateMessage) {
    const value = all().find(node => node.type === "label" && Array.isArray(node.props.children) && node.props.children.includes(text(label))); assert.ok(value);
    const input = nodes(value.props.children).find(node => node.type === "input" && node.props.type === "checkbox"); assert.ok(input); return input;
  }
  function change(node: React.ReactElement<Record<string, unknown>>, value: string | boolean) {
    (node.props.onChange as (event: { target: { value?: string; checked?: boolean } }) => void)({ target: typeof value === "boolean" ? { checked: value } : { value } });
  }
  const click = (message: CircleTestnetDonateMessage) => (button(message).props.onClick as () => void)();
  function statusRefreshHandler() {
    const panel = all().find(node => node.type === StatusPanel); assert.ok(panel, "Actual reconciliation callback must exist");
    return panel.props.onRefresh as () => Promise<void>;
  }
  function statusPanelButton(label: "Check submitted status" | "Refresh feature state") {
    const panel = all().find(node => node.type === StatusPanel); assert.ok(panel);
    const value = nodes(StatusPanel(panel.props)).find(node => node.type === "button" && node.props.children === label); assert.ok(value, `Actual status-panel button ${label} must exist`); return value;
  }
  const checkSubmittedStatus = () => (statusPanelButton("Check submitted status").props.onClick as () => Promise<void>)();
  return { render, nodes, all, button, field, checkbox, change, click, statusRefreshHandler, statusPanelButton, checkSubmittedStatus, donations, metadata, mappingRefreshes, calls, transitions, text,
    panelHtml(confirmedHash?: string) {
      const panel = all().find(node => node.type === StatusPanel); assert.ok(panel);
      return renderToStaticMarkup(StatusPanel({ ...panel.props, confirmedHash }));
    },
    guardSnapshot: () => ({ locked: guardLocked, hash: guardHash }),
    html: () => renderToStaticMarkup(render()), setMapping(value: CircleTestnetCampaignResult | null) { result = value; },
    setIdentity(value: SignupIdentityState) { revision++; identity = value; resetOwner?.(); }, cleanup() { alive = false; revision++; },
  };
}
async function settle(h: ReturnType<typeof setup>) { await Promise.all(h.transitions); await flush(); }
function review(h: ReturnType<typeof setup>, amount = "1.0000001", comment = "Test donation") {
  h.change(h.field("circle-testnet-amount"), amount); h.change(h.field("circle-testnet-comment"), comment); h.click("Review Testnet donation");
  assert.equal(h.donations.length, 0, "Review never moves money"); assert.equal(h.metadata.length, 0, "Review never writes donor metadata");
}

test("compact review preserves exact splits, privacy and fee while retaining full technical details", () => {
  const h = setup(); review(h, "10", "Review comment");
  const all = h.all(), card = all.find(node => node.type === "section" && node.props["aria-label"] === "Review Testnet donation");
  assert.ok(card);
  const detail = h.nodes(card).find(node => node.type === "details"); assert.ok(detail);
  assert.equal(detail.props.open, undefined);
  const html = h.html(), detailHtml = renderToStaticMarkup(detail);
  assert.match(html, /9\.5 XLM/); assert.match(html, /0\.5 XLM/); assert.match(html, /\(5%\)/);
  assert.match(html, /Your wallet also pays a Stellar network fee in XLM/);
  assert.match(html, /Wallet, @username and permitted photo/);
  assert.match(html, /Test tokens go to a QA wallet/);
  assert.match(detailHtml, /Review comment/); assert.ok(detailHtml.includes(beneficiary));
  assert.match(detailHtml, /does not send USDC/); assert.match(detailHtml, /refund rules apply/);
  assert.doesNotMatch(html, /<h1>Test a donation/);
  const dock = all.find(node => node.props["data-testid"] === "donation-review-actions"); assert.ok(dock);
  assert.equal(h.nodes(dock).filter(node => node.type === "button").length, 2);
  assert.equal(all.filter(node => node.type === "button" && node.props.children === "Confirm Testnet donation").length, 1);
  h.click("Change amount");
  assert.equal(h.field("circle-testnet-amount").props.value, "10");
  assert.equal(h.field("circle-testnet-comment").props.value, "Review comment");
  assert.ok(!h.all().some(node => node.props["data-testid"] === "donation-review-actions"));
  assert.equal(h.donations.length, 0); assert.equal(h.metadata.length, 0);
});

test("entering review resets the app scroller and focuses its heading, never confirm or finance", () => {
  const h = setup(); review(h);
  const heading = h.all().find(node => node.type === "h1"); assert.ok(heading);
  assert.equal(heading.props.children, "Review before sending"); assert.equal(heading.props.tabIndex, -1);
  const effects: unknown[] = [];
  const ref = heading.props.ref as (node: unknown) => void;
  ref({ focus: (options: unknown) => effects.push(["focus", options]), closest: (selector: string) => {
    effects.push(["closest", selector]); return { scrollTo: (options: unknown) => effects.push(["scroll", options]) };
  } });
  assert.deepEqual(JSON.parse(JSON.stringify(effects)), [
    ["focus", { preventScroll: true }], ["closest", "main"], ["scroll", { top: 0, behavior: "instant" }],
  ]);
  ref(null); assert.equal(effects.length, 3);
  assert.equal(h.donations.length, 0); assert.equal(h.metadata.length, 0);
});

test("new donation defaults to a public permitted profile and discloses it before collapsed options", () => {
  const h = setup(); assert.equal(h.checkbox("Display anonymously in the donor feed").props.checked, false);
  assert.equal(h.checkbox("Also publish my available @username and permitted profile photo for this donation").props.checked, true);
  const html = h.html(); assert.match(html, /QA wallets receive test tokens/); assert.match(html, /does not send USDC/); assert.match(html, /up to 7 decimal places/);
  assert.match(html, /Your wallet, available @username and permitted profile photo will be public/);
  assert.ok(html.indexOf('data-testid="donor-privacy-notice"') < html.indexOf('<details class="options">'));
  assert.equal(h.donations.length, 0); assert.equal(h.metadata.length, 0);
});
test("public-profile publication can be disabled and anonymity clears it without silently reenabling it", () => {
  const h = setup();
  h.change(h.checkbox("Also publish my available @username and permitted profile photo for this donation"), false);
  assert.equal(h.checkbox("Also publish my available @username and permitted profile photo for this donation").props.checked, false);
  assert.match(h.html(), /Only your wallet and receipt link will appear/);
  h.change(h.checkbox("Also publish my available @username and permitted profile photo for this donation"), true);
  h.change(h.checkbox("Display anonymously in the donor feed"), true);
  assert.match(h.html(), /Your donor entry will be anonymous/);
  assert.ok(!h.all().some(node => node.type === "input" && node.props.type === "checkbox" && node.props.checked === false));
  h.change(h.checkbox("Display anonymously in the donor feed"), false);
  assert.equal(h.checkbox("Also publish my available @username and permitted profile photo for this donation").props.checked, false);
});
for (const amount of ["0", "-1", "1e2", "1.00000001", "0.00000001", "NaN", "Infinity", "", "1,5", "17014118346046923173168730371588.4105728"]) {
  test(`native UI disables invalid amount ${JSON.stringify(amount)} and handler cannot bypass it`, () => {
    const h = setup(); h.change(h.field("circle-testnet-amount"), amount);
    assert.equal(h.field("circle-testnet-amount").props["aria-invalid"], true); assert.equal(h.button("Review Testnet donation").props.disabled, true);
    h.click("Review Testnet donation"); assert.doesNotMatch(h.html(), /Review before sending/); assert.equal(h.donations.length, 0);
  });
}
for (const amount of ["0.0000001", "1.1234567", "1000000000000.0000001"]) test(`native seven-decimal amount ${amount} reviews exactly without money submission`, () => {
  const h = setup(); review(h, amount); const html = h.html(); assert.ok(html.includes(amount)); assert.match(html, /Review before sending/); assert.match(html, /network fee in XLM/); assert.equal(h.donations.length, 0);
});
test("UTF-8 comment byte limit blocks review even when JS length fits textarea maxlength", () => {
  const h = setup(); h.change(h.field("circle-testnet-comment"), "あ".repeat(167)); assert.equal(h.field("circle-testnet-comment").props["aria-invalid"], true);
  assert.equal(h.button("Review Testnet donation").props.disabled, true); h.click("Review Testnet donation"); assert.equal(h.donations.length, 0); assert.doesNotMatch(h.html(), /Review before sending/);
});
test("review captures exact terms, amount, owner and donor preferences rather than later field/mapping changes", async () => {
  const h = setup(); const mapping = readyMapping();
  const amountInput = h.field("circle-testnet-amount"), commentInput = h.field("circle-testnet-comment"), anonInput = h.checkbox("Display anonymously in the donor feed");
  h.change(anonInput, false); const publicInput = h.checkbox("Also publish my available @username and permitted profile photo for this donation"); h.change(publicInput, true);
  review(h, "1.0000001", "  Original public comment  "); assert.match(h.html(), /Wallet, @username and permitted photo/);
  h.change(amountInput, "99"); h.change(commentInput, "Changed after review"); h.change(anonInput, true); h.setMapping(readyMapping("101"));
  h.click("Confirm Testnet donation"); assert.equal(h.donations.length, 1);
  assert.deepEqual(h.donations[0].payload, { circleId: circle.id, expectedOwnerId: owner, termsKey: circleDonationTerms(mapping), amount: "1.0000001" });
  h.donations[0].response.resolve(confirmed()); await flush(); assert.equal(h.metadata.length, 1);
  assert.deepEqual(h.metadata[0], { id: "100", input: { hash, expectedOwnerId: owner, comment: "Original public comment", anonymous: false, publicProfileOk: true }, response: h.metadata[0].response });
  h.metadata[0].response.resolve(saved()); await settle(h); assert.match(h.html(), /Your donor record is saved/);
});
test("confirm rapid double-click submits once and exposes waiting UI without premature success", async () => {
  const h = setup(); review(h); const click = h.button("Confirm Testnet donation").props.onClick as () => void; click(); click();
  assert.equal(h.calls.guardRuns, 1); assert.equal(h.donations.length, 1); const html = h.html(); assert.match(html, /Waiting for Testnet/); assert.doesNotMatch(html, /data-success-motion/);
  h.donations[0].response.resolve(confirmed()); await flush(); h.metadata[0].response.resolve(saved()); await settle(h); assert.match(h.html(), /data-success-motion/);
});
test("pending hash is not success, retry calls metadata verification only, never submits money again", async () => {
  const h = setup(); review(h); h.click("Confirm Testnet donation"); h.donations[0].response.resolve({ ok: false, pending: true, hash, error: "Pending confirmation" }); await settle(h);
  let html = h.html(); assert.match(html, /A hash was returned/); assert.match(html, /Submission not yet resolved/); assert.doesNotMatch(html, /data-success-motion/); assert.equal(h.metadata.length, 0);
  h.click("Verify and retry donor record only"); assert.equal(h.donations.length, 1); assert.equal(h.metadata.length, 1);
  h.metadata[0].response.resolve({ ...missingMetadata, code: "confirmation_unavailable", donationConfirmed: false }); await settle(h);
  html = h.html(); assert.doesNotMatch(html, /data-success-motion/); assert.match(html, /retry metadata only/); assert.equal(h.donations.length, 1);
});

test("new donation review snapshots the default public profile into confirmed donor metadata", async () => {
  const h = setup(); review(h); h.click("Confirm Testnet donation"); h.donations[0].response.resolve(confirmed()); await flush();
  assert.equal(h.metadata.length, 1); assert.deepEqual(h.metadata[0].input, { hash, expectedOwnerId: owner, comment: "Test donation", anonymous: false, publicProfileOk: true });
  h.metadata[0].response.resolve(saved()); await settle(h); assert.equal(h.donations.length, 1);
});

for (const anonymous of [true, false]) test(`explicit ${anonymous ? "anonymous" : "wallet-only"} choice survives review and confirmed metadata`, async () => {
  const h = setup();
  if (anonymous) h.change(h.checkbox("Display anonymously in the donor feed"), true);
  else h.change(h.checkbox("Also publish my available @username and permitted profile photo for this donation"), false);
  review(h); assert.match(h.html(), anonymous ? /<dd>Anonymous<\/dd>/ : /<dd>Wallet only<\/dd>/);
  h.click("Confirm Testnet donation"); h.donations[0].response.resolve(confirmed()); await flush();
  assert.deepEqual(h.metadata[0].input, { hash, expectedOwnerId: owner, comment: "Test donation", anonymous, publicProfileOk: false });
  h.metadata[0].response.resolve(saved()); await settle(h); assert.equal(h.donations.length, 1);
});

test("generic status refresh reconciles pending hash only through independent donor proof", async () => {
  const h = setup(); review(h); h.click("Confirm Testnet donation"); h.donations[0].response.resolve({ ok: false, pending: true, hash, error: "Pending confirmation" }); await settle(h);
  assert.doesNotMatch(h.html(), /data-success-motion/); const statusCheck = h.statusRefreshHandler()(); await flush();
  assert.equal(h.calls.mappingRefresh, 1); assert.equal(h.metadata.length, 1); assert.equal(h.donations.length, 1);
  assert.doesNotMatch(h.html(), /data-success-motion/, "A generic status request alone does not prove confirmation");
  h.metadata[0].response.resolve(saved()); await statusCheck; await flush();
  assert.match(h.html(), /data-success-motion/); assert.match(h.html(), /Your donor record is saved/); assert.equal(h.donations.length, 1);
});

test("pending transaction proved failed clears receipt and review without success or automatic resubmission", async () => {
  const h = setup(); review(h); h.click("Confirm Testnet donation"); h.donations[0].response.resolve({ ok: false, pending: true, hash, error: "Pending confirmation" }); await settle(h);
  const statusCheck = h.statusRefreshHandler()(); await flush();
  h.metadata[0].response.resolve({ ok: false, campaignId: "100", hash, code: "failed_receipt", donationConfirmed: false, retryMetadataOnly: false }); await statusCheck; await flush();
  const html = h.html(); assert.match(html, /Testnet reports a failed transaction/); assert.doesNotMatch(html, /data-success-motion|View Testnet receipt|Review before sending/);
  assert.equal(h.donations.length, 1); assert.equal(h.metadata.length, 1); assert.equal(h.button("Review Testnet donation").props.disabled, true);
});

for (const code of ["receipt_mismatch", "unauthenticated", "account_changed", "no_wallet"] as const) test(`pending ${code} proof disables metadata retry and does not claim success`, async () => {
  const h = setup(); review(h); h.click("Confirm Testnet donation"); h.donations[0].response.resolve({ ok: false, pending: true, hash, error: "Pending confirmation" }); await settle(h);
  h.click("Verify and retry donor record only"); h.metadata[0].response.resolve({ ok: false, campaignId: "100", hash, code, donationConfirmed: false, retryMetadataOnly: false }); await settle(h);
  assert.match(h.html(), /receipt or account could not be verified/); assert.doesNotMatch(h.html(), /data-success-motion/);
  assert.equal(h.button("Verify and retry donor record only").props.disabled, true);
  h.click("Verify and retry donor record only"); await settle(h); assert.equal(h.metadata.length, 1); assert.equal(h.donations.length, 1);
});

test("pending chain confirmation with unavailable metadata can show chain success without claiming saved donor badge", async () => {
  const h = setup(); review(h); h.click("Confirm Testnet donation"); h.donations[0].response.resolve({ ok: false, pending: true, hash, error: "Pending confirmation" }); await settle(h);
  h.click("Verify and retry donor record only"); h.metadata[0].response.resolve(missingMetadata); await settle(h);
  assert.match(h.html(), /Testnet donation confirmed/); assert.doesNotMatch(h.html(), /Your donor record is saved/);
  assert.equal(h.button("Verify and retry donor record only").props.disabled, false); assert.equal(h.donations.length, 1);
});

test("generic status refresh with no pending hash never invents donor metadata or confirmation", async () => {
  const h = setup(); review(h); h.click("Confirm Testnet donation"); h.donations[0].response.resolve({ ok: false, pending: true, error: "Pending without a hash" }); await settle(h);
  await h.statusRefreshHandler()(); await flush(); assert.equal(h.calls.mappingRefresh, 1); assert.equal(h.metadata.length, 0);
  assert.equal(h.donations.length, 1); assert.doesNotMatch(h.html(), /data-success-motion|View Testnet receipt/);
});
test("locked-on-mount recovery proves stored hash without a local receipt or finance submission", async () => {
  const h = setup({ locked: true }); const before = h.html(); assert.match(before, /After reload/);
  assert.doesNotMatch(before, /View Testnet receipt|data-success-motion/);
  const recovery = h.statusRefreshHandler()(); await flush(); assert.equal(h.calls.mappingRefresh, 1);
  assert.equal(h.donations.length, 0); assert.equal(h.calls.guardRuns, 0); assert.equal(h.metadata.length, 1);
  assert.deepEqual(h.metadata[0].input, { hash, expectedOwnerId: owner, comment: "", anonymous: true, publicProfileOk: false });
  assert.doesNotMatch(h.html(), /data-success-motion/, "Stored safeguard hash is a hint, not proof");
  h.metadata[0].response.resolve(saved()); await recovery; await flush();
  assert.match(h.html(), /Testnet donation confirmed/); assert.match(h.html(), /Your donor record is saved/);
  assert.equal(h.donations.length, 0); assert.equal(h.calls.guardRuns, 0);
});

test("reload recovery never reuses current form comment or profile permission", async () => {
  const h = setup({ locked: true }); h.change(h.field("circle-testnet-comment"), "Current form is not prior consent");
  h.change(h.checkbox("Display anonymously in the donor feed"), false);
  h.change(h.checkbox("Also publish my available @username and permitted profile photo for this donation"), true);
  const recovery = h.statusRefreshHandler()(); await flush();
  assert.deepEqual(h.metadata[0].input, { hash, expectedOwnerId: owner, comment: "", anonymous: true, publicProfileOk: false });
  h.metadata[0].response.resolve({ ...saved(), status: "already_recorded" }); await recovery; await flush();
  assert.match(h.html(), /Your donor record is saved/); assert.equal(h.donations.length, 0);
});

test("reload recovery binds fresh mapping rather than the initial rendered campaign", async () => {
  const h = setup({ locked: true }); const refresh = h.statusRefreshHandler(); h.setMapping(readyMapping("101"));
  const recovery = refresh(); await flush(); assert.equal(h.metadata[0].id, "101");
  h.metadata[0].response.resolve({ ...saved(), campaignId: "101" }); await recovery; await flush();
  assert.equal(h.donations.length, 0); assert.match(h.html(), /Your donor record is saved/);
});

test("locked-on-mount safeguard without a stored hash cannot invent a recovered receipt", async () => {
  const h = setup({ locked: true, storedHash: null }); await h.statusRefreshHandler()(); await flush();
  assert.equal(h.metadata.length, 0); assert.equal(h.donations.length, 0); assert.equal(h.calls.guardRuns, 0);
  assert.doesNotMatch(h.html(), /View Testnet receipt|data-success-motion/);
});

for (const status of ["guest", "loading", "unverified", "unavailable"] as const) test(`reload recovery suppresses metadata for ${status} identity`, async () => {
  const h = setup({ locked: true, identity: { status } }); await h.statusRefreshHandler()(); await flush();
  assert.equal(h.calls.mappingRefresh, 1); assert.equal(h.metadata.length, 0); assert.equal(h.donations.length, 0); assert.equal(h.calls.guardRuns, 0);
  assert.doesNotMatch(h.html(), /View Testnet receipt|data-success-motion/);
});

test("reload recovery with unavailable or absent fresh campaign cannot attach metadata", async () => {
  const unavailable: CircleTestnetCampaignResult = { ok: false, available: false, network: "testnet", contractId: contract, circleId: circle.id,
    qaLabel: "QA Testnet · fictional cause", code: "not_configured", donationOpen: false, mapping: null, campaign: null, now: null };
  for (const fresh of [unavailable, null]) {
    const h = setup({ locked: true }); const refresh = h.statusRefreshHandler(); h.setMapping(fresh); await refresh(); await flush();
    assert.equal(h.calls.mappingRefresh, 1); assert.equal(h.metadata.length, 0); assert.equal(h.donations.length, 0);
    assert.doesNotMatch(h.html(), /View Testnet receipt|data-success-motion/);
  }
});

test("account switch while reload mapping refresh is pending suppresses old-owner proof request", async () => {
  const h = setup({ locked: true, deferMappingRefresh: true }); const recovery = h.statusRefreshHandler()();
  assert.equal(h.mappingRefreshes.length, 1); h.setIdentity(verified(other)); h.mappingRefreshes[0].resolve(readyMapping()); await recovery; await flush();
  assert.equal(h.metadata.length, 0); assert.equal(h.donations.length, 0); assert.doesNotMatch(h.html(), /View Testnet receipt|data-success-motion/);
});

test("account switch while reload proof is pending discards the former owner's saved result", async () => {
  const h = setup({ locked: true }); const recovery = h.statusRefreshHandler()(); await flush(); assert.equal(h.metadata.length, 1);
  h.setIdentity(verified(other)); h.metadata[0].response.resolve(saved()); await recovery; await flush();
  assert.equal(h.donations.length, 0); assert.equal(h.metadata.length, 1); assert.doesNotMatch(h.html(), /View Testnet receipt|Your donor record is saved|data-success-motion/);
});

test("failed reload recovery clears unconfirmed receipt without automatic finance retry", async () => {
  const h = setup({ locked: true }); const recovery = h.statusRefreshHandler()(); await flush();
  h.metadata[0].response.resolve({ ok: false, campaignId: "100", hash, code: "failed_receipt", donationConfirmed: false, retryMetadataOnly: false }); await recovery; await flush();
  assert.match(h.html(), /Testnet reports a failed transaction/); assert.doesNotMatch(h.html(), /View Testnet receipt|data-success-motion/);
  assert.equal(h.button("Review Testnet donation").props.disabled, true); assert.equal(h.metadata.length, 1); assert.equal(h.donations.length, 0);
});

test("mismatched reload recovery does not claim confirmation and blocks metadata retry", async () => {
  const h = setup({ locked: true }); const recovery = h.statusRefreshHandler()(); await flush();
  h.metadata[0].response.resolve({ ok: false, campaignId: "100", hash, code: "receipt_mismatch", donationConfirmed: false, retryMetadataOnly: false }); await recovery; await flush();
  assert.match(h.html(), /receipt or account could not be verified/); assert.doesNotMatch(h.html(), /data-success-motion|Your donor record is saved/);
  assert.equal(h.button("Verify and retry donor record only").props.disabled, true); h.click("Verify and retry donor record only"); await settle(h);
  assert.equal(h.metadata.length, 1); assert.equal(h.donations.length, 0); assert.equal(h.calls.guardRuns, 0);
});

test("independently confirmed reload with missing metadata supports metadata-only retry", async () => {
  const h = setup({ locked: true }); const recovery = h.statusRefreshHandler()(); await flush(); h.metadata[0].response.resolve(missingMetadata); await recovery; await flush();
  assert.match(h.html(), /Testnet donation confirmed/); assert.doesNotMatch(h.html(), /Your donor record is saved/);
  h.click("Verify and retry donor record only"); assert.equal(h.metadata.length, 2); assert.deepEqual(h.metadata[1].input, h.metadata[0].input);
  h.metadata[1].response.resolve(saved()); await settle(h); assert.match(h.html(), /Your donor record is saved/); assert.equal(h.donations.length, 0);
});

test("actual panel status-check ordering retains hash while identity is unavailable, then later recovers", async () => {
  const h = setup({ locked: true, identity: { status: "unavailable" } }); await h.checkSubmittedStatus(); await flush();
  assert.deepEqual(h.calls.order, ["guard-check", "mapping-refresh"]); assert.equal(h.metadata.length, 0);
  assert.deepEqual(h.guardSnapshot(), { locked: true, hash }); assert.match(h.html(), /recovery safeguard remains locked/);
  h.setIdentity(verified()); const recovery = h.checkSubmittedStatus(); await flush();
  assert.equal(h.calls.guardChecks, 2); assert.equal(h.metadata.length, 1); assert.equal(h.donations.length, 0);
  assert.deepEqual(h.metadata[0].input, { hash, expectedOwnerId: owner, comment: "", anonymous: true, publicProfileOk: false });
  assert.deepEqual(h.guardSnapshot(), { locked: true, hash }, "Generic SUCCESS must not clear the feature recovery hint");
  h.metadata[0].response.resolve(saved()); await recovery; await flush();
  assert.deepEqual(h.guardSnapshot(), { locked: false, hash: null }); assert.deepEqual(h.calls.clearVerified, [hash]);
  assert.deepEqual(h.calls.order, ["guard-check", "mapping-refresh", "guard-check", "mapping-refresh", "metadata", "clear-verified"]);
  assert.match(h.html(), /Your donor record is saved/); assert.equal(h.donations.length, 0); assert.equal(h.calls.guardRuns, 0);
});

test("actual panel status-check retains hash across missing mapping until later fresh recovery", async () => {
  const h = setup({ locked: true, mapping: null }); await h.checkSubmittedStatus(); await flush();
  assert.equal(h.metadata.length, 0); assert.deepEqual(h.guardSnapshot(), { locked: true, hash });
  h.setMapping(readyMapping()); const recovery = h.checkSubmittedStatus(); await flush(); h.metadata[0].response.resolve(saved()); await recovery; await flush();
  assert.match(h.html(), /Your donor record is saved/); assert.deepEqual(h.guardSnapshot(), { locked: false, hash: null });
  assert.equal(h.donations.length, 0); assert.deepEqual(h.calls.clearVerified, [hash]);
});

test("confirmed finance with metadata failure retains the real hash for recovery after remount", async () => {
  const first = setup(); first.change(first.checkbox("Display anonymously in the donor feed"), false);
  first.change(first.checkbox("Also publish my available @username and permitted profile photo for this donation"), true);
  review(first, "1.0000001", "Unsaved public comment"); first.click("Confirm Testnet donation"); first.donations[0].response.resolve(confirmed()); await flush();
  first.metadata[0].response.resolve(missingMetadata); await settle(first); assert.match(first.html(), /Testnet donation confirmed/);
  assert.deepEqual(first.guardSnapshot(), { locked: true, hash }); assert.deepEqual(first.calls.clearVerified, []); first.cleanup();
  const persisted = first.guardSnapshot(), restored = setup({ locked: persisted.locked, storedHash: persisted.hash });
  const recovery = restored.checkSubmittedStatus(); await flush();
  assert.deepEqual(restored.metadata[0].input, { hash, expectedOwnerId: owner, comment: "", anonymous: true, publicProfileOk: false });
  restored.metadata[0].response.resolve(saved()); await recovery; await flush();
  assert.match(restored.html(), /Your donor record is saved/); assert.deepEqual(restored.guardSnapshot(), { locked: false, hash: null });
  assert.equal(first.donations.length, 1); assert.equal(restored.donations.length, 0); assert.equal(restored.calls.guardRuns, 0);
});

test("actual panel pending or failed status transport never refreshes feature proof or unlocks money", async () => {
  for (const options of [{ statusResult: { ok: false, pending: true, hash } }, { statusError: true }]) {
    const h = setup({ locked: true, ...options }); await h.checkSubmittedStatus(); await flush();
    assert.equal(h.calls.guardChecks, 1); assert.equal(h.calls.mappingRefresh, 0); assert.equal(h.metadata.length, 0);
    assert.deepEqual(h.guardSnapshot(), { locked: true, hash }); assert.equal(h.donations.length, 0); assert.doesNotMatch(h.html(), /data-success-motion/);
  }
});

test("actual panel definitive failure clears generic safeguard but independent proof still cannot invent success", async () => {
  const h = setup({ locked: true, statusResult: { ok: false, hash } }); const recovery = h.checkSubmittedStatus(); await flush();
  assert.equal(h.calls.guardChecks, 1); assert.equal(h.calls.mappingRefresh, 1); assert.equal(h.metadata.length, 1);
  assert.deepEqual(h.guardSnapshot(), { locked: false, hash: null });
  h.metadata[0].response.resolve({ ok: false, campaignId: "100", hash, code: "failed_receipt", donationConfirmed: false, retryMetadataOnly: false }); await recovery; await flush();
  assert.match(h.html(), /Testnet reports a failed transaction/); assert.doesNotMatch(h.html(), /data-success-motion|View Testnet receipt/);
  assert.equal(h.donations.length, 0); assert.deepEqual(h.calls.clearVerified, []);
});

test("actual panel SUCCESS with mismatched independent proof keeps recovery safeguard locked", async () => {
  const h = setup({ locked: true }); const recovery = h.checkSubmittedStatus(); await flush();
  h.metadata[0].response.resolve({ ok: false, campaignId: "100", hash, code: "receipt_mismatch", donationConfirmed: false, retryMetadataOnly: false }); await recovery; await flush();
  assert.deepEqual(h.guardSnapshot(), { locked: true, hash }); assert.deepEqual(h.calls.clearVerified, []);
  assert.equal(h.button("Verify and retry donor record only").props.disabled, true); assert.equal(h.donations.length, 0);
  assert.doesNotMatch(h.html(), /data-success-motion|Your donor record is saved/);
});

test("pending without hash locks old confirmation handler and never invents a receipt", async () => {
  const h = setup(); review(h); const oldClick = h.button("Confirm Testnet donation").props.onClick as () => void; oldClick();
  h.donations[0].response.resolve({ ok: false, pending: true, error: "Unknown outcome" }); await settle(h);
  assert.equal(h.button("Confirm Testnet donation").props.disabled, true); assert.doesNotMatch(h.html(), /data-success-motion|View Testnet receipt/);
  oldClick(); await settle(h); assert.equal(h.donations.length, 1); assert.match(h.html(), /Submission status is unknown/);
});
test("lost donation transport is unknown, locked and never retries as a second donation", async () => {
  const h = setup(); review(h); h.click("Confirm Testnet donation"); h.donations[0].response.reject(Error("Transport interrupted")); await settle(h);
  assert.match(h.html(), /Submission status is unknown/); assert.match(h.html(), /Submission not yet resolved/); assert.doesNotMatch(h.html(), /data-success-motion|View Testnet receipt/);
  assert.equal(h.metadata.length, 0); h.click("Confirm Testnet donation"); await settle(h); assert.equal(h.donations.length, 1);
});
test("unknown safeguard result does not call finance or show success", async () => {
  const h = setup({ guardNull: true }); review(h); h.click("Confirm Testnet donation"); await settle(h);
  assert.equal(h.donations.length, 0); assert.equal(h.metadata.length, 0); assert.match(h.html(), /Submission status is unknown/); assert.doesNotMatch(h.html(), /data-success-motion/);
});
test("confirmed chain donation keeps success when metadata fails and retry cannot resend money", async () => {
  const h = setup(); review(h); h.click("Confirm Testnet donation"); h.donations[0].response.resolve(confirmed()); await flush();
  assert.match(h.html(), /Testnet donation confirmed/); assert.equal(h.metadata.length, 1);
  h.metadata[0].response.resolve(missingMetadata); await settle(h); assert.match(h.html(), /Testnet donation confirmed/); assert.match(h.html(), /retry metadata only/); assert.equal(h.donations.length, 1);
  h.click("Verify and retry donor record only"); assert.equal(h.metadata.length, 2); assert.equal(h.donations.length, 1);
  assert.deepEqual(h.metadata[1].input, h.metadata[0].input); h.metadata[1].response.resolve(saved()); await settle(h); assert.match(h.html(), /Your donor record is saved/);
});
test("lost metadata response preserves confirmed chain receipt and metadata-only retry", async () => {
  const h = setup(); review(h); h.click("Confirm Testnet donation"); h.donations[0].response.resolve(confirmed()); await flush();
  h.metadata[0].response.reject(Error("Metadata response lost")); await settle(h); assert.match(h.html(), /No extra donation was sent/); assert.match(h.html(), /Testnet donation confirmed/);
  h.click("Verify and retry donor record only"); h.metadata[1].response.resolve({ ...saved(), status: "already_recorded" }); await settle(h);
  assert.equal(h.donations.length, 1); assert.equal(h.metadata.length, 2); assert.match(h.html(), /Your donor record is saved/);
});

test("confirmed finance receipt with nonretryable metadata error retains chain confirmation but blocks retry and resending", async () => {
  const h = setup(); review(h); h.click("Confirm Testnet donation"); h.donations[0].response.resolve(confirmed()); await flush();
  h.metadata[0].response.resolve({ ok: false, campaignId: "100", hash, code: "receipt_mismatch", donationConfirmed: false, retryMetadataOnly: false }); await settle(h);
  const html = h.html(); assert.match(html, /Testnet donation confirmed/); assert.match(html, /receipt or account could not be verified/); assert.doesNotMatch(html, /Your donor record is saved|Confirm Testnet donation/);
  assert.equal(h.button("Verify and retry donor record only").props.disabled, true); h.click("Verify and retry donor record only"); await settle(h);
  assert.equal(h.metadata.length, 1); assert.equal(h.donations.length, 1);
});

test("confirmed chain receipt distinguishes pending donor metadata while preserving same-hash recovery", async () => {
  const h = setup(); review(h); const staleConfirm = h.button("Confirm Testnet donation").props.onClick as () => void;
  staleConfirm(); h.donations[0].response.resolve(confirmed()); await flush();
  let html = h.html(); assert.match(html, /Testnet submission confirmed/); assert.match(html, /receipt record is still pending/);
  assert.doesNotMatch(html, /Submission not yet resolved|success has not been established|does not prove whether funds moved|Your donor record is saved/);
  assert.deepEqual(h.guardSnapshot(), { locked: true, hash }); assert.deepEqual(h.calls.clearVerified, []);
  h.metadata[0].response.resolve({ ok: false, campaignId: "100", hash, code: "receipt_mismatch", donationConfirmed: false, retryMetadataOnly: false }); await settle(h);
  assert.equal(h.button("Verify and retry donor record only").props.disabled, true);
  staleConfirm(); assert.equal(h.donations.length, 1);
  const recovery = h.checkSubmittedStatus(); await flush();
  assert.equal(h.metadata.length, 2); assert.equal(h.donations.length, 1);
  assert.deepEqual(h.metadata[1].input, h.metadata[0].input); assert.deepEqual(h.guardSnapshot(), { locked: true, hash });
  h.metadata[1].response.resolve(saved()); await recovery; await flush();
  html = h.html(); assert.match(html, /Your donor record is saved/); assert.doesNotMatch(html, /receipt record is still pending|Submission not yet resolved/);
  assert.deepEqual(h.guardSnapshot(), { locked: false, hash: null }); assert.deepEqual(h.calls.clearVerified, [hash]); assert.equal(h.donations.length, 1);
});

test("confirmed receipt copy suppresses stale generic uncertainty without clearing the safeguard", async () => {
  const h = setup({ statusResult: { ok: false, pending: true, hash } }); review(h); h.click("Confirm Testnet donation");
  h.donations[0].response.resolve(confirmed()); await flush(); h.metadata[0].response.resolve(missingMetadata); await settle(h);
  await h.checkSubmittedStatus(); await flush();
  assert.match(h.html(), /Testnet submission confirmed/); assert.doesNotMatch(h.html(), /Submission not yet resolved|success has not been established|Testnet has not returned a definitive result/);
  assert.deepEqual(h.guardSnapshot(), { locked: true, hash }); assert.deepEqual(h.calls.clearVerified, []);
  assert.equal(h.metadata.length, 1); assert.equal(h.donations.length, 1);
});

test("generic status panel stays backward-compatible and rejects another hash's confirmation", () => {
  const h = setup({ locked: true });
  for (const confirmedHash of [undefined, "b".repeat(64)]) {
    const html = h.panelHtml(confirmedHash); assert.match(html, /Submission not yet resolved|success has not been established/);
    assert.doesNotMatch(html, /Testnet submission confirmed|receipt record is still pending/);
  }
  const matched = h.panelHtml(hash); assert.match(matched, /Testnet submission confirmed|receipt record is still pending/);
  assert.deepEqual(h.guardSnapshot(), { locked: true, hash }); assert.equal(h.donations.length, 0); assert.equal(h.metadata.length, 0);
});
test("definitive donation failure cannot display success or attach metadata", async () => {
  const h = setup(); review(h); h.click("Confirm Testnet donation"); h.donations[0].response.resolve({ ok: false, error: "Funding deadline changed" }); await settle(h);
  assert.match(h.html(), /Funding deadline changed/); assert.doesNotMatch(h.html(), /data-success-motion|View Testnet receipt/); assert.equal(h.metadata.length, 0);
});
test("account switch suppresses late financial receipt and never attaches former owner's metadata", async () => {
  const h = setup(); review(h); h.click("Confirm Testnet donation"); h.setIdentity(verified(other)); h.donations[0].response.resolve(confirmed()); await settle(h);
  const html = h.html(); assert.doesNotMatch(html, /data-success-motion|View Testnet receipt/); assert.equal(h.metadata.length, 0); assert.equal(h.calls.mappingRefresh, 0);
  assert.equal(h.checkbox("Display anonymously in the donor feed").props.checked, false);
  assert.equal(h.checkbox("Also publish my available @username and permitted profile photo for this donation").props.checked, true);
});
test("account switch while metadata is in flight removes prior receipt and ignores its saved result", async () => {
  const h = setup(); review(h); h.click("Confirm Testnet donation"); h.donations[0].response.resolve(confirmed()); await flush(); assert.equal(h.metadata.length, 1);
  h.setIdentity(verified(other)); h.metadata[0].response.resolve(saved()); await settle(h); assert.doesNotMatch(h.html(), /data-success-motion|Your donor record is saved|View Testnet receipt/);
  assert.equal(h.calls.mappingRefresh, 0); assert.equal(h.metadata.length, 1);
});
test("identity change during review resets terms and denies a stale confirm handler", () => {
  const h = setup(); review(h); const stale = h.button("Confirm Testnet donation").props.onClick as () => void;
  h.setIdentity(verified(other)); h.render(); stale(); assert.equal(h.donations.length, 0);
});

test("account switch denies stale metadata and status reconciliation handlers for the previous receipt", async () => {
  const h = setup(); review(h); h.click("Confirm Testnet donation"); h.donations[0].response.resolve({ ok: false, pending: true, hash, error: "Pending confirmation" }); await settle(h);
  const staleRetry = h.button("Verify and retry donor record only").props.onClick as () => void, staleStatus = h.statusRefreshHandler();
  h.setIdentity(verified(other)); h.render(); staleRetry(); await staleStatus(); await settle(h);
  assert.equal(h.metadata.length, 0); assert.equal(h.donations.length, 1); assert.doesNotMatch(h.html(), /data-success-motion|View Testnet receipt/);
});

test("account switch during pending reconciliation discards former owner's confirmed donor result", async () => {
  const h = setup(); review(h); h.click("Confirm Testnet donation"); h.donations[0].response.resolve({ ok: false, pending: true, hash, error: "Pending confirmation" }); await settle(h);
  const statusCheck = h.statusRefreshHandler()(); await flush(); assert.equal(h.metadata.length, 1);
  h.setIdentity(verified(other)); h.metadata[0].response.resolve(saved()); await statusCheck; await settle(h);
  assert.doesNotMatch(h.html(), /data-success-motion|Your donor record is saved|View Testnet receipt/); assert.equal(h.donations.length, 1); assert.equal(h.metadata.length, 1);
});
for (const status of ["guest", "loading", "unverified", "unavailable"] as const) test(`${status} identity cannot review or submit a donation`, () => {
  const h = setup({ identity: { status } }); h.click("Review Testnet donation"); assert.equal(h.donations.length, 0); assert.doesNotMatch(h.html(), /Review before sending/);
  if (status === "guest") assert.match(h.html(), /href="\/signin\?next=%2Fcircles%2Ftino-relief%2Fdonate"/);
});
test("missing or closed mapping cannot offer amount/review/send controls", () => {
  const failure: CircleTestnetCampaignResult = { ok: false, available: false, network: "testnet", contractId: contract, circleId: circle.id, qaLabel: "QA Testnet · fictional cause",
    code: "not_configured", donationOpen: false, mapping: null, campaign: null, now: null };
  for (const mapping of [failure, { ...readyMapping(), donationOpen: false, status: "expired" as const }, null]) {
    const h = setup({ mapping }); const html = h.html(); assert.doesNotMatch(html, /circle-testnet-amount|Review Testnet donation|Confirm Testnet donation/);
    h.click("Check campaign availability"); assert.equal(h.calls.mappingRefresh, 1); assert.equal(h.donations.length, 0); assert.equal(h.metadata.length, 0);
  }
});
test("Back exits review without sending; outer Back follows campaign fallback", () => {
  const h = setup(); review(h); h.click("Back"); assert.doesNotMatch(h.html(), /Review before sending/); assert.equal(h.calls.backs, 0);
  h.click("Back"); assert.equal(h.calls.backs, 1); assert.equal(h.donations.length, 0);
});

test("amount form precedes collapsed technical details and optional controls", () => {
  const h = setup(); const html = h.html();
  assert.ok(html.indexOf('id="circle-testnet-amount"') < html.indexOf('data-fixture="mapping-summary"'));
  assert.match(html, /<details class="options"><summary>Privacy and comment \(optional\)/);
  assert.match(html, /<details class="options"><summary>Campaign details/);
  assert.match(html, /1 · Amount/);
  assert.doesNotMatch(html, /data-fixture="donor-feed"|data-fixture="updates-subscription"/);
});

test("confirmed receipt displays the exact reviewed XLM amount without another transfer", async () => {
  const h = setup(); h.change(h.field("circle-testnet-amount"), "50.1234567");
  h.click("Review Testnet donation"); h.click("Confirm Testnet donation"); h.donations[0].response.resolve(confirmed()); await flush();
  assert.match(h.html(), /class="amount">50.1234567 XLM/);
  assert.match(h.html(), /3 · Receipt/);
  h.metadata[0].response.resolve(saved()); await settle(h);
  h.click("Back to campaign"); assert.equal(h.calls.backs, 1, "Receipt return must pop, not push a duplicate campaign entry");
  assert.equal(h.donations.length, 1);
});
test("all used native donation strings have explicit translation output in four locales", () => {
  const messages = [...source.matchAll(/text\("([^"]+)"\)/g)].map(match => match[1] as CircleTestnetDonateMessage);
  assert.ok(messages.length > 35);
  for (const locale of ["en", "id", "tl", "vi"] as const) {
    const text = circleTestnetDonateCopy(locale);
    for (const message of messages) assert.ok(typeof text(message) === "string" && text(message).length > 0, `${locale}: ${message}`);
    const h = setup({ locale }); assert.ok(h.html().includes(text("Fictional cause, real Testnet transaction")));
    assert.equal(h.checkbox("Display anonymously in the donor feed").props.checked, false);
    assert.equal(h.checkbox("Also publish my available @username and permitted profile photo for this donation").props.checked, true);
    assert.ok(h.html().includes(text("Your wallet, available @username and permitted profile photo will be public. Choose anonymous below to hide them from this feed.")));
    review(h);
    assert.ok(h.html().includes(text("Wallet, @username and permitted photo")));
    assert.ok(h.html().includes(text("Review before sending"))); assert.equal(h.donations.length, 0);
  }
});
test("default route chooses native Testnet component outside local preview; preview stays separate", () => {
  for (const preview of [false, true]) {
    const exports = {} as { default: (props: { circle: Circle }) => React.ReactElement<{ circle: Circle }>; CirclesPreviewDonateScreen: React.ComponentType<{ circle: Circle }> };
    const native = () => null;
    runInNewContext(compile("../components/screens/CirclesDonateScreen.tsx"), { exports,
      require(name: string) {
        if (name === "react/jsx-runtime") return jsxRuntime;
        if (name === "react") return React;
        if (name === "@/lib/local-preview") return { isLocalPreview: preview };
        if (name === "@/components/CircleTestnetDonate") return { __esModule: true, default: native };
        // Other imports are unused by this route-selection wrapper. If the
        // local flow is accidentally executed, its missing dependencies fail.
        if (name.endsWith(".module.css")) return { __esModule: true, default: {} };
        return {};
      },
    });
    const rendered = exports.default({ circle }); assert.equal(rendered.type, preview ? exports.CirclesPreviewDonateScreen : native); assert.equal(rendered.props.circle, circle);
  }
});
