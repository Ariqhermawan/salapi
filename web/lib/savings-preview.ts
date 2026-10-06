import { isLocalPreview, PREVIEW_WALLET } from "./local-preview";
import { moneyInputToStroops, pesosToStroopsExact, type MoneyInput } from "./money";

export type SavingsPreviewGoal = { id: string; name: string; mode: "flexible" | "disciplined"; target: string; saved: string };
export type SavingsPreviewState = { version: 1; wallet: string; revision: number; goals: SavingsPreviewGoal[]; confirmed: string[] };
export type SavingsPreviewReview = { id: string; revision: number; kind: "create" | "deposit" | "withdraw"; goalId: string; amount: string; name?: string; mode?: "flexible" | "disciplined" };
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export const SAVINGS_PREVIEW_KEY = `salapi:preview:savings:v1:${PREVIEW_WALLET.address}`;
const MAX = pesosToStroopsExact("1000000000")!;
const ID = /^[a-f0-9-]{36}$/;
const units = (value: unknown): value is string => typeof value === "string" && /^(0|[1-9]\d{0,16})$/.test(value) && BigInt(value) <= MAX;
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const empty = (): SavingsPreviewState => ({ version: 1, wallet: PREVIEW_WALLET.address, revision: 0, goals: [], confirmed: [] });

function validState(value: unknown): value is SavingsPreviewState {
  if (!object(value) || value.version !== 1 || value.wallet !== PREVIEW_WALLET.address || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0) return false;
  if (!Array.isArray(value.goals) || value.goals.length > 12 || !Array.isArray(value.confirmed) || value.confirmed.length > 100) return false;
  if (!value.confirmed.every(id => typeof id === "string" && ID.test(id)) || new Set(value.confirmed).size !== value.confirmed.length) return false;
  if (!value.goals.every(goal => object(goal) && typeof goal.id === "string" && ID.test(goal.id) && typeof goal.name === "string" && goal.name.trim().length > 0 && goal.name.length <= 40 && ["flexible", "disciplined"].includes(String(goal.mode)) && units(goal.target) && BigInt(goal.target) > 0n && units(goal.saved))) return false;
  return new Set(value.goals.map(goal => goal.id)).size === value.goals.length;
}

export function readSavingsPreview(): Result<SavingsPreviewState> {
  if (!isLocalPreview || typeof window === "undefined") return { ok: false, error: "Savings demo is available only in the local browser preview." };
  try {
    const raw = sessionStorage.getItem(SAVINGS_PREVIEW_KEY);
    if (raw === null) return { ok: true, value: empty() };
    if (raw.length > 18000) throw new Error("Invalid preview state");
    const value: unknown = JSON.parse(raw);
    if (!validState(value)) throw new Error("Invalid preview state");
    return { ok: true, value };
  } catch { return { ok: false, error: "Browser session savings could not be read. Existing data was not reset or overwritten." }; }
}

// Currency precision is validated before the shared exact money conversion.
// Stored amounts are integer native units, never a floating-point balance.
export function savingsPreviewAmount(input: MoneyInput): bigint | null {
  const dp = input.currency === "en" || input.currency === "tl" ? 2 : 0;
  if (typeof input.amount !== "string" || input.amount.length > 64 || !(dp === 2 ? /^\d+(?:\.\d{1,2})?$/ : /^\d+$/).test(input.amount)) return null;
  const amount = moneyInputToStroops(input);
  return amount !== null && amount > 0n && amount <= MAX ? amount : null;
}

