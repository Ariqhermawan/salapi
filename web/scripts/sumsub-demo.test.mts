import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSumsubDemoState, transitionSumsubDemo, canPrepareSumsubDemo, canExploreSumsubDemo, canChooseSumsubDemoResult, SUMSUB_CHECKLIST, SUMSUB_DEMO_POLICY, SUMSUB_SAMPLE_DOCUMENTS, type SumsubDemoState, type SumsubDemoEvent } from "../lib/verification/sumsub-demo.ts";
import { accountCopy } from "../lib/i18n/revamp-account.ts";

function prepare(kind: "individual" | "ngo" = "individual") {
  let state = createSumsubDemoState(kind);
  for (const id of SUMSUB_CHECKLIST[kind]) state = transitionSumsubDemo(state, { type: "toggle-check", id }, true);
  return transitionSumsubDemo(state, { type: "prepare" }, true);
}

function handoff(kind: "individual" | "ngo" = "individual") {
  let state = prepare(kind);
  state = transitionSumsubDemo(state, { type: "complete-document-sample" }, true);
  state = transitionSumsubDemo(state, { type: "continue-document" }, true);
  state = transitionSumsubDemo(state, { type: "complete-selfie-sample" }, true);
  return transitionSumsubDemo(state, { type: "explore" }, true);
}

test("default state cannot grant genuine provider verification", () => {
  assert.deepEqual(createSumsubDemoState(), { kind: "individual", phase: "checklist", acknowledged: [], documentType: "national-id", documentSampleReady: false, selfieSampleReady: false, attempts: 0 });
  assert.equal(SUMSUB_DEMO_POLICY.connection, "not-connected");
  for (const key of ["documentsCollected", "cameraOpened", "requestSubmitted", "identityVerified", "changesCreatorEntitlement"] as const) assert.equal(SUMSUB_DEMO_POLICY[key], false);
  assert.ok(Object.isFrozen(SUMSUB_DEMO_POLICY));
});

test("the sample document and selfie gates cannot be skipped", () => {
  const initial = createSumsubDemoState();
  for (const event of [
    { type: "prepare" }, { type: "select-document", documentType: "passport" },
    { type: "complete-document-sample" }, { type: "continue-document" },
    { type: "complete-selfie-sample" }, { type: "explore" }, { type: "submit" },
    { type: "choose-result", result: "approved" },
  ] as SumsubDemoEvent[]) assert.strictEqual(transitionSumsubDemo(initial, event, true), initial);
  const partial = transitionSumsubDemo(initial, { type: "toggle-check", id: "identity" }, true);
  assert.equal(canPrepareSumsubDemo(partial), false);
  assert.strictEqual(transitionSumsubDemo(partial, { type: "prepare" }, true), partial);
  const document = prepare();
  assert.equal(document.phase, "document");
  assert.equal(canExploreSumsubDemo(document), false);
  assert.strictEqual(transitionSumsubDemo(document, { type: "continue-document" }, true), document);
  assert.strictEqual(transitionSumsubDemo(document, { type: "explore" }, true), document);
});

test("individual and NGO samples offer only their matching document types", () => {
  let ngo = createSumsubDemoState("ngo");
  for (const id of SUMSUB_CHECKLIST.individual) ngo = transitionSumsubDemo(ngo, { type: "toggle-check", id }, true);
  assert.equal(canPrepareSumsubDemo(ngo), false);
  assert.equal(prepare("ngo").phase, "document");
  assert.deepEqual(SUMSUB_SAMPLE_DOCUMENTS.individual, ["national-id", "passport", "license"]);
  assert.deepEqual(SUMSUB_SAMPLE_DOCUMENTS.ngo, ["registration", "tax-paper", "permit"]);
  const document = prepare("ngo");
  assert.equal(document.documentType, "registration");
  assert.strictEqual(transitionSumsubDemo(document, { type: "select-document", documentType: "passport" }, true), document);
  assert.equal(transitionSumsubDemo(document, { type: "select-document", documentType: "tax-paper" }, true).documentType, "tax-paper");
});

test("full sample flow reaches a review handoff and four non-binding result examples", () => {
  let state = prepare();
  state = transitionSumsubDemo(state, { type: "select-document", documentType: "passport" }, true);
  assert.equal(state.documentSampleReady, false);
  state = transitionSumsubDemo(state, { type: "complete-document-sample" }, true);
  assert.equal(state.documentSampleReady, true);
  state = transitionSumsubDemo(state, { type: "continue-document" }, true);
  assert.equal(state.phase, "selfie");
  assert.equal(canExploreSumsubDemo(state), false);
  state = transitionSumsubDemo(state, { type: "complete-selfie-sample" }, true);
  assert.equal(canExploreSumsubDemo(state), true);
  state = transitionSumsubDemo(state, { type: "explore" }, true);
  assert.equal(state.phase, "handoff");
  assert.equal(canChooseSumsubDemoResult(state), false);
  assert.strictEqual(transitionSumsubDemo(state, { type: "choose-result", result: "approved" }, true), state);
  state = transitionSumsubDemo(state, { type: "submit" }, true);
  assert.equal(state.phase, "review");
  assert.equal(state.attempts, 1);
  assert.equal(canChooseSumsubDemoResult(state), true);
  for (const result of ["approved", "retry", "rejected", "pending"] as const) {
    state = transitionSumsubDemo(state, { type: "choose-result", result }, true);
    assert.equal(state.phase, result);
    assert.equal(SUMSUB_DEMO_POLICY.identityVerified, false);
    assert.equal(SUMSUB_DEMO_POLICY.changesCreatorEntitlement, false);
  }
});

