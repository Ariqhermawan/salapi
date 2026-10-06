import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSumsubDemoState, transitionSumsubDemo, canPrepareSumsubDemo, canChooseSumsubDemoResult, SUMSUB_CHECKLIST, SUMSUB_DEMO_POLICY, type SumsubDemoState, type SumsubDemoEvent } from "../lib/verification/sumsub-demo.ts";
import { accountCopy } from "../lib/i18n/revamp-account.ts";

function prepare(kind: "individual" | "ngo" = "individual") {
  let state = createSumsubDemoState(kind);
  for (const id of SUMSUB_CHECKLIST[kind]) state = transitionSumsubDemo(state, { type: "toggle-check", id }, true);
  return transitionSumsubDemo(state, { type: "prepare" }, true);
}

test("default state cannot grant genuine provider verification", () => {
  assert.deepEqual(createSumsubDemoState(), { kind: "individual", phase: "checklist", acknowledged: [], attempts: 0 });
  assert.equal(SUMSUB_DEMO_POLICY.connection, "not-connected");
  for (const key of ["documentsCollected", "cameraOpened", "requestSubmitted", "identityVerified", "changesCreatorEntitlement"] as const) assert.equal(SUMSUB_DEMO_POLICY[key], false);
  assert.ok(Object.isFrozen(SUMSUB_DEMO_POLICY));
});

test("prepare and result cannot skip the checklist", () => {
  const initial = createSumsubDemoState();
  for (const event of [{ type: "prepare" }, { type: "explore" }, { type: "choose-result", result: "approved" }] as SumsubDemoEvent[]) assert.strictEqual(transitionSumsubDemo(initial, event, true), initial);
  const partial = transitionSumsubDemo(initial, { type: "toggle-check", id: "identity" }, true);
  assert.equal(canPrepareSumsubDemo(partial), false);
  assert.strictEqual(transitionSumsubDemo(partial, { type: "prepare" }, true), partial);
});

test("NGO preparation requires both extra example checks without personal fields", () => {
  let state = createSumsubDemoState("ngo");
  for (const id of SUMSUB_CHECKLIST.individual) state = transitionSumsubDemo(state, { type: "toggle-check", id }, true);
  assert.equal(canPrepareSumsubDemo(state), false);
  assert.equal(prepare("ngo").phase, "prepared");
  assert.deepEqual(Object.keys(state).sort(), ["acknowledged", "attempts", "kind", "phase"]);
});

test("prepared demo can explore all four simulated states", () => {
  let state = transitionSumsubDemo(prepare(), { type: "explore" }, true);
  assert.equal(state.phase, "pending");
  assert.equal(state.attempts, 1);
  assert.equal(canChooseSumsubDemoResult(state), true);
  for (const result of ["approved", "retry", "rejected", "pending"] as const) {
    state = transitionSumsubDemo(state, { type: "choose-result", result }, true);
    assert.equal(state.phase, result);
    assert.equal(SUMSUB_DEMO_POLICY.identityVerified, false);
    assert.equal(SUMSUB_DEMO_POLICY.changesCreatorEntitlement, false);
  }
});

test("retry clears acknowledgements while reset and kind switch clear progress", () => {
  let state = transitionSumsubDemo(prepare("ngo"), { type: "explore" }, true);
  state = transitionSumsubDemo(state, { type: "choose-result", result: "retry" }, true);
  state = transitionSumsubDemo(state, { type: "retry" }, true);
  assert.equal(state.kind, "ngo");
  assert.equal(state.phase, "checklist");
  assert.deepEqual(state.acknowledged, []);
  assert.equal(state.attempts, 1);
  assert.deepEqual(transitionSumsubDemo(state, { type: "reset" }, true), createSumsubDemoState("ngo"));
  assert.deepEqual(transitionSumsubDemo(state, { type: "select-kind", kind: "individual" }, true), createSumsubDemoState("individual"));
});

test("non-local preview refuses every simulation event", () => {
  const state = prepare();
  for (const event of [{ type: "toggle-check", id: "identity" }, { type: "prepare" }, { type: "explore" }, { type: "choose-result", result: "approved" }, { type: "select-kind", kind: "ngo" }, { type: "retry" }, { type: "reset" }] as SumsubDemoEvent[]) assert.strictEqual(transitionSumsubDemo(state, event, false), state);
});

test("unknown checks and SDK-return events cannot advance the demo", () => {
  const checklist = createSumsubDemoState();
  assert.strictEqual(transitionSumsubDemo(checklist, { type: "toggle-check", id: "upload-document" }, true), checklist);
  const pending = transitionSumsubDemo(prepare(), { type: "explore" }, true);
  for (const event of [{ type: "sdk-return", reviewAnswer: "GREEN" }, { type: "applicantReviewed", reviewAnswer: "GREEN" }, { type: "choose-result", result: "genuine-approved" }] as unknown as SumsubDemoEvent[]) assert.strictEqual(transitionSumsubDemo(pending, event, true), pending);
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
  assert.match(screen, /currentTier: KycTier = 0/);
});
