export type ArisanPreviewFixtureMode = "upfront" | "installments" | "scheduled";
export type ArisanPreviewFixtureSection = "mode" | "join-review" | "start-gate";

export type ArisanPreviewFixture = Readonly<{
  id: string;
  section: ArisanPreviewFixtureSection;
  mode: ArisanPreviewFixtureMode;
  roomName: string;
  shareXlm: string;
  obligationXlm: string;
  joinContributionXlm: string;
  memberCount: number;
  memberTarget: number;
  fullyFundedCount: number;
  isHost: boolean;
  isOpen: boolean;
  deadlineOpen: boolean;
  readyToStart: boolean;
  inviteCode?: string;
  schedule?: Readonly<{ fundingDeadlineUtc: string; firstDrawUtc: string; intervalDays: number }>;
}>;

const common = {
  shareXlm: "1.2500000",
  obligationXlm: "5.0000000",
  memberTarget: 4,
  isHost: true,
  isOpen: true,
  deadlineOpen: true,
} as const;

export const ARISAN_PREVIEW_FIXTURES = [
  { id: "mode-upfront-legacy", section: "mode", mode: "upfront", roomName: "Family Circle · legacy", joinContributionXlm: "5.0000000", memberCount: 2, fullyFundedCount: 2, readyToStart: false, ...common },
  { id: "mode-installments", section: "mode", mode: "installments", roomName: "Family Circle · installments", joinContributionXlm: "0.0000000", memberCount: 2, fullyFundedCount: 1, readyToStart: false, ...common },
  { id: "mode-scheduled", section: "mode", mode: "scheduled", roomName: "Family Circle · scheduled", joinContributionXlm: "0.0000000", memberCount: 3, fullyFundedCount: 2, readyToStart: false, schedule: { fundingDeadlineUtc: "2026-12-01 19:00 UTC", firstDrawUtc: "2026-12-02 19:00 UTC", intervalDays: 14 }, ...common },
  { id: "join-review-upfront", section: "join-review", mode: "upfront", roomName: "Bayanihan Circle", inviteCode: "UPR234", joinContributionXlm: "5.0000000", memberCount: 2, fullyFundedCount: 2, readyToStart: false, ...common },
  { id: "join-review-installments", section: "join-review", mode: "installments", roomName: "Kapitbahay Circle", inviteCode: "NST234", joinContributionXlm: "0.0000000", memberCount: 2, fullyFundedCount: 1, readyToStart: false, ...common },
  { id: "join-review-scheduled", section: "join-review", mode: "scheduled", roomName: "Weekend Circle", inviteCode: "SCH234", joinContributionXlm: "0.0000000", memberCount: 3, fullyFundedCount: 2, readyToStart: false, schedule: { fundingDeadlineUtc: "2026-12-01 19:00 UTC", firstDrawUtc: "2026-12-02 19:00 UTC", intervalDays: 14 }, ...common },
  { id: "start-upfront-roster-open", section: "start-gate", mode: "upfront", roomName: "Family Circle · roster gate", joinContributionXlm: "5.0000000", memberCount: 3, fullyFundedCount: 3, readyToStart: false, ...common },
  { id: "start-installment-funding-open", section: "start-gate", mode: "installments", roomName: "Kapitbahay Circle · funding gate", joinContributionXlm: "0.0000000", memberCount: 4, fullyFundedCount: 3, readyToStart: false, ...common },
  { id: "start-scheduled-ready", section: "start-gate", mode: "scheduled", roomName: "Weekend Circle · ready", joinContributionXlm: "0.0000000", memberCount: 4, fullyFundedCount: 4, readyToStart: true, schedule: { fundingDeadlineUtc: "2026-12-01 19:00 UTC", firstDrawUtc: "2026-12-02 19:00 UTC", intervalDays: 14 }, ...common },
] as const satisfies readonly ArisanPreviewFixture[];

// Mirrors the visible Start gate: open room, verified host, complete roster,
// every member fully funded, and funding still open. This page never starts it.
export function arisanPreviewStartEligible(fixture: ArisanPreviewFixture): boolean {
  return fixture.isOpen && fixture.isHost && fixture.readyToStart
    && fixture.memberCount === fixture.memberTarget
    && fixture.fullyFundedCount === fixture.memberTarget
    && fixture.deadlineOpen;
}
