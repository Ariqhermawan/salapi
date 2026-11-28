export type DemoApplicantKind = "individual" | "ngo";
export type SumsubDemoPhase = "checklist" | "document" | "selfie" | "handoff" | "review" | "pending" | "approved" | "retry" | "rejected";
export type SumsubDemoResult = "pending" | "approved" | "retry" | "rejected";
export type SumsubDocumentType = "national-id" | "passport" | "license" | "registration" | "tax-paper" | "permit";

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
export const SUMSUB_SAMPLE_DOCUMENTS = {
  individual: ["national-id", "passport", "license"],
  ngo: ["registration", "tax-paper", "permit"],
} as const satisfies Record<DemoApplicantKind, readonly SumsubDocumentType[]>;

export type SumsubDemoState = {
  kind: DemoApplicantKind;
  phase: SumsubDemoPhase;
  acknowledged: string[];
  documentType: SumsubDocumentType;
  documentSampleReady: boolean;
  selfieSampleReady: boolean;
  attempts: number;
};

export type SumsubDemoEvent =
  | { type: "select-kind"; kind: DemoApplicantKind }
  | { type: "select-document"; documentType: SumsubDocumentType }
  | { type: "toggle-check"; id: string }
  | { type: "prepare" }
  | { type: "complete-document-sample" }
  | { type: "reset-document-sample" }
  | { type: "continue-document" }
  | { type: "complete-selfie-sample" }
  | { type: "reset-selfie-sample" }
  | { type: "explore" }
  | { type: "submit" }
  | { type: "back" }
  | { type: "choose-result"; result: SumsubDemoResult }
  | { type: "retry" }
  | { type: "reset" };

export function createSumsubDemoState(kind: DemoApplicantKind = "individual"): SumsubDemoState {
  return { kind, phase: "checklist", acknowledged: [], documentType: SUMSUB_SAMPLE_DOCUMENTS[kind][0], documentSampleReady: false, selfieSampleReady: false, attempts: 0 };
}

export function canPrepareSumsubDemo(state: SumsubDemoState): boolean {
  return state.phase === "checklist" && SUMSUB_CHECKLIST[state.kind].every((id) => state.acknowledged.includes(id));
}

export function canChooseSumsubDemoResult(state: SumsubDemoState): boolean {
  return ["review", "pending", "approved", "retry", "rejected"].includes(state.phase);
}

export function canExploreSumsubDemo(state: SumsubDemoState): boolean {
  return state.phase === "selfie" && state.selfieSampleReady;
}

/** Pure memory-only UI transitions. The caller must opt in to local preview. */
export function transitionSumsubDemo(state: SumsubDemoState, event: SumsubDemoEvent, localPreview: boolean): SumsubDemoState {
  if (!localPreview) return state;
  switch (event.type) {
    case "select-kind":
      return event.kind === "individual" || event.kind === "ngo" ? createSumsubDemoState(event.kind) : state;
    case "select-document":
      return state.phase === "document" && (SUMSUB_SAMPLE_DOCUMENTS[state.kind] as readonly SumsubDocumentType[]).includes(event.documentType)
        ? { ...state, documentType: event.documentType, documentSampleReady: false } : state;
    case "toggle-check": {
      const ids: readonly string[] = SUMSUB_CHECKLIST[state.kind];
      if (state.phase !== "checklist" || !ids.includes(event.id)) return state;
      return { ...state, acknowledged: state.acknowledged.includes(event.id) ? state.acknowledged.filter((id) => id !== event.id) : [...state.acknowledged, event.id] };
    }
    case "prepare":
      return canPrepareSumsubDemo(state) ? { ...state, phase: "document", documentSampleReady: false, selfieSampleReady: false } : state;
    case "complete-document-sample":
      return state.phase === "document" ? { ...state, documentSampleReady: true } : state;
    case "reset-document-sample":
      return state.phase === "document" ? { ...state, documentSampleReady: false } : state;
    case "continue-document":
      return state.phase === "document" && state.documentSampleReady ? { ...state, phase: "selfie", selfieSampleReady: false } : state;
    case "complete-selfie-sample":
      return state.phase === "selfie" ? { ...state, selfieSampleReady: true } : state;
    case "reset-selfie-sample":
      return state.phase === "selfie" ? { ...state, selfieSampleReady: false } : state;
    case "explore":
      return canExploreSumsubDemo(state) ? { ...state, phase: "handoff" } : state;
    case "submit":
      return state.phase === "handoff" ? { ...state, phase: "review", attempts: state.attempts + 1 } : state;
    case "back":
      if (state.phase === "document") return { ...state, phase: "checklist", documentSampleReady: false, selfieSampleReady: false };
      if (state.phase === "selfie") return { ...state, phase: "document" };
      if (state.phase === "handoff") return { ...state, phase: "selfie" };
      if (state.phase === "review") return { ...state, phase: "handoff" };
      if (state.phase === "pending") return { ...state, phase: "review" };
      return state;
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