export function reviewSavingsPreview(state: SavingsPreviewState, input: { kind: SavingsPreviewReview["kind"]; goalId?: string; name?: string; mode?: SavingsPreviewGoal["mode"]; money?: MoneyInput }): Result<SavingsPreviewReview> {
  if (!isLocalPreview || typeof window === "undefined" || !validState(state)) return { ok: false, error: "The local savings state is unavailable." };
  const goal = state.goals.find(goal => goal.id === input.goalId);
  let amount = input.money ? savingsPreviewAmount(input.money) : null;
  if (input.kind === "create") {
    if (!input.name?.trim() || input.name.trim().length > 40 || !["flexible", "disciplined"].includes(input.mode ?? "") || state.goals.length >= 12) return { ok: false, error: "Name your goal, choose its rules, and keep at most 12 local goals." };
  } else if (!goal) return { ok: false, error: "Choose an existing local goal." };
  if (input.kind === "withdraw" && goal?.mode === "disciplined") {
    if (BigInt(goal.saved) < BigInt(goal.target) || BigInt(goal.saved) === 0n) return { ok: false, error: "Disciplined goals can release the full saved demo only after the target is reached." };
    amount = BigInt(goal.saved);
  }
  if (amount === null) return { ok: false, error: "Enter a positive amount within the limit, with cents for USD/PHP or whole units for IDR/VND." };
  if (input.kind === "deposit" && goal && BigInt(goal.saved) + amount > MAX) return { ok: false, error: "This deposit exceeds the local savings limit." };
  if (input.kind === "withdraw" && goal && amount > BigInt(goal.saved)) return { ok: false, error: "A withdrawal cannot exceed this goal's saved demo amount." };
  try {
    const id = crypto.randomUUID();
    return { ok: true, value: { id, revision: state.revision, kind: input.kind, goalId: input.kind === "create" ? id : goal!.id, amount: amount.toString(), ...(input.kind === "create" ? { name: input.name!.trim(), mode: input.mode } : {}) } };
  } catch { return { ok: false, error: "A local review could not be prepared. No savings state changed." }; }
}

export function confirmSavingsPreview(review: SavingsPreviewReview): Result<{ state: SavingsPreviewState; duplicate: boolean }> {
  const loaded = readSavingsPreview(); if (!loaded.ok) return loaded;
  const state = loaded.value;
  if (!object(review) || !ID.test(review.id) || !ID.test(review.goalId) || !units(review.amount) || BigInt(review.amount) === 0n || !["create", "deposit", "withdraw"].includes(review.kind)) return { ok: false, error: "This local review is invalid. Nothing was saved." };
  if (state.confirmed.includes(review.id)) return { ok: true, value: { state, duplicate: true } };
  if (review.revision !== state.revision) return { ok: false, error: "Local savings changed after review. Reload and review the current terms again." };
  const amount = BigInt(review.amount);
  const goal = state.goals.find(goal => goal.id === review.goalId);
  let goals: SavingsPreviewGoal[];
  if (review.kind === "create") {
    if (goal || state.goals.length >= 12 || !review.name?.trim() || review.name.length > 40 || !["flexible", "disciplined"].includes(review.mode ?? "")) return { ok: false, error: "The new goal terms are invalid." };
    goals = [...state.goals, { id: review.goalId, name: review.name.trim(), mode: review.mode!, target: review.amount, saved: "0" }];
  } else {
    if (!goal) return { ok: false, error: "The reviewed goal no longer exists." };
    const saved = BigInt(goal.saved);
    if (review.kind === "withdraw" && (amount > saved || goal.mode === "disciplined" && (saved < BigInt(goal.target) || amount !== saved))) return { ok: false, error: "This withdrawal does not meet the reviewed goal's rules." };
    const next = review.kind === "deposit" ? saved + amount : saved - amount;
    if (next > MAX || next < 0n) return { ok: false, error: "The reviewed amount exceeds the local goal limit." };
    goals = state.goals.map(current => current.id === goal.id ? { ...current, saved: next.toString() } : current);
  }
  const next: SavingsPreviewState = { ...state, revision: state.revision + 1, goals, confirmed: [...state.confirmed, review.id].slice(-100) };
  if (!validState(next)) return { ok: false, error: "The local result could not be validated. Nothing was saved." };
  let previous: string | null = null; let captured = false;
  try {
    previous = sessionStorage.getItem(SAVINGS_PREVIEW_KEY); captured = true;
    const raw = JSON.stringify(next); sessionStorage.setItem(SAVINGS_PREVIEW_KEY, raw);
    if (sessionStorage.getItem(SAVINGS_PREVIEW_KEY) !== raw) throw new Error("Save not confirmed");
    return { ok: true, value: { state: next, duplicate: false } };
  } catch {
    if (captured) try { if (previous === null) sessionStorage.removeItem(SAVINGS_PREVIEW_KEY); else sessionStorage.setItem(SAVINGS_PREVIEW_KEY, previous); } catch { /* Remain error-only if storage also denies restoring prior data. */ }
    return { ok: false, error: "Browser storage could not confirm the local save. No success is recorded here. Reload to inspect the session before retrying." };
  }
}
