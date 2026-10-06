export type DemoApplicantKind = "individual" | "ngo";
export type SumsubDemoPhase = "checklist" | "prepared" | "pending" | "approved" | "retry" | "rejected";
export type SumsubDemoResult = "pending" | "approved" | "retry" | "rejected";

// A live approval would require server-authenticated applicantReviewed,
// validated signed payload and applicant/account binding, outside this demo.
export const SUMSUB_DEMO_POLICY = Object.freeze({
  provider: "Sumsub", connection: "not-connected", mode: "simulation",
  documentsCollected: false, cameraOpened: false, requestSubmitted: false,
  identityVerified: false, changesCreatorEntitlement: false,
} as const);

export const SUMSUB_CHECKLIST = {
  individual: ["identity", "selfie"],
  ngo: ["identity", "selfie", "registration", "representative"],
} as const;

export type SumsubDemoState = {
  kind: DemoApplicantKind;
  phase: SumsubDemoPhase;
  acknowledged: string[];
  attempts: number;
};

export type SumsubDemoEvent =
  | { type: "select-kind"; kind: DemoApplicantKind }
  | { type: "toggle-check"; id: string }
  | { type: "prepare" }
  | { type: "explore" }
  | { type: "choose-result"; result: SumsubDemoResult }
  | { type: "retry" }
  | { type: "reset" };

export function createSumsubDemoState(kind: DemoApplicantKind = "individual"): SumsubDemoState {
  return { kind, phase: "checklist", acknowledged: [], attempts: 0 };
}

export function canPrepareSumsubDemo(state: SumsubDemoState): boolean {
  return state.phase === "checklist" && SUMSUB_CHECKLIST[state.kind].every((id) => state.acknowledged.includes(id));
}

export function canChooseSumsubDemoResult(state: SumsubDemoState): boolean {
  return ["pending", "approved", "retry", "rejected"].includes(state.phase);
}

/** Pure memory-only UI transitions. The caller must opt in to local preview. */
export function transitionSumsubDemo(state: SumsubDemoState, event: SumsubDemoEvent, localPreview: boolean): SumsubDemoState {
  if (!localPreview) return state;
  switch (event.type) {
    case "select-kind":
      return event.kind === "individual" || event.kind === "ngo" ? createSumsubDemoState(event.kind) : state;
    case "toggle-check": {
      const ids: readonly string[] = SUMSUB_CHECKLIST[state.kind];
      if (state.phase !== "checklist" || !ids.includes(event.id)) return state;
      return { ...state, acknowledged: state.acknowledged.includes(event.id) ? state.acknowledged.filter((id) => id !== event.id) : [...state.acknowledged, event.id] };
    }
    case "prepare":
      return canPrepareSumsubDemo(state) ? { ...state, phase: "prepared" } : state;
    case "explore":
      return state.phase === "prepared" ? { ...state, phase: "pending", attempts: state.attempts + 1 } : state;
    case "choose-result":
      return canChooseSumsubDemoResult(state) && ["pending", "approved", "retry", "rejected"].includes(event.result) ? { ...state, phase: event.result } : state;
    case "retry":
      return state.phase === "retry" ? { ...createSumsubDemoState(state.kind), attempts: state.attempts } : state;
    case "reset":
      return createSumsubDemoState(state.kind);
    default:
      return state;
  }
}
