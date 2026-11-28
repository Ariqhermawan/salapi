import { PREVIEW_RECIPIENT, PREVIEW_WALLET } from "./local-preview";
import type { RecurringCampaign } from "./recurring-campaign";

export const RECURRING_CAMPAIGN_FIXTURES = ["funding", "scheduled", "proof", "ready", "refundable", "released", "closed"] as const;
export type RecurringCampaignFixture = (typeof RECURRING_CAMPAIGN_FIXTURES)[number];

export const RECURRING_CAMPAIGN_PREVIEW_NOW = 1_800_000_000n;
const NOW = RECURRING_CAMPAIGN_PREVIEW_NOW;
const DAY = 86_400n;
const STAGE_AMOUNTS = ["10000000", "20000000"];
const PREVIEW_BENEFICIARY = "GAXPCCZD3AKYIRCI5CCX2TRIMVGQ45XEUEZPF5RBUZHYFRRZGN64ZNO3";

export function recurringCampaignFixtureName(value: unknown): RecurringCampaignFixture {
  return typeof value === "string" && RECURRING_CAMPAIGN_FIXTURES.includes(value as RecurringCampaignFixture)
    ? value as RecurringCampaignFixture : "funding";
}

export function recurringCampaignFixture(value: unknown): RecurringCampaign {
  const fixture = recurringCampaignFixtureName(value);
  const creator = PREVIEW_WALLET.address;
  const approvers = [creator, PREVIEW_RECIPIENT, PREVIEW_BENEFICIARY];
  const campaign: RecurringCampaign = {
    id: String(RECURRING_CAMPAIGN_FIXTURES.indexOf(fixture) + 1),
    title: "Sample recurring relief campaign",
    state: "Funding",
    config: {
      creator,
      beneficiary: PREVIEW_BENEFICIARY,
      token: "Testnet XLM",
      creator_cut_bps: 500,
      funding_deadline: String(NOW + DAY),
      review_deadline: String(NOW + 10n * DAY),
      approvers,
    },
    total: "5000000",
    escrow: "5000000",
    current_stage: 0,
    proofHash: null,
    proofUrl: "",
    approvals: [],
    stages: [
      { amount: STAGE_AMOUNTS[0], due_date: String(NOW + 2n * DAY), funded: "5000000", released: false },
      { amount: STAGE_AMOUNTS[1], due_date: String(NOW + 4n * DAY), funded: "0", released: false },
    ],
    contribution: { amount: "0", stages: ["0", "0"], refunded: false },
  };

  switch (fixture) {
    case "funding":
      return campaign;
    case "scheduled":
      return {
        ...campaign,
        id: "2",
        state: "Scheduled",
        config: { ...campaign.config, funding_deadline: String(NOW - DAY) },
        total: STAGE_AMOUNTS[0],
        escrow: STAGE_AMOUNTS[0],
        stages: [
          { ...campaign.stages[0], due_date: String(NOW + DAY), funded: STAGE_AMOUNTS[0] },
          campaign.stages[1],
        ],
        contribution: { amount: STAGE_AMOUNTS[0], stages: [STAGE_AMOUNTS[0], "0"], refunded: false },
      };
    case "proof":
    case "ready":
      return {
        ...campaign,
        id: fixture === "proof" ? "3" : "4",
        state: "PendingProof",
        config: { ...campaign.config, funding_deadline: String(NOW - 2n * DAY) },
        total: STAGE_AMOUNTS[0],
        escrow: STAGE_AMOUNTS[0],
        proofHash: "f".repeat(64),
        proofUrl: "/evidence/local-example-proof.txt",
        approvals: fixture === "proof" ? [PREVIEW_RECIPIENT] : [PREVIEW_RECIPIENT, PREVIEW_BENEFICIARY],
        stages: [
          { ...campaign.stages[0], due_date: String(NOW - DAY), funded: STAGE_AMOUNTS[0] },
          campaign.stages[1],
        ],
        contribution: { amount: STAGE_AMOUNTS[0], stages: [STAGE_AMOUNTS[0], "0"], refunded: false },
      };
    case "refundable":
      return {
        ...campaign,
        id: "5",
        state: "Refundable",
        config: { ...campaign.config, funding_deadline: String(NOW - 10n * DAY), review_deadline: String(NOW - DAY) },
        total: "15000000",
        escrow: "5000000",
        current_stage: 1,
        stages: [
          { ...campaign.stages[0], due_date: String(NOW - 8n * DAY), funded: STAGE_AMOUNTS[0], released: true },
          { ...campaign.stages[1], due_date: String(NOW - 6n * DAY), funded: "5000000" },
        ],
        contribution: { amount: "10000000", stages: ["8000000", "2000000"], refunded: false },
      };
    case "released":
      return {
        ...campaign,
        id: "6",
        state: "Released",
        config: { ...campaign.config, funding_deadline: String(NOW - 10n * DAY), review_deadline: String(NOW - DAY) },
        total: "30000000",
        escrow: "0",
        current_stage: 2,
        stages: [
          { ...campaign.stages[0], due_date: String(NOW - 8n * DAY), funded: STAGE_AMOUNTS[0], released: true },
          { ...campaign.stages[1], due_date: String(NOW - 6n * DAY), funded: STAGE_AMOUNTS[1], released: true },
        ],
        contribution: { amount: "30000000", stages: STAGE_AMOUNTS, refunded: false },
      };
    case "closed":
      return {
        ...campaign,
        id: "7",
        state: "Closed",
        config: { ...campaign.config, funding_deadline: String(NOW - 10n * DAY), review_deadline: String(NOW - DAY) },
        total: "0",
        escrow: "0",
        stages: [
          { ...campaign.stages[0], due_date: String(NOW - 8n * DAY), funded: "0" },
          { ...campaign.stages[1], due_date: String(NOW - 6n * DAY), funded: "0" },
        ],
      };
  }
}