test("back navigation preserves usable sample state and clears it when leaving preparation", () => {
  let state = transitionSumsubDemo(prepare(), { type: "complete-document-sample" }, true);
  state = transitionSumsubDemo(state, { type: "continue-document" }, true);
  state = transitionSumsubDemo(state, { type: "back" }, true);
  assert.equal(state.phase, "document");
  assert.equal(state.documentSampleReady, true);
  state = transitionSumsubDemo(state, { type: "back" }, true);
  assert.equal(state.phase, "checklist");
  assert.deepEqual(state.acknowledged, [...SUMSUB_CHECKLIST.individual]);
  assert.equal(state.documentSampleReady, false);

  state = transitionSumsubDemo(state, { type: "prepare" }, true);
  state = transitionSumsubDemo(state, { type: "complete-document-sample" }, true);
  state = transitionSumsubDemo(state, { type: "continue-document" }, true);
  state = transitionSumsubDemo(state, { type: "complete-selfie-sample" }, true);
  state = transitionSumsubDemo(state, { type: "explore" }, true);
  state = transitionSumsubDemo(state, { type: "submit" }, true);
  state = transitionSumsubDemo(state, { type: "choose-result", result: "pending" }, true);
  state = transitionSumsubDemo(state, { type: "back" }, true);
  assert.equal(state.phase, "review");
});

test("retry clears examples while reset and kind switch clear progress", () => {
  let state = transitionSumsubDemo(handoff("ngo"), { type: "submit" }, true);
  state = transitionSumsubDemo(state, { type: "choose-result", result: "retry" }, true);
  state = transitionSumsubDemo(state, { type: "retry" }, true);
  assert.equal(state.kind, "ngo");
  assert.equal(state.phase, "checklist");
  assert.deepEqual(state.acknowledged, []);
  assert.equal(state.documentType, "registration");
  assert.equal(state.documentSampleReady, false);
  assert.equal(state.selfieSampleReady, false);
  assert.equal(state.attempts, 1);
  assert.deepEqual(transitionSumsubDemo(state, { type: "reset" }, true), createSumsubDemoState("ngo"));
  assert.deepEqual(transitionSumsubDemo(state, { type: "select-kind", kind: "individual" }, true), createSumsubDemoState("individual"));
});

test("non-local preview refuses every simulation event", () => {
  const state = handoff();
  for (const event of [
    { type: "toggle-check", id: "identity" }, { type: "prepare" }, { type: "select-document", documentType: "license" },
    { type: "complete-document-sample" }, { type: "reset-document-sample" }, { type: "continue-document" },
    { type: "complete-selfie-sample" }, { type: "reset-selfie-sample" }, { type: "explore" }, { type: "submit" },
    { type: "back" }, { type: "choose-result", result: "approved" }, { type: "select-kind", kind: "ngo" },
    { type: "retry" }, { type: "reset" },
  ] as SumsubDemoEvent[]) assert.strictEqual(transitionSumsubDemo(state, event, false), state);
});

test("unknown checks, documents and SDK-return events cannot advance the demo", () => {
  const checklist = createSumsubDemoState();
  assert.strictEqual(transitionSumsubDemo(checklist, { type: "toggle-check", id: "upload-document" }, true), checklist);
  const document = prepare();
  assert.strictEqual(transitionSumsubDemo(document, { type: "select-document", documentType: "registration" }, true), document);
  const review = transitionSumsubDemo(handoff(), { type: "submit" }, true);
  for (const event of [{ type: "sdk-return", reviewAnswer: "GREEN" }, { type: "applicantReviewed", reviewAnswer: "GREEN" }, { type: "choose-result", result: "genuine-approved" }] as unknown as SumsubDemoEvent[]) assert.strictEqual(transitionSumsubDemo(review, event, true), review);
});

test("transitions are pure and do not mutate previous state", () => {
  const initial: SumsubDemoState = { ...createSumsubDemoState(), acknowledged: [] };
  Object.freeze(initial.acknowledged);
  Object.freeze(initial);
  const next = transitionSumsubDemo(initial, { type: "toggle-check", id: "identity" }, true);
  assert.deepEqual(initial.acknowledged, []);
  assert.deepEqual(next.acknowledged, ["identity"]);
});

test("helper and screen have no SDK or data collection boundary", () => {
  const helper = readFileSync(new URL("../lib/verification/sumsub-demo.ts", import.meta.url), "utf8");
  const screen = readFileSync(new URL("../components/screens/KycTierScreen.tsx", import.meta.url), "utf8");
  for (const source of [helper, screen]) assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|WebSocket|sessionStorage|localStorage|getUserMedia)\b|type=["'](file|email)["']|sumsub-websdk|snsWebSdk/);
  assert.match(screen, /c\.notConnected/);
  assert.match(screen, /c\.noEntitlement/);
  assert.equal(accountCopy("en").notConnected, "NOT CONNECTED");
  assert.match(accountCopy("en").noEntitlement, /No identity was verified/);
  assert.equal(accountCopy("id").sampleSelfieTitle, "Pemeriksaan selfie · hanya contoh");
  assert.equal(accountCopy("tl").nationalIdSample, "Pambansang ID");
  assert.match(screen, /currentTier: KycTier = 0/);
});
