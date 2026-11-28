import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  RECURRING_CAMPAIGN_PREVIEW_NOTICE,
  recurringCampaignPreviewSetup,
} from "../lib/prototype-recurring-preview.ts";
import { RECURRING_CAMPAIGN_TEXT } from "../lib/i18n/recurring-campaign.ts";
import { recurringStageRefundable } from "../lib/recurring-campaign.ts";

const today = new Date(2026, 9, 6, 12);

function loadRecurringPreviewFixtures() {
  const source = readFileSync(new URL("../lib/recurring-campaign-preview.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const transpiledModule = { exports: {} as Record<string, unknown> };
  runInNewContext(code, {
    exports: transpiledModule.exports,
    module: transpiledModule,
    require: (name: string) => {
      if (name !== "./local-preview") throw new Error(`Unexpected recurring fixture dependency: ${name}`);
      return {
        PREVIEW_WALLET: { address: "GAKZLTZFGSSM372XUKW2ZIJ5GSHVVIW5BYZIKIXRW2BW4MM6TUI5536Y" },
        PREVIEW_RECIPIENT: "GAVWJIZ45MHV2KWBHNBBB7YHU5CPTIDD3YONC4ZNP7IGE6Z3C777OV4H",
      };
    },
  });
  return transpiledModule.exports as {
    RECURRING_CAMPAIGN_FIXTURES: readonly string[];
    recurringCampaignFixture(value: unknown): {
      id: string;
      state: string;
      total: string;
      escrow: string;
      current_stage: number;
      config: { approvers: string[] };
      stages: { amount: string; due_date: string; funded: string; released: boolean }[];
      contribution: { amount: string; stages: string[]; refunded: boolean } | null;
    };
  };
}

test("recurring preview fixture has a balanced, ordered three-stage example schedule", () => {
  const setup = recurringCampaignPreviewSetup("?kind=recurring", today);
  assert.ok(setup);
  assert.equal(setup.goal, "600");
  assert.equal(setup.step, 4);
  assert.deepEqual(setup.stages.map(({ title, amountCents, dueDate }) => ({ title, amountCents, dueDate })), [
    { title: "Shelves and tables", amountCents: 20_000, dueDate: "2026-11-24" },
    { title: "Books, first 600", amountCents: 20_000, dueDate: "2026-12-22" },
    { title: "Lights and fans", amountCents: 20_000, dueDate: "2027-01-19" },
  ]);
  assert.equal(setup.stages.reduce((sum, stage) => sum + (stage.amountCents ?? 0), 0), 60_000);
  assert.ok(setup.stages.every((stage, index, stages) => index === 0 || stage.dueDate > stages[index - 1].dueDate));
});

test("recurring preview URL can open empty, over-goal and review states", () => {
  const empty = recurringCampaignPreviewSetup("?kind=recurring&stages=empty", today);
  assert.ok(empty);
  assert.equal(empty.stages.length, 2);
  assert.ok(empty.stages.every(stage => stage.title === "" && stage.amountCents === null && stage.dueDate === ""));

  const over = recurringCampaignPreviewSetup("?kind=recurring&stages=over", today);
  assert.ok(over);
  assert.equal(over.stages.reduce((sum, stage) => sum + (stage.amountCents ?? 0), 0), 65_000);

  const review = recurringCampaignPreviewSetup("?kind=recurring&step=review", today);
  assert.ok(review);
  assert.equal(review.step, 5);
  assert.equal(recurringCampaignPreviewSetup("?kind=one-time", today), null);
});

test("the recurring Testnet flow keeps production and preview copy localized", () => {
  const source = readFileSync(new URL("../components/screens/RecurringCampaignScreen.tsx", import.meta.url), "utf8");
  const locales = ["en", "id", "tl", "vi"] as const;
  const keys = Object.keys(RECURRING_CAMPAIGN_TEXT.en) as (keyof typeof RECURRING_CAMPAIGN_TEXT.en)[];

  for (const locale of locales) {
    for (const key of keys) {
      const value = RECURRING_CAMPAIGN_TEXT[locale][key];
      assert.ok(value.length > 0, `${locale}.${key} must have copy`);
      if (locale !== "en") assert.notEqual(value, RECURRING_CAMPAIGN_TEXT.en[key], `${locale}.${key} must be translated`);
    }
  }

  for (const englishLeak of [
    "The creator share is fixed at creation.",
    "Use the production Testnet build to submit this form.",
    "Recurring campaigns unavailable",
    "Total contributed",
    "Current escrow",
    "Donations fill each stage target in order",
    "${copy.stage} ${item.current_stage + 1} of",
    "Testnet XLM contributed",
    "Testnet transaction confirmed",
    "This review expires in two minutes.",
  ]) assert.equal(source.includes(englishLeak), false, `raw copy leaked into the screen: ${englishLeak}`);
});

test("local D5 fixtures cover contract states without enabling Testnet actions", () => {
  const { RECURRING_CAMPAIGN_FIXTURES, recurringCampaignFixture } = loadRecurringPreviewFixtures();
  const expected = ["Funding", "Scheduled", "PendingProof", "PendingProof", "Refundable", "Released", "Closed"];
  for (const [index, fixture] of RECURRING_CAMPAIGN_FIXTURES.entries()) {
    const campaign = recurringCampaignFixture(fixture);
    assert.equal(campaign.state, expected[index]);
    assert.equal(campaign.id, String(index + 1));
    assert.equal(campaign.stages.reduce((sum, stage) => sum + BigInt(stage.funded), 0n), BigInt(campaign.total));
    assert.ok(campaign.stages.every((stage, stageIndex, stages) => stageIndex === 0 || BigInt(stage.due_date) > BigInt(stages[stageIndex - 1].due_date)));
    assert.equal(new Set(campaign.config.approvers).size, 3);
  }

  const refundable = recurringCampaignFixture("refundable");
  assert.equal(refundable.current_stage, 1);
  assert.equal(recurringStageRefundable(refundable.contribution!, refundable.current_stage), 2_000_000n);
  const released = recurringCampaignFixture("released");
  assert.equal(released.escrow, "0");
  assert.ok(released.stages.every(stage => stage.released));

  const screen = readFileSync(new URL("../components/screens/RecurringCampaignScreen.tsx", import.meta.url), "utf8");
  const navigator = readFileSync(new URL("../components/PrototypePreviewAside.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/campaigns/page.tsx", import.meta.url), "utf8");
  assert.match(screen, /if \(locked \|\| dialog \|\| isLocalPreview\) return;/);
  assert.match(route, /fixture=\{fixture\}/);
  for (const fixture of RECURRING_CAMPAIGN_FIXTURES) assert.ok(navigator.includes(`fixture=${fixture}`));
});

type PreviewCause = {
  id: string;
  title: string;
  category: string;
  story: string;
  beneficiaryName: string;
  location: string;
  targetCents: number;
  organizerFeePercent: number;
  endDate: string;
  recurring: boolean;
  stages: { title: string; amountCents: number; dueDate: string }[];
  photoNames: string[];
  createdAt: number;
};

function loadLocalPreview(enabled: boolean, storage: StorageStub) {
  const source = readFileSync(new URL("../lib/local-preview.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const transpiledModule = { exports: {} as Record<string, unknown> };
  runInNewContext(code, {
    exports: transpiledModule.exports,
    module: transpiledModule,
    process: { env: { NEXT_PUBLIC_LOCAL_PREVIEW: enabled ? "1" : "0" } },
    window: { localStorage: storage },
  });
  return transpiledModule.exports as {
    saveLocalPreviewCause(cause: PreviewCause): boolean;
    localPreviewCauses(): PreviewCause[];
  };
}

class StorageStub {
  private values = new Map<string, string>();
  writes = 0;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes++; this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("recurring fixture saves and reloads only in local preview storage", () => {
  const storage = new StorageStub();
  const preview = loadLocalPreview(true, storage);
  const setup = recurringCampaignPreviewSetup("?kind=recurring", today)!;
  const cause: PreviewCause = {
    id: "local-recurring-test",
    title: "Community library supplies",
    category: "Education",
    story: "Example local schedule.",
    beneficiaryName: "Community library",
    location: "Cebu",
    targetCents: 60_000,
    organizerFeePercent: 0,
    endDate: "2027-02-01",
    recurring: true,
    stages: setup.stages.map(stage => ({ ...stage, amountCents: stage.amountCents ?? 0 })),
    photoNames: [],
    createdAt: 1_798_646_400_000,
  };

  assert.equal(preview.saveLocalPreviewCause(cause), true);
  assert.equal(storage.writes, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(preview.localPreviewCauses())), [cause]);

  const disabledStorage = new StorageStub();
  const production = loadLocalPreview(false, disabledStorage);
  assert.equal(production.saveLocalPreviewCause(cause), false);
  assert.deepEqual(JSON.parse(JSON.stringify(production.localPreviewCauses())), []);
  assert.equal(disabledStorage.writes, 0);
});

test("recurring preview states the D4 limit while production gets a separate recurring route", () => {
  assert.match(RECURRING_CAMPAIGN_PREVIEW_NOTICE, /one proof/);
  assert.match(RECURRING_CAMPAIGN_PREVIEW_NOTICE, /two of three configured wallets/);
  assert.match(RECURRING_CAMPAIGN_PREVIEW_NOTICE, /D4 does not support payout stages/);

  const createScreen = readFileSync(new URL("../components/screens/PrototypeCreateCauseScreen.tsx", import.meta.url), "utf8");
  assert.match(createScreen, /Planned payout stages · local preview/);
  assert.doesNotMatch(createScreen, /Each stage is paid after donors rate its proof/);

  const causeDetail = readFileSync(new URL("../components/screens/PrototypeCauseDetailScreen.tsx", import.meta.url), "utf8");
  assert.match(causeDetail, /Example stage schedule/);
  assert.match(causeDetail, /The local schedule fixture does not accept proof or reviewer decisions/);

  const manageScreen = readFileSync(new URL("../components/screens/PrototypeManageScreen.tsx", import.meta.url), "utf8");
  assert.match(manageScreen, /Recurring payout preview/);
  assert.match(manageScreen, /Stage claims and escrow releases are not available/);

  const createRoute = readFileSync(new URL("../app/create/page.tsx", import.meta.url), "utf8");
  const localPreviewRoute = createRoute.indexOf("if (isLocalPreview) return <Suspense fallback={null}><PrototypeCreateCauseScreen />");
  const recurringTestnetRoute = createRoute.indexOf('if (kind === "recurring") return <RecurringCampaignScreen standaloneCreate />');
  assert.ok(localPreviewRoute >= 0 && localPreviewRoute < recurringTestnetRoute, "local fixture states must be dispatched before the live Testnet wizard");
  assert.match(createRoute, /if \(kind === "recurring"\) return <RecurringCampaignScreen standaloneCreate \/>/);
  assert.match(createRoute, /<CampaignScreen id="" initialCreate standaloneCreate \/>/);
  assert.match(createRoute, /href="\/create\?kind=recurring">Recurring stages/);
});
