import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  RECURRING_CAMPAIGN_PREVIEW_NOTICE,
  recurringCampaignPreviewSetup,
} from "../lib/prototype-recurring-preview.ts";

const today = new Date(2026, 9, 6, 12);

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

test("recurring schedule disclosure states the active D4 limit and create keeps its normal route", () => {
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
  assert.match(createRoute, /return isLocalPreview\s*\?\s*<Suspense fallback=\{null\}><PrototypeCreateCauseScreen \/><\/Suspense>\s*:\s*<CampaignScreen id="" initialCreate standaloneCreate \/>/);
});
