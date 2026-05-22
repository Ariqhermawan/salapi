// Smart Savings goal envelopes + the rule-based allocator.
//
// The money lives in ONE on-chain Smart Savings vault (the Soroban contract
// holds one goal per account). "Goals" here are an app-layer way to divide
// that vault by intent, and the allocator splits each deposit across them by
// a transparent percentage rule — SOW §17's "labelled rule-based engine".
// Per-goal on-chain vaults are a Build-Award item; this layer is honest
// app-side bookkeeping, persisted in localStorage. All amounts are PHP
// app-units, matching the server actions.

export type SavingsGoal = {
  id: string;
  name: string;
  target: number; // PHP app-units
  weight: number; // relative allocator weight; share = weight / Σ weight
  saved: number; // PHP app-units routed here so far (app-layer tally)
};

const KEY = "salapi_savings_goals";

export function loadGoals(): SavingsGoal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (g): g is SavingsGoal =>
        !!g &&
        typeof g === "object" &&
        typeof (g as SavingsGoal).id === "string" &&
        typeof (g as SavingsGoal).name === "string" &&
        typeof (g as SavingsGoal).target === "number" &&
        typeof (g as SavingsGoal).weight === "number" &&
        typeof (g as SavingsGoal).saved === "number"
    );
  } catch {
    return [];
  }
}

export function saveGoals(goals: SavingsGoal[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(goals));
  } catch {
    /* storage may be unavailable */
  }
}

export function clearGoals(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage may be unavailable */
  }
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function totalWeight(goals: SavingsGoal[]): number {
  const sum = goals.reduce((a, g) => a + Math.max(0, g.weight), 0);
  return sum > 0 ? sum : 1;
}

// Allocator share for one goal, 0..1.
export function share(goal: SavingsGoal, goals: SavingsGoal[]): number {
  return Math.max(0, goal.weight) / totalWeight(goals);
}

// Split `amount` across goals by weight. Non-last goals get a FLOORED share
// (never more than their fair cut) and the last goal absorbs the remainder —
// so the parts always sum back to exactly `amount` and no part can go
// negative, even for a tiny deposit spread over many goals.
export function allocate(
  amount: number,
  goals: SavingsGoal[]
): { id: string; amount: number }[] {
  if (goals.length === 0) return [];
  const tw = totalWeight(goals);
  let used = 0;
  return goals.map((g, i) => {
    if (i === goals.length - 1) return { id: g.id, amount: amount - used };
    const part = Math.floor((amount * Math.max(0, g.weight)) / tw);
    used += part;
    return { id: g.id, amount: part };
  });
}

// The on-chain vault is the source of truth for the total saved. localStorage
// can be cleared or drift across devices, so re-anchor the per-goal tallies to
// the real on-chain figure, keeping their relative proportions.
export function reconcile(
  goals: SavingsGoal[],
  onChainSaved: number
): SavingsGoal[] {
  if (goals.length === 0) return goals;
  const sum = goals.reduce((a, g) => a + g.saved, 0);
  if (Math.abs(sum - onChainSaved) < 1) return goals;
  if (sum <= 0) {
    return goals.map((g) => ({ ...g, saved: onChainSaved * share(g, goals) }));
  }
  const k = onChainSaved / sum;
  return goals.map((g) => ({ ...g, saved: g.saved * k }));
}
