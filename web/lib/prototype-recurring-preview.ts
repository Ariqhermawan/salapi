export type RecurringPreviewStage = {
  title: string;
  amountCents: number | null;
  dueDate: string;
};

export type RecurringPreviewSetup = {
  goal: string;
  step: 4 | 5;
  stages: RecurringPreviewStage[];
};

export const RECURRING_CAMPAIGN_PREVIEW_NOTICE =
  "Local preview only. Active D4 campaigns support one proof, approval by two of three configured wallets, and one release. D4 does not support payout stages.";

export const RECURRING_CAMPAIGN_FEE_PREVIEW_NOTICE =
  "Fee examples on this prototype are not active D4 contract terms.";

function dateInDays(today: Date, days: number) {
  const date = new Date(today);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function recurringCampaignPreviewSetup(search: string, today = new Date()): RecurringPreviewSetup | null {
  const params = new URLSearchParams(search);
  if (params.get("kind") !== "recurring") return null;
  const sample = [
    { title: "Shelves and tables", amountCents: 20000, dueDate: dateInDays(today, 49) },
    { title: "Books, first 600", amountCents: 20000, dueDate: dateInDays(today, 77) },
    { title: "Lights and fans", amountCents: 20000, dueDate: dateInDays(today, 105) },
  ];
  const stages = params.get("stages") === "empty"
    ? Array.from({ length: 2 }, () => ({ title: "", amountCents: null, dueDate: "" }))
    : params.get("stages") === "over"
      ? sample.map((stage, index) => index === 2 ? { ...stage, amountCents: 25000 } : stage)
      : sample;
  return { goal: "600", step: params.get("step") === "review" ? 5 : 4, stages };
}
