import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { circleDonationAmount, circleDonationTerms } from "../../lib/circles/donation";
import { campaignDonorComment } from "../../lib/campaign-donor";
import { campaignSplit } from "../../lib/campaign-money";
import { formatStroops } from "../../lib/format-stroops";
import { circleTestnetDonateCopy } from "../../lib/i18n/circle-testnet-donate";
import type { Locale } from "../../lib/i18n/config";
import type { Circle } from "../../lib/circles/types";
import type { CircleTestnetCampaignResult } from "../../lib/circles/testnet";

export const donationReviewCss = readFileSync(resolve("components/CircleTestnetDonate.module.css"), "utf8");
const source = readFileSync(resolve("components/CircleTestnetDonate.tsx"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;

/** Actual component markup and CSS for geometry only, without any Auth session.
 * Hooks, reads and account identity are isolated test doubles. The real Review
 * handler constructs the snapshot; finance/metadata calls fail immediately.
 * This is not a hydrated login, receipt, or live transaction acceptance test. */
export function donationReviewMarkup(circle: Circle, terms: Extract<CircleTestnetCampaignResult, { ok: true }>, locale: Locale, anonymous = false) {
  const text = circleTestnetDonateCopy(locale);
  const cells: unknown[] = [];
  let index = 0;
  const ownerId = "00000000-0000-4000-8000-000000000001";
  const forbidden = () => { throw Error("No financial, donor metadata or account mutation is permitted in layout fixtures"); };
  const exports = {} as { default: (props: { circle: Circle }) => React.ReactElement };
  runInNewContext(compiled, { exports, BigInt, Buffer, require(name: string) {
    if (name === "react") return {
      useState(initial: unknown) { const slot = index++; if (!(slot in cells)) cells[slot] = initial;
        return [cells[slot], (value: unknown) => { cells[slot] = value; }]; },
      useRef(initial: unknown) { const slot = index++; return cells[slot] ?? (cells[slot] = { current: initial }); },
      useTransition: () => [false, forbidden],
    };
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name === "next/link") return { __esModule: true, default: (props: { children: React.ReactNode; href: string }) => React.createElement("a", props) };
    if (name === "@/app/circle-donation-actions") return { donateCircleTestnet: forbidden };
    if (name === "@/app/campaign-donor-actions") return { campaignDonorRecord: forbidden };
    if (name === "@/lib/circles/donation") return { circleDonationAmount, circleDonationTerms };
    if (name === "@/lib/campaign-donor") return { campaignDonorComment };
    if (name === "@/lib/campaign-money") return { campaignSplit };
    if (name === "@/lib/format-stroops") return { formatStroops };
    if (name === "@/lib/ui/useCircleTestnet") return { useCircleTestnet: () => ({ result: terms, loading: false, refresh: forbidden }) };
    if (name === "@/lib/ui/useCirclesSignupIdentity") return { useCirclesSignupIdentity: () => ({
      identity: { status: "verified", ownerId, email: "layout@example.invalid", source: "account" },
      refresh: forbidden, captureOwnerRevision: () => 0, isCurrentOwner: (revision: number) => revision === 0,
    }) };
    if (name === "@/lib/ui/useUnresolvedSubmission") return { useUnresolvedSubmission: () => ({ state: { kind: "clear" }, locked: false, run: forbidden }) };
    if (name === "@/lib/ui/useGoBack") return { useGoBack: () => forbidden };
    if (name === "@/components/I18nProvider") return { useT: () => ({ locale }) };
    if (name === "@/lib/i18n/circle-testnet-donate") return { circleTestnetDonateCopy };
    if (name.startsWith("@/components/")) return { __esModule: true, default: () => null };
    throw Error(`Unreviewed layout fixture dependency: ${name}`);
  } });
  function render() { index = 0; return exports.default({ circle }); }
  function nodes(value: unknown): React.ReactElement<Record<string, unknown>>[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!React.isValidElement<Record<string, unknown>>(value)) return [];
    return [value, ...nodes(value.props.children)];
  }
  const form = nodes(render());
  const amount = form.find(node => node.props.id === "circle-testnet-amount")!;
  (amount.props.onChange as (event: unknown) => void)({ target: { value: "10" } });
  const comment = form.find(node => node.props.id === "circle-testnet-comment")!;
  (comment.props.onChange as (event: unknown) => void)({ target: { value: "Public fixture comment. ".repeat(20) } });
  if (anonymous) {
    const checkbox = form.find(node => node.type === "input" && node.props.type === "checkbox")!;
    (checkbox.props.onChange as (event: unknown) => void)({ target: { checked: true } });
  }
  const review = nodes(render()).find(node => node.type === "button" && node.props.children === text("Review Testnet donation"));
  assert.ok(review); assert.equal(review.props.disabled, false);
  (review.props.onClick as () => void)();
  const html = renderToStaticMarkup(render());
  assert.ok(html.includes('data-testid="donation-review-actions"'));
  return html;
}
